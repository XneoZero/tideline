import {modelPanel} from './model-manager.js';
import {operationsSettings} from './operations.js';
import {scopeLabel} from './labels.js';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const titles = {
  dashboard: ['AI 信息工作台', '采集、筛选、分析与阅读，一眼掌握你的 AI 信息流。'],
  accounts: ['关注账号', '统一关注模型厂商与行业账号，连接平台、核对身份并采集动态。'],
  signals: ['AI 信号雷达', '人物动态、官方消息与媒体资讯，保留原文与中文解读。'],
  briefs: ['信号简报', '已分析信号按重要性汇总，每条解读都可返回原文。'],
  saved: ['稍后阅读', '保存值得回看的信号。'],
  monitor: ['运行监控', '查看真实采集与分析结果，失败、跳过和空运行也会保留。'],
  settings: ['系统设置', '管理 AI 来源启停、自动运行和模型配置。']
};
export const empty = s => `<div class="empty">${esc(s)}</div>`;
export const kindLabel = k => ({official:'官方动态',media:'媒体资讯',x_person:'人物动态',mixed:'混合来源',account:'账号动态'}[k] || '媒体资讯');
export const displayTitle = i => i.analysis?.status === 'completed' ? i.analysis.zhTitle : i.importedInterpretation?.zhTitle || i.title;
const statusText = s => ({completed:'已完成',partial:'部分失败',failed:'失败',running:'运行中',budget_exhausted:'额度已用尽'}[s] || s || '未运行');
export const badge = i => {
  if (i.demo) return '<span class="badge demo">演示数据</span>';
  if(i.acquisition?.eligibleForAnalysis===false)return '<span class="badge warning">材料不足或无效 · 不自动分析</span>';
  if (i.analysis?.status === 'completed') return `<span class="badge ${i.analysis.retained ? '' : 'warning'}">${i.analysis.retained ? 'AI 信号' : '已过滤'}</span>`;
  if (i.analysis?.status === 'failed') return '<span class="badge failed">分析失败</span>';
  if (i.analysis?.status === 'uncertain') return '<span class="badge warning">结果待确认</span>';
  if (i.importedInterpretation) return '<span class="badge">导入解读</span>';
  return `<span class="badge warning">${i.analysis?.status === 'running' ? '分析中' : '待分析'}</span>`;
};
const importedBadge = i => i.importedInterpretation && i.analysis?.status === 'completed' ? '<span class="badge">含导入解读</span>' : '';

export function cards(items) {
  return items.map(i => {
    const a = i.analysis?.status === 'completed' ? i.analysis : null;
    return `<article class="card">
      <div class="meta">
        <span>${esc(i.originalSourceName || i.sourceName)} · ${kindLabel(i.sourceKind)} ${i.authorHandle ? '· @' + esc(i.authorHandle) : ''}</span>
        <span>${badge(i)} ${importedBadge(i)} ${i.platform?`<span class="badge">${esc({x:"X",bilibili:"哔哩哔哩",xiaohongshu:"小红书"}[i.platform])}</span>`:""}　${i.publishedAt ? esc(i.publishedAt.slice(0, 10)) : '发布时间未知'}</span>
      </div>
      <h3>${esc(displayTitle(i))}</h3>
      <p>${esc(a?.zhSummary || i.importedInterpretation?.zhSummary || i.summary)}</p>
      ${i.platform?`<p class="muted">${esc(i.manufacturer||'未填写厂商')} · ${i.accountIdentity==='user_marked'?'官方身份由用户标记':'账号身份未核验'} · ${esc(scopeLabel(i.acquisition?.contentScope))}</p>`:''}
      ${i.acquisition?.contentScope==='feed-summary-only'?'<p class="muted">材料范围：仅官方订阅摘要，正文未能获取。</p>':''}
      <div class="tags">
        ${(a?.tags || i.tags).map(t => `<span>${esc(t)}</span>`).join('')}
        ${a ? `<span>${esc(a.signalType)} · 重要性 ${a.importanceScore}</span>` : ''}
      </div>
      ${a ? `<div class="analysis-block"><strong>${a.retained ? '为什么值得关注' : '过滤原因'}</strong><div>${esc(a.retained ? a.whyItMatters : a.filterReason)}</div></div>` : ''}
      ${i.analysis?.status === 'failed' ? `<p class="error-text">分析失败：${esc(i.analysis.error)}</p>` : ''}
      <div class="actions">
        <button data-detail="${i.id}">查看解读与原文</button>
        <button data-save="${i.id}">${i.saved ? '已收藏' : '＋ 稍后阅读'}</button>
        ${!i.demo&&i.acquisition?.eligibleForAnalysis!==false ? `<button data-analyze="${i.id}">${a ? '重新分析' : '分析此条'}</button>` : ''}
        <a href="${esc(i.openUrl||i.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>
        <small>${i.read ? '已读' : '未读'}</small>
      </div>
    </article>`;
  }).join('') || empty('当前范围没有信息。请在系统设置添加来源并开始采集。');
}

function lastResultFor(runs, id) {
  for (const run of runs || []) {
    const hit = (run.results || []).find(r => r.sourceId === id);
    if (hit) return hit;
  }
  return null;
}

export function dashboard(items, runs, sources = []) {
  const analyzed = items.filter(i => i.analysis?.status === 'completed');
  const retained = analyzed.filter(i => i.analysis.retained);
  const duplicates = runs.flatMap(r => r.results || []).reduce((n, r) => n + (r.duplicates || 0), 0);
  const batchSources = sources.filter(s => s.id !== 'ai-information' && s.type !== 'demo');
  const enabledSources = batchSources.filter(s => s.enabled !== false);
  const disabledSources = batchSources.filter(s => s.enabled === false);
  const hasDemo = sources.some(s => s.type === 'demo' && s.enabled !== false);
  const stats = [
    ['采集信息', items.length, '当前范围入库条目', '↓'],
    ['去重移除', duplicates, '范围内重复 URL · 含演示', '≋'],
    ['已完成分析', analyzed.length, '不含导入解读与演示数据', '◎'],
    ['有效 AI 信号', retained.length, '内容相关且具有实际价值', '✧']
  ];
  const day = d => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai'}).format(d);
  const trend = Array.from({length:7}, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const date = day(d);
    const results = runs.filter(r => r.kind === 'collect' && day(new Date(r.startedAt)) === date).flatMap(r => r.results || []);
    const unique = results.reduce((n, r) => n + (r.added || 0), 0);
    return {date, unique, raw: unique + results.reduce((n, r) => n + (r.duplicates || 0), 0)};
  });
  const max = Math.max(1, ...trend.map(t => t.raw));
  const top = [...retained].sort((a, b) => b.analysis.importanceScore - a.analysis.importanceScore).slice(0, 5);
  const latestAnalysis = runs.find(r => r.kind === 'analysis');
  const latestCollect = runs.find(r => r.kind === 'collect');
  const latestSkipped = latestCollect?.skipped?.length || 0;
  const latestAdded = (latestCollect?.results || []).reduce((n, r) => n + (r.added || 0), 0);
  const latestDuplicates = (latestCollect?.results || []).reduce((n, r) => n + (r.duplicates || 0), 0);
  const workflowNote = latestCollect
    ? `最近采集：${statusText(latestCollect.status)} · 新增 ${latestAdded} · 去重 ${latestDuplicates}${latestSkipped ? ` · 跳过 ${latestSkipped} 个停用来源` : ''}`
    : '尚未运行采集。';
  return `<section class="stats">${stats.map(([label, value, sub, icon]) => `<div>
      <div class="stat-top">${label}<span class="stat-icon">${icon}</span></div>
      <strong>${value}</strong><small>${sub}</small>
    </div>`).join('')}</section>
    <div class="grid">
      <section class="panel">
        <div class="panel-head"><h2>采集趋势 · 近 7 日</h2><small>最近30次采集运行 · 含演示</small></div>
        <div class="chart" role="img" aria-label="近7日原始采集与去重后数量：${trend.map(t => t.date + ' ' + t.raw + '/' + t.unique).join('，')}">
          ${trend.map(t => `<div class="chart-column"><span class="value">${t.raw} / ${t.unique}</span><span class="chart-bar" style="height:${t.raw / max * 80}%"></span><span class="chart-bar unique" style="height:${t.unique / max * 80}%"></span><label>${t.date.slice(5)}</label></div>`).join('')}
        </div>
        <div class="legend"><span><i></i>原始采集</span><span><i class="unique"></i>去重后</span></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>AI 处理工作流</h2><span class="badge">按需运行</span></div>
        <div class="steps">
          <div class="step"><b>1</b>多源采集<span>${enabledSources.length} 个真实来源启用${disabledSources.length ? ` / ${disabledSources.length} 个停用` : ''}${hasDemo ? ' · 演示单独采集' : ''}</span></div>
          <div class="step"><b>2</b>标准化与 URL 去重<span>${items.length} 条</span></div>
          <div class="step"><b>3</b>AI 相关性与价值筛选<span>${statusText(latestAnalysis?.status)}</span></div>
          <div class="step"><b>4</b>中文解读与信号简报<span>${retained.length} 个信号</span></div>
        </div>
        <p class="workflow-note">${esc(workflowNote)}</p>
        <p class="muted">批量采集只请求已启用的真实来源；停用来源会被跳过，演示源需单独选择。原文与模型解读分开保存。</p>
      </section>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>值得关注 · TOP 5</h2><button data-view="signals">查看全部信号 →</button></div>
      ${top.length ? top.map((i, n) => `<div class="rank-row"><div class="rank">${n + 1}</div><div class="rank-body"><h3>${esc(displayTitle(i))}</h3><small>${esc(i.sourceName)} · ${esc(i.analysis.signalType)} · 重要性 ${i.analysis.importanceScore}</small></div><button data-detail="${i.id}">查看解读</button></div>`).join('') : empty('暂无已分析的有效信号。采集真实来源并配置模型后，点击“分析待处理信息”。')}
    </section>`;
}

function sourceOutcome(source, runs) {
  const last = lastResultFor(runs, source.id);
  if (source.id === 'ai-information') return last ? `最近导入：新增 ${last.added || 0} 条，去重 ${last.duplicates || 0} 条` : '尚未导入公开数据';
  if (source.enabled === false) return last ? `已停用 · 上次采集：${last.status === 'ok' ? '成功' : '失败'} · 新增 ${last.added || 0}` : '已停用 · 批量采集会跳过';
  if (!last) return '尚未采集';
  return `上次采集：${last.status === 'ok' ? '成功' : '失败'} · 新增 ${last.added || 0} · 去重 ${last.duplicates || 0}${last.error ? ` · ${last.error}` : ''}`;
}

export function settings(sources, model, runs = [], extra = {}) {
  const managed = sources.filter(s => s.id !== 'ai-information');
  const enabled = managed.filter(s => s.enabled !== false);
  const disabled = managed.filter(s => s.enabled === false);
  const batch = managed.filter(s => s.type !== 'demo');
  const batchEnabled = batch.filter(s => s.enabled !== false);
  const batchDisabled = batch.filter(s => s.enabled === false);
  const imports = sources.filter(s => s.id === 'ai-information');
  const typeLabel = {rss:'RSS/Atom', json:'统一 JSON', 'public-feed':'公开 Feed', news:'新闻正文采集', x:'X人物动态', bilibili:'B站账号动态', xiaohongshu:'小红书笔记', demo:'演示'};
  return `${modelPanel(extra.models,extra.scheduler)}${operationsSettings(extra,esc)}<section class="panel" style="margin-top:18px"><div class="panel-head"><h2>内置信息来源</h2><button id="install-presets" class="primary">添加内置来源</button></div><p class="muted">包含 OpenAI、Anthropic、量子位，以及 B 站和小红书账号。新增社交账号默认停用，连接平台后可在「关注账号」启用。</p></section><div style="margin-top:18px">
    <section class="panel">
      <div class="panel-head"><h2>新增 AI 信息来源</h2></div>
      <form id="add" class="form-grid">
        <label>来源名称<input name="name" required placeholder="官方新闻、媒体或人物订阅"></label>
        <div class="form-row">
          <label>采集方式<select name="type"><option value="rss">RSS / Atom</option><option value="json">统一 JSON</option><option value="public-feed">AI information 公开 Feed</option><option value="x">X 人物主页</option></select></label>
          <label>来源分类<select name="kind"><option value="official">官方动态</option><option value="media">媒体资讯</option><option value="x_person">人物动态</option></select></label>
        </div>
        <label>订阅 / JSON 地址<input name="url" type="url" required placeholder="https://…"></label>
        <div class="form-row"><label>作者名称（选填）<input name="authorName"></label><label>人物账号（选填）<input name="handle" placeholder="sama"></label></div>
        <label class="check-line"><input name="enabled" type="checkbox" checked> 添加后立即启用，并参与批量采集</label>
        <button class="primary">＋ 添加来源</button>
      </form>
    </section>
  </div>
  <section class="panel" style="margin-top:22px">
    <div class="panel-head"><h2>来源管理</h2><small>${sources.length} 个来源 · ${enabled.length} 个启用${disabled.length ? ` · ${disabled.length} 个停用` : ''}${imports.length ? ` · ${imports.length} 个导入` : ''}</small></div>
    <div class="source-summary">
      <div><strong>${enabled.length}</strong><span>启用</span><strong>${disabled.length}</strong><span>停用</span></div>
      <p>批量采集只请求已启用的真实来源（当前 ${batchEnabled.length} 个可用${batchDisabled.length ? `，${batchDisabled.length} 个停用` : ''}），停用来源不会发起请求；手动采集停用来源会收到明确提示。演示源需单独选择，导入来源不参与采集。</p>
    </div>
    ${sources.map(s => {
      const importing = s.id === 'ai-information';
      const on = s.enabled !== false;
      return `<div class="source-row ${on || importing ? '' : 'source-off'}">
        <div class="source-main">
          <h3>${esc(s.name)}
            <span class="badge">${importing ? '导入记录' : s.type === 'demo' ? '演示来源' : kindLabel(s.kind)}</span>
            ${s.type === 'demo' ? '' : `<span class="badge">${esc(typeLabel[s.type] || s.type)}</span>`}
            ${importing ? '' : `<span class="badge ${on ? '' : 'warning'}">${on ? '已启用' : '已停用'}</span>`}
          </h3>
          <small>${esc(s.url || '本地演示 / 公开文件导入')}</small>
          <small class="source-outcome">${esc(sourceOutcome(s, runs))}</small>
        </div>
        <div class="source-actions">
          ${importing ? '<span class="badge">导入专用</span>' : `<button class="switch ${on ? 'on' : ''}" data-source-toggle="${s.id}" aria-pressed="${on}" aria-label="${on ? '停用' : '启用'}「${esc(s.name)}」" title="${on ? '停用来源' : '启用来源'}"><span></span></button>`}
        </div>
      </div>`;
    }).join('')}
  </section>`;
}

export function monitor(runs) {
  return `<section class="panel" style="margin-top:18px">
    <div class="panel-head"><h2>最近运行</h2><small>最近30次 · 跳过与失败都会保留</small></div>
    ${runs.map(r => {
      const results = r.results || [];
      const skipped = r.skipped || [];
      const kind = r.kind === 'analysis' ? (r.mode==='parallel'?'并行分析':'逐条分析') : r.kind === 'import' ? '公开数据导入' : r.kind === 'collect' ? '多源采集' : r.kind;
      return `<article class="card">
        <div class="meta"><span>${kind} · ${esc(r.startedAt)}</span><span class="badge ${['failed', 'partial'].includes(r.status) ? 'failed' : ''}">${esc(statusText(r.status))}</span></div>
        <p>${r.kind === 'analysis' ? `进度 ${r.progress || 0} / ${r.total || 0}` : `来源 ${results.length} 个${skipped.length ? ` · 跳过 ${skipped.length} 个停用来源` : ''}`}</p>
        ${skipped.length ? `<p class="skip-list">已跳过：${skipped.map(s => esc(s.name)).join('、')}</p>` : ''}
        <details><summary>查看步骤、跳过来源与错误</summary><pre>${esc(JSON.stringify({results, skipped}, null, 2))}</pre></details>
      </article>`;
    }).join('') || empty('尚无运行记录。')}
  </section>`;
}
