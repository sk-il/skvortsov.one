export const defaults = {tab:'arrival',period:'today',port:'',lines:[],q:'',terminal:'',operator:'',counterpart:'',type:'',status:'',sort:'asc',from:'',to:'',include_removed:''};
export const statusNames = {scheduled:'Запланировано',in_transit:'В пути',arrived:'Прибыло',departed:'Отправилось',unconfirmed:'Не подтверждено',awaiting_departure:'Ожидает отправления'};
export function today(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function sourceIsStale(s,now=new Date()) {
 if(s.stale_after)return now>=new Date(s.stale_after);
 if(typeof s.stale==='boolean')return s.stale;
 if(!s.good_at)return true;
 // Compatibility with older JSON: same calendar rule as PostgreSQL and the bot.
 const local=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Belgrade',year:'numeric',month:'2-digit',day:'2-digit'}).format(v);
 const observed=local(new Date(s.good_at));
 const basis=s.source_published_on&&s.source_published_on<observed?s.source_published_on:observed;
 return (Date.parse(local(now)+'T12:00:00Z')-Date.parse(basis+'T12:00:00Z'))/86400000>s.max_age_days;
}
export function addDays(day,n) {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekday(day) {return ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'][new Date(day+'T12:00:00Z').getUTCDay()];}
function validDay(day) {
 return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)
  &&!Number.isNaN(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
}
export function formatDate(day,{withWeekday=false,empty='Дата не указана'}={}) {
 return validDay(day)?day.split('-').reverse().join('.')+(withWeekday?' · '+weekday(day):''):empty;
}
export function formatTimestamp(value,{dateOnly=false}={}) {
 if(!value)return '—';
 if(validDay(value))return formatDate(value);
 const at=new Date(value);if(Number.isNaN(at.getTime()))return '—';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kaliningrad',
  day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
 const date=`${parts.day}.${parts.month}.${parts.year}`;
 return date+(dateOnly?'':` ${parts.hour}:${parts.minute}`);
}
export function parseDisplayDate(value) {
 let text=String(value||'').trim();if(!text)return '';
 if(/^\d{8}$/.test(text))text=text.slice(0,2)+'.'+text.slice(2,4)+'.'+text.slice(4);
 const match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
 const day=match&&`${match[3]}-${match[2]}-${match[1]}`;
 return validDay(day)?day:null;
}
export function dateLabel(day) {return formatDate(day,{withWeekday:true});}
export function dateTimeLabel(day,clock) {
 const time=typeof clock==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(clock)?clock.slice(0,5):null;
 return dateLabel(day)+(validDay(day)&&time?' · '+time:'');
}
export function sourceNotices(source,now=new Date()) {
 const messages=[];
 if(!source.good_at)messages.push('Нет пригодного расписания.');
 if(source.attempt_status==='failed'||source.parse_status==='failed')messages.push(source.good_at
  ?'Обновление не удалось. Используется предыдущая версия.':'Не удалось получить расписание.');
 if(source.parse_status==='partial')messages.push('Часть строк не включена в табло.');
 if(source.good_at&&sourceIsStale(source,now))messages.push('Расписание требует обновления.');
 return messages;
}
export function boardNotices(data,{now=new Date(),rows=[],rangeEnd=today(now)}={}) {
 const messages=[],stamp=new Date(data.generated_at);
 if(!data.generated_at||Number.isNaN(stamp.getTime())||now-stamp>8*3600000)messages.push('Обновление табло задерживается.');
 const keys=new Set(rows.map(r=>r.source_key));
 const sources=keys.size?data.sources.filter(s=>keys.has(s.source_key)):data.sources;
 if(rangeEnd>=today(now)&&sources.length&&sources.every(s=>!s.good_at))messages.push('Нет пригодных расписаний для выбранного вида.');
 return messages;
}
export function voyageEndpoints(r) {
 const own={port:r.port,terminal:r.terminal,port_id:r.port_id,terminal_id:r.terminal_id,...movementMoment(r)};
 const other={port:r.counterpart_port,terminal:r.counterpart_terminal,port_id:r.counterpart_port_id,terminal_id:r.counterpart_terminal_id,
  day:r.counterpart_display_date||r.counterpart_scheduled_date||null,clock:(Object.hasOwn(r,'counterpart_display_time')?r.counterpart_display_time:r.counterpart_scheduled_time)?.slice(0,5)||null};
 return r.event_type==='arrival'?{departure:other,arrival:own}:{departure:own,arrival:other};
}
export function neighboringVoyages(rows,selected,day) {
 const sameVessel=r=>{
  if(r.vessel_id!=null&&selected.vessel_id!=null)return String(r.vessel_id)===String(selected.vessel_id);
  if(r.imo&&selected.imo)return String(r.imo)===String(selected.imo);
  return Boolean(r.vessel&&selected.vessel)&&r.vessel.trim().toLocaleLowerCase('ru')===selected.vessel.trim().toLocaleLowerCase('ru');
 };
 const records=new Map();
 for(const r of [...rows,selected]){
  if(!sameVessel(r))continue;
  if(r.movement_id!==selected.movement_id&&!r.present_in_latest_version
   &&!(r.scheduled_date<day)&&movementMoment(r).kind!=='actual'&&r.event_confirmed!==true)continue;
  // A call can contain both an inbound and an outbound voyage: never deduplicate by call ID or voyage number.
  records.set(r.movement_id,r);
 }
 const date=r=>{const e=voyageEndpoints(r);return e.departure.day||e.arrival.day||'9999-12-31';};
 const ordered=[...records.values()].sort((a,b)=>date(a).localeCompare(date(b))||String(a.movement_id).localeCompare(String(b.movement_id)));
 const index=ordered.findIndex(r=>r.movement_id===selected.movement_id);
 return ordered.slice(Math.max(0,index-2),index+3);
}
export function readState(search) {
 const p=new URLSearchParams(search),s={...defaults,lines:[]};
 for(const k of Object.keys(defaults)) if(p.has(k)&&k!=='lines')s[k]=p.get(k).slice(0,180);
 s.lines=[...new Set((p.get('lines')||'').split(',').filter(Boolean))].sort();
 if(!['arrival','departure'].includes(s.tab))s.tab='arrival';
 if(!['today','tomorrow','week','month','7','14','custom'].includes(s.period))s.period='today';
 if(!['asc','desc'].includes(s.sort))s.sort='asc';
 if(s.status==='removed')s.include_removed='1';
 if(!Object.hasOwn(statusNames,s.status))s.status='';
 s.include_removed=s.include_removed==='1'?'1':'';
 return s;
}
export function stateQuery(s) {
 const p=new URLSearchParams();
 for(const k of Object.keys(defaults)) {
  const v=k==='lines'?[...s.lines].sort().join(','):s[k];
  if(v&&(k==='lines'||v!==defaults[k]))p.set(k,v);
 }
 return p.toString();
}
export function dateRange(s,day) {
 if(s.period==='week') {const start=addDays(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));return [start,addDays(start,6)];}
 if(s.period==='month') {const end=new Date(day+'T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1,0);return [day.slice(0,7)+'-01',end.toISOString().slice(0,10)];}
 if(s.period==='custom') {
  const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  return valid(s.from)&&valid(s.to)&&s.from<=s.to?[s.from,s.to]:null;
 }
 const first=s.period==='tomorrow'?addDays(day,1):day;
 return [first,addDays(first,['7','14'].includes(s.period)?Number(s.period)-1:0)];
}
// A passed plan is never evidence of departure or arrival.
export function movementMoment(r) {
 if(/^\d{4}-\d{2}-\d{2}$/.test(r.display_date||''))return {day:r.display_date,clock:r.display_time?.slice(0,5)||null,kind:'selected'};
 for(const [kind,value] of [['actual',r.actual_at],['estimated',r.estimated_at]]) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)||Number.isNaN(Date.parse(value)))continue;
  if(r.source_timezone){
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone:r.source_timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
   const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
   return {day:`${p.year}-${p.month}-${p.day}`,clock:`${p.hour}:${p.minute}`,kind};
  }
  return {day:value.slice(0,10),clock:value.slice(11,16),kind};
 }
 return {day:r.scheduled_date,clock:r.scheduled_time?.slice(0,5)||null,kind:'scheduled'};
}
export function rowStatus(r,day) {
 if(r.event_confirmed===true)return r.event_type==='arrival'?'arrived':'departed';
 if(Object.hasOwn(statusNames,r.movement_status)&&(r.movement_status!=='in_transit'||r.event_type==='arrival'))return r.movement_status;
 if(movementMoment(r).kind==='actual')return r.event_type==='arrival'?'arrived':'departed';
 if(r.event_type==='arrival'&&r.movement_status==='in_transit')return 'in_transit';
 return movementMoment(r).day<day?'unconfirmed':'scheduled';
}
export function filterRows(rows,s,day,now=new Date()) {
 const range=dateRange(s,day);if(!range)return [];
 const q=s.q.trim().toLocaleLowerCase('ru');
 return rows.filter(r=>r.event_type===s.tab&&movementMoment(r).day>=range[0]&&movementMoment(r).day<=range[1]
  &&(r.present_in_latest_version||r.scheduled_date<day||s.include_removed==='1'||movementMoment(r).kind==='actual'||r.event_confirmed===true)
  &&(!s.port||r.port===s.port)&&(!s.lines.length||s.lines.includes(r.line_id))
  &&(!s.terminal||r.terminal===s.terminal)&&(!s.operator||r.operator===s.operator)
  &&(!s.counterpart||r.counterpart_port===s.counterpart)&&(!s.type||r.vessel_type===s.type)
  &&(!s.status||rowStatus(r,day,now)===s.status)
  &&(!q||[r.vessel,r.voyage_number,r.imo].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(q)))
 .sort((a,b)=>{
  const am=movementMoment(a),bm=movementMoment(b);
  const dayOrder=am.day.localeCompare(bm.day)*(s.sort==='desc'?-1:1);
  if(dayOrder)return dayOrder;
  return (am.clock||'').localeCompare(bm.clock||'')||a.vessel.localeCompare(b.vessel,'ru')||a.movement_id.localeCompare(b.movement_id);
 });
}
