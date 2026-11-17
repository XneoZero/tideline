export const localDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(value));
export function buildDailyBrief(store,day=localDay(Date.now())){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day)))throw new Error('日期格式必须是 YYYY-MM-DD');
 const candidates=store.all().filter(i=>!i.demo&&i.acquisition?.eligibleForAnalysis!==false&&localDay(i.publishedAt||i.collectedAt)===day);
 const signals=candidates.filter(i=>i.analysis?.status==='completed'&&i.analysis.retained).sort((a,b)=>b.analysis.importanceScore-a.analysis.importanceScore);
 const brief={day,generatedAt:new Date().toISOString(),title:`AI 信号简报 · ${day}`,count:signals.length,pending:candidates.filter(i=>!['completed'].includes(i.analysis?.status)).length,items:signals.map(i=>({id:i.id,title:i.analysis.zhTitle,summary:i.analysis.zhSummary,whyItMatters:i.analysis.whyItMatters,sourceName:i.sourceName,url:i.url,publishedAt:i.publishedAt,contentScope:i.acquisition?.contentScope||'provided-text'})),limitations:['按上海时区的原文发布日期汇总，发布日期未知时才使用采集日','规则汇总已分析信号，没有额外生成模型综合结论']};
 const safe=s=>String(s).replace(/[\r\n]+/g,' ');
 brief.markdown=`# ${brief.title}\n\n有效信号 ${brief.count} 条，待处理 ${brief.pending} 条。\n\n`+brief.items.map((i,n)=>`## ${n+1}. ${safe(i.title)}\n\n${i.summary}\n\n为什么重要：${i.whyItMatters}\n\n来源：${i.sourceName}\n原文：${i.url}\n材料范围：${i.contentScope}\n`).join('\n');
 store.saveBrief(brief);return brief;
}
