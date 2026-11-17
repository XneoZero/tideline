import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {chromium} from 'playwright';
import {monitorLogin} from '../src/login-monitor.mjs';
import {openPlatformLogin,finishPlatformLogin,platformStatus,withPlatformPage} from '../src/platform-sessions.mjs';
import {openXLogin,finishXLogin,xStatus,collectX} from '../src/x-collector.mjs';
test('登录检测允许登录、退出、切换，成功及暂时检测失败均不关窗',async()=>{
 const context=new EventEmitter(),statuses=[];let ready=true,closed=false,fail=false;
 const monitor=monitorLogin(context,{check:async()=>{if(fail)throw new Error('navigation');return ready;},onStatus:s=>statuses.push(s),onClose:()=>{closed=true;}});
 await monitor.poll();ready=false;await monitor.poll();ready=true;await monitor.poll();fail=true;await monitor.poll();assert.deepEqual(statuses,[true,false,true]);assert.equal(closed,false);context.emit('close');assert.equal(closed,true);fail=false;await monitor.poll();assert.equal(statuses.length,3);
});
test('三个平台保持登录窗口和采集锁，完成登录后释放；重复完成安全',async()=>{
 const launch=chromium.launchPersistentContext,contexts=[];
 chromium.launchPersistentContext=async()=>{const context=new EventEmitter();context.closed=false;context.pages=()=>[{goto:async()=>{},evaluate:async()=>true}];context.close=async()=>{context.closed=true;context.emit('close');};contexts.push(context);return context;};
 try{
  await Promise.all([openPlatformLogin('bilibili'),openPlatformLogin('xiaohongshu'),openXLogin()]);
  await new Promise(r=>setTimeout(r,2700));
  assert.ok(contexts.every(c=>!c.closed));assert.equal(platformStatus('bilibili').status,'ready');assert.equal(platformStatus('xiaohongshu').status,'ready');assert.equal(xStatus().status,'ready');
  await assert.rejects(withPlatformPage('bilibili',()=>{}),e=>e.status===409);await assert.rejects(collectX({}),e=>e.status===409);
  await Promise.all([finishPlatformLogin('bilibili'),finishPlatformLogin('xiaohongshu'),finishXLogin()]);assert.ok(contexts.every(c=>c.closed));assert.equal(platformStatus('bilibili').busy,false);assert.equal(xStatus().busy,false);await finishXLogin();await finishPlatformLogin('bilibili');
 }finally{await Promise.all(contexts.filter(c=>!c.closed).map(c=>c.close()));chromium.launchPersistentContext=launch;}
});
