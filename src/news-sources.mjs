import {load} from 'cheerio';
import {fetchText} from './http.mjs';
export const builtInSources=[
 {id:'openai-official',name:'OpenAI 官方新闻',type:'news',adapter:'openai',kind:'official',url:'https://openai.com/news/rss.xml',limit:3,enabled:true},
 {id:'anthropic-official',name:'Anthropic 官方新闻',type:'news',adapter:'anthropic',kind:'official',url:'https://www.anthropic.com/news',limit:3,enabled:true},
 {id:'qbitai-media',name:'量子位',type:'news',adapter:'qbitai',kind:'media',url:'https://www.qbitai.com/',limit:3,enabled:true}
];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const date=s=>{if(!s)return null;const value=/^\d{4}-\d{2}-\d{2}$/.test(s)?s+'T00:00:00Z':/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(s)?s+' UTC':s;const n=Date.parse(value);return Number.isFinite(n)?new Date(n).toISOString():null;};
export function discoverNews(html,source){
 const $=load(html),found=new Map();
 const selector=source.adapter==='qbitai'?'h4 a[href], h3 a[href], h2 a[href]':'a[href^="/news/"]';
 $(selector).each((_,a)=>{
  const anchor=$(a),href=anchor.attr('href');let url;try{url=new URL(href,source.url);}catch{return;}
  if(url.hostname!==new URL(source.url).hostname)return;
  if(source.adapter==='qbitai'?!/^\/\d{4}\/\d{2}\/\d+\.html$/.test(url.pathname):!/^\/news\/(?!announcements$|research$|policy$|features$|science$|economics$|agents$|commitments$)[a-z0-9-]+$/.test(url.pathname))return;
  const title=clean(anchor.find('h2,h3,h4').first().text()||anchor.text());
  if(title.length<8||['Read more','Learn more'].includes(title))return;
  const card=anchor.closest('li,article').length?anchor.closest('li,article'):anchor;
  const rawDate=card.find('time').first().attr('datetime')||clean(card.text()).match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}/)?.[0];
  if(!found.has(url.href))found.set(url.href,{title,url:url.href,publishedAt:rawDate?date(rawDate):null,tags:[]});
 });
 const rows=[...found.values()];if(!rows.length)throw new Error('页面没有发现可用新闻链接，可能页面结构已变化');return rows;
}
export function extractArticle(html,url){
 const $=load(html);const title=clean($('h1').first().text()||$('meta[property="og:title"]').attr('content'));
 if(/^(news|newsroom|features|research|policy|announcements|science|economics|agents)$/i.test(title))throw new Error('检测到分类列表页，拒绝作为文章入库');
 const localDay=clean($('.article_info .date').text()),localTime=clean($('.article_info .time').text());
 const publishedAt=date($('meta[property="article:published_time"]').attr('content')||$('time[datetime]').first().attr('datetime')||(/^\d{4}-\d{2}-\d{2}$/.test(localDay)?`${localDay}T${/^\d{2}:\d{2}:\d{2}$/.test(localTime)?localTime:'00:00:00'}+08:00`:null));
 const authorName=clean($('meta[name="author"]').attr('content')||$('.article_info .author').text());
 $('script,style,nav,header,footer,aside,form,button,noscript').remove();
 const selectors=['.article-content','.entry-content','[class*="Body-module"][class*="body"]','article','.article','main'];let content='';
 for(const selector of selectors){const root=$(selector).first();const paragraphs=root.find('p,h2,h3,li').toArray().map(p=>clean($(p).text())).filter(t=>t.length>15);const text=paragraphs.join('\n\n');if(text.length>150){content=text;break;}}
 if(!content)throw new Error('没有提取到足够的文章正文');
 return {title,content:content.slice(0,16000),publishedAt,authorName,acquisition:{method:'http-html',contentScope:'article-extract',fetchedAt:new Date().toISOString(),detailUrl:url,truncated:content.length>16000}};
}
export async function collectNews(source,{parseFeed,request=fetchText,seen=()=>false}={}){
 const html=await request(source.url);
 let candidates=source.adapter==='openai'?parseFeed(html):discoverNews(html,source);
 candidates=candidates.sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
 // 每轮只看最新窗口，避免重复采集时无限向历史回填。
 const limit=Math.min(10,Math.max(1,source.limit||3)),rows=[],warnings=[];
 for(const item of candidates.slice(0,limit)){
  if(seen(item.url)){rows.push(item);continue;}
  try{const detail=extractArticle(await request(item.url),item.url);rows.push({...item,...detail,title:detail.title||item.title,publishedAt:detail.publishedAt||item.publishedAt});}
  catch(e){warnings.push({url:item.url,error:e.message});if((item.content||'').length>=100)rows.push({...item,acquisition:{method:'rss',contentScope:'feed-summary-only',detailError:e.message,fetchedAt:new Date().toISOString()}});}
 }
 if(!rows.length)throw new Error(`正文采集全部失败：${warnings.map(w=>w.error).join('；')||'来源无可用条目'}`);
 rows.warnings=warnings;return rows;
}
