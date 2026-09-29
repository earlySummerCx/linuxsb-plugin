const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const C = require('../src/core');
const base = 'https://linux.sb';
const doc = html => new JSDOM(html).window.document;
const profile = `<div class="user-card"><a class="user-name" href="/user/1">站长</a><img class="avatar-img" src="/avatar.jpg"><div class="user-rank"><span class="user-uid-badge-group-name">建设者</span> 积分 18,006</div><a class="gacha-title-badge gacha-title-ur"><span class="gacha-title-name">真的站长</span><span class="gacha-title-rarity">001</span></a><a href="/messages/new?to=1">私信TA</a></div><div class="sidebar-bio">独立的简介</div><li class="post-item"><a class="avatar-profile-link" href="/user/1"></a><a class="post-title" href="/topic/99">主题</a></li>`;
test('extracts separate profile fields and preserves actual message URL', () => {
 const p = C.parseProfile(doc(profile), '1', base);
 assert.equal(p.name, '站长'); assert.equal(p.points, '18,006'); assert.equal(p.bio, '独立的简介');
 assert.deepEqual(p.titles, [{ name: '真的站长', serial: '001', rarity: 'ur' }]);
 assert.equal(p.messageURL, base + '/messages/new?to=1'); assert.equal(p.latestTopicURL, base + '/topic/99');
 assert.equal(p.signature, undefined);
});
test('does not use sidebar logged-in viewer data for another user', () => {
 assert.throws(() => C.parseProfile(doc(profile), '2', base));
});
test('signature only comes from matching post author, never quoted users', () => {
 const html = `<li class="post-entry"><div class="post-avatar"><a href="/user/2"></a></div><a href="/user/1">mention</a><footer class="post-signature-content">wrong</footer></li><li class="post-entry"><div class="post-avatar"><a href="/user/1"></a></div><footer class="post-signature-content"><b>correct</b></footer></li>`;
 assert.deepEqual(C.signatureIn(doc(html), '1', base), { found: true, text: 'correct' });
 assert.deepEqual(C.signatureIn(doc(html), '3', base), { found: false, text: '' });
});
test('missing signature in a full post differs from unavailable data', () => {
 assert.deepEqual(C.signatureIn(doc('<li class="post-entry"><a class="post-author" href="/user/1">User</a></li>'), '1', base), { found: true, text: '' });
});
test('rejects foreign profile links, script URLs and invalid user paths', () => {
 for (const href of ['javascript:alert(1)', 'https://evil.test/user/1', '/user/1/settings', '/user/1evil']) assert.equal(C.userId(href, base), null);
 assert.equal(C.userId('/user/1?tab=topics', base), '1');
 assert.equal(C.safeURL('data:image/svg+xml,bad', base, false), null);
 const p = C.parseProfile(doc(profile.replace('/messages/new?to=1', 'javascript:alert(1)')), '1', base); assert.equal(p.messageURL, null);
});
test('cache deduplicates, expires, bounds memory and retries rejected requests', async () => {
 let count = 0, time = 0;
 const cache = C.createCache(async key => { count++; if (key === 'fail') throw Error('offline'); return key; }, { ttl: 10, limit: 1, now: () => time });
 await Promise.all([cache.get('a'), cache.get('a')]); assert.equal(count, 1);
 await cache.get('a'); assert.equal(count, 1);
 time = 11; await cache.get('a'); assert.equal(count, 2);
 await cache.get('b'); await cache.get('a'); assert.equal(count, 4);
 await assert.rejects(cache.get('fail')); await assert.rejects(cache.get('fail')); assert.equal(count, 6);
});
module.exports = { profile };
test('parses captured linux.sb public markup and actual signature independently', () => {
 const fs = require('node:fs');
 const p = C.parseProfile(doc(fs.readFileSync('demo/profile.html', 'utf8')), '1', base);
 assert.equal(p.name, '痛失姓名的站长'); assert.equal(p.group, '建设者'); assert.equal(p.titles[0].name, '真的站长');
 assert.match(p.bio, /刘邦/); assert.match(p.points, /^\d+$/);
 const sig = C.signatureIn(doc(fs.readFileSync('demo/topic.html', 'utf8')), '1', base);
 assert.equal(sig.found, true); assert.match(sig.text, /真诚/); assert.notEqual(sig.text, p.bio);
});
test('native badges keep site classes, numbered spans and color variables while dropping executable content', () => {
 const badge = doc('<a class="gacha-title-badge gacha-title-ur" href="/gacha" onclick="bad()" style="--gacha-color:#ac49ff;--gacha-bg:rgba(170,40,255,.1);position:fixed"><span class="gacha-title-name">非必要不抽奖</span><span class="gacha-title-rarity">001</span><script>bad()</script></a>').querySelector('a');
 const html = C.nativeBadgeHTML(badge, base);
 assert.match(html, /gacha-title-ur/); assert.match(html, /gacha-title-rarity/); assert.match(html, /--gacha-color/);
 assert.doesNotMatch(html, /onclick|script|position/); assert.match(html, /https:\/\/linux.sb\/gacha/);
});
test('SR theme variables and rarity survive copying, while title icons are hidden', () => {
 const source = doc('<a class="gacha-title-badge gacha-title-sr" style="--gacha-color:var(--info);--gacha-bg:var(--info-soft);--gacha-border:var(--info)"><span class="gacha-title-icon">icon</span><span class="gacha-title-name">万人迷</span><span class="gacha-title-rarity">SR</span></a>');
 const [html] = C.nativeBadgesIn(source, base);
 assert.match(html,/--gacha-color:\s*var\(--info\)/);assert.match(html,/--gacha-bg:\s*var\(--info-soft\)/);
 assert.match(html,/gacha-title-rarity">SR/);assert.match(html,/gacha-title-post-badge/);assert.doesNotMatch(html,/gacha-title-icon/);
});
test('profile preserves the entire user-state-tags group with native modifier classes', () => {
 const html=profile.replace('积分 18,006','积分 18,006<span class="user-state-tags"><span class="user-state-tag danger" title="暂时禁言">禁言</span><span class="user-state-tag custom-state">第二状态</span></span>');
 const result=C.parseProfile(doc(html),'1',base);
 const states=doc(result.stateMarkup).querySelector('.user-state-tags');
 assert.equal(states.children.length,2);assert.ok(states.querySelector('.user-state-tag.danger'));
 assert.equal(states.querySelector('.danger').title,'暂时禁言');assert.equal(states.children[1].textContent,'第二状态');
});
