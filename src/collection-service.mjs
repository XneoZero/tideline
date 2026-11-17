import {randomUUID} from 'node:crypto';
import {collect} from './collectors.mjs';
import {serviceError} from './errors.mjs';
export function createCollectionService(store,{collectFn=collect}={}){
 let busy=false;
 return {get busy(){return busy;},async run(sourceId='all'){
  if(busy)throw serviceError('已有采集任务运行中',409);
  const all=store.sources();let sources=[],skipped=[];
  if(sourceId==='all'){
   const batch=all.filter(s=>s.type!=='demo'&&s.id!=='ai-information');skipped=batch.filter(s=>s.enabled===false).map(s=>({sourceId:s.id,name:s.name,reason:'disabled'}));sources=batch.filter(s=>s.enabled!==false);
   if(!sources.length)throw Object.assign(serviceError(skipped.length?'没有已启用的可采集来源，请先在系统设置中启用。':'没有可采集的真实订阅来源'),{skipped});
  }else{const s=all.find(s=>s.id===sourceId);if(!s)throw serviceError('来源不存在');if(s.id==='ai-information')throw serviceError('导入记录不参与采集，请使用导入功能',400,'SOURCE_IMPORT_ONLY');if(s.enabled===false)throw serviceError(`来源「${s.name}」已停用，请先启用`,409,'SOURCE_DISABLED');sources=[s];}
  busy=true;const run={id:randomUUID(),kind:'collect',startedAt:new Date().toISOString(),status:'running',results:[],skipped};store.saveRun(run);
  try{for(const source of sources){try{const rows=await collectFn(source,{seen:store.hasUrl});run.results.push({sourceId:source.id,...store.ingest(rows,source,run.id),status:'ok',warnings:rows.warnings||[]});}catch(e){run.results.push({sourceId:source.id,status:'failed',error:e.message});}store.saveRun(run);}
   const failed=run.results.filter(r=>r.status==='failed').length;run.status=failed?(failed===sources.length?'failed':'partial'):'completed';return run;
  }finally{busy=false;run.finishedAt=new Date().toISOString();store.saveRun(run);}
 }};
}
