import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import {serviceError} from './errors.mjs';
import {resolveXProxy} from './x-proxy.mjs';
const profile=fileURLToPath(new URL('../data/x-edge-profile',import.meta.url));
let occupied=false,loginContext=null,loginTimer=null;
let state={status:'not_checked',message:'使用本项目独立 Edge 登录目录，首次需要手动登录'};
export const xStatus=()=>({...state,busy:occupied,profileIsIsolated:true});
export const xPeople=[['Sam Altman','sama'],['Andrej Karpathy','karpathy'],['Elon Musk','elonmusk'],['Anthropic','AnthropicAI']].map(([name,handle])=>({id:'x-'+handle.toLowerCase(),name:'X · '+name,type:'x',kind:'x_person',authorName:name,handle,url:'https://x.com/'+handle,enabled:false,limit:3}));
export function normalizeXSource(input){
 const u=new URL(input.url);const handle=String(input.handle||u.pathname.split('/').filter(Boolean)[0]||'').replace(/^@/,'');
 if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)||!/^\w{1,15}$/.test(handle)||u.pathname.split('/').filter(Boolean).length!==1)throw serviceError('X 来源须为有效人物主页，例如 https://x.com/karpathy');
 return {...input,url:'https://x.com/'+handle,handle,kind:'x_person'};
}
async function launch(headless){
 mkdirSync(profile,{recursive:true});
 const proxy=resolveXProxy();state.proxySource=proxy.source;
 return chromium.launchPersistentContext(profile,{channel:process.platform==='win32'?'msedge':'chrome',headless,viewport:{width:1280,height:900},locale:'en-US',...(proxy.server?{proxy:{server:proxy.server}}:{})});
}
async function loggedIn(page){return page.evaluate(()=>Boolean(document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="SideNav_NewTweet_Button"]'))&&!/\/i\/flow\/login|\/login/.test(location.pathname));}
export async function openXLogin(){
 if(occupied)throw serviceError('X 浏览器正被使用，请稍后重试',409);occupied=true;state={status:'opening',message:'正在打开独立 Edge 登录窗口'};
 try{loginContext=await launch(false);const page=loginContext.pages()[0]||await loginContext.newPage();await page.goto('https://x.com/home',{waitUntil:'domcontentloaded',timeout:45000});state={status:'awaiting_login',message:'请在独立 Edge 窗口手动登录 X；成功后窗口会自动关闭'};
  const deadline=Date.now()+5*60000;
  loginContext.on('close',()=>{if(loginTimer)clearInterval(loginTimer);occupied=false;loginContext=null;if(state.status==='awaiting_login')state={status:'closed',message:'登录窗口已关闭，可重新连接'};});
  loginTimer=setInterval(async()=>{try{if(await loggedIn(page)){state={status:'ready',message:'已检测到登录，后续采集将复用本项目登录状态',checkedAt:new Date().toISOString()};clearInterval(loginTimer);await loginContext?.close();}else if(Date.now()>deadline){state={status:'login_timeout',message:'登录窗口等待超时，请重新连接'};clearInterval(loginTimer);await loginContext?.close();}}catch{clearInterval(loginTimer);}},2000);loginTimer.unref();return xStatus();
 }catch(e){await loginContext?.close().catch(()=>{});loginContext=null;occupied=false;state={status:'network_or_launch_error',message:'无法打开 X 登录页，请检查 Edge 和 FEED_X_PROXY；'+e.message.split('\n')[0]};throw serviceError(state.message,503);}
}
// 与真实浏览器共用的 DOM 解析器；可用离线 HTML 夹具验证，不请求私有 GraphQL。
export function extractVisibleX(document,handle,cutoffIso){
 const cutoff=Date.parse(cutoffIso),posts=[],skipped=[];const articles=[...document.querySelectorAll('article[data-testid="tweet"],article')];const seen=new Set();
 for(const article of articles){
  const text=article.innerText||article.textContent||'',time=article.querySelector('time'),anchor=time?.closest('a'),href=anchor?.getAttribute('href')||'';
  const match=href.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)|^\/([^/]+)\/status\/(\d+)/i);
  if(!match){skipped.push('missing_primary_status');continue;}
  const owner=match[1]||match[3],id=match[2]||match[4];
  if(owner.toLowerCase()!==handle.toLowerCase()){skipped.push('other_author_or_repost');continue;}
  if(/(?:^|\n)\s*(Pinned|置顶)\s*(?:\n|$)/i.test(text)||article.querySelector('[data-testid="socialContext"]')?.textContent?.match(/Pinned|置顶/i)){skipped.push('pinned');continue;}
  const postedAt=time?.getAttribute('datetime');if(!postedAt||!Number.isFinite(Date.parse(postedAt))||Date.parse(postedAt)<cutoff){skipped.push('old_or_unknown_date');continue;}
  const content=article.querySelector('[data-testid="tweetText"]')?.textContent?.trim();if(!content){skipped.push('empty_text');continue;}
  if(article.querySelector('[data-testid="tweet-text-show-more-link"]')){skipped.push('unexpanded_text');continue;}
  if(seen.has(id))continue;seen.add(id);posts.push({url:`https://x.com/${owner}/status/${id}`,content,publishedAt:new Date(postedAt).toISOString(),authorHandle:owner,authorName:handle,title:content.slice(0,160),sourceKind:'x_person',tags:[],acquisition:{method:'edge-visible-dom',contentScope:'visible-post-text',fetchedAt:new Date().toISOString(),limitations:['只覆盖本轮可见文本；图片、视频、引用及完整对话未解析']}});
 }return {posts:posts.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)),articleCount:articles.length,skipped};
}
export async function collectX(source){
 if(occupied)throw serviceError('X 登录窗口或其他采集正在使用浏览器',409);occupied=true;let context;
 try{
  context=await launch(true);const page=context.pages()[0]||await context.newPage();
  await page.goto('https://x.com/home',{waitUntil:'domcontentloaded',timeout:45000});await page.waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="SideNav_NewTweet_Button"], input[autocomplete="username"]',{timeout:12000}).catch(()=>{});
  if(!await loggedIn(page)){state={status:'auth_required',message:'X 未登录或登录失效，请在系统设置连接 X'};throw serviceError('AUTH_REQUIRED: '+state.message,401);}
  await page.goto(normalizeXSource(source).url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('article, [data-testid="emptyState"], [data-testid="error-detail"]',{timeout:15000}).catch(()=>{});
  for(let i=0;i<3;i++){if(await page.locator('article').count()>=8)break;await page.mouse.wheel(0,850);await page.waitForTimeout(700);}
  const buttons=page.locator('article [data-testid="tweet-text-show-more-link"]');for(let i=0;i<Math.min(8,await buttons.count());i++){await buttons.nth(i).click({timeout:1500}).catch(()=>{});}
  const body=await page.locator('body').innerText();if(/rate limit exceeded|temporarily restricted|超出.*限制|账号.*受限/i.test(body))throw serviceError('X_RATE_LIMIT: X 暂时限流，稍后重试',429);
  const expression='('+extractVisibleX.toString()+')(document,'+JSON.stringify(source.handle)+','+JSON.stringify(new Date(Date.now()-(source.lookbackDays||7)*86400000).toISOString())+')';
  const result=await page.evaluate(expression);
  if(!result.articleCount&&!await page.locator('[data-testid="emptyState"]').count())throw new Error('X_PAGE_UNAVAILABLE: 页面没有暴露推文，不能判为无新动态');
  state={status:'ready',message:'X 登录有效，本轮可见推文 '+result.articleCount+' 条',checkedAt:new Date().toISOString()};
  const rows=result.posts.slice(0,source.limit||3);rows.warnings=result.skipped.length?[{reason:'skipped_visible_posts',counts:result.skipped.reduce((a,k)=>(a[k]=(a[k]||0)+1,a),{})}]:[];return rows;
 }catch(e){if(state.status!=='auth_required')state={status:'collection_error',message:e.message.split('\n')[0]};throw e;}finally{await context?.close().catch(()=>{});occupied=false;}
}
