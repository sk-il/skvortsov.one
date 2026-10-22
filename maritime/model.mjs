export const defaults = {tab:'arrival',period:'today',port:'',lines:[],q:'',terminal:'',operator:'',counterpart:'',type:'',status:'',sort:'asc',from:'',to:''};
export const statusNames = {scheduled:'По расписанию',unconfirmed:'Факт не подтверждён',removed:'Нет в последней версии',stale:'Устаревший источник',conflict:'Есть расхождения'};
export function today(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kaliningrad',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addDays(day,n) {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function readState(search) {
 const p=new URLSearchParams(search),s={...defaults,lines:[]};
 for(const k of Object.keys(defaults)) if(p.has(k)&&k!=='lines')s[k]=p.get(k).slice(0,180);
 s.lines=[...new Set((p.get('lines')||'').split(',').filter(Boolean))].sort();
 if(!['arrival','departure'].includes(s.tab))s.tab='arrival';
 if(!['today','tomorrow','7','14','custom'].includes(s.period))s.period='today';
 if(!['asc','desc'].includes(s.sort))s.sort='asc';
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
 if(s.period==='custom') {
  const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  return valid(s.from)&&valid(s.to)&&s.from<=s.to?[s.from,s.to]:null;
 }
 const first=s.period==='tomorrow'?addDays(day,1):day;
 return [first,addDays(first,['7','14'].includes(s.period)?Number(s.period)-1:0)];
}
export function rowStatus(r,day,now=new Date()) {
 if(r.source_is_stale || (r.last_observed_at&&(now-new Date(r.last_observed_at))>8*86400000))return 'stale';
 if(!r.present_in_latest_version)return 'removed';
 if(r.discrepancy)return 'conflict';
 return r.scheduled_date<day?'unconfirmed':'scheduled';
}
export function filterRows(rows,s,day,now=new Date()) {
 const range=dateRange(s,day);if(!range)return [];
 const q=s.q.trim().toLocaleLowerCase('ru');
 return rows.filter(r=>r.event_type===s.tab&&r.scheduled_date>=range[0]&&r.scheduled_date<=range[1]
  &&(r.present_in_latest_version||r.scheduled_date<day||s.status==='removed')
  &&(!s.port||r.port===s.port)&&(!s.lines.length||s.lines.includes(r.line_id))
  &&(!s.terminal||r.terminal===s.terminal)&&(!s.operator||r.operator===s.operator)
  &&(!s.counterpart||r.counterpart_port===s.counterpart)&&(!s.type||r.vessel_type===s.type)
  &&(!s.status||rowStatus(r,day,now)===s.status)
  &&(!q||[r.vessel,r.voyage_number,r.imo].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(q)))
 .sort((a,b)=>{
  const dayOrder=a.scheduled_date.localeCompare(b.scheduled_date)*(s.sort==='desc'?-1:1);
  if(dayOrder)return dayOrder;
  return (a.scheduled_time||'99:99').localeCompare(b.scheduled_time||'99:99')||a.vessel.localeCompare(b.vessel,'ru')||a.movement_id.localeCompare(b.movement_id);
 });
}
