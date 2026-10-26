export async function createArchive(entries, summary, {signal, onProgress=()=>{}}={}) {
  const abort=()=>{if(signal?.aborted)throw new DOMException('Отменено','AbortError')};
  abort();
  const zip=new globalThis.JSZip();
  for(const entry of entries){abort();zip.file(entry.name,entry.bytes)}
  zip.file('processing-summary.json',JSON.stringify(summary,null,2));
  const result=await zip.generateAsync({type:'blob',compression:'STORE'},meta=>{
    abort();onProgress(meta.percent);
  });
  abort();return result;
}
