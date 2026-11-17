import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/core.mjs';
import {createApp} from '../src/server.mjs';

async function listen(app){
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  return {server,base:`http://127.0.0.1:${server.address().port}`};
}
async function call(base,path,{method='GET',body}={}){
  const response=await fetch(base+'/api/v1/'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return [response.status,await response.json()];
}

test('来源启停状态保存在 SQLite 并在重启后保留',()=>{
  const dir=mkdtempSync(join(tmpdir(),'tideline-sources-'));
  const file=join(dir,'feed.db');
  let store;
  try{
    store=createStore(file);
    store.saveSource({id:'legacy',name:'旧来源',type:'json',url:'https://example.com/legacy'});
    // 旧数据没有 enabled 字段时按启用处理。
    assert.equal(store.sources().find(s=>s.id==='legacy').enabled,true);
    assert.equal(store.patchSource('legacy',{enabled:false}).enabled,false);
    store.db.close();
    store=null;
    const reopened=createStore(file);
    try{
      assert.equal(reopened.sources().find(s=>s.id==='legacy').enabled,false);
    }finally{reopened.db.close();}
  }finally{
    if(store)store.db.close();
    rmSync(dir,{recursive:true,force:true});
  }
});

test('批量采集跳过停用来源、手动采集给出明确错误、重新启用后可采集',async()=>{
  const upstream=express().get('/feed',(req,res)=>res.json([{title:`Live ${req.query.source}`,url:`https://example.com/${req.query.source}`}]));
  const up=await listen(upstream);
  const store=createStore();
  store.saveSource({id:'demo',name:'演示信号 · 非真实新闻',type:'demo'});
  store.saveSource({id:'a',name:'启用源',type:'json',url:`${up.base}/feed?source=a`});
  store.saveSource({id:'b',name:'停用源',type:'json',url:`${up.base}/feed?source=b`,enabled:false});
  const app=createApp(store);
  const {server,base}=await listen(app);
  try{
    const [batchStatus,batch]=await call(base,'collect',{method:'POST',body:{sourceId:'all'}});
    assert.equal(batchStatus,200);
    assert.equal(batch.status,'completed');
    assert.deepEqual(batch.results.map(r=>r.sourceId),['a']);
    assert.deepEqual(batch.skipped.map(s=>s.sourceId),['b']);
    assert.equal(store.all().filter(i=>i.demo).length,0,'批量采集不能混入演示数据');
    assert.equal(store.all().length,1);
    assert.equal(store.runs().find(r=>r.id===batch.id).skipped.length,1,'跳过记录应随运行持久化');

    const [disabledStatus,disabledError]=await call(base,'collect',{method:'POST',body:{sourceId:'b'}});
    assert.equal(disabledStatus,409);
    assert.equal(disabledError.code,'SOURCE_DISABLED');
    assert.match(disabledError.error,/已停用/);
    assert.equal(store.all().length,1,'停用来源被拒绝时不应写入条目');

    const [patchStatus,patched]=await call(base,'sources/b',{method:'PATCH',body:{enabled:true}});
    assert.equal(patchStatus,200);
    assert.equal(patched.enabled,true);
    const [,sources]=await call(base,'sources');
    assert.equal(sources.find(s=>s.id==='b').enabled,true);

    const [manualStatus,manual]=await call(base,'collect',{method:'POST',body:{sourceId:'b'}});
    assert.equal(manualStatus,200);
    assert.equal(manual.results[0].sourceId,'b');
    assert.equal(manual.results[0].added,1);

    const [demoStatus,demo]=await call(base,'collect',{method:'POST',body:{sourceId:'demo'}});
    assert.equal(demoStatus,200);
    assert.equal(demo.results[0].added,5);
    assert.equal(store.all().filter(i=>i.demo).length,5);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>up.server.close(resolve));
    store.db.close();
  }
});

test('来源创建默认启用、停用全部来源时批量采集说明原因',async()=>{
  const store=createStore();
  store.saveSource({id:'demo',name:'演示信号 · 非真实新闻',type:'demo'});
  store.saveSource({id:'ai-information',name:'AI information 公开导出',type:'public-feed',kind:'mixed'});
  const app=createApp(store);
  const {server,base}=await listen(app);
  try{
    const [createdStatus,created]=await call(base,'sources',{method:'POST',body:{name:'新来源',type:'json',url:'https://example.com/feed.json',kind:'media'}});
    assert.equal(createdStatus,201);
    assert.equal(created.enabled,true);
    const [offStatus,off]=await call(base,'sources',{method:'POST',body:{name:'暂不启用',type:'json',url:'https://example.com/off.json',kind:'official',enabled:false}});
    assert.equal(offStatus,201);
    assert.equal(off.enabled,false);

    const [badPatchStatus]=await call(base,'sources/'+created.id,{method:'PATCH',body:{enabled:'false'}});
    assert.equal(badPatchStatus,400,'PATCH 只接受布尔值');
    const [missingStatus]=await call(base,'sources/not-found',{method:'PATCH',body:{enabled:false}});
    assert.equal(missingStatus,404);
    const [importOnlyStatus,importOnly]=await call(base,'sources/ai-information',{method:'PATCH',body:{enabled:false}});
    assert.equal(importOnlyStatus,400);
    assert.match(importOnly.error,/不参与采集/);

    // 当前只有两个新来源，全部停用后批量采集应说明原因而不是静默成功。
    await call(base,'sources/'+created.id,{method:'PATCH',body:{enabled:false}});
    const [emptyStatus,empty]=await call(base,'collect',{method:'POST',body:{sourceId:'all'}});
    assert.equal(emptyStatus,400);
    assert.match(empty.error,/没有已启用/);
    assert.deepEqual(empty.skipped.map(s=>s.sourceId).sort(),[created.id,off.id].sort());

    const [importCollectStatus,importCollect]=await call(base,'collect',{method:'POST',body:{sourceId:'ai-information'}});
    assert.equal(importCollectStatus,400);
    assert.equal(importCollect.code,'SOURCE_IMPORT_ONLY');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    store.db.close();
  }
});
