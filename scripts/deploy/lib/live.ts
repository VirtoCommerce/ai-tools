// scripts/deploy/lib/live.ts — the live platform of an env: admin token, /api/platform/modules, /health.
// Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.

import type { EnvCoords } from './env.ts';

export type ProbeStatus = number | 'network' | 'no-back-url';
export interface LiveModule { id: string; version: string; projectUrl?: string }

// ── live verify (/api/platform/modules) ─────────────────────────────────────────
/** Admin token plus WHY it failed — pre-flight's diagnosis needs 401 vs 5xx vs no BACK_URL. */
export async function probeAdminToken(c: EnvCoords): Promise<{ token: string | null; status: ProbeStatus }> {
  if (!c.backUrl) return { token: null, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', username: c.admin, password: c.password }) });
    if (r.status !== 200) return { token: null, status: r.status };
    return { token: (await r.json())?.access_token ?? null, status: 200 };
  } catch { return { token: null, status: 'network' }; }
}
export async function getAdminToken(c: EnvCoords): Promise<string | null> {
  return (await probeAdminToken(c)).token;
}
/** Installed modules with their original id case and ProjectUrl (the authoritative id → repo link). */
export async function probeLiveModules(c: EnvCoords, token: string): Promise<{ ok: true; modules: LiveModule[] } | { ok: false; status: ProbeStatus }> {
  if (!c.backUrl) return { ok: false, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/api/platform/modules`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return { ok: false, status: r.status };
    const mods = await r.json();
    const modules: LiveModule[] = [];
    for (const m of Array.isArray(mods) ? mods : []) {
      if (!m?.id) continue;
      modules.push({ id: String(m.id), version: String(m.version ?? ''), ...(m.projectUrl ? { projectUrl: String(m.projectUrl) } : {}) });
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
export async function probePlatformVersion(c: EnvCoords): Promise<{ ok: true; version: string } | { ok: false; status: ProbeStatus | 'no-version-in-page' }> {
  if (!c.backUrl) return { ok: false, status: 'no-back-url' };
  try {
    const r = await fetch(`${c.backUrl}/`);
    if (r.status !== 200) return { ok: false, status: r.status };
    const version = parsePlatformVersion(await r.text());
    return version ? { ok: true, version } : { ok: false, status: 'no-version-in-page' };
  } catch { return { ok: false, status: 'network' }; }
}
export async function platformHealthy(c: EnvCoords): Promise<boolean> {
  try { return (await fetch(`${c.backUrl}/health`, { redirect: 'manual' })).status === 200; } catch { return false; }
}
