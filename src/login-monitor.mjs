// 登录窗口由用户关闭；检测登录仅更新状态，不关闭浏览器。
export function monitorLogin(context,{check,onStatus,onClose,intervalMs=2500}){
 let checking=false,closed=false;
 async function poll(){
  if(checking||closed)return;checking=true;
  try{const ready=await check();if(!closed)onStatus(ready);}
  catch{/* 页面跳转、退出登录和关窗期间的检测错误不结束手动操作。 */}
  finally{checking=false;}
 }
 const timer=setInterval(poll,intervalMs);timer.unref?.();
 context.on('close',()=>{closed=true;clearInterval(timer);onClose();});
 return {poll};
}
