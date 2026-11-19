import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createStore} from '../src/core.mjs';
import {createModelRegistry} from '../src/model-registry.mjs';
import {generateModelJson,listProviderModels,normalizeModelBase} from '../src/model-protocols.mjs';
import {registerModelRoutes} from '../src/model-routes.mjs';
import {createAnalysisService} from '../src/analysis-service.mjs';
const draft={vendor:'deepseek',name:'测试连接',baseUrl:'https://model.example/v1',model:'fixture-chat',apiKey:'fixture-secret-only',protocol:'openai',requiresKey:true,jsonMode:true};
test('热切换保留本批配置，下一批使用新模型，关闭后不再调用',async()=>{
 const store=createStore(),registry=createModelRegistry(store,{env:{}}),seen=[];
 try{const first=registry.save(draft),second=registry.save({...draft,model:'second'});registry.activate(first.id);store.ingest([1,2].map(n=>({title:'fixture '+n,content:'text',url:'https://example.com/'+n})),{id:'raw',name:'fixture',type:'json'},'r');
 const service=createAnalysisService(store,{registry,analyze:async(item,{config})=>{seen.push(config.model);registry.activate(second.id);return {status:'completed',retained:false};}});
 await service.run({mode:'sequential',limit:2});assert.deepEqual(seen,['fixture-chat','fixture-chat']);await service.run({mode:'sequential',limit:1,retry:true});assert.equal(seen[2],'second');registry.activate('none');await assert.rejects(service.run(),/添加并选择/);
 }finally{store.db.close();}
});
test('模型连接加密保存、隐藏密钥、保留空白编辑和域名更换保护',()=>{
 const store=createStore(),registry=createModelRegistry(store,{env:{}});try{
 const p=registry.save(draft);assert.equal(p.hasKey,true);assert.ok(!JSON.stringify(store.getState('models.providers')).includes(draft.apiKey));assert.ok(!JSON.stringify(registry.snapshot()).includes(draft.apiKey));
 registry.activate(p.id);assert.equal(registry.activeConfig().key,draft.apiKey);
 registry.save({...p,apiKey:'',model:'new-model'});assert.equal(registry.activeConfig().model,'new-model');assert.equal(registry.activeConfig().key,draft.apiKey);
 assert.throws(()=>registry.save({...p,apiKey:'',baseUrl:'https://other.example/v1'}),/重新输入密钥/);
 assert.throws(()=>registry.remove(p.id),/先切换/);registry.activate('none');assert.equal(registry.activeConfig(),null);registry.remove(p.id);
 const local=registry.save({vendor:'ollama',model:'local-model'});registry.activate(local.id);assert.equal(registry.snapshot().configured,true);assert.equal(registry.activeConfig().key,'');
 }finally{store.db.close();}
});
test('API地址规范化、OpenAI与Anthropic协议、列表获取和错误脱敏',async()=>{
 assert.equal(normalizeModelBase('https://model.example/v1/chat/completions/'),'https://model.example/v1');assert.throws(()=>normalizeModelBase('https://user:pass@model.example/v1'));
 const c={...draft,key:draft.apiKey};let captured;
 const fetchImpl=async(url,options)=>{captured={url,options};return Response.json({model:'fixture-chat',choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:4,completion_tokens:3,total_tokens:7}});};
 const result=await generateModelJson(c,'test',{fetchImpl});assert.equal(captured.options.headers.Authorization,'Bearer '+c.key);assert.equal(JSON.parse(captured.options.body).response_format.type,'json_object');assert.equal(captured.options.redirect,'error');assert.equal(result.usage.totalTokens,7);
 await generateModelJson({...c,protocol:'anthropic'},'test',{fetchImpl:async(url,options)=>{captured={url,options};return Response.json({content:[{type:'text',text:'{"ok":true}'}]});}});assert.equal(captured.url,'https://model.example/v1/messages');assert.equal(captured.options.headers['x-api-key'],c.key);assert.ok(!captured.options.headers.Authorization);
 const models=await listProviderModels(c,{fetchImpl:async()=>Response.json({data:[{id:'one'},{id:c.key}]})});assert.equal(models[0].id,'one');assert.ok(!JSON.stringify(models).includes(c.key));
 await assert.rejects(generateModelJson(c,'test',{fetchImpl:async()=>new Response(c.key,{status:401})}),e=>!e.message.includes(c.key)&&e.message.includes('401'));
});
test('模型管理API即时切换、测试共享每日预算、列表不触发生成',async()=>{
 const store=createStore(),registry=createModelRegistry(store,{env:{}}),app=express();let generations=0;app.use(express.json());registerModelRoutes(app,store,registry,{fetchImpl:async(url,options)=>{if(options.method==='POST'){generations++;return Response.json({choices:[{message:{content:'{"ok":true}'}}]});}return Response.json({data:[{id:'fixture-chat'}]});}});app.use((e,req,res,next)=>res.status(e.status||400).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/v1/model-providers`;
 const request=async(path='',body,method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});try{
 const p=await (await request('',draft)).json();await request('/active',{id:p.id},'PATCH');const snapshot=await (await request('',null,'GET')).json();assert.equal(snapshot.active.model,'fixture-chat');assert.ok(!JSON.stringify(snapshot).includes(draft.apiKey));
 await request('/discover',{id:p.id});assert.equal(generations,0);store.setState('scheduler',{dailyCallLimit:1});assert.equal((await request('/test',{id:p.id})).status,200);assert.equal((await request('/test',{id:p.id})).status,429);assert.equal(generations,1);
 }finally{await new Promise(r=>server.close(r));store.db.close();}
});
