import {monitorLogin} from './login-monitor.mjs';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {serviceError} from './errors.mjs';
const configs={bilibili:{home:'https://www.bilibili.com/',name:'Bilibili'},xiaohongshu:{home:'https://www.xiaohongshu.com/explore',name:'小红书'}};
const locks=new Set(),contexts=new Map(),states=new Map();
export const platformStatus=id=>({...states.get(id)||{status:'not_checked',message:'尚未连接，可尝试公开采集；需要登录时请手动连接'},busy:locks.has(id),profileIsIsolated:true});
async function launch(id,headless){const directory=fileURLToPath(new URL('../data/'+id+'-edge-profile',import.meta.url));mkdirSync(directory,{recursive:true});return chromium.launchPersistentContext(directory,{channel:process.platform==='win32'?'msedge':'chrome',headless,locale:'zh-CN',viewport:{width:1280,height:900}});}
async function loggedIn(page,id){
 if(id==='bilibili')return page.evaluate(async()=>{try{const r=await fetch('https://api.bilibili.com/x/web-interface/nav',{credentials:'include'});const j=await r.json();return j.code===0&&j.data?.isLogin===true;}catch{return false;}});
 return page.evaluate(()=>Boolean(document.querySelector('a.user[href*="/user/profile/"], .side-bar a[href*="/user/profile/"], .user-channel'))&&!document.querySelector('.login-container input, .login-modal input'));
}
export async function openPlatformLogin(id){
 if(!configs[id])throw serviceError('未知平台');if(locks.has(id))throw serviceError('平台浏览器正在使用中',409);locks.add(id);let context;
 try{context=await launch(id,false);contexts.set(id,context);const page=context.pages()[0]||await context.newPage();await page.goto(configs[id].home,{waitUntil:'domcontentloaded',timeout:45000});states.set(id,{status:'awaiting_login',message:'请在独立 Edge 窗口登录或退出旧账号后切换；完成后关闭窗口或点击“完成登录”'});
  monitorLogin(context,{check:()=>loggedIn(page,id),onStatus:ready=>states.set(id,{status:ready?'ready':'awaiting_login',message:ready?'已检测到登录，窗口保持打开；可退出旧账号并切换，完成后请关闭窗口或点击“完成登录”':'请在窗口中登录或切换账号，完成后关闭窗口或点击“完成登录”',checkedAt:new Date().toISOString()}),onClose:()=>{contexts.delete(id);locks.delete(id);const ready=states.get(id)?.status==='ready';states.set(id,{status:ready?'ready':'closed',message:ready?'登录窗口已关闭，后续采集将使用当前保存的账号':'登录窗口已关闭，可重新连接或切换账号',checkedAt:new Date().toISOString()});}});return platformStatus(id);
 }catch(e){await context?.close().catch(()=>{});contexts.delete(id);locks.delete(id);states.set(id,{status:'connection_error',message:e.message.split('\n')[0]});throw serviceError('打开平台登录页失败：'+e.message.split('\n')[0],503);}
}
export async function withPlatformPage(id,action){
 if(!configs[id])throw serviceError('未知平台');if(locks.has(id))throw serviceError('平台登录或采集正在使用浏览器',409);locks.add(id);let context;
 try{context=await launch(id,true);const page=context.pages()[0]||await context.newPage();const result=await action(page);states.set(id,{status:'last_collection_ok',message:'本次读取成功；不代表已验证账号官方身份',checkedAt:new Date().toISOString()});return result;}
 catch(e){states.set(id,{status:/AUTH_REQUIRED/.test(e.message)?'auth_required':'collection_error',message:e.message.split('\n')[0],checkedAt:new Date().toISOString()});throw e;}
 finally{await context?.close().catch(()=>{});locks.delete(id);}
}

export async function finishPlatformLogin(id){
 if(!configs[id])throw serviceError('未知平台');
 await contexts.get(id)?.close();return platformStatus(id);
}
