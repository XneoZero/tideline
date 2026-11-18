import {normalizeAccount} from './accounts.mjs';
import {builtInSources} from './news-sources.mjs';

const bilibili = [
 ['3747571004608077','DeepSeek Harness',''],
 ['3706937141103454','OpenCode 中文社区',''],
 ['3546878859807653','MiniMax','MiniMax'],
 ['3546607314274766','Kimi 智能助手','月之暗面']
];
const xiaohongshu = [
 ['66821202000000001b01a005','DeepSeek','DeepSeek'],
 ['6aa7f7300000000013031c04','DeepSeek Harness',''],
 ['5a48e8fe11be1032fcb7fd7b','GLM','智谱'],
 ['5c8a0f1e00000000110332a1','千问大模型','阿里巴巴']
];

export const sourcePresets = [
 ...builtInSources,
 ...bilibili.map(([url,name,manufacturer])=>normalizeAccount({platform:'bilibili',url,name,manufacturer})),
 ...xiaohongshu.map(([uid,name,manufacturer])=>normalizeAccount({
  platform:'xiaohongshu',url:'https://www.xiaohongshu.com/user/profile/'+uid,name,manufacturer
 }))
];
