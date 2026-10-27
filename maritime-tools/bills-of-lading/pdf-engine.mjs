import * as pdfjs from './vendor/pdf.mjs';
import {classifyPage, groupPages} from './rules.mjs';
import {readTextContent} from './text-stream.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
const base=new URL('./vendor/',import.meta.url).href;
export function openPdf(bytes){return pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,stopAtErrors:true,useSystemFonts:false,standardFontDataUrl:base+'standard_fonts/',cMapUrl:base+'cmaps/',cMapPacked:true,wasmUrl:base+'wasm/'});}
const abort=signal=>{if(signal?.aborted)throw new DOMException('Отменено','AbortError')};
export async function analyze(bytes,{signal,onProgress=()=>{}}={}){
  abort(signal);const task=openPdf(bytes);const cancel=()=>{task.destroy().catch(()=>{})};signal?.addEventListener('abort',cancel,{once:true});
  try {
    const doc=await task.promise;
    if(doc.numPages>500)throw Error('В одном файле поддерживается до 500 страниц');
    if(await doc.getPermissions())throw Error('Защищённый PDF не поддерживается');
    const fields=await doc.getFieldObjects();
    if(fields && Object.values(fields).flat().some(f=>f.type==='signature'))throw Error('PDF с цифровой подписью не поддерживается');
    const pages=[],pageInfos=[];
    for(let n=1;n<=doc.numPages;n++){
      abort(signal);const page=await doc.getPage(n),vp=page.getViewport({scale:1});
      const content=await readTextContent(page,signal);
      const items=content.items.filter(x=>x.str?.trim()).map(x=>{
        const t=pdfjs.Util.transform(vp.transform,x.transform),h=Math.hypot(t[2],t[3]);
        const style=content.styles[x.fontName];return {text:x.str,x:t[4],width:x.width,baseline:t[5],top:t[5]-(style?.ascent??.8)*h,bottom:t[5]-(style?.descent??-.2)*h};
      });
      const ops=await page.getOperatorList(),borders=[];let ctm=[1,0,0,1,0,0];const stack=[];
      for(let i=0;i<ops.fnArray.length;i++){
        const op=ops.fnArray[i],args=ops.argsArray[i];
        if(op===pdfjs.OPS.save)stack.push(ctm.slice());
        else if(op===pdfjs.OPS.restore)ctm=stack.pop()||[1,0,0,1,0,0];
        else if(op===pdfjs.OPS.transform)ctm=pdfjs.Util.transform(ctm,args);
        else if(op===pdfjs.OPS.constructPath && args?.[0]===pdfjs.OPS.stroke && args[2]){
          const b=Array.from(args[2]),m=pdfjs.Util.transform(vp.transform,ctm);
          const a=[b[0],b[1]],z=[b[2],b[3]];pdfjs.Util.applyTransform(a,m);pdfjs.Util.applyTransform(z,m);
          borders.push({left:Math.min(a[0],z[0]),right:Math.max(a[0],z[0]),top:Math.min(a[1],z[1]),bottom:Math.max(a[1],z[1])});
        }
      }
      const result=classifyPage({items,borders,width:vp.width,height:vp.height,rotation:page.rotate,number:n});
      // Text extraction cannot see stamps/images/outlined letters. Inspect the blank area too.
      if(result.needsBlankCheck && !result.reason && result.box.bottom>result.box.top){
        const scale=1.5,canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width*scale);canvas.height=Math.ceil(vp.height*scale);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport:page.getViewport({scale}),annotationMode:pdfjs.AnnotationMode.ENABLE}).promise;
        abort(signal);const b=result.box,x=Math.ceil(b.x*scale),y=Math.ceil(b.top*scale),w=Math.floor(b.width*scale),h=Math.floor((b.bottom-b.top)*scale);
        if(h>0){const pixels=ctx.getImageData(x,y,w,h).data;for(let k=0;k<pixels.length;k+=4){if(pixels[k]<230||pixels[k+1]<230||pixels[k+2]<230){result.reason='В области вставки есть изображение или другие элементы';break}}}
        canvas.width=canvas.height=0;
      }
      pages.push(result);pageInfos.push({items,width:vp.width,height:vp.height,rotation:page.rotate,number:n,type:result.type,boundary:result.boundary});page.cleanup();onProgress(n,doc.numPages);
    }
    const docs=groupPages(pages);
    const scan=await runWorker({action:'fields',bytes:bytes.slice(),pageInfos:pageInfos.filter(p=>docs.some(d=>d.type==='bill'&&!d.reason&&d.pages.includes(p.number)))},{signal});
    for(const d of docs)d.fields=scan.fields.filter(f=>d.pages.includes(f.page));
    return {pageCount:doc.numPages,docs};
  }finally{signal?.removeEventListener('abort',cancel);await task.destroy();}
}
export function generate(bytes,docs,assignments,{signal,clausesEnabled=true}={}){return runWorker({bytes:bytes.slice(),docs,assignments,clausesEnabled},{signal})}
function runWorker(data,{signal}={}){
  abort(signal);return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./writer.js?v=20261027-2',import.meta.url));
    const finish=(fn,value)=>{worker.terminate();signal?.removeEventListener('abort',cancel);fn(value)};
    const cancel=()=>finish(reject,new DOMException('Отменено','AbortError'));
    signal?.addEventListener('abort',cancel,{once:true});
    worker.onmessage=e=>e.data.error?finish(reject,Error(e.data.error)):finish(resolve,e.data);
    worker.onerror=()=>finish(reject,Error('Не удалось сформировать PDF в браузере'));
    worker.postMessage(data,[data.bytes.buffer]);
  });
}
