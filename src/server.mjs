import express from 'express';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from './core.mjs';
import { registerAnalysisRoutes } from './analysis-routes.mjs';
import {builtInSources} from './news-sources.mjs';
import {createCollectionService} from './collection-service.mjs';
import {createAnalysisService} from './analysis-service.mjs';
import {createScheduler} from './scheduler.mjs';
import {buildDailyBrief} from './briefs.mjs';
import {xStatus,openXLogin,xPeople,normalizeXSource} from './x-collector.mjs';
import {registerAccountRoutes} from './account-routes.mjs';
import {registerAstrBotRoutes} from './astrbot-routes.mjs';
const readEnabled=(value,fallback=true)=>{
 if(value===undefined||value===null||value==='')return fallback;
 if(value===true||value===1||['1','true','on'].includes(value))return true;
 if(value===false||value===0||['0','false','off'].includes(value))return false;
 return fallback;
};
export function createApp(store) {
 const app=express(); app.disable('x-powered-by');
 const collection=createCollectionService(store),analysis=createAnalysisService(store),scheduler=createScheduler(store,{collection,analysis});app.locals.scheduler=scheduler;
 app.use((req,res,next)=>{if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return res.status(403).json({error:'不允许跨域访问'});next();});
 app.use(express.json({limit:'2mb'}));
 app.use('/api/v1/whale',(req,res,next)=>{const token=process.env.FEED_API_TOKEN;if(!token)return res.status(503).json({error:'请配置 FEED_API_TOKEN 后启用 Whale 接口'});if(req.headers.authorization!==`Bearer ${token}`)return res.status(401).json({error:'令牌无效'});next();});
 app.get('/api/v1/health',(_,res)=>res.json({status:'ok',application:'tideline-information-feeding',version:'0.6.0'}));
 registerAstrBotRoutes(app,store);
 registerAccountRoutes(app,store);
 app.get('/api/v1/source-presets',(_,res)=>res.json(builtInSources));
 app.post('/api/v1/source-presets/install',(_,res)=>{const existing=store.sources();const added=[];for(const s of builtInSources){if(existing.some(x=>x.id===s.id))continue;store.saveSource(s);added.push(s.id);}res.json({added});});
 registerAnalysisRoutes(app,store,{service:analysis});
 app.get('/api/v1/x/status',(_,res)=>res.json(xStatus()));
 app.post('/api/v1/x/login',async(_,res)=>res.json(await openXLogin()));
 app.post('/api/v1/x/people/install',(_,res)=>{const existing=store.sources();const added=[];for(const person of xPeople){if(existing.some(s=>s.id===person.id))continue;store.saveSource(person);added.push(person.id);}res.json({added});});
 app.get('/api/v1/sources',(_,res)=>res.json(store.sources()));
 app.post('/api/v1/sources',(req,res)=>{const {name,type,url,kind,authorName,handle}=req.body;if(typeof name!=='string'||!name.trim()||!['rss','json','public-feed','x'].includes(type))return res.status(400).json({error:'请输入名称和支持的来源类型'});try{if(!['http:','https:'].includes(new URL(url).protocol))throw new Error();}catch{return res.status(400).json({error:'需要 HTTP(S) URL'});}let s={id:randomUUID(),name:name.slice(0,160),type,url,kind:['official','media','x_person'].includes(kind)?kind:'media',authorName:String(authorName||'').slice(0,160),handle:String(handle||'').slice(0,160),enabled:readEnabled(req.body.enabled,true)};if(type==='x')s=normalizeXSource(s);store.saveSource(s);res.status(201).json(s);});
 app.patch('/api/v1/sources/:id',(req,res)=>{
  if(typeof req.body.enabled!=='boolean')return res.status(400).json({error:'enabled 必须为布尔值'});
  if(req.params.id==='ai-information')return res.status(400).json({error:'导入记录来源不参与采集开关'});
  const source=store.patchSource(req.params.id,{enabled:req.body.enabled});
  if(!source)return res.status(404).json({error:'来源不存在'});
  res.json(source);
 });
 app.post('/api/v1/collect',async(req,res,next)=>{try{res.json(await collection.run(req.body.sourceId));}catch(e){next(e);}});
 app.get('/api/v1/scheduler',(_,res)=>res.json(scheduler.status()));
 app.post('/api/v1/scheduler/run',(_,res)=>{const job=scheduler.enqueue();res.status(202).json(job);scheduler.tick().catch(e=>store.setState('schedulerError',e.message));});
 app.patch('/api/v1/scheduler',(req,res)=>res.json(scheduler.configure(req.body)));
 app.get('/api/v1/briefs',(_,res)=>res.json(store.briefs()));
 app.post('/api/v1/briefs/generate',(req,res)=>res.json(buildDailyBrief(store,req.body.day)));
 app.get('/api/v1/runs',(_,res)=>res.json(store.runs()));
 const query=req=>store.all().filter(i=>(!req.query.q||`${i.title} ${i.content} ${i.analysis?.zhTitle||''} ${i.analysis?.zhSummary||''}`.toLowerCase().includes(String(req.query.q).toLowerCase()))&&(!req.query.tag||(i.analysis?.tags||i.tags).includes(req.query.tag))&&(!req.query.source||i.sourceId===req.query.source)&&(!req.query.platform||i.platform===req.query.platform)&&(!req.query.manufacturer||i.manufacturer===req.query.manufacturer)&&(!req.query.kind||i.sourceKind===req.query.kind)&&(req.query.retained!=='true'||i.analysis?.retained===true)&&(req.query.saved!=='true'||i.saved));
 app.get('/api/v1/items',(req,res)=>res.json(query(req)));
 app.patch('/api/v1/items/:id',(req,res)=>{const changes={};for(const key of ['read','saved'])if(typeof req.body[key]==='boolean')changes[key]=req.body[key];const item=store.patch(req.params.id,changes);res.status(item?200:404).json(item||{error:'条目不存在'});});
 app.get('/api/v1/whale/feed',(req,res)=>res.json({schemaVersion:'1.0',items:query(req).filter(i=>req.query.includeDemo==='true'||!i.demo).slice(0,100)}));
 app.post('/api/v1/whale/ingest',(req,res)=>{if(!Array.isArray(req.body.items)||req.body.items.length>100)return res.status(400).json({error:'items 必须为最多100条的数组'});res.json(store.ingest(req.body.items,{id:'whale',name:'Whale Core',type:'json'},randomUUID()));});
 app.post('/api/v1/whale/ack',(req,res)=>{if(!Array.isArray(req.body.ids)||req.body.ids.length>100)return res.status(400).json({error:'ids 必须为最多100条的数组'});const acknowledged=req.body.ids.filter(id=>store.patch(id,{read:true}));res.json({acknowledged});});
 app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
 app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message,...(err.code?{code:err.code}:{}),...(err.skipped?{skipped:err.skipped}:{})}));return app;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{process.loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}catch(e){if(e.code!=='ENOENT')throw e;}
 mkdirSync(new URL('../data',import.meta.url),{recursive:true});const store=createStore(fileURLToPath(new URL('../data/feed.db',import.meta.url)));
 if(!store.sources().some(s=>s.id==='demo'))store.saveSource({id:'demo',name:'演示信号 · 非真实新闻',type:'demo'});
 const app=createApp(store);app.locals.scheduler.start();
 app.listen(Number(process.env.PORT||4317),'127.0.0.1',()=>console.log('信息流工作台 http://127.0.0.1:4317'));
}
