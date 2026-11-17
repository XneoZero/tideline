// 对齐 AI information/lib/public-feed.ts 的公开交换格式；不读取其密钥或登录态。
export function normalizePublicFeed(payload) {
 if(!payload||!Array.isArray(payload.signals)||payload.signals.length>500)throw new Error('公开导出须包含 signals 数组，最多500条');
 return payload.signals.map(s=>({
   title:s.originalTitle||s.title,content:s.originalBody||s.body||s.summaryZh||'',url:s.originalUrl,
   publishedAt:s.postedAt||null,tags:Array.isArray(s.topics)?s.topics:[],
   authorName:String(s.authorName||'').slice(0,160),authorHandle:String(s.authorHandle||'').slice(0,160),
   sourceKind:s.sourceKind==='x_person'?'x_person':s.sourceType?.includes('official')?'official':'media',
   originalSourceName:String(s.sourceName||'AI information').slice(0,160),
   // 原项目输出作为导入记录展示，与本服务本轮模型分析分开。
   importedInterpretation:{zhTitle:String(s.title||'').slice(0,1000),zhSummary:String(s.summaryZh||'').slice(0,4000),whyItMatters:String(s.whyItMatters||'').slice(0,4000),signalAnalysis:String(s.signalAnalysis||'').slice(0,4000),insightForMe:String(s.insightForMe||'').slice(0,4000),origin:'AI information 公开导出，未在本服务重新分析'}
 }));
}
