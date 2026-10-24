import {defaults,statusNames,today,readState,stateQuery,dateRange,filterRows,rowStatus,movementMoment,dateLabel,dateTimeLabel,voyageEndpoints,sourceIsStale} from './model.mjs?v=7';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const colors={'ПЛП':'#087fc0','ПКТ':'#288b58','КТСП':'#8652b9','КМТП':'#008ba2','БСК':'#ce7c00','БРОНКА':'#bd623b','СТ':'#526e88'};
let data,state=readState(location.search),day=today(),initialized=false,loadFailed=false;
const fullDate=v=>v?new Intl.DateTimeFormat('ru',{timeZone:'Europe/Kaliningrad',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'нет данных';
const shortDate=v=>v?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z')):'—';
const timeText=dateTimeLabel;
function cardButton(label,kind,id,cls='place-link'){
 const profile=data[kind]?.[id];const node=el(profile?'button':'span',label,cls);
 if(profile){node.title=(kind==='ports'?'О порте ':'О терминале ')+label;node.setAttribute('aria-label',node.title);node.addEventListener('click',()=>showLocation(kind,profile));}
 return node;
}
function place(cell,port,terminal,portId,terminalId){
 cell.append(cardButton(port||'—','ports',portId));
 if(terminal){const badge=cardButton(terminal,'terminals',terminalId,'badge terminal-link');badge.style.setProperty('--badge',colors[terminal]||'#526e88');cell.append(el('br'),badge);}
 else cell.append(el('span','терминал не указан','sub'));
}
function update(patch,replace=false){state={...state,...patch};const q=stateQuery(state);history[replace?'replaceState':'pushState'](null,'',location.pathname+(q?'?'+q:''));render();}
function selectOptions(id,field){const select=$(id);select.replaceChildren(select.options[0]);for(const value of [...new Set(data.movements.map(r=>r[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')))select.add(new Option(value,value));}
const operatorName=r=>r.operator_name||data.operators?.[r.operator]?.name||r.operator;
function refreshOptions(){
 for(const [id,field] of [['port','port'],['terminal','terminal'],['operator','operator'],['counterpart','counterpart_port'],['type','vessel_type']])selectOptions(id,field);
 const lines=new Map(data.movements.map(r=>[r.line_id,r.line_name]));
 // Include a selected but currently unavailable line instead of silently broadening a saved view.
 for(const id of state.lines)if(!lines.has(id))lines.set(id,id+' (нет данных)');
 $('line-options').replaceChildren();
 for(const [id,name] of [...lines].sort((a,b)=>a[1].localeCompare(b[1],'ru'))){const label=el('label');const input=el('input');input.type='checkbox';input.value=id;input.addEventListener('change',()=>update({lines:[...$('line-options').querySelectorAll('input:checked')].map(i=>i.value)}));label.append(input,document.createTextNode(name));$('line-options').append(label);}
}
function initialize(){
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
 render();
}
function ours(){return state.lines.length===data.our_lines.length&&data.our_lines.every(x=>state.lines.includes(x));}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,2600);}
function render(){
 day=today();
 $('updated').textContent='Выгрузка: '+fullDate(data.generated_at);
 const age=(new Date()-new Date(data.generated_at))/3600000;
 const failed=data.sources.filter(s=>s.attempt_status==='failed'||s.parse_status==='failed'||!s.good_at);
 const old=data.sources.filter(s=>sourceIsStale(s));
 const notices=[];
 if(loadFailed)notices.push('Не удалось проверить обновления. Показаны последние загруженные данные.');
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
 if(!rows.length){const empty=el('div',undefined,'empty');empty.append(el('h2','По этим условиям записей нет'),el('p','Измените период или фильтры.'));const b=el('button','Ближайшие 14 дней · все линии');b.addEventListener('click',()=>update({...defaults,tab:state.tab,lines:[],period:'14'}));empty.append(b);target.append(empty);return;}
 const table=el('table'),head=el('thead'),hr=el('tr');
 const labelsHead=['ДАТА И ВРЕМЯ','СУДНО / РЕЙС',state.tab==='arrival'?'ОТКУДА':'КУДА',state.tab==='arrival'?'ПРИБЫТИЕ':'ОТПРАВЛЕНИЕ','ОПЕРАТОР','СТАТУС'];
 labelsHead.forEach(t=>{const th=el('th',t);th.scope='col';hr.append(th);});head.append(hr);table.append(head);
 const body=el('tbody');
 for(const r of rows){
  const tr=el('tr',undefined,'data-row');const cells=labelsHead.map(label=>{const td=el('td');td.dataset.label=label;tr.append(td);return td;});
  const moment=movementMoment(r),status=rowStatus(r,day);
  const date=el('span',dateLabel(moment.day),'movement-date state-'+status);
  cells[0].append(date);
  if(moment.clock)cells[0].append(el('span',moment.clock,'movement-clock state-'+status));
  const vessel=el('button',r.vessel,'vessel');vessel.addEventListener('click',()=>showDetail(r));cells[1].append(vessel,el('span',r.voyage_number||'Рейс не указан','voyage'));
  place(cells[2],r.counterpart_port,r.counterpart_terminal,r.counterpart_port_id,r.counterpart_terminal_id);
  place(cells[3],r.port,r.terminal,r.port_id,r.terminal_id);
  const operator=el(data.operators?.[r.operator_key||r.operator]?'button':'span',operatorName(r),'operator');
  if(operator.tagName==='BUTTON'){operator.classList.add('operator-link');operator.title='Об операторе';operator.setAttribute('aria-label','Об операторе '+operatorName(r));operator.addEventListener('click',()=>showOperator(r));}
  cells[4].append(operator);
  cells[5].append(el('span',statusNames[status],'status '+status));
  body.append(tr);
 }
 table.append(body);target.append(table);
}
function resetFilters(){update({port:'',lines:[],q:'',terminal:'',operator:'',counterpart:'',type:'',status:'',include_removed:''});}
function openDialog(label){$('detail-label').textContent=label;$('detail-content').replaceChildren();if(!$('detail').open)$('detail').showModal();$('detail').scrollTop=0;$('close-detail').focus({preventScroll:true});}
function publicLink(label,url){
 try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)return el('span',label);}catch{return el('span',label);}
 const a=el('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function showOperator(r){
 const profile=data.operators?.[r.operator_key||r.operator];if(!profile)return;
 openDialog('ОПЕРАТОР');const root=$('detail-content');
 root.append(el('h2',profile.name),el('p',profile.description,'operator-description'));
 if(profile.website)root.append(publicLink('Сайт оператора',profile.website));
 const dl=el('dl');
 for(const [label,value] of [['Email',profile.email],['Телефон',profile.phone]])if(value){
  const dd=el('dd'),link=el('a',value);link.href=label==='Email'?'mailto:'+encodeURIComponent(value):'tel:'+value.replace(/[^+\d]/g,'');dd.append(link);dl.append(el('dt',label),dd);
 }
 root.append(dl,el('h3','Линии на табло'));
 const lines=new Map(data.movements.filter(x=>(x.operator_key||x.operator)===profile.filter_key).map(x=>[x.line_id,x.line_name]));
 const list=el('ul');for(const name of lines.values())list.append(el('li',name));root.append(list);
 const view=el('button','Показать рейсы оператора','operator-view');view.addEventListener('click',()=>{$('detail').close();update({operator:r.operator,lines:[]});});root.append(view);
 if(profile.companies?.length){
  const details=el('details',undefined,'operator-companies');details.append(el('summary','Связанные юридические лица'));
  for(const c of profile.companies)details.append(el('p',c.name+(c.inn?' · ИНН '+c.inn:'')));
  root.append(details);
 }
 const evidence=el('details',undefined,'operator-sources');evidence.append(el('summary','Источники и дата проверки'));
 evidence.append(el('p','Карточка проверена: '+fullDate(profile.checked_at)));
 for(const s of profile.sources||[]){const p=el('p');p.append(publicLink(s.label,s.url));evidence.append(p);}
 root.append(evidence);
}
const vesselTypes={container:'Контейнеровоз',general_cargo:'Сухогруз',ro_ro_cargo:'Грузовое судно Ro-Ro',ro_ro_passenger:'Грузопассажирский паром'};
const number=v=>v===null||v===undefined?null:new Intl.NumberFormat('ru',{maximumFractionDigits:2}).format(Number(v));
function country(code){if(!code)return null;try{return new Intl.DisplayNames('ru',{type:'region'}).of(code);}catch{return code;}}
function facts(root,items){const dl=el('dl',undefined,'card-facts');for(const [label,value] of items)if(value!==null&&value!==undefined&&value!==''){const dd=el('dd');dd.append(value instanceof Node?value:document.createTextNode(String(value)));dl.append(el('dt',label),dd);}if(dl.children.length)root.append(dl);}
function checked(root,at){if(at)root.append(el('p','Карточка проверена '+shortDate(at.slice(0,10)),'card-checked'));}
function showLocation(kind,p){
 const terminal=kind==='terminals';openDialog(terminal?'ТЕРМИНАЛ':'ПОРТ');const root=$('detail-content');
 root.append(el('h2',terminal?p.full_name||p.name:p.name));
 if(terminal&&p.full_name&&p.name!==p.full_name)root.append(el('p',p.name,'card-subtitle'));
 if(!terminal&&p.name_international)root.append(el('p',p.name_international,'card-subtitle'));
 const parent=data.ports?.[p.port_id];
 facts(root,[['Порт',parent?cardButton(parent.name,'ports',parent.id):null],['Страна',!terminal?country(p.country_code):null],
  ['Адрес',p.address],['UN/LOCODE',p.unlocode],['SMDG',p.smdg_terminal_code?`${p.smdg_port_unlocode} · ${p.smdg_terminal_code}`:null]]);
 const links=el('div',undefined,'card-links');if(p.website)links.append(publicLink('Сайт терминала',p.website));
 const lat=Number(p.latitude),lon=Number(p.longitude);
 if(p.latitude!=null&&p.longitude!=null&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
  links.append(publicLink('Показать на карте',`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`));
 }
 if(links.children.length)root.append(links);
 if(!terminal){const list=Object.values(data.terminals||{}).filter(t=>t.port_id===p.id);if(list.length){root.append(el('h3','Терминалы'));const items=el('div',undefined,'card-list');for(const t of list)items.append(cardButton(t.full_name||t.name,'terminals',t.id));root.append(items);}}
 checked(root,p.checked_at);
}
function showDetail(r){
 const p=data.vessels?.[r.vessel_id]||{name:r.vessel,imo:r.imo};
 openDialog('СУДНО');const root=$('detail-content');root.append(el('h2',p.name));
 const subtitle=[p.name_international&&p.name_international.toLocaleLowerCase()!==p.name.toLocaleLowerCase()?p.name_international:null,vesselTypes[p.vessel_type]||p.vessel_type].filter(Boolean).join(' · ');
 if(subtitle)root.append(el('p',subtitle,'card-subtitle'));
 const links=el('div',undefined,'card-links');
 for(const [label,url] of [['MarineTraffic',p.marinetraffic_url],['VesselFinder',p.vesselfinder_url]])if(url)links.append(publicLink(label,url));
 if(links.children.length)root.append(links);
 facts(root,[['IMO',p.imo],['MMSI',p.mmsi],['Флаг',country(p.flag_country_code)],['Позывной',p.call_sign],['Год постройки',p.built_year],
  ['Длина',p.length_overall_m?number(p.length_overall_m)+' м':null],['Ширина',p.beam_m?number(p.beam_m)+' м':null],
  ['Дедвейт',p.deadweight_t?number(p.deadweight_t)+' т':null],['Валовая вместимость',p.gross_tonnage?number(p.gross_tonnage)+' GT':null]]);
 checked(root,p.checked_at);
 const section=el('section',undefined,'voyage-card');section.append(el('h3',r.voyage_number?'Рейс '+r.voyage_number:'Выбранное движение'));
 const endpoints=voyageEndpoints(r),route={};
 for(const [key,endpoint] of Object.entries(endpoints)){
  const block=el('div');block.append(el('span',dateTimeLabel(endpoint.day,endpoint.clock),'route-moment'));
  place(block,endpoint.port,endpoint.terminal,endpoint.port_id,endpoint.terminal_id);route[key]=block;
 }
 const op=el(data.operators?.[r.operator_key||r.operator]?'button':'span',operatorName(r),'operator-link');if(op.tagName==='BUTTON')op.addEventListener('click',()=>showOperator(r));
 facts(section,[['Оператор',op],['Отправление',route.departure],['Прибытие',route.arrival],['Статус',statusNames[rowStatus(r,day)]]]);
 if(r.source_url)section.append(publicLink('Расписание источника',r.source_url));else section.append(el('p','Расписание предоставлено Park Logistics.'));
 section.append(el('p','Проверено '+fullDate(r.last_observed_at),'card-checked'));
 if(!r.present_in_latest_version)section.append(el('p','Запись отсутствует в последнем расписании.','notice'));
 if(r.source_is_stale||sourceIsStale(data.sources.find(s=>s.source_key===r.source_key)||{good_at:r.last_observed_at,max_age_days:8}))section.append(el('p','Источник устарел. Уточните сведения у оператора.','notice'));
 if(r.discrepancy)section.append(el('p',r.discrepancy,'notice'));
 if(r.history?.length){const details=el('details',undefined,'card-history');details.append(el('summary','История расписания этого рейса'));
  for(const item of [...r.history].reverse()){const text=el('p',undefined,'history-item');text.append(el('strong',timeText(item.day,item.clock)),el('span',(item.terminal||'Терминал не указан')+' · '+fullDate(item.known_at),'sub'));details.append(text);}section.append(details);
 }
 root.append(section);
}
function showSources(){
 openDialog('ПОКРЫТИЕ И СВЕЖЕСТЬ');const root=$('detail-content');root.append(el('h2','Источники данных'));
 root.append(el('p','Выгрузка сайта: '+fullDate(data.generated_at)));
 for(const s of data.sources){const example=data.movements.find(r=>r.source_key===s.source_key);root.append(el('h3',example?.line_name||s.source_key),el('p','Последняя проверка: '+fullDate(s.attempted_at)),el('p','Последние пригодные данные: '+fullDate(s.good_at)));
  if(s.source_published_on)root.append(el('p','Дата обновления в источнике: '+shortDate(s.source_published_on)));
  if(s.attempt_status==='failed'||s.parse_status==='failed'||!s.good_at)root.append(el('p','Обновление не удалось. Прежние данные не удалены.','notice'));
  if(example?.source_url){const a=el('a','Открыть источник ↗');a.href=example.source_url;a.target='_blank';a.rel='noopener noreferrer';root.append(a);}
 }
}
async function load(){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch('./data.json',{cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw Error('HTTP');
  const next=await response.json();
  if(next.schema_version!==1||!Array.isArray(next.movements)||!Array.isArray(next.sources)||!Array.isArray(next.our_lines))throw Error('Schema');
  data=next;loadFailed=false;refreshOptions();
  if(!initialized){initialize();initialized=true;}else render();
 }catch{
  loadFailed=true;
  if(data)render();
  else{$('updated').textContent='Данные временно недоступны';$('rows').replaceChildren(el('div','Не удалось загрузить расписание. Обновите страницу немного позже.','empty'));$('count').textContent='Ошибка загрузки';}
 }finally{clearTimeout(timeout);}
}
load();
setInterval(()=>{if(data)render();},60000);
setInterval(load,300000);
