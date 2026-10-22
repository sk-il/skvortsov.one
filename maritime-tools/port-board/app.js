import {defaults,statusNames,today,readState,stateQuery,dateRange,filterRows,rowStatus,movementMoment} from './model.mjs?v=2';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const colors={'ПЛП':'#087fc0','ПКТ':'#288b58','КТСП':'#8652b9','КМТП':'#008ba2','БСК':'#ce7c00','БРОНКА':'#bd623b','СТ':'#526e88'};
let data,state=readState(location.search),day=today();
const fullDate=v=>v?new Intl.DateTimeFormat('ru',{timeZone:'Europe/Kaliningrad',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'нет данных';
const shortDate=v=>v?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z')):'—';
const timeText=(day,clock)=>`${shortDate(day)}${clock?' · '+clock.slice(0,5):''}`;
function place(cell,port,terminal){cell.append(el('span',port||'—'));if(terminal){const badge=el('span',terminal,'badge');badge.style.setProperty('--badge',colors[terminal]||'#526e88');cell.append(el('br'),badge);}else cell.append(el('span','терминал не указан','sub'));}
function update(patch,replace=false){state={...state,...patch};const q=stateQuery(state);history[replace?'replaceState':'pushState'](null,'',location.pathname+(q?'?'+q:''));render();}
function selectOptions(id,field){const select=$(id);for(const value of [...new Set(data.movements.map(r=>r[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))select.add(new Option(value,value));}
function initialize(){
 for(const [id,field] of [['port','port'],['terminal','terminal'],['operator','operator'],['counterpart','counterpart_port'],['type','vessel_type']])selectOptions(id,field);
 const lines=new Map(data.movements.map(r=>[r.line_id,r.line_name]));
 // Include a selected but currently unavailable line instead of silently broadening a saved view.
 for(const id of state.lines)if(!lines.has(id))lines.set(id,id+' (нет данных)');
 for(const [id,name] of [...lines].sort((a,b)=>a[1].localeCompare(b[1],'ru'))){const label=el('label');const input=el('input');input.type='checkbox';input.value=id;input.addEventListener('change',()=>update({lines:[...$('line-options').querySelectorAll('input:checked')].map(i=>i.value)}));label.append(input,document.createTextNode(name));$('line-options').append(label);}
 for(const id of ['port','terminal','operator','counterpart','type','status','sort','from','to'])$(id).addEventListener('change',()=>update({[id]:$(id).value}));
 $('query').addEventListener('input',()=>update({q:$('query').value},true));
 $('include-removed').addEventListener('change',()=>update({include_removed:$('include-removed').checked?'1':''}));
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>update({tab:b.dataset.tab})));
 document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>update({period:b.dataset.period,...(b.dataset.period==='custom'?{from:state.from||day,to:state.to||day}:{from:'',to:''})})));
 $('our-lines').addEventListener('click',()=>update({lines:ours()?[]:[...data.our_lines]}));
 $('more').addEventListener('click',()=>{const open=$('advanced').hidden;$('advanced').hidden=!open;$('more').setAttribute('aria-expanded',open);});
 $('share').addEventListener('click',async()=>{const url=location.href;try{await navigator.clipboard.writeText(url);toast('Ссылка скопирована');}catch{openDialog('СОХРАНИТЬ ВИД');$('detail-content').append(el('h2','Ссылка на выбранный вид'));const input=el('input');input.value=url;input.readOnly=true;input.className='copy-field';$('detail-content').append(input,el('p','Скопируйте ссылку или добавьте страницу в закладки.'));input.select();}});
 $('sources-button').addEventListener('click',showSources);
 $('close-detail').addEventListener('click',()=>$('detail').close());
 $('detail').addEventListener('click',e=>{if(e.target===$('detail')){const b=$('detail').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right)$('detail').close();}});
 addEventListener('popstate',()=>{state=readState(location.search);render();});
 $('coverage').textContent=data.coverage;
 render();
}
function ours(){return state.lines.length===data.our_lines.length&&data.our_lines.every(x=>state.lines.includes(x));}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,2600);}
function render(){
 day=today();
 $('updated').textContent='Выгрузка: '+fullDate(data.generated_at);
 const age=(new Date()-new Date(data.generated_at))/3600000;
 const failed=data.sources.filter(s=>s.attempt_status==='failed'||s.parse_status==='failed'||!s.good_at);
 const old=data.sources.filter(s=>!s.good_at||(new Date()-new Date(s.source_published_on||s.good_at))/86400000>s.max_age_days);
 const notices=[];
 if(age>8)notices.push('Выгрузка не обновлялась более 8 часов. Показаны последние сохранённые данные.');
 if(failed.length)notices.push('Не все источники удалось обновить. Для них сохранены прежние сведения.');
 if(data.sources.some(s=>s.parse_status==='partial'))notices.push('Часть строк источников требует проверки и не включена в табло.');
 if(old.length)notices.push('Есть устаревшие источники — проверьте свежесть перед использованием.');
 $('warning').textContent=notices.join(' ');$('warning').hidden=!notices.length;
 for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-selected',b.dataset.tab===state.tab);
 $('rows').setAttribute('aria-labelledby',state.tab+'-tab');
 document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',b.dataset.period===state.period));
 $('dates').hidden=state.period!=='custom';$('our-lines').setAttribute('aria-pressed',ours());
 $('include-removed').checked=state.include_removed==='1';
 for(const id of ['port','terminal','operator','counterpart','type','status','sort','from','to']){
  const input=$(id);if(input.tagName==='SELECT'&&state[id]&&![...input.options].some(o=>o.value===state[id]))input.add(new Option(state[id]+' (нет данных)',state[id]));input.value=state[id];
 }
 if(document.activeElement!==$('query'))$('query').value=state.q;
 document.querySelectorAll('#line-options input').forEach(i=>i.checked=state.lines.includes(i.value));
 $('line-summary').textContent=!state.lines.length?'Все линии':ours()?'Наши линии':`Выбрано: ${state.lines.length}`;
 $('counterpart-label').firstChild.textContent=state.tab==='arrival'?'Откуда':'Куда';
 if(['terminal','operator','counterpart','type','status','include_removed'].some(k=>state[k])){$('advanced').hidden=false;$('more').setAttribute('aria-expanded','true');}
 $('date-error').textContent=dateRange(state,day)?'':'Укажите корректный период: начало не позже окончания.';
 const chips=$('chips');chips.replaceChildren();
 const labels={port:'Район',terminal:'Терминал',operator:'Оператор',counterpart:state.tab==='arrival'?'Откуда':'Куда',type:'Тип',status:'Статус',q:'Поиск'};
 for(const [k,label] of Object.entries(labels))if(state[k]){const b=el('button',`${label}: ${k==='status'?statusNames[state[k]]||state[k]:state[k]} ×`);b.addEventListener('click',()=>update({[k]:''}));chips.append(b);}
 for(const id of state.lines){const name=data.movements.find(r=>r.line_id===id)?.line_name||id;const b=el('button',name+' ×');b.addEventListener('click',()=>update({lines:state.lines.filter(x=>x!==id)}));chips.append(b);}
 if(state.include_removed){const b=el('button','Включая отсутствующие в расписании ×');b.addEventListener('click',()=>update({include_removed:''}));chips.append(b);}
 if(chips.children.length){const reset=el('button','Сбросить фильтры','reset');reset.addEventListener('click',resetFilters);chips.append(reset);}
 const rows=filterRows(data.movements,state,day);
 $('count').textContent=`${state.tab==='arrival'?'Прибытий':'Отправлений'}: ${rows.length} · ${new Set(rows.map(r=>r.vessel)).size} судов`;
 const target=$('rows');target.replaceChildren();
 if(!rows.length){const empty=el('div',undefined,'empty');empty.append(el('h2','По этим условиям записей нет'),el('p','Измените период или фильтры. Это не означает, что движения судов нет.'));const b=el('button','Ближайшие 14 дней · все линии');b.addEventListener('click',()=>update({...defaults,tab:state.tab,lines:[],period:'14'}));empty.append(b);target.append(empty);return;}
 const table=el('table'),head=el('thead'),hr=el('tr');
 const labelsHead=['ДАТА И ВРЕМЯ','СУДНО / РЕЙС',state.tab==='arrival'?'ОТКУДА':'КУДА',state.tab==='arrival'?'ПРИБЫТИЕ':'ОТПРАВЛЕНИЕ','ЛИНИЯ / ОПЕРАТОР','СТАТУС'];
 labelsHead.forEach(t=>{const th=el('th',t);th.scope='col';hr.append(th);});head.append(hr);table.append(head);
 const body=el('tbody');
 for(const r of rows){
  const tr=el('tr',undefined,'data-row');const cells=labelsHead.map(label=>{const td=el('td');td.dataset.label=label;tr.append(td);return td;});
  const moment=movementMoment(r),status=rowStatus(r,day);
  const date=el('span',moment.day.split('-').reverse().join('.'),'movement-date '+(moment.kind==='actual'?'actual':'planned'));
  cells[0].append(date);if(moment.clock)cells[0].append(el('span',moment.clock,'movement-clock '+(moment.kind==='actual'?'actual':'planned')));
  const vessel=el('button',r.vessel,'vessel');vessel.addEventListener('click',()=>showDetail(r));cells[1].append(vessel,el('span',r.voyage_number||'Рейс не указан','voyage'));
  place(cells[2],r.counterpart_port,r.counterpart_terminal);
  place(cells[3],r.port,r.terminal);
  cells[4].append(el('span',r.operator,'operator'),el('span',r.line_name.replace(r.operator+' · ',''),'sub'));
  cells[5].append(el('span',statusNames[status],'status '+status));
  body.append(tr);
 }
 table.append(body);target.append(table);
}
function resetFilters(){update({port:'',lines:[],q:'',terminal:'',operator:'',counterpart:'',type:'',status:'',include_removed:''});}
function openDialog(label){$('detail-label').textContent=label;$('detail-content').replaceChildren();if(!$('detail').open)$('detail').showModal();}
function showDetail(r){
 openDialog(state.tab==='arrival'?'ПРИБЫТИЕ':'ОТПРАВЛЕНИЕ');const root=$('detail-content');
 root.append(el('h2',r.vessel),el('p',`${r.voyage_number} · ${r.line_name}`));
 const dl=el('dl');
 const moment=movementMoment(r);
 for(const [k,v] of [['Место',r.port+(r.terminal?' · '+r.terminal:'')],[r.event_type==='arrival'?'Откуда':'Куда',(r.counterpart_port||'Не указано')+(r.counterpart_terminal?' · '+r.counterpart_terminal:'')],['Дата и время',timeText(moment.day,moment.clock)],['Часовой пояс',r.source_timezone||'Не подтверждён источником'],['IMO',r.imo||'Не указан'],['Проверено',fullDate(r.last_observed_at)],['Статус',statusNames[rowStatus(r,day)]]])dl.append(el('dt',k),el('dd',v));
 root.append(dl,el('h3','Источник'));
 if(!r.present_in_latest_version)root.append(el('p','Запись отсутствует в последнем расписании. Это не подтверждает отмену.','notice'));
 if(r.source_is_stale||(new Date()-new Date(r.last_observed_at))>8*86400000)root.append(el('p','Источник устарел. Уточните сведения у оператора.','notice'));
 if(r.source_url){const a=el('a',r.operator+' ↗');a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';root.append(a);}else root.append(el('p','Расписание предоставлено оператором Park Logistics. Публикация согласована.'));
 if(r.discrepancy)root.append(el('p',r.discrepancy,'notice'));
 root.append(el('h3','История опубликованных сведений'),el('p','Это изменения планового расписания, а не история фактического движения.'));
 for(const item of [...(r.history||[])].reverse()){const p=el('p',undefined,'history-item');p.append(el('strong',timeText(item.day,item.clock)),el('span',(item.terminal||'Терминал не указан')+' · известно с '+fullDate(item.known_at),'sub'));root.append(p);}
}
function showSources(){
 openDialog('ПОКРЫТИЕ И СВЕЖЕСТЬ');const root=$('detail-content');root.append(el('h2','Источники данных'),el('p',data.coverage));
 root.append(el('p','Выгрузка сайта: '+fullDate(data.generated_at)+'. Сбор расписаний и выгрузка выполняются независимо. Дата проверки не равна дате изменения расписания.'));
 for(const s of data.sources){const example=data.movements.find(r=>r.source_key===s.source_key);root.append(el('h3',example?.line_name||s.source_key),el('p','Последняя проверка: '+fullDate(s.attempted_at)),el('p','Последние пригодные данные: '+fullDate(s.good_at)));
  if(s.source_published_on)root.append(el('p','Дата обновления в источнике: '+shortDate(s.source_published_on)));
  if(s.attempt_status==='failed'||s.parse_status==='failed'||!s.good_at)root.append(el('p','Обновление не удалось. Прежние данные не удалены.','notice'));
  if(example?.source_url){const a=el('a','Открыть источник ↗');a.href=example.source_url;a.target='_blank';a.rel='noopener noreferrer';root.append(a);}
 }
}
async function load(){try{const response=await fetch('./data.json',{cache:'no-cache'});if(!response.ok)throw Error('HTTP');data=await response.json();if(data.schema_version!==1||!Array.isArray(data.movements))throw Error('Schema');initialize();}catch{$('updated').textContent='Данные временно недоступны';$('rows').replaceChildren(el('div','Не удалось загрузить расписание. Обновите страницу немного позже.','empty'));$('count').textContent='Ошибка загрузки';}}
load();
setInterval(()=>{if(data)render();},60000);
setInterval(async()=>{try{const r=await fetch('./data.json',{cache:'no-cache'});if(!r.ok)throw Error('HTTP');const next=await r.json();if(next.schema_version!==1||!Array.isArray(next.movements))throw Error('Schema');data=next;render();}catch{$('warning').textContent='Не удалось проверить обновления. Показаны последние загруженные данные.';$('warning').hidden=false;}},300000);
