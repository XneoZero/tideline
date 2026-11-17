import {platforms,isAccount,normalizeAccount} from './accounts.mjs';
import {platformStatus,openPlatformLogin,finishPlatformLogin} from './platform-sessions.mjs';
import {xStatus,openXLogin,finishXLogin} from './x-collector.mjs';
import {serviceError} from './errors.mjs';
export function registerAccountRoutes(app,store){
 const status=id=>id==='x'?xStatus():platformStatus(id);
 const validate=id=>{if(!platforms.some(p=>p.id===id))throw serviceError('未知平台');};
 app.get('/api/v1/platforms',(_,res)=>res.json(platforms.map(p=>({...p,connection:status(p.id)}))));
 app.get('/api/v1/platforms/:id/status',(req,res)=>{validate(req.params.id);res.json(status(req.params.id));});
 app.post('/api/v1/platforms/:id/connect',async(req,res)=>{validate(req.params.id);res.json(await(req.params.id==='x'?openXLogin():openPlatformLogin(req.params.id)));});
 app.post('/api/v1/platforms/:id/finish',async(req,res)=>{validate(req.params.id);res.json(await(req.params.id==='x'?finishXLogin():finishPlatformLogin(req.params.id)));});
 app.get('/api/v1/accounts',(_,res)=>res.json(store.sources().filter(isAccount)));
 app.post('/api/v1/accounts',(req,res)=>{const account=normalizeAccount(req.body);if(store.sources().some(s=>s.id===account.id||(isAccount(s)&&s.type===account.type&&String(s.accountId||s.handle).toLowerCase()===account.accountId)))throw serviceError('此账号已经关注，请使用现有账号入口',409);store.saveSource(account);res.status(201).json(account);});
 app.patch('/api/v1/accounts/:id',(req,res)=>{
  const existing=store.sources().find(s=>s.id===req.params.id&&isAccount(s));if(!existing)throw serviceError('账号不存在',404);
  const allowed=['name','manufacturer','officialClaim','verificationUrl','enabled','lookbackDays','limit'];if(Object.keys(req.body).some(k=>!allowed.includes(k)))throw serviceError('只允许修改账号显示、身份标记和采集设置');
  const account=normalizeAccount({...existing,...req.body,platform:existing.type});account.id=existing.id;store.saveSource(account);res.json(account);
 });
}
