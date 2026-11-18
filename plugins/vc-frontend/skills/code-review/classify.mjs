#!/usr/bin/env node
// Risk tier of a branch's change in a vc-frontend checkout (upstream or a theme fork).
//
//   node classify.mjs [--base <ref>] [--json] [--no-graph]
//
// Run from anywhere inside the checkout; HEAD must be the branch under review. The diff is
// merge-base(<base>, HEAD)..HEAD, committed changes only. The module graph comes from the
// repository's own dependency-cruiser, so fan-out is what the bundler resolves, not a grep.
// Prints Markdown, or the full result as JSON with --json. Exit 0 on success, 2 on bad input.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TIERS = ["R0", "R1", "R2", "R3"];
const BIG_DIFF_LINES = 400;
const BIG_DIFF_FILES = 20;
const MAX_CONTAINED_CONSUMERS = 2;

// First match wins. A rule's tier is the floor for the file; fan-out can only raise it.
const ZONES = [
  // Agent instructions change how every later change is written and reviewed.
  { id: "agent-instructions", tier: 1, globs: [".claude/**", "**/CLAUDE.md", "**/AGENTS.md", "**/REVIEW.md"], reason: "agent instructions: they steer every later change" },
  { id: "tests", tier: 0, globs: ["**/*.test.ts", "**/*.test-d.ts", "**/*.spec.ts", "**/__snapshots__/**", "**/__mocks__/**"], reason: "tests only" },
  { id: "stories", tier: 0, globs: ["**/*.stories.ts", "**/*.stories.vue", ".storybook/**"], reason: "Storybook only" },
  { id: "docs", tier: 0, globs: ["**/*.md", "docs/**"], reason: "documentation" },
  { id: "locales", tier: 0, globs: ["**/locales/*.json"], reason: "translations" },
  { id: "assets", tier: 0, globs: ["**/*.{png,jpg,jpeg,webp,gif,ico,woff,woff2}"], reason: "binary asset" },
  { id: "generated", tier: 1, globs: ["**/api/graphql/types.ts"], reason: "generated from the GraphQL schema: review the operation or schema change, not this file" },

  { id: "ui-kit", tier: 3, globs: ["client-app/ui-kit/**"], reason: "ui-kit is public API: forks restyle it, plugins import it through core-api" },
  { id: "federation", tier: 3, globs: ["client-app/core-api/**", "client-app/core/federation/**", "vite.federation.*", "**/federation.mjs"], reason: "Module Federation facade or contract: every plugin depends on it" },
  { id: "commerce", tier: 3, globs: ["client-app/shared/{cart,checkout,payment}/**", "client-app/pages/checkout/**", "client-app/pages/cart.vue", "client-app/pages/account/order-payment.vue", "client-app/core/api/graphql/{cart,payment}/**", "client-app/modules/*/components/payment-processing-*"], reason: "cart, checkout or payment: money and orders" },
  { id: "add-to-cart", tier: 3, globs: ["**/quantity-control.vue", "**/add-to-cart*", "client-app/shared/catalog/components/configuration/**", "**/useConfigurableProduct*", "**/useProductVariationProperties*", "**/useQuantityValidationSchema*"], reason: "quantity, variation or configuration that decides what goes into the cart" },
  { id: "company", tier: 3, globs: ["client-app/shared/company/**", "client-app/core/api/graphql/organization/**"], reason: "B2B organization, members and roles" },
  { id: "auth", tier: 3, globs: ["client-app/core/plugins/{auth,permissions}.plugin.ts", "client-app/core/composables/useAuth*", "client-app/pages/auth/**", "client-app/shared/sign-in/**", "client-app/shared/account/composables/{useSignMeIn,useImpersonate}*", "client-app/pages/{sign-in,sign-up,reset-password,forgot-password,change-password,confirm-email,confirm-invitation}.vue"], reason: "authentication, impersonation and permissions" },
  { id: "context-switch", tier: 3, globs: ["client-app/shared/layout/components/{currency-selector,language-selector}/**", "client-app/shared/ship-to-location/**"], reason: "currency, language or ship-to switch: the cart and user state are rebuilt" },
  { id: "build", tier: 3, globs: ["package.json", "yarn.lock", ".yarnrc.yml", ".npmrc", "vite.config.*", "**/tsconfig*.json"], reason: "build or dependencies: every page ships through it" },
  { id: "ci", tier: 3, globs: [".github/**"], reason: "CI and repository automation" },

  { id: "core", tier: 2, globs: ["client-app/core/**"], reason: "core: every layer above uses it" },
  { id: "app-shell", tier: 2, globs: ["client-app/{main.ts,app-runner.ts,App.vue,i18n.ts,broadcast.ts,chunk-load-recovery.ts}", "client-app/router/**", "client-app/modules/*/index.ts", "client-app/modules/*/routes.ts"], reason: "bootstrap, routing or module registration" },
  { id: "catalog-search", tier: 2, globs: ["**/useProducts.ts", "**/useProductsFilters*", "client-app/shared/catalog/components/category.vue", "client-app/shared/layout/components/header/_internal/search-bar/**"], reason: "catalog search state: filters, facets, sort, paging, URL sync" },
  { id: "content", tier: 2, globs: ["client-app/pages/matcher/**", "client-app/plugins/**", "client-app/shared/static-content/**"], reason: "page content, slug resolution, Page Builder preview protocol" },
  { id: "styles", tier: 2, globs: ["client-app/assets/**/*.{scss,css}", "client-app/designs/**", "client-app/assets/presets/**", "tailwind.config.*", "postcss.config.*"], reason: "global styles, designs or presets" },
  { id: "config", tier: 2, globs: ["client-app/config/**"], reason: "store configuration defaults" },
];

// Added lines that put untrusted HTML, code or navigation on the page.
const HTML_INJECTION = /v-html|innerHTML|outerHTML|insertAdjacentHTML|DOMPurify|sanitiz|\beval\(|new Function\(|document\.write|returnUrl|postMessage|createObjectURL/;
// Mechanisms that broke repeatedly in this codebase's history, found in changed (added or removed) lines.
const CONTENT_SIGNALS = [
  { tier: 3, zone: "commerce", re: /registerPaymentProcessor|createOrderFromCart|initializePayment|initializeCartPayment|authorizePayment|setCardData(Valid|Invalid)/, reason: "payment lifecycle call" },
  { tier: 3, zone: "commerce", re: /queuedMutations|createQueueTarget|useMutationBatcher|optimisticResponse/, reason: "cart mutation ordering or optimistic update" },
  { tier: 2, re: /keyFields|typePolicies|fetchPolicy|awaitRefetchQueries|refetchQueries/, reason: "Apollo cache identity or refetch" },
  { tier: 2, re: /SUPPRESS_ERROR_NOTIFICATIONS_CONTEXT|single:\s*true|AbortReason/, reason: "error notification plumbing" },
  { tier: 2, re: /useLocalStorage|useSessionStorage|localStorage\.|sessionStorage\./, reason: "browser storage key or shape" },
  { tier: 2, re: /createGlobalState|createSharedComposable/, reason: "state shared beyond one component" },
];
const MODULE_IMPORT = /from\s+["']@\/modules\//;
const FIX_SUBJECT = /^(fix|hotfix|revert)\b|^Revert\b/i;
const FIX_WINDOW_DAYS = 365;
const EXTENSION_POINT = /useExtensionRegistry|extensionRegistry|registerBlock|EXTENSION_NAMES/;
const CODE_FILE = /\.(vue|ts|tsx|js|mjs|cjs)$/;
const TEST_LIKE = /\.(test|spec|stories)\.|\.test-d\.ts$|__mocks__\//;
// A changed line that is about presentation, outside a <style> block.
const STYLE_LINE = /(^|\s)(:?class|v-bind:class)=|\bclass:\s|@apply\b|--(vc|color)-[\w-]+|\btheme\(|@media\b|:deep\(|!important/;
const TOKEN_SOURCES = ["client-app/assets/**/*.{scss,css,json}", "client-app/designs/**", "client-app/ui-kit/**/*.{scss,css,vue}", "tailwind.config.*"];
const consumerCache = new Map();
const commitCache = new Map();

const args = parseArgs(process.argv.slice(2));
const root = git(["rev-parse", "--show-toplevel"]).trim();
process.chdir(root);

const baseRef = args.base ?? defaultBase();
const mergeBase = git(["merge-base", baseRef, "HEAD"]).trim();
const head = git(["rev-parse", "--short", "HEAD"]).trim();
const warnings = [];
if (git(["status", "--porcelain", "--untracked-files=no"]).trim()) {
  warnings.push("Uncommitted changes are not part of the classified diff, but the module graph reads the working tree.");
}

const files = changedFiles(mergeBase);
if (!files.length) fail(`No committed changes between ${baseRef} and HEAD.`);

const graph = args.noGraph ? null : moduleGraph();
if (!graph && !args.noGraph) warnings.push("dependency-cruiser did not run: fan-out and external exposure are unknown, tiers come from paths only.");

const facadeExports = graph ? facadeExportSet(graph) : new Set();
const rules = pathScopedRules();

for (const f of files) classifyFile(f);
for (const f of files) markStyling(f, mergeBase);
const questionSet = loadQuestions();
for (const f of files) f.questions = f.tier === 0 ? [] : questionSet.filter((q) => q.always || [f.path, ...f.addedText, ...f.deletedText].some((l) => q.re.test(l))).map((q) => q.id);
const tokens = tokenChanges();
const visual = visualCheck();

const codeFiles = files.filter((f) => f.tier >= 1 && f.zone !== "generated" && f.zone !== "build-version");
const changedLines = codeFiles.reduce((n, f) => n + f.added + f.deleted, 0);
let tier = Math.max(...files.map((f) => f.tier));
let escalation = null;
if (changedLines > BIG_DIFF_LINES || codeFiles.length > BIG_DIFF_FILES) {
  escalation = `big change: ${changedLines} changed lines in ${codeFiles.length} non-trivial files (limits ${BIG_DIFF_LINES} / ${BIG_DIFF_FILES}); big diffs get reviewed worse by models and by people`;
  tier = Math.min(3, tier + 1);
}

const zones = [...new Set(files.filter((f) => f.tier >= 2).map((f) => f.zone).filter(Boolean))];
const matchedRules = rules
  .map((r) => ({ file: r.file, files: files.filter((f) => f.tier >= 1 && r.globs.some((g) => globMatch(g, f.path))).map((f) => f.path) }))
  .filter((r) => r.files.length);
const lenses = suggestLenses();

const result = {
  base: baseRef,
  mergeBase: mergeBase.slice(0, 9),
  head,
  tier: TIERS[tier],
  escalation,
  changedLines,
  zones,
  files: files.map(({ tier: t, ...rest }) => ({ tier: TIERS[t], ...rest })),
  questions: [...new Set(files.flatMap((f) => f.questions))],
  tokens,
  visual,
  rules: matchedRules,
  lenses,
  warnings,
};

process.stdout.write(args.json ? JSON.stringify(result, null, 2) + "\n" : markdown(result));

// ---------------------------------------------------------------------------

function classifyFile(f) {
  f.reasons = [];
  f.consumers = [];
  f.external = [];

  const zone = f.path === "package.json" && versionOnly(f) ? { id: "build-version", tier: 0, reason: "package.json: version field only" } : ZONES.find((z) => z.globs.some((g) => globMatch(g, f.path)));
  f.zone = zone?.id ?? null;
  f.tier = zone ? zone.tier : 1;
  f.reasons.push(zone ? zone.reason : "no zone: tier from fan-out");

  if (f.zone === "locales" && f.deleted > f.added) {
    f.tier = Math.max(f.tier, 1);
    f.reasons.push("more lines removed than added: keys may be gone");
  }
  if (f.tier === 0) return;

  if (CODE_FILE.test(f.path) && f.addedText.some((l) => HTML_INJECTION.test(l))) {
    if (f.tier < 3) f.zone = "html-injection";
    f.tier = 3;
    f.reasons.push("adds HTML or script injection surface (v-html, innerHTML, sanitizer, eval)");
  }

  if (CODE_FILE.test(f.path)) {
    const changed = [...f.addedText, ...f.deletedText];
    for (const s of CONTENT_SIGNALS) {
      if (!changed.some((l) => s.re.test(l))) continue;
      f.reasons.push(s.reason);
      if (f.tier < s.tier) {
        f.tier = s.tier;
        if (s.zone && !f.zone) f.zone = s.zone;
      }
    }
    if (/^client-app\/(core|shared|pages)\//.test(f.path) && f.addedText.some((l) => MODULE_IMPORT.test(l))) {
      f.reasons.push("core, shared or page code imports a module directly");
      f.tier = Math.max(f.tier, 2);
    }
    const fix = rewrittenFix(f);
    if (fix) {
      f.reasons.push(`rewrites lines from a recent fix: ${fix}`);
      f.tier = Math.max(f.tier, 2);
    }
  }

  if (!graph || !CODE_FILE.test(f.path)) return;
  if (f.status === "D") {
    f.tier = Math.max(f.tier, 2);
    f.reasons.push("deleted module: anything outside this repo that imported it breaks");
    return;
  }

  const { consumers, barrels } = directConsumers(graph, f.path);
  f.consumers = consumers;
  if (facadeExports.has(f.path)) f.external.push("re-exported by core-api: Module Federation plugins import it");
  if (f.path.startsWith("client-app/ui-kit/")) f.external.push("ui-kit: registered globally, restyled by forks");
  if (barrels.length) f.external.push(`exported from ${barrels.join(", ")}: theme forks and modules import it`);
  if (f.path.startsWith("client-app/") && EXTENSION_POINT.test(readHead(f.path))) f.external.push("touches extension points: plugins register into them");

  // Zones that are wider than any single flow (core is read by checkout and by everything else) say
  // nothing more by reaching checkout; the walk is for page, shared and module code.
  const wide = ["core", "app-shell", "styles", "config", "ui-kit", "federation"].includes(f.zone);
  const critical = wide ? null : criticalReach(graph, f.path);
  if (critical) {
    f.reaches = critical;
    f.reasons.push(`used by the ${critical.zone} flow: ${critical.chain.join(" ← ")}`);
    if (f.tier < 2) f.tier = 2;
  }

  if (facadeExports.has(f.path)) {
    f.tier = 3;
    f.reasons.push("part of the plugin facade (@vc-frontend/core)");
  } else if (f.tier < 2 && (consumers.length > MAX_CONTAINED_CONSUMERS || barrels.length || f.external.length)) {
    f.tier = 2;
    f.reasons.push(consumers.length > MAX_CONTAINED_CONSUMERS ? `${consumers.length} direct consumers` : "visible outside its own folder");
  } else if (f.tier < 2) {
    f.reasons.push(consumers.length ? `contained: ${consumers.length} direct consumer(s)` : "no consumers in this repo");
  }
}

// Removed lines that a fix, hotfix or revert wrote within the year before HEAD. Fixes of fixes are about a
// tenth of all fixes here, in chains of four to six: code that was just repaired is fragile.
function rewrittenFix(f) {
  if (!f.deletedLines.length || f.status === "A") return null;
  const runs = [];
  for (const n of f.deletedLines) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  const shas = new Set();
  for (const [a, b] of runs.slice(0, 20)) {
    let out = "";
    try {
      out = git(["blame", "--porcelain", "-L", `${a},${b}`, mergeBase, "--", f.path]);
    } catch {
      continue;
    }
    for (const m of out.matchAll(/^([0-9a-f]{40}) \d+ \d+/gm)) shas.add(m[1]);
  }
  const now = Number(git(["log", "-1", "--format=%ct", "HEAD"]).trim());
  for (const sha of shas) {
    if (!commitCache.has(sha)) {
      const [subject, time] = git(["log", "-1", "--format=%s%x09%ct", sha]).trim().split("\t");
      commitCache.set(sha, { subject, time: Number(time) });
    }
    const c = commitCache.get(sha);
    if (FIX_SUBJECT.test(c.subject) && now - c.time < FIX_WINDOW_DAYS * 86400) return `${sha.slice(0, 9)} "${c.subject.slice(0, 70)}"`;
  }
  return null;
}

// --- risk questions -------------------------------------------------------------

// Questions and their `Signals:` regex, from this skill's risk-questions.md and, when the repository
// has one, its own .claude/review/risk-questions.md (same format). A signal only pre-selects a question.
function loadQuestions() {
  const sources = [path.join(path.dirname(fileURLToPath(import.meta.url)), "risk-questions.md"), ".claude/review/risk-questions.md"];
  const out = [];
  for (const src of sources) {
    if (!existsSync(src)) continue;
    const text = readFileSync(src, "utf8");
    for (const m of text.matchAll(/\*\*([A-Z0-9]+-\d+) \(([^)]+)\)\.\*\*[\s\S]*?\nSignals: (always|`([^`\n]+)`)/g)) {
      try {
        out.push({ id: m[1], floor: m[2], always: m[3] === "always", re: m[3] === "always" ? null : new RegExp(m[4]) });
      } catch {
        warnings.push(`bad Signals regex for ${m[1]} in ${src}`);
      }
    }
  }
  if (!out.length) warnings.push("no risk questions found: answer risk-questions.md in full");
  return out;
}

// --- styling ------------------------------------------------------------------

// A file "touches styling" when a changed line sits in a <style> block, a .scss/.css file, or a
// template class binding, or names a design token. Path zones cannot see this: most styling review
// happens on ordinary pages and components, not in ui-kit or assets/styles.
function markStyling(f, mb) {
  f.styling = 0;
  if (!/\.(vue|ts|tsx|js|mjs|cjs|scss|css)$/.test(f.path) || TEST_LIKE.test(f.path)) return;
  if (/\.(scss|css)$/.test(f.path)) {
    f.styling = f.added + f.deleted;
    return;
  }
  if (!f.path.endsWith(".vue")) {
    f.styling = [...f.addedText, ...f.deletedText].filter((l) => STYLE_LINE.test(l)).length;
    return;
  }
  const headRanges = styleRanges(readHead(f.path));
  const baseRanges = styleRanges(gitShow(`${mb}:${f.path}`));
  const inRange = (ranges, n) => ranges.some(([a, b]) => n >= a && n <= b);
  f.addedLines.forEach((n, i) => {
    if (inRange(headRanges, n) || STYLE_LINE.test(f.addedText[i])) f.styling++;
  });
  f.deletedLines.forEach((n, i) => {
    if (inRange(baseRanges, n) || STYLE_LINE.test(f.deletedText[i])) f.styling++;
  });
  if (f.styling) f.reasons.push(`${f.styling} styling line(s): classes, <style> or tokens`);
}

function styleRanges(text) {
  const ranges = [];
  const lines = text.split("\n");
  let start = null;
  lines.forEach((l, i) => {
    if (start === null && /^<style\b/.test(l)) start = i + 1;
    else if (start !== null && /^<\/style>/.test(l)) {
      ranges.push([start, i + 1]);
      start = null;
    }
  });
  return ranges;
}

// Design tokens defined or changed by the diff: `--vc-*` and `--color-*` custom properties in styles,
// preset keys (`color_primary_500` → `--color-primary-500`) and Tailwind scale tokens (`vcToken("radius-md")`).
// A removed token breaks every rule that reads it, in this repository, in forks and in plugins built on
// the core-api Tailwind preset; a changed value moves every screen that uses it.
function tokenChanges() {
  const defined = { added: new Map(), removed: new Map() };
  const note = (map, name, p) => map.set(name, [...new Set([...(map.get(name) ?? []), p])]);
  for (const f of files) {
    if (!TOKEN_SOURCES.some((g) => globMatch(g, f.path))) continue;
    for (const l of f.addedText) for (const t of tokenDefs(l, f.path)) note(defined.added, t, f.path);
    for (const l of f.deletedText) for (const t of tokenDefs(l, f.path)) note(defined.removed, t, f.path);
  }
  const names = [...new Set([...defined.added.keys(), ...defined.removed.keys()])].sort();
  const out = names.map((name) => {
    const a = defined.added.has(name);
    const r = defined.removed.has(name);
    const change = a && r ? "changed" : a ? "added" : stillDefined(name) ? "changed" : "removed";
    return { name, change, definedIn: [...new Set([...(defined.added.get(name) ?? []), ...(defined.removed.get(name) ?? [])])] };
  });
  const detail = out.filter((t) => t.change !== "added").slice(0, 40);
  for (const t of detail) {
    const used = tokenUsers(t.name);
    t.users = used.files.length;
    t.uiKitUsers = used.files.filter((p) => p.startsWith("client-app/ui-kit/")).map((p) => p.replace(/^client-app\/ui-kit\/components\//, ""));
    t.tailwind = used.tailwind;
  }
  for (const t of out) {
    if (t.change === "added") continue;
    for (const p of t.definedIn) {
      const f = files.find((x) => x.path === p);
      if (!f) continue;
      if (t.change === "removed" && f.tier < 3) {
        f.tier = 3;
        f.reasons.push(`removes token ${t.name}${t.users ? ` still read by ${t.users} file(s)` : ""}; forks and plugins may read it too`);
      } else if (f.tier < 2) {
        f.tier = 2;
        f.reasons.push(`changes token ${t.name}`);
      }
    }
  }
  return out;
}

function tokenDefs(line, p) {
  const out = [...line.matchAll(/(--(?:vc|color)-[\w-]+)\s*:/g)].map((m) => m[1]);
  if (p.endsWith(".json")) out.push(...[...line.matchAll(/"(color_\w+)"\s*:/g)].map((m) => "--" + m[1].replace(/_/g, "-")));
  if (/tailwind\.config/.test(p)) out.push(...[...line.matchAll(/vcToken\(\s*["']([\w-]+)["']/g)].map((m) => "--vc-" + m[1]));
  return out;
}

function stillDefined(name) {
  const json = name.startsWith("--color-") ? `|"${name.slice(2).replace(/-/g, "_")}"\\s*:` : "";
  return gitGrep([], "", [], `${escapeRe(name)}\\s*:${json}`).length > 0;
}

// Files that read a token: `var(--x` anywhere, plus Tailwind utilities for preset colours
// (`--color-primary-500` → `bg-primary-500`, `text-primary-500` …). Scale tokens wired through
// tailwind.config are read by every matching utility class, which no grep can count.
function tokenUsers(name) {
  const patterns = [`var\\(${escapeRe(name)}\\b`];
  if (name.startsWith("--color-")) patterns.push(`\\b(bg|text|border|fill|stroke|ring|outline|from|via|to|divide|placeholder|accent|caret|decoration|shadow)-${escapeRe(name.slice(8))}\\b`);
  const users = gitGrep([], "", [], patterns.join("|")).filter((p) => p.startsWith("client-app/") && !TEST_LIKE.test(p));
  const tailwind = existsSync("tailwind.config.ts") && new RegExp(escapeRe(name.replace(/^--vc-/, ""))).test(readHead("tailwind.config.ts"));
  return { files: users, tailwind: Boolean(tailwind && name.startsWith("--vc-")) };
}

// A pixel check is worth its minutes when the change can move what many screens look like.
function visualCheck() {
  const why = [];
  const tokenMoves = tokens.filter((t) => t.change !== "added");
  if (tokenMoves.length) why.push(`${tokenMoves.length} design token(s) changed or removed`);
  const global = files.filter((f) => f.tier >= 1 && ["styles", "build"].includes(f.zone));
  if (global.length) why.push(`global styles, presets, designs or build config: ${global.map((f) => f.path).slice(0, 3).join(", ")}`);
  const kit = files.filter((f) => f.zone === "ui-kit" && f.styling);
  if (kit.length) why.push(`${kit.length} ui-kit file(s) with styling changes: every screen that renders them`);
  return {
    recommended: why.length > 0,
    why,
    command: `node "\${CLAUDE_PLUGIN_ROOT}/visual/affected.mjs" --repo . --base ${mergeBase.slice(0, 12)}`,
  };
}

function suggestLenses() {
  const nonTrivial = files.filter((f) => f.tier >= 1);
  const touched = (id) => files.some((f) => f.zone === id || f.reaches?.zone === id);
  const out = [];
  const add = (id, on, why) => out.push({ id, recommended: Boolean(on), why });

  add("correctness", nonTrivial.length, "bugs, broken UI states, races, edge cases in the changed lines");
  const exposed = files.filter((f) => f.consumers.length || f.external.length);
  add("consumers", tier >= 2 && exposed.length, exposed.length ? `${exposed.length} changed file(s) have consumers or are visible outside the repo` : "no file with consumers");
  const added = files.filter((f) => f.status === "A" && CODE_FILE.test(f.path) && f.tier >= 1);
  add("architecture", tier >= 2 || added.length, added.length ? `${added.length} new code file(s): is each in the right layer and folder` : "layer boundaries and patterns others will copy");
  const addedCode = nonTrivial.filter((f) => CODE_FILE.test(f.path)).reduce((n, f) => n + f.added, 0);
  add("design", tier >= 2 && addedCode >= 80, `${addedCode} added code lines: responsibilities, coupling, reuse instead of duplication`);
  add("conventions", matchedRules.length && nonTrivial.length, matchedRules.length ? `${matchedRules.length} path-scoped rule file(s) apply` : "no path-scoped rules match");
  add("security", files.some((f) => ["html-injection", "federation", "ci"].includes(f.zone)) || touched("auth") || touched("company") || touched("commerce") || touched("content"), "auth, permissions, untrusted HTML, payment, CI or the plugin boundary");
  add("commerce", touched("commerce") || touched("add-to-cart") || touched("context-switch"), "money, cart state, checkout steps, what goes into the cart");
  const styled = files.filter((f) => f.styling);
  add("styles", styled.length || tokens.length || touched("styles"), styled.length ? `${styled.length} file(s) change classes, <style> blocks or tokens${tokens.length ? `; ${tokens.length} token(s)` : ""}` : "design-system conformity: BEM, tokens, Tailwind, designs, presets, dark mode");
  const kitFiles = files.filter((f) => f.zone === "ui-kit" && f.tier >= 1);
  add("ui-kit", kitFiles.length, kitFiles.length ? `${kitFiles.length} ui-kit file(s): public API for forks and plugins` : "no ui-kit file changed");
  const templates = files.filter((f) => f.path.endsWith(".vue") && f.tier >= 1 && f.added + f.deleted > f.styling);
  add("ui", templates.length || files.some((f) => f.zone === "locales"), "accessibility and i18n of changed templates and messages");
  add("tests", files.some((f) => f.zone === "tests"), "weakened or deleted assertions, tests rewritten to fit new behaviour");
  add("clean-code", false, "naming, dead code, complexity beyond the written rules; noisy, on request only");
  add("performance", false, "Apollo queries and cache, reactivity, bundle size; on request");
  return out;
}

// --- module graph -----------------------------------------------------------

function moduleGraph() {
  if (!existsSync(".dependency-cruiser.cjs") && !existsSync(".dependency-cruiser.js")) return null;
  const config = existsSync(".dependency-cruiser.cjs") ? ".dependency-cruiser.cjs" : ".dependency-cruiser.js";
  let out;
  try {
    // tsPreCompilationDeps: count `import type` too; the facade exports many types.
    out = execFileSync("npx", ["--no-install", "depcruise", "client-app", "--config", config, "--output-type", "json", "--ts-pre-compilation-deps"], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    warnings.push(`dependency-cruiser failed: ${String(e.stderr || e.message).split("\n")[0]}`);
    return null;
  }
  const modules = JSON.parse(out).modules;
  const deps = new Map();
  const rev = new Map();
  for (const m of modules) {
    const targets = m.dependencies.map((d) => d.resolved).filter((r) => r.startsWith("client-app/"));
    deps.set(m.source, targets);
    for (const t of targets) {
      if (!rev.has(t)) rev.set(t, new Set());
      rev.get(t).add(m.source);
    }
  }
  return { deps, rev };
}

function isBarrel(p) {
  return /(^|\/)index\.(ts|js|mjs)$/.test(p);
}

// Direct consumers, looking through barrel files. A module that imports the barrel counts only if it
// names something this file exports: a barrel import alone says nothing about which export is used.
// ui-kit components are registered globally, so templates use their tag without any import.
function consumersThroughBarrels(g, file) {
  if (consumerCache.has(file)) return consumerCache.get(file);
  const names = exportedNames(file);
  const usesName = (c) => names.length > 0 && new RegExp(`(^|[^\\w-])(${names.map(escapeRe).join("|")})([^\\w-]|$)`).test(readHead(c));
  const consumers = new Set();
  const barrels = new Set();
  const seen = new Set([file]);
  const queue = [...(g.rev.get(file) ?? [])].map((c) => ({ c, viaBarrel: false }));
  while (queue.length) {
    const { c, viaBarrel } = queue.shift();
    if (seen.has(c)) continue;
    seen.add(c);
    if (TEST_LIKE.test(c)) continue;
    if (isBarrel(c) && !c.startsWith("client-app/core-api/")) {
      barrels.add(c);
      queue.push(...[...(g.rev.get(c) ?? [])].map((x) => ({ c: x, viaBarrel: true })));
      continue;
    }
    if (!viaBarrel || usesName(c)) consumers.add(c);
  }
  const result = { consumers: [...consumers].sort(), barrels: [...barrels] };
  consumerCache.set(file, result);
  return result;
}

function realConsumers(g, file) {
  return consumersThroughBarrels(g, file).consumers;
}

function directConsumers(g, file) {
  const { consumers: found, barrels } = consumersThroughBarrels(g, file);
  const consumers = new Set(found);
  const names = exportedNames(file);
  if (file.startsWith("client-app/ui-kit/") && file.endsWith(".vue") && names.length) {
    for (const c of gitGrep(names, "client-app", ["*.vue"])) if (c !== file && !TEST_LIKE.test(c)) consumers.add(c);
  }
  return { consumers: [...consumers].sort(), barrels: barrels.filter((b) => /^client-app\/(shared|modules|core)\/[^/]+\/index\.ts$/.test(b)).sort() };
}

// A file outside the critical zones that a critical flow still renders or calls — the address form
// inside checkout's shipping step. Walks importers upward and stops at the app shell (router, bootstrap,
// module registration), which imports everything and would make every file "critical".
function criticalReach(g, file) {
  const criticalIds = ["commerce", "add-to-cart", "company", "auth", "context-switch"];
  const zoneOf = (p) => ZONES.find((z) => z.globs.some((gl) => globMatch(gl, p)));
  const own = zoneOf(file);
  if (own && criticalIds.includes(own.id)) return null;
  const hub = /^client-app\/(router\/|main\.ts$|app-runner\.ts$|App\.vue$|modules\/[^/]+\/index\.ts$|core-api\/)/;
  const parent = new Map([[file, null]]);
  const queue = [file];
  while (queue.length) {
    const m = queue.shift();
    for (const c of realConsumers(g, m)) {
      if (parent.has(c) || TEST_LIKE.test(c) || hub.test(c)) continue;
      parent.set(c, m);
      const z = zoneOf(c);
      if (z && criticalIds.includes(z.id)) {
        const chain = [];
        for (let x = c; x; x = parent.get(x)) chain.push(x.replace(/^client-app\//, ""));
        chain.reverse();
        return { zone: z.id, chain: chain.length > 5 ? [chain[0], "…", ...chain.slice(-3)] : chain };
      }
      queue.push(c);
    }
  }
  return null;
}

// What a module exports, as consumers would write it: `vc-popover.vue` → VcPopover and vc-popover;
// a .ts module → its exported declarations and export lists.
function exportedNames(file) {
  const base = path.basename(file).replace(/\.(vue|ts|tsx|js|mjs)$/, "");
  if (file.endsWith(".vue")) {
    const pascal = base.replace(/(^|-)(\w)/g, (_, __, ch) => ch.toUpperCase());
    return [...new Set([pascal, base])];
  }
  const text = readHead(file);
  const names = new Set();
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function\*?|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of text.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, "").trim();
      if (name && name !== "default") names.add(name);
    }
  }
  return [...names];
}

// Files matching a pattern: the word form `(<|\b)(A|B)\b` for component names, or a raw regex.
function gitGrep(words, dir, globs, raw) {
  const pattern = raw ?? `(<|\\b)(${words.map(escapeRe).join("|")})\\b`;
  const scope = globs.length ? globs.map((g) => `${dir}/**/${g}`) : ["."];
  try {
    const out = execFileSync("git", ["grep", "-l", "-E", pattern, "--", ...scope], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// Files the plugin facade re-exports. Through a barrel only the files whose exports the facade names
// count: `export { VcPopover } from "@/ui-kit/components/molecules"` exposes vc-popover.vue, not every molecule.
function facadeExportSet(g) {
  const entries = [...g.deps.keys()].filter((m) => /^client-app\/core-api\/[^/]+\.ts$/.test(m));
  const facadeText = entries.map(readHead).join("\n");
  const named = (m) => exportedNames(m).some((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(facadeText));
  const out = new Set();
  const queue = entries.flatMap((m) => g.deps.get(m)).map((m) => ({ m, viaBarrel: false }));
  const seen = new Set();
  while (queue.length) {
    const { m, viaBarrel } = queue.shift();
    if (seen.has(m)) continue;
    seen.add(m);
    if (m.startsWith("client-app/core-api/")) continue;
    if (isBarrel(m)) queue.push(...(g.deps.get(m) ?? []).map((x) => ({ m: x, viaBarrel: true })));
    else if (!viaBarrel || named(m)) out.add(m);
  }
  return out;
}

// --- git ---------------------------------------------------------------------

function changedFiles(mb) {
  const byPath = new Map();
  for (const line of git(["diff", "--name-status", "--no-renames", mb, "HEAD"]).split("\n").filter(Boolean)) {
    const [status, p] = line.split("\t");
    byPath.set(p, { path: p, status: status[0], added: 0, deleted: 0, addedText: [], deletedText: [], addedLines: [], deletedLines: [] });
  }
  for (const line of git(["diff", "--numstat", "--no-renames", mb, "HEAD"]).split("\n").filter(Boolean)) {
    const [a, d, p] = line.split("\t");
    const f = byPath.get(p);
    if (f) Object.assign(f, { added: a === "-" ? 0 : Number(a), deleted: d === "-" ? 0 : Number(d) });
  }
  let current = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of git(["diff", "--no-renames", "-U0", mb, "HEAD"]).split("\n")) {
    if (line.startsWith("diff --git ")) current = byPath.get(line.split(" b/").pop()) ?? null;
    else if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    else if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (m) [oldLine, newLine] = [Number(m[1]), Number(m[2])];
    } else if (current && line.startsWith("+")) {
      current.addedText.push(line.slice(1));
      current.addedLines.push(newLine++);
    } else if (current && line.startsWith("-")) {
      current.deletedText.push(line.slice(1));
      current.deletedLines.push(oldLine++);
    }
  }
  return [...byPath.values()];
}

function versionOnly(f) {
  const changed = [...f.addedText, ...f.deletedText].filter((l) => l.trim());
  return changed.length > 0 && changed.every((l) => /^\s*"version"\s*:/.test(l));
}

function gitShow(spec) {
  try {
    return git(["show", spec]);
  } catch {
    return "";
  }
}

function readHead(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function defaultBase() {
  for (const ref of ["origin/dev", "origin/main", "origin/master"]) {
    try {
      git(["rev-parse", "--verify", "--quiet", ref]);
      return ref;
    } catch {
      /* try the next one */
    }
  }
  fail("No --base given and none of origin/dev, origin/main, origin/master exists.");
}

function git(argv) {
  return execFileSync("git", argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

// --- path-scoped rules ---------------------------------------------------------

function pathScopedRules() {
  const dir = ".claude/rules";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .map((n) => {
      const text = readFileSync(path.join(dir, n), "utf8");
      const fm = text.match(/^---\n([\s\S]*?)\n---/);
      const globs = fm ? [...fm[1].matchAll(/^\s*-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1]) : [];
      return { file: path.join(dir, n), globs: globs.length ? globs : ["**"] };
    });
}

// --- globs --------------------------------------------------------------------

function globMatch(glob, p) {
  return globToRegExp(glob).test(p);
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      re += "(?:" + glob.slice(i + 1, end).split(",").map(escapeRe).join("|") + ")";
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp("^" + re + "$");
}

function escapeRe(s) {
  return s.replace(/[.+^$()|[\]\\]/g, "\\$&");
}

// --- output ---------------------------------------------------------------------

function markdown(r) {
  const lines = [];
  lines.push(`# Risk ${r.tier} — ${r.head} against ${r.base} (merge-base ${r.mergeBase})`, "");
  if (r.escalation) lines.push(`Raised one tier: ${r.escalation}.`, "");
  for (const w of r.warnings) lines.push(`> ${w}`);
  if (r.warnings.length) lines.push("");
  lines.push("| Tier | File | Why | Consumers | Visible outside |", "|---|---|---|---|---|");
  const sorted = [...r.files].sort((a, b) => b.tier.localeCompare(a.tier) || a.path.localeCompare(b.path));
  for (const f of sorted) {
    const consumers = f.consumers.length ? `${f.consumers.length}: ${f.consumers.slice(0, 4).map((c) => "`" + c + "`").join(", ")}${f.consumers.length > 4 ? ", …" : ""}` : "—";
    lines.push(`| ${f.tier} | \`${f.path}\` (${f.status}, +${f.added}/−${f.deleted}) | ${f.reasons.join("; ")} | ${consumers} | ${f.external.join("; ") || "—"} |`);
  }
  if (r.questions.length) {
    lines.push("", "## Risk questions matched", "");
    for (const f of sorted) if (f.questions?.length) lines.push(`- \`${f.path}\`: ${f.questions.join(", ")}`);
  }
  lines.push("", "## Lenses", "");
  for (const l of r.lenses) lines.push(`- [${l.recommended ? "x" : " "}] **${l.id}** — ${l.why}`);
  if (r.rules.length) {
    lines.push("", "## Path-scoped rules that apply", "");
    for (const rule of r.rules) lines.push(`- \`${rule.file}\`: ${rule.files.length} file(s)`);
  }
  return lines.join("\n") + "\n";
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") out.base = argv[++i];
    else if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--no-graph") out.noGraph = true;
    else fail(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

function fail(msg) {
  process.stderr.write(msg + "\n");
  process.exit(2);
}
