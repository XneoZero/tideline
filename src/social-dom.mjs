// 此函数原样在浏览器执行，不依赖Node变量；返回页面事实，后续在服务器校验日期与归属。
export function readSocialDom(document,platform){
 const body=document.body?.innerText||document.body?.textContent||'';
 const login=Boolean(document.querySelector('.login-container, .login-modal, .login-panel, .bili-mini-login'));
 const blocked=/安全验证|访问受限|请求过于频繁|异常流量|验证后继续/.test(body)
  ||(platform==='bilibili'&&(/^验证码[_ -]/.test(document.title||'')||/极验封禁/.test(body)));
 if(platform==='bilibili'){
  const cards=[...document.querySelectorAll('.bili-dyn-item, article[data-dynamic-id]')];
  return {login,blocked,empty:Boolean(document.querySelector('.bili-dyn-list__empty, .empty-state')),cards:cards.map(c=>{
   const anchors=[...c.querySelectorAll('a[href]')];const post=anchors.find(a=>/t\.bilibili\.com\/\d+|bilibili\.com\/opus\/\d+/.test(a.href));
   const video=c.querySelector('a.bili-dyn-card-video[href]');
   const videoDescription=c.querySelector('.bili-dyn-card-video__desc')?.textContent?.trim()||'';
   const text=c.querySelector('.bili-rich-text, .bili-dyn-content__main, [data-content]')?.textContent?.trim()||'';
   const content=[...new Set([text,videoDescription].filter(Boolean))].join('\n\n');
   const title=c.querySelector('.bili-dyn-card-video__title, [data-title]')?.textContent?.trim()||content.slice(0,160);
   const time=c.querySelector('.bili-dyn-time, .bili-dyn-item__time, [data-time]')?.textContent?.trim()||'';
   const ownVideo=/·\s*投稿了视频/.test(time)?video:null;
   const repost=/·\s*转发/.test(time)||(!ownVideo&&Boolean(c.querySelector('.bili-dyn-content__orig')));
   return {url:post?.href||ownVideo?.href||'',title,content,rawTime:c.querySelector('time')?.getAttribute('datetime')||time.split('·')[0].trim(),pinned:/置顶/.test(c.querySelector('.bili-dyn-item__tag, [data-pinned]')?.textContent||''),repost,authorUrl:anchors.find(a=>/space\.bilibili\.com\/\d+/.test(a.href))?.href||''};
  })};
 }
 const cards=[...document.querySelectorAll('section.note-item, .note-item')];
 return {login,blocked,empty:Boolean(document.querySelector('.empty-container, .empty-state')),cards:cards.map(c=>{
  const links=[...c.querySelectorAll('a[href]')].filter(a=>/\/(?:explore\/[a-f0-9]{24}|user\/profile\/[a-f0-9]{24}\/[a-f0-9]{24})(?:[?/#]|$)/i.test(a.href));
  // A card can contain an unsigned cover link before its signed detail link.
  const post=links.find(a=>/[?&]xsec_token=[^&]+/.test(a.href))||links[0];
  return {url:post?.href||'',title:c.querySelector('.title, [data-title]')?.textContent?.trim()||'',authorUrl:c.querySelector('.author-wrapper a[href], a.author[href]')?.href||''};
 })};
}
export function readXhsDetail(document){
 const root=document.querySelector('#noteContainer, .note-detail-mask, .note-detail, .note-scroller');
 if(!root)return null;
 return {title:root.querySelector('#detail-title, .title')?.textContent?.trim()||'',content:root.querySelector('#detail-desc, .note-text, .desc')?.textContent?.trim()||'',rawTime:root.querySelector('time')?.getAttribute('datetime')||root.querySelector('.date')?.textContent?.trim()||'',authorUrl:root.querySelector('.author-container a[href*="/user/profile/"], a.username[href], .author-wrapper a[href]')?.href||'',authorName:root.querySelector('.author-container .username, .author-wrapper .name')?.textContent?.trim()||''};
}
