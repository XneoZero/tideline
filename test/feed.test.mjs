import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/core.mjs';
import { createApp } from '../src/server.mjs';
import { parseFeed } from '../src/collectors.mjs';
test('规范化去重、整批回滚与状态保存',()=>{const s=createStore();const source={id:'test',name:'测试',type:'json'};assert.equal(s.ingest([{title:'a',url:'https://example.com/a?utm_source=x#top'}],source,'run').added,1);assert.equal(s.ingest([{title:'a',url:'https://example.com/a'}],source,'run').duplicates,1);assert.throws(()=>s.ingest([{title:'b',url:'https://example.com/b'},{title:'bad',url:'javascript:alert(1)'}],source,'run'));assert.equal(s.all().length,1);assert.equal(s.patch(s.all()[0].id,{saved:true}).saved,true);s.db.close();});
test('RSS 与 Atom 解析',()=>{assert.equal(parseFeed('<rss><channel><item><title>A</title><link>https://example.com</link></item></channel></rss>')[0].title,'A');assert.equal(parseFeed('<feed><entry><title>B</title><link href="https://example.com/b"/></entry></feed>')[0].url,'https://example.com/b');assert.throws(()=>parseFeed('<html/>'));});
test('真实 JSON HTTP 采集、重跑去重、失败记录和 Whale 鉴权',async()=>{
 const s=createStore();s.saveSource({id:'demo',name:'Demo',type:'demo'});const server=createApp(s).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,body,token)=>{const r=await fetch(base+'/api/v1/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return [r.status,await r.json()];};
 try{
  assert.equal((await call('collect',{sourceId:'demo'}))[1].results[0].added,5);
  assert.equal((await call('collect',{sourceId:'demo'}))[1].results[0].duplicates,5);
  const express=(await import('express')).default;const upstream=express().get('/items',(_,r)=>r.json([{title:'Live fixture',url:'https://example.com/live'}])).listen(0,'127.0.0.1');await new Promise(r=>upstream.once('listening',r));
  try{s.saveSource({id:'json',name:'fixture server',type:'json',url:`http://127.0.0.1:${upstream.address().port}/items`});assert.equal((await call('collect',{sourceId:'json'}))[1].results[0].added,1);}finally{await new Promise(r=>upstream.close(r));}
  s.saveSource({id:'bad',name:'bad',type:'invalid',url:'file:///no'});assert.equal((await call('collect',{sourceId:'bad'}))[1].status,'failed');
  process.env.FEED_API_TOKEN='test-secret';assert.equal((await call('whale/feed'))[0],401);assert.equal((await call('whale/feed',null,'test-secret'))[1].items.length,1);
  const [status]=await call('whale/ingest',{items:[{title:'Core signal',url:'https://example.com/core'}]},'test-secret');assert.equal(status,200);
  const id=s.all()[0].id;assert.deepEqual((await call('whale/ack',{ids:[id]},'test-secret'))[1].acknowledged,[id]);assert.equal(s.all()[0].read,true);
 }finally{delete process.env.FEED_API_TOKEN;await new Promise(r=>server.close(r));s.db.close();}
});
