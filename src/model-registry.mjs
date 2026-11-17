import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {modelConfig} from './analyzer.mjs';
import {normalizeModelBase,configReady} from './model-protocols.mjs';
import {serviceError} from './errors.mjs';
export const modelPresets=[
 {id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',protocol:'openai',requiresKey:true,jsonMode:true},
 {id:'openai',name:'OpenAI',baseUrl:'https://api.openai.com/v1',protocol:'openai',requiresKey:true,jsonMode:true},
 {id:'qwen',name:'阿里云百炼 / 千问',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',protocol:'openai',requiresKey:true,jsonMode:true},
 {id:'siliconflow',name:'硅基流动',baseUrl:'https://api.siliconflow.cn/v1',protocol:'openai',requiresKey:true,jsonMode:true},
 {id:'zhipu',name:'智谱',baseUrl:'https://open.bigmodel.cn/api/paas/v4',protocol:'openai',requiresKey:true,jsonMode:false},
 {id:'minimax',name:'MiniMax',baseUrl:'https://api.minimax.cn/v1',protocol:'openai',requiresKey:true,jsonMode:false},
 {id:'anthropic',name:'Anthropic',baseUrl:'https://api.anthropic.com/v1',protocol:'anthropic',requiresKey:true,jsonMode:false,apiVersion:'2026-10-21'},
 {id:'gemini',name:'Gemini（兼容接口）',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',protocol:'openai',requiresKey:true,jsonMode:true},
 {id:'ollama',name:'Ollama / 本地服务',baseUrl:'http://127.0.0.1:11434/v1',protocol:'openai',requiresKey:false,jsonMode:false},
 {id:'custom',name:'自定义 / 第三方中转',baseUrl:'',protocol:'openai',requiresKey:true,jsonMode:true}
];
export function createModelRegistry(store,{env=process.env,encryptionKey}={}){
 let master=encryptionKey||(store.memoryOnly?randomBytes(32):null);
 function getKey(){if(master)return master;const dir=new URL('../data/',import.meta.url);mkdirSync(dir,{recursive:true});const path=fileURLToPath(new URL('model-vault.key',dir));try{writeFileSync(path,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}master=readFileSync(path);if(master.length!==32)throw new Error('本机模型密钥库不可用');return master;}
 const encrypt=key=>{if(!key)return null;const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',getKey(),iv),data=Buffer.concat([cipher.update(key,'utf8'),cipher.final()]);return {iv:iv.toString('base64'),data:data.toString('base64'),tag:cipher.getAuthTag().toString('base64')};};
 const decrypt=sealed=>{if(!sealed)return '';try{const d=createDecipheriv('aes-256-gcm',getKey(),Buffer.from(sealed.iv,'base64'));d.setAuthTag(Buffer.from(sealed.tag,'base64'));return Buffer.concat([d.update(Buffer.from(sealed.data,'base64')),d.final()]).toString('utf8');}catch{throw serviceError('本机密钥库无法解密，请重新输入此连接的密钥',503);}};
 const all=()=>store.getState('models.providers',[]),activeId=()=>store.getState('models.active','env');
 const envConfig=()=>{const c=modelConfig(env);try{c.baseUrl=normalizeModelBase(c.baseUrl);}catch{c.baseUrl='';c.key='';}return ({...c,id:'env',providerName:'环境变量配置',protocol:'openai',requiresKey:true,jsonMode:true});};
 const publicEntry=p=>({id:p.id,vendor:p.vendor,name:p.name,baseUrl:p.baseUrl,model:p.model,protocol:p.protocol,requiresKey:p.requiresKey,jsonMode:p.jsonMode,apiVersion:p.apiVersion,hasKey:Boolean(p.sealed),updatedAt:p.updatedAt});
 function resolveDraft(input,{requireModel=false}={}){
  const previous=input.id&&input.id!=='env'?all().find(p=>p.id===input.id):null;if(input.id&&input.id!=='env'&&!previous)throw serviceError('模型连接不存在',404);
  if(input.id==='env')return envConfig();
  const preset=modelPresets.find(p=>p.id===(input.vendor||previous?.vendor||'custom'));if(!preset)throw serviceError('不支持的模型厂商');
  const value={...preset,...previous,...input},baseUrl=normalizeModelBase(value.baseUrl),name=String(value.name||preset.name).trim(),model=String(value.model||'').trim();
  if(!name||name.length>100||model.length>200||requireModel&&!model)throw serviceError('请填写连接名称及模型 ID');
  if(!['openai','anthropic'].includes(value.protocol))throw serviceError('请选择支持的接口协议');
  for(const flag of ['requiresKey','jsonMode'])if(typeof value[flag]!=='boolean')throw serviceError('模型选项必须为布尔值');
  if(input.apiKey!==undefined&&(typeof input.apiKey!=='string'||input.apiKey.length>4096||/[\r\n]/.test(input.apiKey)))throw serviceError('API Key 格式不正确');
  const newKey=String(input.apiKey||'').trim();if(previous&&new URL(previous.baseUrl).origin!==new URL(baseUrl).origin&&previous.sealed&&!newKey&&value.requiresKey)throw serviceError('更换 API 域名时请重新输入密钥，避免旧密钥发送到新地址');
  const key=newKey||(value.requiresKey&&previous?decrypt(previous.sealed):'');if(value.requiresKey&&!key)throw serviceError('请填写 API Key，或选择不需要密钥的本地服务');
  if(key&&model.includes(key))throw serviceError('模型 ID 不能包含 API Key');
  const apiVersion=String(value.apiVersion||'2026-10-21');if(!/^\d{4}-\d{2}-\d{2}$/.test(apiVersion))throw serviceError('Anthropic API版本需为日期格式');
  return {id:previous?.id||null,vendor:preset.id,name,providerName:name,baseUrl,model,protocol:value.protocol,requiresKey:value.requiresKey,jsonMode:value.jsonMode,apiVersion,key};
 }
 function activeConfig(){const id=activeId();if(id==='none')return null;if(id==='env')return envConfig();const p=all().find(p=>p.id===id);return p?{...p,key:decrypt(p.sealed),providerName:p.name}:null;}
 return {resolveDraft,activeConfig,activeId,
  snapshot(){const e=envConfig();let c=null,error=null;try{c=activeConfig();}catch(err){error=err.message;}return {activeId:activeId(),configured:configReady(c),active:c?{id:c.id,name:c.providerName,model:c.model,protocol:c.protocol}:null,error,providers:all().map(publicEntry),presets:modelPresets,environment:{id:'env',name:'环境变量配置',baseUrl:e.baseUrl,model:e.model,hasKey:Boolean(e.key),configured:configReady(e)}};},
  save(input){if(['env','none'].includes(input.id))throw serviceError('环境配置只读，请使用导入功能创建连接');const config=resolveDraft(input,{requireModel:true});const {key,...rest}=config;const entry={...rest,id:config.id||randomUUID(),sealed:encrypt(key),updatedAt:new Date().toISOString()};const entries=all().filter(p=>p.id!==entry.id);entries.push(entry);store.setState('models.providers',entries);return publicEntry(entry);},
  activate(id){if(!['env','none'].includes(id)){const p=all().find(p=>p.id===id);if(!p||!configReady({...p,key:decrypt(p.sealed)}))throw serviceError('请先保存完整可用的模型连接');}store.setState('models.active',id);return this.snapshot();},
  remove(id){if(id===activeId())throw serviceError('请先切换到其他连接或关闭模型分析，再删除当前连接',409);if(!all().some(p=>p.id===id))throw serviceError('模型连接不存在',404);store.setState('models.providers',all().filter(p=>p.id!==id));},
  importEnvironment(){const c=envConfig();if(!configReady(c))throw serviceError('环境变量配置不完整');return this.save({vendor:'custom',name:'从环境导入的模型',baseUrl:c.baseUrl,model:c.model,apiKey:c.key,protocol:'openai',requiresKey:true,jsonMode:true});}
 };
}
