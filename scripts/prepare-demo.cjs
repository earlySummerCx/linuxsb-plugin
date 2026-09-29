const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const doc = new JSDOM(fs.readFileSync('work/user-1.html', 'utf8')).window.document;
const card = doc.querySelector('.user-card').cloneNode(true);
card.querySelectorAll('svg, [style]').forEach(el => { if (el.tagName === 'svg') el.remove(); else el.removeAttribute('style'); });
for (const img of card.querySelectorAll('img')) img.src = new URL(img.getAttribute('src'), 'https://linux.sb').href;
const bio = doc.querySelector('.sidebar-bio').outerHTML;
const topicLink = '<li class="post-item"><a class="avatar-profile-link" href="/user/1"></a><a class="post-title" href="/topic/24317">主题</a></li>';
fs.writeFileSync('demo/profile.html', '<!doctype html><meta charset="utf-8">' + card.outerHTML + bio + topicLink);
const long = card.cloneNode(true); long.querySelectorAll('a[href]').forEach(el=>el.setAttribute('href',el.getAttribute('href').replace('/user/1','/user/2')));
long.querySelector('.user-name').textContent = '痛失姓名的站长还有很长很长的昵称用于验证省略规则';
const rank = long.querySelector('.user-rank');
for (const [i,name] of ['富可敌国','社区达人','热心饼友','技术先锋','开源贡献者','乐于分享','再长也不会撑宽卡片的称号'].entries()) {
 const title = doc.createElement('span'); title.className='gacha-title-badge gacha-title-sr';
 const span = doc.createElement('span');span.className='gacha-title-name';span.textContent=name;title.append(span);rank.append(title);
}
const pm=doc.createElement('a');pm.href='/message-demo';pm.textContent='私信TA';long.append(pm);
fs.writeFileSync('demo/long-profile.html','<!doctype html><meta charset="utf-8">'+long.outerHTML+bio);
const topic = new JSDOM(fs.readFileSync('work/topic.html', 'utf8')).window.document;
const post = topic.querySelector('.post-entry');
fs.writeFileSync('demo/topic.html','<!doctype html><meta charset="utf-8"><li class="post-entry"><div class="post-avatar"><a href="/user/1"></a></div>'+post.querySelector('.post-signature-content').outerHTML+'</li>');
const img=card.querySelector('img').getAttribute('src');
let index=fs.readFileSync('demo/index.html','utf8');index=index.replaceAll('AVATAR_URL',img);fs.writeFileSync('demo/index.html',index);
