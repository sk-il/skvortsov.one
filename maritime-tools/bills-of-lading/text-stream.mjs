// ReadableStream async iteration is absent in some Safari versions.
// Use the public reader API without modifying PDF.js or browser prototypes.
export async function readTextContent(page, signal) {
  const abort = () => { if (signal?.aborted) throw new DOMException('Отменено', 'AbortError'); };
  abort();
  const reader = page.streamTextContent().getReader();
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, {once:true});
  const content = {items:[], styles:Object.create(null), lang:null};
  let complete = false;
  try {
    while (true) {
      abort();
      const {value, done} = await reader.read();
      abort();
      if (done) { complete = true; return content; }
      content.lang ??= value.lang;
      Object.assign(content.styles, value.styles);
      content.items.push(...value.items);
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
