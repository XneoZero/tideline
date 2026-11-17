import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const files=execFileSync('git',['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
const names=['FEED_LLM_API_KEY','DEEPSEEK_API_KEY','FEED_API_TOKEN','ASTRBOT_API_TOKEN','GH_TOKEN','GITHUB_TOKEN'];
const forbidden=/^(?:data|node_modules|\.research|capture|checks|inbox|investigation\.cany|\.playwright-mcp)\//;
const issues=[];
for(const file of files){
 if(forbidden.test(file)||(/(?:^|\/)\.env(?:\.|$)/.test(file)&&file!=='.env.example'))issues.push(file+': runtime/private path');
 const content=execFileSync('git',['show',':'+file],{maxBuffer:5_000_000});
 for(const name of names){const secret=process.env[name];if(secret&&secret.length>=12&&content.includes(Buffer.from(secret)))issues.push(file+': contains configured '+name);}
 if(/\.(?:png|zip)$/.test(file))continue;
 const text=content.toString();
 if(/(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))issues.push(file+': credential-like value');
 if(/C:[\\/]Users[\\/]/i.test(text))issues.push(file+': machine-specific home path');
}
if(issues.length){process.stderr.write(issues.join('\n')+'\n');process.exit(1);}
console.log(`Publication scan passed: ${files.length} staged files, no configured credentials or private runtime paths.`);
