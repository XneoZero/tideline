import {mkdirSync,writeFileSync} from 'node:fs';
import {createStore} from '../src/core.mjs';
import {collect} from '../src/collectors.mjs';
import {builtInSources} from '../src/news-sources.mjs';
import {createAnalysisService} from '../src/analysis-service.mjs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
try{process.loadEnvFile(new URL('../.env',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
mkdirSync(new URL('../data',import.meta.url),{recursive:true});
const store=createStore(fileURLToPath(new URL('../data/feed.db',import.meta.url)));
const run={id:randomUUID(),kind:'collect',startedAt:new Date().toISOString(),status:'running',results:[]};store.saveRun(run);
const report={startedAt:run.startedAt,collection:[],analysis:[]};
try{
 for(const preset of builtInSources){
  const existing=store.sources().find(s=>s.id===preset.id);if(!existing)store.saveSource(preset);const source=existing||preset;if(source.enabled===false)continue;
  try{const rows=await collect(source,{seen:store.hasUrl});const result={sourceId:source.id,...store.ingest(rows,source,run.id),status:'ok',warnings:rows.warnings||[]};run.results.push(result);console.log('COLLECT',JSON.stringify(result));}
  catch(e){const result={sourceId:source.id,status:'failed',error:e.message};run.results.push(result);console.log('COLLECT',JSON.stringify(result));}
  store.saveRun(run);
 }
 const failed=run.results.filter(r=>r.status==='failed').length;run.status=failed?(failed===run.results.length?'failed':'partial'):'completed';run.finishedAt=new Date().toISOString();store.saveRun(run);report.collection=run.results;
 const ids=builtInSources.map(s=>s.id);
 // 每个来源最多选一篇，单次最多3条，避免不受控费用。已成功分析的不重复请求。
 const selected=ids.map(id=>store.all().filter(i=>i.sourceId===id&&i.acquisition?.eligibleForAnalysis!==false&&i.analysis?.status!=='completed').sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0))[0]).filter(Boolean);
 const analysisRun=await createAnalysisService(store).run({ids:selected.map(i=>i.id),limit:3});
 report.analysis=analysisRun.results;report.finishedAt=analysisRun.finishedAt;report.budgetExhausted=analysisRun.budgetExhausted||false;console.log('ANALYZE',JSON.stringify(analysisRun.results));
 writeFileSync(new URL('../docs/live-verification.json',import.meta.url),JSON.stringify(report,null,2));
}finally{store.db.close();}
