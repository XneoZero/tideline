export function parseSocialTime(value,now=Date.now()){
 const s=String(value||'').trim().replace(/^(编辑于|发布于|最后编辑于)\s*/,'');if(!s)return null;
 if(/^\d{10,13}$/.test(s)){const n=Number(s)*(s.length===10?1000:1);return Number.isFinite(n)?new Date(n).toISOString():null;}
 const relative=s.match(/(\d+)\s*(秒|分钟|小时|天)前/);if(relative)return new Date(now-Number(relative[1])*({秒:1000,分钟:60000,小时:3600000,天:86400000}[relative[2]])).toISOString();
 if(s==='刚刚')return new Date(now).toISOString();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(now));
 const local=s.match(/^(今天|昨天)\s*(\d{2}:\d{2})(?::(\d{2}))?/);if(local){const base=local[1]==='昨天'?new Date(now-86400000):new Date(now);const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(base);return new Date(day+'T'+local[2]+':'+(local[3]||'00')+'+08:00').toISOString();}
 const full=s.match(/^(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?(?:[ T]+(\d{2}:\d{2})(?::(\d{2}))?)?/);
 if(full){const n=Date.parse(`${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')}T${full[4]||'00:00'}:${full[5]||'00'}+08:00`);if(!/[zZ]|[+-]\d\d:\d\d$/.test(s))return Number.isFinite(n)?new Date(n).toISOString():null;}
 const short=s.match(/^(\d{1,2})[-月/](\d{1,2})日?(?:\s|$)/);if(short){const d=new Date(`${today.slice(0,4)}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}T00:00:00+08:00`);if(d.getTime()>now+86400000)d.setUTCFullYear(d.getUTCFullYear()-1);return Number.isFinite(d.getTime())?d.toISOString():null;}
 if(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(s)){const n=Date.parse(s);return Number.isFinite(n)?new Date(n).toISOString():null;}
 return null;
}
