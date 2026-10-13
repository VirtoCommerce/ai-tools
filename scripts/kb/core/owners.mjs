// WHICH MODULE OWNS A ROUTE OR A DOMAIN TYPE, read from the platform itself (VCST-6221).
//
// Every module serves its own OpenAPI document anonymously at `{BACK_URL}/docs/<ModuleId>/swagger.json`
// (checked 2026-10-13: 87 of 87 installed modules on vcst-qa). Its `paths` are the routes it owns and
// its `components.schemas` the domain types it declares, which is exactly what `relevance.mjs` needs
// to tell whether a module whose version differs between two builds has anything to do with an entry.
//
// FETCHED ONLY FOR THE MODULES THAT DIFFER, at dispute time: a module both builds run at one version
// cannot explain a difference, so its ownership is never asked. Cached per `id@version` -- a released
// module's OpenAPI document does not change -- so a second dispute over the same build costs nothing.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CACHE = join(tmpdir(), 'kb-owners');
const key = (id, version) => join(CACHE, `${String(id).replace(/[^\w.-]/g, '_')}@${String(version).replace(/[^\w.-]/g, '_')}.json`);

/** One module's `{ paths: [...], schemas: [...] }`, or null when its document is unreadable. */
async function ownedBy(backUrl, id, version, { fetchImpl = fetch, deadlineMs = 8_000 } = {}) {
  const file = key(id, version);
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { /* fetch */ }
  try {
    const r = await fetchImpl(`${backUrl}/docs/${encodeURIComponent(id)}/swagger.json`, { signal: AbortSignal.timeout(deadlineMs) });
    if (!r.ok) return null;
    const doc = await r.json();
    const out = {
      paths: Object.keys(doc.paths ?? {}),
      schemas: [...new Set(Object.keys(doc.components?.schemas ?? {}).map((s) => s.split('.').pop()))],
    };
    try { await mkdir(CACHE, { recursive: true }); await writeFile(file, JSON.stringify(out)); } catch { /* a cache */ }
    return out;
  } catch { return null; }
}

/**
 * The owners index (`{ paths: {path: [id]}, schemas: {name: [id]} }`) for `modules` -- `[{ id, version }]`,
 * read from `backUrl`. A module whose document is unreadable owns nothing it can be credited with; it is
 * still compared when the entry NAMES it (`relevance.mjs`).
 */
export async function ownersIndex(backUrl, modules, opts = {}) {
  const index = { paths: {}, schemas: {} };
  const docs = await Promise.all(modules.map((m) => ownedBy(backUrl, m.id, m.version, opts).then((d) => [m.id, d])));
  for (const [id, d] of docs) {
    if (!d) continue;
    for (const p of d.paths) (index.paths[p] ??= []).push(id);
    for (const s of d.schemas) (index.schemas[s] ??= []).push(id);
  }
  return index;
}
