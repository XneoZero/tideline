import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cards,dashboard,monitor,settings} from '../public/views.js';

test('设置页展示来源启停开关、停用说明和最近采集结果',()=>{
  const sources=[
    {id:'demo',name:'演示信号 · 非真实新闻',type:'demo',enabled:true},
    {id:'rss',name:'官方订阅',type:'rss',url:'https://example.com/feed',kind:'official',enabled:false},
    {id:'ai-information',name:'AI information 公开导出',type:'public-feed',kind:'mixed',enabled:true}
  ];
  const runs=[{kind:'collect',startedAt:'2026-11-17T00:00:00Z',skipped:[{sourceId:'rss',name:'官方订阅'}],results:[{sourceId:'demo',status:'ok',added:5,duplicates:0}]}];
  const html=settings(sources,{configured:false,model:'mock'},runs);
  assert.match(html,/data-source-toggle="demo"/);
  assert.match(html,/aria-pressed="false"/);
  assert.match(html,/已停用 · 批量采集会跳过/);
  assert.match(html,/上次采集：成功 · 新增 5/);
  assert.match(html,/导入专用/);
  assert.match(html,/批量采集只请求已启用的真实来源/);
  assert.match(html,/当前 0 个可用，1 个停用/);
});

test('运行记录以北京时间显示，并从浏览器错误中移除查询参数及调用栈',()=>{
  const date='2026-11-18T16:15:48.534Z';
  const url='https://example.com/profile?xsec_token=fixture-token';
  const result={sourceId:'one',status:'failed',
    error:'page.goto: net::ERR_CONNECTION_CLOSED at '+url+'\nCall log: \x1b[2m'+url+'\x1b[22m',
    warnings:[{url,error:'fetch failed'}]};
  const run={kind:'collect',status:'failed',startedAt:date,finishedAt:date,results:[result]};
  const job={status:'retry',attempts:1,createdAt:date,nextAttemptAt:date,collectionResults:[result]};
  const html=settings([{id:'one',name:'测试来源',type:'xiaohongshu'}],{},[run],{scheduler:{config:{nextRunAt:date},jobs:[job]}});
  assert.match(html,/2026-11-19 00:15:48（北京时间）/);
  assert.match(html,/1 个来源采集失败/);
  assert.match(html,/测试来源<\/strong> · 浏览器连接中断/);
  assert.match(html,/下次重试：2026-11-19/);
  assert.doesNotMatch(html,/xsec_token|Call log|T16:15/);
  const detail=monitor([run]);
  assert.match(detail,/结束时间：2026-11-19 00:15:48（北京时间）/);
  assert.match(detail,/HTTP 请求失败/);
  assert.doesNotMatch(detail,/xsec_token|Call log|T16:15/);
});

test('卡片保留演示与导入解读标签，工作流显示启用与跳过数量',()=>{
  const item={id:'one',title:'Original',content:'Body',url:'https://example.com/one',sourceName:'来源',sourceKind:'x_person',tags:['AI'],summary:'摘要',demo:true,importedInterpretation:{zhTitle:'导入标题',zhSummary:'导入摘要',whyItMatters:'原因'},analysis:{status:'pending'}};
  const demoCard=cards([item]);
  assert.match(demoCard,/演示数据/);
  const importedItem={...item,id:'imported',demo:false};
  assert.match(cards([importedItem]),/导入解读/);
  const analyzed={...importedItem,id:'two',analysis:{status:'completed',retained:true,zhTitle:'模型标题',zhSummary:'模型摘要',whyItMatters:'原因',insightForMe:'启发',signalType:'模型能力',importanceScore:60,tags:['AI']}};
  const analyzedCard=cards([analyzed]);
  assert.match(analyzedCard,/含导入解读/);
  assert.match(analyzedCard,/AI 信号/);
  const runs=[{kind:'collect',startedAt:new Date().toISOString(),status:'completed',skipped:[{sourceId:'off',name:'停用来源'}],results:[{sourceId:'on',status:'ok',added:2,duplicates:1}]}];
  const sources=[{id:'on',name:'启用来源',type:'rss',enabled:true},{id:'on2',name:'另一个启用来源',type:'json',enabled:true},{id:'off',name:'停用来源',type:'rss',enabled:false}];
  const html=dashboard([],runs,sources);
  assert.match(html,/2 个真实来源启用 \/ 1 个停用/);
  assert.match(html,/跳过 1 个停用来源/);
  assert.match(html,/批量采集只请求已启用的真实来源/);
});
