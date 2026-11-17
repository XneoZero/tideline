import {timingSafeEqual} from 'node:crypto';
import {localDay} from './briefs.mjs';
export function registerAstrBotRoutes(app,store){
 const prefix='/api/v1/astrbot';
 app.use(prefix,(req,res,next)=>{
  const token=process.env.ASTRBOT_API_TOKEN;if(!token)return res.status(503).json({error:'AstrBot 接口尚未配置独立令牌'});
  const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');const expected=Buffer.from(token),actual=Buffer.from(supplied);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'接口令牌无效'});next();
 });
 app.get(prefix+'/feed',(req,res)=>{
  const limit=Number(req.query.limit??5),offset=Number(req.query.offset??0);if(!Number.isInteger(limit)||limit<1||limit>20||!Number.isInteger(offset)||offset<0||offset>10000)return res.status(400).json({error:'limit 为1到20，offset 为0到10000'});
  const q=String(req.query.q||'').slice(0,200).toLowerCase(),platform=String(req.query.platform||''),manufacturer=String(req.query.manufacturer||'');
  if(platform&&!['x','bilibili','xiaohongshu'].includes(platform))return res.status(400).json({error:'不支持的平台筛选'});
  const all=store.all().filter(i=>!i.demo&&i.acquisition?.eligibleForAnalysis!==false&&i.analysis?.status==='completed'&&i.analysis.retained&&(!platform||i.platform===platform)&&(!manufacturer||i.manufacturer===manufacturer)&&(!req.query.source||i.sourceId===req.query.source)&&(!q||`${i.title} ${i.analysis.zhTitle} ${i.analysis.zhSummary} ${i.sourceName}`.toLowerCase().includes(q))).sort((a,b)=>(Date.parse(b.publishedAt||b.collectedAt)||0)-(Date.parse(a.publishedAt||a.collectedAt)||0));
  const items=all.slice(offset,offset+limit).map(i=>({id:i.id,title:i.analysis.zhTitle,summary:i.analysis.zhSummary,whyItMatters:i.analysis.whyItMatters,url:i.openUrl||i.url,publishedAt:i.publishedAt,collectedAt:i.collectedAt,source:{id:i.sourceId,name:i.sourceName,platform:i.platform||null,manufacturer:i.manufacturer||'',identityStatus:i.accountIdentity||'unverified'},contentScope:i.acquisition?.contentScope||'provided-text',limitations:i.analysis.limitations||['模型解读需回到原文核实']}));
  res.json({schemaVersion:'1.0',generatedAt:new Date().toISOString(),total:all.length,nextOffset:offset+limit<all.length?offset+limit:null,items});
 });
 app.get(prefix+'/brief',(req,res)=>{
  const day=String(req.query.day||localDay(Date.now()));if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day)))return res.status(400).json({error:'day 必须为 YYYY-MM-DD'});
  const brief=store.briefs().find(b=>b.day===day);if(!brief)return res.status(404).json({error:'该日尚无简报，请先在工作台生成'});res.json({schemaVersion:'1.0',brief});
 });
 app.get(prefix+'/sources',(_,res)=>res.json({schemaVersion:'1.0',sources:store.sources().filter(s=>s.type!=='demo').map(s=>{const u=s.url?new URL(s.url):null;return {id:s.id,name:s.name,platform:['x','bilibili','xiaohongshu'].includes(s.type)?s.type:null,manufacturer:s.manufacturer||'',identityStatus:s.identityStatus||'unverified',url:u?u.origin+u.pathname:null,enabled:s.enabled};})}));
 app.use(prefix,(_,res)=>res.status(405).json({error:'AstrBot 接口只提供只读查询'}));
}
