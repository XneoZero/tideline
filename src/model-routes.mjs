import {listProviderModels,generateModelJson} from './model-protocols.mjs';
import {localDay} from './briefs.mjs';
import {schedulerDefaults} from './analysis-service.mjs';
export function registerModelRoutes(app,store,registry,{fetchImpl=fetch}={}){
 app.get('/api/v1/model-providers',(_,res)=>res.json(registry.snapshot()));
 app.post('/api/v1/model-providers',(req,res)=>res.status(201).json(registry.save(req.body)));
 app.patch('/api/v1/model-providers/active',(req,res)=>res.json(registry.activate(req.body.id)));
 app.post('/api/v1/model-providers/import-environment',(_,res)=>res.status(201).json(registry.importEnvironment()));
 app.put('/api/v1/model-providers/:id',(req,res)=>res.json(registry.save({...req.body,id:req.params.id})));
 app.delete('/api/v1/model-providers/:id',(req,res)=>{registry.remove(req.params.id);res.json({deleted:true});});
 app.post('/api/v1/model-providers/discover',async(req,res)=>{try{const config=registry.resolveDraft(req.body);res.json({models:await listProviderModels(config,{fetchImpl}),note:'模型列表可达不等于已验证生成能力'});}catch(e){if(e.status)throw e;res.status(502).json({error:'获取模型失败，请检查网络、地址与接口支持情况；也可手动填写模型 ID'});}});
 app.post('/api/v1/model-providers/test',async(req,res)=>{
  const config=registry.resolveDraft(req.body,{requireModel:true});const policy={...schedulerDefaults,...store.getState('scheduler',{})};
  if(!store.reserveCall(localDay(Date.now()),policy.dailyCallLimit,'model-connection-test'))return res.status(429).json({error:'今日模型调用额度已用尽，测试也计入调用上限'});
  const result=await generateModelJson(config,'请只返回这个 JSON：{"ok":true}',{fetchImpl,maxTokens:256});
  if(result.json?.ok!==true)return res.status(502).json({error:'模型返回不符合测试要求，请检查模型与JSON选项'});
  res.json({ok:true,model:result.resolvedModel,usage:result.usage,note:'生成测试已计入今日模型调用次数'});
 });
}
