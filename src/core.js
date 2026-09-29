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
