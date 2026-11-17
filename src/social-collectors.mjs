import {withPlatformPage} from './platform-sessions.mjs';
import {readSocialDom,readXhsDetail} from './social-dom.mjs';
import {parseSocialTime} from './social-time.mjs';
import {serviceError} from './errors.mjs';
import {normalizeAccount} from './accounts.mjs';
const insideWindow=(date,source,now)=>date&&Date.parse(date)>=now-(source.lookbackDays||30)*86400000&&Date.parse(date)<=now+86400000;
export function normalizeSocialPost(raw,source,{now=Date.now()}={}){
 const u=new URL(raw.url,source.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('非法动态地址');
 let id,url;
 if(source.type==='bilibili'){
  id=u.hostname==='t.bilibili.com'?u.pathname.match(/^\/(\d+)\/?$/)?.[1]:u.hostname==='www.bilibili.com'?u.pathname.match(/^\/opus\/(\d+)\/?$/)?.[1]:null;if(!id)throw new Error('非法Bilibili动态地址');url='https://t.bilibili.com/'+id;
  if(raw.authorId&&String(raw.authorId)!==source.accountId)throw new Error('动态作者与关注账号不一致');
  if(raw.authorUrl&&(new URL(raw.authorUrl).hostname!=='space.bilibili.com'||new URL(raw.authorUrl).pathname.split('/')[1]!==source.accountId))throw new Error('动态作者不匹配');
 }else{
  id=['www.xiaohongshu.com','xiaohongshu.com'].includes(u.hostname)?(u.pathname.match(/^\/explore\/([a-f0-9]{24})\/?$/i)||u.pathname.match(/^\/user\/profile\/[a-f0-9]{24}\/([a-f0-9]{24})\/?$/i))?.[1]:null;if(!id)throw new Error('非法小红书笔记地址');url='https://www.xiaohongshu.com/explore/'+id.toLowerCase();
  if(!raw.authorUrl||!['www.xiaohongshu.com','xiaohongshu.com'].includes(new URL(raw.authorUrl).hostname)||new URL(raw.authorUrl).pathname.split('/')[3]?.toLowerCase()!==source.accountId)throw new Error('无法验证笔记作者与关注账号一致');
 }
 if(raw.pinned||raw.repost)throw new Error('跳过置顶或转发');
 const publishedAt=parseSocialTime(raw.rawTime??raw.publishedAt,now);if(!publishedAt)throw new Error('日期未知，不能确认内容时效');if(!insideWindow(publishedAt,source,now))throw new Error('超出关注时间范围');
 const content=String(raw.content||'').trim(),title=String(raw.title||content.slice(0,160)).trim();if(!title)throw new Error('动态没有标题或正文');
 const eligible=raw.bodyAvailable!==false&&content.length>=20;
 return {title:title.slice(0,1000),url,openUrl:u.href,content:content||title,publishedAt,authorName:raw.authorName||source.authorName||source.name,authorHandle:source.accountId,sourceKind:'account',tags:source.manufacturer?[source.manufacturer]:[],acquisition:{method:raw.method||'edge-visible-dom',contentScope:source.type==='bilibili'?'dynamic-text-and-video-caption':'visible-note-text',eligibleForAnalysis:eligible,identityStatus:source.identityStatus||'unverified',limitations:['未转写视频、未识别图片、未解析完整评论','官方账号身份由用户核对，未自动认证',...(!eligible?['正文不足，仅保存元信息，不自动分析']:[])]}};
}
export function parseBilibiliFeed(payload,source,{now=Date.now()}={}){
 if(payload?.code!==0)throw serviceError(payload?.code===-101?'AUTH_REQUIRED: Bilibili需要登录':`BILIBILI_UNAVAILABLE: 接口返回 ${payload?.code??'未知结构'}`,payload?.code===-101?401:503);
 if(!Array.isArray(payload.data?.items))throw new Error('Bilibili动态返回结构变化，不能判断为无动态');
 const rows=[],warnings=[];
 for(const item of payload.data.items){try{const m=item.modules,author=m?.module_author,d=m?.module_dynamic,major=d?.major;
  if(!item.id_str||!author?.mid)throw new Error('缺少动态ID或作者');
  const desc=d?.desc?.text||major?.opus?.summary?.text||'',video=major?.archive;
  const content=[...new Set([desc,video?.title,video?.desc].filter(Boolean))].join('\n\n');
  rows.push(normalizeSocialPost({url:'https://t.bilibili.com/'+item.id_str,title:video?.title||major?.opus?.title||desc.slice(0,160),content,bodyAvailable:Boolean(desc||video?.desc),rawTime:String(author.pub_ts||''),authorId:String(author.mid),authorName:author.name,pinned:/置顶/.test(m?.module_tag?.text||''),repost:item.type==='DYNAMIC_TYPE_FORWARD',method:'bilibili-public-feed'},source,{now}));
 }catch(e){warnings.push({error:e.message});}}
 if(!rows.length&&payload.data.items.length&&warnings.some(w=>!/跳过置顶|超出关注时间范围/.test(w.error)))throw new Error('Bilibili动态无法验证：'+warnings.map(w=>w.error).join('；'));
 const result=rows.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,source.limit||3);result.warnings=warnings;return result;
}
export async function collectSocial(input,{seen=()=>false}={}){
 const source={...input,...normalizeAccount({...input,platform:input.type})};
 let publicApiWarning=null;
 if(source.type==='bilibili'){
  try{const response=await fetch('https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid='+source.accountId,{signal:AbortSignal.timeout(12000),headers:{'Referer':source.url,'User-Agent':'Mozilla/5.0'}});if(response.ok){return parseBilibiliFeed(await response.json(),source);}publicApiWarning={reason:'public_api_unavailable',error:'HTTP '+response.status()};}catch(e){publicApiWarning={reason:'public_api_unavailable',error:e.message.split('\n')[0]};}
 }
 return withPlatformPage(source.type,async page=>{
  const response=await page.goto(source.type==='bilibili'?source.url+'/dynamic':source.url,{waitUntil:'domcontentloaded',timeout:45000});
  if(response&&response.status()>=400)throw serviceError('平台主页访问失败 HTTP '+response.status(),503);
  const selector=source.type==='bilibili'?'.bili-dyn-item, .empty-state, .bili-mini-login':'section.note-item, .note-item, .login-container, .empty-container';
  await page.waitForSelector(selector,{timeout:15000}).catch(()=>{});await page.mouse.wheel(0,600);await page.waitForTimeout(500);
  const snapshot=await page.evaluate('('+readSocialDom.toString()+')(document,'+JSON.stringify(source.type)+')');
  if(snapshot.blocked)throw serviceError('PLATFORM_BLOCKED: 平台要求安全验证或限制访问，请在连接窗口人工处理',429);
  if(!snapshot.cards.length){if(snapshot.login)throw serviceError('AUTH_REQUIRED: 请先连接平台并手动登录',401);if(snapshot.empty)return [];throw new Error('PAGE_UNAVAILABLE: 未发现账号动态，不能判为无新内容');}
  const rows=[],warnings=[];
  for(const card of snapshot.cards.slice(0,Math.min(10,(source.limit||3)*2))){
   try{
    let raw=card;if(source.type==='xiaohongshu'){
     const note=new URL(card.url,source.url);if(!['www.xiaohongshu.com','xiaohongshu.com'].includes(note.hostname)||!/^\/(?:explore\/|user\/profile\/)[a-f0-9/]+$/i.test(note.pathname))throw new Error('笔记链接不是平台内容页');
     const stable=note.pathname.match(/[a-f0-9]{24}$/i)?.[0];if(!stable)throw new Error('缺少笔记ID');
     const canonical='https://www.xiaohongshu.com/explore/'+stable.toLowerCase();
     if(seen(canonical)){rows.push({title:card.title||'已采集笔记',url:canonical});continue;}
     await page.goto(note.href,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForSelector('#noteContainer, .note-detail, .note-detail-mask, .login-container',{timeout:10000}).catch(()=>{});
     const detail=await page.evaluate('('+readXhsDetail.toString()+')(document)');if(!detail)throw new Error('笔记正文不可见，可能需要登录或页面结构变化');raw={...card,...detail,url:note.href};
    }
    rows.push(normalizeSocialPost(raw,source));if(rows.length>=source.limit)break;
   }catch(e){warnings.push({error:e.message});}
  }
  if(!rows.length&&warnings.some(w=>!/跳过置顶|超出关注时间范围/.test(w.error)))throw new Error('没有可验证的账号正文：'+warnings.map(w=>w.error).join('；'));
  rows.warnings=[...(publicApiWarning?[publicApiWarning]:[]),...warnings];return rows;
 });
}
