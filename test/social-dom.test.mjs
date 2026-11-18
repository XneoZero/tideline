import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {readSocialDom} from '../src/social-dom.mjs';
import {normalizeSocialPost} from '../src/social-collectors.mjs';
const documentFor=html=>{const $=load(html);const wrap=node=>node?{get href(){return $(node).attr('href')},get textContent(){return $(node).text()},querySelector:s=>wrap($(node).find(s)[0]),querySelectorAll:s=>$(node).find(s).toArray().map(wrap)}:null;return {body:{textContent:$.text()},querySelector:s=>wrap($(s)[0]),querySelectorAll:s=>$(s).toArray().map(wrap)}};
test('XHS prefers the signed note link over an unsigned cover or signed author link',()=>{
const uid='a'.repeat(24),nid='b'.repeat(24);
const profile=readSocialDom(documentFor(`<section class="note-item"><a class="cover" href="https://www.xiaohongshu.com/explore/${nid}"></a><a href="https://www.xiaohongshu.com/user/profile/${uid}?xsec_token=author">author</a><a href="https://www.xiaohongshu.com/user/profile/${uid}/${nid}?xsec_token=note&amp;xsec_source=pc_user">note</a><span class="title">title</span></section>`),'xiaohongshu');
assert.equal(profile.cards.length,1);assert.equal(new URL(profile.cards[0].url).searchParams.get('xsec_token'),'note');assert.ok(profile.cards[0].url.includes('/'+nid+'?'));
});

test('Bilibili verification page is blocked even when its body is empty',()=>{
 const page={...documentFor(''),title:'验证码_哔哩哔哩'};
 assert.equal(readSocialDom(page,'bilibili').blocked,true);
});

test('Bilibili direct video uploads can be collected without a dynamic permalink',()=>{
 const doc=documentFor('<div class="bili-dyn-item"><span class="bili-dyn-time">11月12日 · 投稿了视频</span><a class="bili-dyn-card-video" href="https://www.bilibili.com/video/BV1aEW96AEEk/?tracking=drop"><span class="bili-dyn-card-video__title">视频标题</span><span class="bili-dyn-card-video__desc">视频简介</span></a></div>');
 const [card]=readSocialDom(doc,'bilibili').cards;
 const source={type:'bilibili',accountId:'123',url:'https://space.bilibili.com/123',lookbackDays:30};
 const note=normalizeSocialPost(card,source,{now:Date.parse('2026-11-18T04:00:00Z')});
 assert.equal(note.url,'https://www.bilibili.com/video/BV1aEW96AEEk/');
 assert.equal(note.title,'视频标题');
 assert.equal(note.content,'视频简介');
 assert.equal(note.publishedAt,'2026-11-11T16:00:00.000Z');
});
