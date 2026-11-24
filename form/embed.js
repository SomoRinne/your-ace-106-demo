/* Optional embedding adapter. No key means the standalone public form is unchanged. */
(function () {
  'use strict';
  const key = window.ACE_EMBED_KEY || new URLSearchParams(window.location.search).get('embedKey');
  if (!/^[a-f0-9]{48}$/i.test(key || '') || window.parent === window) return;
  const SIZE = 'ace:form-size:v1', FOCUS = 'ace:form-focus:v1', MEASURE = 'ace:preview-measure:v1';
  function googleOrigin(origin) { try { const url = new URL(origin); return url.protocol === 'https:' && !url.port && (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com' || /-script\.googleusercontent\.com$/.test(url.hostname)); } catch { return false; } }
  function ancestor(source) {
    let current = window.parent;
    for (let depth = 0; current && depth < 8; depth++) { if (current === source) return true; try { const next = current.parent; if (!next || next === current) break; current = next; } catch { break; } } return false;
  }
  function send(data) {
    const packet = { ...data, key }; let target = window.parent; const seen = new Set();
    for (let depth = 0; target && target !== window && depth < 8 && !seen.has(target); depth++) {
      seen.add(target); try { target.postMessage(packet, '*'); } catch {}
      try { const next = target.parent; if (!next || next === target) break; target = next; } catch { break; }
    }
  }
  function start() {
    document.documentElement.classList.add('is-embedded');
    const end = document.createElement('div'); end.id = 'ace-embed-end'; end.className = 'embed-end'; end.setAttribute('aria-hidden', 'true'); document.body.append(end);
    let queued = false, force = false, lastHeight = -1, lastViewport = -1, focusTarget = null;
    function measure() {
      queued = false;
      // scrollHeight is at least the iframe viewport, so it cannot detect a shrink. A flow sentinel can.
      const height = Math.ceil(end.getBoundingClientRect().top + window.scrollY), viewportHeight = window.innerHeight;
      if (height !== lastHeight || viewportHeight !== lastViewport || force) { lastHeight = height; lastViewport = viewportHeight; force = false; send({ type: SIZE, height, viewportHeight }); }
      if (focusTarget?.isConnected) { const top = Math.max(0, focusTarget.getBoundingClientRect().top + window.scrollY); focusTarget = null; send({ type: FOCUS, top }); }
      if (window.scrollY) window.scrollTo({ top: 0, behavior: 'auto' });
    }
    function schedule() { if (!queued) { queued = true; window.requestAnimationFrame(measure); } }
    if (window.ResizeObserver) { const observer = new ResizeObserver(schedule); observer.observe(document.body); observer.observe(document.getElementById('content')); }
    const mutations = new MutationObserver(schedule); mutations.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'disabled'] });
    window.addEventListener('resize', schedule); document.addEventListener('load', schedule, true);
    document.addEventListener('focusin', event => { if (['contact-title', 'questions-title', 'review-title', 'done-title', 'error-summary'].includes(event.target.id)) { focusTarget = event.target; schedule(); } });
    window.addEventListener('message', event => {
      if (event.data?.type !== MEASURE || event.data?.key !== key || !ancestor(event.source) || !(event.origin === window.location.origin || (googleOrigin(window.location.origin) && googleOrigin(event.origin)))) return;
      force = true; schedule();
    });
    if (document.fonts?.ready) document.fonts.ready.then(schedule);
    schedule(); window.setTimeout(schedule, 150); window.setTimeout(schedule, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
