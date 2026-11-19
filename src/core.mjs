import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
export const hash = text => createHash('sha256').update(text).digest('hex');
export function canonical(url) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('仅支持 HTTP(S) 原文地址');
  for (const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/.test(k)) u.searchParams.delete(k);
  u.hash = ''; u.searchParams.sort(); return u.href;
}
const normalizeSource = s => ({...s, enabled: s.enabled !== false});
export function createStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS model_calls(id TEXT PRIMARY KEY,day TEXT NOT NULL,itemId TEXT NOT NULL); CREATE TABLE IF NOT EXISTS briefs(day TEXT PRIMARY KEY,body TEXT NOT NULL);`);
  const all = () => db.prepare('SELECT body FROM items ORDER BY rowid DESC').all().map(r=>JSON.parse(r.body));
  return { db, all,memoryOnly:path===':memory:',
    getState: (key,fallback=null)=>{const row=db.prepare('SELECT body FROM state WHERE key=?').get(key);return row?JSON.parse(row.body):fallback;},
    setState: (key,value)=>db.prepare('INSERT OR REPLACE INTO state VALUES (?,?)').run(key,JSON.stringify(value)),
    jobs:()=>db.prepare('SELECT body FROM jobs ORDER BY rowid DESC LIMIT 100').all().map(r=>JSON.parse(r.body)),
    saveJob:j=>db.prepare('INSERT OR REPLACE INTO jobs VALUES (?,?)').run(j.id,JSON.stringify(j)),
    callCount:day=>db.prepare('SELECT count(*) AS n FROM model_calls WHERE day=?').get(day).n,
    reserveCall(day,limit,itemId){db.exec('BEGIN IMMEDIATE');try{if(db.prepare('SELECT count(*) AS n FROM model_calls WHERE day=?').get(day).n>=limit){db.exec('COMMIT');return null;}const id=randomUUID();db.prepare('INSERT INTO model_calls VALUES (?,?,?)').run(id,day,itemId);db.exec('COMMIT');return id;}catch(e){db.exec('ROLLBACK');throw e;}},
    briefs:()=>db.prepare('SELECT body FROM briefs ORDER BY day DESC LIMIT 60').all().map(r=>JSON.parse(r.body)),
    saveBrief:b=>db.prepare('INSERT OR REPLACE INTO briefs VALUES (?,?)').run(b.day,JSON.stringify(b)),
    hasUrl: url=>Boolean(db.prepare('SELECT id FROM items WHERE fingerprint=?').get(hash(canonical(url)))),
    sources: () => db.prepare('SELECT body FROM sources ORDER BY rowid').all().map(r=>normalizeSource(JSON.parse(r.body))),
    saveSource: s => db.prepare('INSERT OR REPLACE INTO sources VALUES (?,?)').run(s.id, JSON.stringify(normalizeSource(s))),
    patchSource(id, changes) {
      const current = db.prepare('SELECT body FROM sources WHERE id=?').get(id);
      if (!current) return null;
      const source = normalizeSource({...JSON.parse(current.body), ...changes});
      db.prepare('UPDATE sources SET body=? WHERE id=?').run(JSON.stringify(source), id);
      return source;
    },
    runs: () => db.prepare('SELECT body FROM runs ORDER BY rowid DESC LIMIT 30').all().map(r=>JSON.parse(r.body)),
    saveRun: r => db.prepare('INSERT OR REPLACE INTO runs VALUES (?,?)').run(r.id,JSON.stringify(r)),
    patch(id, changes) { const item=all().find(i=>i.id===id); if (!item) return null; Object.assign(item,changes); db.prepare('UPDATE items SET body=? WHERE id=?').run(JSON.stringify(item),id); return item; },
    ingest(rows, source, runId, checkpoint) {
      let added=0, duplicates=0;
      db.exec('BEGIN');
      try {
      if(checkpoint){
        const current=db.prepare('SELECT body FROM state WHERE key=?').get(checkpoint.key);
        if((current?.body??'null')!==JSON.stringify(checkpoint.previous))throw new Error('文档快照已被其他采集更新，请重试');
      }
      for(const row of rows) {
        if(typeof row.title!=='string'||!row.title.trim()||row.title.length>1000) throw new Error('标题不能为空且不超过 1000 字');
        const url=canonical(row.url), text=String(row.content||row.summary||'').slice(0,20000);
        const publishedAt=row.publishedAt ? new Date(row.publishedAt).toISOString() : null;
        const revision=source.type==='deepseek-docs'?row.acquisition?.documentRevision:null;
        const fingerprint=hash(revision?JSON.stringify([source.id,url,revision]):url);
        const openUrl=row.openUrl?new URL(row.openUrl).href:url;canonical(openUrl);
        if(db.prepare('SELECT id FROM items WHERE fingerprint=?').get(fingerprint)){duplicates++;continue;}
        if(row.tags!==undefined&&!Array.isArray(row.tags))throw new Error('tags 必须是数组');
        const tags=[...new Set((row.tags||[]).filter(t=>typeof t==='string').slice(0,12))];
        const item={id:randomUUID(),title:row.title.trim(),url,content:text,summary:text.slice(0,220),sourceId:source.id,sourceName:source.name,tags,publishedAt,collectedAt:new Date().toISOString(),demo:source.type==='demo',read:false,saved:false,
          platform:['x','bilibili','xiaohongshu'].includes(source.type)?source.type:null,accountId:source.accountId||source.handle||null,manufacturer:source.manufacturer||'',accountIdentity:source.identityStatus||'unverified',openUrl,
          acquisition:row.acquisition||null,authorName:String(row.authorName||source.authorName||'').slice(0,160),authorHandle:String(row.authorHandle||source.handle||'').slice(0,160),sourceKind:row.sourceKind||source.kind||'media',originalSourceName:row.originalSourceName||source.name,importedInterpretation:row.importedInterpretation||null,analysis:{status:'pending'},
          score:Math.min(100,40+tags.length*8+(/AI|模型|智能体|芯片|发布/i.test(row.title)?20:0)),scoreReason:'规则评分：基础 40 + 每标签 8 + 关键字 20；非事实可信度',
          evidence:{runId,sourceUrl:revision?url:source.url||url,contentHash:hash(text),kind:source.type==='demo'?'fixture':'observed',limitations:revision?['材料为官方文档正文的变更摘录，时间为采集发现时间']:['原始摘要为正文截取；模型解读另见 analysis，导入解读另见 importedInterpretation','仅按规范化 URL 去重，未启用语义去重']}};
        db.prepare('INSERT INTO items VALUES (?,?,?)').run(item.id,fingerprint,JSON.stringify(item)); added++;
      }
      if(checkpoint)db.prepare('INSERT OR REPLACE INTO state VALUES (?,?)').run(checkpoint.key,JSON.stringify(checkpoint.value));
      db.exec('COMMIT'); } catch(e){db.exec('ROLLBACK');throw e;}
      return {added,duplicates};
    }
  };
}
