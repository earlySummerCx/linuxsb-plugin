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
