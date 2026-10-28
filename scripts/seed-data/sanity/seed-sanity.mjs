#!/usr/bin/env node
/**
 * seed-sanity.mjs — provision the VCST-6475 Sanity fixture (spec: sanity-specs.mjs) for suite 114.
 *
 * WHAT IT DOES
 *   - Uploads the two AGENT-TEST-6475 assets (a 4x3 PNG, a text file) into the PRIMARY dataset via
 *     the Sanity Assets API. Identical bytes → Sanity returns the same asset document (idempotent).
 *   - Writes every declared document with createOrReplace, ONE transaction per dataset
 *     (Mutations API). Re-running rebuilds any drifted document.
 *   - Reads every document back (raw perspective, so the draft is visible) and compares, per id, the
 *     fields the cases depend on — _type, title, permalink.current, seo.slug.current and every
 *     reference _ref (+ _weak) — and checks that both asset CDN urls answer 200.
 *   - Writes the asset id + url to test-data/aliases.<TEST_ENV>.json (document ids are business keys
 *     and stay in the committed aliases.json).
 *
 * It writes NOTHING to the platform: the store's Sanity.* settings and the Pages index rebuild belong
 * to the suite's own Setup/Cleanup (FIFTH RULE — a store setting a case flips is created in the case).
 *
 * USAGE
 *   TEST_ENV=<env> node scripts/seed-data/sanity/seed-sanity.mjs [--dry-run] [--verbose]
 *   TEST_ENV=<env> node scripts/seed-data/sanity/seed-sanity.mjs --verify-only
 *       reads only; uses {{SANITY_QA_READ_TOKEN}}, falling back to the write token
 *   TEST_ENV=<env> node scripts/seed-data/sanity/seed-sanity.mjs --teardown [--dry-run]
 *
 * ENV: {{SANITY_QA_PROJECT_ID}} (.env.<env>; absent ⇒ skip, exit 0 — this env has no QA Sanity
 *      project), {{SANITY_QA_WRITE_TOKEN}} (seed/teardown) and {{SANITY_QA_READ_TOKEN}} (verify-only),
 *      both .env.local only, never printed. No BACK_URL / admin credentials: the platform is not touched.
 *
 * SAFETY: assertSafeRisk for seed and teardown (ENV_RISK undeclared or production aborts);
 * --verify-only writes nothing and skips it. Teardown deletes ONLY the declared ids (never a
 * wildcard), and an asset only when no document outside this fixture (exact id prefix) references it;
 * an asset kept that way keeps its overlay id/url. It then asserts zero residue in both datasets — a
 * residue query that fails is a failure ("residue unknown"), never a pass. A --dry-run teardown
 * deletes nothing and reports the residue as NOT verified. The project's own (non AGENT-TEST)
 * documents are never written, changed or deleted.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafeRisk, log, verbose, verifyRemoved, writeEnvAliasOverride, DRY_RUN, TEARDOWN, ROOT } from '../../lib/seed-common.mjs';
import {
  ENV, SANITY_API_VERSION, DATASETS, ASSET_SPECS, allDatasets, docsFor, docIdsFor, collectRefs,
  mutationBody, deleteBody, strongDanglingRefs, overlayAliases, RESIDUE_QUERY, OWN_ASSETS_QUERY, FOREIGN_REFERRERS_QUERY,
} from './sanity-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const VERIFY_ONLY = process.argv.includes('--verify-only');
const PROJECT = (process.env[ENV.projectId] || '').trim();
const WRITE_TOKEN = (process.env[ENV.writeToken] || '').trim();
const READ_TOKEN = (process.env[ENV.readToken] || '').trim();
/** verify-only reads with the read token when there is one; seed and teardown need the write token. */
const TOKEN = VERIFY_ONLY ? (READ_TOKEN || WRITE_TOKEN) : WRITE_TOKEN;
const TOKEN_LABEL = VERIFY_ONLY && READ_TOKEN ? ENV.readToken : ENV.writeToken;
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

/** The fields a case depends on, as one comparable object per document. */
const shapeOf = (d) => ({
  type: d._type, title: d.title, permalink: d.permalink?.current ?? null, seoSlug: d.seo?.slug?.current ?? null,
  refs: collectRefs(d).map((r) => `${r._ref}${r._weak ? ' (weak)' : ''}`).sort(),
});
const MISSING_PREFIX = '<missing-asset:';
const isAssetRef = (ref) => /^(image|file)-/.test(ref);

/** This env's overlay entry for an asset alias (the --verify-only fallback), or null. */
function overlayAsset(alias) {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8'))[alias] || null) : null; } catch { return null; }
}

/**
 * The asset ids page-a must reference. After a seed: exactly the ids uploadAssets() returned — the
 * same ones overlayAliases() writes (Sanity dedups by sha1, so that asset may carry ANOTHER
 * originalFilename). --verify-only: the asset with our filename, else this env's overlay id.
 * A missing asset is reported ONCE, here.
 */
async function resolveAssets(uploaded) {
  const ids = {};
  const byFilename = uploaded ? [] : await query(DATASETS.primary, OWN_ASSETS_QUERY);
  for (const a of ASSET_SPECS) {
    let id = uploaded?.[a.key]?._id || null;
    let url = uploaded?.[a.key]?.url || null;
    if (!uploaded) {
      const live = byFilename.find((x) => x.originalFilename === a.filename) || null;
      const ov = live ? null : overlayAsset(a.alias);
      id = live?._id || ov?.id || null;
      url = live?.url || ov?.url || null;
    }
    if (!id) { fail(`asset ${a.key} (${a.filename}) missing — refs to it are not compared below`); continue; }
    ids[a.key] = id;
    if (!url) { fail(`asset ${a.key} (${id}) url missing`); continue; }
    const r = await fetch(url, { method: 'HEAD' });
    if (r.status === 200) ok(`asset ${a.key} (${id}) url answers 200`); else fail(`asset ${a.key} url → ${r.status}`);
  }
  return ids;
}

/** Read every document back; compare type, title, permalink, seo.slug and refs, per dataset. */
async function verify(uploaded = null) {
  const assetIds = await resolveAssets(uploaded);
  const missing = ASSET_SPECS.filter((a) => !assetIds[a.key]).map((a) => a.key);
  const expectedAssets = { ...Object.fromEntries(missing.map((k) => [k, `${MISSING_PREFIX}${k}>`])), ...assetIds };
  for (const ds of allDatasets()) {
    const expected = docsFor(ds, expectedAssets);
    const got = await query(ds, '*[_id in $ids]', { ids: expected.map((d) => d._id) });
    const byId = new Map(got.map((d) => [d._id, d]));
    let bad = 0;
    for (const d of expected) {
      const g = byId.get(d._id);
      if (!g) { fail(`${ds}: ${d._id} missing`); bad++; continue; }
      const want = shapeOf(d); const have = shapeOf(g);
      let note = '';
      if (want.refs.some((r) => r.startsWith(MISSING_PREFIX))) {
        // The missing asset was reported once above; compare everything else, not the ref to it.
        want.refs = want.refs.filter((r) => !r.startsWith(MISSING_PREFIX));
        have.refs = have.refs.filter((r) => want.refs.includes(r) || !isAssetRef(r));
        note = ` (refs to missing asset ${missing.join(', ')} not compared)`;
      }
      if (JSON.stringify(want) !== JSON.stringify(have)) { fail(`${ds}: ${d._id} drifted${note} — want ${JSON.stringify(want)} got ${JSON.stringify(have)}`); bad++; }
      else if (note) log(`  · ${ds}: ${d._id} matches${note}`);
    }
    if (!bad) ok(`${ds}: ${expected.length}/${expected.length} documents present; type, title, permalink, seo.slug and refs match`);
  }
}

async function seed() {
  for (const ds of allDatasets()) {
    const bad = strongDanglingRefs(ds);
    if (bad.length) throw new Error(`strong dangling reference(s) in ${ds} — Sanity would 409: ${bad.join('; ')}`);
  }
  if (VERIFY_ONLY) { await verify(); return; }
  const uploaded = await uploadAssets();
  const assetIds = Object.fromEntries(Object.entries(uploaded).map(([k, v]) => [k, v._id]));
  for (const ds of allDatasets()) {
    const body = mutationBody(ds, DRY_RUN ? undefined : assetIds);
    if (DRY_RUN) { log(`  (dry) ${ds}: createOrReplace ${body.mutations.length} doc(s) in one transaction`); continue; }
    const r = await mutate(ds, body);
    ok(`${ds}: transaction ${r.transactionId} — ${body.mutations.length} doc(s)`);
  }
  if (DRY_RUN) return;
  await verify(uploaded);
  writeEnvAliasOverride(overlayAliases(uploaded));
  ok(`aliases.${TEST_ENV}.json ← ${ASSET_SPECS.map((a) => a.alias).join(', ')}`);
}

/** Fixture hits still in a dataset: exact-prefix ids (every declared id has the prefix) + own assets. */
async function residue(ds) {
  const r = await query(ds, RESIDUE_QUERY);
  return r.docs + r.assets;
}

async function teardown() {
  // Documents first (secondary, then primary — the footer's strong refs go with their targets in
  // the same transaction), so no fixture document still references an asset when it is deleted.
  for (const ds of [DATASETS.secondary, DATASETS.primary]) {
    const ids = docIdsFor(ds);
    if (DRY_RUN) { log(`  (dry) ${ds}: delete ${ids.length} declared id(s)`); continue; }
    const r = await mutate(ds, deleteBody(ids));
    ok(`${ds}: deleted ${ids.length} declared id(s) (tx ${r.transactionId})`);
  }
  const deleted = new Set();
  const assets = await query(DATASETS.primary, OWN_ASSETS_QUERY);
  for (const a of assets) {
    const foreign = await query(DATASETS.primary, FOREIGN_REFERRERS_QUERY, { id: a._id });
    if (foreign > 0) { fail(`asset ${a._id} is referenced by ${foreign} non-fixture document(s) — left in place, overlay kept`); continue; }
    if (DRY_RUN) { log(`  (dry) delete asset ${a._id} (no non-fixture referrer)`); continue; }
    await mutate(DATASETS.primary, deleteBody([a._id]));
    deleted.add(a.originalFilename);
    ok(`asset ${a.originalFilename} deleted`);
  }
  for (const ds of allDatasets()) {
    if (DRY_RUN) { log(`  (dry) ${ds}: residue NOT verified — nothing was deleted; ${await residue(ds)} fixture hit(s) present now`); continue; }
    let left;
    try { left = await verifyRemoved(() => residue(ds), { strict: true }); }
    catch (e) { fail(`${ds}: residue UNKNOWN — the residue query failed (${String(e.message).slice(0, 200)})`); continue; }
    if (left === 0) ok(`${ds}: zero AGENT-TEST-6475 residue`); else fail(`${ds}: ${left} AGENT-TEST-6475 residue`);
  }
  // Clear an overlay entry when its asset was deleted in this run OR no longer exists (looked up by the
  // overlay id, so a sha1-deduplicated asset under another filename is covered). Keep it only while the
  // asset still exists (e.g. kept for a foreign referrer). A dry run clears nothing.
  if (DRY_RUN) return;
  const clear = {};
  for (const a of ASSET_SPECS) {
    const ovId = overlayAsset(a.alias)?.id || '';
    if (deleted.has(a.filename)) { clear[a.alias] = { id: '', url: '' }; continue; }
    if (!ovId) continue;
    const exists = await query(DATASETS.primary, 'count(*[_id == $id])', { id: ovId });
    if (exists === 0) { clear[a.alias] = { id: '', url: '' }; log(`  · ${a.alias}: overlay asset ${ovId} no longer exists — cleared`); }
    else log(`  · ${a.alias}: overlay asset ${ovId} still exists — kept`);
  }
  writeEnvAliasOverride(clear);
}

async function main() {
  console.log(`=== seed-sanity (VCST-6475)${TEARDOWN ? ' TEARDOWN' : ''}${DRY_RUN ? ' [dry-run]' : ''}${VERIFY_ONLY ? ' [verify-only]' : ''} ===`);
  if (!PROJECT) { log(`SKIP: {{${ENV.projectId}}} is not set for TEST_ENV=${TEST_ENV} — no QA Sanity project on this env.`); return; }
  // The risk gate is skipped only for --verify-only on the READ token; a fallback to the write token
  // (and every seed/teardown) goes through assertSafeRisk.
  const readOnly = VERIFY_ONLY && !TEARDOWN && TOKEN_LABEL === ENV.readToken;
  const risk = readOnly ? `TEST_ENV=${TEST_ENV} | read-only` : assertSafeRisk(`Sanity project {{${ENV.projectId}}}`);
  if (!TOKEN) {
    const need = VERIFY_ONLY ? `{{${ENV.readToken}}} or {{${ENV.writeToken}}}` : `{{${ENV.writeToken}}}`;
    console.error(`ABORT: ${need} is not set (.env.local).`); process.exit(2);
  }
  log(`Target: Sanity project {{${ENV.projectId}}} | ${risk} | token {{${TOKEN_LABEL}}} | datasets ${allDatasets().join(', ')}`);
  if (TEARDOWN) await teardown(); else await seed();
  if (failures.length) { console.error(`\nFAILED — ${failures.length} problem(s)`); process.exit(1); }
  if (DRY_RUN) log(`DRY RUN complete${TEARDOWN ? ' — nothing deleted, residue NOT verified' : ''}.`);
  else log(TEARDOWN ? 'Teardown complete.' : VERIFY_ONLY ? 'Verify complete.' : 'Seed complete.');
}
main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
