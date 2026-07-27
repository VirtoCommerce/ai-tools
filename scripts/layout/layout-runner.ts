#!/usr/bin/env tsx
/**
 * Layout Runner — deterministic executor for runner-native layout test cases.
 *
 * The twin of `scripts/graphql/graphql-runner.ts`, for BL-UI-001..006. Layout
 * measurement is 100% deterministic — navigate, measure, compare, no judgment — so it
 * belongs in a script, not in an LLM agent driving MCP browser tools.
 *
 * WHY THIS EXISTS
 * ---------------
 * Suite 048b ran 161 cases through an agent and returned 77 PASS / 36 FAIL / 47 BLOCKED
 * in ~73 min (run REG-2026-07-24-2121). Almost none of the BLOCKED were product problems:
 *
 *   47 BLOCKED  cart contaminated by earlier cases in the same session; unmet preconditions
 *    2 FAIL     touch-target rule measured at 1920px when it only applies at <= 768px
 *    n BLOCKED  "requires Slow 3G throttling — not exercised this pass"
 *    1 BLOCKED  @td(STRESS.longTitleSlug) 404s — fixture drift
 *
 * Every one of those is an artifact of HOW the suite ran, not of what it measured. This
 * runner removes the whole class:
 *
 *   fresh BrowserContext per case ....... no cross-case contamination, ever
 *   [VIEWPORT] is a declared step ....... cannot measure the wrong viewport
 *   [THROTTLE] via CDP .................. skeleton / slow-3G cases become runnable
 *   CLS observer via addInitScript ...... installs BEFORE first paint. MCP could not do
 *                                         this (048b: "PerformanceObserver cannot run
 *                                         before first paint via MCP; pre-paint shifts
 *                                         are under-counted by design"). Now they aren't.
 *   [DISCOVER] at runtime ............... no stale slug fixtures
 *
 * MEASUREMENT IS NOT DUPLICATED HERE. Every probe reuses the snippets and classifiers in
 * `scripts/lib/measure-layout.ts`, whose thresholds are themselves derived from the real
 * design system (`npm run tokens:sync`). One source of truth for "what is a violation",
 * shared by this runner and the interactive `/qa-design` skill.
 *
 * NOT IN SCOPE: screenshot pixel-diff. Live storefront data drifts (catalog reseeds,
 * prices, promos), so full-page diffing is noise here — and a screenshot gives false
 * PASS on layout bugs anyway (see quality-gates.md G3 / VCST-5276). Component pixel-diff
 * belongs in Storybook, where the render is deterministic.
 *
 * USAGE
 *   npm run layout:run -- --suite regression/suites/Frontend/cross-cutting/048c-layout-stability.csv
 *   npm run layout:run -- --suite <csv> --case LAYOUT-CLS-001     # single case
 *   npm run layout:run -- --suite <csv> --headed --keep-open      # debug
 *   npm run layout:list -- --suite <csv>                          # parse only, no browser
 *
 *   --run-id <id>    write results under reports/regression/<id>/ (default: LAYOUT-<ts>)
 *   --env <name>     TEST_ENV to resolve URLs/fixtures against (default: process env)
 *   --grep <substr>  run only cases whose ID or Title contains <substr>
 *   --max-failures N stop after N failing cases
 *
 * EXIT CODES
 *   0  every executed case PASSed (WARN does not fail the run)
 *   1  at least one case FAILed
 *   2  the suite could not be parsed / the environment is unusable (no cases ran)
 *
 * STEP GRAMMAR (the `Steps` column, one tag per line)
 *   [VIEWPORT] 375                 | 1280x900
 *   [THROTTLE] fast3g              | slow3g | none
 *   [AUTH]     USER                | ORG_USER | none          (role key from user-roles.mjs)
 *   [DISCOVER] SLUG = longestTitleSlug | firstProductSlug     (binds {{SLUG}} for later steps)
 *   [NAV]      {{FRONT_URL}}/catalog
 *   [WAIT]     networkidle | 500ms | <selector> | <selector> >= 4
 *   [REFLOW]                                                  (surface lazy shifts)
 *   [HOVER]    <selector>
 *   [CLICK]    <selector>
 *   [FILL]     <selector> = <value>
 *   [SNAP]     before = <selector>                            (rect snapshot, named)
 *   [PROBE:CLS]
 *   [PROBE:SPACING]  <selector>
 *   [PROBE:ALIGN]    <selector>
 *   [PROBE:OVERFLOW]
 *   [PROBE:TOUCH]    <scope selector>
 *   [PROBE:IMAGES]   <selector>                              (aspect-ratio squash/stretch)
 *   [PROBE:IMGDIMS]  <selector>                              (no reserved space — CLS root cause)
 *
 * ASSERTION GRAMMAR (the `Assertions` column, one per line; all must hold)
 *   [CLS]      <= 0.1
 *   [SPACING]  offGrid == 0
 *   [ALIGN]    centerDrift <= 1        | heightDrift <= 1
 *   [OVERFLOW] documentScrolls == false
 *   [TOUCH]    belowAA == 0  | belowAAA == 0  | tooClose == 0
 *              belowAA is the FAIL tier (WCAG AA 24x24); belowAAA only WARNs (the UI kit
 *              ships 26/32/38px controls by design); tooClose is the >= 8px gap contract
 *              and always FAILs — crowding causes mis-taps whatever the control size.
 *   [IMAGES]   aspectDrift == 0
 *   [IMGDIMS]  missingDims == 0
 *   [SHIFT]    before vs after topDelta == 0             (also leftDelta / any)
 *
 * A case with no parseable assertion is reported BLOCKED, never PASS — silence is not a pass.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { parse as parseCsv } from "csv-parse/sync";
import { config as loadDotenv } from "dotenv";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { resolveTestEnv } from "../lib/resolve-test-env.js";

import {
  LAYOUT_SNIPPETS,
  spacingAuditSnippet,
  alignmentAuditSnippet,
  touchTargetAuditSnippet,
  imageAspectAuditSnippet,
  imageIntrinsicDimsSnippet,
  rectSnapshotSnippet,
  classifyCls,
  classifySpacing,
  classifyAlignment,
  classifyOverflow,
  classifyTouchTargets,
  type ClsResult,
  type SpacingAuditResult,
  type AlignmentAuditResult,
  type OverflowAuditResult,
  type TouchTargetAuditResult,
  type ImageAspectAuditResult,
  type ImageIntrinsicDimsResult,
  type RectSnapshot,
} from "../lib/measure-layout.js";
import { TestDataResolver } from "../lib/test-data-resolver.js";
import { roleByKey, resolveRole } from "../lib/user-roles.mjs";

// Layered, TEST_ENV-aware env load — mirrors graphql-runner.ts / seed-common.mjs.
// A bare loadDotenv() reads only `.env`, which does not exist in this repo, so live
// runs would see no FRONT_URL and no credentials for [AUTH]. Deliberately does NOT
// import config.js, whose strict CORE validation would block a layout-only run.
// NOTE: --env is honoured by re-reading TEST_ENV below, so it must be applied first.
{
  const argv = process.argv.slice(2);
  const envIdx = argv.indexOf("--env");
  if (envIdx >= 0 && argv[envIdx + 1] && !argv[envIdx + 1].startsWith("--")) {
    process.env.TEST_ENV = argv[envIdx + 1];
  }
}
const TEST_ENV = resolveTestEnv("vcst");
loadDotenv({ path: ".env.defaults" });
loadDotenv({ path: `.env.${TEST_ENV}`, override: true });
loadDotenv({ path: ".env.local", override: true });

// Per-env override promotion: `FOO_VCST` → `FOO`, so `.env.local` can carry variants.
const ENV_SUFFIX = `_${TEST_ENV.toUpperCase()}`;
for (const [key, value] of Object.entries(process.env)) {
  if (key.endsWith(ENV_SUFFIX) && value) process.env[key.slice(0, -ENV_SUFFIX.length)] = value;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  suite: string;
  caseId?: string;
  grep?: string;
  runId: string;
  headed: boolean;
  keepOpen: boolean;
  listOnly: boolean;
  maxFailures: number;
}

function parseArgs(): CliArgs {
  const a = process.argv.slice(2);
  const val = (flag: string): string | undefined => {
    const i = a.indexOf(flag);
    return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : undefined;
  };
  if (a.includes("--help") || a.length === 0) {
    console.log(readFileSync(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "utf8").split("*/")[0]);
    process.exit(0);
  }
  const suite = val("--suite");
  if (!suite) {
    console.error("[layout] --suite <path-to-csv> is required (see --help)");
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
  return {
    suite,
    caseId: val("--case"),
    grep: val("--grep"),
    runId: val("--run-id") ?? `LAYOUT-${stamp}`,
    headed: a.includes("--headed"),
    keepOpen: a.includes("--keep-open"),
    listOnly: a.includes("--list"),
    maxFailures: Number(val("--max-failures") ?? "0") || Number.POSITIVE_INFINITY,
  };
}

// ---------------------------------------------------------------------------
// Suite parsing
// ---------------------------------------------------------------------------

interface CaseRow {
  ID: string;
  Title: string;
  Section: string;
  Priority: string;
  Business_Rule: string;
  Edge_Case_Refs: string;
  Preconditions: string;
  Test_Data: string;
  Steps: string;
  Assertions: string;
  Cross_Layer_Checks: string;
  Failure_Signals: string;
  Cleanup: string;
  References: string;
  Automation_Status: string;
}

function loadSuite(path: string): CaseRow[] {
  if (!existsSync(path)) {
    console.error(`[layout] suite not found: ${path}`);
    process.exit(2);
  }
  // Canonical strict parse — same settings as graphql-runner.ts / sync-test-suites.ts.
  return parseCsv(readFileSync(path, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
    bom: true,
  }) as CaseRow[];
}

const lines = (s: string): string[] =>
  (s ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Variable resolution — {{ENV_VAR}}, {{DISCOVERED}}, @td(ALIAS.field)
// ---------------------------------------------------------------------------

const tdResolver = new TestDataResolver(join("test-data"), TEST_ENV);

function resolveVars(input: string, bound: Record<string, string>): string {
  let out = input;
  out = out.replace(/\{\{(\w+)\}\}/g, (m, name: string) => bound[name] ?? process.env[name] ?? m);
  if (out.includes("@td(")) out = tdResolver.resolve(out);
  return out;
}

// ---------------------------------------------------------------------------
// Per-case execution state
// ---------------------------------------------------------------------------

interface CaseState {
  cls?: ClsResult;
  spacing?: SpacingAuditResult;
  align?: AlignmentAuditResult;
  overflow?: OverflowAuditResult;
  touch?: TouchTargetAuditResult;
  images?: ImageAspectAuditResult;
  imgDims?: ImageIntrinsicDimsResult;
  snaps: Record<string, RectSnapshot>;
  bound: Record<string, string>;
  consoleErrors: string[];
  networkErrors: string[];
  viewport: { width: number; height: number };
}

type Status = "PASS" | "FAIL" | "WARN" | "BLOCKED";

interface CaseResult {
  id: string;
  status: Status;
  title: string;
  section: string;
  priority: string;
  businessRule: string;
  edgeCaseRefs: string;
  failedAssertion?: string;
  notes?: string;
  findings: { invariant: string; severity: string; message: string }[];
  consoleErrors: string[];
  networkErrors: string[];
  durationMs: number;
  trace?: string;
}

const THROTTLE_PROFILES: Record<string, { downloadThroughput: number; uploadThroughput: number; latency: number }> = {
  // Chrome DevTools' own presets, in bytes/s.
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 562.5 },
  slow3g: { downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 2000 },
};

// ---------------------------------------------------------------------------
// Auth — real UI sign-in ONCE per role, then reuse storageState per case.
// The login itself goes through the real form (never an API/token bypass, per the
// repo's real-user rule); reuse is what keeps per-case isolation affordable.
// ---------------------------------------------------------------------------

const storageStateCache = new Map<string, unknown>();

async function storageStateForRole(browser: Browser, roleKey: string, frontUrl: string): Promise<unknown> {
  if (storageStateCache.has(roleKey)) return storageStateCache.get(roleKey);

  const role = roleByKey(roleKey);
  if (!role) throw new Error(`[AUTH] unknown role "${roleKey}" — not in user-roles.mjs`);
  const resolved = resolveRole(role);
  if (!resolved.email || !resolved.password) {
    throw new Error(`[AUTH] role "${roleKey}" not configured — missing env: ${resolved.missing.join(", ")}`);
  }

  const ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${frontUrl}/sign-in`, { waitUntil: "domcontentloaded" });
    // Stable data-test-ids per storefront-selectors.md. NB the email field is
    // type="text" (not type="email") on this storefront, so a type selector misses it.
    await page.fill('[data-test-id="email-input"], input[name="email"]', resolved.email);
    await page.fill('[data-test-id="password-input"], input[type="password"]', resolved.password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes("/sign-in"), { timeout: 30_000 }).catch(() => undefined),
      page.click('[data-test-id="login-button"], button[type="submit"]'),
    ]);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    if (page.url().includes("/sign-in")) {
      throw new Error(`[AUTH] sign-in did not leave /sign-in for role "${roleKey}" — check credentials`);
    }
    const state = await ctx.storageState();
    storageStateCache.set(roleKey, state);
    return state;
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Live discovery — replaces stale slug fixtures
// ---------------------------------------------------------------------------

async function discover(kind: string, page: Page, frontUrl: string): Promise<string> {
  switch (kind) {
    case "longestTitleSlug":
    case "firstProductSlug": {
      await page.goto(`${frontUrl}/catalog`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".vc-product-card a[href]", { timeout: 30_000 });
      const href = await page.evaluate((longest: boolean) => {
        const cards = Array.from(document.querySelectorAll<HTMLAnchorElement>(".vc-product-card a[href]"));
        if (!cards.length) return "";
        if (!longest) return cards[0].getAttribute("href") ?? "";
        let best = cards[0];
        let bestLen = 0;
        for (const c of cards) {
          const len = (c.textContent ?? "").trim().length;
          if (len > bestLen) {
            bestLen = len;
            best = c;
          }
        }
        return best.getAttribute("href") ?? "";
      }, kind === "longestTitleSlug");
      if (!href) throw new Error(`[DISCOVER] ${kind}: no product cards on /catalog`);
      return href;
    }
    default:
      throw new Error(`[DISCOVER] unknown kind "${kind}" (longestTitleSlug | firstProductSlug)`);
  }
}

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

const TAG_RE = /^\[([A-Z:]+)\]\s*(.*)$/;

/**
 * Split a `lhs = rhs` argument on the first SPACED equals.
 *
 * A naive `split("=")` breaks on any attribute selector — `input[type="email"]` has an
 * `=` inside it, which silently truncated the selector to `input[type` and blocked
 * LAYOUT-COMP-VCINPUT-002. The grammar always writes the separator spaced, so anchoring
 * on ` = ` is unambiguous and leaves selectors intact.
 */
function splitAssignment(arg: string, tag: string): [string, string] {
  const i = arg.indexOf(" = ");
  if (i < 0) throw new Error(`[${tag}] expects "<lhs> = <rhs>" with spaces around "=", got: ${arg}`);
  return [arg.slice(0, i).trim(), arg.slice(i + 3).trim()];
}

async function runSteps(
  page: Page,
  cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>>,
  steps: string[],
  st: CaseState,
  frontUrl: string,
): Promise<void> {
  for (const raw of steps) {
    const m = TAG_RE.exec(raw);
    if (!m) continue; // prose line — ignore, the grammar is tag-driven
    const tag = m[1];
    const arg = resolveVars(m[2].trim(), st.bound);

    switch (tag) {
      case "VIEWPORT": {
        const [w, h] = arg.includes("x") ? arg.split("x").map(Number) : [Number(arg), st.viewport.height];
        st.viewport = { width: w, height: h || 900 };
        await page.setViewportSize(st.viewport);
        break;
      }
      case "THROTTLE": {
        const p = THROTTLE_PROFILES[arg];
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: p?.latency ?? 0,
          downloadThroughput: p?.downloadThroughput ?? -1,
          uploadThroughput: p?.uploadThroughput ?? -1,
        });
        break;
      }
      case "AUTH":
        break; // handled before context creation
      case "DISCOVER": {
        const [name, kind] = splitAssignment(arg, "DISCOVER");
        st.bound[name] = await discover(kind, page, frontUrl);
        break;
      }
      case "NAV":
        await page.goto(arg, { waitUntil: "domcontentloaded" });
        break;
      case "WAIT": {
        if (arg === "networkidle") {
          await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
        } else if (/^\d+ms$/.test(arg)) {
          await page.waitForTimeout(Number(arg.replace("ms", "")));
        } else if (/>=\s*\d+$/.test(arg)) {
          const [sel, n] = arg.split(/\s*>=\s*/);
          await page.waitForFunction(
            ([s, count]) => document.querySelectorAll(s as string).length >= Number(count),
            [sel.trim(), n] as const,
            { timeout: 30_000 },
          );
        } else {
          await page.waitForSelector(arg, { timeout: 30_000 });
        }
        break;
      }
      case "REFLOW":
        await page.evaluate(LAYOUT_SNIPPETS.triggerReflowProbe);
        await page.waitForTimeout(600);
        break;
      case "HOVER":
        await page.hover(arg);
        await page.waitForTimeout(400);
        break;
      case "CLICK":
        await page.click(arg);
        await page.waitForTimeout(400);
        break;
      case "FILL": {
        const [sel, value] = splitAssignment(arg, "FILL");
        await page.fill(sel, value);
        break;
      }
      case "SNAP": {
        const [name, sel] = splitAssignment(arg, "SNAP");
        st.snaps[name] = (await page.evaluate(rectSnapshotSnippet(sel))) as RectSnapshot;
        break;
      }
      case "PROBE:CLS":
        st.cls = (await page.evaluate(LAYOUT_SNIPPETS.readCls)) as ClsResult;
        break;
      case "PROBE:SPACING":
        st.spacing = (await page.evaluate(spacingAuditSnippet(arg))) as SpacingAuditResult;
        break;
      case "PROBE:ALIGN":
        st.align = (await page.evaluate(alignmentAuditSnippet(arg))) as AlignmentAuditResult;
        break;
      case "PROBE:OVERFLOW":
        st.overflow = (await page.evaluate(LAYOUT_SNIPPETS.overflowAudit)) as OverflowAuditResult;
        break;
      case "PROBE:TOUCH":
        st.touch = (await page.evaluate(
          arg ? touchTargetAuditSnippet(arg) : LAYOUT_SNIPPETS.touchTargetAudit,
        )) as TouchTargetAuditResult;
        break;
      case "PROBE:IMAGES":
        st.images = (await page.evaluate(imageAspectAuditSnippet(arg || "img"))) as ImageAspectAuditResult;
        break;
      case "PROBE:IMGDIMS":
        st.imgDims = (await page.evaluate(imageIntrinsicDimsSnippet(arg || "img"))) as ImageIntrinsicDimsResult;
        break;
      default:
        throw new Error(`unknown step tag [${tag}] — see the grammar in this file's header`);
    }
  }
}

// ---------------------------------------------------------------------------
// Assertion evaluation
// ---------------------------------------------------------------------------

interface AssertOutcome {
  ok: boolean;
  warn?: boolean;
  text: string;
  detail: string;
}

function cmp(actual: number, op: string, expected: number): boolean {
  switch (op) {
    case "<=":
      return actual <= expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case ">":
      return actual > expected;
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    default:
      throw new Error(`unknown operator "${op}"`);
  }
}

function evaluateAssertion(raw: string, st: CaseState): AssertOutcome | null {
  const m = TAG_RE.exec(raw);
  if (!m) return null;
  const tag = m[1];
  const body = m[2].trim();
  const need = <T>(v: T | undefined, probe: string): T => {
    if (v === undefined) throw new Error(`assertion [${tag}] needs a ${probe} probe, but none ran`);
    return v;
  };

  const numeric = (actual: number, label: string): AssertOutcome => {
    const mm = /^([<>=!]=?)\s*([\d.]+)$/.exec(body.replace(/^\S+\s*/, (s) => (/[<>=!]/.test(s) ? "" : s)));
    const parsed = mm ?? /([<>=!]=?)\s*([\d.]+)/.exec(body);
    if (!parsed) throw new Error(`cannot parse assertion "${raw}"`);
    const ok = cmp(actual, parsed[1], Number(parsed[2]));
    return { ok, text: raw, detail: `${label}=${actual} (expected ${parsed[1]} ${parsed[2]})` };
  };

  switch (tag) {
    case "CLS": {
      const cls = need(st.cls, "[PROBE:CLS]");
      const out = numeric(cls.cls, "cls");
      const f = classifyCls(cls);
      // Name the offending elements — the difference between "CLS is bad" and a fix list.
      const top = (cls.sources ?? [])
        .slice(0, 3)
        .map((s) => `${s.selector} (impact ${s.impact}, moved ${s.maxMovePx}px)`)
        .join("; ");
      return { ...out, detail: `${out.detail}; ${f.severity}: ${f.message}${top ? ` — shifted by: ${top}` : ""}` };
    }
    case "SPACING": {
      const sp = need(st.spacing, "[PROBE:SPACING]");
      const f = classifySpacing(sp);
      const out = numeric(sp.offGrid.length, "offGrid");
      const sample = sp.offGrid
        .slice(0, 5)
        .map((o) => `${o.tag}.${o.prop}=${o.value}px`)
        .join(", ");
      return { ...out, detail: `${out.detail}${sample ? ` [${sample}]` : ""}; ${f.severity}` };
    }
    case "ALIGN": {
      const al = need(st.align, "[PROBE:ALIGN]");
      const which = /heightDrift/i.test(body) ? "heightDriftPx" : "centerDriftPx";
      const f = classifyAlignment(al);
      const out = numeric(al[which] as number, which);
      return { ...out, detail: `${out.detail}; matched=${al.matched}; ${f.severity}` };
    }
    case "OVERFLOW": {
      const ov = need(st.overflow, "[PROBE:OVERFLOW]");
      const expected = /true/i.test(body);
      const f = classifyOverflow(ov);
      return {
        ok: ov.documentScrolls === expected,
        text: raw,
        detail: `documentScrolls=${ov.documentScrolls} (scrollWidth=${ov.documentScrollWidth} vs innerWidth=${ov.innerWidth}); ${f.severity}`,
      };
    }
    case "TOUCH": {
      const tt = need(st.touch, "[PROBE:TOUCH]");
      const f = classifyTouchTargets(tt);
      const belowAA = tt.undersized.filter((u) => u.belowAA).length;
      const belowAAA = tt.undersized.length;

      // Adjacent-target spacing is its own contract (BL-UI-006's ">= 8 px gap") and is
      // NOT a size tier — a mis-tap between two crowded controls is a real defect
      // regardless of how big either one is. Assertable so it can drive a verdict.
      if (/tooClose/.test(body)) {
        const out = numeric(tt.tooClose.length, "tooClose");
        const sample = tt.tooClose
          .slice(0, 3)
          .map((p) => `${p.aTag}/${p.bTag} ${p.distancePx}px`)
          .join(", ");
        return { ...out, detail: `${out.detail}; viewport=${tt.viewport}${sample ? ` [${sample}]` : ""}` };
      }

      const useAA = /belowAA\b/.test(body);
      const actual = useAA ? belowAA : belowAAA;
      const out = numeric(actual, useAA ? "belowAA" : "belowAAA");
      // A pure AAA breach is the design-system tier — surface it as WARN, not FAIL.
      const warn = !out.ok && !useAA && belowAA === 0;
      return {
        ok: out.ok || warn,
        warn,
        text: raw,
        detail: `${out.detail}; viewport=${tt.viewport}; evaluated=${tt.evaluated}; ${f.severity}: ${f.message}`,
      };
    }
    case "IMAGES": {
      const im = need(st.images, "[PROBE:IMAGES]");
      const out = numeric(im.violations.length, "aspectDrift");
      const sample = im.violations
        .slice(0, 3)
        .map((v) => `${v.src.split("/").pop()} drift=${(v.drift * 100).toFixed(1)}%`)
        .join(", ");
      return { ...out, detail: `${out.detail}; evaluated=${im.evaluated}${sample ? ` [${sample}]` : ""}` };
    }
    case "IMGDIMS": {
      const im = need(st.imgDims, "[PROBE:IMGDIMS]");
      const out = numeric(im.offenders.length, "missingDims");
      const sample = im.offenders
        .slice(0, 3)
        .map((o) => `${o.src.split("/").pop() || "(inline)"} ar=${o.cssAspectRatio}`)
        .join(", ");
      return { ...out, detail: `${out.detail}; evaluated=${im.evaluated}${sample ? ` [${sample}]` : ""}` };
    }
    case "SHIFT": {
      const sm = /^(\w+)\s+vs\s+(\w+)\s+(\w+)\s*([<>=!]=?)\s*([\d.]+)$/.exec(body);
      if (!sm) throw new Error(`cannot parse [SHIFT] assertion "${raw}"`);
      const [, aName, bName, prop, op, expected] = sm;
      const a = st.snaps[aName];
      const b = st.snaps[bName];
      if (!a || !b) throw new Error(`[SHIFT] needs two [SNAP]s named "${aName}" and "${bName}"`);
      const deltas: Record<string, number> = {
        topDelta: Math.abs(b.top - a.top),
        leftDelta: Math.abs(b.left - a.left),
        widthDelta: Math.abs(b.width - a.width),
        heightDelta: Math.abs(b.height - a.height),
      };
      const actual = prop === "any" ? Math.max(...Object.values(deltas)) : deltas[prop];
      if (actual === undefined) throw new Error(`[SHIFT] unknown property "${prop}"`);
      return {
        ok: cmp(actual, op, Number(expected)),
        text: raw,
        detail: `${prop}=${actual}px (expected ${op} ${expected}); ${JSON.stringify(deltas)}`,
      };
    }
    default:
      return null; // not a runner-native assertion — ignored, but see the "no assertions" guard
  }
}

// ---------------------------------------------------------------------------
// Case runner
// ---------------------------------------------------------------------------

async function runCase(browser: Browser, row: CaseRow, frontUrl: string, outDir: string): Promise<CaseResult> {
  const started = Date.now();
  const base: Omit<CaseResult, "status" | "durationMs"> = {
    id: row.ID,
    title: row.Title,
    section: row.Section,
    priority: row.Priority,
    businessRule: row.Business_Rule,
    edgeCaseRefs: row.Edge_Case_Refs,
    findings: [],
    consoleErrors: [],
    networkErrors: [],
  };

  const stepLines = lines(row.Steps);
  const assertLines = lines(row.Assertions);

  // Silence is never a pass.
  if (!assertLines.some((l) => TAG_RE.test(l))) {
    return { ...base, status: "BLOCKED", notes: "no runner-native assertion in the Assertions column", durationMs: 0 };
  }

  // [AUTH] must be resolved before the context exists.
  const authTag = stepLines.map((l) => TAG_RE.exec(l)).find((m) => m?.[1] === "AUTH");
  const roleKey = authTag?.[2]?.trim();

  let context: BrowserContext | undefined;
  const st: CaseState = {
    snaps: {},
    bound: {},
    consoleErrors: [],
    networkErrors: [],
    viewport: { width: 1280, height: 900 },
  };

  try {
    let storageState: unknown;
    if (roleKey && roleKey !== "none") storageState = await storageStateForRole(browser, roleKey, frontUrl);

    // FRESH CONTEXT PER CASE — the fix for 048b's 47 BLOCKED.
    context = await browser.newContext({
      locale: "en-US", // required — see feedback_playwright_locale
      viewport: st.viewport,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      storageState: storageState as any,
    });

    // CLS observer installed BEFORE first paint — impossible via MCP, which is why
    // 048b could only measure post-DOMContentLoaded shifts.
    await context.addInitScript(LAYOUT_SNIPPETS.installClsObserver);

    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") st.consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on("response", (res) => {
      if (res.status() >= 400) st.networkErrors.push(`${res.status()} ${res.request().method()} ${res.url().slice(0, 160)}`);
    });

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");

    await runSteps(page, cdp, stepLines, st, frontUrl);

    // Evaluate every assertion; collect all outcomes so the report shows the full picture.
    const outcomes: AssertOutcome[] = [];
    for (const a of assertLines) {
      const o = evaluateAssertion(a, st);
      if (o) outcomes.push(o);
    }

    const failed = outcomes.filter((o) => !o.ok);
    const warned = outcomes.filter((o) => o.ok && o.warn);
    const status: Status = failed.length > 0 ? "FAIL" : warned.length > 0 ? "WARN" : "PASS";

    const result: CaseResult = {
      ...base,
      status,
      durationMs: Date.now() - started,
      consoleErrors: st.consoleErrors.slice(0, 10),
      networkErrors: st.networkErrors.slice(0, 10),
      findings: outcomes.map((o) => ({
        invariant: row.Business_Rule,
        severity: o.ok ? (o.warn ? "WARN" : "PASS") : "FAIL",
        message: `${o.text} → ${o.detail}`,
      })),
      failedAssertion: failed[0] ? `${failed[0].text} → ${failed[0].detail}` : undefined,
      notes: warned.length ? warned.map((w) => w.detail).join(" | ") : undefined,
    };

    if (status === "FAIL") {
      const traceDir = join(outDir, "traces");
      mkdirSync(traceDir, { recursive: true });
      const tracePath = join(traceDir, `${row.ID}-FAIL-trace.json`);
      writeFileSync(
        tracePath,
        JSON.stringify(
          {
            testCaseId: row.ID,
            businessRule: row.Business_Rule,
            viewport: st.viewport,
            assertions: outcomes.map((o) => ({ assertion: o.text, ok: o.ok, detail: o.detail })),
            consoleErrors: st.consoleErrors,
            networkFailures: st.networkErrors,
            probes: { cls: st.cls, spacing: st.spacing, align: st.align, overflow: st.overflow, touch: st.touch },
          },
          null,
          2,
        ),
        "utf8",
      );
      result.trace = tracePath.replace(/\\/g, "/");

      const shotDir = join(outDir, "screenshots");
      mkdirSync(shotDir, { recursive: true });
      const shot = join(shotDir, `${row.ID}-FAIL.png`);
      await page.screenshot({ path: shot, fullPage: false }).catch(() => undefined);
    }

    return result;
  } catch (err) {
    // An execution error is BLOCKED, not FAIL — it says nothing about the product.
    return {
      ...base,
      status: "BLOCKED",
      durationMs: Date.now() - started,
      consoleErrors: st.consoleErrors.slice(0, 10),
      networkErrors: st.networkErrors.slice(0, 10),
      notes: (err as Error).message.slice(0, 400),
    };
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();
  const rows = loadSuite(args.suite);

  const selected = rows.filter((r) => {
    if (args.caseId) return r.ID === args.caseId;
    if (args.grep) return `${r.ID} ${r.Title}`.toLowerCase().includes(args.grep.toLowerCase());
    return true;
  });

  const suiteId = basename(args.suite).split("-")[0];
  const suiteName = basename(args.suite, ".csv").split("-").slice(1).join(" ");

  if (args.listOnly) {
    console.log(`[layout] ${args.suite} — ${selected.length}/${rows.length} case(s)`);
    for (const r of selected) {
      const steps = lines(r.Steps).filter((l) => TAG_RE.test(l)).length;
      const asserts = lines(r.Assertions).filter((l) => TAG_RE.test(l)).length;
      const runnable = asserts > 0 ? "ok " : "NO-ASSERT";
      console.log(`  ${runnable} ${r.ID.padEnd(34)} ${String(steps).padStart(2)} steps ${String(asserts).padStart(2)} asserts  ${r.Business_Rule}`);
    }
    process.exit(0);
  }

  const frontUrl = (process.env.FRONT_URL ?? "").replace(/\/$/, "");
  if (!frontUrl) {
    console.error("[layout] FRONT_URL is not set — check your .env for the selected TEST_ENV");
    process.exit(2);
  }

  const outDir = join("reports", "regression", args.runId);
  mkdirSync(outDir, { recursive: true });

  console.log(`[layout] suite ${suiteId} — ${selected.length} case(s) against ${frontUrl}`);
  console.log(`[layout] run ${args.runId} → ${outDir}`);

  const browser = await chromium.launch({ headless: !args.headed });
  const startedAt = new Date().toISOString();
  const results: CaseResult[] = [];

  try {
    for (const row of selected) {
      process.stdout.write(`  ${row.ID.padEnd(34)} `);
      const res = await runCase(browser, row, frontUrl, outDir);
      results.push(res);
      const mark = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN", BLOCKED: "BLOCK" }[res.status];
      console.log(`${mark}  ${res.durationMs}ms  ${res.failedAssertion ?? res.notes ?? ""}`.slice(0, 160));
      if (results.filter((r) => r.status === "FAIL").length >= args.maxFailures) {
        console.log(`[layout] --max-failures reached, stopping`);
        break;
      }
    }
  } finally {
    if (!args.keepOpen) await browser.close();
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const warned = results.filter((r) => r.status === "WARN").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  const evaluated = passed + warned + failed;

  const payload = {
    suiteId,
    suiteName,
    runId: args.runId,
    runner: "layout-runner",
    browser: "playwright-chromium",
    environment: frontUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    totalCases: results.length,
    passed: passed + warned, // WARN is a pass for gating; the tier detail lives on the case
    warned,
    failed,
    blocked,
    skipped: 0,
    passRate: evaluated ? `${((passed + warned) / evaluated * 100).toFixed(1)}%` : "n/a",
    testCases: results,
    bugs: [],
    errors: [],
  };

  const outFile = join(outDir, `suite-${suiteId}-results.json`);
  writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");

  console.log(
    `\n[layout] ${passed} PASS · ${warned} WARN · ${failed} FAIL · ${blocked} BLOCKED  (${payload.passRate})`,
  );
  console.log(`[layout] → ${outFile.replace(/\\/g, "/")}`);
  if (blocked) console.log(`[layout] BLOCKED cases did not measure anything — treat as no-signal, not as pass.`);

  process.exit(failed > 0 ? 1 : evaluated === 0 ? 2 : 0);
}

await main();
