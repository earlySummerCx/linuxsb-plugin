(() => {
  'use strict';
  const text = node => node?.textContent?.trim() || '';
  function safeURL(value, base, sameOrigin = true) {
    try {
      const url = new URL(value, base);
      if (!value || !['https:', 'http:'].includes(url.protocol)) return null;
      if (sameOrigin && url.origin !== new URL(base).origin) return null;
      return url.href;
    } catch { return null; }
  }
  function userId(value, base) {
    const url = safeURL(value, base);
    return url ? new URL(url).pathname.match(/^\/user\/(\d+)\/?$/)?.[1] || null : null;
  }
  function titlesIn(root) {
    return [...(root?.querySelectorAll('.gacha-title-badge') || [])].map(node => ({
      name: text(node.querySelector('.gacha-title-name')),
      serial: text(node.querySelector('.gacha-title-rarity')),
      rarity: [...node.classList].find(c => /^gacha-title-(ur|ssr|sr|r|n)$/.test(c))?.slice(12) || 'n'
    })).filter(item => item.name).filter((item, i, list) => list.findIndex(x => x.name === item.name && x.serial === item.serial) === i);
  }
  // Keep the site's native badge classes/variables, but never import executable markup.
  function nativeBadgeHTML(source, base) {
    if (!source) return null;
    const clone = source.cloneNode(true);
    const isStateGroup = source.matches('.user-state-tags');
    const allowedTags = new Set(['SPAN', 'A', 'IMG', 'B', 'STRONG', 'I', 'EM']);
    for (const el of [clone, ...clone.querySelectorAll('*')]) {
      if (!allowedTags.has(el.tagName)) { el.remove(); continue; }
      const href = el.tagName === 'A' ? safeURL(el.getAttribute('href'), base) : null;
      const src = el.tagName === 'IMG' ? safeURL(el.getAttribute('src'), base, false) : null;
      const classes = [...el.classList].filter(c => isStateGroup || /^(gacha-|user-uid-|post-user-group$)/.test(c));
      const label = el.getAttribute('aria-label'), title = el.getAttribute('title'), alt = el.getAttribute('alt');
      const variables = [];
      for (let i = 0; i < el.style.length; i++) {
        const property = el.style[i], value = el.style.getPropertyValue(property);
        const safeThemeReference = /^var\(--[a-z][a-z0-9-]*\)$/i.test(value.trim());
        const safeLiteral = /^[#a-zA-Z0-9.,%()\s+-]+$/.test(value) && !/url|expression|image|var\(/i.test(value);
        if (/^--(?:gacha|user-uid)-[a-z-]+$/.test(property) && (safeThemeReference || safeLiteral)) variables.push([property, value]);
      }
      for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
      if (classes.length) el.className = classes.join(' ');
      if (href) el.setAttribute('href', href);
      if (src) el.setAttribute('src', src);
      if (label) el.setAttribute('aria-label', label);
      if (title) el.setAttribute('title', title);
      if (alt) el.setAttribute('alt', alt);
      for (const [key, value] of variables) el.style.setProperty(key, value);
    }
    return clone.outerHTML;
  }
  function nativeBadgesIn(root, base) {
    return [...(root?.querySelectorAll('.gacha-title-badge') || [])].map(el => {
      const badge = el.cloneNode(true);
      badge.classList.add('post-user-group', 'gacha-title-post-badge');
      badge.querySelectorAll('.gacha-title-icon').forEach(icon => icon.remove());
      return nativeBadgeHTML(badge, base);
    });
  }
  function signatureIn(doc, id, base) {
    for (const post of doc.querySelectorAll('.post-entry')) {
      const author = post.querySelector('.post-avatar a[href], .post-author[href]');
      if (userId(author?.getAttribute('href'), base) !== id) continue;
      const signature = post.querySelector('.post-signature-content');
      // A matching full post with no signature is different from an unavailable post.
      return { found: true, text: text(signature) };
    }
    return { found: false, text: '' };
  }
  function parseProfile(doc, id, base) {
    const card = [...doc.querySelectorAll('.user-card')].find(card => userId(card.querySelector('.user-name[href]')?.getAttribute('href'), base) === id);
    if (!card) throw new Error('用户资料不可见，或站点结构已变化');
    const rank = text(card.querySelector('.user-rank'));
    const points = rank.match(/积分\s*([+-]?[\d,]+(?:\.\d+)?)/)?.[1] || null;
    const pm = [...card.querySelectorAll('a[href]')].find(a => text(a) === '私信TA');
    const firstTopic = [...doc.querySelectorAll('.post-item')].find(post => userId(post.querySelector('.avatar-profile-link')?.getAttribute('href'), base) === id)?.querySelector('a.post-title[href]');
    const latest = safeURL(firstTopic?.getAttribute('href'), base);
    return {
      id, name: text(card.querySelector('.user-name')), avatar: safeURL(card.querySelector('.avatar-img')?.getAttribute('src'), base, false),
      stateMarkup: nativeBadgeHTML(card.querySelector('.user-state-tags'), base),
      titleMarkup: nativeBadgesIn(card, base), groupMarkup: nativeBadgeHTML(card.querySelector('.user-uid-badge-group'), base),
      titles: titlesIn(card), group: text(card.querySelector('.user-uid-badge-group-name')), points,
      bio: text(doc.querySelector('.sidebar-bio')), messageURL: safeURL(pm?.getAttribute('href'), base),
      latestTopicURL: latest && /^\/topic\/\d+$/.test(new URL(latest).pathname) ? latest : null
    };
  }
  function createCache(loader, { ttl = 300000, limit = 100, now = Date.now } = {}) {
    const values = new Map(), pending = new Map();
    return {
      get(key, refresh = false) {
        if (pending.has(key)) return pending.get(key);
        const hit = values.get(key);
        if (!refresh && hit && now() - hit.time < ttl) return Promise.resolve(hit.value);
        const promise = Promise.resolve().then(() => loader(key)).then(value => {
          values.delete(key); values.set(key, { value, time: now() });
          while (values.size > limit) values.delete(values.keys().next().value);
          return value;
        }).finally(() => pending.delete(key));
        pending.set(key, promise); return promise;
      }
    };
  }
  const api = { text, safeURL, userId, titlesIn, nativeBadgeHTML, nativeBadgesIn, signatureIn, parseProfile, createCache };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.LinuxSBCardCore = api;
})();

globalThis.LinuxSBCardCSS=":host { all: initial; position: fixed; inset: auto; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; z-index: 2147483647; color-scheme: light dark; }\n* { box-sizing: border-box; }\n.panel { --c-bg: var(--panel, #fff); --c-text: var(--text, #18212c); --c-muted: var(--text-muted, #707987); --c-line: var(--line, #e5e7eb); width: min(360px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; overscroll-behavior: contain; background: var(--c-bg); color: var(--c-text); border: 1px solid var(--c-line); border-radius: 12px; padding: 16px; box-shadow: 0 10px 32px #00000024; font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; }\n.header { display: grid; grid-template-columns: 52px minmax(0, 1fr) 28px; align-items: center; gap: 12px; }\n.avatar { flex: 0 0 52px; width: 52px; height: 52px; object-fit: cover; border-radius: 8px; background: var(--brand-soft, #f1f5f9); }\n.avatar-fallback { display: grid; place-items: center; font-size: 22px; font-weight: 600; }\n.identity { flex: 1; min-width: 0; }\n.name { margin: 0; font-size: 17px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.uid { color: var(--c-muted); font-size: 12px; }\nbutton, a { font: inherit; }\nbutton { cursor: pointer; }\n.close { flex: 0 0 28px; align-self: flex-start; padding: 4px; width: 28px; height: 28px; border: 0; border-radius: 5px; background: transparent; color: var(--c-muted); }\n.close-icon { display: block; width: 20px; height: 20px; background: currentColor; mask-size: contain; mask-repeat: no-repeat; }\n.close:hover, .nav a:hover { background: var(--brand-soft, #f1f5f9); }\n:focus-visible { outline: 2px solid var(--brand, #334155); outline-offset: 3px; }\n.titles { margin-top: 14px; overflow-x: auto; overflow-y: hidden; padding-bottom: 5px; scrollbar-width: thin; scrollbar-color: #9ca3af transparent; overscroll-behavior-x: contain; }\n.title-track { display: grid; grid-template-rows: repeat(2, max-content); grid-auto-flow: column; grid-auto-columns: max-content; gap: 6px 8px; width: max-content; }\n.title-track.single { grid-template-rows: max-content; }\n.stats { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0 0; color: var(--c-muted); font-size: 13px; }\n.points { margin-left: auto; }\n.section { border-top: 1px solid var(--c-line); margin-top: 12px; padding-top: 12px; }\n.label { color: var(--c-muted); font-size: 12px; margin-bottom: 4px; }\n.copy { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 112px; overflow-y: auto; overscroll-behavior: contain; }\n.empty { color: var(--c-muted); }\n.actions { display: flex; gap: 8px; margin-top: 16px; }\n.action { flex: 1; text-align: center; padding: 7px 8px; border: 1px solid var(--brand, #334155); border-radius: 5px; color: var(--c-text); text-decoration: none; }\n.primary { background: var(--brand, #334155); color: #fff; }.primary:hover { background: var(--brand-hover, #1e293b); }\n.nav { display: flex; border-top: 1px solid var(--c-line); margin-top: 12px; padding-top: 8px; }\n.nav a { flex: 1; text-align: center; padding: 4px; color: var(--c-muted); text-decoration: none; border-radius: 4px; }\n.notice { margin: 12px 0 0; color: var(--c-muted); font-size: 12px; }\n.retry { margin-left: 6px; padding: 0; border: 0; background: none; color: var(--c-text); text-decoration: underline; }\n@media (prefers-reduced-motion: no-preference) { .panel { animation: appear .12s ease-out; } @keyframes appear { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } } }\n\n.title-track slot { display: contents; }\n.title-track ::slotted(*) { align-self: center; justify-self: start; white-space: nowrap; }\n.title-placeholders { display: flex; gap: 8px; margin-top: 14px; }\n.skeleton { display: inline-block; height: 18px; max-width: 100%; flex-shrink: 0; border-radius: 4px; background: var(--c-muted); opacity: .12; }\n.title-placeholders .skeleton { height: 24px; }\n.skeleton-lines { display: grid; gap: 7px; padding: 3px 0; }\n@media (prefers-reduced-motion: no-preference) { .skeleton { animation: skeleton-pulse 1.4s ease-in-out infinite alternate; } @keyframes skeleton-pulse { to { opacity: .22; } } }\n\n.name-row { display: flex; align-items: center; gap: 4px; min-width: 0; }\n.name-row .name { flex: 0 1 auto; min-width: 0; }\n.states { flex: 0 0 auto; min-width: 0; max-width: 55%; overflow-x: auto; scrollbar-width: thin; }\n";
globalThis.LinuxSBCardClose="data:image/svg+xml;base64,PCEtLQpjYXRlZ29yeTogU3lzdGVtCnRhZ3M6IFtjYW5jZWwsIHJlbW92ZSwgZGVsZXRlLCBlbXB0eSwgY2xvc2UsIHhdCnZlcnNpb246ICIxLjAiCnVuaWNvZGU6ICJlYjU1IgotLT4KPHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9ImN1cnJlbnRDb2xvciIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTggNmwtMTIgMTIiIC8+CiAgPHBhdGggZD0iTTYgNmwxMiAxMiIgLz4KPC9zdmc+Cg==";
(() => {
  'use strict';
  const C = globalThis.LinuxSBCardCore;
  const CSS = globalThis.LinuxSBCardCSS;
  const CLOSE = globalThis.LinuxSBCardClose;
  const BASE = location.origin;
  const IS_DEMO = document.documentElement.dataset.lsbDemo === 'true' && ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!IS_DEMO && location.hostname !== 'linux.sb') return;
  const HOST_ID = 'linuxsb-user-card-extension';
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement('div'); host.id = HOST_ID;
  host.setAttribute('popover', 'manual');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = CSS; shadow.append(style);
  document.body.append(host);
  let current = null, sequence = 0, frame = 0;
  const signatureCache = new Map();
  function node(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }
  function link(label, href, className) {
    const a = node('a', className, label); a.href = href; return a;
  }
  async function readDocument(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal, redirect: 'follow' });
      if (!response.ok || new URL(response.url).origin !== BASE) throw new Error('资料请求失败');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!doc.querySelector('.user-card, .post-entry')) throw new Error('需要登录或页面暂时不可用');
      return doc;
    } finally { clearTimeout(timer); }
  }
  const profiles = C.createCache(async id => C.parseProfile(await readDocument(`${BASE}/user/${id}`), id, BASE));
  const signatures = C.createCache(async url => readDocument(url), { ttl: 300000, limit: 20 });
  function rememberSignature(id, value) {
    signatureCache.delete(id); signatureCache.set(id, { value, time: Date.now() });
    while (signatureCache.size > 100) signatureCache.delete(signatureCache.keys().next().value);
  }
  function seeded(anchor, id) {
    const img = anchor.querySelector('img');
    const scope = anchor.closest('.post-entry, .user-card, .post-item');
    const signature = C.signatureIn(document, id, BASE);
    if (signature.found) rememberSignature(id, signature.text);
    return {
      id, name: img?.alt || anchor.getAttribute('aria-label')?.replace(/^查看\s*|\s*的个人主页$/g, '') || `用户 ${id}`,
      avatar: C.safeURL(img?.getAttribute('src'), BASE, false), titles: C.titlesIn(scope),
      stateMarkup: C.nativeBadgeHTML(scope?.querySelector('.user-state-tags'), BASE),
      titleMarkup: C.nativeBadgesIn(scope, BASE), groupMarkup: C.nativeBadgeHTML(scope?.querySelector('.user-uid-badge-group'), BASE),
      group: C.text(scope?.querySelector('.user-uid-badge-group-name')), points: null,
      bio: null, signature: signature.found ? signature.text : null, messageURL: null
    };
  }
  function close(restore = false) {
    if (!current) return;
    const previous = current.anchor;
    previous.setAttribute('aria-expanded', 'false');
    current = null; sequence++;
    if (host.matches(':popover-open')) host.hidePopover();
    shadow.querySelector('.panel')?.remove(); host.replaceChildren();
    if (restore && previous.isConnected) previous.focus({ preventScroll: true });
  }
  function position() {
    frame = 0;
    if (!current) return;
    const a = current.anchor.getBoundingClientRect();
    if (!current.anchor.isConnected || a.bottom < 0 || a.top > innerHeight || a.right < 0 || a.left > innerWidth) return close();
    const panel = shadow.querySelector('.panel'); if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = 10, edge = 12;
    let x = a.right + gap, y = a.top;
    if (x + w > innerWidth - edge) x = a.left - w - gap;
    if (x < edge) { x = Math.max(edge, Math.min(a.left, innerWidth - w - edge)); y = a.bottom + gap; }
    x = Math.max(edge, Math.min(x, innerWidth - w - edge));
    y = Math.max(edge, Math.min(y, innerHeight - h - edge));
    host.style.left = `${x}px`; host.style.top = `${y}px`;
  }
  function schedulePosition(event) {
    if (event?.composedPath().includes(host)) return;
    if (current && !frame) frame = requestAnimationFrame(position);
  }
  function render(data, state = {}) {
    if (!current) return;
    const focused = shadow.activeElement;
    const focusKey = focused?.dataset.focusKey;
    const previousScroll = shadow.querySelector('.titles')?.scrollLeft || 0;
    const previousPanelScroll = shadow.querySelector('.panel')?.scrollTop || 0;
    const nativeBadges = [];
    function nativeSlot(markup, name) {
      const template = document.createElement('template'); template.innerHTML = markup;
      const badge = template.content.firstElementChild;
      // The native borderless rule is scoped to the full post ancestry, not only
      // .gacha-title-post-badge. Keep that context in light DOM so site CSS wins.
      let projected = badge;
      if (name.startsWith('title-')) {
        const list = node('div', 'topic-post-list');
        const entry = node('div', 'post-entry');
        const head = node('div', 'post-head');
        for (const wrapper of [list, entry, head]) wrapper.style.display = 'contents';
        head.append(badge); entry.append(head); list.append(entry); projected = list;
      }
      projected.slot = name; nativeBadges.push(projected);
      const slot = node('slot'); slot.name = name; return slot;
    }
    function skeleton(width = '100%') {
      const bar = node('span', 'skeleton'); bar.style.width = width; bar.setAttribute('aria-hidden', 'true'); return bar;
    }
    const panel = node('section', 'panel'); panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `${data.name}的用户资料`);
    panel.setAttribute('aria-busy', String(Boolean(state.loading)));
    const header = node('div', 'header');
    let avatar;
    if (data.avatar) {
      avatar = node('img', 'avatar'); avatar.src = data.avatar; avatar.alt = '';
      avatar.addEventListener('error', () => avatar.replaceWith(node('span', 'avatar avatar-fallback', Array.from(data.name)[0] || '?')), { once: true });
    } else avatar = node('span', 'avatar avatar-fallback', Array.from(data.name)[0] || '?');
    const identity = node('div', 'identity');
    const name = node('h2', 'name', data.name); name.title = data.name;
    const nameRow = node('div', 'name-row'); nameRow.append(name);
    if (data.stateMarkup) {
      const states = node('span', 'states'); states.append(nativeSlot(data.stateMarkup, 'states')); nameRow.append(states);
    }
    identity.append(nameRow, node('div', 'uid', `UID ${data.id}`));
    const dismiss = node('button', 'close'); dismiss.type = 'button'; dismiss.dataset.focusKey = 'close';
    dismiss.setAttribute('aria-label', '关闭资料卡'); const icon = node('span', 'close-icon'); icon.style.maskImage = `url("${CLOSE}")`; icon.setAttribute('aria-hidden', 'true'); dismiss.append(icon);
    dismiss.addEventListener('click', () => close(true));
    header.append(avatar, identity, dismiss); panel.append(header);
    if (state.loading) {
      const placeholders = node('div', 'title-placeholders'); placeholders.append(skeleton('112px'), skeleton('72px')); panel.append(placeholders);
    } else if (data.titleMarkup?.length) {
      const scroll = node('div', 'titles'); scroll.tabIndex = 0; scroll.dataset.focusKey = 'titles';
      scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', '用户称号，最多两行，可左右滚动');
      const track = node('div', `title-track${data.titleMarkup.length <= 2 ? ' single' : ''}`);
      data.titleMarkup.forEach((markup, i) => track.append(nativeSlot(markup, `title-${i}`)));
      scroll.append(track); panel.append(scroll);
    }
    const stats = node('div', 'stats');
    if (state.loading) { stats.append(skeleton('54px'), skeleton('88px')); }
    else {
      if (data.groupMarkup) stats.append(nativeSlot(data.groupMarkup, 'group'));
      else if (data.group) stats.append(node('span', '', data.group));
      stats.append(node('span', 'points', `积分 ${data.points === null ? '—' : data.points}`));
    }
    panel.append(stats);
    function section(label, value, missing, loading) {
      const section = node('div', 'section'); section.append(node('div', 'label', label));
      if (loading) { const lines = node('div', 'skeleton-lines'); lines.append(skeleton(), skeleton('72%')); section.append(lines); }
      else section.append(node('p', `copy${value ? '' : ' empty'}`, value || missing));
      panel.append(section);
    }
    section('个人简介', data.bio, data.bio === null ? '暂未获取' : '暂无个人简介', state.loading);
    section('帖子签名', data.signature, data.signature === null ? '暂未获取到签名' : '该帖子未显示签名', state.loading || state.signatureLoading);
    const actions = node('div', 'actions');
    actions.append(link('个人主页', `${BASE}/user/${data.id}`, 'action primary'));
    if (data.messageURL) actions.append(link('私信TA', data.messageURL, 'action'));
    panel.append(actions);
    const nav = node('nav', 'nav'); nav.setAttribute('aria-label', '用户页面');
    for (const [label, tab] of [['主题', 'topics'], ['回帖', 'replies'], ['收藏', 'favorites']]) nav.append(link(label, `${BASE}/user/${data.id}?tab=${tab}`));
    panel.append(nav);
    if (state.loading || state.error || state.signatureError) {
      const notice = node('p', 'notice', state.loading ? '正在加载用户资料…' : state.error || state.signatureError);
      notice.setAttribute('role', 'status');
      if (!state.loading) {
        const retry = node('button', 'retry', '重试'); retry.type = 'button'; retry.dataset.focusKey = 'retry';
        retry.addEventListener('click', () => load(current.anchor, data.id, true)); notice.append(retry);
      }
      panel.append(notice);
    }
    for (const a of panel.querySelectorAll('a')) a.dataset.focusKey = a.textContent;
    // Updating async fields must not replay the card's entry animation.
    const existingPanel = shadow.querySelector('.panel');
    let visiblePanel = panel;
    if (existingPanel) {
      const oldAvatar = existingPanel.querySelector('img.avatar');
      const newAvatar = panel.querySelector('img.avatar');
      if (oldAvatar && newAvatar && oldAvatar.src === newAvatar.src) newAvatar.replaceWith(oldAvatar);
      existingPanel.replaceChildren(...panel.childNodes);
      existingPanel.setAttribute('aria-label', panel.getAttribute('aria-label'));
      existingPanel.setAttribute('aria-busy', panel.getAttribute('aria-busy'));
      visiblePanel = existingPanel;
    } else shadow.append(panel);
    host.replaceChildren(...nativeBadges);
    if (!host.matches(':popover-open')) host.showPopover();
    const scroller = visiblePanel.querySelector('.titles'); if (scroller) scroller.scrollLeft = previousScroll;
    visiblePanel.scrollTop = previousPanelScroll;
    position();
    if (focusKey) [...visiblePanel.querySelectorAll('[data-focus-key]')].find(el => el.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
  }
  async function load(anchor, id, refresh = false) {
    const ticket = ++sequence;
    if (current?.anchor !== anchor) current?.anchor.setAttribute('aria-expanded', 'false');
    current = { anchor, id };
    anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-haspopup', 'dialog');
    let data = seeded(anchor, id);
    render(data, { loading: true, signatureLoading: data.signature === null });
    shadow.querySelector('.close')?.focus({ preventScroll: true });
    try {
      const profile = await profiles.get(id, refresh);
      if (ticket !== sequence) return;
      data = { ...data, ...profile };
      const local = C.signatureIn(document, id, BASE);
      const cached = signatureCache.get(id);
      if (local.found) data.signature = local.text;
      else if (!refresh && cached && Date.now() - cached.time < 300000) data.signature = cached.value;
      const needsSignature = data.signature === null && Boolean(data.latestTopicURL);
      render(data, { signatureLoading: needsSignature });
      if (needsSignature) {
        try {
          const doc = await signatures.get(data.latestTopicURL, refresh);
          if (ticket !== sequence) return;
          const sig = C.signatureIn(doc, id, BASE);
          if (sig.found) { data.signature = sig.text; rememberSignature(id, sig.text); }
          render(data);
        } catch {
          if (ticket === sequence) render(data, { signatureError: '签名暂时读取失败，其他资料仍可查看。' });
        }
      }
    } catch {
      if (ticket === sequence) render(data, { error: '资料读取失败或无权查看，可重试或打开个人主页。' });
    }
  }
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.composedPath().includes(host)) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || !anchor.matches('.avatar-profile-link, .user-avatar-big') && !anchor.querySelector('img.avatar-img')) return;
    const id = C.userId(anchor.getAttribute('href'), BASE); if (!id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (current?.anchor === anchor) close(true); else load(anchor, id);
  }, true);
  document.addEventListener('pointerdown', event => {
    if (current && !event.composedPath().includes(host) && !current.anchor.contains(event.target)) close();
  }, true);
  document.addEventListener('keydown', event => {
    if (current && event.key === 'Escape') { event.preventDefault(); close(true); }
  }, true);
  document.addEventListener('focusin', event => {
    if (current && !event.composedPath().includes(host) && event.target !== current.anchor) close();
  });
  document.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('resize', schedulePosition);
  window.addEventListener('pagehide', () => close());
})();

