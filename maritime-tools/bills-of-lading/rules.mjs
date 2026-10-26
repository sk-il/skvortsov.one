// Alpha Shipping form v1. Coordinates are PDF points, measured from the top.
export const STANDARD = 'Sea carriers/forwarders for international transportation within the territory of the Russian Federation on the route St. Petersburg - Baltiysk/Kaliningrad is "OBL-SHIPPING" LLC (INN 9705070412), forwarder at the JSC FCT is "OBL-TRANS" LLC (INN 5030093611)';
export const MULTI = 'Sea carriers/forwarders for international transportation within the territory of the Russian Federation on the route St. Petersburg - Baltiysk/Kaliningrad are:\n"Peleng" LLC (INN 3900001570 KPP 390001001)\n"OBL-SHIPPING" LLC (INN 9705070412 KPP 770501001)\n"Novik Logistic" LLC (INN 3914021390 KPP 391401001)\nTC NORD PROJECT LLC (INN 2901201732 KPP 290101001)';
export const normalize = text => text.normalize('NFC').replace(/\s+/gu, '');
export function textLines(items) {
  const rows = [];
  for (const item of items.filter(x => x.text.trim()).sort((a,b) => a.baseline-b.baseline || a.x-b.x)) {
    let row=rows.find(r=>Math.abs(r.baseline-item.baseline)<1);
    if(!row){row={baseline:item.baseline,items:[]};rows.push(row)} row.items.push(item);
  }
  return rows.map(r=>({...r,text:r.items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' '),top:Math.min(...r.items.map(x=>x.top)),bottom:Math.max(...r.items.map(x=>x.bottom))}));
}
export function classifyPage({items, borders, width, height, rotation, number}) {
  const text=items.map(x=>x.text).join(' ');
  const anchors=items.filter(x=>/For\s+Delivery\s+Please\s+Contact/i.test(x.text));
  const bl=text.match(/B\s*\/\s*L\s+Number\s*:\s*([A-Z0-9-]+)/i)?.[1];
  const attachment=text.match(/BL\s*#\s*([A-Z0-9-]+)/i)?.[1];
  const base={id:String(number),page:number,pages:[number],bl:bl||attachment||'',type:'unknown',reason:'Не удалось определить форму страницы'};
  if(!bl&&!anchors.length){
    if(attachment && /Description of Goods/i.test(text)) return {...base,type:'attachment',reason:''};
    if(/End of Statement/i.test(text) && (text.match(/\b[A-Z]{4}\d{7}\//g)||[]).length>=2) return {...base,type:'continuation',reason:''};
    return base;
  }
  if(!bl || anchors.length!==1 || !/Shipper/.test(text) || !/Consignee/.test(text) || !/Marks\s*&\s*Numbers/.test(text)) return base;
  base.type='bill';base.reason='';
  if(rotation!==0 || Math.abs(width-595.276)>3 || Math.abs(height-841.89)>3) return {...base,reason:'Размер или поворот страницы не поддерживается'};
  const anchor=anchors[0];
  if(anchor.x<width*.48 || anchor.top<height*.25 || anchor.top>height*.4) return {...base,reason:'Контактный блок расположен непривычно'};
  const horizontal=borders.filter(b=>b.bottom-b.top<1 && b.right-b.left>70 && b.left<anchor.x+5 && b.right>anchor.x+40 && b.top>anchor.bottom+25 && b.top<anchor.bottom+110).sort((a,b)=>a.top-b.top);
  const bottom=horizontal[0]?.top;
  const right=borders.filter(b=>b.right>anchor.x+210 && b.left<anchor.x+260 && Math.abs(b.bottom-b.top)<1 && b.top<anchor.top && anchor.top-b.top<25 && Math.abs(b.left-anchor.x)<6).map(b=>b.right).sort((a,b)=>a-b)[0];
  if(!bottom||!right || right-anchor.x>260) return {...base,reason:'Не удалось подтвердить границы контактного блока'};
  const content=items.filter(x=>x.x>=anchor.x-3 && x.top>=anchor.bottom-1 && x.bottom<bottom+1 && x.x<right && x.text.trim());
  const rows=textLines(content);
  let contacts=[],clause=rows;
  if(rows[0] && /^HUB SHIPPING$/i.test(rows[0].text.trim())){
    // Only the supplied two-line contact variant is trusted for automatic additions.
    if(!rows[1] || !/^101000,\s*Russia,\s*Moscow,\s*Chistoprudny boulevard 17,\s*bld\.\s*1$/i.test(rows[1].text.trim())) return {...base,reason:'Незнакомый контактный текст: нужна проверка'};
    contacts=rows.slice(0,2);clause=rows.slice(2);
  } else if(!rows.length) return {...base,reason:'Контакты не распознаны: нужна проверка'};
  const top=(contacts.at(-1)?.bottom ?? anchor.bottom)+3;
  return {...base,existing:clause.map(r=>r.text).join('\n'),box:{x:anchor.x,top,bottom:bottom-2,width:right-anchor.x-4},boundary:{x:anchor.x-2,top:anchor.top,bottom,width:right-anchor.x},needsBlankCheck:clause.length===0};
}
export function groupPages(pages){
  const docs=[];let last=null,previous=null;
  for(const p of pages){
    if(p.type==='attachment' && last?.type==='bill' && p.bl===last.bl){last.pages.push(p.page)}
    else if(p.type==='continuation' && last?.type==='bill' && ['attachment','continuation'].includes(previous?.type)){last.pages.push(p.page)}
    else {const d={...p};if(['attachment','continuation'].includes(p.type)){d.type='unknown';d.reason='Не удалось связать приложение с коносаментом'}docs.push(d);last=d}
    previous=p;
  }
  return docs;
}
export function uniqueOutputNames(names){
  const seen=new Set();return names.map(name=>{const stem=name.replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');let out=stem+'_processed.pdf',i=2;while(seen.has(out.toLowerCase()))out=stem+'_processed_'+i+++'.pdf';seen.add(out.toLowerCase());return out});
}
