const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const listen = async app => {
 const server = app.listen(0, '127.0.0.1');
 await new Promise(resolve => server.once('listening', resolve));
 return server;
};
const url = server => 'http://127.0.0.1:'+server.address().port;

(async () => {
 const {createApp} = await import('../src/server.mjs');
 const {createStore} = await import('../src/core.mjs');
 const express = (await import('express')).default;
 const store = createStore();
 let releaseSource,releaseModel;
 const sourceGate = new Promise(resolve => {releaseSource=resolve;});
 const modelGate = new Promise(resolve => {releaseModel=resolve;});
 const modelInputs = [];
 let round=1;
 const fixture = express().use(express.json());
 fixture.get('/feeds/:id', async (req,res) => {
  if(req.params.id==='second')await sourceGate;
  const id=req.params.id+'-'+round;
  res.json([{title:id,content:'QA content',url:'https://example.com/'+id}]);
 });
 fixture.post('/chat/completions', async (req,res) => {
  const inputs=JSON.parse(req.body.messages.at(-1).content.split('\n材料：')[1]);
  modelInputs.push(inputs.map(input=>input.title).sort());
  await modelGate;
  const results=inputs.map(({ref,title})=>({ref,isAiRelated:true,isUsefulSignal:true,zhTitle:'测试中文解读 '+title,
   zhSummary:'QA fixture',signalType:'测试',whyItMatters:'用于验证批量处理',insightForMe:'按来源检查结果',
   filterReason:'',importance:'medium',importanceScore:60,relevanceScore:80,signalScore:60,
   noveltyScore:30,noiseScore:10,tags:['QA']}));
  res.json({choices:[{message:{content:JSON.stringify({results})}}]});
 });
 const upstream = await listen(fixture);
 for(const [id,name] of [['first','测试源一'],['second','测试源二']]){
  store.saveSource({id,name,type:'json',url:url(upstream)+'/feeds/'+id});
 }
 store.ingest([{title:'旧待分析',url:'https://example.com/old'}],{id:'first',name:'测试源一',type:'json'},'old-run');
 const server = await listen(createApp(store));
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  const api=(path,data,method='POST')=>page.request.fetch(url(server)+'/api/v1/'+path,{method,data});
  const model=await (await api('model-providers',{vendor:'custom',name:'QA',protocol:'openai',baseUrl:url(upstream),
   model:'QA-model',requiresKey:false,jsonMode:true})).json();
  assert.ok((await api('model-providers/active',{id:model.id},'PATCH')).ok());
  await page.goto(url(server));
  await page.waitForFunction(()=>document.querySelector('#source').options.length>1);
  const workflow=page.locator('#workflow-progress');

  await page.click('#pipeline');
  await workflow.getByText('正在采集 测试源二',{exact:true}).waitFor();
  assert.equal(await workflow.locator('progress').first().getAttribute('value'),'1');
  assert.equal(await workflow.getByText('采集中',{exact:true}).count(),1);
  releaseSource();
  await workflow.getByText('正在等待模型批量返回').waitFor();
  assert.equal(await workflow.locator('progress').first().getAttribute('value'),'2');
  releaseModel();
  await workflow.getByText(/批量分析结束，2 条完成/).waitFor();
  assert.deepEqual(modelInputs,[['first-1','second-1']]);
  assert.equal(store.all().find(i=>i.title==='旧待分析').analysis.status,'pending');
  assert.equal(store.all().filter(i=>i.analysis.zhTitle?.startsWith('测试中文解读')).length,2);

  await page.click('#pipeline');
  await workflow.getByText(/没有待分析的新条目/).waitFor();
  assert.equal(modelInputs.length,1);

  round++;
  await page.click('#refresh');
  await workflow.getByText(/新增 2 条，去重 0 条/).waitFor();
  assert.equal(modelInputs.length,1);

  await page.click('#analyze-parallel');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('批量分析结束，3 条完成'));
  assert.deepEqual(modelInputs[1],['first-2','second-2','旧待分析'].sort());
  console.log('Live progress and one model request per batch verified.');
 } finally {
  releaseSource();releaseModel();
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await new Promise(resolve=>upstream.close(resolve));
  store.db.close();
 }
})().catch(error=>{console.error(error);process.exit(1);});
