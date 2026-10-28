// GENERATED from scripts/lib/design-tokens.generated.ts, scripts/lib/measure-layout.ts by npm run vc-test:design — do not edit; the TypeScript is canonical
// scripts/lib/design-tokens.generated.ts
var TAILWIND_DEFAULT_SPACING_PX = [
  1,
  0,
  2,
  4,
  6,
  8,
  10,
  12,
  14,
  16,
  20,
  24,
  28,
  32,
  36,
  40,
  44,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  144,
  160,
  176,
  192,
  208,
  224,
  240,
  256,
  288,
  320,
  384
];
var EXTEND_SPACING_PX = [
  18,
  68,
  72,
  76
];
var SPACING_GRID_PX = [
  0,
  1,
  2,
  4,
  6,
  8,
  10,
  12,
  14,
  16,
  18,
  20,
  24,
  28,
  32,
  36,
  40,
  44,
  48,
  56,
  64,
  68,
  72,
  76,
  80,
  96,
  112,
  128,
  144,
  160,
  176,
  192,
  208,
  224,
  240,
  256,
  288,
  320,
  384
];
var BREAKPOINTS_PX = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1500
};
var UI_KIT_BUTTON_SIZES_PX = {
  xxs: 26,
  xs: 32,
  sm: 38,
  md: 44,
  lg: 52
};
var AUDIT_VIEWPORTS_PX = [
  375,
  479,
  480,
  560,
  639,
  640,
  704,
  767,
  768,
  896,
  1023,
  1024,
  1152,
  1279,
  1280,
  1390,
  1499,
  1500,
  1920
];

// scripts/lib/measure-layout.ts
var SPACING_GRID = SPACING_GRID_PX;
var CLS_THRESHOLDS = { pass: 0.1, fail: 0.25 };
var ALIGNMENT_TOLERANCE_PX = 1;
var TOUCH_TARGET_AA_MIN_PX = 24;
var TOUCH_TARGET_MIN_PX = TOUCH_TARGET_AA_MIN_PX;
var TOUCH_TARGET_AAA_MIN_PX = 44;
var TOUCH_TARGET_GAP_PX = 8;
var CONTRAST_RATIOS = { normal: 4.5, large: 3, uiComponent: 3 };
var FOCUS_INDICATOR_MIN_PX = 2;
var IMAGE_ASPECT_TOLERANCE = 0.05;
var CRITICAL_ALERT_SELECTORS = [
  ".vc-alert",
  ".vc-alert--danger",
  ".vc-alert--warning",
  '[role="alert"]',
  '[role="alertdialog"]',
  '[role="status"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]'
];
var NON_TEXT_CONTRAST_RATIO = 3;
var SIZED_CONTROL_TOLERANCE_PX = 1;
function imageIntrinsicDimsSnippet(selector = "img") {
  return `
(() => {
  const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
  const offenders = [];
  for (const el of els) {
    const cs = getComputedStyle(el);
    const hasW = el.hasAttribute('width');
    const hasH = el.hasAttribute('height');
    const ar = cs.aspectRatio || 'auto';
    const sizedByCss = cs.width !== 'auto' && cs.height !== 'auto';
    const reserves = (hasW && hasH) || (ar && ar !== 'auto') || sizedByCss;
    if (!reserves) {
      offenders.push({
        src: (el.currentSrc || el.getAttribute('src') || '').slice(0, 160),
        hasWidthAttr: hasW,
        hasHeightAttr: hasH,
        cssAspectRatio: ar,
        cssWidth: cs.width,
        cssHeight: cs.height,
        loading: el.getAttribute('loading'),
      });
      if (offenders.length >= 50) break;
    }
  }
  return { selector: ${JSON.stringify(selector)}, evaluated: els.length, offenders };
})()
`.trim();
}
function contentAuditSnippet(scope = "body") {
  return `
(() => {
  const root = document.querySelector(${JSON.stringify(scope)});
  const out = { scope: ${JSON.stringify(scope)}, scopeMatched: !!root, evaluated: 0, rawKeys: [], guids: [], brokenImages: [], placeholders: [], midWrap: [] };
  if (!root) return out;
  const KEY = /(^|[^\\w@/.-])([a-z][\\w-]+(?:\\.[a-zA-Z][\\w-]+){2,})(?![\\w-]|\\.\\w|[\\w.-]*[/@])/g;
  const NOT_KEY = /\\.(com|net|org|io|co|ai|ru|de|fr|nl|es|it|pl|eu|uk|us|ca|au|in|me|tv|biz|info|dev|app|shop|store|cloud|online|site|xyz|html?|js|css|json|xml|txt|md|png|jpe?g|gif|ico|svg|webp|mp4|pdf|csv|xlsx?|docx?|zip|gz|tar)$/i;
  const GUID = /\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b/i;
  const PLACEHOLDER = /\\[object Object\\]|\\bNaN\\b|\\bundefined\\b|\\bnull\\b|\\{\\{[^}]*\\}\\}/;
  const VALUE = /[^ \\t\\n\\r\\f]+/g;
  const visible = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const where = (el) => (el.tagName || '').toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '');
  const push = (list, text, el) => { if (list.length < 25) list.push({ text: String(text).slice(0, 120), where: where(el) }); };
  const keysIn = (text, el) => {
    for (const m of text.matchAll(KEY)) if (!NOT_KEY.test(m[2])) push(out.rawKeys, m[2], el);
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.trim();
    const el = n.parentElement;
    if (!text || !el || el.closest('script,style,noscript,template,code,pre') || !visible(el)) continue;
    out.evaluated++;
    keysIn(text, el);
    const g = GUID.exec(text); if (g) push(out.guids, g[0], el);
    if (PLACEHOLDER.test(text)) push(out.placeholders, text, el);
    for (const m of n.nodeValue.matchAll(VALUE)) {
      if (m[0].length < 2 || !/\\d/.test(m[0])) continue;
      const range = document.createRange();
      range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
      const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) push(out.midWrap, m[0], el);
    }
  }
  for (const el of root.querySelectorAll('[aria-label],[title],[placeholder],img[alt]')) {
    if (!visible(el)) continue;
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = el.getAttribute(a);
      if (!v) continue;
      out.evaluated++;
      keysIn(v.trim(), el);
      if (PLACEHOLDER.test(v.trim())) push(out.placeholders, a + '=' + v, el);
    }
  }
  for (const img of root.querySelectorAll('img')) {
    if (visible(img) && img.complete && img.naturalWidth === 0 && (img.currentSrc || img.getAttribute('src'))) {
      push(out.brokenImages, (img.currentSrc || img.getAttribute('src')).slice(0, 160), img);
    }
  }
  return out;
})()
`.trim();
}
var LAYOUT_SNIPPETS = {
  /**
   * Install a layout-shift PerformanceObserver on the CURRENT document.
   *
   * IMPORTANT TIMING CAVEAT (read before using):
   * - `PerformanceObserver` does NOT survive `browser_navigate`. The observer
   *   is bound to one document; the next navigation destroys it.
   * - `buffered: true` retrieves entries from the current document only — not
   *   from any prior document.
   * - Therefore, to measure CLS on a target page, you MUST install AFTER
   *   navigation completes. Shifts that fire between `DOMContentLoaded` and
   *   observer install are still captured by `buffered: true`, but shifts
   *   that completed before the JS engine ran your snippet (very early paint)
   *   are NOT counted.
   * - For pre-paint shifts, use a Playwright `addInitScript` hook (not
   *   available via standard MCP) or a CDP attach. Document this limitation
   *   in test cases that depend on capturing early shifts.
   *
   * Correct sequence:
   *   1. browser_navigate(url)            // navigation completes
   *   2. browser_evaluate(installClsObserver)  // observer attaches, picks up buffered entries
   *   3. browser_wait_for(idle 5s)        // let late shifts (image, font, async) fire
   *   4. browser_evaluate(readCls)        // sample accumulated CLS
   *
   * This under-counts pre-DOMContentLoaded shifts by design. The test case
   * that uses this snippet MUST note "post-paint CLS only" in its description.
   */
  installClsObserver: `
(() => {
  if (window.__layoutAudit && window.__layoutAudit.installed) {
    return { cls: window.__layoutAudit.cls, shiftCount: window.__layoutAudit.shiftCount, installed: true, note: 'already-installed' };
  }
  window.__layoutAudit = { cls: 0, shiftCount: 0, installed: false, installedAt: Date.now(), documentReadyState: document.readyState, sources: [] };
  // Describe the node that moved, so a CLS number becomes an actionable fix list.
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return null;
    const id = node.id ? '#' + node.id : '';
    const cls = (node.getAttribute && node.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3).map(c => '.' + c).join('');
    const tid = node.getAttribute && node.getAttribute('data-test-id');
    return node.tagName.toLowerCase() + id + cls + (tid ? '[data-test-id="' + tid + '"]' : '');
  };
  try {
    const po = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          window.__layoutAudit.cls += e.value;
          window.__layoutAudit.shiftCount += 1;
          // LayoutShiftAttribution[] \u2014 which elements moved, and by how much.
          for (const s of (e.sources || [])) {
            const sel = describe(s.node);
            if (!sel) continue;
            const prev = s.previousRect || {}, cur = s.currentRect || {};
            const existing = window.__layoutAudit.sources.find(x => x.selector === sel);
            const moved = Math.round(Math.abs((cur.top || 0) - (prev.top || 0)));
            if (existing) {
              existing.impact += e.value;
              existing.shifts += 1;
              existing.maxMovePx = Math.max(existing.maxMovePx, moved);
            } else if (window.__layoutAudit.sources.length < 20) {
              window.__layoutAudit.sources.push({ selector: sel, impact: e.value, shifts: 1, maxMovePx: moved });
            }
          }
        }
      }
    });
    po.observe({ type: 'layout-shift', buffered: true });
    window.__layoutAudit.installed = true;
    window.__layoutAudit.observer = po;
  } catch (err) {
    window.__layoutAudit.error = String(err);
  }
  return {
    cls: window.__layoutAudit.cls,
    shiftCount: window.__layoutAudit.shiftCount,
    installed: window.__layoutAudit.installed,
    documentReadyState: window.__layoutAudit.documentReadyState,
    note: 'install-this-AFTER-browser_navigate; buffered:true picks up entries from current document only'
  };
})()
`.trim(),
  /**
   * Force a layout-shift trigger by resizing the viewport +1 px then back.
   * Useful to surface lazy shifts (images, late-arriving async data) that
   * did not fire during the initial idle window. Run between
   * `installClsObserver` and `readCls`.
   */
  triggerReflowProbe: `
(() => {
  // No-op observable side effect: read computed style of body, force reflow.
  // CSS-only; does not change page state visible to the user.
  void document.body.offsetHeight;
  void getComputedStyle(document.body).width;
  return { triggered: true, ts: Date.now() };
})()
`.trim(),
  /** Read accumulated CLS since observer install. Returns ClsResult. */
  readCls: `
(() => {
  const a = window.__layoutAudit;
  if (!a) return { cls: 0, shiftCount: 0, installed: false, sources: [] };
  // Biggest contributors first \u2014 this is the fix list, not just the score.
  const sources = (a.sources || []).slice().sort((x, y) => y.impact - x.impact).slice(0, 10)
    .map(s => ({ selector: s.selector, impact: Math.round(s.impact * 10000) / 10000, shifts: s.shifts, maxMovePx: s.maxMovePx }));
  return { cls: a.cls, shiftCount: a.shiftCount, installed: a.installed, sources };
})()
`.trim(),
  /**
   * Detect horizontal document scroll + any descendant clipped by overflow:hidden.
   * Returns OverflowAuditResult.
   */
  overflowAudit: `
(() => {
  const docScrollWidth = document.documentElement.scrollWidth;
  const innerWidth = window.innerWidth;
  const documentScrolls = docScrollWidth > innerWidth + 1; // 1 px tolerance for rounding
  const clippedChildren = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const cs = getComputedStyle(el);
    const overflowY = cs.overflowY;
    const overflowX = cs.overflowX;
    const yClipped = (overflowY === 'hidden' || overflowY === 'clip') && el.scrollHeight > el.clientHeight + 1;
    const xClipped = (overflowX === 'hidden' || overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1;
    if (yClipped || xClipped) {
      // Skip elements that are entirely off-screen (display:none, etc.)
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      clippedChildren.push({
        tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\\s+/).slice(0, 2).join('.') : ''),
        cssText: 'overflow:' + cs.overflow + ' ' + (yClipped ? 'y-clipped' : 'x-clipped'),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
      if (clippedChildren.length >= 50) break; // cap
    }
  }
  return { documentScrolls, documentScrollWidth: docScrollWidth, innerWidth, clippedChildren };
})()
`.trim(),
  /**
   * Audit every interactive element for ≥ 44×44 size and ≥ 8 px gap. Only meaningful
   * at viewport ≤ 768 px. Returns TouchTargetAuditResult.
   *
   * Scope: audits document-wide. For scoped audits (e.g. main content only,
   * excluding header/footer chrome), use `touchTargetAuditSnippet(scope)` instead.
   */
  touchTargetAudit: `
(() => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem]';
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    return true;
  });
  const AA = ${TOUCH_TARGET_AA_MIN_PX}, AAA = ${TOUCH_TARGET_AAA_MIN_PX};
  const undersized = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < AAA || r.height < AAA) {
      undersized.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        text: (el.textContent || '').trim().slice(0, 40),
        // WCAG 2.2 AA (2.5.8) floor breached \u2014 a real defect, not a design-system tradeoff
        belowAA: r.width < AA || r.height < AA,
      });
    }
  }
  // Pairwise spacing \u2014 O(n^2), cap at 200 elements to stay snappy
  const rects = els.slice(0, 200).map(el => ({ el, r: el.getBoundingClientRect() }));
  const tooClose = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, b = rects[j].r;
      // Closest edge distance (Manhattan-ish), zero if rects overlap
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < 8) {
        tooClose.push({
          aTag: rects[i].el.tagName.toLowerCase(),
          bTag: rects[j].el.tagName.toLowerCase(),
          distancePx: Math.round(d * 10) / 10,
        });
        if (tooClose.length >= 30) break;
      }
    }
    if (tooClose.length >= 30) break;
  }
  return { viewport: window.innerWidth, evaluated: els.length, undersized, tooClose };
})()
`.trim()
};
var COLOR_MATH_JS = String.raw`
function parseColor(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (str === 'transparent') return [0, 0, 0, 0];
  // rgb()/rgba() — legacy comma syntax AND modern space syntax ('rgb(0 0 0 / 50%)').
  const rgbM = str.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbM) {
    const parts = rgbM[1].replace(/\//g, ' ').split(/[,\s]+/).filter(Boolean);
    if (parts.length >= 3) {
      const n = parts.slice(0, 3).map(p => p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p));
      const a = parts.length > 3 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
      if (n.every(v => !Number.isNaN(v)) && !Number.isNaN(a)) return [n[0], n[1], n[2], a];
    }
    return null;
  }
  // color(srgb r g b [/ a]) — vc-frontend emits this widely. Components are 0..1.
  // ONLY srgb is decoded: another colour space needs a real conversion, and a guessed
  // one silently mis-measures, so anything else is reported unparsed instead.
  const fnM = str.match(/^color\(\s*([a-z0-9-]+)\s+([^)]+)\)$/i);
  if (fnM) {
    if (fnM[1].toLowerCase() !== 'srgb') return null;
    const parts = fnM[2].replace(/\//g, ' ').split(/[,\s]+/).filter(Boolean);
    if (parts.length >= 3) {
      const n = parts.slice(0, 3).map(p => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)) * 255);
      const a = parts.length > 3 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
      if (n.every(v => !Number.isNaN(v)) && !Number.isNaN(a)) return [n[0], n[1], n[2], a];
    }
    return null;
  }
  const hexM = str.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexM) {
    let h = hexM[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
  }
  return null;
}
function lum(rgb) {
  const [r, g, b] = rgb.slice(0, 3).map(v => {
    const c = Math.min(255, Math.max(0, v)) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
// Source-over composite of a translucent 'top' onto 'bottom'. Without it a 30%-alpha
// layer was measured at its RAW rgb, i.e. as though fully opaque.
function compositeOver(top, bottom) {
  const a = top[3] == null ? 1 : top[3];
  if (a >= 1) return [top[0], top[1], top[2], 1];
  const ba = bottom[3] == null ? 1 : bottom[3];
  const outA = a + ba * (1 - a);
  if (outA <= 0) return [0, 0, 0, 0];
  const mix = i => (top[i] * a + bottom[i] * ba * (1 - a)) / outA;
  return [mix(0), mix(1), mix(2), outA];
}
`;
var EFFECTIVE_BG_JS = String.raw`
function effectiveBg(el) {
  const layers = [];
  let cur = el;
  while (cur) {
    const bg = parseColor(getComputedStyle(cur).backgroundColor);
    if (bg && bg[3] > 0) {
      if (bg[3] >= 1) return layers.reduceRight((acc, l) => compositeOver(l, acc), bg);
      layers.push(bg);
    }
    cur = cur.parentElement;
  }
  // Nothing opaque anywhere. A fully transparent html/body is the NORMAL case, and the
  // canvas underneath it is white — never black.
  return layers.reduceRight((acc, l) => compositeOver(l, acc), [255, 255, 255, 1]);
}
`;
function spacingAuditSnippet(selector) {
  const grid = SPACING_GRID.join(",");
  return `
(() => {
  const GRID = new Set([${grid}]);
  const PROPS = ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','rowGap','columnGap'];
  const KEBAB = { marginTop: 'margin-top', marginRight: 'margin-right', marginBottom: 'margin-bottom', marginLeft: 'margin-left' };
  const els = document.querySelectorAll(${JSON.stringify(selector)});
  const offGrid = [];
  let index = 0, autoMarginsExcluded = 0, typedOmMissing = 0;
  for (const el of els) {
    const cs = getComputedStyle(el);
    // 'margin: auto' RESOLVES to a used px value \u2014 a centring offset like 85.125px \u2014 so
    // the resolved string never reads 'auto' and every centred block scored as off-grid.
    // The Typed OM exposes the SPECIFIED value, which does.
    let autoProps = null;
    if (typeof el.computedStyleMap === 'function') {
      try {
        const csm = el.computedStyleMap();
        autoProps = new Set();
        for (const k in KEBAB) {
          const v = csm.get(KEBAB[k]);
          if (v && String(v).trim() === 'auto') autoProps.add(k);
        }
      } catch (e) { autoProps = null; }
    }
    if (!autoProps) typedOmMissing++;
    for (const prop of PROPS) {
      const raw = cs[prop];
      if (!raw || raw === 'normal' || raw === 'auto') continue;
      if (autoProps && autoProps.has(prop)) { autoMarginsExcluded++; continue; }
      // Handles "16px", "16px 8px", etc \u2014 only single-value scalars here (PROPS list is scalar)
      const num = parseFloat(raw);
      if (Number.isNaN(num)) continue;
      // Round to nearest 0.5 px to absorb sub-pixel CSS computed noise
      const rounded = Math.round(num);
      if (!GRID.has(rounded)) {
        offGrid.push({
          index,
          tag: el.tagName.toLowerCase(),
          prop,
          value: num,
          cssText: prop + ': ' + raw,
        });
        if (offGrid.length >= 100) break;
      }
    }
    index++;
    if (offGrid.length >= 100) break;
  }
  return { selector: ${JSON.stringify(selector)}, matched: els.length, offGrid, autoMarginsExcluded, typedOmMissing };
})()
`.trim();
}
function alignmentAuditSnippet(selector) {
  return `
(() => {
  const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
  if (els.length < 2) return { selector: ${JSON.stringify(selector)}, matched: els.length, rows: [], centerDriftPx: 0, heightDriftPx: 0, misaligned: false };
  const rows = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    return { index: i, top: Math.round(r.top * 10) / 10, height: Math.round(r.height * 10) / 10, centerY: Math.round((r.top + r.height / 2) * 10) / 10 };
  });
  const centers = rows.map(r => r.centerY);
  const heights = rows.map(r => r.height);
  const centerDriftPx = Math.max(...centers) - Math.min(...centers);
  const heightDriftPx = Math.max(...heights) - Math.min(...heights);
  const misaligned = centerDriftPx > 1 || heightDriftPx > 1;
  return { selector: ${JSON.stringify(selector)}, matched: els.length, rows, centerDriftPx, heightDriftPx, misaligned };
})()
`.trim();
}
function touchTargetAuditSnippet(scope) {
  return `
(() => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem]';
  const root = document.querySelector(${JSON.stringify(scope)});
  if (!root) return { viewport: window.innerWidth, evaluated: 0, undersized: [], tooClose: [], scopeMatched: false };
  const els = Array.from(root.querySelectorAll(SEL)).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    return true;
  });
  const AA = ${TOUCH_TARGET_AA_MIN_PX}, AAA = ${TOUCH_TARGET_AAA_MIN_PX};
  const undersized = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < AAA || r.height < AAA) {
      undersized.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        text: (el.textContent || '').trim().slice(0, 40),
        belowAA: r.width < AA || r.height < AA,
      });
    }
  }
  const rects = els.slice(0, 200).map(el => ({ el, r: el.getBoundingClientRect() }));
  const tooClose = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, b = rects[j].r;
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < 8) {
        tooClose.push({ aTag: rects[i].el.tagName.toLowerCase(), bTag: rects[j].el.tagName.toLowerCase(), distancePx: Math.round(d * 10) / 10 });
        if (tooClose.length >= 30) break;
      }
    }
    if (tooClose.length >= 30) break;
  }
  return { viewport: window.innerWidth, evaluated: els.length, undersized, tooClose, scopeMatched: true };
})()
`.trim();
}
var FOUC_SNIPPET = `
(() => {
  const result = {
    fontReady: document.fonts ? document.fonts.status === 'loaded' : 'unknown',
    fontFamiliesInUse: [...new Set(['body','h1','h2','button'].map(t => {
      const el = document.querySelector(t);
      return el ? getComputedStyle(el).fontFamily : null;
    }).filter(Boolean))],
    themeTokensResolved: (() => {
      const tokens = ['--color-primary', '--color-text', '--spacing-md', '--radius-md'];
      const root = getComputedStyle(document.documentElement);
      return tokens.every(t => root.getPropertyValue(t).trim() !== '');
    })(),
    loadingClassesPresent: Array.from(document.documentElement.classList)
      .filter(c => /loading|skeleton|fouc/i.test(c)),
    documentReadyState: document.readyState,
    ts: Date.now(),
  };
  return result;
})()
`.trim();
function skeletonRectSnippet(selector) {
  return rectSnapshotSnippet(selector);
}
function rectSnapshotSnippet(selector) {
  return `
(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { selector: ${JSON.stringify(selector)}, top: 0, left: 0, width: 0, height: 0, ts: Date.now(), missing: true };
  const r = el.getBoundingClientRect();
  return { selector: ${JSON.stringify(selector)}, top: r.top, left: r.left, width: r.width, height: r.height, ts: Date.now() };
})()
`.trim();
}
function occlusionAuditSnippet(alertSelectors = CRITICAL_ALERT_SELECTORS) {
  return `
(() => {
  const ALERT_SELS = ${JSON.stringify(alertSelectors)};
  const OCCLUDER_SEL = 'button, a, [role=button], [role=link], svg, img, [data-test-id], .vc-icon';
  // Severe overlap threshold: occluder covers \u2265 25% of the alert's rect area.
  const SEVERE_FRACTION = 0.25;
  const alerts = Array.from(document.querySelectorAll(ALERT_SELS.join(', ')));
  const overlaps = [];
  for (const alert of alerts) {
    const ar = alert.getBoundingClientRect();
    if (ar.width === 0 || ar.height === 0) continue;
    // Search occluder candidates within the alert's nearest "card" / "item" ancestor \u2014
    // covers same-card collisions like F-CART-006 and avoids false positives from
    // unrelated page elements (footer icons, headers).
    const ancestor = alert.closest('.vc-line-item, .vc-product-card, .vc-card, [data-test-id*="card"], [data-test-id*="item"]') || alert.parentElement;
    if (!ancestor) continue;
    const candidates = Array.from(ancestor.querySelectorAll(OCCLUDER_SEL));
    for (const c of candidates) {
      if (alert === c || alert.contains(c) || c.contains(alert)) continue; // skip self / parent / child
      const cs = getComputedStyle(c);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
      const cr = c.getBoundingClientRect();
      if (cr.width === 0 || cr.height === 0) continue;
      // Rect intersection
      const overlapLeft = Math.max(ar.left, cr.left);
      const overlapTop = Math.max(ar.top, cr.top);
      const overlapRight = Math.min(ar.right, cr.right);
      const overlapBottom = Math.min(ar.bottom, cr.bottom);
      const w = overlapRight - overlapLeft;
      const h = overlapBottom - overlapTop;
      if (w <= 0 || h <= 0) continue;
      const area = w * h;
      const alertArea = ar.width * ar.height;
      const severe = alertArea > 0 ? (area / alertArea) >= SEVERE_FRACTION : false;
      overlaps.push({
        alertTag: alert.tagName.toLowerCase() + (alert.className && typeof alert.className === 'string' ? '.' + alert.className.split(/\\s+/).slice(0, 2).join('.') : ''),
        alertText: (alert.textContent || '').trim().slice(0, 60),
        occluderTag: c.tagName.toLowerCase() + (c.getAttribute('data-test-id') ? '[data-test-id=' + c.getAttribute('data-test-id') + ']' : ''),
        occluderRole: c.getAttribute('role'),
        overlapWidth: Math.round(w * 10) / 10,
        overlapHeight: Math.round(h * 10) / 10,
        overlapArea: Math.round(area * 10) / 10,
        severe,
      });
      if (overlaps.length >= 40) break;
    }
    if (overlaps.length >= 40) break;
  }
  return { alertSelectors: ALERT_SELS, alertsFound: alerts.length, overlaps };
})()
`.trim();
}
function contrastAuditSnippet(selector = "body *") {
  return `
(() => {
  const SEL = ${JSON.stringify(selector)};
  ${COLOR_MATH_JS}
  ${EFFECTIVE_BG_JS}
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    // Only leaf text nodes \u2014 has direct text content but no element children with text.
    if (!el.textContent || !el.textContent.trim()) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // Must have own text \u2014 not just child text
    const ownText = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim()).length > 0;
    return ownText;
  });
  const violations = [];
  const unparsed = [];
  let evaluated = 0;
  for (const el of els) {
    evaluated++;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg) {
      // A colour we cannot decode is a GAP, not a pass \u2014 record it so the classifier
      // can downgrade to WARN instead of reporting partial coverage as complete.
      if (unparsed.length < 20) unparsed.push({ tag: el.tagName.toLowerCase(), prop: 'color', value: String(cs.color) });
      continue;
    }
    const bg = effectiveBg(el);
    const fontSizePx = parseFloat(cs.fontSize) || 16;
    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
    const required = isLargeText ? ${CONTRAST_RATIOS.large} : ${CONTRAST_RATIOS.normal};
    const r = ratio(fg, bg);
    if (r < required) {
      violations.push({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim().slice(0, 60),
        color: cs.color,
        background: 'rgba(' + bg.join(',') + ')',
        ratio: Math.round(r * 100) / 100,
        isLargeText,
        requiredRatio: required,
      });
      if (violations.length >= 50) break;
    }
  }
  return { selector: SEL, evaluated, violations, unparsed };
})()
`.trim();
}
var focusIndicatorAudit = `
(() => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem]';
  let skipped = 0;
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    if (el.tabIndex < 0) return false;
    // WCAG 2.4.7 exempts inactive controls \u2014 don't flag a missing ring on disabled ones.
    if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') { skipped++; return false; }
    return true;
  });
  // Cap to 100 to keep snippet snappy
  const sample = els.slice(0, 100);
  const missing = [];
  const indeterminate = [];
  const previouslyFocused = document.activeElement;
  for (const el of sample) {
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      continue;
    }
    const cs = getComputedStyle(el);
    const outlineWidth = parseFloat(cs.outlineWidth) || 0;
    const outlineStyle = cs.outlineStyle;
    const boxShadow = cs.boxShadow;
    // No outline = check for box-shadow ring (common pattern: 0 0 0 2px theme-color).
    const hasOutline = outlineWidth >= ${FOCUS_INDICATOR_MIN_PX} && outlineStyle !== 'none';
    const hasBoxShadowRing = boxShadow && boxShadow !== 'none' && /(\\d+)px/.test(boxShadow);
    if (hasOutline || hasBoxShadowRing) continue; // has a ring \u2014 PASS
    // No ring seen. Is a :focus-visible-gated rule even active right now?
    let focusVisible = false;
    try { focusVisible = el.matches(':focus-visible'); } catch (e) { focusVisible = false; }
    if (!focusVisible) {
      // Programmatic focus did not trigger :focus-visible; a ring keyed on it would not render.
      // Cannot conclude "missing" \u2014 mark indeterminate (confirm via real Tab).
      indeterminate.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        text: (el.textContent || '').trim().slice(0, 40),
      });
      if (indeterminate.length >= 30) continue;
      continue;
    }
    missing.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      text: (el.textContent || '').trim().slice(0, 40),
      outlineWidth,
      outlineStyle,
      boxShadowPresent: !!hasBoxShadowRing,
    });
    if (missing.length >= 30) break;
  }
  // Restore prior focus
  try { if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus({ preventScroll: true }); } catch (e) {}
  return { evaluated: sample.length, missing, indeterminate, skipped };
})()
`.trim();
function imageAspectAuditSnippet(selector = "img") {
  return `
(() => {
  const SEL = ${JSON.stringify(selector)};
  const TOLERANCE = ${IMAGE_ASPECT_TOLERANCE};
  const imgs = Array.from(document.querySelectorAll(SEL));
  const violations = [];
  let evaluated = 0;
  for (const img of imgs) {
    if (!(img instanceof HTMLImageElement)) continue;
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) continue;
    const cs = getComputedStyle(img);
    // object-fit: cover/contain crops without distorting \u2014 skip
    if (cs.objectFit === 'cover' || cs.objectFit === 'contain' || cs.objectFit === 'scale-down') continue;
    evaluated++;
    const dispW = img.clientWidth || img.getBoundingClientRect().width;
    const dispH = img.clientHeight || img.getBoundingClientRect().height;
    if (dispW === 0 || dispH === 0) continue;
    const intrinsicRatio = img.naturalWidth / img.naturalHeight;
    const displayedRatio = dispW / dispH;
    const drift = Math.abs(displayedRatio - intrinsicRatio) / intrinsicRatio;
    if (drift > TOLERANCE) {
      violations.push({
        src: (img.src || '').slice(0, 120),
        intrinsicWidth: img.naturalWidth,
        intrinsicHeight: img.naturalHeight,
        displayedWidth: Math.round(dispW * 10) / 10,
        displayedHeight: Math.round(dispH * 10) / 10,
        intrinsicRatio: Math.round(intrinsicRatio * 1000) / 1000,
        displayedRatio: Math.round(displayedRatio * 1000) / 1000,
        drift: Math.round(drift * 1000) / 1000,
      });
      if (violations.length >= 30) break;
    }
  }
  return { selector: SEL, evaluated, violations };
})()
`.trim();
}
function nonTextContrastAuditSnippet(selector = 'svg, .vc-icon, [class*="icon"] svg, [class*="icon"]') {
  return `
(() => {
  const SEL = ${JSON.stringify(selector)};
  const REQUIRED = ${NON_TEXT_CONTRAST_RATIO};
  ${COLOR_MATH_JS}
  ${EFFECTIVE_BG_JS}
  // Resolve the glyph's painted color: prefer a real stroke (outline icons), then fill (solid), then CSS color.
  function glyphColor(el, cs) {
    const stroke = parseColor(cs.stroke);
    if (cs.stroke && cs.stroke !== 'none' && stroke && stroke[3] > 0) return stroke;
    const fill = parseColor(cs.fill);
    if (cs.fill && cs.fill !== 'none' && fill && fill[3] > 0) return fill;
    return parseColor(cs.color);
  }
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return true;
  });
  const violations = [];
  const unparsed = [];
  let evaluated = 0, exempt = 0;
  for (const el of els) {
    // WCAG 1.4.11 exempts inactive components.
    const host = el.closest('button, a[href], [role=button], [role=link], input, select, textarea');
    if (host && (host.disabled === true || host.getAttribute('aria-disabled') === 'true')) { exempt++; continue; }
    const cs = getComputedStyle(el);
    const fg = glyphColor(el, cs);
    if (!fg) {
      if (unparsed.length < 20) unparsed.push({ tag: el.tagName.toLowerCase(), prop: 'stroke/fill/color', value: [cs.stroke, cs.fill, cs.color].join(' | ') });
      continue;
    }
    evaluated++;
    const bg = effectiveBg(el);
    const r = ratio(fg, bg);
    if (r < REQUIRED) {
      violations.push({
        tag: el.tagName.toLowerCase() + (el.getAttribute('data-test-id') ? '[data-test-id=' + el.getAttribute('data-test-id') + ']' : ''),
        label: (el.getAttribute('aria-label') || (host && host.getAttribute('aria-label')) || (el.getAttribute('name')) || '').slice(0, 40),
        foreground: 'rgb(' + fg.slice(0, 3).map(Math.round).join(',') + ')',
        background: 'rgb(' + bg.slice(0, 3).map(Math.round).join(',') + ')',
        ratio: Math.round(r * 100) / 100,
        requiredRatio: REQUIRED,
      });
      if (violations.length >= 50) break;
    }
  }
  return { selector: SEL, evaluated, violations, exempt, unparsed };
})()
`.trim();
}
function sizedControlAuditSnippet(selector, opts = {}) {
  const square = opts.square !== false && opts.ratio == null;
  return `
(() => {
  const SEL = ${JSON.stringify(selector)};
  const OPTS = ${JSON.stringify({ expectedPx: opts.expectedPx ?? null, tokenVar: opts.tokenVar ?? null, ratio: opts.ratio ?? null })};
  const SQUARE = ${square};
  const TOL = ${SIZED_CONTROL_TOLERANCE_PX};
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  const violations = [];
  let evaluated = 0;
  let resolvedExpected = OPTS.expectedPx;
  for (const el of els) {
    evaluated++;
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width * 10) / 10, h = Math.round(r.height * 10) / 10;
    let expected = OPTS.expectedPx;
    if (OPTS.tokenVar) {
      const tv = getComputedStyle(el).getPropertyValue(OPTS.tokenVar).trim();
      const px = parseFloat(tv);
      if (!Number.isNaN(px)) { expected = px; resolvedExpected = px; }
    }
    const reasons = [];
    if (expected != null && (Math.abs(w - expected) > TOL || Math.abs(h - expected) > TOL)) {
      reasons.push('off-token (rendered ' + w + 'x' + h + ' vs token ' + expected + 'px)');
    }
    if (OPTS.ratio != null) {
      const actual = h > 0 ? w / h : 0;
      if (Math.abs(actual - OPTS.ratio) / OPTS.ratio > 0.02) reasons.push('wrong ratio ' + (Math.round(actual * 100) / 100) + ' vs ' + OPTS.ratio);
    } else if (SQUARE && Math.abs(w - h) > TOL) {
      reasons.push('non-square ' + w + 'x' + h);
    }
    if (reasons.length) {
      violations.push({ tag: el.tagName.toLowerCase() + (el.getAttribute('data-test-id') ? '[data-test-id=' + el.getAttribute('data-test-id') + ']' : ''), width: w, height: h, reason: reasons.join('; '), expectedPx: expected });
      if (violations.length >= 40) break;
    }
  }
  return { selector: SEL, expectedPx: resolvedExpected, square: SQUARE, ratio: OPTS.ratio, evaluated, violations };
})()
`.trim();
}
function alertSemanticsAuditSnippet(selector = '.vc-alert--danger, .vc-alert--warning, [class*="line-item__after"], [class*="error"], [class*="warning"]') {
  return `
(() => {
  const SEL = ${JSON.stringify(selector)};
  const isAnnounced = el => !!(el.closest('[role=alert], [role=alertdialog], [role=status], [aria-live]') || el.querySelector('[role=alert], [role=status], [aria-live]'));
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return (el.textContent || '').trim().length > 0;
  });
  const unannounced = [];
  let evaluated = 0;
  for (const el of els) {
    evaluated++;
    if (!isAnnounced(el)) {
      unannounced.push({
        tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\\s+/).slice(0, 2).join('.') : ''),
        text: (el.textContent || '').trim().slice(0, 80),
      });
      if (unannounced.length >= 40) break;
    }
  }
  return { selector: SEL, evaluated, unannounced };
})()
`.trim();
}
function bladeStaticOverflowSnippet(bladeHeaderText = "") {
  return `
(() => {
  const HDR = ${JSON.stringify(bladeHeaderText)};
  const blades = [...document.querySelectorAll('.blade, [class*="blade-container"]')];
  const hasParts = b => b.querySelector('.blade-static:not(.__bottom)') && b.querySelector('.blade-content');
  let blade = HDR ? blades.find(b => (b.textContent || '').includes(HDR) && hasParts(b)) || blades.find(b => (b.textContent || '').includes(HDR))
                  : blades.find(hasParts);
  if (!blade) blade = blades.find(b => b.querySelector('.blade-static')) || blades[blades.length - 1] || document.body;
  const q = s => blade.querySelector(s);
  const rect = el => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
  const staticEl = q('.blade-static:not(.__bottom)');
  const contentEl = q('.blade-content');
  if (!staticEl || !contentEl) {
    return { bladeFound: false, bladeHeader: HDR, bladeStatic: null, bladeStaticBoxBottom: null, bladeStaticContentBottom: null,
      bladeContentTop: null, offender: null, searchrow: null, contentHeader: null, noteVisible: false, overflowPx: null, PASS: null,
      note_: 'no .blade-static + .blade-content in the located blade \u2014 open the target blade first' };
  }
  // Real content extent of the fixed-height blade-static = the lowest visible descendant bottom.
  let maxBottom = staticEl.getBoundingClientRect().top, offender = null;
  for (const el of staticEl.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom > maxBottom) { maxBottom = r.bottom; offender = el; }
  }
  maxBottom = Math.round(maxBottom);
  const contentTop = Math.round(contentEl.getBoundingClientRect().top);
  const overflowPx = Math.max(0, maxBottom - contentTop);
  const searchrow = q('.searchrow');
  const note = q('.text.__note') || q('.__note');
  const header = contentEl.querySelector('.ui-grid-header') || contentEl.querySelector('.ui-grid-header-viewport')
              || contentEl.querySelector('thead') || contentEl.querySelector('.inner-block > *');
  const clsStr = el => (el && typeof el.className === 'string') ? el.className : (el ? String(el.getAttribute('class') || '') : '');
  return {
    bladeFound: blade !== document.body,
    bladeHeader: HDR,
    bladeStatic: Object.assign({ cls: clsStr(staticEl), cssHeight: getComputedStyle(staticEl).height, overflowY: getComputedStyle(staticEl).overflowY }, rect(staticEl)),
    bladeStaticBoxBottom: rect(staticEl).bottom,
    bladeStaticContentBottom: maxBottom,
    bladeContentTop: contentTop,
    offender: offender ? { tag: offender.tagName.toLowerCase(), cls: clsStr(offender).split(/\\s+/).slice(0, 3).join('.'), bottom: Math.round(offender.getBoundingClientRect().bottom) } : null,
    searchrow: searchrow ? rect(searchrow) : null,
    contentHeader: header ? rect(header) : null,
    noteVisible: !!note && note.getBoundingClientRect().height > 0,
    overflowPx,
    PASS: maxBottom <= contentTop,
    note_: overflowPx > 0
      ? ('OVERFLOW ' + overflowPx + 'px: blade-static content bottom (' + maxBottom + ') spills below blade-content top (' + contentTop + ')')
      : 'clean: blade-static content sits above blade-content'
  };
})()
`.trim();
}
function classifyCls(result) {
  const { cls, shiftCount } = result;
  if (cls >= CLS_THRESHOLDS.fail) {
    return {
      invariant: "BL-UI-001",
      severity: "P0",
      message: `CLS ${cls.toFixed(3)} \u2265 ${CLS_THRESHOLDS.fail} (P0) across ${shiftCount} shifts`,
      evidence: result
    };
  }
  if (cls >= CLS_THRESHOLDS.pass) {
    return {
      invariant: "BL-UI-001",
      severity: "FAIL",
      message: `CLS ${cls.toFixed(3)} \u2265 ${CLS_THRESHOLDS.pass} across ${shiftCount} shifts`,
      evidence: result
    };
  }
  return {
    invariant: "BL-UI-001",
    severity: "PASS",
    message: `CLS ${cls.toFixed(3)} (${shiftCount} shifts)`,
    evidence: result
  };
}
function classifySpacing(result) {
  const auto = result.autoMarginsExcluded ?? 0;
  const blind = result.typedOmMissing ?? 0;
  const autoNote = auto > 0 ? `; ${auto} \`margin:auto\` centring offset(s) excluded` : "";
  const blindNote = blind > 0 ? `; ${blind} element(s) without Typed OM \u2014 \`margin:auto\` undetectable there` : "";
  if (result.offGrid.length === 0) {
    return {
      invariant: "BL-UI-002",
      severity: "PASS",
      message: `All spacing on grid (${result.matched} elements audited${autoNote}${blindNote})`,
      evidence: result
    };
  }
  return {
    invariant: "BL-UI-002",
    severity: "FAIL",
    message: `${result.offGrid.length} off-grid spacing values (e.g. ${result.offGrid[0].cssText})${autoNote}${blindNote}`,
    evidence: result
  };
}
function classifyAlignment(result) {
  if (!result.misaligned) {
    return {
      invariant: "BL-UI-005",
      severity: "PASS",
      message: `Row aligned (centerDrift ${result.centerDriftPx} px, heightDrift ${result.heightDriftPx} px)`,
      evidence: result
    };
  }
  return {
    invariant: "BL-UI-005",
    severity: "FAIL",
    message: `Misalignment: centerDrift ${result.centerDriftPx} px, heightDrift ${result.heightDriftPx} px (tolerance ${ALIGNMENT_TOLERANCE_PX} px)`,
    evidence: result
  };
}
function classifyOverflow(result) {
  if (!result.documentScrolls && result.clippedChildren.length === 0) {
    return {
      invariant: "BL-UI-004",
      severity: "PASS",
      message: `No horizontal scroll, no clipped content`,
      evidence: result
    };
  }
  const parts = [];
  if (result.documentScrolls) {
    parts.push(
      `document scrolls horizontally (scrollWidth ${result.documentScrollWidth} > innerWidth ${result.innerWidth})`
    );
  }
  if (result.clippedChildren.length > 0) {
    parts.push(
      `${result.clippedChildren.length} clipped children (first: ${result.clippedChildren[0].tag})`
    );
  }
  return {
    invariant: "BL-UI-004",
    severity: "FAIL",
    message: parts.join("; "),
    evidence: result
  };
}
function classifyTouchTargets(result) {
  if (result.viewport > 768) {
    return {
      invariant: "BL-UI-006",
      severity: "PASS",
      message: `Touch-target rule does not apply (viewport ${result.viewport} px > 768)`,
      evidence: result
    };
  }
  const belowAA = result.undersized.filter((u) => u.belowAA);
  const belowAAAOnly = result.undersized.filter((u) => !u.belowAA);
  const failIssues = [];
  const warnIssues = [];
  if (belowAA.length > 0) {
    failIssues.push(
      `${belowAA.length} interactive(s) below the WCAG 2.2 AA floor ${TOUCH_TARGET_AA_MIN_PX}\xD7${TOUCH_TARGET_AA_MIN_PX} (SC 2.5.8)`
    );
  }
  if (result.tooClose.length > 0) {
    failIssues.push(`${result.tooClose.length} interactive pair(s) closer than ${TOUCH_TARGET_GAP_PX} px`);
  }
  if (belowAAAOnly.length > 0) {
    warnIssues.push(
      `${belowAAAOnly.length} interactive(s) between ${TOUCH_TARGET_AA_MIN_PX}\xD7${TOUCH_TARGET_AA_MIN_PX} and the AAA target ${TOUCH_TARGET_AAA_MIN_PX}\xD7${TOUCH_TARGET_AAA_MIN_PX} (SC 2.5.5) \u2014 AA-conformant; check against the UI-kit size scale before filing`
    );
  }
  if (failIssues.length > 0) {
    return {
      invariant: "BL-UI-006",
      severity: "FAIL",
      message: [...failIssues, ...warnIssues].join("; "),
      evidence: result
    };
  }
  if (warnIssues.length > 0) {
    return {
      invariant: "BL-UI-006",
      severity: "WARN",
      message: warnIssues.join("; "),
      evidence: result
    };
  }
  return {
    invariant: "BL-UI-006",
    severity: "PASS",
    message: `All ${result.evaluated} interactives meet ${TOUCH_TARGET_AAA_MIN_PX}\xD7${TOUCH_TARGET_AAA_MIN_PX} + ${TOUCH_TARGET_GAP_PX} px spacing`,
    evidence: result
  };
}
function classifyOcclusion(result) {
  if (result.overlaps.length === 0) {
    return {
      invariant: "PROPOSED-BL-UI-007",
      severity: "PASS",
      message: `No occlusion of ${result.alertsFound} critical alert(s)`,
      evidence: result
    };
  }
  const severeCount = result.overlaps.filter((o) => o.severe).length;
  const sample = result.overlaps[0];
  return {
    invariant: "PROPOSED-BL-UI-007",
    severity: severeCount > 0 ? "P0" : "FAIL",
    message: `${result.overlaps.length} occlusion(s) of critical alerts${severeCount > 0 ? ` (${severeCount} severe, \u2265 25% coverage)` : ""}; first: ${sample.occluderTag} overlaps ${sample.alertTag} by ${sample.overlapWidth}\xD7${sample.overlapHeight} px`,
    evidence: result
  };
}
function classifyContrast(result) {
  const skipped = result.unparsed?.length ?? 0;
  const skipNote = skipped > 0 ? ` (${skipped} skipped \u2014 undecodable colour, e.g. "${result.unparsed[0].value}"; coverage INCOMPLETE)` : "";
  if (result.violations.length === 0) {
    return {
      invariant: "PROPOSED-BL-UI-008",
      severity: skipped > 0 ? "WARN" : "PASS",
      message: `${result.evaluated} text nodes evaluated, 0 WCAG 1.4.3 violations${skipNote}`,
      evidence: result
    };
  }
  const worst = result.violations.reduce((a, b) => a.ratio < b.ratio ? a : b);
  return {
    invariant: "PROPOSED-BL-UI-008",
    severity: "FAIL",
    message: `${result.violations.length} contrast violation(s); worst: ${worst.ratio}:1 (needs ${worst.requiredRatio}:1) on "${worst.text}"${skipNote}`,
    evidence: result
  };
}
function classifyFocusIndicator(result) {
  const indet = result.indeterminate?.length ?? 0;
  const indetNote = indet > 0 ? ` (${indet} indeterminate \u2014 confirm via real keyboard Tab)` : "";
  if (result.missing.length === 0) {
    return {
      invariant: "PROPOSED-BL-UI-009",
      severity: indet > 0 ? "WARN" : "PASS",
      message: `${result.evaluated} interactives audited: no confirmed missing focus ring${indetNote}`,
      evidence: result
    };
  }
  return {
    invariant: "PROPOSED-BL-UI-009",
    severity: "FAIL",
    message: `${result.missing.length} interactive(s) with :focus-visible active but no ring (\u2265 ${FOCUS_INDICATOR_MIN_PX} px outline OR contrasting box-shadow)${indetNote}`,
    evidence: result
  };
}
function classifyNonTextContrast(result) {
  const skipped = result.unparsed?.length ?? 0;
  const skipNote = skipped > 0 ? ` (${skipped} skipped \u2014 undecodable glyph colour, e.g. "${result.unparsed[0].value}"; coverage INCOMPLETE)` : "";
  if (result.violations.length === 0) {
    return {
      invariant: "PROPOSED-BL-UI-008-NONTEXT",
      severity: skipped > 0 ? "WARN" : "PASS",
      message: `All ${result.evaluated} enabled glyphs meet WCAG 1.4.11 (${NON_TEXT_CONTRAST_RATIO}:1); ${result.exempt} exempt (disabled)${skipNote}`,
      evidence: result
    };
  }
  const worst = result.violations.reduce((a, b) => a.ratio < b.ratio ? a : b);
  return {
    invariant: "PROPOSED-BL-UI-008-NONTEXT",
    severity: "FAIL",
    message: `${result.violations.length} icon/graphic contrast violation(s) (WCAG 1.4.11); worst ${worst.ratio}:1 (needs ${worst.requiredRatio}:1)${worst.label ? ` on "${worst.label}"` : ""}`,
    evidence: result
  };
}
function classifySizedControl(result) {
  if (result.violations.length === 0) {
    return {
      invariant: "SIZED-CONTROL",
      severity: "PASS",
      message: `All ${result.evaluated} control(s) on token${result.expectedPx != null ? ` (${result.expectedPx}px)` : ""}${result.square ? " and square" : ""}`,
      evidence: result
    };
  }
  const sample = result.violations[0];
  return {
    invariant: "SIZED-CONTROL",
    severity: "FAIL",
    message: `${result.violations.length} sized-control violation(s); first: ${sample.tag} ${sample.reason}`,
    evidence: result
  };
}
function classifyAlertSemantics(result) {
  if (result.unannounced.length === 0) {
    return {
      invariant: "WCAG-4.1.3",
      severity: "PASS",
      message: `All ${result.evaluated} alert-like element(s) carry alert/status/live semantics`,
      evidence: result
    };
  }
  return {
    invariant: "WCAG-4.1.3",
    severity: "WARN",
    message: `${result.unannounced.length} visible message(s) with no role=alert/status/aria-live (screen reader won't announce); first: "${result.unannounced[0].text}"`,
    evidence: result
  };
}
function classifyImageAspect(result) {
  if (result.violations.length === 0) {
    return {
      invariant: "PROPOSED-BL-UI-010",
      severity: "PASS",
      message: `All ${result.evaluated} images preserve their intrinsic aspect ratio (\xB1${IMAGE_ASPECT_TOLERANCE * 100}%)`,
      evidence: result
    };
  }
  const worst = result.violations.reduce((a, b) => a.drift > b.drift ? a : b);
  return {
    invariant: "PROPOSED-BL-UI-010",
    severity: "FAIL",
    message: `${result.violations.length} distorted image(s); worst drift ${(worst.drift * 100).toFixed(1)}% on ${worst.src.split("/").pop()}`,
    evidence: result
  };
}
function classifyBladeStaticOverflow(result) {
  if (result.overflowPx == null || result.PASS == null) {
    return {
      invariant: "ADMIN-BLADE-OVERLAP",
      severity: "WARN",
      message: `Could not measure (no blade-static + blade-content located) \u2014 open the target blade first`,
      evidence: result
    };
  }
  if (result.PASS) {
    return {
      invariant: "ADMIN-BLADE-OVERLAP",
      severity: "PASS",
      message: `blade-static content sits above blade-content (overflow ${result.overflowPx} px)`,
      evidence: result
    };
  }
  const off = result.offender ? ` (offender: ${result.offender.tag}.${result.offender.cls})` : "";
  return {
    invariant: "ADMIN-BLADE-OVERLAP",
    severity: "FAIL",
    message: `Fixed-height blade-static content overflows onto blade-content by ${result.overflowPx} px${off}${result.noteVisible ? " \u2014 note shown above the toolbar; reserve height via __expanded or move the note into content" : " \u2014 reserve toolbar height via __expanded or move overflow content out"}`,
    evidence: result
  };
}
function compareRectSnapshots(before, after) {
  const topDelta = Math.abs(after.top - before.top);
  const leftDelta = Math.abs(after.left - before.left);
  const widthDelta = Math.abs(after.width - before.width);
  const heightDelta = Math.abs(after.height - before.height);
  const shifted = topDelta > 0 || leftDelta > 0;
  if (!shifted) {
    return {
      invariant: "BL-UI-003",
      severity: "PASS",
      message: `No shift on ${before.selector} (\u0394size ${widthDelta}\xD7${heightDelta} px is allowed)`,
      evidence: { before, after, topDelta, leftDelta }
    };
  }
  return {
    invariant: "BL-UI-003",
    severity: "FAIL",
    message: `${before.selector} shifted \u0394top=${topDelta} px \u0394left=${leftDelta} px`,
    evidence: { before, after, topDelta, leftDelta }
  };
}
function analyzeLayoutResults(bundle) {
  const findings = [];
  if (bundle.cls) findings.push(classifyCls(bundle.cls));
  if (bundle.spacing) findings.push(classifySpacing(bundle.spacing));
  if (bundle.alignment) findings.push(classifyAlignment(bundle.alignment));
  if (bundle.overflow) findings.push(classifyOverflow(bundle.overflow));
  if (bundle.targets) findings.push(classifyTouchTargets(bundle.targets));
  if (bundle.occlusion) findings.push(classifyOcclusion(bundle.occlusion));
  if (bundle.contrast) findings.push(classifyContrast(bundle.contrast));
  if (bundle.nonTextContrast) findings.push(classifyNonTextContrast(bundle.nonTextContrast));
  if (bundle.focusIndicator) findings.push(classifyFocusIndicator(bundle.focusIndicator));
  if (bundle.imageAspect) findings.push(classifyImageAspect(bundle.imageAspect));
  if (bundle.sizedControl) findings.push(classifySizedControl(bundle.sizedControl));
  if (bundle.alertSemantics) findings.push(classifyAlertSemantics(bundle.alertSemantics));
  if (bundle.bladeOverflow) findings.push(classifyBladeStaticOverflow(bundle.bladeOverflow));
  if (bundle.shifts) {
    for (const s of bundle.shifts) {
      findings.push(compareRectSnapshots(s.before, s.after));
    }
  }
  return findings;
}
function summarize(findings) {
  const counts = { PASS: 0, WARN: 0, FAIL: 0, P0: 0 };
  for (const f of findings) counts[f.severity]++;
  const failing = findings.filter((f) => f.severity === "FAIL" || f.severity === "P0");
  const header = `Layout audit: ${counts.PASS} pass \xB7 ${counts.WARN} warn \xB7 ${counts.FAIL} fail \xB7 ${counts.P0} P0`;
  if (failing.length === 0) return header;
  const lines = failing.map((f) => `  [${f.severity}] ${f.invariant} \u2014 ${f.message}`);
  return [header, ...lines].join("\n");
}
export {
  ALIGNMENT_TOLERANCE_PX,
  AUDIT_VIEWPORTS_PX,
  BREAKPOINTS_PX,
  CLS_THRESHOLDS,
  COLOR_MATH_JS,
  CONTRAST_RATIOS,
  CRITICAL_ALERT_SELECTORS,
  EFFECTIVE_BG_JS,
  EXTEND_SPACING_PX,
  FOCUS_INDICATOR_MIN_PX,
  FOUC_SNIPPET,
  IMAGE_ASPECT_TOLERANCE,
  LAYOUT_SNIPPETS,
  NON_TEXT_CONTRAST_RATIO,
  SIZED_CONTROL_TOLERANCE_PX,
  SPACING_GRID,
  SPACING_GRID_PX,
  TAILWIND_DEFAULT_SPACING_PX,
  TOUCH_TARGET_AAA_MIN_PX,
  TOUCH_TARGET_AA_MIN_PX,
  TOUCH_TARGET_GAP_PX,
  TOUCH_TARGET_MIN_PX,
  UI_KIT_BUTTON_SIZES_PX,
  alertSemanticsAuditSnippet,
  alignmentAuditSnippet,
  analyzeLayoutResults,
  bladeStaticOverflowSnippet,
  classifyAlertSemantics,
  classifyAlignment,
  classifyBladeStaticOverflow,
  classifyCls,
  classifyContrast,
  classifyFocusIndicator,
  classifyImageAspect,
  classifyNonTextContrast,
  classifyOcclusion,
  classifyOverflow,
  classifySizedControl,
  classifySpacing,
  classifyTouchTargets,
  compareRectSnapshots,
  contentAuditSnippet,
  contrastAuditSnippet,
  focusIndicatorAudit,
  imageAspectAuditSnippet,
  imageIntrinsicDimsSnippet,
  nonTextContrastAuditSnippet,
  occlusionAuditSnippet,
  rectSnapshotSnippet,
  sizedControlAuditSnippet,
  skeletonRectSnippet,
  spacingAuditSnippet,
  summarize,
  touchTargetAuditSnippet
};
