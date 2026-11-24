/* Content-sized form preview. This channel carries geometry only, never auth or answers. */
(function () {
  'use strict';
  const SIZE = 'ace:form-size:v1', FOCUS = 'ace:form-focus:v1', MEASURE = 'ace:preview-measure:v1';
  const MIN_HEIGHT = 120, MAX_HEIGHT = 200000, MAX_WRAPPER = 160;
  function googleOrigin(origin) {
    try { const url = new URL(origin); return url.protocol === 'https:' && !url.port && (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com' || /-script\.googleusercontent\.com$/.test(url.hostname)); } catch { return false; }
  }
  function belongsTo(source, root) {
    let current = source;
    for (let depth = 0; current && depth < 8; depth++) {
      if (current === root) return true;
      try { const next = current.parent; if (!next || next === current) break; current = next; } catch { break; }
    }
    return false;
  }
  function newKey() { return Array.from(window.crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join(''); }
  function create(frame) {
    let key = '', cleanUrl = '', expectedOrigin = '', contentHeight = 0, wrapperHeight = 0;
    function allowed(origin) { return origin === expectedOrigin || (googleOrigin(expectedOrigin) && googleOrigin(origin)); }
    function borderHeight() { return Math.max(0, Math.min(12, frame.getBoundingClientRect().height - frame.clientHeight)); }
    function onMessage(event) {
      const data = event.data;
      if (!key || !data || data.key !== key || ![SIZE, FOCUS].includes(data.type) || !allowed(event.origin) || !belongsTo(event.source, frame.contentWindow)) return;
      if (data.type === SIZE) {
        if (!Number.isFinite(data.height) || data.height < MIN_HEIGHT || data.height > MAX_HEIGHT || !Number.isFinite(data.viewportHeight) || data.viewportHeight < 0 || data.viewportHeight > MAX_HEIGHT + MAX_WRAPPER) return;
        const nested = event.source !== frame.contentWindow;
        const difference = frame.clientHeight - data.viewportHeight;
        wrapperHeight = nested && difference >= 0 && difference <= MAX_WRAPPER ? Math.ceil(difference) : 0;
        contentHeight = Math.ceil(data.height);
        const height = contentHeight + wrapperHeight + borderHeight();
        if (Math.abs(frame.getBoundingClientRect().height - height) > 0.5) frame.style.height = height + 'px';
        frame.dataset.previewReady = 'true';
      } else if (Number.isFinite(data.top) && data.top >= 0 && data.top <= contentHeight) {
        const top = Math.max(0, frame.getBoundingClientRect().top + window.scrollY + wrapperHeight + data.top - 24);
        window.requestAnimationFrame(() => window.scrollTo({ top, behavior: 'auto' }));
      }
    }
    function refresh() {
      if (!key || !frame.contentWindow) return;
      // WindowProxy.parent/frames are cross-origin-accessible. Reach a GAS sandbox under its wrapper.
      const pending = [{ target: frame.contentWindow, depth: 0 }], seen = new Set();
      while (pending.length && seen.size < 24) {
        const { target, depth } = pending.shift(); if (!target || seen.has(target)) continue; seen.add(target);
        try { target.postMessage({ type: MEASURE, key }, '*'); } catch {}
        if (depth < 5) try { for (let index = 0; index < Math.min(target.frames.length, 8); index++) pending.push({ target: target.frames[index], depth: depth + 1 }); } catch {}
      }
    }
    function clear() {
      key = ''; cleanUrl = ''; expectedOrigin = ''; contentHeight = 0; wrapperHeight = 0;
      frame.removeAttribute('src'); frame.style.height = '1px'; frame.dataset.previewReady = 'false';
    }
    function load(raw) {
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin && !googleOrigin(url.origin)) throw new Error('フォームの表示先を確認してください。');
      url.searchParams.delete('embedKey'); const nextClean = url.href;
      if (key && cleanUrl === nextClean) { refresh(); return; }
      clear(); cleanUrl = nextClean; expectedOrigin = url.origin; key = newKey();
      url.searchParams.set('embedKey', key); frame.setAttribute('scrolling', 'no'); frame.style.height = '1px'; frame.src = url.href;
    }
    window.addEventListener('message', onMessage); frame.addEventListener('load', refresh);
    return Object.freeze({ load, clear, refresh });
  }
  window.AcePreview = Object.freeze({ create });
})();
