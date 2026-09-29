const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const bundle = fs.readFileSync('dist/content.js', 'utf8');
const wait = () => new Promise(resolve => setTimeout(resolve, 15));
function setup() {
 const dom = new JSDOM(`<a class="avatar-profile-link" href="/user/1"><img class="avatar-img" alt="one" src="/a.jpg"></a><a class="avatar-profile-link" href="/user/2"><img class="avatar-img" alt="two" src="/b.jpg"></a>`, { url: 'https://linux.sb/', runScripts: 'outside-only', pretendToBeVisual: true });
 const w = dom.window, proto = w.HTMLElement.prototype;
 const original = proto.matches; proto.matches = function(s) { return s === ':popover-open' ? this._open === true : original.call(this, s); };
 proto.showPopover = function() { this._open = true; }; proto.hidePopover = function() { this._open = false; };
 const requests = [];
 w.fetch = url => new Promise(resolve => requests.push({ url, resolve }));
 w.eval(bundle);
 const anchors = w.document.querySelectorAll('a');
 const click = (i, extra = {}) => anchors[i].dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...extra }));
 const respond = (id, name = 'User ' + id) => { const r = requests.find(r => r.url.endsWith('/' + id)); r.resolve({ ok: true, url: r.url, text: async () => `<div class="user-card"><a class="user-name" href="/user/${id}">${name}</a><div class="user-rank">积分 123</div></div><div class="sidebar-bio">&lt;img src=x onerror=alert(1)&gt;</div>` }); };
 return { dom, w, anchors, click, requests, respond, root: w.document.getElementById('linuxsb-user-card-extension').shadowRoot };
}
test('avatar click is intercepted, profile HTML is rendered as text, escape restores focus', async () => {
 const t = setup(); assert.equal(t.click(0), false); await wait(); t.respond('1'); await wait();
 assert.match(t.root.textContent, /积分 123/); assert.match(t.root.querySelector('.copy').textContent, /<img/);
 assert.equal(t.root.querySelector('.copy img'), null);
 t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
 assert.equal(t.root.querySelector('.panel'), null); assert.equal(t.w.document.activeElement, t.anchors[0]); t.dom.window.close();
});
test('late response cannot overwrite another user or reopen a dismissed card', async () => {
 const t = setup(); t.click(0); await wait(); t.click(1); await wait(); t.respond('2'); await wait(); t.respond('1'); await wait();
 assert.equal(t.root.querySelector('.name').textContent, 'User 2');
 t.click(1); assert.equal(t.root.querySelector('.panel'), null); await wait(); assert.equal(t.root.querySelector('.panel'), null); t.dom.window.close();
});
test('event delegation supports avatars added after initialization', async () => {
 const t = setup(); const a = t.anchors[0].cloneNode(true); t.w.document.body.append(a);
 const event = new t.w.MouseEvent('click', { bubbles: true, cancelable: true }); a.dispatchEvent(event);
 assert.equal(event.defaultPrevented, true); await wait(); t.respond('1'); await wait(); assert.ok(t.root.querySelector('.panel')); t.dom.window.close();
});
test('async profile updates retain the card and avatar so entry animation does not replay', async () => {
 const t = setup(); t.click(0); await wait();
 const panel = t.root.querySelector('.panel'), avatar = t.root.querySelector('.avatar');
 const request = t.requests[0];
 request.resolve({ok:true, url:request.url, text:async()=>'<div class="user-card"><a class="user-name" href="/user/1">Loaded user</a><img class="avatar-img" src="/a.jpg"><div class="user-rank">积分 123</div></div>'});
 await wait();
 assert.equal(t.root.querySelector('.panel'), panel);
 assert.equal(t.root.querySelector('.avatar'), avatar);
 assert.equal(t.root.querySelector('.name').textContent, 'Loaded user');
 assert.equal(panel.getAttribute('aria-busy'), 'false');
 t.dom.window.close();
});
test('pending request shows avatar/name plus skeletons, and success removes skeletons', async () => {
 const t=setup();t.click(0);await wait();
 assert.equal(t.root.querySelector('.name').textContent,'one');assert.ok(t.root.querySelector('.avatar'));
 assert.ok(t.root.querySelectorAll('.skeleton').length >= 6);assert.doesNotMatch(t.root.textContent,/积分 —|暂无个人简介/);
 t.respond('1');await wait();assert.equal(t.root.querySelectorAll('.skeleton').length,0);t.dom.window.close();
});
