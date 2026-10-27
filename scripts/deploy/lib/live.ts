// scripts/deploy/lib/live.ts — the live platform of an env: admin token, /api/platform/modules, /health.
// Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.

import type { EnvCoords } from './env.ts';

/** `api-key`: a key in hand, not yet tried; `api-key-rejected`: the stand refused it and there is no password. */
export type ProbeStatus = number | 'network' | 'no-back-url' | 'no-password' | 'api-key' | 'api-key-rejected';
/** `isInstalled` absent ⇒ treated as installed (older platforms omit it); `loadErrors` ← `validationErrors`. */
export interface LiveModule { id: string; version: string; projectUrl?: string; isInstalled?: boolean; loadErrors: string[] }
/** What the live readers need of an env (scripts/hotfix has its own coords shape). */
export type LiveCoords = Pick<EnvCoords, 'backUrl' | 'admin' | 'password' | 'apiKey' | 'apiKeyFor'>;
/** A credential as the headers it travels in, so an API key never goes out as a Bearer token. */
export interface AdminAuth { via: 'api-key' | 'password'; headers: Record<string, string> }

// ── live verify (/api/platform/modules) ─────────────────────────────────────────
/** Admin credential plus WHY it failed — pre-flight's diagnosis needs 401 vs 5xx vs no BACK_URL. */
export async function probeAdminToken(c: LiveCoords, signal?: AbortSignal): Promise<{ token: AdminAuth | null; status: ProbeStatus }> {
  if (!c.backUrl) return { token: null, status: 'no-back-url' };
  // A service-account API key is the credential itself: no sign-in, so no lockout and no second factor. It is
  // not checked here (that is a read of its own): probeLiveModules falls back to the password if it is refused.
  const key = c.apiKey && c.apiKeyFor === c.backUrl ? c.apiKey : null;
  if (key) return { token: { via: 'api-key', headers: { api_key: key } }, status: 'api-key' };
  return passwordGrant(c, signal);
}
// One sign-in per process and credential. Several readers in one run (env facts, the case pre-flight, a deploy
// verify) each asked for their own token, so a stale password failed two or three times per run against a shared
// admin's lockout. A refusal (4xx) is never re-sent; a granted token is reused for TOKEN_REUSE_MS; a network error
// or a 5xx is not remembered, so a retry stays possible. Keyed by the password too, so a corrected one is tried.
const TOKEN_REUSE_MS = 10 * 60_000;
const grants = new Map<string, { at: number; result: { token: AdminAuth | null; status: ProbeStatus } }>();
async function passwordGrant(c: LiveCoords, signal?: AbortSignal): Promise<{ token: AdminAuth | null; status: ProbeStatus }> {
  // No password, no attempt: a guessed one is a failed sign-in that counts toward the shared admin's lockout.
  if (!c.password) return { token: null, status: 'no-password' };
  const key = `${c.backUrl}\n${c.admin}\n${c.password}`;
  const seen = grants.get(key);
  if (seen && (!seen.result.token || Date.now() - seen.at < TOKEN_REUSE_MS)) return seen.result;
  try {
    const r = await fetch(`${c.backUrl}/connect/token`, { signal, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', username: c.admin, password: c.password }) });
    if (r.status !== 200) {
      const refused = { token: null, status: r.status };
      if (r.status >= 400 && r.status < 500) grants.set(key, { at: Date.now(), result: refused });
      return refused;
    }
    const token = (await r.json())?.access_token;
    const result = { token: token ? { via: 'password' as const, headers: { Authorization: `Bearer ${token}` } } : null, status: 200 as ProbeStatus };
    if (result.token) grants.set(key, { at: Date.now(), result });
    return result;
  } catch { return { token: null, status: 'network' }; }
}
export async function getAdminToken(c: LiveCoords): Promise<AdminAuth | null> {
  return (await probeAdminToken(c)).token;
}
/** Installed modules with their original id case and ProjectUrl (the authoritative id → repo link). */
export async function probeLiveModules(c: LiveCoords, token: AdminAuth, signal?: AbortSignal): Promise<{ ok: true; modules: LiveModule[] } | { ok: false; status: ProbeStatus }> {
  if (!c.backUrl) return { ok: false, status: 'no-back-url' };
  try {
    let r = await fetch(`${c.backUrl}/api/platform/modules`, { signal, headers: token.headers });
    // A refused key (rotated, revoked) falls back to the password: the key spares the admin sign-in, it never
    // takes away a read the password would serve.
    if ((r.status === 401 || r.status === 403) && token.via === 'api-key') {
      const pw = await passwordGrant(c, signal);
      if (!pw.token) return { ok: false, status: pw.status === 'no-password' ? 'api-key-rejected' : pw.status };
      r = await fetch(`${c.backUrl}/api/platform/modules`, { signal, headers: pw.token.headers });
    }
    if (r.status !== 200) return { ok: false, status: r.status };
    const mods = await r.json();
    const modules: LiveModule[] = [];
    for (const m of Array.isArray(mods) ? mods : []) {
      if (!m?.id) continue;
      modules.push({
        id: String(m.id), version: String(m.version ?? ''),
        ...(m.projectUrl ? { projectUrl: String(m.projectUrl) } : {}),
        ...(typeof m.isInstalled === 'boolean' ? { isInstalled: m.isInstalled } : {}),
        loadErrors: Array.isArray(m.validationErrors) ? m.validationErrors.map(String) : [],
      });
    }
    return { ok: true, modules };
  } catch { return { ok: false, status: 'network' }; }
}
export async function liveModules(c: LiveCoords, token: AdminAuth): Promise<Record<string, string> | null> {
  const r = await probeLiveModules(c, token);
  if (!r.ok) return null;
  const out: Record<string, string> = {};
  for (const m of r.modules) out[m.id.toLowerCase()] = m.version;
  return out;
}
/** The running platform version as the Admin SPA's root page embeds it: `ng-init="platformVersion ='3.1078.0'"`. */
export function parsePlatformVersion(html: string): string | null {
  return /platformVersion\s*=\s*['"](\d[^'"]*)['"]/.exec(html)?.[1] ?? null;
}
/**
 * The only live, anonymous source of the platform version (kb KB-B858E12A): the modules API carries
 * modules only and /api/platform/version is 404. Read-only GET of the Admin root.
 */
export async function probePlatformVersion(c: EnvCoords, signal?: AbortSignal): Promise<{ ok: true; version: string } | { ok: false; status: ProbeStatus | 'no-version-in-page' }> {
  if (!c.backUrl) return { ok: false, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/`, { signal });
    if (r.status !== 200) return { ok: false, status: r.status };
    const version = parsePlatformVersion(await r.text());
    return version ? { ok: true, version } : { ok: false, status: 'no-version-in-page' };
  } catch { return { ok: false, status: 'network' }; }
}
/** The storefront's entry script, as its index HTML references it: `/assets/index-<hash>.js`. */
export function parseThemeEntry(html: string): string | null {
  return /["'](\/?assets\/index-[\w-]+\.js)["']/.exec(html)?.[1] ?? null;
}
/** The theme's package version, which the vc-frontend build inlines as `x="2.60.0-pr-…",y={version:x}`. */
export function parseThemeVersion(js: string): string | null {
  const v = /["'](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["'],[\w$]+=\{version:[\w$]+\}/.exec(js)?.[1]
    ?? /\{version:["'](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["']\}/.exec(js)?.[1];
  return v ?? null;
}
/**
 * The live, anonymous source of the storefront theme version: the entry bundle the index HTML loads.
 * The HTML is cache-busted (kb KB-D9DF8E54: it is served max-age=7200, so a plain GET can name the
 * previous build). Read-only GETs of FRONT_URL. `signal` lets a caller with a deadline (the kb build
 * stamp) abort both requests rather than only stop waiting for them.
 */
export async function probeThemeVersion(frontUrl: string, signal?: AbortSignal): Promise<{ ok: true; version: string } | { ok: false; status: ProbeStatus | 'no-front-url' | 'no-entry-script' | 'no-version-in-bundle' }> {
  if (!frontUrl) return { ok: false, status: 'no-front-url' };
  try {
    const page = await fetch(`${frontUrl}/?_preflight=${Date.now()}`, { signal, headers: { 'Cache-Control': 'no-cache' } });
    if (page.status !== 200) return { ok: false, status: page.status };
    const entry = parseThemeEntry(await page.text());
    if (!entry) return { ok: false, status: 'no-entry-script' };
    const js = await fetch(new URL(entry, `${frontUrl}/`).href, { signal });
    if (js.status !== 200) return { ok: false, status: js.status };
    const version = parseThemeVersion(await js.text());
    return version ? { ok: true, version } : { ok: false, status: 'no-version-in-bundle' };
  } catch { return { ok: false, status: 'network' }; }
}
export async function platformHealthy(c: EnvCoords): Promise<boolean> {
  try { return (await fetch(`${c.backUrl}/health`, { redirect: 'manual' })).status === 200; } catch { return false; }
}
