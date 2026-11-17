// 在 whale-core 的装配层注入此客户端；不要从传输层直接写入 Core 数据库。
export function createInformationFeedClient({baseUrl='http://127.0.0.1:4317',token=process.env.FEED_API_TOKEN}={}) {
 async function request(path,body){
  if(!token)throw new Error('缺少 FEED_API_TOKEN');
  const response=await fetch(new URL('/api/v1/whale/'+path,baseUrl),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);return result;
 }
 return {read:({q='',tag='',kind='',platform='',manufacturer='',retained=false,includeDemo=false}={})=>request('feed?'+new URLSearchParams({q,tag,kind,platform,manufacturer,retained:String(retained),includeDemo:String(includeDemo)})),ingest:items=>request('ingest',{items}),acknowledge:ids=>request('ack',{ids})};
}
