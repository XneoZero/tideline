import {esc} from './views.js';
import {runError} from './run-display.js';

export function workflowProgress({stage,withAnalysis,collection,analysis,message=''}) {
 const results=collection?.results||[];
 const resultBySource=new Map(results.map(result=>[result.sourceId,result]));
 const total=collection?.plan?.length||results.length;
 const added=results.reduce((count,result)=>count+(result.added||0),0);
 const duplicates=results.reduce((count,result)=>count+(result.duplicates||0),0);
 const skipped=collection?.skipped?.length||0;
 const current=stage==='collecting'&&collection?.plan?.[results.length];
 const currentText=current?'正在采集 '+current.name:'正在准备采集';
 const collecting=stage==='collecting';
 const analyzing=stage==='analyzing';
 const failed=stage==='failed'||analysis?.status==='failed'||collection?.status==='failed';
 const partial=analysis?.status==='partial'||collection?.status==='partial'||analysis?.budgetExhausted;
 const status=collecting?currentText:analyzing?'正在等待模型批量返回':failed?'运行失败':partial?'运行结束，有未完成项':'运行完成';
 const sourceRows=(collection?.plan||[]).map(({sourceId,name})=>{
  const result=resultBySource.get(sourceId);
  const state=result?.status==='failed'?'失败':result?'完成':current?.sourceId===sourceId?'采集中':'等待采集';
  const detail=result?.error?runError(result.error):result?`新增 ${result.added||0} · 去重 ${result.duplicates||0}`:'';
  return `<li><span>${esc(name)}</span><strong data-state="${state}">${state}</strong>${detail?`<small>${esc(detail)}</small>`:''}</li>`;
 }).join('');
 const track=(label,{value,max,waiting})=>`<div class="workflow-track"${waiting?' data-active':''}>
  <progress aria-label="${label}" max="${Math.max(1,max)}"${waiting&&value===null?'':` value="${value??0}"`}></progress>
 </div>`;
 return `<div class="panel-head"><h2>${withAnalysis?'采集与分析进度':'采集进度'}</h2><span class="badge ${failed?'failed':partial?'warning':''}" role="status">${esc(status)}</span></div>
  <div class="workflow-stages">
   <div>
    <h3>采集来源 <span>${total?`${results.length} / ${total}`:''}</span></h3>
    ${track('采集来源进度',{value:total?results.length:null,max:total,waiting:collecting})}
    <p>新增 ${added} · 去重 ${duplicates}${skipped?` · 跳过 ${skipped}`:''}</p>
   </div>
   ${withAnalysis?`<div>
    <h3>批量分析 <span>${analysis?.total?`${analysis.progress} / ${analysis.total} 条`:''}</span></h3>
    ${track('批量分析进度',{value:analyzing?null:analysis?.progress,max:analysis?.total||1,waiting:analyzing})}
    <p>${analyzing?'已提交一次批量分析请求，等待整体结果。':collecting?'采集结束后合并为一次模型请求。':analysis?.total?`${analysis.results.filter(row=>row.status==='ok').length} 条完成`:'本轮未发送模型请求。'}</p>
   </div>`:''}
  </div>
  ${message?`<p class="workflow-message">${esc(message)}</p>`:''}
  ${sourceRows?`<ul class="workflow-sources" aria-label="来源进度">${sourceRows}</ul>`:''}`;
}
