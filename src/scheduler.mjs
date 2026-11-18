import {schedulerDefaults} from './analysis-service.mjs';
import {buildDailyBrief,localDay} from './briefs.mjs';
export function createScheduler(store,{collection,analysis,now=Date.now}={}){
 let timer=null,ticking=false;
 const get=()=>({...schedulerDefaults,...store.getState('scheduler',{})});
 const save=config=>{store.setState('scheduler',config);return config;};
 function configure(patch){
  const config=get();for(const key of Object.keys(patch))if(!['enabled','intervalMinutes','analysisLimit','dailyCallLimit'].includes(key))throw new Error('未知调度字段');
  if(patch.enabled!==undefined&&typeof patch.enabled!=='boolean')throw new Error('enabled 必须为布尔值');
  for(const [key,min,max] of [['intervalMinutes',15,1440],['analysisLimit',0,20],['dailyCallLimit',0,100]])if(patch[key]!==undefined&&(!Number.isInteger(patch[key])||patch[key]<min||patch[key]>max))throw new Error(`${key} 必须为${min}到${max}的整数`);
  const timingChanged=['enabled','intervalMinutes'].some(key=>patch[key]!==undefined&&patch[key]!==config[key]);
  Object.assign(config,patch);
  if(timingChanged)config.nextRunAt=config.enabled?new Date(now()+config.intervalMinutes*60000).toISOString():null;
  return save(config);
 }
 function recover(){
  for(const run of store.runs().filter(r=>r.status==='running')){run.status='interrupted';run.finishedAt=new Date(now()).toISOString();run.error='服务重启时发现未完成任务';store.saveRun(run);}
  for(const item of store.all().filter(i=>i.analysis?.status==='running'))store.patch(item.id,{analysis:{status:'uncertain',error:'服务中断，模型调用结果未知；不自动重复计费，请人工重试'}});
  for(const job of store.jobs().filter(j=>j.status==='running')){job.status='retry';job.error='服务中断，恢复任务检查点';job.nextAttemptAt=new Date(now()+60000).toISOString();store.saveJob(job);}
 }
 async function execute(job){
  const config=get();job.status='running';job.attempts++;job.updatedAt=new Date(now()).toISOString();store.saveJob(job);
  try{
   if(!job.collectionDone){
    const results=[];const ids=job.failedSourceIds?.length?job.failedSourceIds:['all'];
    for(const id of ids){const result=await collection.run(id);results.push(...result.results);}
    job.failedSourceIds=results.filter(r=>r.status==='failed').map(r=>r.sourceId);job.collectionDone=!job.failedSourceIds.length;job.collectionResults=results;store.saveJob(job);
    if(!job.collectionDone)throw new Error('部分来源采集失败：'+results.filter(r=>r.status==='failed').map(r=>r.error).join('；'));
   }
   if(!job.analysisDone&&config.analysisLimit>0){const result=await analysis.run({limit:config.analysisLimit});job.analysisRunId=result.id;job.analysisDone=!['failed','partial'].includes(result.status);store.saveJob(job);if(!job.analysisDone)throw new Error('部分模型分析失败，等待有限重试');}
   const brief=buildDailyBrief(store,localDay(now()));job.briefDay=brief.day;job.status='completed';job.finishedAt=new Date(now()).toISOString();job.error=null;
  }catch(e){job.error=e.message;job.status=job.attempts>=3?'failed':'retry';job.nextAttemptAt=new Date(now()+Math.min(30,2**job.attempts)*60000).toISOString();}
  store.saveJob(job);return job;
 }
 async function tick(){
  if(ticking)return;ticking=true;
  try{const config=get();
   if(config.enabled&&config.nextRunAt&&Date.parse(config.nextRunAt)<=now()){
    // 一个周期只建一个持久任务；停机错过的周期合并，不爆发式补跑。
    const id='scheduled:'+config.nextRunAt;if(!store.jobs().some(j=>j.id===id))store.saveJob({id,status:'queued',attempts:0,createdAt:new Date(now()).toISOString(),nextAttemptAt:new Date(now()).toISOString()});
    config.nextRunAt=new Date(now()+config.intervalMinutes*60000).toISOString();save(config);
   }
   const job=store.jobs().filter(j=>(config.enabled||j.manual)&&['queued','retry'].includes(j.status)&&Date.parse(j.nextAttemptAt)<=now()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
   if(job){if(collection.busy||analysis.active)return;await execute(job);}
  }finally{ticking=false;}
 }
 return {get,configure,tick,recover,enqueue(){const existing=store.jobs().find(j=>['queued','running','retry'].includes(j.status));if(existing)return existing;const job={id:'manual:'+new Date(now()).toISOString(),manual:true,status:'queued',attempts:0,createdAt:new Date(now()).toISOString(),nextAttemptAt:new Date(now()).toISOString()};store.saveJob(job);return job;},status:()=>({config:get(),active:ticking,usedCallsToday:store.callCount(localDay(now())),jobs:store.jobs(),timezone:'Asia/Shanghai',serviceRequired:true}),
  start(){recover();const config=get();if(config.enabled&&!config.nextRunAt)save({...config,nextRunAt:new Date(now()+config.intervalMinutes*60000).toISOString()});buildDailyBrief(store);timer=setInterval(()=>tick().catch(e=>store.setState('schedulerError',e.message)),30000);timer.unref();},stop(){if(timer)clearInterval(timer);}};
}
