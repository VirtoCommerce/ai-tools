#!/usr/bin/env tsx
/**
 * visual:snap — screenshot a set of targets of ANY web front, deterministically.
 *
 * The capture half of the PIXEL instrument (`.claude/skills/qa-visual-regression/`). The other half,
 * `diff.ts`, compares two capture sets. Two kinds of target, one capture discipline:
 *
 *   --storybook <static dir | URL>   every story of a Storybook 7+ build (its index.json). Any
 *                                    framework: vc-frontend, frontend-next, a customer fork, vc-shell.
 *   --pages <targets.json> --base-url <url>
 *                                    named routes of any running web app (storefront, Admin SPA, a
 *                                    fork's preview). Base and head are two base URLs, same targets file.
 *
 * A set is only comparable with a set shot by the SAME browser on the SAME machine — so base and head
 * are both shot in one run, never against a baseline captured somewhere else (fonts and anti-aliasing
 * differ between machines).
 *
 * WHY THESE SETTINGS — measured on vc-frontend master, 750 stories, 2026-10-23/26
 * (`docs/superpowers/plans/2026-10-26-visual-regression.md` §Evidence). Each removes one noise source:
 *   DPR 1, fixed viewport ........ one raster per target
 *   reducedMotion + animations ... no mid-transition frames
 *   disabled, caret hidden
 *   networkidle, fonts, images ... icons arrive as lazy chunks: on `load` alone the VcCollapsibleContent
 *                                  chevron was missing in some passes and present in others
 *   timezone UTC, locale en-US ... date/number formatting is the same on every machine
 *   storybook: foreign requests .. a story never renders live data (off with --allow-network)
 *     aborted
 *   pages: --har replay .......... a page renders the SAME data on base and head: the API answers come
 *                                  from one recording, so a reseeded catalog or a new price is not a diff
 *   pages: hide / mask ........... what legitimately differs per load (a carousel, a timestamp, a
 *                                  recommendation block) is hidden or masked, by selector, in the targets file
 *
 * WHAT SETTINGS DO NOT REMOVE — `--repeat`. A few targets settle into one of two layouts at random
 * (VcTable selection stories, VcEmptyPage: a panel lands inside the viewport in some passes and below
 * it in others). No wait fixes a bistable layout, so the confirmation pass shoots each flagged target
 * N times and `visual:diff` calls it unchanged when ANY base shot matches ANY head shot.
 *
 * USAGE — storybook
 *   npm run visual:snap -- --storybook <dir|url> --out <dir>
 *     --globals "themePreset:red|themePreset:default"   one capture set per entry ('|'-separated);
 *                                          values are Storybook globals, read from the build's toolbar
 *     --only <affected.json>              stories whose importPath lies under one of its `dirs`
 *     --allow-network                     do not abort foreign requests
 * USAGE — pages
 *   npm run visual:snap -- --pages <targets.json> --base-url <url> --out <dir>
 *     --storage-state <file>              a signed-in Playwright storage state (never a credential)
 *     --har <file> --har-url <glob>       replay API answers matching <glob> from <file>, matched by
 *                                          method + path + query + body (GraphQL POSTs every operation to
 *                                          one path) — never by origin: base and head live at
 *                                          different addresses); an unmatched API call is aborted, so
 *                                          missing data shows instead of drifting
 *     --record-har <file> --har-url <glob>  record those answers on this pass (once, on base)
 *     --block <glob[,glob]>               abort matching requests (analytics, chat widgets)
 *   targets.json: { "hide": [sel], "mask": [sel],
 *                   "targets": [{ "name", "path", "group"?, "waitFor"?: sel, "hide"?: [sel], "mask"?: [sel] }] }
 * COMMON
 *     --viewports 1280x800,375x812        default 1280x800
 *     --grep <substr[,substr]>            targets whose id contains any substring
 *                                          (`visual:diff` writes the flagged ids as such a list)
 *     --repeat <n>                        shots per target (default 1; 3 for the confirmation pass)
 *     --workers <n>                       parallel pages (default 4)
 *     --executable <path>                 Chromium binary (default: Playwright's own)
 *
 * OUTPUT  <out>/<set>/<id>.png (+ <id>~2.png … with --repeat) and <out>/snapshots.json. <set> is the
 *         viewport, plus the globals when given. The caller passes <out> inside its run folder.
 *
 * EXIT    0 every selected target shot · 1 some failed to render (listed) · 2 nothing usable
 *         (no index/targets, nothing selected, browser did not start).
 */
import "../lib/sync-stdio.mjs";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { flagValue, intFlag, rejectUnknownFlags } from "../lib/cli-args.ts";

export interface SnapshotSet { name: string; viewport: { width: number; height: number }; globals: string | null }
/** `files`: one path per successful shot, relative to the out dir; empty ⇒ the target did not render.
 *  `ref`: the story's importPath, or the page's path. */
export interface Shot { id: string; title: string; ref: string; set: string; files: string[]; error?: string }
export interface SnapshotManifest {
  kind: "storybook" | "pages"; source: string; createdAt: string; browser: string; repeat: number;
  sets: SnapshotSet[]; stories: Shot[];
}
interface Target { id: string; title: string; ref: string; url: (set: SnapshotSet) => string; waitFor?: string; hide: string[]; mask: string[] }

const argv = process.argv.slice(2);
const VALUED = ["--storybook", "--source", "--pages", "--base-url", "--out", "--viewports", "--globals", "--only", "--grep",
  "--repeat", "--workers", "--executable", "--storage-state", "--har", "--har-url", "--record-har", "--block"];
rejectUnknownFlags(argv, [...VALUED, "--allow-network"], VALUED);
// --source is the pre-pages name of --storybook, kept so a written-down command keeps working.
const storybook = flagValue(argv, "--storybook") ?? flagValue(argv, "--source");
const pages = flagValue(argv, "--pages");
const out = flagValue(argv, "--out");
const usage = "usage: npm run visual:snap -- (--storybook <dir|url> | --pages <targets.json> --base-url <url>) --out <dir> [--viewports 1280x800] [--grep x] [--repeat n]";
if (!out || (!storybook === !pages)) { console.error(usage); process.exit(2); }
if (pages && !flagValue(argv, "--base-url")) { console.error("✗ --pages needs --base-url"); process.exit(2); }
if (pages && (flagValue(argv, "--globals") || flagValue(argv, "--only"))) { console.error("✗ --globals and --only are Storybook options"); process.exit(2); }
const harUrl = flagValue(argv, "--har-url");
if ((flagValue(argv, "--har") || flagValue(argv, "--record-har")) && !harUrl) {
  // Without a URL filter a replay would also serve base's JS bundles to head — and hide every regression.
  console.error("✗ --har / --record-har need --har-url <glob>: only API answers are frozen, never the app's own assets");
  process.exit(2);
}
const workers = Math.max(1, intFlag(argv, "--workers", 4));
const repeat = Math.max(1, intFlag(argv, "--repeat", 1));

function parseViewports(raw: string): { width: number; height: number }[] {
  return raw.split(",").map((v) => {
    const m = /^(\d+)x(\d+)$/.exec(v.trim());
    if (!m) { console.error(`✗ --viewports expects WxH[,WxH], got "${v}"`); process.exit(2); }
    return { width: Number(m[1]), height: Number(m[2]) };
  });
}

/** A static build dir is served on 127.0.0.1; a URL is used as it is. */
async function openStatic(src: string): Promise<{ base: string; close: () => void }> {
  if (/^https?:\/\//.test(src)) return { base: src.replace(/\/+$/, ""), close: () => {} };
  const root = resolve(src);
  if (!existsSync(join(root, "index.json"))) {
    console.error(`✗ ${root} has no index.json — pass a \`storybook build\` output dir`);
    process.exit(2);
  }
  const types: Record<string, string> = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  };
  const server = http.createServer((req, res) => {
    const p = join(root, decodeURIComponent((req.url ?? "/").split("?")[0]));
    const f = existsSync(p) && statSync(p).isDirectory() ? join(p, "index.html") : p;
    if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

async function storybookTargets(base: string): Promise<Target[]> {
  const res = await fetch(`${base}/index.json`);
  if (!res.ok) { console.error(`✗ ${base}/index.json → HTTP ${res.status}`); process.exit(2); }
  let entries = (Object.values((await res.json()).entries ?? {}) as { type: string; id: string; title: string; importPath: string }[])
    .filter((e) => e.type === "story");
  const only = flagValue(argv, "--only");
  if (only) {
    const affected = JSON.parse(readFileSync(only, "utf-8"));
    if (affected.mode !== "ALL") {
      const dirs: string[] = affected.dirs ?? [];
      entries = entries.filter((s) => dirs.some((d) => s.importPath.replace(/^\.\//, "").startsWith(d.replace(/\/?$/, "/"))));
    }
  }
  return entries.map((s) => ({
    id: s.id, title: s.title, ref: s.importPath, hide: [], mask: [],
    waitFor: "#storybook-root > *, .sb-show-errordisplay",
    url: (set) => {
      const g = set.globals ? `&globals=${encodeURIComponent(set.globals).replace(/%3A/g, ":").replace(/%3B/g, ";")}` : "";
      return `${base}/iframe.html?id=${s.id}&viewMode=story${g}`;
    },
  }));
}

function pageTargets(file: string, baseUrl: string): Target[] {
  const spec = JSON.parse(readFileSync(file, "utf-8"));
  const list: { name: string; path: string; group?: string; waitFor?: string; hide?: string[]; mask?: string[] }[] = spec.targets ?? [];
  if (!list.length) { console.error(`✗ ${file} has no targets[]`); process.exit(2); }
  const origin = baseUrl.replace(/\/+$/, "");
  return list.map((t) => ({
    id: slug(t.name), title: t.group ?? t.name, ref: t.path, waitFor: t.waitFor,
    hide: [...(spec.hide ?? []), ...(t.hide ?? [])], mask: [...(spec.mask ?? []), ...(t.mask ?? [])],
    url: () => `${origin}${t.path.startsWith("/") ? "" : "/"}${t.path}`,
  }));
}

function grepFilter(targets: Target[]): Target[] {
  const grep = flagValue(argv, "--grep");
  if (!grep) return targets;
  const parts = grep.split(",").map((g) => g.trim()).filter(Boolean);
  return targets.filter((t) => parts.some((g) => t.id.includes(g)));
}

/** Load one target and wait until it is quiet. Throws when it does not render. */
async function render(page: Page, t: Target, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle" });
  if (t.waitFor) await page.waitForSelector(t.waitFor, { timeout: 15_000 });
  if (storybook && (await page.$(".sb-show-errordisplay"))) throw new Error("story threw (Storybook error display)");
  if (t.hide.length) await page.addStyleTag({ content: `${t.hide.join(",")}{visibility:hidden !important}` });
  // No named helpers inside evaluate: tsx wraps them in `__name`, which the page does not define.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

async function prepareContext(ctx: BrowserContext, origin: string): Promise<void> {
  if (storybook && !argv.includes("--allow-network")) await ctx.route((u) => u.origin !== origin, (r) => r.abort());
  const block = flagValue(argv, "--block");
  for (const g of block ? block.split(",").map((s) => s.trim()).filter(Boolean) : []) await ctx.route(g, (r) => r.abort());
  const har = flagValue(argv, "--har");
  if (har) {
    // Matched by method + path + query + body, never by origin: base and head live at different
    // addresses (a stand and a PR preview), and Playwright's routeFromHAR would match neither against
    // the other. The body is part of the key because GraphQL POSTs every operation to one path.
    const answers = harAnswers(har);
    await ctx.route(harUrl!, async (route) => {
      const req = route.request();
      const hit = answers.get(harKey(req.method(), req.url(), req.postData()));
      if (!hit) { await route.abort(); return; } // missing data shows as a failure, never as live drift
      await route.fulfill({ status: hit.status, headers: hit.headers, body: hit.body });
    });
  }
}

const harKey = (method: string, url: string, body: string | null | undefined) => {
  const u = new URL(url);
  return `${method} ${u.pathname}${u.search} ${body ?? ""}`;
};

/** HAR entries keyed by method + path + query + request body; the last answer for a key wins. */
function harAnswers(file: string): Map<string, { status: number; headers: Record<string, string>; body: Buffer }> {
  const entries = JSON.parse(readFileSync(file, "utf-8")).log?.entries ?? [];
  const map = new Map<string, { status: number; headers: Record<string, string>; body: Buffer }>();
  for (const e of entries) {
    const c = e.response.content ?? {};
    const headers: Record<string, string> = {};
    for (const h of e.response.headers ?? []) if (!/^(content-length|content-encoding|transfer-encoding)$/i.test(h.name)) headers[h.name] = h.value;
    map.set(harKey(e.request.method, e.request.url, e.request.postData?.text), {
      status: e.response.status, headers, body: Buffer.from(c.text ?? "", c.encoding === "base64" ? "base64" : "utf-8"),
    });
  }
  return map;
}

async function shootSet(browser: Browser, origin: string, set: SnapshotSet, targets: Target[]): Promise<Shot[]> {
  const dir = join(out!, set.name);
  mkdirSync(dir, { recursive: true });
  const record = flagValue(argv, "--record-har");
  const ctx = await browser.newContext({
    viewport: set.viewport, deviceScaleFactor: 1, reducedMotion: "reduce", timezoneId: "UTC", locale: "en-US",
    storageState: flagValue(argv, "--storage-state"),
    recordHar: record ? { path: record, urlFilter: harUrl, content: "embed" } : undefined,
  });
  await prepareContext(ctx, origin);
  const shots: Shot[] = [];
  let next = 0;
  async function worker() {
    const page = await ctx.newPage();
    while (next < targets.length) {
      const t = targets[next++];
      const shot: Shot = { id: t.id, title: t.title, ref: t.ref, set: set.name, files: [] };
      for (let r = 1; r <= repeat; r++) {
        try {
          // Every repeat is a fresh navigation: a bistable layout must get its chance to land elsewhere.
          await render(page, t, t.url(set));
          const name = r === 1 ? `${t.id}.png` : `${t.id}~${r}.png`;
          await page.screenshot({
            path: join(dir, name), animations: "disabled", caret: "hide", fullPage: true, timeout: 20_000,
            mask: t.mask.map((m) => page.locator(m)),
          });
          shot.files.push(join(set.name, name));
        } catch (e) {
          shot.error = String((e as Error).message ?? e).split("\n")[0];
        }
      }
      shots.push(shot);
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: Math.min(workers, targets.length) }, worker));
  await ctx.close(); // flushes --record-har
  return shots;
}

async function main(): Promise<void> {
  const viewports = parseViewports(flagValue(argv, "--viewports") ?? "1280x800");
  const globalsList = (flagValue(argv, "--globals") ?? "").split("|").map((g) => g.trim()).filter(Boolean);
  const sets: SnapshotSet[] = viewports.flatMap((vp): SnapshotSet[] => {
    const vpName = `${vp.width}x${vp.height}`;
    return globalsList.length
      ? globalsList.map((g) => ({ name: `${vpName}__${slug(g)}`, viewport: vp, globals: g }))
      : [{ name: vpName, viewport: vp, globals: null }];
  });

  const src = storybook ? await openStatic(storybook) : { base: flagValue(argv, "--base-url")!.replace(/\/+$/, ""), close: () => {} };
  const t0 = Date.now();
  let browser: Browser;
  try {
    browser = await chromium.launch({ executablePath: flagValue(argv, "--executable") });
  } catch (e) {
    console.error(`✗ browser did not start: ${(e as Error).message.split("\n")[0]}`);
    src.close();
    process.exit(2);
  }
  const targets = grepFilter(storybook ? await storybookTargets(src.base) : pageTargets(pages!, src.base));
  if (targets.length === 0) { console.error("✗ no target selected"); await browser.close(); src.close(); process.exit(2); }

  const shots: Shot[] = [];
  for (const set of sets) shots.push(...(await shootSet(browser, new URL(src.base).origin, set, targets)));
  const manifest: SnapshotManifest = {
    kind: storybook ? "storybook" : "pages", source: storybook ?? `${pages} @ ${src.base}`, createdAt: new Date().toISOString(),
    browser: `chromium ${browser.version()}`, repeat, sets, stories: shots,
  };
  await browser.close();
  src.close();
  writeFileSync(join(out!, "snapshots.json"), JSON.stringify(manifest, null, 2));

  const failed = shots.filter((s) => s.files.length === 0);
  console.log(`visual:snap  ${targets.length} ${manifest.kind === "storybook" ? "stories" : "pages"} × ${sets.length} set(s) × ${repeat} shot(s) → ${shots.length - failed.length} shot, ${failed.length} failed  (${Math.round((Date.now() - t0) / 1000)} s, ${manifest.browser})`);
  for (const f of failed.slice(0, 20)) console.log(`  ✗ ${f.set}/${f.id}: ${f.error}`);
  if (failed.length > 20) console.log(`  … ${failed.length - 20} more in snapshots.json`);
  console.log(`  manifest: ${join(out!, "snapshots.json")}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(`✗ ${(e as Error).stack ?? e}`); process.exit(2); });
