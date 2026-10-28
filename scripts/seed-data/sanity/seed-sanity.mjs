#!/usr/bin/env node
/**
 * seed-sanity.mjs — provision the VCST-6475 Sanity fixture (spec: sanity-specs.mjs) for suite 114.
 *
 * WHAT IT DOES
 *   - Uploads the two AGENT-TEST-6475 assets (a 4x3 PNG, a text file) into the PRIMARY dataset via
 *     the Sanity Assets API. Identical bytes → Sanity returns the same asset document (idempotent).
 *   - Writes every declared document with createOrReplace, ONE transaction per dataset
 *     (Mutations API). Re-running rebuilds any drifted document.
 *   - Reads every document back (raw perspective, so the draft is visible) and checks the count +
 *     title per id, and that both asset CDN urls answer 200.
 *   - Writes the asset id + url to test-data/aliases.<TEST_ENV>.json (document ids are business keys
 *     and stay in the committed aliases.json).
 *
 * It writes NOTHING to the platform: the store's Sanity.* settings and the Pages index rebuild belong
 * to the suite's own Setup/Cleanup (FIFTH RULE — a store setting a case flips is created in the case).
 *
 * USAGE
 *   TEST_ENV=<env> node scripts/seed-data/sanity/seed-sanity.mjs [--dry-run] [--verbose]
 *   TEST_ENV=<env> node scripts/seed-data/sanity/seed-sanity.mjs --verify-only
 *   TEST_ENV=<env> node scripts/seed-data/sanity/seed-sanity.mjs --teardown
 *
 * ENV: {{SANITY_QA_PROJECT_ID}} (.env.<env>; absent ⇒ skip, exit 0 — this env has no QA Sanity
 *      project), {{SANITY_QA_WRITE_TOKEN}} (.env.local only, never printed).
 *
 * SAFETY: assertSafeTarget (ENV_RISK=production aborts). Teardown deletes ONLY the declared ids
 * (never a wildcard), and an asset only when no document outside this fixture references it; then
 * asserts zero residue in both datasets. The project's own (non AGENT-TEST) documents are never read
 * for writing, changed or deleted.
 */
import '../../lib/sync-stdio.mjs';
import { assertSafeTarget, log, verbose, verifyRemoved, writeEnvAliasOverride, DRY_RUN, TEARDOWN } from '../../lib/seed-common.mjs';
import {
  ENV, SANITY_API_VERSION, DATASETS, ASSET_SPECS, PLACEHOLDER_ASSETS, allDatasets, docsFor, docIdsFor,
  mutationBody, deleteBody, strongDanglingRefs, overlayAliases, RESIDUE_QUERY, OWN_ASSETS_QUERY, FOREIGN_REFERRERS_QUERY,
} from './sanity-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const VERIFY_ONLY = process.argv.includes('--verify-only');
const PROJECT = (process.env[ENV.projectId] || '').trim();
const TOKEN = (process.env[ENV.writeToken] || '').trim();
const failures = [];
const ok = (m) => log(`✓ ${m}`);
const fail = (m) => { failures.push(m); log(`✗ ${m}`); };

/** Sanity HTTP call. The token rides only in the Authorization header and is never logged. */
async function sanity(path, { method = 'GET', body, contentType, params } = {}) {
  const url = new URL(`https://${PROJECT}.api.sanity.io/${SANITY_API_VERSION}${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  verbose(`${method} ${url.pathname}${url.search ? ' (+query)' : ''}`);
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (contentType) headers['Content-Type'] = contentType;
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sanity ${method} ${url.pathname} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const query = (dataset, groq, params = {}) => {
  const p = { query: groq };
  for (const [k, v] of Object.entries(params)) p[`$${k}`] = JSON.stringify(v);
  return sanity(`/data/query/${dataset}`, { params: p }).then((r) => r.result);
};
const mutate = (dataset, body) => sanity(`/data/mutate/${dataset}`, { method: 'POST', body: JSON.stringify(body), contentType: 'application/json', params: { returnIds: 'true' } });

async function uploadAssets() {
  const out = {};
  for (const a of ASSET_SPECS) {
    if (DRY_RUN) { log(`  (dry) upload ${a.kind} ${a.filename}`); continue; }
    const r = await sanity(`/assets/${a.kind}/${DATASETS.primary}`, { method: 'POST', body: a.bytes(), contentType: a.contentType, params: { filename: a.filename } });
    out[a.key] = r.document;
    ok(`asset ${a.key}: ${r.document._id}`);
  }
  return out;
}

async function verify(expectedAssets) {
  for (const ds of allDatasets()) {
    const expected = docsFor(ds, expectedAssets);
    const got = await query(ds, '*[_id in $ids]{_id, _type, title}', { ids: expected.map((d) => d._id) });
    const byId = new Map(got.map((d) => [d._id, d]));
    for (const d of expected) {
      const g = byId.get(d._id);
      if (!g) fail(`${ds}: ${d._id} missing`);
      else if (g._type !== d._type || g.title !== d.title) fail(`${ds}: ${d._id} drifted (${g._type} "${g.title}")`);
    }
    if (got.length === expected.length && failures.length === 0) ok(`${ds}: ${got.length}/${expected.length} documents present, type+title match`);
  }
  const assets = await query(DATASETS.primary, OWN_ASSETS_QUERY);
  for (const a of ASSET_SPECS) {
    const live = assets.find((x) => x.originalFilename === a.filename);
    if (!live) { fail(`asset ${a.filename} missing`); continue; }
    const r = await fetch(live.url, { method: 'HEAD' });
    if (r.status === 200) ok(`asset ${a.key} url answers 200`); else fail(`asset ${a.key} url → ${r.status}`);
  }
  return assets;
}

async function seed() {
  for (const ds of allDatasets()) {
    const bad = strongDanglingRefs(ds);
    if (bad.length) throw new Error(`strong dangling reference(s) in ${ds} — Sanity would 409: ${bad.join('; ')}`);
  }
  if (VERIFY_ONLY) { await verify(PLACEHOLDER_ASSETS); return; }
  const uploaded = await uploadAssets();
  const assetIds = DRY_RUN ? PLACEHOLDER_ASSETS : Object.fromEntries(Object.entries(uploaded).map(([k, v]) => [k, v._id]));
  for (const ds of allDatasets()) {
    const body = mutationBody(ds, assetIds);
    if (DRY_RUN) { log(`  (dry) ${ds}: createOrReplace ${body.mutations.length} doc(s) in one transaction`); continue; }
    const r = await mutate(ds, body);
    ok(`${ds}: transaction ${r.transactionId} — ${body.mutations.length} doc(s)`);
  }
  if (DRY_RUN) return;
  await verify(assetIds);
  writeEnvAliasOverride(overlayAliases(uploaded));
  ok(`aliases.${TEST_ENV}.json ← ${ASSET_SPECS.map((a) => a.alias).join(', ')}`);
}

async function teardown() {
  // Documents first (secondary, then primary — the footer's strong refs go with their targets in
  // the same transaction), so no fixture document still references an asset when it is deleted.
  for (const ds of [DATASETS.secondary, DATASETS.primary]) {
    const ids = docIdsFor(ds);
    if (DRY_RUN) { log(`  (dry) ${ds}: delete ${ids.length} doc(s)`); continue; }
    const r = await mutate(ds, deleteBody(ids));
    ok(`${ds}: deleted ${ids.length} declared id(s) (tx ${r.transactionId})`);
  }
  const assets = await query(DATASETS.primary, OWN_ASSETS_QUERY);
  for (const a of assets) {
    const foreign = await query(DATASETS.primary, FOREIGN_REFERRERS_QUERY, { id: a._id });
    if (foreign > 0) { fail(`asset ${a._id} is referenced by ${foreign} non-fixture document(s) — left in place`); continue; }
    if (DRY_RUN) { log(`  (dry) delete asset ${a._id}`); continue; }
    await mutate(DATASETS.primary, deleteBody([a._id]));
    ok(`asset ${a.originalFilename} deleted`);
  }
  for (const ds of allDatasets()) {
    const left = await verifyRemoved(async () => {
      const r = await query(ds, RESIDUE_QUERY);
      const byId = await query(ds, 'count(*[_id in $ids])', { ids: docIdsFor(ds) });
      return r.docs + r.assets + byId;
    });
    if (left === 0) ok(`${ds}: zero AGENT-TEST-6475 residue`); else fail(`${ds}: ${left} AGENT-TEST-6475 residue`);
  }
  writeEnvAliasOverride(Object.fromEntries(ASSET_SPECS.map((a) => [a.alias, { id: '', url: '' }])));
}

async function main() {
  console.log(`=== seed-sanity (VCST-6475)${TEARDOWN ? ' TEARDOWN' : ''}${DRY_RUN ? ' [dry-run]' : ''}${VERIFY_ONLY ? ' [verify-only]' : ''} ===`);
  assertSafeTarget();
  if (!PROJECT) { log(`SKIP: {{${ENV.projectId}}} is not set for TEST_ENV=${TEST_ENV} — no QA Sanity project on this env.`); return; }
  if (!TOKEN) { console.error(`ABORT: {{${ENV.writeToken}}} is not set (.env.local).`); process.exit(2); }
  log(`Sanity project from {{${ENV.projectId}}}; datasets ${allDatasets().join(', ')}`);
  if (TEARDOWN) await teardown(); else await seed();
  if (failures.length) { console.error(`\nFAILED — ${failures.length} problem(s)`); process.exit(1); }
  log(DRY_RUN ? 'DRY RUN complete.' : TEARDOWN ? 'Teardown complete.' : 'Seed complete.');
}
main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
