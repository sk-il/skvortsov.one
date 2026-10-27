import {analyze,generate,openPdf} from './pdf-engine.mjs?v=20261027-2';
import {STANDARD,MULTI,uniqueOutputNames} from './rules.mjs';
import {createArchive} from './archive.mjs';
const $=id=>document.getElementById(id);
const labels={unchanged:'Без правок',ready:'Готов',existing:'Текст уже есть',review:'Нужна проверка',skipped:'Без изменений',pending:'Не проверен'};
let files=[],serial=0,active=null,selected=new Set(),busy=false,controller=null,dirty=false,mode='before',pageNumber=1,previewToken=0,previewTask=null,renderTask=null,assignmentTargets=[],activeField=null;
const rows=()=>files.flatMap(f=>(f.analysis?.docs||[]).map(d=>({f,d,key:f.id+':'+d.id})));
const current=()=>rows().find(r=>r.key===active);
const setting=r=>r.f.assignments[r.d.id]||{};
const chosenText=r=>setting(r).text??$('common-text').value;
const result=r=>r.f.error?{status:'review',reason:r.f.error}:r.f.output?.results.find(x=>x.id===r.d.id)||{status:'pending',reason:r.d.reason||'Выберите поле для редактирования или проверьте пакет'};
function elem(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text}
function setBusy(value){busy=value;for(const el of document.querySelectorAll('#field-editor button,#field-editor select,#field-editor textarea,#clauses-enabled'))el.disabled=value;document.body.classList.toggle('busy',value);for(const id of ['files','clear','common-text','template','check','assign-current','assign-selected','skip','inherit'])$(id).disabled=value;for(const el of document.querySelectorAll('.file-chip button,.doc-row input,#select-all'))el.disabled=value;$('cancel').hidden=!value;$('cancel-import').hidden=!value;if(!value){$('progress-box').hidden=true;updateButtons()}}
function progress(text,value,max){$('progress-box').hidden=false;$('progress-text').textContent=text;if(max){$('progress').max=max;$('progress').value=value}else $('progress').removeAttribute('value')}
function invalidate(){dirty=true;for(const f of files)f.output=null;mode='before';renderAll();renderPreview()}
function visibleRows(){const q=$('search').value.trim().toLowerCase(),filter=$('filter').value;return rows().filter(r=>(r.d.bl+' '+r.f.name).toLowerCase().includes(q)&&(filter==='all'||result(r).status===filter))}
function renderList(){
  const list=$('rows');list.replaceChildren();const visible=visibleRows();
  for(const r of visible){
    const row=elem('div',undefined,'doc-row'+(r.key===active?' active':'')),check=elem('input');check.type='checkbox';check.checked=selected.has(r.key);check.disabled=busy;check.setAttribute('aria-label','Выбрать '+(r.d.bl||'страницу '+r.d.page));
    check.onchange=()=>{check.checked?selected.add(r.key):selected.delete(r.key);updateSelection()};
    const button=elem('button',undefined,'doc-open');button.append(elem('strong',r.d.bl||'Неопознанная страница '+r.d.page));button.append(elem('span',r.f.name+' · стр. '+r.d.pages.join(', '),'doc-meta'));
    const s=result(r);button.append(elem('span',labels[s.status],'badge '+s.status));if(Object.keys(fieldValues(r)).length)button.append(elem('span','Правки полей: '+Object.keys(fieldValues(r)).length,'badge individual'));if(setting(r).text!==undefined)button.append(elem('span','Свой текст','badge individual'));
    button.onclick=()=>{active=r.key;pageNumber=r.d.page;activeField=null;renderList();renderDetail();renderPreview();if(matchMedia('(max-width:760px)').matches)mobile(true)};
    row.append(check,button);list.append(row);
  }
  $('empty-results').hidden=!!visible.length;updateSelection();
}
function updateSelection(){const visible=visibleRows();$('selection-count').textContent=selected.size?'Выбрано: '+selected.size:'';$('select-all').checked=visible.length>0&&visible.every(r=>selected.has(r.key));$('select-all').indeterminate=visible.some(r=>selected.has(r.key))&&!$('select-all').checked;$('assign-selected').disabled=busy||!selected.size;renderFieldTargets();}
function renderFiles(){
  $('file-list').replaceChildren();for(const f of files){const chip=elem('div',undefined,'file-chip'+(f.error?' error':''));chip.append(elem('span',f.name+(f.error?' — '+f.error:' · '+f.analysis.pageCount+' стр.')));const remove=elem('button','✕');remove.setAttribute('aria-label','Убрать '+f.name);remove.disabled=busy;remove.onclick=()=>{files=files.filter(x=>x!==f);for(const key of selected)if(key.startsWith(f.id+':'))selected.delete(key);if(!current())active=rows()[0]?.key||null;dirty=!!files.length;renderAll();renderPreview()};chip.append(remove);$('file-list').append(chip)}
}
function renderDetail(){
 const r=current();$('skip').disabled=busy;$('inherit').disabled=busy;$('preview-title').textContent=r?(r.d.bl||'Страница '+r.d.page):'Выберите коносамент';$('assign-current').disabled=busy||!r;$('detail-actions').hidden=!r;$('assigned').hidden=!r||!$('clauses-enabled').checked;$('assign-current').hidden=!$('clauses-enabled').checked;$('assign-selected').hidden=!$('clauses-enabled').checked;
 $('detail-status').textContent=r?result(r).reason:'';$('assigned-text').textContent=r?(chosenText(r)||'Формулировка ещё не задана'):'';
 $('skip').checked=!!r&&!!setting(r).skip;$('inherit').hidden=!r||setting(r).text===undefined;
 $('after').disabled=!r?.f.output; if(!$('after').disabled&&mode==='after'){}else mode='before';
 $('before').setAttribute('aria-pressed',String(mode==='before'));$('after').setAttribute('aria-pressed',String(mode==='after'));
 $('page-number').replaceChildren();if(r){if(!r.d.pages.includes(pageNumber))pageNumber=r.d.page;for(const n of r.d.pages){const option=elem('option',String(n));option.value=n;option.selected=n===pageNumber;$('page-number').append(option)}}
}
function updateButtons(){
 const readyFiles=files.filter(f=>f.output?.exportable),all=rows(),counts={};for(const r of all){const s=result(r).status;counts[s]=(counts[s]||0)+1}
 $('download').disabled=busy||!readyFiles.length;$('download').textContent=readyFiles.length>1?'Скачать ZIP ('+readyFiles.length+')':'Скачать готовый PDF';
 $('check').disabled=busy||!all.length;
 $('result-summary').textContent=Object.keys(counts).length?Object.entries(counts).map(([key,n])=>labels[key]+': '+n).join(' · '):'Добавьте документы';
 $('result-detail').textContent=readyFiles.length?'Готовых файлов: '+readyFiles.length+' из '+files.length+'. Проблемные коносаменты оставляйте без изменений только явно.':'Проверьте пакет. В общем PDF нужно разрешить все замечания или явно оставить эти документы без изменений.';
 $('common-count').textContent='Документов с общим текстом: '+all.filter(r=>setting(r).text===undefined&&!setting(r).skip).length;
 $('assign-current').disabled=busy||!current();updateSelection();
}
function renderAll(){
 const all=rows();$('session').hidden=!files.length;
 const bills=all.filter(r=>r.d.type==='bill'),attachments=bills.reduce((n,r)=>n+r.d.pages.length-1,0),unknown=all.length-bills.length;
 $('summary').textContent='Файлов: '+files.length+' · Коносаментов: '+bills.length+' · Страниц приложений: '+attachments+(unknown?' · '+unknown+' неопознанных страниц':'');
 renderFiles();renderList();renderDetail();updateButtons();
}
async function renderPreview(){
 const token=++previewToken;
 if(renderTask){renderTask.cancel();renderTask=null}if(previewTask){const old=previewTask;previewTask=null;old.destroy().catch(()=>{})}
 $('canvas').hidden=true;$('field-overlays').replaceChildren();renderFieldEditor();const r=current();if(!r){$('preview-note').textContent='Выберите документ в списке.';return}
 $('preview-note').textContent='Готовим предпросмотр…';
 try{
  const source=mode==='after'?r.f.output?.bytes:r.f.bytes;if(!source)return;
  const task=openPdf(source);previewTask=task;const pdf=await task.promise;if(token!==previewToken)return;
  const page=await pdf.getPage(pageNumber);if(token!==previewToken)return;
  const width=Math.max(260,$('canvas-wrap').clientWidth-32),zoom=Number($('zoom').value),scale=width/page.getViewport({scale:1}).width*zoom;
  const viewport=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2),canvas=$('canvas');canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
  const rendering=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});renderTask=rendering;await rendering.promise;if(token!==previewToken)return;
  canvas.hidden=false;renderFieldOverlays(page.getViewport({scale:1}).width,page.getViewport({scale:1}).height);$('preview-note').textContent=mode==='after'?'Результат: этот PDF будет скачан.'+(r.f.output.exportable?'':' Файл пока содержит нерешённые замечания.'):'Исходный документ. Для сравнения переключитесь на «После» после проверки.';
 }catch(e){if(token===previewToken&&e.name!=='RenderingCancelledException')$('preview-note').textContent='Не удалось показать страницу. Попробуйте выбрать её повторно.'}
}
async function addFiles(incoming){
 if(busy)return;const list=Array.from(incoming);if(!list.length)return;notice('');setBusy(true);controller=new AbortController();
 try{
  for(let i=0;i<list.length;i++){
   if(controller.signal.aborted)break;const source=list[i];
   if(!/\.pdf$/i.test(source.name)){notice('Можно добавлять только PDF. Другие файлы пропущены.');continue}
   if(source.size>50*1024*1024||source.size+files.reduce((n,f)=>n+f.bytes.length,0)>100*1024*1024){notice('Превышен лимит: 50 МБ на файл или 100 МБ на пакет. Этот файл не добавлен.');continue}
   const entry={id:String(++serial),name:source.name,bytes:new Uint8Array(await source.arrayBuffer()),assignments:{},fieldEdits:{},batchFields:{},output:null};
   try{entry.analysis=await analyze(entry.bytes,{signal:controller.signal,onProgress:(n,total)=>progress('Читаем файл '+(i+1)+' из '+list.length+' · страница '+n+' / '+total,n,total)})}
   catch(e){if(controller.signal.aborted)break;entry.error=e.name==='PasswordException'?'PDF защищён паролем':e.name==='InvalidPDFException'?'Не удалось прочитать PDF':/^В одном файле|^Защищённый|^PDF с цифровой/.test(e.message)?e.message:'Не удалось прочитать PDF. Возможно, формат файла не поддерживается.';}
   files.push(entry);dirty=true;if(!active)active=rows()[0]?.key||null;renderAll();
  }
 }finally{setBusy(false);controller=null;$('files').value='';renderAll();renderPreview()}
}
async function check(){
 if(busy)return;notice('');setBusy(true);controller=new AbortController();
 try{
  for(let i=0;i<files.length;i++){
   const f=files[i];if(!f.analysis)continue;progress('Проверяем файл '+(i+1)+' из '+files.length,i,files.length);
   const assignments=Object.fromEntries(f.analysis.docs.map(d=>[d.id,{...f.assignments[d.id],text:f.assignments[d.id]?.text??$('common-text').value,fields:fieldValues({f,d})}]));
   try{f.output=await generate(f.bytes,f.analysis.docs,assignments,{signal:controller.signal,clausesEnabled:$('clauses-enabled').checked});f.error=null}
   catch(e){if(controller.signal.aborted)break;f.output=null;f.error=e.message}
   renderAll();
  }
  const firstReview=rows().find(r=>result(r).status==='review');if(firstReview){active=firstReview.key;pageNumber=firstReview.d.page}mode='after';dirty=true;
 }finally{setBusy(false);controller=null;renderAll();renderPreview()}
}
function startAssignment(targets){if(busy||!targets.length)return;assignmentTargets=targets;const r=rows().find(r=>r.key===targets[0]);$('assignment-title').textContent='Другой текст · документов: '+targets.length;$('assignment-text').value=r?chosenText(r):'';$('assignment-template').value='custom';$('assignment').showModal()}
function mobile(preview){$('workspace').classList.toggle('show-preview',preview);$('show-list').setAttribute('aria-pressed',String(!preview));$('show-preview').setAttribute('aria-pressed',String(preview));if(preview)renderPreview()}
function save(blob,name){const url=URL.createObjectURL(blob),a=elem('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function download(){
 if(busy)return;const ready=files.filter(f=>f.output?.exportable);if(!ready.length)return;
 let saved=false;
 if(ready.length===1){save(new Blob([ready[0].output.bytes],{type:'application/pdf'}),uniqueOutputNames([ready[0].name])[0]);saved=true}
 else {
  setBusy(true);controller=new AbortController();
  try{
   const names=uniqueOutputNames(ready.map(f=>f.name));
   const entries=ready.map((f,i)=>({name:names[i],bytes:f.output.bytes}));
   const summary=ready.map((f,i)=>({source:f.name,output:names[i],documents:f.output.results.map(r=>({bill:f.analysis.docs.find(d=>d.id===r.id).bl,pages:f.analysis.docs.find(d=>d.id===r.id).pages,status:labels[r.status],note:r.reason}))}));
   const blob=await createArchive(entries,summary,{signal:controller.signal,onProgress:n=>progress('Упаковываем готовые файлы… '+Math.round(n)+'%',n,100)});
   save(blob,'bills-of-lading.zip');saved=true;
  }catch(e){notice(e.name==='AbortError'?'Упаковка отменена. Проверенные файлы сохранены в этой вкладке.':'Не удалось создать ZIP. Уменьшите пакет и повторите.')}
  finally{controller=null;setBusy(false)}
 }
 if(saved&&ready.length===files.length)dirty=false;
}

$('files').onchange=e=>addFiles(e.target.files);
for(const name of ['dragenter','dragover'])$('drop').addEventListener(name,e=>{e.preventDefault();if(!busy)$('drop').classList.add('drag')});
for(const name of ['dragleave','drop'])$('drop').addEventListener(name,e=>{e.preventDefault();$('drop').classList.remove('drag')});$('drop').addEventListener('drop',e=>addFiles(e.dataTransfer.files));
$('common-text').oninput=()=>{$('template').value='custom';invalidate()};$('template').onchange=()=>{const v=$('template').value;if(v==='standard')$('common-text').value=STANDARD;else if(v==='multi')$('common-text').value=MULTI;else if(v==='empty')$('common-text').value='';invalidate()};
$('search').oninput=renderList;$('filter').onchange=renderList;$('select-all').onchange=()=>{for(const r of visibleRows())$('select-all').checked?selected.add(r.key):selected.delete(r.key);renderList()};
$('assign-selected').onclick=()=>startAssignment([...selected]);$('assign-current').onclick=()=>startAssignment(active?[active]:[]);
$('assignment-template').onchange=()=>{const value=$('assignment-template').value;if(value==='standard')$('assignment-text').value=STANDARD;if(value==='multi')$('assignment-text').value=MULTI};
$('assignment').addEventListener('close',()=>{if($('assignment').returnValue!=='apply')return;for(const r of rows().filter(r=>assignmentTargets.includes(r.key)))r.f.assignments[r.d.id]={...setting(r),text:$('assignment-text').value,skip:false};invalidate()});
$('inherit').onclick=()=>{const r=current();if(r){const a={...setting(r)};delete a.text;r.f.assignments[r.d.id]=a;invalidate()}};
$('skip').onchange=()=>{const r=current();if(r){r.f.assignments[r.d.id]={...setting(r),skip:$('skip').checked};invalidate()}};
$('before').onclick=()=>{mode='before';renderDetail();renderPreview()};$('after').onclick=()=>{mode='after';renderDetail();renderPreview()};$('page-number').onchange=()=>{pageNumber=Number($('page-number').value);activeField=null;renderPreview()};$('zoom').onchange=renderPreview;
$('check').onclick=check;$('download').onclick=download;$('cancel').onclick=$('cancel-import').onclick=()=>controller?.abort();
$('clear').onclick=()=>{if(busy)return;files=[];selected.clear();active=null;dirty=false;notice('');renderAll();renderPreview()};
$('show-list').onclick=()=>mobile(false);$('show-preview').onclick=()=>mobile(true);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderPreview,150)});
renderAll();

function fieldValues(r){return {...r.f.batchFields?.[r.d.id],...r.f.fieldEdits?.[r.d.id]}}
function currentField(){return current()?.d.fields?.find(f=>f.id===activeField)}
function matchingFields(r,field){
 const ordinal=r.d.pages.indexOf(field.page);
 return rows().filter(t=>selected.has(t.key)).map(t=>{
  const page=t.d.pages[ordinal],matches=t.d.fields?.filter(f=>f.page===page&&field.semantic&&f.semantic===field.semantic&&!f.reason)||[];
  return {r:t,field:matches.length===1?matches[0]:null,reason:matches.length>1?'несколько полей с таким названием':'нет подходящего поля'};
 });
}
function renderFieldEditor(){
 const r=current(),fields=r?.d.fields?.filter(f=>f.page===pageNumber)||[];
 $('field-editor').hidden=!r;$('field-select').replaceChildren(elem('option',fields.length?'Выберите поле на PDF или в списке':'На этой странице нет доступных полей'));
 $('field-select').firstChild.value='';
 for(const f of fields){const option=elem('option',f.label+(f.reason?' · недоступно':'')+(Object.hasOwn(fieldValues(r),f.id)?' · изменено':''));option.value=f.id;option.selected=activeField===f.id;$('field-select').append(option)}
 const f=fields.find(f=>f.id===activeField);$('field-form').hidden=!f;if(!f)return;
 $('field-original').textContent=f.original||'Пустое поле';$('field-text').value=fieldValues(r)[f.id]??f.original;
 $('field-info').textContent=f.reason||(f.singleLine?'Одна строка. Размер подбирается автоматически, не меньше 7 pt.':'Перенос строк внутри границ поля. Размер не меньше 7 pt.');
 $('field-text').disabled=busy||!!f.reason;$('field-apply').disabled=busy||!!f.reason;$('field-reset').disabled=busy||!Object.hasOwn(fieldValues(r),f.id);
 $('field-inherit').hidden=!(Object.hasOwn(r.f.fieldEdits?.[r.d.id]||{},f.id)&&Object.hasOwn(r.f.batchFields?.[r.d.id]||{},f.id));
 $('field-error').hidden=true;renderFieldTargets();
}
function renderFieldTargets(){const r=current(),f=currentField();if(!f)return;const bulk=$('field-scope').value==='selected';
 const matches=bulk?matchingFields(r,f):[{r,field:f}],good=matches.filter(t=>t.field),protectedCount=bulk?good.filter(t=>Object.hasOwn(t.r.f.fieldEdits?.[t.r.d.id]||{},t.field.id)).length:0;
 $('field-targets').textContent='Совпадений: '+good.length+(bulk?' · индивидуальных правок сохранится: '+protectedCount:'')+'\n'+matches.map(t=>t.r.f.name+' / '+t.r.d.bl+' / '+(t.field?'стр. '+t.field.page:t.reason)).join('\n');
 $('field-apply').disabled=busy||!!f.reason||!good.length;
}
function renderFieldOverlays(width,height){const layer=$('field-overlays');layer.replaceChildren();if(!$('show-fields').checked)return;const r=current();for(const f of r?.d.fields||[]){if(f.page!==pageNumber||!f.box)continue;const b=elem('button',undefined,'pdf-field'+(f.id===activeField?' chosen':'')+(f.reason?' unavailable':'')+(Object.hasOwn(fieldValues(r),f.id)?' modified':''));b.type='button';b.title=f.label+(f.reason?' — '+f.reason:'');b.setAttribute('aria-label','Редактировать: '+f.label);b.disabled=busy;b.style.left=f.box.x/width*100+'%';b.style.top=f.box.top/height*100+'%';b.style.width=f.box.width/width*100+'%';b.style.height=(f.box.bottom-f.box.top)/height*100+'%';b.onclick=()=>{activeField=f.id;renderFieldEditor();for(const el of layer.children)el.classList.remove('chosen');b.classList.add('chosen');$('field-editor').scrollIntoView({block:'nearest'})};layer.append(b)}}
$('field-select').onchange=()=>{activeField=$('field-select').value;renderFieldEditor();renderPreview()};
$('show-fields').onchange=renderPreview;$('field-scope').onchange=renderFieldTargets;
$('field-cancel').onclick=renderFieldEditor;
$('field-apply').onclick=async()=>{const r=current(),f=currentField();if(busy||!r||!f||f.reason)return;const text=$('field-text').value,bulk=$('field-scope').value==='selected';const targets=bulk?matchingFields(r,f):[{r,field:f}];for(const t of targets){if(!t.field)continue;const map=bulk?t.r.f.batchFields:t.r.f.fieldEdits;map[t.r.d.id]??={};map[t.r.d.id][t.field.id]=text}invalidate();await check();const row=current();if(row&&result(row).status==='review'){$('field-error').textContent=result(row).reason;$('field-error').hidden=false}};
$('field-reset').onclick=async()=>{const r=current(),f=currentField();if(!r||!f||busy)return;delete r.f.fieldEdits?.[r.d.id]?.[f.id];delete r.f.batchFields?.[r.d.id]?.[f.id];invalidate();await check()};
$('field-inherit').onclick=async()=>{const r=current(),f=currentField();if(!r||!f||busy)return;delete r.f.fieldEdits?.[r.d.id]?.[f.id];invalidate();await check()};
$('clauses-enabled').onchange=()=>{$('clause-settings').hidden=!$('clauses-enabled').checked;invalidate()};
