/**
 * Axe-core + keyboard-traversal a11y snippets and analyzers — the deterministic
 * measurement slice of `/qa-accessibility` and `/qa-storybook`.
 *
 * Sibling of `measure-layout.ts`: same pattern (string snippets passed verbatim
 * to MCP `browser_evaluate` / Chrome DevTools `evaluate_script`, plus pure
 * classifier functions over the returned JSON). The agent keeps the JUDGMENT —
 * which routes/states to audit, whether an `incomplete` result is a real bug,
 * severity in business context, filing decisions. The MEASUREMENT is here.
 *
 * Deliberately NOT duplicated (already in `measure-layout.ts`):
 *   contrast (BL-UI-008 / WCAG 1.4.3) → contrastAuditSnippet
 *   focus indicator (BL-UI-009 / WCAG 2.4.7) → focusIndicatorAudit
 *   touch targets (BL-UI-006 / WCAG 2.5.5) → touchTargetAudit
 *
 * NOT included: screenshot pixel-diff. A DOM snippet can't diff PNGs; visual
 * regression is delegated to Chromatic / Playwright `toHaveScreenshot()`
 * (deterministic tools that already exist) with the agent owning the
 * "intentional change?" verdict.
 *
 * USAGE (agent flow):
 *
 *   axe (Recipe 1):
 *     1. const raw = await browser_evaluate(axeRunSnippet())   // MUST await — returns a Promise
 *     2. const findings = classifyAxeResults(raw)
 *     // if raw.axeAvailable === false, axe could not load (CSP) — DO NOT report CLEAN.
 *
 *   keyboard walk (Recipe 3) — interleaves real Tab presses with evaluate:
 *     1. const trail = []
 *     2. trail.push(await browser_evaluate(ACTIVE_ELEMENT_SNIPPET))   // baseline
 *     3. repeat N times: browser_press_key('Tab'); trail.push(await browser_evaluate(ACTIVE_ELEMENT_SNIPPET))
 *     4. const findings = classifyKeyboardTrail(trail)
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** WCAG A/AA tags through 2.2 — the conformance target. best-practice excluded. */
export const AXE_WCAG_TAGS = [
  "wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa",
] as const;

/** Default axe-core UMD source if `window.axe` is not already present. */
export const DEFAULT_AXE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AxeNode {
  target: string[];
  html: string;
  failureSummary: string;
}

export interface AxeRuleResult {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeNode[];
}

export interface AxeRunResult {
  axeAvailable: boolean;
  axeVersion?: string;
  url?: string;
  violations: AxeRuleResult[];
  incomplete: AxeRuleResult[];
  note?: string;
}

export interface ActiveElementSnapshot {
  index?: number;
  tag: string;
  role: string | null;
  label: string;
  tabindex: number;
  top: number;
  left: number;
  width: number;
  height: number;
  onScreen: boolean;
  signature: string;
}

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

/**
 * Run axe-core against the current document, WCAG A/AA tags only, returning the
 * trimmed violations + incomplete sets. Loads axe from `src` if `window.axe` is
 * absent (e.g. plain storefront pages). On a CSP that blocks the CDN script,
 * `axeAvailable` is false — the classifier turns that into a WARN, never a
 * silent PASS.
 *
 * Returns a Promise — the evaluate tool MUST await it (Playwright and Chrome
 * DevTools both do).
 */
export function axeRunSnippet(
  src: string = DEFAULT_AXE_SRC,
  tags: readonly string[] = AXE_WCAG_TAGS,
): string {
  return `
(async () => {
  const SRC = ${JSON.stringify(src)};
  const TAGS = ${JSON.stringify(tags)};
  async function ensureAxe() {
    if (window.axe) return true;
    if (!SRC) return false;
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SRC; s.async = true;
        s.onload = resolve; s.onerror = () => reject(new Error('axe script failed to load'));
        document.head.appendChild(s);
      });
      return !!window.axe;
    } catch (e) { return false; }
  }
  const ok = await ensureAxe();
  if (!ok) {
    return { axeAvailable: false, violations: [], incomplete: [], url: location.href,
      note: 'axe-core unavailable (window.axe absent and CDN load blocked/failed — likely CSP). Do NOT report a clean a11y result.' };
  }
  const trim = (r) => ({
    id: r.id,
    impact: r.impact || null,
    help: r.help,
    helpUrl: r.helpUrl,
    tags: r.tags,
    nodes: (r.nodes || []).slice(0, 5).map(n => ({
      target: n.target,
      html: (n.html || '').slice(0, 160),
      failureSummary: (n.failureSummary || '').slice(0, 240),
    })),
  });
  try {
    const res = await window.axe.run(document, {
      runOnly: { type: 'tag', values: TAGS },
      resultTypes: ['violations', 'incomplete'],
    });
    return {
      axeAvailable: true,
      axeVersion: (window.axe && window.axe.version) || 'unknown',
      url: location.href,
      violations: (res.violations || []).map(trim),
      incomplete: (res.incomplete || []).map(trim),
    };
  } catch (e) {
    return { axeAvailable: false, violations: [], incomplete: [], url: location.href, note: 'axe.run threw: ' + String(e) };
  }
})()
`.trim();
}

/**
 * Snapshot `document.activeElement` — call after each Tab press to build the
 * focus-order trail for `classifyKeyboardTrail`. Read-only.
 */
export const ACTIVE_ELEMENT_SNIPPET = `
(() => {
  const el = document.activeElement;
  if (!el || el === document.body) {
    return { tag: el ? el.tagName.toLowerCase() : 'none', role: null, label: '(focus on body/none)',
      tabindex: -1, top: 0, left: 0, width: 0, height: 0, onScreen: false, signature: 'body' };
  }
  const r = el.getBoundingClientRect();
  const label = (el.getAttribute('aria-label') || el.getAttribute('alt') ||
    (el.textContent || '').trim() || el.getAttribute('name') || el.getAttribute('placeholder') || '').slice(0, 50);
  const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;
  const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.split(/\\s+/).slice(0, 2).join('.') : '';
  const sig = el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls) + '|' + label;
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    label,
    tabindex: el.tabIndex,
    top: Math.round(r.top), left: Math.round(r.left),
    width: Math.round(r.width), height: Math.round(r.height),
    onScreen,
    signature: sig,
  };
})()
`.trim();

// ---------------------------------------------------------------------------
// Analyzers
// ---------------------------------------------------------------------------

export type A11ySeverity = "PASS" | "WARN" | "FAIL" | "P0";

export interface A11yFinding {
  check: "axe" | "keyboard-order" | "keyboard-trap" | "keyboard-offscreen";
  severity: A11ySeverity;
  rule?: string;
  message: string;
  evidence: unknown;
}

const IMPACT_SEVERITY: Record<string, A11ySeverity> = {
  critical: "P0",
  serious: "FAIL",
  moderate: "FAIL",
  minor: "WARN",
};

/**
 * Classify an axe run. Violations → findings by impact. `incomplete` items are
 * surfaced as WARN (need manual review — never auto-fail, per the skill's
 * "interpret incomplete" judgment note). axeAvailable=false → a WARN that
 * blocks a clean verdict.
 */
export function classifyAxeResults(raw: AxeRunResult): A11yFinding[] {
  if (!raw || raw.axeAvailable === false) {
    return [{
      check: "axe",
      severity: "WARN",
      message: raw?.note || "axe-core did not run — a11y result is INCONCLUSIVE, not clean",
      evidence: raw,
    }];
  }

  const findings: A11yFinding[] = [];
  for (const v of raw.violations) {
    findings.push({
      check: "axe",
      severity: IMPACT_SEVERITY[v.impact ?? "moderate"] ?? "FAIL",
      rule: v.id,
      message: `${v.id} (${v.impact ?? "n/a"}): ${v.help} — ${v.nodes.length} node(s)${v.nodes[0] ? `, e.g. ${v.nodes[0].target.join(" ")}` : ""}`,
      evidence: v,
    });
  }
  for (const inc of raw.incomplete) {
    findings.push({
      check: "axe",
      severity: "WARN",
      rule: inc.id,
      message: `${inc.id} needs manual review (axe could not decide): ${inc.help} — ${inc.nodes.length} node(s)`,
      evidence: inc,
    });
  }
  if (findings.length === 0) {
    findings.push({ check: "axe", severity: "PASS", message: `No WCAG A/AA violations (axe ${raw.axeVersion ?? "?"})`, evidence: { url: raw.url } });
  }
  return findings;
}

/**
 * Classify a Tab-order trail (array of ACTIVE_ELEMENT_SNIPPET results in press
 * order). Detects:
 *  - keyboard trap / cycle: the same element signature focused 3+ times, or the
 *    trail never advances past one element
 *  - focus reaching an off-screen element (focus moved but the element isn't in
 *    the viewport — common with skip-link / off-canvas bugs)
 *  - non-monotonic visual order: focus jumps UP the page by a large amount
 *    mid-traversal (DOM order ≠ visual order) — WARN, since multi-column layouts
 *    legitimately do this
 */
export function classifyKeyboardTrail(trail: ActiveElementSnapshot[]): A11yFinding[] {
  const findings: A11yFinding[] = [];
  if (trail.length < 2) {
    return [{ check: "keyboard-order", severity: "WARN", message: `Trail too short (${trail.length}) to analyze`, evidence: trail }];
  }

  // Trap / cycle: a signature focused 3+ times in a row, or only 1 distinct sig.
  const counts = new Map<string, number>();
  let maxRepeat = 1, run = 1;
  for (let i = 0; i < trail.length; i++) {
    counts.set(trail[i].signature, (counts.get(trail[i].signature) ?? 0) + 1);
    if (i > 0 && trail[i].signature === trail[i - 1].signature) { run++; maxRepeat = Math.max(maxRepeat, run); }
    else run = 1;
  }
  const distinct = counts.size;
  if (maxRepeat >= 3 || distinct === 1) {
    findings.push({
      check: "keyboard-trap",
      severity: "P0",
      message: `Possible keyboard trap: focus stuck (${distinct} distinct element(s) across ${trail.length} Tab presses, max ${maxRepeat} repeats)`,
      evidence: trail,
    });
  }

  // Off-screen focus.
  const offscreen = trail.filter((t) => t.signature !== "body" && !t.onScreen);
  if (offscreen.length > 0) {
    findings.push({
      check: "keyboard-offscreen",
      severity: "FAIL",
      message: `${offscreen.length} focused element(s) are off-screen (e.g. ${offscreen[0].signature}) — focus moved to a non-visible target`,
      evidence: offscreen,
    });
  }

  // Non-monotonic visual order: large upward jumps (>100px up) between consecutive
  // on-screen focuses. WARN only — multi-column layouts do this legitimately.
  let jumps = 0;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    if (a.onScreen && b.onScreen && a.signature !== "body" && b.signature !== "body" && b.top - a.top < -100) jumps++;
  }
  if (jumps > 0) {
    findings.push({
      check: "keyboard-order",
      severity: "WARN",
      message: `${jumps} upward focus jump(s) >100px — DOM order may not match visual order (verify intentional in multi-column layouts)`,
      evidence: { jumps },
    });
  }

  if (findings.length === 0) {
    findings.push({ check: "keyboard-order", severity: "PASS", message: `Focus order clean across ${trail.length} stops, ${distinct} distinct elements`, evidence: { distinct } });
  }
  return findings;
}

export function summarizeA11y(findings: A11yFinding[]): string {
  const counts: Record<A11ySeverity, number> = { PASS: 0, WARN: 0, FAIL: 0, P0: 0 };
  for (const f of findings) counts[f.severity]++;
  const header = `A11y audit: ${counts.PASS} pass · ${counts.WARN} warn · ${counts.FAIL} fail · ${counts.P0} P0`;
  const notable = findings.filter((f) => f.severity !== "PASS");
  if (notable.length === 0) return header;
  return [header, ...notable.map((f) => `  [${f.severity}] ${f.check}${f.rule ? ` ${f.rule}` : ""} — ${f.message}`)].join("\n");
}
