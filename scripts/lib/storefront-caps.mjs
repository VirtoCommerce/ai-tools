// scripts/lib/storefront-caps.mjs — the storefront's own anonymous app-boot query
// (InitializeApplication) as a function. Returns a reason instead of exiting, so the
// pre-flight core can record UNKNOWN and carry on. The query is READ from the schema-gated
// fixture (GOLDEN RULE), never transcribed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** A fixture body without its `#` metadata header. */
export function readQueryFixture(root, name) {
  const p = resolve(root, 'test-data/graphql/queries', `${name}.graphql`);
  return readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n').trim();
}

export async function storefrontGql(backUrl, query, variables) {
  const res = await fetch(`${backUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const err = new Error(`HTTP ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

export async function probeStorefrontModules({ backUrl, domain, root }) {
  let data;
  try {
    data = await storefrontGql(backUrl, readQueryFixture(root, 'initializeApplicationClient'), { domain });
  } catch (e) {
    return { ok: false, reason: `graphql: ${e.message}` };
  }
  const store = data?.store;
  if (!store) return { ok: false, reason: 'no-store-for-domain' };
  const modules = (store.settings?.modules ?? []).slice().sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  const versionsHidden = modules.length > 0 && modules.every((m) => !m.version);
  return { ok: true, storeUrl: store.storeUrl, versionsHidden, modules };
}
