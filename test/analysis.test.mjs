import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createStore} from '../src/core.mjs';
import {analyzeBatch,analyzeItem,validateSignal} from '../src/analyzer.mjs';
import {localDay} from '../src/briefs.mjs';
import {normalizePublicFeed} from '../src/ai-information.mjs';
import {registerAnalysisRoutes} from '../src/analysis-routes.mjs';
import {createAnalysisService} from '../src/analysis-service.mjs';
const signal={isAiRelated:true,isUsefulSignal:true,zhTitle:'测试信号',zhSummary:'测试摘要',signalType:'模型能力',importance:'medium',importanceScore:60,relevanceScore:80,signalScore:60,noveltyScore:30,noiseScore:10,filterReason:'',whyItMatters:'原文提供了具体改进描述，尚需验证。',insightForMe:'对照原文测试能力。',tags:['AI']};
test('并行分析一次模型请求扣一次额度，按编号匹配结果并保留下一批',async()=>{
 const store=createStore();
 const source={id:'raw',name:'test',type:'json'};
 const rows=Array.from({length:25},(_,i)=>({title:String(i),url:'https://example.com/posts/'+i}));
 store.ingest(rows,source,'collect');
 const completed=store.all().find(item=>item.title==='23');
 const uncertain=store.all().find(item=>item.title==='24');
 store.patch(completed.id,{analysis:{status:'completed'}});
 store.patch(uncertain.id,{analysis:{status:'uncertain'}});
 store.setState('scheduler',{dailyCallLimit:1});
 const now=()=>Date.parse('2026-11-18T04:00:00Z');
 let calls=0;
 const service=createAnalysisService(store,{
  now,
  registry:{activeConfig:()=>({key:'fixture',baseUrl:'https://example.com',model:'fixture'})},
  analyzeTogether:(items,{config})=>analyzeBatch(items,{config,fetchImpl:async(_,request)=>{
   calls++;
   const prompt=JSON.parse(request.body).messages.at(-1).content;
   const inputs=JSON.parse(prompt.split('\n材料：')[1]);
   assert.equal(inputs.length,20);
   const results=inputs.slice(1).reverse().map(item=>({...signal,ref:item.ref,zhTitle:'分析 '+item.title}));
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({results})}}],usage:{total_tokens:3210}}));
  }})
 });
 try{
  const run=await service.run({mode:'parallel'});
  assert.equal(run.total,20);
  assert.equal(run.deferred,3);
  assert.equal(run.status,'partial');
  assert.equal(run.usage.totalTokens,3210);
  assert.equal(run.results.filter(result=>result.status==='ok').length,19);
  assert.equal(run.results.filter(result=>result.status==='failed').length,1);
  assert.equal(store.all().filter(item=>item.analysis?.status==='pending').length,3);
  for(const item of store.all().filter(item=>item.analysis?.zhTitle)){
   assert.equal(item.analysis.zhTitle,'分析 '+item.title);
  }
  assert.equal(store.all().find(item=>item.id===uncertain.id).analysis.status,'uncertain');
  assert.equal((await service.run({mode:'parallel'})).status,'budget_exhausted');
  assert.equal(calls,1);
  assert.equal(store.callCount(localDay(now())),1);
 }finally{store.db.close();}
});
test('严格分析契约与相关性过滤',()=>{assert.equal(validateSignal(signal).retained,true);assert.throws(()=>validateSignal({...signal,importanceScore:101}));assert.throws(()=>validateSignal({...signal,isUsefulSignal:'true'}));assert.throws(()=>validateSignal({...signal,isAiRelated:false}));assert.equal(validateSignal({...signal,isAiRelated:false,filterReason:'作者重要但内容只是闲聊'}).retained,false);});
test('模型请求与无效回执不冒充完成',async()=>{const item={title:'source',content:'text',url:'https://example.com'};let request;const result=await analyzeItem(item,{config:{key:'secret',baseUrl:'https://model.example/v1',model:'test'},fetchImpl:async(url,init)=>{request={url,init};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(signal)}}]}));}});assert.equal(result.status,'completed');assert.equal(result.inputHash.length,64);assert.equal(String(request.url),'https://model.example/v1/chat/completions');assert.match(JSON.parse(request.init.body).messages[1].content,/不可信来源/);await assert.rejects(analyzeItem(item,{config:{key:''}}),/密钥/);await assert.rejects(analyzeItem(item,{config:{key:'x',baseUrl:'https://model.example',model:'test'},fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'bad json'}}]}))}),/有效 JSON/);});
test('公开 Feed 保留原文、人物身份和导入解读',()=>{const rows=normalizePublicFeed({signals:[{originalTitle:'English',title:'中文标题',originalBody:'original',originalUrl:'https://example.com/x',sourceKind:'x_person',authorHandle:'test',summaryZh:'导入摘要'}]});assert.equal(rows[0].title,'English');assert.equal(rows[0].sourceKind,'x_person');assert.equal(rows[0].importedInterpretation.zhSummary,'导入摘要');assert.throws(()=>normalizePublicFeed({items:[]}));});
test('批次分析隔离单条失败、保留原文且记录进度',async()=>{const old=process.env.FEED_LLM_API_KEY;process.env.FEED_LLM_API_KEY='test';const store=createStore();store.ingest([{title:'good',content:'original',url:'https://example.com/good'},{title:'bad',url:'https://example.com/bad'}],{id:'raw',name:'test',type:'json'},'r');const app=express();app.use(express.json());registerAnalysisRoutes(app,store,{analyze:async item=>{if(item.title==='bad')throw new Error('模拟限流');return {...validateSignal(signal),status:'completed'};}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{const base=`http://127.0.0.1:${server.address().port}`;const response=await fetch(base+'/api/v1/analysis/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const run=await response.json();assert.equal(run.status,'partial');assert.equal(run.progress,2);assert.equal(store.all().find(i=>i.title==='good').content,'original');assert.equal(store.all().find(i=>i.title==='bad').analysis.status,'failed');assert.equal(store.runs()[0].status,'partial');}finally{await new Promise(r=>server.close(r));store.db.close();if(old===undefined)delete process.env.FEED_LLM_API_KEY;else process.env.FEED_LLM_API_KEY=old;}});
