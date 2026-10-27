importScripts('./vendor/pdf-lib.js','./vendor/fontkit.js','./font-config.js?v=20261027-2','./fields-core.js?v=20261027-2');
const {PDFDocument,PDFName,PDFDict,PDFArray,decodePDFRawStream,rgb}=PDFLib;
const normalized=s=>s.normalize('NFC').replace(/\s+/gu,'');
function streams(pdf,page){const c=page.node.Contents();return c?(c instanceof PDFArray?c.asArray():[c]).map(ref=>({ref,text:Array.from(decodePDFRawStream(pdf.context.lookup(ref)).decode(),n=>String.fromCharCode(n)).join('')})):[]}
function signed(pdf){return pdf.context.enumerateIndirectObjects().some(([,o])=>o instanceof PDFDict&&(String(o.get(PDFName.of('FT')))==='/Sig'||String(o.get(PDFName.of('Type')))==='/Sig'||o.has(PDFName.of('ByteRange'))))}
self.onmessage=async({data})=>{try{
 const {bytes,docs,assignments={}}=data,pdf=await PDFDocument.load(bytes,{updateMetadata:false});
 if(signed(pdf))throw Error('PDF с цифровой подписью не поддерживается');
 if(data.action==='fields'){
  const fields=[];
  for(const info of data.pageInfos){try{const page=pdf.getPages()[info.number-1],names={},dict=page.node.Resources()?.lookup(PDFName.of('Font'),PDFDict);if(dict)for(const [k,v]of dict.entries())names[String(k)]=String(pdf.context.lookup(v).get(PDFName.of('BaseFont')));
   const objects=page.node.Resources()?.lookup(PDFName.of('XObject'),PDFDict);if(objects&&objects.entries().some(([,ref])=>String(pdf.context.lookup(ref).dict?.get(PDFName.of('Subtype')))==='/Form'))throw Error('Вложенные графические формы PDF не поддерживаются');
   const scanned=streams(pdf,page).map((s,i)=>BillFields.scan(s.text,info.height,i));fields.push(...BillFields.build(info,scanned,names));
  }catch(e){fields.push({id:info.number+':unsupported',page:info.number,label:'Страница',reason:'Редактирование этой страницы недоступно: '+e.message,original:'',box:null})}}
  self.postMessage({fields});return;
 }
 pdf.registerFontkit(fontkit);const config=self.BILL_FONT,fonts={};
 async function fontFor(bold){const key=bold?'bold':'regular';if(fonts[key])return fonts[key];const url=bold?config.boldUrl:config.url,hash=bold?config.boldSha256:config.sha256;if(!url)throw Error('Для этого поля нужен полужирный шрифт');const target=new URL(url,self.location.href);if(target.origin!==self.location.origin)throw Error('Шрифт должен загружаться с сайта');const res=await fetch(target);if(!res.ok)throw Error('Не удалось загрузить '+config.name);const b=await res.arrayBuffer();if(hash){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==hash)throw Error('Файл шрифта не совпадает с проверенной версией')}return fonts[key]=await pdf.embedFont(b,{subset:false,features:{liga:false,clig:false}})}
 const results=[],plans=[],clausePlans=[];let changed=0;
 for(const doc of docs){const a=assignments[doc.id]||{},text=a.text||'';let result={id:doc.id,page:doc.page,status:'review',reason:doc.reason||''},pending=[];
  if(a.skip)result={...result,status:'skipped',reason:'Оставлен без изменений по вашему выбору'};
  else if(!doc.reason){try{
   for(const [id,value] of Object.entries(a.fields||{})){const field=doc.fields?.find(f=>f.id===id);if(!field||field.reason||!field.box)throw Error(field?.reason||'Поле не найдено');if(value===field.original)continue;const font=await fontFor(field.bold);pending.push({field,text:value,font,layout:BillFields.layout(value,font,field)})}
   if(data.clausesEnabled!==false){
    if(pending.some(p=>p.field.label==='Контакты и перевозчики'))throw Error('Контактный блок уже редактируется: отключите добавление формулировки');
    if(!text.trim())throw Error('Введите формулировку');
    if(doc.existing){if(normalized(doc.existing)!==normalized(text))throw Error('В документе уже есть другая формулировка');result={...result,status:'existing',reason:'Эта формулировка уже есть'}}
    else {if(!doc.box)throw Error('Область вставки не определена');const font=await fontFor(false),layout=BillFields.layout(text,font,{box:doc.box,size:8});clausePlans.push({page:doc.page,box:doc.box,font,layout});result={...result,status:'ready',reason:'Текст добавлен · '+config.name+' · '+layout.size+' pt',layout,box:doc.box};changed++}
   }else result={...result,status:'unchanged',reason:'Поля оставлены без изменений'};
   if(pending.length){plans.push(...pending);changed++;result={...result,status:'ready',reason:'Изменено полей: '+pending.length+' · '+config.name,fields:pending.map(p=>({id:p.field.id,label:p.field.label,page:p.field.page,size:p.layout.size}))}}
  }catch(e){result={...result,status:'review',reason:e.message}}}
  results.push(result);
 }
 // Remove original text operators before any drawText() normalizes Contents references.
 const byPage=new Map();for(const p of plans){const list=byPage.get(p.field.page)||[];list.push(...p.field.ranges);byPage.set(p.field.page,list)}
 for(const [n,ranges]of byPage){const page=pdf.getPages()[n-1],entries=streams(pdf,page),seen=new Set();for(const r of ranges){const key=r.stream+':'+r.start;if(seen.has(key)||entries[r.stream]?.text.slice(r.start,r.end)!==r.expected)throw Error('Содержимое поля изменилось. Загрузите исходный PDF повторно');seen.add(key)}
  const refs=entries.map((entry,i)=>{let text=entry.text;const edits=ranges.filter(r=>r.stream===i).sort((a,b)=>b.start-a.start);if(!edits.length)return entry.ref;for(const r of edits)text=text.slice(0,r.start)+r.replacement+text.slice(r.end);return pdf.context.register(pdf.context.flateStream(Uint8Array.from(text,c=>c.charCodeAt(0))))});page.node.set(PDFName.of('Contents'),pdf.context.obj(refs));
 }
 function draw(page,box,font,layout,align='left'){for(let i=0;i<layout.lines.length;i++)page.drawText(layout.lines[i],{font,size:layout.size,x:box.x+(align==='right'?box.width-font.widthOfTextAtSize(layout.lines[i],layout.size):align==='center'?(box.width-font.widthOfTextAtSize(layout.lines[i],layout.size))/2:0),y:page.getHeight()-box.top-layout.ascent-i*layout.lineHeight,color:rgb(0,0,0)})}
 for(const p of plans)draw(pdf.getPages()[p.field.page-1],p.field.box,p.font,p.layout,p.field.align);
 for(const p of clausePlans)draw(pdf.getPages()[p.page-1],p.box,p.font,p.layout);
 const output=changed?await pdf.save({useObjectStreams:true}):bytes;self.postMessage({bytes:output,results,changed,font:config.name,exportable:results.every(x=>x.status!=='review')},[output.buffer]);
}catch(e){self.postMessage({error:e.message?.includes('encrypted')?'Защищённый PDF не поддерживается':e.message||'Не удалось обработать PDF'})}};
