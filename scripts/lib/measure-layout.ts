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
 * Invariants enforced (see `.claude/agents/ui-ux-expert.md` Layer 1):
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

/**
 * BL-UI-007 critical-alert selectors. Any decorative or interactive element overlapping these rects is a violation.
 *
 * NOTE (VCST-4400 gap): VC surfaces some user-facing warnings in NON-semantic containers
 * (e.g. the cart line-item over-stock message renders in `div.vc-line-item__after` with no
 * `role="alert"`/`aria-live`). Those are invisible to this occlusion set — check them with
 * `alertSemanticsAuditSnippet` (are they announced at all?) and pass a custom selector to
 * `occlusionAuditSnippet` when the alert lives outside this list. The base `.vc-alert` is
 * included so every VcAlert variant (not just danger/warning) is covered once rendered.
 */
export const CRITICAL_ALERT_SELECTORS = [
  '.vc-alert',
  '.vc-alert--danger',
  '.vc-alert--warning',
  '[role="alert"]',
  '[role="alertdialog"]',
  '[role="status"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
] as const;

/** WCAG 1.4.11 non-text (UI-component / graphical-object) contrast minimum. Applies to icon glyphs, borders, etc. */
export const NON_TEXT_CONTRAST_RATIO = 3.0;

/** Sized-control equality tolerance (px). A declared-size control (icon, avatar, swatch) must render within ±1 px of its token. */
export const SIZED_CONTROL_TOLERANCE_PX = 1;

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
  /**
   * (VCST-4400 gap fix) Controls whose focus ring could NOT be assessed programmatically —
   * the element did not match `:focus-visible` after a scripted `.focus()`, so a ring keyed on
   * `:focus-visible` (the common pattern) would not render here even though real keyboard Tab
   * shows it. These are NOT failures; confirm with a real Tab pass before filing.
   */
  indeterminate: Array<{ tag: string; role: string | null; text: string }>;
  /** Disabled / aria-disabled controls skipped (WCAG 2.4.7 does not require a ring on inactive controls). */
  skipped: number;
}

export interface NonTextContrastAuditResult {
  selector: string;
  evaluated: number;
  violations: Array<{
    tag: string;
    label: string;
    /** Resolved glyph color (stroke for outline icons, fill for solid, else CSS color). */
    foreground: string;
    background: string;
    ratio: number;
    requiredRatio: number;
  }>;
  /** Skipped because the nearest interactive ancestor is disabled (WCAG 1.4.11 exempts inactive components). */
  exempt: number;
}

export interface SizedControlAuditResult {
  selector: string;
  expectedPx: number | null;
  square: boolean;
  ratio: number | null;
  evaluated: number;
  violations: Array<{
    tag: string;
    width: number;
    height: number;
    /** off-token (rendered ≠ expected), non-square, or wrong-ratio. */
    reason: string;
    expectedPx: number | null;
  }>;
}

export interface AlertSemanticsAuditResult {
  selector: string;
  evaluated: number;
  /** Visible, text-bearing candidates that carry NO alert/status/live semantics — a screen reader won't announce them. */
  unannounced: Array<{ tag: string; text: string }>;
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
 * WCAG 2.4.7 (Focus Visible, AA) auditor. Programmatically focuses every ENABLED interactive
 * matching the standard interactive selector, checks whether a visible focus ring is present
 * (outline ≥ 2 px OR a box-shadow that draws a contrasting ring), then blurs and moves on.
 *
 * VCST-4400 gap fix — this snippet previously over-reported false "missing" rings:
 * - It now SKIPS `disabled` / `aria-disabled="true"` controls (WCAG 2.4.7 does not require a
 *   ring on inactive controls) — counted in `skipped`.
 * - It distinguishes MISSING from INDETERMINATE. Most themes key the ring on `:focus-visible`,
 *   which a scripted `.focus()` frequently does NOT set. When the element does not match
 *   `:focus-visible` after focus AND shows no ring, the ring is `indeterminate` (a
 *   `:focus-visible`-gated ring would not render under programmatic focus) — NOT a failure.
 *   Only elements that DO match `:focus-visible` yet still show no ring are real `missing`.
 *   Confirm indeterminates with a real keyboard-Tab pass before filing.
 *
 * Caveats:
 * - Static focus-state computed style only — no transitions.
 * - `::after` / `::before` pseudo-element focus rings are not inspected — require visual review.
 * - Best run on idle pages (a focusable with a side-effecting focus handler could mutate state).
 *
 * Returns FocusIndicatorAuditResult. Empty `missing[]` = PASS (review `indeterminate[]` via real Tab).
 */
export const focusIndicatorAudit = `
(() => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem]';
  let skipped = 0;
  const els = Array.from(document.querySelectorAll(SEL)).filter(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    if (el.tabIndex < 0) return false;
    // WCAG 2.4.7 exempts inactive controls — don't flag a missing ring on disabled ones.
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
    if (hasOutline || hasBoxShadowRing) continue; // has a ring — PASS
    // No ring seen. Is a :focus-visible-gated rule even active right now?
    let focusVisible = false;
    try { focusVisible = el.matches(':focus-visible'); } catch (e) { focusVisible = false; }
    if (!focusVisible) {
      // Programmatic focus did not trigger :focus-visible; a ring keyed on it would not render.
      // Cannot conclude "missing" — mark indeterminate (confirm via real Tab).
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

/**
 * WCAG 1.4.11 (Non-text Contrast, AA) auditor — for ICON GLYPHS and graphical objects,
 * which `contrastAuditSnippet` deliberately skips (it only evaluates text-bearing nodes).
 * VCST-4400 gap: the outline-first icon migration produced enabled icons at 2.52:1 that the
 * text auditor could not see. This snippet resolves each glyph's foreground (stroke for outline
 * icons, fill for solid, else CSS `color`) against its effective background at the 3:1 minimum.
 *
 * Default selector targets VC icon components. Only ENABLED icons are evaluated — WCAG 1.4.11
 * exempts inactive components, so an icon whose nearest interactive ancestor is `disabled` /
 * `aria-disabled` is counted in `exempt`, not `violations` (avoids the VCST-5100 false-positive).
 *
 * Caveats: DOM-only — background images/gradients under the glyph are not analyzed. A glyph
 * painted over a photo needs pixel inspection (out of scope).
 *
 * Returns NonTextContrastAuditResult. Empty `violations[]` = PASS.
 */
export function nonTextContrastAuditSnippet(
  selector: string = 'svg, .vc-icon, [class*="icon"] svg, [class*="icon"]',
): string {
  return `
(() => {
  const SEL = ${JSON.stringify(selector)};
  const REQUIRED = ${NON_TEXT_CONTRAST_RATIO};
  function parseColor(s) {
    if (!s) return null;
    const m = s.match(/rgba?\\(([^)]+)\\)/i);
    if (m) {
      const p = m[1].split(',').map(x => parseFloat(x.trim()));
      if (p.length >= 3) return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
    }
    return null;
  }
  function lum(rgb) {
    const [r, g, b] = rgb.slice(0, 3).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function ratio(a, b) { const la = lum(a), lb = lum(b); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); }
  function effectiveBg(el) {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const bg = parseColor(getComputedStyle(cur).backgroundColor);
      if (bg && bg[3] > 0) return bg;
      cur = cur.parentElement;
    }
    return parseColor(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1];
  }
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
  let evaluated = 0, exempt = 0;
  for (const el of els) {
    // WCAG 1.4.11 exempts inactive components.
    const host = el.closest('button, a[href], [role=button], [role=link], input, select, textarea');
    if (host && (host.disabled === true || host.getAttribute('aria-disabled') === 'true')) { exempt++; continue; }
    const cs = getComputedStyle(el);
    const fg = glyphColor(el, cs);
    if (!fg) continue;
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
  return { selector: SEL, evaluated, violations, exempt };
})()
`.trim();
}

/**
 * Sized-control oracle (VCST-5413) — for any control with a DECLARED size (icon, avatar,
 * swatch, slider handle, chip, checkbox): assert the rendered dimension equals its design
 * token and, where applicable, that it is square (or a fixed ratio). This is the
 * equality + aspect oracle the `/qa-design` Sized-Control Pass calls for — "≥ threshold /
 * no-overflow" gates MISS an off-token or wrong-shape control (VCST-5413: a 34×28 oval where
 * an 18×18 circle belonged passed every threshold gate).
 *
 * opts:
 *   - expectedPx  the resolved token value the control must equal (±1 px). Omit to only check shape.
 *   - tokenVar    a CSS custom property to resolve the expected px FROM the element (e.g. '--handle-size').
 *                 Takes precedence over expectedPx when it resolves to a px value.
 *   - square      require width === height (±1 px). Default true (most sized controls are square).
 *   - ratio       require width/height === ratio (±2%). Overrides `square` when set.
 *
 * Run on BOTH Storybook (isolated) and storefront (integrated) and diff — a size that changes
 * between the two is the cascade-override red flag this exists to catch.
 *
 * Returns SizedControlAuditResult. Empty `violations[]` = PASS.
 */
export function sizedControlAuditSnippet(
  selector: string,
  opts: { expectedPx?: number; tokenVar?: string; square?: boolean; ratio?: number } = {},
): string {
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

/**
 * Alert-semantics auditor (WCAG 4.1.3 Status Messages) — VCST-4400 gap. VC surfaces some
 * warnings in NON-semantic containers (the cart over-stock message renders in
 * `div.vc-line-item__after` with no `role="alert"`/`aria-live`), so a screen reader never
 * announces them. This finds visible, text-bearing candidates matching `selector` that carry
 * NO alert/status/live semantics (on themselves or an ancestor).
 *
 * Advisory by design (WARN) — not every matched container is a status message; a human confirms
 * which ones should announce. Point it at suspected message slots
 * (e.g. `.vc-line-item__after, [class*="error"], [class*="warning"]`).
 *
 * Returns AlertSemanticsAuditResult. Empty `unannounced[]` = PASS.
 */
export function alertSemanticsAuditSnippet(
  selector: string = '.vc-alert--danger, .vc-alert--warning, [class*="line-item__after"], [class*="error"], [class*="warning"]',
): string {
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

// ---------------------------------------------------------------------------
// Admin SPA blade layout (back-office Manager) — toolbar ↔ grid-header overlap
// ---------------------------------------------------------------------------

export interface BladeStaticOverflowResult {
  bladeFound: boolean;
  /** Header text used to locate the blade (empty = auto-picked). */
  bladeHeader: string;
  bladeStatic: { cls: string; cssHeight: string; overflowY: string; top: number; bottom: number; height: number } | null;
  /** The blade-static BOX bottom (its fixed-height edge — can be misleading). */
  bladeStaticBoxBottom: number | null;
  /** The REAL bottom of blade-static's content (max descendant bottom) — overflows the box when content > height. */
  bladeStaticContentBottom: number | null;
  /** Top of .blade-content (the scrollable region — grid/form/list flows in here). */
  bladeContentTop: number | null;
  /** The deepest-overflowing descendant of blade-static (the element spilling onto content), if any. */
  offender: { tag: string; cls: string; bottom: number } | null;
  /** Optional context when present: the searchrow + the first content header/row + a note. */
  searchrow: { top: number; bottom: number; height: number } | null;
  contentHeader: { top: number; bottom: number; height: number } | null;
  noteVisible: boolean;
  /** max(0, bladeStaticContentBottom − bladeContentTop). 0 = clean. */
  overflowPx: number | null;
  /** bladeStaticContentBottom <= bladeContentTop. */
  PASS: boolean | null;
  note_: string;
}

/**
 * GENERIC Admin-SPA blade layout check: does the content of the fixed-height
 * `.blade-static` (top toolbar region) overflow past the top of `.blade-content`
 * (the scrollable grid/form/list)? Works for ANY module's blade — not just the
 * export/catalog one — and any toolbar shape (searchrow, multi-row filter,
 * info note, custom controls).
 *
 * WHY this beats a searchrow-specific or occlusion check: `.blade-static` is
 * FIXED-height (default 70px, `overflow: visible`); `.blade-content` flows in at
 * that fixed bottom. Anything inside blade-static that needs more than the
 * reserved height (e.g. a `.__note` stacked above the toolbar — the VCST-5276
 * case) spills out of the box and lands on the content below. The universal
 * assertion is therefore **blade-static's real content bottom (max descendant
 * bottom) ≤ blade-content's top** — NOT `blade-static.bottom` (the fixed-box edge
 * that hid the bug), and NOT tied to `.searchrow`/`.ui-grid-header` specifically.
 *
 * Read-only (`getBoundingClientRect`/`getComputedStyle`) → permitted by the
 * enforce-real-user hook. Pass verbatim to Chrome DevTools `evaluate_script`
 * or Playwright `browser_evaluate`.
 *
 * @param bladeHeaderText substring of the target blade's header (e.g.
 *   "Select data to export"). Omit to auto-pick a blade that has both a
 *   `.blade-static` and a `.blade-content`.
 *
 * Gate: measure the FAILING state (expect `overflowPx > 0`), apply the fix,
 * re-measure, require `PASS === true` (`overflowPx === 0`).
 */
export function bladeStaticOverflowSnippet(bladeHeaderText = ""): string {
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
      note_: 'no .blade-static + .blade-content in the located blade — open the target blade first' };
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
    | "BL-UI-008-NONTEXT"
    | "BL-UI-009"
    | "BL-UI-010"
    | "SIZED-CONTROL"
    | "WCAG-4.1.3"
    | "ADMIN-BLADE-OVERLAP";
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
  const indet = result.indeterminate?.length ?? 0;
  const indetNote = indet > 0 ? ` (${indet} indeterminate — confirm via real keyboard Tab)` : "";
  if (result.missing.length === 0) {
    // No confirmed miss. If some were indeterminate, WARN rather than a clean PASS —
    // programmatic focus couldn't assess a :focus-visible-gated ring on those.
    return {
      invariant: "BL-UI-009",
      severity: indet > 0 ? "WARN" : "PASS",
      message: `${result.evaluated} interactives audited: no confirmed missing focus ring${indetNote}`,
      evidence: result,
    };
  }
  return {
    invariant: "BL-UI-009",
    severity: "FAIL",
    message: `${result.missing.length} interactive(s) with :focus-visible active but no ring (≥ ${FOCUS_INDICATOR_MIN_PX} px outline OR contrasting box-shadow)${indetNote}`,
    evidence: result,
  };
}

export function classifyNonTextContrast(
  result: NonTextContrastAuditResult,
): LayoutFinding {
  if (result.violations.length === 0) {
    return {
      invariant: "BL-UI-008-NONTEXT",
      severity: "PASS",
      message: `All ${result.evaluated} enabled glyphs meet WCAG 1.4.11 (${NON_TEXT_CONTRAST_RATIO}:1); ${result.exempt} exempt (disabled)`,
      evidence: result,
    };
  }
  const worst = result.violations.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  return {
    invariant: "BL-UI-008-NONTEXT",
    severity: "FAIL",
    message: `${result.violations.length} icon/graphic contrast violation(s) (WCAG 1.4.11); worst ${worst.ratio}:1 (needs ${worst.requiredRatio}:1)${worst.label ? ` on "${worst.label}"` : ""}`,
    evidence: result,
  };
}

export function classifySizedControl(
  result: SizedControlAuditResult,
): LayoutFinding {
  if (result.violations.length === 0) {
    return {
      invariant: "SIZED-CONTROL",
      severity: "PASS",
      message: `All ${result.evaluated} control(s) on token${result.expectedPx != null ? ` (${result.expectedPx}px)` : ""}${result.square ? " and square" : ""}`,
      evidence: result,
    };
  }
  const sample = result.violations[0];
  return {
    invariant: "SIZED-CONTROL",
    severity: "FAIL",
    message: `${result.violations.length} sized-control violation(s); first: ${sample.tag} ${sample.reason}`,
    evidence: result,
  };
}

export function classifyAlertSemantics(
  result: AlertSemanticsAuditResult,
): LayoutFinding {
  if (result.unannounced.length === 0) {
    return {
      invariant: "WCAG-4.1.3",
      severity: "PASS",
      message: `All ${result.evaluated} alert-like element(s) carry alert/status/live semantics`,
      evidence: result,
    };
  }
  // Advisory — needs human confirmation that these are genuine status messages.
  return {
    invariant: "WCAG-4.1.3",
    severity: "WARN",
    message: `${result.unannounced.length} visible message(s) with no role=alert/status/aria-live (screen reader won't announce); first: "${result.unannounced[0].text}"`,
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

export function classifyBladeStaticOverflow(
  result: BladeStaticOverflowResult,
): LayoutFinding {
  if (result.overflowPx == null || result.PASS == null) {
    return {
      invariant: "ADMIN-BLADE-OVERLAP",
      severity: "WARN",
      message: `Could not measure (no blade-static + blade-content located) — open the target blade first`,
      evidence: result,
    };
  }
  if (result.PASS) {
    return {
      invariant: "ADMIN-BLADE-OVERLAP",
      severity: "PASS",
      message: `blade-static content sits above blade-content (overflow ${result.overflowPx} px)`,
      evidence: result,
    };
  }
  const off = result.offender ? ` (offender: ${result.offender.tag}.${result.offender.cls})` : "";
  return {
    invariant: "ADMIN-BLADE-OVERLAP",
    severity: "FAIL",
    message: `Fixed-height blade-static content overflows onto blade-content by ${result.overflowPx} px${off}${result.noteVisible ? " — note shown above the toolbar; reserve height via __expanded or move the note into content" : " — reserve toolbar height via __expanded or move overflow content out"}`,
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
  nonTextContrast?: NonTextContrastAuditResult;
  focusIndicator?: FocusIndicatorAuditResult;
  imageAspect?: ImageAspectAuditResult;
  sizedControl?: SizedControlAuditResult;
  alertSemantics?: AlertSemanticsAuditResult;
  bladeOverflow?: BladeStaticOverflowResult;
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

export function summarize(findings: LayoutFinding[]): string {
  const counts: Record<Severity, number> = { PASS: 0, WARN: 0, FAIL: 0, P0: 0 };
  for (const f of findings) counts[f.severity]++;
  const failing = findings.filter((f) => f.severity === "FAIL" || f.severity === "P0");
  const header = `Layout audit: ${counts.PASS} pass · ${counts.WARN} warn · ${counts.FAIL} fail · ${counts.P0} P0`;
  if (failing.length === 0) return header;
  const lines = failing.map((f) => `  [${f.severity}] ${f.invariant} — ${f.message}`);
  return [header, ...lines].join("\n");
}
