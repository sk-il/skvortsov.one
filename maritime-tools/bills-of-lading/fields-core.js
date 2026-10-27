/* Alpha Shipping content-stream fields. No evaluation, redaction paint or rasterization. */
(function(root){
const labels=new Map(Object.entries({'Shipper':'Отправитель','Consignee (If "To Order" so Indicate)':'Получатель','Notify Party ( no claim shall attach for failure to notify)':'Уведомить','Notify Party 2 :':'Уведомить дополнительно','Booking Number :':'Номер бронирования','B/L Number :':'Номер B/L','For Delivery Please Contact :':'Контакты и перевозчики','Pre-carriage by':'Предварительная перевозка','Place of Receipt':'Место получения','FEEDER Vessel / Voyage':'Судно / рейс','Port of Loading':'Порт погрузки','Port of Discharge':'Порт выгрузки','Place of Delivery':'Место доставки','Place and date of issue':'Дата и место выпуска','Payable at':'Место оплаты','No.of original B/L(s)':'Количество оригиналов','Exchange Rate':'Курс','Description':'Описание платежа','Rating':'Ставка','Prepaid':'Предоплата','Collect':'Оплата при получении','Marks & Numbers':'Маркировка','No of Pkgs':'Количество мест','Description of Goods & Packages':'Описание груза','Total Gr. Wt. (KGS)':'Масса брутто','Vol':'Объём','(CBM)':'Объём','Voyage -':'Номер рейса','Vessel -':'Судно','Vessel':'Судно'}));
const norm=s=>s.replace(/\s+/g,' ').trim();
function tokens(s){const out=[];let i=0;while(i<s.length){if(/\s|\x00/.test(s[i])){i++;continue}if(s[i]==='%'){while(i<s.length&&!/[\r\n]/.test(s[i]))i++;continue}const start=i;let type='word';if(s[i]==='('){type='string';let depth=1;i++;while(i<s.length&&depth){if(s[i]==='\\'){i+=2;continue}if(s[i]==='(')depth++;if(s[i]===')')depth--;i++}if(depth)throw Error('Незавершённая строка PDF')}else if(s[i]==='<'&&s[i+1]!=='<'){type='string';i=s.indexOf('>',i)+1;if(!i)throw Error('Незавершённая строка PDF')}else if(s[i]==='/'){type='name';i++;while(i<s.length&&!/[\s()[\]<>/%]/.test(s[i]))i++}else if(/[\[\]<>]/.test(s[i])){type='delimiter';i++;if(s[i]===s[start]&&/[<>]/.test(s[start]))i++}else {while(i<s.length&&!/[\s()[\]<>/%]/.test(s[i]))i++;if(i===start)i++;if(/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s.slice(start,i)))type='number'}out.push({v:s.slice(start,i),start,end:i,type})}return out}
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const intersect=(a,b)=>!a?b:[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];
function scan(s,height,stream){
 const ts=tokens(s),shows=[],clips=[],images=[];let state={ctm:[1,0,0,1,0,0],clip:null,font:'',size:8,rise:0,renderMode:0,horizontal:100},stack=[],args=[],rect=null,bt=false,lx=0,ly=0,leading=0,tm=[1,0,0,1,0,0],arrayDepth=0,unsafe=false;
 for(const t of ts){if(t.v==='[')arrayDepth++;if(t.v===']')arrayDepth--;if(t.type!=='word'||arrayDepth){args.push(t);continue}const v=t.v,n=args.filter(a=>a.type==='number').map(a=>Number(a.v));
 if(v==='BI')throw Error('Встроенное изображение: редактирование страницы не поддерживается');
 if(v==='q')stack.push({...state,ctm:state.ctm.slice(),clip:state.clip?.slice()});
 if(v==='Q')state=stack.pop()||state;
 if(v==='cm')state.ctm=multiply(state.ctm,n);
 if(v==='re'){const a=point(state.ctm,n[0],n[1]),b=point(state.ctm,n[0]+n[2],n[1]+n[3]);rect=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}
 if(v==='W'||v==='W*'){if(rect){state.clip=intersect(state.clip,rect);clips.push(state.clip.slice())}else unsafe=true}
 if(['n','S','f','f*','B','b'].includes(v))rect=null;
 if(v==='Do'){const a=point(state.ctm,0,0),b=point(state.ctm,1,1);images.push([Math.min(a[0],b[0]),height-Math.max(a[1],b[1]),Math.max(a[0],b[0]),height-Math.min(a[1],b[1])])}
 if(v==='BT'){bt=true;lx=ly=0;tm=[1,0,0,1,0,0]}
 if(v==='ET')bt=false;
 if(v==='Tf'){state.font=args[0]?.v;state.size=n[0]}
 if(v==='TL')leading=n[0];
 if(v==='Ts')state.rise=n[0];if(v==='Tr')state.renderMode=n[0];if(v==='Tz')state.horizontal=n[0];
 if(v==='Tm'){tm=n;lx=n[4];ly=n[5]}
 if(v==='Td'||v==='TD'){lx+=n[0];ly+=n[1];if(v==='TD')leading=-n[1]}
 if(v==='T*')ly-=leading;
 if(bt&&['Tj','TJ',"'",'"'].includes(v)){
  const p=point(state.ctm,lx,ly),clip=state.clip;
  shows.push({stream,start:args[0]?.start,end:t.end,expected:s.slice(args[0]?.start,t.end),replacement:v==='TJ'?'[] TJ':'() Tj',x:p[0],baseline:height-p[1],font:state.font,size:state.size,clip:clip?[clip[0],height-clip[3],clip[2],height-clip[1]]:null,unsafe:unsafe||state.rise!==0||state.renderMode!==0||state.horizontal!==100||!['Tj','TJ'].includes(v)||Math.abs(state.ctm[0]-1)>1e-5||Math.abs(state.ctm[3]-1)>1e-5||state.ctm[1]!==0||state.ctm[2]!==0||tm[1]!==0||tm[2]!==0||Math.abs(tm[0]-1)>1e-5||Math.abs(tm[3]-1)>1e-5});
 }
 args=[];
 }
 return {shows,images,clips:clips.map(c=>[c[0],height-c[3],c[2],height-c[1]])};
}
function groupText(items){const lines=[];for(const i of [...items].sort((a,b)=>a.baseline-b.baseline||a.x-b.x)){let l=lines.find(l=>Math.abs(l.y-i.baseline)<1);if(!l){l={y:i.baseline,items:[]};lines.push(l)}l.items.push(i)}return lines.map(l=>{let out='',right=null;for(const i of l.items.sort((a,b)=>a.x-b.x)){if(right!==null&&i.x-right>1.2&&!out.endsWith(' ')&&!i.text.startsWith(' '))out+=' ';out+=i.text;right=i.x+i.width}return out.trim()}).join('\n')}
function build(page,scans,fontNames={}){
 const {height,width,items,number,type}=page;if(page.rotation||Math.abs(width-595.276)>3||Math.abs(height-841.89)>3)return [];
 const shows=scans.flatMap(s=>s.shows),images=scans.flatMap(s=>s.images),unique=new Map(),virtualTitles=new Map();
 for(const c of scans.flatMap(s=>s.clips)){if(c[2]-c[0]<15||c[3]-c[1]<8||c[2]-c[0]>535)continue;unique.set(c.map(n=>n.toFixed(2)).join(','),c)}
 // Acrobat touch-up values can sit outside any clip. Recover the known right-hand cells
 // from their label's verified rectangle, rather than omitting those values.
 if(type==='bill')for(const item of items.filter(i=>['Дата и место выпуска','Место оплаты','Количество оригиналов','Номер бронирования','Номер B/L'].includes(labels.get(norm(i.text))))){
  const labelBox=[...unique.values()].find(b=>item.x>=b[0]-1&&item.x<b[2]&&item.baseline>b[1]&&item.baseline<b[3]);
  if(labelBox&&item.x>280&&item.x<384){const b=[384.677,labelBox[1],564.929,labelBox[3]];const key=b.map(n=>n.toFixed(2)).join(',');unique.set(key,b);virtualTitles.set(key,labels.get(norm(item.text)))}
 }
 if(page.boundary){const c=page.boundary,b=[c.x,c.top,c.x+c.width,c.bottom];
  for(const [key,v]of unique)if(v[0]>300&&v[0]<320&&v[1]>235&&v[1]<290&&v[3]>300&&v[3]<340)unique.delete(key);
  unique.set(b.map(n=>n.toFixed(2)).join(','),b);
 }
 if(type==='bill'&&page.boundary){
  const head=items.find(i=>norm(i.text)==='Notify Party 2 :'),clip=head&&[...unique.values()].find(b=>head.x>=b[0]-1&&head.x<b[2]&&head.baseline>b[1]&&head.baseline<b[3]);
  if(clip){const b=[clip[0],clip[3]+2,clip[2],page.boundary.top-3],key=b.map(n=>n.toFixed(2)).join(',');if(b[3]-b[1]>8){unique.set(key,b);virtualTitles.set(key,'Уведомить дополнительно')}}
  const body=[...unique.values()].find(b=>b[0]<35&&b[1]>550&&b[1]<640&&b[3]-b[1]>30&&b[3]-b[1]<45);
  if(body)for(const name of ['Rating','Prepaid']){const h=items.find(i=>norm(i.text)===name),c=h&&[...unique.values()].find(b=>h.x>=b[0]&&h.x<b[2]&&h.baseline>b[1]&&h.baseline<b[3]);if(c){const b=[c[0],body[1],c[2],body[3]],key=b.map(n=>n.toFixed(2)).join(',');unique.set(key,b);virtualTitles.set(key,labels.get(name))}}
 }
 // A manually repaired container/seal cell may have no clipping rectangle at all.
 // Reconstruct only a known table column, using its header and the adjacent body row.
 if(type==='bill')for(const name of ['Marks & Numbers','No of Pkgs','Description of Goods & Packages','Total Gr. Wt. (KGS)']){
  const head=items.find(i=>norm(i.text)===name),header=head&&[...unique.values()].find(b=>insideHeader(head,b));
  if(!header)continue;
  const body=[...unique.values()].find(b=>b[1]>=header[3]&&b[1]-header[3]<10&&b[3]-b[1]>30);
  if(body&&![...unique.values()].some(b=>Math.abs(b[0]-header[0])<1&&Math.abs(b[1]-body[1])<1&&Math.abs(b[3]-body[3])<1)){
   const box=[header[0],body[1],header[2],body[3]],key=box.map(n=>n.toFixed(2)).join(',');unique.set(key,box);virtualTitles.set(key,labels.get(name));
  }
 }
 function insideHeader(i,b){return i.x>=b[0]-1&&i.x<b[2]&&i.baseline>b[1]&&i.baseline<b[3]&&b[3]-b[1]<30}
 const nested=new Set();for(const [key,b]of unique)for(const [other,c]of unique)if(key!==other&&Math.abs(b[0]-c[0])<.1&&Math.abs(b[2]-c[2])<.1&&b[1]>=c[1]&&b[3]<=c[3]&&c[3]-c[1]-(b[3]-b[1])>1)nested.add(key);
 for(const key of nested)unique.delete(key);
 const fields=[];const inside=(i,b)=>i.x>=b[0]-2&&i.x<b[2]+1&&i.baseline>=b[1]&&i.baseline<b[3]+1;
 for(const [key,b] of unique){
  let contents=items.filter(i=>inside(i,b)),runs=shows.filter(s=>inside(s,b));
  const heads=contents.filter(i=>labels.has(norm(i.text))&&!(norm(i.text)==='Collect'&&b[3]-b[1]>18)),isHeading=contents.length&&heads.length===contents.length;
  if(isHeading&&b[3]-b[1]<18)continue;
  if(contents.some(i=>/^(BILL OF LADING|ATTACHED SHEET|Signed on behalf|By:|Freight Charges, Etc|\*\*\* End of Statement)/.test(norm(i.text))))continue;
  let box=[...b],title=virtualTitles.get(key),semantic;
  if(heads.length){
   const head=heads[0];title=labels.get(norm(head.text));const last=Math.max(...heads.map(i=>i.baseline));
   // Mixed label/value cells: reserve the original label line.
   box[1]=last+3;contents=contents.filter(i=>i.baseline>last+1);runs=runs.filter(i=>i.baseline>last+1);
  }else{
   const adjacent=items.filter(i=>labels.has(norm(i.text))&&((Math.abs(i.baseline-(contents[0]?.baseline??(b[1]+8)))<3&&i.x+i.width<=b[0]+2)||(i.x>=b[0]-3&&i.x<b[2]&&i.baseline<b[1]&&b[1]-i.baseline<35))).sort((a,z)=>{const score=i=>Math.abs(i.baseline-(contents[0]?.baseline??b[1]))<3?Math.abs(b[0]-i.x-i.width):1000+Math.abs(i.baseline-b[1]);return score(a)-score(z)});
   title=title||(adjacent[0]?labels.get(norm(adjacent[0].text)):null);
  }
  if(box[3]-box[1]<8)continue;
  if(!contents.length&&!heads.length&&!virtualTitles.has(key))continue;
  if(!title&&type==='continuation'&&b[3]-b[1]>30)title=b[0]<100?'Маркировка':b[0]<200?'Количество мест':b[0]>520?'Объём':b[0]>440?'Масса брутто':null;
  if(!title&&type==='bill'&&b[3]-b[1]>20&&b[3]-b[1]<27&&b[1]>500)title=b[0]>520?'Итого объём':b[0]>440?'Итого масса':b[0]>150&&b[0]<200?'Итого мест':null;
  title=title||'Текстовый блок';
  if(type==='attachment'&&b[0]>520&&b[1]<75&&b[3]-b[1]<20)title='Номер рейса';
  const original=groupText(contents);
  if(!original&&!heads.length&&!virtualTitles.has(key))continue;
  semantic=title==='Текстовый блок'?null:title;
  let reason='';
  if(runs.some(s=>s.unsafe)||contents.some(i=>i.x+i.width>b[2]+2))reason='Сложное размещение или текст выходит за границу поля';
  if(contents.length&&!runs.length)reason='Не удалось связать текст с содержимым PDF';
  if(images.some(i=>i[0]<box[2]&&i[2]>box[0]&&i[1]<box[3]&&i[3]>box[1]))reason='В поле есть изображение или печать';
  const matched=contents.every(i=>runs.some(s=>Math.abs(s.baseline-i.baseline)<1.2));if(!matched)reason='Не удалось однозначно сопоставить строки';
  const firstY=contents.length?Math.min(...contents.map(i=>i.baseline)):null,firstLine=contents.filter(i=>Math.abs(i.baseline-firstY)<1),leftGap=firstLine.length?Math.min(...firstLine.map(i=>i.x))-box[0]:0,rightGap=firstLine.length?box[2]-Math.max(...firstLine.map(i=>i.x+i.width)):0;const align=leftGap>4&&Math.abs(rightGap)<4?'right':leftGap>3&&Math.abs(leftGap-rightGap)<5?'center':'left';
  const size=Math.min(11,Math.max(8,...runs.map(r=>r.size||8))),bold=runs.length>0&&runs.every(r=>/bold/i.test(fontNames[r.font]||''));
  fields.push({id:number+':'+key,page:number,label:title,semantic,original,box:{x:box[0]+.3,top:box[1]+.3,width:box[2]-box[0]-.6,bottom:box[3]-.3},singleLine:['Номер рейса','Номер бронирования','Номер B/L','Дата и место выпуска'].includes(title),size,bold,align,baseline:contents.length?Math.min(...contents.map(i=>i.baseline)):null,reason,ranges:runs.map(({stream,start,end,expected,replacement,baseline})=>({stream,start,end,expected,replacement,baseline}))});
 }
 // Numeric/container columns have independent rows; keep those row associations.
 const quantities=fields.filter(f=>f.label==='Количество мест'&&f.box.bottom-f.box.top>30);
 for(const q of quantities){const ys=[...new Set(items.filter(i=>inside(i,[q.box.x-1,q.box.top-1,q.box.x+q.box.width+1,q.box.bottom+1])).map(i=>Math.round(i.baseline*10)/10))].sort((a,b)=>a-b).filter((v,i,a)=>i===0||v-a[i-1]>2);
  if(ys.length<2)continue;
  for(const f of [...fields].filter(f=>['Маркировка','Количество мест','Масса брутто','Объём'].includes(f.label)&&Math.abs(f.box.top-q.box.top)<2&&Math.abs(f.box.bottom-q.box.bottom)<2)){
   const index=fields.indexOf(f);fields.splice(index,1);
   for(let i=0;i<ys.length;i++){const top=i===0?f.box.top:ys[i]-7.5,bottom=i+1<ys.length?ys[i+1]-8:f.box.bottom;
    const b=[f.box.x-1,top-1,f.box.x+f.box.width+1,bottom+1],cellItems=items.filter(t=>inside(t,b));
    fields.push({...f,id:f.id+':row'+i,label:f.label+' · строка '+(i+1),semantic:f.semantic+':row'+i,box:{...f.box,top,bottom},original:groupText(cellItems),baseline:cellItems.length?Math.min(...cellItems.map(t=>t.baseline)):null,ranges:f.ranges.filter(t=>t.baseline>=top&&t.baseline<=bottom)});
   }
  }
 }
 // Reject any ambiguous overlapping mapping rather than applying a removal twice.
 for(const f of fields){if(fields.some(g=>g!==f&&f.ranges.some(r=>g.ranges.some(t=>r.stream===t.stream&&r.start===t.start))))f.reason='Поле пересекается с другим текстовым блоком'}
 return fields.sort((a,b)=>a.box.top-b.box.top||a.box.x-b.box.x);
}
function layout(text,font,field){
 if(text.length>6000)throw Error('Не более 6000 символов в поле');
 const chars=new Set(font.getCharacterSet());for(const c of text)if(!/[\n\r\t]/.test(c)&&!chars.has(c.codePointAt(0)))throw Error('В шрифте нет символа «'+c+'»');
 if(!text.trim())return {lines:[],size:8,lineHeight:9};
 if(field.singleLine&&/[\r\n]/.test(text))throw Error('Номер или дата должны быть в одну строку');
 for(let size=field.size||8;size>=7;size-=.25){const lines=[];let wide=false;for(const p of text.replace(/\r\n?/g,'\n').split('\n')){if(field.singleLine){lines.push(p);if(font.widthOfTextAtSize(p,size)>field.box.width)wide=true;continue}let line='';for(const word of p.trim().split(/\s+/)){if(font.widthOfTextAtSize(word,size)>field.box.width)wide=true;const next=line?line+' '+word:word;if(line&&font.widthOfTextAtSize(next,size)>field.box.width){lines.push(line);line=word}else line=next}lines.push(line)}const lineHeight=size*1.18,natural=font.heightAtSize(size,{descender:false}),descent=font.heightAtSize(size,{descender:true})-natural;let ascent=Math.max(natural,field.baseline?field.baseline-field.box.top:natural+1),height=ascent+descent+(lines.length-1)*lineHeight;if(height>field.box.bottom-field.box.top){ascent=natural;height=ascent+descent+(lines.length-1)*lineHeight;}if(!wide&&height<=field.box.bottom-field.box.top)return {lines,size,lineHeight,ascent,height}}
 throw Error('Текст не помещается: сократите его (минимальный размер 7 pt)');
}
root.BillFields={scan,build,layout,groupText};if(typeof module!=='undefined')module.exports=root.BillFields;
})(globalThis);
