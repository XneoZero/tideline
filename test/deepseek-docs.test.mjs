import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../src/core.mjs';
import {createCollectionService} from '../src/collection-service.mjs';
import {collectDeepSeekDocs,deepseekDocsSource as source} from '../src/deepseek-docs.mjs';

test('DeepSeek 基线、条件请求、正文差异及同一 URL 的多次修订',async()=>{
 const store=createStore();
 try{
  store.saveSource(source);
  const origin=new URL(source.url).origin;
  const newPage=origin+'/guides/new/';
  const sitemap=pages=>'<urlset>'+pages.map(url=>'<url><loc>'+url+'</loc></url>').join('')+'</urlset>';
  const document=(setting,banner='')=>'<header>'+banner+'</header><main><article><div class="markdown">'+
   '<h1>API guide</h1><p>Unchanged paragraph</p><h2 id="settings">Settings</h2>'+
   '<pre><code>mode='+setting+'<br>  nested=true</code></pre></div></article></main>';
  const responses=new Map([
   [origin+'/sitemap.xml',{text:sitemap([source.url.slice(0,-1)]),etag:'s1'}],
   [source.url,{text:document('beta'),etag:'p1'}]
  ]);
  const requests=[];
  const request=async(url,{validators})=>{
   requests.push({url,validators});
   const reply=responses.get(url);
   if(!reply)throw new Error('temporary error');
   return validators?.etag===reply.etag?{notModified:true}:{text:reply.text,validators:{etag:reply.etag}};
  };
  const service=createCollectionService(store,{collectFn:(s,options)=>collectDeepSeekDocs(s,{...options,request})});
  const run=async()=>(await service.run(source.id)).results[0];
  assert.deepEqual((await run()).documentChecks,{tracked:1,checked:1,unchanged:0,baselined:1});
  assert.equal(store.all().length,0);
  assert.equal((await run()).documentChecks.unchanged,1);
  assert.equal(requests.at(-1).validators.etag,'p1');

  responses.set(source.url,{text:document('beta','new banner'),etag:'p2'});
  assert.equal((await run()).added,0);
  responses.set(source.url,{text:document('stable'),etag:'p3'});
  assert.equal((await run()).added,1);
  assert.match(store.all()[0].content,/Settings[\s\S]+mode=stable\n  nested=true[\s\S]+mode=beta/);
  assert.doesNotMatch(store.all()[0].content,/Unchanged paragraph/);
  assert.equal(store.all()[0].openUrl,source.url);
  assert.equal(store.all()[0].publishedAt,null);

  responses.set(origin+'/sitemap.xml',{text:sitemap([source.url,newPage]),etag:'s2'});
  assert.equal((await run()).status,'failed');
  responses.set(newPage,{text:document('new'),etag:'n1'});
  responses.set(source.url,{text:document('latest'),etag:'p4'});
  assert.equal((await run()).added,2);
  assert.equal(store.all().filter(item=>item.url===source.url).length,2);
  assert.equal(store.all().find(item=>item.url===newPage).acquisition.changeType,'new');
  assert.equal((await run()).added,0);
 }finally{store.db.close();}
});
