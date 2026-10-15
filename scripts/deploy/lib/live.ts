// scripts/deploy/lib/live.ts — the live platform of an env: admin token, /api/platform/modules, /health.
// Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.

import type { EnvCoords } from './env.ts';

export type ProbeStatus = number | 'network' | 'no-back-url';
/** `isInstalled` absent ⇒ treated as installed (older platforms omit it); `loadErrors` ← `validationErrors`. */
export interface LiveModule { id: string; version: string; projectUrl?: string; isInstalled?: boolean; loadErrors: string[] }

// ── live verify (/api/platform/modules) ─────────────────────────────────────────
/** Admin token plus WHY it failed — pre-flight's diagnosis needs 401 vs 5xx vs no BACK_URL. */
export async function probeAdminToken(c: EnvCoords, signal?: AbortSignal): Promise<{ token: string | null; status: ProbeStatus }> {
  if (!c.backUrl) return { token: null, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/connect/token`, { signal, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', username: c.admin, password: c.password }) });
    if (r.status !== 200) return { token: null, status: r.status };
    return { token: (await r.json())?.access_token ?? null, status: 200 };
  } catch { return { token: null, status: 'network' }; }
}
export async function getAdminToken(c: EnvCoords): Promise<string | null> {
  return (await probeAdminToken(c)).token;
}
/** Installed modules with their original id case and ProjectUrl (the authoritative id → repo link). */
export async function probeLiveModules(c: EnvCoords, token: string, signal?: AbortSignal): Promise<{ ok: true; modules: LiveModule[] } | { ok: false; status: ProbeStatus }> {
  if (!c.backUrl) return { ok: false, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/api/platform/modules`, { signal, headers: { Authorization: `Bearer ${token}` } });
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
export async function liveModules(c: EnvCoords, token: string): Promise<Record<string, string> | null> {
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
