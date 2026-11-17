import {execFileSync} from 'node:child_process';
export function resolveXProxy(env=process.env){
 const explicit=env.FEED_X_PROXY||env.X_EDGE_PROXY||env.HTTPS_PROXY||env.HTTP_PROXY||env.ALL_PROXY;
 if(explicit)return {server:explicit,source:'environment'};
 if(process.platform==='win32')try{
  const text=execFileSync('reg',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{encoding:'utf8',windowsHide:true,timeout:3000});
  if(/ProxyEnable\s+REG_DWORD\s+0x1/i.test(text)){
   const raw=text.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/)?.[1].trim();
   const selected=raw?.includes('=')?(raw.match(/(?:^|;)https=([^;]+)/)?.[1]||raw.match(/(?:^|;)http=([^;]+)/)?.[1]):raw;
   if(selected)return {server:/^[a-z]+:\/\//i.test(selected)?selected:'http://'+selected,source:'windows-system-proxy'};
  }
 }catch{}
 return {server:null,source:'direct'};
}
