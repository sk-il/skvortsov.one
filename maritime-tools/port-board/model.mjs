export const defaults = {tab:'arrival',period:'today',port:'',lines:[],q:'',terminal:'',operator:'',counterpart:'',type:'',status:'',sort:'asc',from:'',to:'',include_removed:''};
export const statusNames = {scheduled:'Запланировано',in_transit:'В пути',arrived:'Прибыло',departed:'Отправилось',unconfirmed:'Не подтверждено'};
export function today(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addDays(day,n) {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekday(day) {return ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'][new Date(day+'T12:00:00Z').getUTCDay()];}
export function dateLabel(day) {return day?day.split('-').reverse().join('.')+' · '+weekday(day):'Дата не указана';}
export function dateTimeLabel(day,clock) {return dateLabel(day)+(day&&clock?' · '+clock.slice(0,5):'');}
export function voyageEndpoints(r) {
 const own={port:r.port,terminal:r.terminal,port_id:r.port_id,terminal_id:r.terminal_id,...movementMoment(r)};
 const other={port:r.counterpart_port,terminal:r.counterpart_terminal,port_id:r.counterpart_port_id,terminal_id:r.counterpart_terminal_id,
  day:r.counterpart_display_date||r.counterpart_scheduled_date||null,clock:(Object.hasOwn(r,'counterpart_display_time')?r.counterpart_display_time:r.counterpart_scheduled_time)?.slice(0,5)||null};
 return r.event_type==='arrival'?{departure:other,arrival:own}:{departure:own,arrival:other};
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
