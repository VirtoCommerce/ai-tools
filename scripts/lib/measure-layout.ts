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
    | "BL-UI-006";
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
