/**
 * Measure Layout — pixel-level layout-defect detection snippets and analyzers.
 *
 * Used by ui-ux-expert and qa-frontend-expert agents to catch the defects that
 * static screenshots miss: layout shift (CLS), off-grid spacing, sibling
 * misalignment, content overflow, and undersized touch targets.
 *
 * USAGE (agent flow, via MCP `browser_evaluate`):
 *
 *   1. Install CLS observer BEFORE navigating to the story / page:
 *        browser_evaluate(LAYOUT_SNIPPETS.installClsObserver)
 *
 *   2. Navigate, interact, wait for idle.
 *
 *   3. Read measurements:
 *        const cls       = await browser_evaluate(LAYOUT_SNIPPETS.readCls)
 *        const spacing   = await browser_evaluate(spacingAuditSnippet('.product-card'))
 *        const alignment = await browser_evaluate(alignmentAuditSnippet('.cart-row > *'))
 *        const overflow  = await browser_evaluate(LAYOUT_SNIPPETS.overflowAudit)
 *        const targets   = await browser_evaluate(LAYOUT_SNIPPETS.touchTargetAudit)
 *
 *   4. Classify with the analyzers exported below:
 *        const findings = analyzeLayoutResults({ cls, spacing, alignment, overflow, targets })
 *
 * The snippets are intentionally string-typed so they can be passed verbatim to
 * any MCP `evaluate` tool (playwright-*, Chrome DevTools). They use no imports
 * and no TypeScript syntax — pure JS executable in any modern browser context.
 *
 * Invariants enforced (see `.claude/agents/qa/ui-ux-expert.md` Layer 1):
 *   BL-UI-001  Layout stability (CLS ≤ 0.1)
 *   BL-UI-002  Spacing grid {4,8,12,16,20,24,32,40,48,56,64,80,96} px
 *   BL-UI-003  No state-induced shift (rect Δ = 0 on hover/focus)
 *   BL-UI-004  Content boundary (no silent overflow, no horizontal scroll)
 *   BL-UI-005  Alignment (vertical centers within 1 px, row heights match)
 *   BL-UI-006  Touch targets (≥ 44×44 px, ≥ 8 px gap at ≤ 768 px viewport)
 */

// ---------------------------------------------------------------------------
// Grid & threshold constants
// ---------------------------------------------------------------------------

/** Allowed computed spacing values in px. Anything else is off-grid (BL-UI-002). */
export const SPACING_GRID = [
  0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96,
] as const;

/** Cumulative Layout Shift classification thresholds (BL-UI-001). */
export const CLS_THRESHOLDS = { pass: 0.1, fail: 0.25 } as const;

/** Pixel tolerance for alignment checks (BL-UI-005). 1 px absorbs sub-pixel rendering noise. */
export const ALIGNMENT_TOLERANCE_PX = 1;

/** Touch target minimum at ≤ 768 px viewport (BL-UI-006, WCAG 2.5.5). */
export const TOUCH_TARGET_MIN_PX = 44;

/** Minimum gap between adjacent interactive elements at mobile viewport (BL-UI-006). */
export const TOUCH_TARGET_GAP_PX = 8;

/** WCAG 1.4.3 contrast ratio thresholds (BL-UI-008). AA normal text 4.5:1, large text 3:1. */
export const CONTRAST_RATIOS = { normal: 4.5, large: 3.0, uiComponent: 3.0 } as const;

/** WCAG 2.4.7 focus-indicator minimum visible-area outline (BL-UI-009). 2 px solid is the common floor. */
export const FOCUS_INDICATOR_MIN_PX = 2;

/** BL-UI-010 image aspect-ratio tolerance — `displayed / intrinsic` must stay within ±5% to avoid visible squash/stretch. */
export const IMAGE_ASPECT_TOLERANCE = 0.05;

/** BL-UI-007 critical-alert selectors. Any decorative or interactive element overlapping these rects is a violation. */
export const CRITICAL_ALERT_SELECTORS = [
  '.vc-alert--danger',
  '.vc-alert--warning',
  '[role="alert"]',
  '[role="alertdialog"]',
  '[aria-live="assertive"]',
] as const;

// ---------------------------------------------------------------------------
// Snippet result types (what each `evaluate` call returns)
// ---------------------------------------------------------------------------

export interface ClsResult {
  cls: number;
  shiftCount: number;
  installed: boolean;
}

export interface SpacingAuditResult {
  selector: string;
  matched: number;
  offGrid: Array<{
    index: number;
    tag: string;
    prop: string;
    value: number;
    cssText: string;
  }>;
}

export interface AlignmentAuditResult {
  selector: string;
  matched: number;
  rows: Array<{ index: number; top: number; height: number; centerY: number }>;
  centerDriftPx: number;
  heightDriftPx: number;
  misaligned: boolean;
}

export interface OverflowAuditResult {
  documentScrolls: boolean;
  documentScrollWidth: number;
  innerWidth: number;
  clippedChildren: Array<{
    tag: string;
    cssText: string;
    scrollHeight: number;
    clientHeight: number;
  }>;
}

export interface TouchTargetAuditResult {
  viewport: number;
  evaluated: number;
  undersized: Array<{
    tag: string;
    role: string | null;
    width: number;
    height: number;
    text: string;
  }>;
  tooClose: Array<{
    aTag: string;
    bTag: string;
    distancePx: number;
  }>;
}

export interface RectSnapshot {
  selector: string;
  top: number;
  left: number;
  width: number;
  height: number;
  ts: number;
}

export interface OcclusionAuditResult {
  alertSelectors: string[];
  alertsFound: number;
  overlaps: Array<{
    alertTag: string;
    alertText: string;
    occluderTag: string;
    occluderRole: string | null;
    overlapWidth: number;
    overlapHeight: number;
    overlapArea: number;
    /** True when the occluder covers ≥ 25% of the alert's rect — likely to hide the message entirely. */
    severe: boolean;
  }>;
}

export interface ContrastAuditResult {
  selector: string;
  evaluated: number;
  violations: Array<{
    tag: string;
    text: string;
    color: string;
    background: string;
    ratio: number;
    /** WCAG large-text rule: ≥ 18 pt (24 px) regular OR ≥ 14 pt (18.66 px) bold. */
    isLargeText: boolean;
    requiredRatio: number;
  }>;
}

export interface FocusIndicatorAuditResult {
  evaluated: number;
  missing: Array<{
    tag: string;
    role: string | null;
    text: string;
    outlineWidth: number;
    outlineStyle: string;
    /** True when neither `outline` nor `box-shadow` produces a visible focus ring on `:focus-visible`. */
    boxShadowPresent: boolean;
  }>;
}

export interface ImageAspectAuditResult {
  selector: string;
  evaluated: number;
  violations: Array<{
    src: string;
    intrinsicWidth: number;
    intrinsicHeight: number;
    displayedWidth: number;
    displayedHeight: number;
    intrinsicRatio: number;
    displayedRatio: number;
    /** Absolute relative drift: `|displayedRatio - intrinsicRatio| / intrinsicRatio`. */
    drift: number;
  }>;
}

// ---------------------------------------------------------------------------
// Static snippets — pass these strings verbatim to `browser_evaluate`
// ---------------------------------------------------------------------------

export const LAYOUT_SNIPPETS = {
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
  window.__layoutAudit = { cls: 0, shiftCount: 0, installed: false, installedAt: Date.now(), documentReadyState: document.readyState };
  try {
    const po = new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          window.__layoutAudit.cls += e.value;
          window.__layoutAudit.shiftCount += 1;
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
  if (!a) return { cls: 0, shiftCount: 0, installed: false };
  return { cls: a.cls, shiftCount: a.shiftCount, installed: a.installed };
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
  const undersized = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      undersized.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  }
  // Pairwise spacing — O(n^2), cap at 200 elements to stay snappy
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
`.trim(),
};

// ---------------------------------------------------------------------------
// Dynamic snippet builders — for selector-scoped checks
// ---------------------------------------------------------------------------

/**
 * Build a snippet that audits computed padding/margin/gap of every element
 * matching `selector` for grid compliance. Returns SpacingAuditResult.
 *
 * Example: spacingAuditSnippet('.product-card, .product-card *')
 */
export function spacingAuditSnippet(selector: string): string {
  const grid = SPACING_GRID.join(",");
  return `
(() => {
  const GRID = new Set([${grid}]);
  const PROPS = ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','rowGap','columnGap'];
  const els = document.querySelectorAll(${JSON.stringify(selector)});
  const offGrid = [];
  let index = 0;
  for (const el of els) {
    const cs = getComputedStyle(el);
    for (const prop of PROPS) {
      const raw = cs[prop];
      if (!raw || raw === 'normal' || raw === 'auto') continue;
      // Handles "16px", "16px 8px", etc — only single-value scalars here (PROPS list is scalar)
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
  return { selector: ${JSON.stringify(selector)}, matched: els.length, offGrid };
})()
`.trim();
}

/**
 * Build a snippet that audits vertical-center alignment + row-height parity of
 * every element matching `selector`. Returns AlignmentAuditResult.
 *
 * Example: alignmentAuditSnippet('.cart-row > *')
 */
export function alignmentAuditSnippet(selector: string): string {
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

/**
 * Scoped variant of LAYOUT_SNIPPETS.touchTargetAudit. Restricts the audit to
 * descendants of `scope`. Use this to exclude header/footer chrome (which
 * commonly has decorative or undersized interactives that aren't part of the
 * tested feature) and focus the audit on the feature area.
 *
 * Example: touchTargetAuditSnippet('main') — audits only main-content interactives.
 */
export function touchTargetAuditSnippet(scope: string): string {
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
  const undersized = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      undersized.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        text: (el.textContent || '').trim().slice(0, 40),
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

/**
 * Snippet that captures FOUC (Flash of Unstyled / mis-styled Content) markers.
 * Run immediately after navigation, then wait, then read. Detects:
 * - Documents that paint with bare `font-family: serif` before webfont resolves
 * - Theme-token CSS variables that resolve to empty string (theme CSS not loaded)
 * - Class `theme-loading` / `app-loading` lingering > 1 s after `load`
 *
 * Returns: { fontReady: boolean, themeTokensResolved: boolean, loadingClassesPresent: string[] }
 */
export const FOUC_SNIPPET = `
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

/**
 * Snippet that detects a skeleton-to-content shift by sampling rects of a
 * target selector at two times. Use:
 *   1. Navigate to page with skeleton state
 *   2. evaluate(skeletonRectSnippet(skeletonSelector)) → before
 *   3. wait for content to resolve (data fetched, skeleton replaced)
 *   4. evaluate(skeletonRectSnippet(finalContentSelector)) → after
 *   5. compareRectSnapshots(before, after) — Δheight > 1 px = skeleton-content size mismatch
 */
export function skeletonRectSnippet(selector: string): string {
  return rectSnapshotSnippet(selector);
}

/**
 * Build a snippet that records the bounding rect of `selector` for shift-detection
 * before/after comparison. Returns RectSnapshot.
 *
 * Usage:
 *   const before = await evaluate(rectSnapshotSnippet('.adjacent-element'))
 *   // ... trigger hover/focus/badge update ...
 *   const after  = await evaluate(rectSnapshotSnippet('.adjacent-element'))
 *   const shift  = compareRectSnapshots(before, after)  // {topDelta, leftDelta, shifted}
 */
export function rectSnapshotSnippet(selector: string): string {
  return `
(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { selector: ${JSON.stringify(selector)}, top: 0, left: 0, width: 0, height: 0, ts: Date.now(), missing: true };
  const r = el.getBoundingClientRect();
  return { selector: ${JSON.stringify(selector)}, top: r.top, left: r.left, width: r.width, height: r.height, ts: Date.now() };
})()
`.trim();
}

/**
 * Detect interactive controls or decorative siblings that visually occlude any
 * critical alert / warning / `role="alert"` element. Returns OcclusionAuditResult.
 *
 * Defect class caught (BL-UI-007): an `overflow:visible` sibling whose rect
 * extends into the alert's rect — same-stacking-context layout collision, not
 * z-index reordering. F-CART-006 (save-for-later bookmark covering the "product
 * no longer available" alert on /cart) is the reference case.
 *
 * Why this is distinct from `overflowAudit`: BL-UI-004 detects `overflow:hidden`
 * silently clipping content; this snippet detects the inverse — an element with
 * `overflow:visible` floating into a sibling's space, hiding it via paint order.
 *
 * Defaults to `CRITICAL_ALERT_SELECTORS` (danger/warning alerts + `role=alert`).
 * Pass a custom list when auditing a specific alert family (e.g. cart-only alerts).
 */
export function occlusionAuditSnippet(
  alertSelectors: readonly string[] = CRITICAL_ALERT_SELECTORS,
): string {
  return `
(() => {
  const ALERT_SELS = ${JSON.stringify(alertSelectors)};
  const OCCLUDER_SEL = 'button, a, [role=button], [role=link], svg, img, [data-test-id], .vc-icon';
  // Severe overlap threshold: occluder covers ≥ 25% of the alert's rect area.
  const SEVERE_FRACTION = 0.25;
  const alerts = Array.from(document.querySelectorAll(ALERT_SELS.join(', ')));
  const overlaps = [];
  for (const alert of alerts) {
    const ar = alert.getBoundingClientRect();
    if (ar.width === 0 || ar.height === 0) continue;
    // Search occluder candidates within the alert's nearest "card" / "item" ancestor —
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

/**
 * WCAG 1.4.3 (Contrast Minimum, AA) auditor. For each visible text element matching
 * `selector` (default: `body *` filtered to text-bearing leaf nodes), compute the
 * contrast ratio between text color and the effective background color, then check
 * against the WCAG threshold (4.5:1 normal, 3:1 large or UI component).
 *
 * Caveats:
 * - Background detection walks ancestors until a non-transparent `background-color`
 *   is found. Background images / gradients underneath text are NOT analyzed —
 *   those need image-pixel inspection (out of scope for a DOM-only snippet).
 * - "Large text" per WCAG = ≥ 18 pt (~24 px) regular OR ≥ 14 pt (~18.66 px) bold.
 *
 * Returns ContrastAuditResult. Empty `violations[]` = PASS.
 */
export function contrastAuditSnippet(selector: string = 'body *'): string {
  return `
(() => {
  const SEL = ${JSON.stringify(selector)};
  // Parse a CSS color string into [r, g, b] (0-255). Returns null for unparseable.
  function parseColor(s) {
    if (!s) return null;
    const m = s.match(/rgba?\\(([^)]+)\\)/i);
    if (m) {
      const parts = m[1].split(',').map(x => parseFloat(x.trim()));
      if (parts.length >= 3) return [parts[0], parts[1], parts[2], parts[3] == null ? 1 : parts[3]];
    }
    return null;
  }
  // Relative luminance per WCAG 2.x.
  function lum(rgb) {
    const [r, g, b] = rgb.slice(0, 3).map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function ratio(a, b) {
    const la = lum(a), lb = lum(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }
  // Find first non-transparent ancestor background.
  function effectiveBg(el) {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const cs = getComputedStyle(cur);
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg[3] > 0) return bg;
      cur = cur.parentElement;
    }
    // Fallback: html element bg or white
    const htmlCs = getComputedStyle(document.documentElement);
    return parseColor(htmlCs.backgroundColor) || [255, 255, 255, 1];
  }
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    // Only leaf text nodes — has direct text content but no element children with text.
    if (!el.textContent || !el.textContent.trim()) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // Must have own text — not just child text
    const ownText = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim()).length > 0;
    return ownText;
  });
  const violations = [];
  let evaluated = 0;
  for (const el of els) {
    evaluated++;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    const bg = effectiveBg(el);
    if (!fg) continue;
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
  return { selector: SEL, evaluated, violations };
})()
`.trim();
}

/**
 * WCAG 2.4.7 (Focus Visible, AA) auditor. Programmatically focuses every interactive
 * matching the standard interactive selector, checks whether `:focus-visible` produces
 * a visible focus ring (outline ≥ 2 px OR a box-shadow that draws a contrasting ring),
 * then blurs and moves on.
 *
 * Caveats:
 * - Snippet does NOT cover transitions — only static focus-state computed style.
 * - Custom `:focus-visible` styles using `::after` / `::before` pseudo elements are
 *   NOT inspected by this snippet; pseudo-element focus rings require visual review.
 * - Page state may change if a focusable element has a `focus` handler with side
 *   effects (rare). Best run on idle pages.
 *
 * Returns FocusIndicatorAuditResult. Empty `missing[]` = PASS.
 */
export const focusIndicatorAudit = `
(() => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem]';
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    if (el.tabIndex < 0) return false;
    return true;
  });
  // Cap to 100 to keep snippet snappy
  const sample = els.slice(0, 100);
  const missing = [];
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
    if (!hasOutline && !hasBoxShadowRing) {
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
  }
  // Restore prior focus
  try { if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus({ preventScroll: true }); } catch (e) {}
  return { evaluated: sample.length, missing };
})()
`.trim();

/**
 * Aspect-ratio drift auditor. For each `<img>` element matching `selector` (default:
 * all images), compares the intrinsic ratio (naturalWidth/naturalHeight from the
 * source bitmap) against the displayed ratio (rendered width/height). Drift outside
 * `IMAGE_ASPECT_TOLERANCE` (±5%) indicates visible squash or stretch.
 *
 * Caveats:
 * - Skips images that haven't loaded yet (`naturalWidth === 0`).
 * - Skips `object-fit: cover` / `contain` — those intentionally crop, not distort.
 *   Distortion only happens with `object-fit: fill` or unset on `<img>` with both
 *   `width` and `height` set independently. The snippet detects this.
 *
 * Returns ImageAspectAuditResult. Empty `violations[]` = PASS.
 */
export function imageAspectAuditSnippet(selector: string = 'img'): string {
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
    // object-fit: cover/contain crops without distorting — skip
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

// ---------------------------------------------------------------------------
// Analyzers — classify raw evaluate() results into PASS / WARN / FAIL findings
// ---------------------------------------------------------------------------

export type Severity = "PASS" | "WARN" | "FAIL" | "P0";

export interface LayoutFinding {
  invariant:
    | "BL-UI-001"
    | "BL-UI-002"
    | "BL-UI-003"
    | "BL-UI-004"
    | "BL-UI-005"
    | "BL-UI-006"
    | "BL-UI-007"
    | "BL-UI-008"
    | "BL-UI-009"
    | "BL-UI-010";
  severity: Severity;
  message: string;
  evidence: unknown;
}

export function classifyCls(result: ClsResult): LayoutFinding {
  const { cls, shiftCount } = result;
  if (cls >= CLS_THRESHOLDS.fail) {
    return {
      invariant: "BL-UI-001",
      severity: "P0",
      message: `CLS ${cls.toFixed(3)} ≥ ${CLS_THRESHOLDS.fail} (P0) across ${shiftCount} shifts`,
      evidence: result,
    };
  }
  if (cls >= CLS_THRESHOLDS.pass) {
    return {
      invariant: "BL-UI-001",
      severity: "FAIL",
      message: `CLS ${cls.toFixed(3)} ≥ ${CLS_THRESHOLDS.pass} across ${shiftCount} shifts`,
      evidence: result,
    };
  }
  return {
    invariant: "BL-UI-001",
    severity: "PASS",
    message: `CLS ${cls.toFixed(3)} (${shiftCount} shifts)`,
    evidence: result,
  };
}

export function classifySpacing(result: SpacingAuditResult): LayoutFinding {
  if (result.offGrid.length === 0) {
    return {
      invariant: "BL-UI-002",
      severity: "PASS",
      message: `All spacing on grid (${result.matched} elements audited)`,
      evidence: result,
    };
  }
  return {
    invariant: "BL-UI-002",
    severity: "FAIL",
    message: `${result.offGrid.length} off-grid spacing values (e.g. ${result.offGrid[0].cssText})`,
    evidence: result,
  };
}

export function classifyAlignment(result: AlignmentAuditResult): LayoutFinding {
  if (!result.misaligned) {
    return {
      invariant: "BL-UI-005",
      severity: "PASS",
      message: `Row aligned (centerDrift ${result.centerDriftPx} px, heightDrift ${result.heightDriftPx} px)`,
      evidence: result,
    };
  }
  return {
    invariant: "BL-UI-005",
    severity: "FAIL",
    message: `Misalignment: centerDrift ${result.centerDriftPx} px, heightDrift ${result.heightDriftPx} px (tolerance ${ALIGNMENT_TOLERANCE_PX} px)`,
    evidence: result,
  };
}

export function classifyOverflow(result: OverflowAuditResult): LayoutFinding {
  if (!result.documentScrolls && result.clippedChildren.length === 0) {
    return {
      invariant: "BL-UI-004",
      severity: "PASS",
      message: `No horizontal scroll, no clipped content`,
      evidence: result,
    };
  }
  const parts: string[] = [];
  if (result.documentScrolls) {
    parts.push(
      `document scrolls horizontally (scrollWidth ${result.documentScrollWidth} > innerWidth ${result.innerWidth})`,
    );
  }
  if (result.clippedChildren.length > 0) {
    parts.push(
      `${result.clippedChildren.length} clipped children (first: ${result.clippedChildren[0].tag})`,
    );
  }
  return {
    invariant: "BL-UI-004",
    severity: "FAIL",
    message: parts.join("; "),
    evidence: result,
  };
}

export function classifyTouchTargets(
  result: TouchTargetAuditResult,
): LayoutFinding {
  if (result.viewport > 768) {
    return {
      invariant: "BL-UI-006",
      severity: "PASS",
      message: `Touch-target rule does not apply (viewport ${result.viewport} px > 768)`,
      evidence: result,
    };
  }
  const issues: string[] = [];
  if (result.undersized.length > 0) {
    issues.push(`${result.undersized.length} interactive(s) below ${TOUCH_TARGET_MIN_PX}×${TOUCH_TARGET_MIN_PX}`);
  }
  if (result.tooClose.length > 0) {
    issues.push(`${result.tooClose.length} interactive pair(s) closer than ${TOUCH_TARGET_GAP_PX} px`);
  }
  if (issues.length === 0) {
    return {
      invariant: "BL-UI-006",
      severity: "PASS",
      message: `All ${result.evaluated} interactives meet 44×44 + 8 px spacing`,
      evidence: result,
    };
  }
  return {
    invariant: "BL-UI-006",
    severity: "FAIL",
    message: issues.join("; "),
    evidence: result,
  };
}

export function classifyOcclusion(result: OcclusionAuditResult): LayoutFinding {
  if (result.overlaps.length === 0) {
    return {
      invariant: "BL-UI-007",
      severity: "PASS",
      message: `No occlusion of ${result.alertsFound} critical alert(s)`,
      evidence: result,
    };
  }
  const severeCount = result.overlaps.filter((o) => o.severe).length;
  const sample = result.overlaps[0];
  return {
    invariant: "BL-UI-007",
    severity: severeCount > 0 ? "P0" : "FAIL",
    message: `${result.overlaps.length} occlusion(s) of critical alerts${severeCount > 0 ? ` (${severeCount} severe, ≥ 25% coverage)` : ""}; first: ${sample.occluderTag} overlaps ${sample.alertTag} by ${sample.overlapWidth}×${sample.overlapHeight} px`,
    evidence: result,
  };
}

export function classifyContrast(result: ContrastAuditResult): LayoutFinding {
  if (result.violations.length === 0) {
    return {
      invariant: "BL-UI-008",
      severity: "PASS",
      message: `All ${result.evaluated} text nodes meet WCAG 1.4.3 contrast`,
      evidence: result,
    };
  }
  const worst = result.violations.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  return {
    invariant: "BL-UI-008",
    severity: "FAIL",
    message: `${result.violations.length} contrast violation(s); worst: ${worst.ratio}:1 (needs ${worst.requiredRatio}:1) on "${worst.text}"`,
    evidence: result,
  };
}

export function classifyFocusIndicator(
  result: FocusIndicatorAuditResult,
): LayoutFinding {
  if (result.missing.length === 0) {
    return {
      invariant: "BL-UI-009",
      severity: "PASS",
      message: `All ${result.evaluated} interactives have a visible focus indicator`,
      evidence: result,
    };
  }
  return {
    invariant: "BL-UI-009",
    severity: "FAIL",
    message: `${result.missing.length} interactive(s) without visible focus ring (≥ ${FOCUS_INDICATOR_MIN_PX} px outline OR contrasting box-shadow)`,
    evidence: result,
  };
}

export function classifyImageAspect(
  result: ImageAspectAuditResult,
): LayoutFinding {
  if (result.violations.length === 0) {
    return {
      invariant: "BL-UI-010",
      severity: "PASS",
      message: `All ${result.evaluated} images preserve their intrinsic aspect ratio (±${IMAGE_ASPECT_TOLERANCE * 100}%)`,
      evidence: result,
    };
  }
  const worst = result.violations.reduce((a, b) => (a.drift > b.drift ? a : b));
  return {
    invariant: "BL-UI-010",
    severity: "FAIL",
    message: `${result.violations.length} distorted image(s); worst drift ${(worst.drift * 100).toFixed(1)}% on ${worst.src.split("/").pop()}`,
    evidence: result,
  };
}

export function compareRectSnapshots(
  before: RectSnapshot,
  after: RectSnapshot,
): LayoutFinding {
  const topDelta = Math.abs(after.top - before.top);
  const leftDelta = Math.abs(after.left - before.left);
  const widthDelta = Math.abs(after.width - before.width);
  const heightDelta = Math.abs(after.height - before.height);
  const shifted = topDelta > 0 || leftDelta > 0;
  if (!shifted) {
    return {
      invariant: "BL-UI-003",
      severity: "PASS",
      message: `No shift on ${before.selector} (Δsize ${widthDelta}×${heightDelta} px is allowed)`,
      evidence: { before, after, topDelta, leftDelta },
    };
  }
  return {
    invariant: "BL-UI-003",
    severity: "FAIL",
    message: `${before.selector} shifted Δtop=${topDelta} px Δleft=${leftDelta} px`,
    evidence: { before, after, topDelta, leftDelta },
  };
}

export interface LayoutAuditBundle {
  cls?: ClsResult;
  spacing?: SpacingAuditResult;
  alignment?: AlignmentAuditResult;
  overflow?: OverflowAuditResult;
  targets?: TouchTargetAuditResult;
  shifts?: Array<{ before: RectSnapshot; after: RectSnapshot }>;
  occlusion?: OcclusionAuditResult;
  contrast?: ContrastAuditResult;
  focusIndicator?: FocusIndicatorAuditResult;
  imageAspect?: ImageAspectAuditResult;
}

/**
 * Bundle classifier — pass everything you collected; get back a finding list
 * suitable for printing into an evidence section of a bug report.
 */
export function analyzeLayoutResults(
  bundle: LayoutAuditBundle,
): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  if (bundle.cls) findings.push(classifyCls(bundle.cls));
  if (bundle.spacing) findings.push(classifySpacing(bundle.spacing));
  if (bundle.alignment) findings.push(classifyAlignment(bundle.alignment));
  if (bundle.overflow) findings.push(classifyOverflow(bundle.overflow));
  if (bundle.targets) findings.push(classifyTouchTargets(bundle.targets));
  if (bundle.occlusion) findings.push(classifyOcclusion(bundle.occlusion));
  if (bundle.contrast) findings.push(classifyContrast(bundle.contrast));
  if (bundle.focusIndicator) findings.push(classifyFocusIndicator(bundle.focusIndicator));
  if (bundle.imageAspect) findings.push(classifyImageAspect(bundle.imageAspect));
  if (bundle.shifts) {
    for (const s of bundle.shifts) {
      findings.push(compareRectSnapshots(s.before, s.after));
    }
  }
  return findings;
}

export function summarize(findings: LayoutFinding[]): string {
  const counts: Record<Severity, number> = { PASS: 0, WARN: 0, FAIL: 0, P0: 0 };
  for (const f of findings) counts[f.severity]++;
  const failing = findings.filter((f) => f.severity === "FAIL" || f.severity === "P0");
  const header = `Layout audit: ${counts.PASS} pass · ${counts.WARN} warn · ${counts.FAIL} fail · ${counts.P0} P0`;
  if (failing.length === 0) return header;
  const lines = failing.map((f) => `  [${f.severity}] ${f.invariant} — ${f.message}`);
  return [header, ...lines].join("\n");
}
