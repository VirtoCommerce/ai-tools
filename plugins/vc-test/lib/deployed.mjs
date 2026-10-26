// plugins/vc-test/lib/deployed.mjs — F6 from the stand itself (spec §5.3): what is deployed, read the way any Virto
// Commerce project can be read. Module versions from /api/platform/modules (an admin login), the platform version
// from the Admin SPA's root page and the theme version from the storefront's entry bundle (both anonymous). A port
// to plain JS of scripts/deploy/lib/live.ts's probes, unchanged in behaviour. A side that cannot be read is
// UNKNOWN with its reason — F6 then fires on doubt (§5.2) — and never reads as "not deployed".
// CLI (the admin password reaches it only through the bridge):
//   node "$VC_RUN" runner plugin deployed --key <KEY> [--expect <file: [{ id, version }]>]   → <WORK>/deployed.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, currentEnv, workDir } from "./paths.mjs";

/** The running platform version as the Admin SPA's root page embeds it: `ng-init="platformVersion ='3.1078.0'"`. */
export function parsePlatformVersion(html) {
  return /platformVersion\s*=\s*['"](\d[^'"]*)['"]/.exec(html)?.[1] ?? null;
}
/** The storefront's entry script, as its index HTML references it: `/assets/index-<hash>.js`. */
export function parseThemeEntry(html) {
  return /["'](\/?assets\/index-[\w-]+\.js)["']/.exec(html)?.[1] ?? null;
}
/** The theme's package version, which the vc-frontend build inlines as `x="2.60.0-pr-…",y={version:x}`. */
export function parseThemeVersion(js) {
  return /["'](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["'],[\w$]+=\{version:[\w$]+\}/.exec(js)?.[1]
    ?? /\{version:["'](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["']\}/.exec(js)?.[1]
    ?? null;
}

const TIMEOUT_MS = 30_000;
const timed = () => AbortSignal.timeout(TIMEOUT_MS);

async function adminToken({ backUrl, admin, password, fetch }) {
  try {
    const r = await fetch(`${backUrl}/connect/token`, { method: "POST", signal: timed(), headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username: admin, password }) });
    if (r.status !== 200) return { status: r.status };
    const token = (await r.json())?.access_token;
    return token ? { token } : { status: "no-token" };
  } catch {
    return { status: "network" };
  }
}

async function modulesOf(ctx) {
  if (!ctx.backUrl) return { unknown: "no-back-url" };
  if (!ctx.admin || !ctx.password) return { unknown: "no admin login (ADMIN / ADMIN_PASSWORD)" };
  const t = await adminToken(ctx);
  if (!t.token) return { unknown: `admin login ${t.status}` };
  try {
    const r = await ctx.fetch(`${ctx.backUrl}/api/platform/modules`, { signal: timed(), headers: { Authorization: `Bearer ${t.token}` } });
    if (r.status !== 200) return { unknown: `modules ${r.status}` };
    const mods = await r.json();
    return (Array.isArray(mods) ? mods : []).filter((m) => m?.id).map((m) => ({ id: String(m.id), version: String(m.version ?? "") }));
  } catch {
    return { unknown: "modules network" };
  }
}

async function platformOf({ backUrl, fetch }) {
  if (!backUrl) return { unknown: "no-back-url" };
  try {
    const r = await fetch(`${backUrl}/`, { signal: timed() });
    if (r.status !== 200) return { unknown: String(r.status) };
    const version = parsePlatformVersion(await r.text());
    return version ? { version } : { unknown: "no-version-in-page" };
  } catch {
    return { unknown: "network" };
  }
}

async function themeOf({ frontUrl, fetch }) {
  if (!frontUrl) return { unknown: "no-front-url" };
  try {
    // Cache-busted: the storefront's HTML is served max-age=7200, so a plain GET can name the previous build.
    const page = await fetch(`${frontUrl}/?_preflight=${Date.now()}`, { signal: timed(), headers: { "Cache-Control": "no-cache" } });
    if (page.status !== 200) return { unknown: String(page.status) };
    const entry = parseThemeEntry(await page.text());
    if (!entry) return { unknown: "no-entry-script" };
    const js = await fetch(new URL(entry, `${frontUrl}/`).href, { signal: timed() });
    if (js.status !== 200) return { unknown: String(js.status) };
    const version = parseThemeVersion(await js.text());
    return version ? { version } : { unknown: "no-version-in-bundle" };
  } catch {
    return { unknown: "network" };
  }
}

/** What the stand runs. Each side is `{ version }` / a module list, or `{ unknown: reason }`. */
export async function deployed({ backUrl, frontUrl, admin, password, fetch = globalThis.fetch }) {
  const ctx = { backUrl: backUrl?.replace(/\/+$/, "") || null, frontUrl: frontUrl?.replace(/\/+$/, "") || null, admin, password, fetch };
  const [platform, modules, theme] = await Promise.all([platformOf(ctx), modulesOf(ctx), themeOf(ctx)]);
  return { platform, modules, theme };
}

/** Each expected module against the stand: DEPLOYED, NOT DEPLOYED, or UNKNOWN when the module list could not be read. */
export function compareExpected(d, expect) {
  const known = Array.isArray(d.modules);
  const live = new Map(known ? d.modules.map((m) => [m.id.toLowerCase(), m.version]) : []);
  return expect.map(({ id, version }) => {
    if (!known) return { id, expected: version, live: null, verdict: "UNKNOWN" };
    const v = live.get(String(id).toLowerCase()) ?? null;
    return { id, expected: version, live: v, verdict: v === version ? "DEPLOYED" : "NOT DEPLOYED" };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const key = argOf(process.argv, "key");
  if (!key) { console.error("usage: deployed.mjs --key <KEY> [--expect <file>]"); process.exit(1); }
  const { loadLayeredEnv } = await import("../scripts/lib/load-layered-env.mjs");
  loadLayeredEnv(currentEnv());
  const e = process.env;
  const d = await deployed({ backUrl: e.BACK_URL, frontUrl: e.FRONT_URL, admin: e.ADMIN ?? null, password: e.ADMIN_PASSWORD ?? null });
  const expectFile = argOf(process.argv, "expect");
  const out = { env: currentEnv(), at: new Date().toISOString(), ...d,
    ...(expectFile ? { expect: compareExpected(d, JSON.parse(readFileSync(expectFile, "utf8"))) } : {}) };
  const path = join(workDir(key), "deployed.json");
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ path, ...out }));
}
