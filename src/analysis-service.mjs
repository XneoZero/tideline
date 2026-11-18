import {randomUUID} from 'node:crypto';
import {analyzeBatch,analyzeItem,maxAnalysisBatch} from './analyzer.mjs';
import {createModelRegistry} from './model-registry.mjs';
import {configReady} from './model-protocols.mjs';
import {localDay} from './briefs.mjs';
import {serviceError} from './errors.mjs';
export const schedulerDefaults={enabled:false,intervalMinutes:360,analysisLimit:3,dailyCallLimit:12,nextRunAt:null};
export function createAnalysisService(store,{analyze=analyzeItem,analyzeTogether=analyzeBatch,now=Date.now,registry=createModelRegistry(store)}={}){
 let active=null;
 return {get active(){return active;},status:()=>registry.snapshot(),async run(options={}){
  if(active)throw serviceError('已有分析任务运行中',409);
  const config=registry.activeConfig();if(!configReady(config))throw serviceError('请先在设置中添加并选择分析模型',503);
  if(options.ids!==undefined&&(!Array.isArray(options.ids)||options.ids.length>20))throw serviceError('ids 最多20条');
  const mode=options.mode??'sequential';
  if(mode!=='sequential'&&mode!=='parallel')throw serviceError('未知分析模式');
  const parallel=mode==='parallel';
  if(options.limit!==undefined&&(!Number.isInteger(options.limit)||options.limit<1||options.limit>20))throw serviceError('limit 必须为1到20的整数');
  const candidates=store.all().filter(item=>{
   if(item.demo||item.acquisition?.eligibleForAnalysis===false)return false;
   if(options.ids&&!options.ids.includes(item.id))return false;
   if(options.sourceId&&item.sourceId!==options.sourceId)return false;
   const status=item.analysis?.status;
   if(parallel)return !status||status==='pending';
   return options.retry===true||!['completed','running','uncertain'].includes(status);
  }).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
  const queue=candidates.slice(0,options.limit??maxAnalysisBatch);
  const run={id:randomUUID(),kind:'analysis',mode,startedAt:new Date(now()).toISOString(),status:'running',results:[],total:queue.length,progress:0};
  if(parallel)run.deferred=candidates.length-queue.length;
  function reserve(itemId){
   const settings={...schedulerDefaults,...store.getState('scheduler',{})};
   if(store.reserveCall(localDay(now()),settings.dailyCallLimit,itemId))return true;
   run.budgetExhausted=true;
   return false;
  }
  function saveResult(item,{analysis,error,uncertain=false}){
   if(analysis){
    store.patch(item.id,{analysis});
    run.results.push({itemId:item.id,status:'ok',retained:analysis.retained});
   }else{
    store.patch(item.id,{analysis:{status:uncertain?'uncertain':'failed',error,failedAt:new Date(now()).toISOString()}});
    run.results.push({itemId:item.id,status:'failed',error,uncertain});
   }
   run.progress++;
   store.saveRun(run);
  }
  const failure=error=>({error:error.message,uncertain:/timeout|aborted/i.test(error.name+' '+error.message)});
  active=run;
  try{
   store.saveRun(run);
   if(parallel&&queue.length&&reserve('analysis-batch:'+run.id)){
    for(const item of queue)store.patch(item.id,{analysis:{status:'running'}});
    let batch,batchFailure;
    try{batch=await analyzeTogether(queue,{config});}
    catch(error){batchFailure=failure(error);}
    if(batch?.usage)run.usage=batch.usage;
    for(const [index,item] of queue.entries())saveResult(item,batchFailure??batch.entries[index]);
   }else if(!parallel){
    for(const item of queue){
     if(!reserve(item.id))break;
     store.patch(item.id,{analysis:{status:'running'}});
     let result;
     try{result={analysis:await analyze(item,{config})};}
     catch(error){result=failure(error);}
     saveResult(item,result);
    }
   }
   const failures=run.results.filter(r=>r.status==='failed').length;
   run.status=run.budgetExhausted?'budget_exhausted':failures?(failures===run.results.length?'failed':'partial'):'completed';
   return run;
  }catch(error){
   run.status='failed';
   throw error;
  }finally{active=null;run.finishedAt=new Date(now()).toISOString();store.saveRun(run);}
 }};
}
