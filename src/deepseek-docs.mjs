import {load} from 'cheerio';
import {XMLParser, XMLValidator} from 'fast-xml-parser';
import {hash} from './core.mjs';
import {fetchResource} from './http.mjs';

export const deepseekDocsSource = {
 id:'deepseek-api-docs', name:'DeepSeek 官方 API 文档', type:'deepseek-docs',
 kind:'official', manufacturer:'DeepSeek', enabled:true,
 url:'https://api-docs.deepseek.com/guides/build_a_chatbot/'
};

const origin = 'https://api-docs.deepseek.com';
const sitemapUrl = origin+'/sitemap.xml';
const clean = text => text.replace(/\s+/g,' ').trim();
const blocks = new Set(['div','p','li','ul','ol','section','blockquote','details','summary','br','hr']);
const heading = /^h[2-6]$/;

function documentUrls(xml) {
 if(XMLValidator.validate(xml)!==true)throw new Error('DeepSeek 站点地图 XML 无效');
 const entries=new XMLParser({isArray:(_,path)=>path==='urlset.url'}).parse(xml).urlset?.url;
 if(!entries?.length)throw new Error('DeepSeek 站点地图没有页面');
 const urls=new Set([deepseekDocsSource.url]);
 for(const {loc} of entries){
  const url=URL.parse(loc);
  if(url?.origin!==origin||url.username||url.password||url.search||url.hash||/^\/zh-cn(?:\/|$)/.test(url.pathname))continue;
  if(!url.pathname.endsWith('/'))url.pathname+='/';
  urls.add(url.href);
 }
 return [...urls];
}

export function extractDocument(html) {
 const $=load(html);
 const root=$('main article .markdown').first();
 root.find('script,style,noscript,nav,aside,footer,form,button,svg,.hash-link,.doc-page-actions').remove();
 const title=clean(root.find('h1').first().text());
 if(!title)throw new Error('未找到 DeepSeek 文档标题');
 const sections=[{key:'',label:'概览',blocks:[]}];
 const occurrences=new Map();
 let pending='';
 const flush=()=>{
  const text=clean(pending);
  if(text)sections.at(-1).blocks.push(text);
  pending='';
 };
 function visit(node){
  if(node.type==='text'){pending+=node.data;return;}
  if(node.type!=='tag'||node.name==='h1')return;
  if(heading.test(node.name)){
   flush();
   const label=clean($(node).text());
   const base=$(node).attr('id')||label;
   const occurrence=(occurrences.get(base)||0)+1;
   occurrences.set(base,occurrence);
   sections.push({key:JSON.stringify([base,occurrence]),label,blocks:[]});
   return;
  }
  if(node.name==='pre'){
   flush();
   $(node).find('br').replaceWith('\n');
   const code=$(node).text().replace(/\r\n/g,'\n').replace(/\n+$/,'');
   if(code.trim())sections.at(-1).blocks.push(code);
   return;
  }
  if(node.name==='tr'){
   flush();
   const cells=$(node).children('td,th').toArray();
   for(const [index,cell] of cells.entries()){
    if(index)pending+=' | ';
    pending+=$(cell).text();
    pending+=$(cell).find('a[href]').toArray().map(link=>' <'+$(link).attr('href')+'>').join('');
   }
   flush();
   return;
  }
  const boundary=blocks.has(node.name);
  if(boundary)flush();
  for(const child of node.children)visit(child);
  if(node.name==='a'&&node.attribs.href)pending+=' <'+node.attribs.href+'>';
  if(node.name==='img')pending+=' '+(node.attribs.alt||'')+' <'+(node.attribs.src||'')+'>';
  if(boundary)flush();
 }
 for(const node of root.contents())visit(node);
 flush();
 if(!sections.some(section=>section.blocks.length))throw new Error('未找到 DeepSeek 文档正文');
 return {title,sections};
}

function subtractBlocks(from,to) {
 const counts=new Map();
 for(const block of to)counts.set(block,(counts.get(block)||0)+1);
 return from.filter(block=>{
  const remaining=counts.get(block)||0;
  if(remaining)counts.set(block,remaining-1);
  return !remaining;
 });
}

function describeChange(previous,current) {
 if(!previous){
  const preview=current.sections.flatMap(section=>section.blocks).join('\n\n').slice(0,1200);
  return '发现新的官方文档页面。\n\n章节：'+current.sections.map(s=>s.label).join('、')+'\n\n'+preview;
 }
 const lines=[];
 if(previous.title!==current.title)lines.push('页面标题：'+previous.title+' → '+current.title);
 const before=new Map(previous.sections.map(section=>[section.key,section]));
 const after=new Map(current.sections.map(section=>[section.key,section]));
 for(const key of new Set([...after.keys(),...before.keys()])){
  const old=before.get(key),next=after.get(key);
  const removed=subtractBlocks(old?.blocks||[],next?.blocks||[]);
  const added=subtractBlocks(next?.blocks||[],old?.blocks||[]);
  if(!old||!next||old.label!==next.label||removed.length||added.length){
   const label=old&&next&&old.label!==next.label?old.label+' → '+next.label:(next||old).label;
   lines.push('## '+(!old?'新增章节：':!next?'删除章节：':'')+label);
   if(added.length)lines.push('更新内容\n'+added.join('\n\n'));
   if(removed.length)lines.push('原有内容\n'+removed.join('\n\n'));
  }else if(JSON.stringify(old.blocks)!==JSON.stringify(next.blocks)){
   lines.push('## '+next.label+'\n段落顺序调整');
  }
 }
 if(!lines.length)lines.push('章节顺序调整：'+current.sections.map(section=>section.label).join(' → '));
 return lines.join('\n\n');
}

export async function collectDeepSeekDocs(source,{state,request=fetchResource}={}) {
 const fetchPage=(url,validators)=>request(url,{validators,redirect:'error'});
 const sitemap=await fetchPage(sitemapUrl,state?.sitemap.validators);
 const urls=sitemap.notModified?state.sitemap.urls:documentUrls(sitemap.text);
 const initial=new Set(state?.initial||urls);
 const pages={...state?.pages};
 const rows=[],warnings=[];
 let nextIndex=0,checked=0,unchanged=0,baselined=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(nextIndex<urls.length){
   const url=urls[nextIndex++];
   const previous=pages[url];
   try{
    const response=await fetchPage(url,previous?.validators);
    if(response.notModified){checked++;unchanged++;continue;}
    const document=extractDocument(response.text);
    const digest=hash(JSON.stringify(document));
    let revision=previous?.revision||0;
    if(previous?.digest===digest){unchanged++;}
    else if(!previous&&initial.has(url)){baselined++;}
    else {
     revision++;
     const content=describeChange(previous?.document,document);
     rows.push({
      title:((previous?'文档更新 · ':'新增文档 · ')+document.title).slice(0,1000),
      url,content,tags:['DeepSeek','API 文档'],originalSourceName:source.name,
      acquisition:{method:'http-html',contentScope:'document-diff',documentRevision:revision,
       documentHash:digest,previousDocumentHash:previous?.digest||null,
       changeType:previous?'updated':'new',detailUrl:url,truncated:content.length>20000}
     });
    }
    pages[url]={validators:response.validators,document,digest,revision};
    checked++;
   }catch(e){warnings.push({url,error:e.message});}
  }
 }));
 if(!checked)throw new Error('DeepSeek 文档检查全部失败：'+warnings[0]?.error);
 rows.warnings=warnings;
 rows.checkpoint={sitemap:{urls,validators:sitemap.notModified?state.sitemap.validators:sitemap.validators},initial:[...initial],pages};
 rows.stats={tracked:urls.length,checked,unchanged,baselined};
 return rows;
}
