importScripts('./vendor/pdf-lib.js','./vendor/fontkit.js');
const {PDFDocument,PDFName,PDFDict,rgb}=PDFLib;
function normalized(s){return s.normalize('NFC').replace(/\s+/gu,'')}
function fit(text,font,box){
  if(!text.trim())return {reason:'Введите формулировку'};
  if(text.length>6000)return {reason:'Слишком длинный текст: максимум 6000 символов'};
  const characters=new Set(font.getCharacterSet());
  for(const c of text){if(!/[\r\n\t]/.test(c)&&!characters.has(c.codePointAt(0)))return {reason:'В тексте есть символы, которых нет в шрифте'}}
  for(let size=8;size>=7;size-=.25){
    const lines=[];let tooWide=false;
    for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){
      let line='';for(const word of paragraph.trim().split(/\s+/)){
        if(font.widthOfTextAtSize(word,size)>box.width){tooWide=true;break}
        const next=line?line+' '+word:word;if(line&&font.widthOfTextAtSize(next,size)>box.width){lines.push(line);line=word}else line=next;
      }lines.push(line);
    }
    const lineHeight=size*1.12,height=font.heightAtSize(size,{descender:true})+(lines.length-1)*lineHeight;
    if(!tooWide&&height<=box.bottom-box.top)return {size,lines,lineHeight,ascent:font.heightAtSize(size,{descender:false}),height};
  }
  return {reason:'Текст не помещается при читаемом размере шрифта (не менее 7 pt)'};
}
self.onmessage=async({data})=>{
 try{
  const {bytes,docs,assignments}=data;
  const pdf=await PDFDocument.load(bytes,{updateMetadata:false});
  for(const [,obj]of pdf.context.enumerateIndirectObjects())if(obj instanceof PDFDict && (String(obj.get(PDFName.of('FT')))==='/Sig'||String(obj.get(PDFName.of('Type')))==='/Sig'||obj.has(PDFName.of('ByteRange'))))throw Error('PDF с цифровой подписью не поддерживается');
  pdf.registerFontkit(fontkit);
  const fontBytes=await(await fetch('./vendor/Carlito-Regular.ttf')).arrayBuffer();
  // Full embedding and disabled ligatures prevent missing glyphs in PDFium/Preview.
  const font=await pdf.embedFont(fontBytes,{subset:false,features:{liga:false,clig:false}});
  const results=[];let changed=0;
  for(const doc of docs){
    const assignment=assignments[doc.id]||{},text=assignment.text||'';
    let result={id:doc.id,page:doc.page,status:'review',reason:doc.reason||''};
    if(assignment.skip)result={...result,status:'skipped',reason:'Оставлен без изменений по вашему выбору'};
    else if(doc.reason){}
    else if(!text.trim())result.reason='Введите формулировку';
    else if(doc.existing){if(normalized(doc.existing)===normalized(text))result={...result,status:'existing',reason:'Эта формулировка уже есть'};else result.reason='В документе уже есть другая формулировка'}
    else if(!doc.box)result.reason='Область вставки не определена';
    else {
      const layout=fit(text,font,doc.box);
      if(layout.reason)result.reason=layout.reason;
      else {
        const page=pdf.getPages()[doc.page-1];
        for(let i=0;i<layout.lines.length;i++)page.drawText(layout.lines[i],{font,size:layout.size,x:doc.box.x,y:page.getHeight()-doc.box.top-layout.ascent-i*layout.lineHeight,color:rgb(0,0,0)});
        result={...result,status:'ready',reason:'Текст добавлен · '+layout.size+' pt',box:doc.box,layout};changed++;
      }
    }
    results.push(result);
  }
  const output=changed?await pdf.save({useObjectStreams:true}):bytes;
  self.postMessage({bytes:output,results,changed,exportable:results.every(x=>x.status!=='review')},[output.buffer]);
 }catch(e){self.postMessage({error:e.message?.includes('encrypted')?'Защищённый PDF не поддерживается':e.message||'Не удалось обработать PDF'})}
};
