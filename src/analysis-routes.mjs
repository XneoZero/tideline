import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {analyzeItem} from './analyzer.mjs';
import {createAnalysisService} from './analysis-service.mjs';
import {normalizePublicFeed} from './ai-information.mjs';
export function registerAnalysisRoutes(app,store,{analyze=analyzeItem,service=createAnalysisService(store,{analyze})}={}){
 app.get('/api/v1/analysis/status',(_,res)=>{const s=service.status();res.json({configured:s.configured,model:s.active?.model||'',providerName:s.active?.name||'',providerId:s.activeId,error:s.error,active:service.active});});
 app.post('/api/v1/analysis/run',async(req,res,next)=>{try{res.json(await service.run(req.body));}catch(e){next(e);}});
 app.post('/api/v1/import/ai-information',async(req,res)=>{
  if(!req.body.signals&&!process.env.AI_INFORMATION_FEED_PATH)return res.status(400).json({error:'请上传公开JSON，或先配置 AI_INFORMATION_FEED_PATH'});
  const payload=req.body.signals?req.body:JSON.parse(await readFile(process.env.AI_INFORMATION_FEED_PATH,'utf8'));
  const rows=normalizePublicFeed(payload),source={id:'ai-information',name:'AI information 公开导出',type:'public-feed',kind:'mixed'};
  const run={id:randomUUID(),kind:'import',startedAt:new Date().toISOString(),status:'completed',results:[]};const result=store.ingest(rows,source,run.id);store.saveSource(source);run.results.push({sourceId:source.id,...result,status:'ok'});run.finishedAt=new Date().toISOString();store.saveRun(run);res.json(run);
 });
}
