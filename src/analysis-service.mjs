import {randomUUID} from 'node:crypto';
import {analyzeItem,modelConfig} from './analyzer.mjs';
import {localDay} from './briefs.mjs';
import {serviceError} from './errors.mjs';
export const schedulerDefaults={enabled:false,intervalMinutes:360,analysisLimit:3,dailyCallLimit:12,nextRunAt:null};
export function createAnalysisService(store,{analyze=analyzeItem,now=Date.now}={}){
 let active=null;
 return {get active(){return active;},async run(options={}){
  if(active)throw serviceError('已有分析任务运行中',409);
  if(!modelConfig().key)throw serviceError('请先在 .env 中配置模型密钥',503);
  if(options.ids!==undefined&&(!Array.isArray(options.ids)||options.ids.length>20))throw serviceError('ids 最多20条');
  const limit=options.limit??20;if(!Number.isInteger(limit)||limit<1||limit>20)throw serviceError('limit 必须为1到20的整数');
  const candidates=store.all().filter(i=>!i.demo&&i.acquisition?.eligibleForAnalysis!==false&&(!options.ids||options.ids.includes(i.id))&&(!options.sourceId||i.sourceId===options.sourceId)&&(options.retry===true||!['completed','running','uncertain'].includes(i.analysis?.status))).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,limit);
  const run={id:randomUUID(),kind:'analysis',startedAt:new Date(now()).toISOString(),status:'running',results:[],total:candidates.length,progress:0};active=run;store.saveRun(run);
  try{for(const item of candidates){
   const settings={...schedulerDefaults,...store.getState('scheduler',{})},day=localDay(now());
   if(!store.reserveCall(day,settings.dailyCallLimit,item.id)){run.budgetExhausted=true;break;}
   store.patch(item.id,{analysis:{status:'running'}});
   try{const result=await analyze(item);store.patch(item.id,{analysis:result});run.results.push({itemId:item.id,status:'ok',retained:result.retained});}
   catch(e){const uncertain=/timeout|aborted/i.test(e.name+' '+e.message);store.patch(item.id,{analysis:{status:uncertain?'uncertain':'failed',error:e.message,failedAt:new Date(now()).toISOString()}});run.results.push({itemId:item.id,status:'failed',error:e.message,uncertain});}
   run.progress++;store.saveRun(run);
  }const failures=run.results.filter(r=>r.status==='failed').length;run.status=run.budgetExhausted?'budget_exhausted':failures?(failures===run.results.length?'failed':'partial'):'completed';return run;
  }finally{active=null;run.finishedAt=new Date(now()).toISOString();store.saveRun(run);}
 }};
}
