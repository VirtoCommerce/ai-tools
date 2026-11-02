#!/usr/bin/env node
/**
 * Derive the storefront PAGE INVENTORY from vc-frontend's router, instead of hand-picking pages.
 *
 * WHY THIS EXISTS — measured, not hypothetical
 * -------------------------------------------
 * VCST-6232 (vc-frontend PR #2600, a shape/typography token change) was checked on six pages the
 * orchestrator picked from round 1's prior art. Search, the checkout steps, most account pages,
 * the auth pages, B2B, 404 and every overlay were missing until the operator noticed and widened
 * the set by hand. A global change has the whole storefront as its blast radius, and "the whole
 * storefront" has a source of truth: `client-app/router/routes/*.ts`. GOLDEN RULE
 * (`.claude/rules/test-data.md`): read it from there.
 *
 * TWO FILES, TWO KINDS OF FACT
 *   config/storefront-pages.generated.json   DERIVED: every routed page — path, name, access
 *                                             (from `meta.requiresAuth` / `requiresOrganization` /
 *                                             `public`, inherited), route params, guard, layout.
 *   config/storefront-pages.curation.json    DECLARED: what no router knows — tier (`core` |
 *                                             `extended`), which session(s) to visit, the fixture a
 *                                             param needs, concrete visits of the catch-all route
 *                                             (home, a Builder page), and known overlays.
 * The generated file merges both. A route with no curation entry is `extended` with derived
 * defaults; a curation entry whose route is gone FAILS the check — it is a page we would claim to
 * test that no longer exists.
 *
 * USAGE
 *   npm run pages:sync                       # clone vc-frontend@dev, rewrite the generated file
 *   npm run pages:sync -- --from ../vc-frontend
 *   npm run pages:check                      # drift gate (routes + curation consistency)
 *   npm run pages:targets -- --out <targets.json> [--tier core|all] [--auth anonymous|signed-in|corporate]
 *                            [--param name=value ...]   # a /qa-visual-regression --pages file
 *   --ref <ref>   git ref to read (default: dev)
 *
 * EXIT CODES
 *   0  in sync / written
 *   1  drift (check), or a curation entry names a route that does not exist, or a route the reader
 *      could not resolve, or a target needs a param that was not supplied
 *   2  could not reach a source (network/checkout) — advisory, NEVER a silent pass
 */

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const OUT_FILE = join(REPO_ROOT, "config", "storefront-pages.generated.json");
const CURATION_FILE = join(REPO_ROOT, "config", "storefront-pages.curation.json");

const REPO = "VirtoCommerce/vc-frontend";
const ROUTES_DIR = "client-app/router/routes";
/** The array the app mounts; every other route array is reached from it by spread or `children`. */
const ROOT_ARRAY = "mainRoutes";

const args = process.argv.slice(2);
const MODE = args.includes("--check") ? "check" : args.includes("--targets") ? "targets" : "sync";
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
function argValues(flag) {
  return args.flatMap((a, i) => (a === flag && i + 1 < args.length ? [args[i + 1]] : []));
}
const FROM = argValue("--from");
const REF = argValue("--ref") ?? "dev";

function loadSource() {
  if (FROM) {
    const root = resolve(FROM);
    if (!existsSync(join(root, ROUTES_DIR))) throw new Error(`--from checkout has no ${ROUTES_DIR}/: ${root}`);
    let commit = "(local checkout)";
    try {
      commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      /* a plain directory with no git metadata is still a usable source */
    }
    return { root, commit, cleanup: () => {} };
  }
  const dir = mkdtempSync(join(tmpdir(), "vc-frontend-routes-"));
  execFileSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", "--branch", REF,
    `https://github.com/${REPO}.git`, dir], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "sparse-checkout", "init", "--cone"], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "sparse-checkout", "set", ROUTES_DIR], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "checkout"], { stdio: "pipe" });
  const commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { root: dir, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// A small literal reader — enough for route tables, never an evaluator
// ---------------------------------------------------------------------------

/** Index just past the bracket that closes the one at `start`; skips strings, templates, comments. */
function matchClose(src, start) {
  const open = src[start];
  const close = { "{": "}", "[": "]", "(": ")" }[open];
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i); if (e < 0) break; i = e + 1; continue; }
    if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
  }
  throw new Error(`unbalanced ${open} at ${start}`);
}
function skipString(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (q === "`" && src[j] === "$" && src[j + 1] === "{") { j = matchClose(src, j + 1) - 1; continue; }
    if (src[j] === q) return j;
  }
  return src.length;
}
/** Split the inside of `[...]` or `{...}` on top-level commas. */
function splitTop(body) {
  const parts = [];
  let last = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "/" && body[i + 1] === "/") { i = body.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && body[i + 1] === "*") { const e = body.indexOf("*/", i); if (e < 0) break; i = e + 1; continue; }
    if (c === '"' || c === "'" || c === "`") { i = skipString(body, i); continue; }
    if (c === "{" || c === "[" || c === "(") { i = matchClose(body, i) - 1; continue; }
    if (c === ",") { parts.push(body.slice(last, i)); last = i + 1; }
  }
  parts.push(body.slice(last));
  return parts.map((p) => p.replace(/^(?:\s*(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))+/, "").trim()).filter(Boolean);
}
/** `{ a: 1, b() {...}, async c(x) {...} }` → { a: "1", b: "<fn>", c: "<fn>" } (raw value text). */
function readObject(text) {
  const out = {};
  for (const prop of splitTop(text.trim().slice(1, -1))) {
    const kv = /^(?:async\s+)?(\w+)\s*(:|\()/.exec(prop);
    if (!kv) continue;
    out[kv[1]] = kv[2] === ":" ? prop.slice(kv[0].length).trim() : "<fn>";
  }
  return out;
}

export function extractRoutes(files) {
  const all = files.map((f) => f.text).join("\n");
  const constants = {};
  for (const m of all.matchAll(/(\w+):\s*\{\s*NAME:\s*"([^"]+)",(?:\s*PATH:\s*"([^"]+)",)?/g)) {
    constants[m[1]] = { NAME: m[2], PATH: m[3] };
  }
  const arrays = {};
  for (const f of files) {
    for (const m of f.text.matchAll(/export const (\w+)\s*:\s*RouteRecordRaw\[\]\s*=\s*\[/g)) {
      const start = m.index + m[0].length - 1;
      arrays[m[1]] = { text: f.text.slice(start, matchClose(f.text, start)), file: f.rel };
    }
  }
  if (!arrays[ROOT_ARRAY]) throw new Error(`no \`export const ${ROOT_ARRAY}: RouteRecordRaw[]\` under ${ROUTES_DIR}`);

  const value = (raw) => {
    if (raw == null) return null;
    let m = /^["'](.*)["']$/.exec(raw);
    if (m) return m[1];
    m = /^ROUTES\.(\w+)\.(NAME|PATH)$/.exec(raw);
    if (m) return constants[m[1]]?.[m[2]] ?? null;
    m = /^`(.*)`$/.exec(raw);
    if (m) return m[1].replace(/\$\{ROUTES\.(\w+)\.(NAME|PATH)\}/g, (_, k, f) => constants[k]?.[f] ?? `{${k}}`);
    return null;
  };
  const join2 = (parent, p) => (p.startsWith("/") ? p : p === "" ? parent : `${parent.replace(/\/$/, "")}/${p}`);

  const pages = [];
  const reached = new Set();
  const unresolved = [];
  const walkArray = (name, parent) => {
    const arr = arrays[name];
    if (!arr) { unresolved.push(`array ${name}`); return; }
    reached.add(name);
    for (const el of splitTop(arr.text.slice(1, -1))) {
      if (el.startsWith("...")) { walkArray(el.slice(3).trim(), parent); continue; }
      if (!el.startsWith("{")) { unresolved.push(`${arr.file}: ${el.slice(0, 60)}`); continue; }
      walkRecord(readObject(el), parent, arr.file);
    }
  };
  const walkRecord = (o, parent, file) => {
    const path = value(o.path);
    if (path == null) { unresolved.push(`${file}: path ${o.path}`); return; }
    const full = join2(parent.path, path);
    const meta = o.meta ? o.meta : "";
    // vue-router merges meta parent → child, so a child's explicit true/false overrides the inherited value
    const flag = (k, inherited) =>
      new RegExp(`\\b${k}\\s*:\\s*true`).test(meta) ? true : new RegExp(`\\b${k}\\s*:\\s*false`).test(meta) ? false : inherited;
    const layout = /layout\s*:\s*"(\w+)"/.exec(meta)?.[1] ?? parent.layout;
    const ctx = {
      path: full,
      requiresAuth: flag("requiresAuth", parent.requiresAuth),
      requiresOrganization: flag("requiresOrganization", parent.requiresOrganization),
      public: flag("public", parent.public),
      layout,
      guarded: parent.guarded || o.beforeEnter !== undefined,
    };
    const name = value(o.name);
    if (name && o.component && !o.redirect) {
      pages.push({
        name,
        path: full,
        file,
        // the sign-in guard is `!meta.public && (meta.requiresAuth || !anonymousUsersAllowed)`: public wins over requiresAuth
        access: ctx.requiresOrganization ? "organization" : ctx.public ? "public" : ctx.requiresAuth ? "signed-in" : "store-setting",
        params: [...full.matchAll(/:(\w+)/g)].map((m) => m[1]),
        catchAll: /\(\.\*\)/.test(full),
        guarded: ctx.guarded,
        ...(layout ? { layout } : {}),
      });
    }
    if (o.children) {
      if (o.children.startsWith("[")) {
        for (const el of splitTop(o.children.slice(1, -1))) walkRecord(readObject(el), ctx, file);
      } else {
        walkArray(o.children, ctx);
      }
    }
  };
  walkArray(ROOT_ARRAY, { path: "", requiresAuth: false, requiresOrganization: false, public: false, guarded: false });
  const unreached = Object.keys(arrays).filter((a) => !reached.has(a));
  return { pages, unresolved, unreached };
}

// ---------------------------------------------------------------------------
// Merge with curation
// ---------------------------------------------------------------------------

/** signed-in = a personal account (a corporate member is redirected off some account pages); corporate = an organization member. */
const DEFAULT_AUTH = { public: ["anonymous"], "store-setting": ["anonymous"], "signed-in": ["signed-in"], organization: ["corporate"] };

function merge(pages, curation) {
  const byName = new Map(pages.map((p) => [p.name, p]));
  const errors = Object.keys(curation.pages).filter((n) => !byName.has(n))
    .map((n) => `curation names route "${n}", which the router no longer has`);
  const merged = pages.map((p) => {
    const c = curation.pages[p.name] ?? {};
    const auth = c.auth ?? DEFAULT_AUTH[p.access];
    const visits = (c.visits ?? [{ id: p.name, path: p.path }]).map((v) => ({ auth, ...v }));
    // an uncurated route lands `extended` as is; its params are asked for only when a run targets it
    for (const v of curation.pages[p.name] ? visits : []) {
      for (const prm of [...v.path.matchAll(/:(\w+)\??/g)].map((m) => m[0]).filter((x) => !x.endsWith("?"))) {
        const key = prm.slice(1);
        if (!(c.fixtures ?? {})[key]) errors.push(`${p.name}: visit ${v.id} needs a fixture for :${key} (curation "fixtures")`);
      }
    }
    return {
      ...p,
      tier: c.tier ?? "extended",
      curated: Boolean(curation.pages[p.name]),
      visits,
      ...(c.fixtures ? { fixtures: c.fixtures } : {}),
      overlays: c.overlays ?? [],
      ...(c.note ? { note: c.note } : {}),
    };
  });
  return { merged, errors };
}

function render(merged, meta) {
  const tiers = { core: merged.filter((p) => p.tier === "core").length, extended: merged.filter((p) => p.tier === "extended").length };
  return JSON.stringify({
    $comment: "GENERATED by scripts/maintenance/sync-storefront-pages.mjs from vc-frontend client-app/router/routes + config/storefront-pages.curation.json. Do not edit — edit the curation file and run `npm run pages:sync`.",
    source: meta.sourcedFrom,
    commit: meta.commit,
    counts: { pages: merged.length, ...tiers },
    pages: merged,
  }, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// targets.json for /qa-visual-regression --pages
// ---------------------------------------------------------------------------

function emitTargets(inventory) {
  const out = argValue("--out");
  if (!out) { console.error("[pages:targets] --out <targets.json> is required"); process.exit(1); }
  const tier = argValue("--tier") ?? "core";
  const auth = argValue("--auth") ?? "anonymous";
  const params = Object.fromEntries(argValues("--param").map((kv) => kv.split(/=(.*)/s).slice(0, 2)));
  const missing = new Set();
  const targets = [];
  const needsSetup = [];
  for (const p of inventory.pages) {
    if (tier !== "all" && p.tier !== tier) continue;
    for (const v of p.visits) {
      if (!v.auth.includes(auth)) continue;
      // a direct goto cannot reach it (a guard redirects); a screenshot would be of the redirect target
      if (v.setup) { needsSetup.push(`${v.id} (${v.setup})`); continue; }
      const path = v.path
        .replace(/\/:(\w+)\?/g, (_, k) => (params[k] ? `/${params[k]}` : ""))
        .replace(/:(\w+)|\{(\w+)\}/g, (m, a, b) => params[a ?? b] ?? (missing.add(`${a ?? b} (${v.id})`), m));
      targets.push({ name: `${auth}-${v.id}`, path, group: p.name, ...(v.waitFor ? { waitFor: v.waitFor } : {}) });
    }
  }
  if (missing.size) {
    console.error(`[pages:targets] FAIL — supply --param for: ${[...missing].join(", ")}`);
    console.error(`[pages:targets] Each param's fixture is in config/storefront-pages.generated.json (pages[].fixtures).`);
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify({ targets }, null, 2) + "\n");
  console.log(`[pages:targets] ${targets.length} target(s), tier ${tier}, ${auth} → ${out}`);
  if (needsSetup.length) {
    console.log(`[pages:targets] NOT in targets — needs setup PIXEL cannot do; cover on a browser lane or WAIVE: ${needsSetup.join("; ")}`);
  }
  if (auth !== "anonymous") console.log(`[pages:targets] ${auth} targets need \`visual:snap --storage-state <file>\` of ${auth === "corporate" ? "an organization member" : "a personal account"}.`);
  process.exit(0);
}

function main() {
  if (MODE === "targets") {
    if (!existsSync(OUT_FILE)) { console.error("[pages:targets] run `npm run pages:sync` first"); process.exit(1); }
    emitTargets(JSON.parse(readFileSync(OUT_FILE, "utf8")));
  }
  const sourcedFrom = FROM ? `local checkout ${resolve(FROM)}` : `https://github.com/${REPO}@${REF}`;
  let extracted, commit, cleanup = () => {};
  try {
    const src = loadSource();
    ({ commit, cleanup } = src);
    const dir = join(src.root, ROUTES_DIR);
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => ({ rel: `${ROUTES_DIR}/${f}`, text: readFileSync(join(dir, f), "utf8") }));
    extracted = extractRoutes(files);
  } catch (err) {
    cleanup();
    console.error(`[pages:${MODE}] CANNOT REACH SOURCE — ${err.message}`);
    console.error(`[pages:${MODE}] This is advisory, not a pass. Re-run with network, or --from ../vc-frontend`);
    process.exit(2);
  }
  cleanup();

  const curation = JSON.parse(readFileSync(CURATION_FILE, "utf8"));
  const { merged, errors } = merge(extracted.pages, curation);
  const next = render(merged, { sourcedFrom, commit });
  const core = merged.filter((p) => p.tier === "core").length;

  console.log(`[pages:${MODE}] source     : ${sourcedFrom} @ ${commit.slice(0, 12)}`);
  console.log(`[pages:${MODE}] routes     : ${merged.length} (core ${core}, extended ${merged.length - core}, uncurated ${merged.filter((p) => !p.curated).length})`);
  // a route the reader could not resolve is a page silently missing from the inventory — never a pass
  for (const u of extracted.unresolved) errors.push(`unresolved route: ${u} — extend the reader`);
  for (const a of extracted.unreached) errors.push(`array ${a} is not mounted from ${ROOT_ARRAY} — extend the reader or confirm it is dead`);
  if (errors.length) {
    for (const e of errors) console.error(`[pages:${MODE}] FAIL — ${e}`);
    process.exit(1);
  }

  const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : null;
  const normalize = (s) => (s ?? "").replace(/\r\n/g, "\n").replace(/^ {2}"(source|commit)": .*$/gm, "");
  if (MODE === "check") {
    if (prev === null || normalize(prev) !== normalize(next)) {
      console.error(`[pages:check] FAIL — config/storefront-pages.generated.json ${prev === null ? "missing" : `DRIFTED from ${sourcedFrom}`}.`);
      console.error("[pages:check] A page added or removed upstream changes every global change's blast radius.");
      console.error("[pages:check] Run `npm run pages:sync`, review the diff, and tier any new route in the curation file.");
      process.exit(1);
    }
    console.log(`[pages:check] OK — the page inventory matches ${sourcedFrom}.`);
    process.exit(0);
  }
  writeFileSync(OUT_FILE, next, "utf8");
  console.log(`[pages:sync] ${normalize(prev) !== normalize(next) ? "UPDATED" : "unchanged"} → config/storefront-pages.generated.json`);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
