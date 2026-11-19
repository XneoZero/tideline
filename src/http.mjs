export async function fetchText(url,options) {
 return (await fetchResource(url,options)).text;
}
export async function fetchResource(url,{fetchImpl=fetch,retries=1,validators,redirect='follow'}={}) {
 const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw new Error('仅支持 HTTP(S)');
 for(let attempt=0;;attempt++){
  try{
   const headers={'User-Agent':'Tideline/0.3 (+local personal news reader)','Accept':'text/html,application/rss+xml,application/xml,application/json;q=0.9,*/*;q=0.8'};
   if(validators?.etag)headers['If-None-Match']=validators.etag;
   else if(validators?.lastModified)headers['If-Modified-Since']=validators.lastModified;
   const response=await fetchImpl(u,{signal:AbortSignal.timeout(20000),headers,redirect});
   if(response.status===304&&(validators?.etag||validators?.lastModified))return {notModified:true};
   if(!response.ok){const e=new Error(`HTTP ${response.status}`);e.retryable=response.status===429||response.status>=500;throw e;}
   const reader=response.body.getReader(),chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();const e=new Error('响应超过2MB');e.retryable=false;throw e;}chunks.push(Buffer.from(value));}
   return {text:Buffer.concat(chunks).toString('utf8'),validators:{
    etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified')
   }};
  }catch(e){if(attempt>=retries||e.retryable===false)throw e;await new Promise(r=>setTimeout(r,300*(attempt+1)));}
 }
}
