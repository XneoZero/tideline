import test from 'node:test';
import assert from 'node:assert/strict';
import {collectSocial} from '../src/social-collectors.mjs';
const source={type:'bilibili',platform:'bilibili',accountId:'3747571004608077',url:'https://space.bilibili.com/3747571004608077',name:'Test',limit:3};
const request=async()=>({ok:false,status:412});
const timeout=()=>Object.assign(new Error('page.goto: Timeout 45000ms exceeded.\nCall log'),{name:'TimeoutError'});
test('Bilibili retries transient browser failure in a new session and preserves API warning',async()=>{
 let sessions=0;
 const rows=await collectSocial(source,{request,withPage:async()=>{if(++sessions===1)throw timeout();return [];}});
 assert.equal(sessions,2);assert.equal(rows.warnings[0].error,'HTTP 412');
});
test('Bilibili retry is bounded and final error includes both acquisition failures',async()=>{
 let sessions=0;
 await assert.rejects(collectSocial(source,{request,withPage:async()=>{sessions++;throw timeout();}}),e=>/HTTP 412/.test(e.message)&&/重试后仍失败/.test(e.message)&&/Timeout/.test(e.message));
 assert.equal(sessions,2);
});
test('Bilibili never retries authentication, verification or browser lock failures',async()=>{
 for(const message of ['AUTH_REQUIRED: 请先登录','PLATFORM_BLOCKED: 安全验证','平台登录或采集正在使用浏览器']){
  let sessions=0;
  await assert.rejects(collectSocial(source,{request,withPage:async()=>{sessions++;throw new Error(message);}}));
  assert.equal(sessions,1);
 }
});
