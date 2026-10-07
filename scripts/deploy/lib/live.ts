// scripts/deploy/lib/live.ts — the live platform of an env: admin token, /api/platform/modules, /health.
// Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.

import type { EnvCoords } from './env.ts';

// ── live verify (/api/platform/modules) ─────────────────────────────────────────
export async function getAdminToken(c: EnvCoords): Promise<string | null> {
  if (!c.backUrl) return null;
  try {
    const r = await fetch(`${c.backUrl}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', username: c.admin, password: c.password }) });
    if (r.status !== 200) return null;
    return (await r.json())?.access_token ?? null;
  } catch { return null; }
}
export async function liveModules(c: EnvCoords, token: string): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(`${c.backUrl}/api/platform/modules`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return null;
    const mods = await r.json();
    const out: Record<string, string> = {};
    for (const m of Array.isArray(mods) ? mods : []) if (m?.id) out[String(m.id).toLowerCase()] = String(m.version ?? '');
    return out;
  } catch { return null; }
}
export async function platformHealthy(c: EnvCoords): Promise<boolean> {
  try { return (await fetch(`${c.backUrl}/health`, { redirect: 'manual' })).status === 200; } catch { return false; }
}
