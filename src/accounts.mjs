import {serviceError} from './errors.mjs';
export const platforms=[{id:'bilibili',name:'哔哩哔哩',hint:'UID 或 https://space.bilibili.com/UID',loginAvailable:true},{id:'xiaohongshu',name:'小红书',hint:'https://www.xiaohongshu.com/user/profile/账号ID',loginAvailable:true},{id:'x',name:'X',hint:'@账号 或 https://x.com/账号',loginAvailable:true}];
export const isAccount=s=>platforms.some(p=>p.id===s.type);
export function normalizeAccount(input){
 const platform=input.platform||input.type;if(!platforms.some(p=>p.id===platform))throw serviceError('不支持的账号平台');
 const raw=String(input.url||'').trim();let url,accountId;
 if(platform==='bilibili'&&/^\d{1,20}$/.test(raw))url=new URL('https://space.bilibili.com/'+raw);
 else if(platform==='x'&&/^@?\w{1,15}$/.test(raw))url=new URL('https://x.com/'+raw.replace(/^@/,''));
 else try{url=new URL(raw);}catch{throw serviceError('请输入完整账号主页地址');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw serviceError('账号地址必须为 HTTP(S) 主页');
 if(platform==='bilibili'){
  if(url.hostname!=='space.bilibili.com'||!/^\/\d{1,20}(?:\/(?:dynamic|upload(?:\/video)?))?\/?$/.test(url.pathname))throw serviceError('Bilibili 需要个人空间主页或 UID，不接受单个视频地址');
  accountId=BigInt(url.pathname.split('/')[1]).toString();if(accountId==='0')throw serviceError('UID 必须大于0');url=new URL('https://space.bilibili.com/'+accountId);
 }else if(platform==='xiaohongshu'){
  const match=url.pathname.match(/^\/user\/profile\/([a-f0-9]{24})\/?$/i);
  if(!['www.xiaohongshu.com','xiaohongshu.com'].includes(url.hostname)||!match)throw serviceError('小红书需要 /user/profile/ 开头的完整主页，不接受短链或单条笔记');
  accountId=match[1].toLowerCase();url.hostname='www.xiaohongshu.com';url.protocol='https:';url.pathname='/user/profile/'+accountId;
  for(const key of [...url.searchParams.keys()])if(!['xsec_token','xsec_source'].includes(key))url.searchParams.delete(key);
 }else{
  const match=url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i);
  if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(url.hostname)||!match||['home','login','explore','settings','notifications','messages','i'].includes(match[1].toLowerCase()))throw serviceError('X 需要有效账号主页');
  accountId=match[1].toLowerCase();url=new URL('https://x.com/'+accountId);
 }
 const name=String(input.name||'').trim();if(!name||name.length>160)throw serviceError('账号名称需为1到160字');
 const manufacturer=String(input.manufacturer||'').trim();if(manufacturer.length>100)throw serviceError('厂商名称最多100字');
 const lookbackDays=input.lookbackDays??30,limit=input.limit??3;
 if(!Number.isInteger(lookbackDays)||lookbackDays<1||lookbackDays>365||!Number.isInteger(limit)||limit<1||limit>10)throw serviceError('时间范围为1到365天，每轮条数为1到10');
 if(input.officialClaim!==undefined&&typeof input.officialClaim!=='boolean')throw serviceError('官方身份标记必须是布尔值');
 if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw serviceError('enabled 必须是布尔值');
 let verificationUrl=String(input.verificationUrl||'').trim();if(verificationUrl){try{const u=new URL(verificationUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error();verificationUrl=u.href;}catch{throw serviceError('身份依据链接必须是 HTTP(S) 地址');}}
 return {id:platform+'-'+accountId,type:platform,platform,accountId,handle:accountId,name,authorName:name,manufacturer,url:url.href,kind:'account',limit,lookbackDays,enabled:input.enabled===true,officialClaim:input.officialClaim===true,identityStatus:input.officialClaim?'user_marked':'unverified',verificationUrl};
}
