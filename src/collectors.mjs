import { XMLParser } from 'fast-xml-parser';
import { normalizePublicFeed } from './ai-information.mjs';
import {collectNews} from './news-sources.mjs';
import {collectDeepSeekDocs} from './deepseek-docs.mjs';
import {fetchText} from './http.mjs';
import {collectX} from './x-collector.mjs';
import {collectSocial} from './social-collectors.mjs';
export const demoRows=[
 ['智能体工具调用：从一次响应到可追踪的执行链','把采集记录、原文链接和处理步骤放在一起，让每一个结论都能回到来源。',['AI','智能体']],
 ['多源报道如何汇成一条值得关注的线索','同一事件的报道保留各自的出处。聚类是下一阶段的扩展，本版提供标签主题视图。',['产业','信息流']],
 ['为鲸鱼准备一份可按需读取的信息简报','Core 自主选择何时读取，信息站提供稳定的数据契约和可重试的确认接口。',['AI','whale-core']],
 ['让失败可见：采集运行不再用旧数据补空位','真实采集失败会记录错误；演示数据使用单独标记，不代表今天发生的新闻。',['工程']],
 ['从重点人物追踪到行业热点扫描','将人物信号卡的阅读体验与多站点采集工作流结合，保持轻量和可扩展。',['产业','AI']]
].map(([title,content,tags],i)=>({title,content,tags,url:`https://example.com/demo/${i+1}`}));
const array=x=>x==null?[]:Array.isArray(x)?x:[x];
export function parseFeed(text) {
 const p=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(text);
 const rows=p.rss?.channel?.item || p.feed?.entry;
 if(!rows) throw new Error('响应不是支持的 RSS/Atom');
 return array(rows).slice(0,100).map(r=>({title:String(r.title?.['#text']||r.title||''),url:typeof r.link==='string'?r.link:array(r.link).find(l=>!l['@_rel']||l['@_rel']==='alternate')?.['@_href'],content:String(r.description||r.summary?.['#text']||r.summary||r.content?.['#text']||'').replace(/<[^>]*>/g,''),publishedAt:r.pubDate||r.published||r.updated,tags:[]}));
}
export async function collect(source,options={}) {
 if(source.type==='demo') return demoRows;
 if(source.type==='x')return collectX(source);
 if(['bilibili','xiaohongshu'].includes(source.type))return collectSocial(source,options);
 if(source.type==='news')return collectNews(source,{parseFeed,...options});
 if(source.type==='deepseek-docs')return collectDeepSeekDocs(source,options);
 const u=new URL(source.url); if(!['http:','https:'].includes(u.protocol)) throw new Error('仅支持 HTTP(S)');
 const text=await fetchText(u);
 if(source.type==='rss')return parseFeed(text);
 if(source.type==='public-feed')return normalizePublicFeed(JSON.parse(text));
 if(source.type==='json'){const data=JSON.parse(text);const rows=Array.isArray(data)?data:data.items;if(!Array.isArray(rows)||rows.length>100)throw new Error('JSON 需要不超过100条的数组或 {items:[]}');return rows;}
 throw new Error('未知采集器');
}
