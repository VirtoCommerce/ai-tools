#!/usr/bin/env node
/**
 * scripts/seed-data/sales-rep/inventory-sales-rep.mjs
 *
 * Enumerate — and, on a second explicit call, DELETE — every sales-rep entity on an environment,
 * whatever created it. Built for the virtostart demo changeover: the demo dataset and the
 * AGENT-TEST fixture family cannot coexist on one environment, so the changeover has to start from
 * a verified-empty sales-rep surface rather than from "whatever the last seeder left".
 *
 * WHY THIS IS NOT JUST `seed:sales-rep:teardown`. That teardown deletes exactly the rows its CSVs
 * declare. The live environment holds MORE than that — reps and documents people created by hand in
 * the Admin UI, and orphans of CSV rows that were since deleted. A per-CSV teardown cannot see any
 * of it, so it reports a clean sweep over a surface that is still populated.
 *
 * TWO PHASES, because some of what this finds CANNOT BE RECREATED BY ANY SCRIPT:
 *
 *   A. INVENTORY (default, read-only) — enumerate, classify into four buckets, print the report
 *      `foreign`-first, write the full plan JSON to disk, and emit a CONFIRM TOKEN derived from the
 *      set of ids found.
 *   B. DELETE (`--delete --token <t>`) — re-enumerate, recompute the token, and ABORT if it differs.
 *      A changed token means the environment moved since the human read the report, so their
 *      approval no longer covers this set. Approving one list and deleting a different one is the
 *      failure this protocol exists to prevent.
 *
 * The four buckets, and what each costs to lose:
 *   protected    — an allowlisted real person's account (the demo reuses these). NEVER deleted.
 *   repo-seeded  — matches a committed CSV/spec row. Recreate with the `fixtures` profile.
 *   repo-family  — carries AGENT-TEST but no current CSV row (orphan of a deleted row).
 *   foreign      — carries neither marker. Hand-made. NOTHING IN THIS REPO CAN RECREATE IT,
 *                  which is why it prints first and needs an explicit `--include-foreign`.
 *
 * SAFETY, layered:
 *   - assertSafeTarget() — the standard ENV_RISK gate (seed-common.mjs).
 *   - `--delete` additionally requires `--env-confirm <TEST_ENV>` matching the live TEST_ENV. The
 *     overlay prune rewrites `test-data/aliases.<env>.json`, and that file is COMMITTED for vcst and
 *     the vcptcore envs — a prune run against the wrong env would blank the alias overlay every
 *     suite resolves `@td()` through, in a single commit.
 *   - Batch deletes go through idsParam() (repeated `ids=a&ids=b`). The comma-joined form returns
 *     200 and deletes nothing — a silent no-op that reports success.
 *   - No catalog list-entry call is made anywhere here, and none may be added: nothing in the
 *     sales-rep domain is a catalog entity, and `POST /api/catalog/listentries/delete` with an empty
 *     objectIds wipes the catalog (see deleteListEntries in seed-common.mjs).
 *
 * Usage:
 *   TEST_ENV=virtostart npm run sr:inventory
 *   TEST_ENV=virtostart npm run sr:inventory:delete -- --token <t> --env-confirm virtostart \
 *                                                      --include-foreign --include-orgs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  ROOT, BACK_URL, STORE_ID, DRY_RUN,
  assertSafeTarget, auth, api, log, verbose, loadCsv, idsParam,
} from '../../lib/seed-common.mjs';
import { isSeededDocument } from './sales-rep-docs-specs.mjs';
import { REP_ONLY_ORG } from './rep-only-org-specs.mjs';

const argv = process.argv.slice(2);
const flagValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);

const DELETE = argv.includes('--delete');
const TOKEN_ARG = flagValue('--token');
const ENV_CONFIRM = flagValue('--env-confirm');
const INCLUDE_FOREIGN = argv.includes('--include-foreign');
const INCLUDE_ORGS = argv.includes('--include-orgs');
const INCLUDE_ORG_ORDERS = argv.includes('--include-org-orders');
const OUT_ARG = flagValue('--out');

const TEST_ENV = process.env.TEST_ENV || 'vcst';

/** Legacy AGENT-TEST family marker, and the demo marker that replaces it. Neither is user-visible. */
const FAMILY_MARK = 'AGENT-TEST';
const DEMO_MARK = 'DEMO-SR';

/**
 * Accounts the demo REUSES — real people. Never deleted, never password-reset, never counted toward
 * residue. Sourced from the env so adding a person needs no code change; alla.volkova@virtoway.com
 * is the committed default because the demo brief names her explicitly.
 */
const PROTECTED_EMAILS = new Set(
  (process.env.SR_DEMO_PROTECTED_EMAILS || 'alla.volkova@virtoway.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .concat(
      [
        (process.env.SR_DEMO_REP_ZHUK_EMAIL || '').trim().toLowerCase(),
        (process.env.SR_DEMO_REP_VOLKOVA_EMAIL || '').trim().toLowerCase(),
      ].filter(Boolean),
    ),
);

const PAGING_PREFIX = 'AGENT-TEST-SR-Paging-';
const OWNER_NAME = 'AGENT-TEST-SR-Owner-Acme';

/**
 * Overlay keys the changeover prunes.
 *
 * Ownership is decided by the alias's SOURCE FILE in the committed `test-data/aliases.json` — any
 * entry reading from `sales-rep/**` is a sales-rep alias — and only falls back to the key name for
 * INLINE aliases, which declare no file. Naming is a proxy for ownership and a leaky one: the first
 * version of this prune matched `SR_ORDER_` and so missed `ORDER_REP_PLACED`, `ORDER_NOT_SERVED`
 * and `ORDER_BUYER_PLACED` — three aliases sourced from `sales-rep/sales-rep-orders` whose keys
 * happen not to start with `SR_`. They were left pointing at orders this tool had just deleted.
 *
 * Anchored so a demo `_demo_*` ledger key can never match.
 */
const OVERLAY_PRUNE_RE = /^(SR_REP_|SR_DOC_|SR_ORDER_|SR_STATS_|SR_ROWCAP_|SR_I18N_|SR_OWNER_)/;
const OVERLAY_PRUNE_EXACT = new Set(['ORG_REP_ONLY']);
const OVERLAY_OWNED_FILE_RE = /^sales-rep\//;

/** Every alias in the committed registry whose rows come from a sales-rep fixture file. */
function fileOwnedAliases() {
  const p = join(ROOT, 'test-data/aliases.json');
  if (!existsSync(p)) return new Set();
  try {
    const base = JSON.parse(readFileSync(p, 'utf8'));
    return new Set(
      Object.entries(base)
        .filter(([, v]) => OVERLAY_OWNED_FILE_RE.test(String(v?.file || '')))
        .map(([k]) => k),
    );
  } catch {
    return new Set();
  }
}

// ---- classification --------------------------------------------------------

const hasMark = (mark, vals) => vals.some((v) => String(v ?? '').toUpperCase().includes(mark));

/**
 * Four-way bucket. `declared` is the caller's "this matches a committed CSV/spec row" test; the
 * marker test is the fallback, so a row whose CSV entry was deleted still lands in `repo-family`
 * rather than being mistaken for someone's hand-made fixture.
 */
function classify({ declared, protectedHit, markerFields }) {
  if (protectedHit) return 'protected';
  if (declared) return 'repo-seeded';
  if (hasMark(FAMILY_MARK, markerFields) || hasMark(DEMO_MARK, markerFields)) return 'repo-family';
  return 'foreign';
}

// ---- enumeration -----------------------------------------------------------

/** Page a POST /search endpoint to exhaustion. `take` is kept low so a slow env still answers. */
async function pageSearch(path, body = {}, { take = 50, cap = 2000 } = {}) {
  const out = [];
  for (let skip = 0; skip < cap; ) {
    const res = await api('POST', path, { ...body, skip, take }, { expectStatus: [200, 201, 404] });
    const batch = res?.results || res?.items || [];
    out.push(...batch);
    skip += batch.length;
    if (batch.length < take || skip >= (res?.totalCount ?? skip)) break;
  }
  return out;
}

const allReps = () => pageSearch('/api/sales-rep/search');
const allDocuments = () => pageSearch('/api/sales-rep/documents/search');

/** A rep's persisted SalesRepLayout.* rows. Keyed on the ApplicationUser, so it does NOT cascade. */
async function layoutPrefs(userId) {
  if (!userId) return [];
  const res = await api('POST', '/api/customer-preferences/search', { userId, take: 100 }, { expectStatus: [200, 201, 404] });
  return (res?.results || res?.items || []).filter((p) => String(p?.name || '').startsWith('SalesRepLayout'));
}

/**
 * Orders attributed to a rep. Default scope is `customerIds` — the reps' own ApplicationUser ids.
 * An organizationIds sweep would also catch REAL BUYERS' orders in those organizations, which is a
 * different and much larger blast radius, so it is opt-in and reported as its own block.
 */
async function repOrders(userIds) {
  if (!userIds.length) return [];
  return pageSearch('/api/order/customerOrders/search', { customerIds: userIds });
}

async function orgOrders(orgIds) {
  if (!orgIds.length) return [];
  return pageSearch('/api/order/customerOrders/search', { organizationIds: orgIds });
}

async function findMemberByName(name) {
  const res = await api('POST', '/api/members/search', { keyword: name, take: 10, deep: true }, { expectStatus: [200, 201] });
  return (res?.results || []).find((m) => m.name === name) || null;
}

// ---- the plan --------------------------------------------------------------

/**
 * Build the full inventory. Pure enumeration + classification — no writes, safe to run against any
 * environment at any time.
 */
async function buildPlan() {
  const repRows = [
    ...loadCsv('test-data/sales-rep/sales-reps.csv'),
    ...loadCsv('test-data/sales-rep/document-reps.csv'),
  ];
  const declaredRepEmails = new Set(repRows.map((r) => String(r.email || '').toLowerCase()));
  const declaredRepNames = new Set(repRows.map((r) => r.full_name));
  const orderRows = loadCsv('test-data/sales-rep/sales-rep-orders.csv');
  const declaredOrderNumbers = new Set(orderRows.map((r) => `AGENT-TEST-${r.order_key}`));
  const adminRows = loadCsv('test-data/sales-rep/admin-users.csv');

  const plan = {
    env: TEST_ENV,
    host: new URL(BACK_URL).host,
    storeId: STORE_ID,
    generated: new Date().toISOString(),
    classes: {},
  };

  // 1. Reps ------------------------------------------------------------------
  const reps = await allReps();
  plan.classes.reps = reps.map((r) => {
    const email = String(r.email || r.userName || '').toLowerCase();
    return {
      id: r.id,
      userId: r.userId,
      name: r.fullName,
      email,
      organizationsCount: r.organizationsCount,
      createdDate: r.createdDate,
      bucket: classify({
        declared: declaredRepEmails.has(email) || declaredRepNames.has(r.fullName),
        protectedHit: PROTECTED_EMAILS.has(email),
        markerFields: [r.fullName, email, r.userName],
      }),
    };
  });

  // 2. Layout preferences (per rep; deleted BEFORE the rep — they do not cascade) ---------------
  plan.classes.layoutPrefs = [];
  for (const rep of plan.classes.reps) {
    if (rep.bucket === 'protected') continue;
    for (const p of await layoutPrefs(rep.userId)) {
      plan.classes.layoutPrefs.push({
        id: p.id, name: p.name, ownerUserId: rep.userId, ownerRep: rep.name, bucket: rep.bucket,
      });
    }
  }

  // 3. Orders ----------------------------------------------------------------
  const sweepableRepUserIds = plan.classes.reps
    .filter((r) => r.bucket !== 'protected' && r.userId)
    .map((r) => r.userId);
  const orders = await repOrders(sweepableRepUserIds);
  plan.classes.orders = orders.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    customerId: o.customerId,
    customerName: o.customerName,
    organizationName: o.organizationName,
    createdDate: o.createdDate,
    bucket: classify({
      declared: declaredOrderNumbers.has(o.number),
      protectedHit: false,
      markerFields: [o.number, o.customerName, o.outerId],
    }),
  }));

  if (INCLUDE_ORG_ORDERS) {
    const orgIds = [...new Set(orders.map((o) => o.organizationId).filter(Boolean))];
    const seen = new Set(orders.map((o) => o.id));
    plan.classes.orgOrders = (await orgOrders(orgIds))
      .filter((o) => !seen.has(o.id))
      .map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        customerName: o.customerName,
        organizationName: o.organizationName,
        createdDate: o.createdDate,
        bucket: classify({
          declared: declaredOrderNumbers.has(o.number),
          protectedHit: false,
          markerFields: [o.number, o.customerName, o.outerId],
        }),
      }));
  }

  // 4. Documents — the library is GLOBAL. There is no per-rep or per-org scoping. ---------------
  plan.classes.documents = (await allDocuments()).map((d) => ({
    id: d.id,
    fileId: d.fileId,
    name: d.displayName || d.name,
    category: d.category,
    size: d.size,
    createdDate: d.createdDate,
    bucket: classify({
      declared: isSeededDocument(d),
      protectedHit: false,
      markerFields: [d.name, d.displayName, d.category],
    }),
  }));

  // 5. Repo-owned served orgs (paging orgs, the rep-only org, the ACME owner contact) ------------
  plan.classes.orgs = [];
  for (let i = 1; i <= 20; i += 1) {
    const name = `${PAGING_PREFIX}${String(i).padStart(2, '0')}`;
    const m = await findMemberByName(name);
    if (m?.id) plan.classes.orgs.push({ id: m.id, name, kind: 'paging-org', bucket: 'repo-seeded' });
  }
  for (const name of [REP_ONLY_ORG.name, OWNER_NAME]) {
    const m = await findMemberByName(name);
    if (m?.id) {
      plan.classes.orgs.push({
        id: m.id, name, kind: name === OWNER_NAME ? 'owner-contact' : 'rep-only-org', bucket: 'repo-seeded',
      });
    }
  }

  // 6. Restricted admin users + their roles (suite 092 fixtures) ---------------------------------
  plan.classes.adminUsers = [];
  plan.classes.adminRoles = [];
  for (const row of adminRows) {
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.email)}`, null, { expectStatus: [200, 404] });
    if (u?.id) plan.classes.adminUsers.push({ id: u.id, userName: row.user_name, email: row.email, bucket: 'repo-seeded' });
    const search = await api('POST', '/api/platform/security/roles/search', { keyword: row.role_name, take: 20 }, { expectStatus: [200, 201] });
    const role = (search?.results || search?.roles || []).find((r) => r.name === row.role_name);
    if (role?.id) plan.classes.adminRoles.push({ id: role.id, name: row.role_name, bucket: 'repo-seeded' });
  }

  plan.token = confirmToken(plan);
  return plan;
}

/**
 * The approval token — a digest of every id this plan would touch. Recomputed before deleting; a
 * mismatch means the environment changed since the human read the report, so the approval is void.
 * Deliberately NOT a timestamp or a run id: it must change when, and only when, the SET changes.
 */
function confirmToken(plan) {
  const ids = [];
  for (const [cls, rows] of Object.entries(plan.classes)) {
    for (const r of rows) if (r.bucket !== 'protected') ids.push(`${cls}:${r.id}`);
  }
  return createHash('sha256').update(ids.sort().join('|')).digest('hex').slice(0, 8);
}

// ---- reporting -------------------------------------------------------------

const BUCKET_ORDER = ['foreign', 'repo-family', 'repo-seeded', 'protected'];
const BUCKET_NOTE = {
  foreign: 'HAND-MADE — no script in this repo can recreate these. Deleting is irreversible.',
  'repo-family': 'AGENT-TEST marker, no current CSV row. Recreate only by restoring the CSV row.',
  'repo-seeded': 'Declared in a committed CSV/spec. Recreate with the `fixtures` profile.',
  protected: 'Reused real accounts. NEVER deleted by this tool.',
};

function report(plan) {
  console.log(`\n=== sales-rep inventory — ${plan.host} (TEST_ENV=${plan.env}) ===`);
  console.log(`    generated ${plan.generated}\n`);

  for (const bucket of BUCKET_ORDER) {
    const rows = [];
    for (const [cls, items] of Object.entries(plan.classes)) {
      for (const r of items) if (r.bucket === bucket) rows.push({ cls, ...r });
    }
    if (!rows.length) continue;
    console.log(`── ${bucket.toUpperCase()} (${rows.length}) ──`);
    console.log(`   ${BUCKET_NOTE[bucket]}`);
    for (const r of rows) {
      const label = r.name || r.number || r.userName || r.id;
      const extra = [r.email, r.category, r.status, r.organizationName].filter(Boolean).join(' · ');
      console.log(`   [${r.cls}] ${label}${extra ? `  (${extra})` : ''}  ${r.createdDate || ''}  id=${r.id}`);
    }
    console.log('');
  }

  const counts = Object.fromEntries(Object.entries(plan.classes).map(([k, v]) => [k, v.length]));
  console.log(`Totals: ${JSON.stringify(counts)}`);
  console.log(`Confirm token: ${plan.token}\n`);
}

function writePlanFile(plan) {
  const out = OUT_ARG
    || join(ROOT, '.fix-workspace', 'sr-inventory', `sr-inventory-${plan.env}-${Date.now()}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
  return out;
}

// ---- delete ----------------------------------------------------------------

/** Which buckets this invocation may delete. `protected` is never in the set. */
function deletableBuckets() {
  const set = new Set(['repo-seeded', 'repo-family']);
  if (INCLUDE_FOREIGN) set.add('foreign');
  return set;
}

const pick = (plan, cls, allowed) => (plan.classes[cls] || []).filter((r) => allowed.has(r.bucket));

async function deleteBatch(label, rows, path) {
  if (!rows.length) { verbose(`${label}: nothing to delete`); return 0; }
  if (DRY_RUN) { log(`[DRY] ${label}: would delete ${rows.length}`); return rows.length; }
  // Chunked so a long id list cannot blow the URL length limit on a large sweep.
  for (let i = 0; i < rows.length; i += 25) {
    const chunk = rows.slice(i, i + 25);
    await api('DELETE', `${path}?${idsParam(chunk.map((r) => r.id))}`, null, { expectStatus: [200, 204, 404] });
  }
  log(`${label}: deleted ${rows.length}`);
  return rows.length;
}

/**
 * Children before parents. Two orderings here are load-bearing:
 *   - layout preferences BEFORE reps — the row is keyed on the ApplicationUser, which the rep delete
 *     cascades away; afterwards there is no id left to delete it by.
 *   - orders BEFORE reps — an order references the rep's ApplicationUser as its customerId.
 * Deleting a rep cascades its ApplicationUser and its served-org OrganizationMemberships.
 */
async function runDelete(plan) {
  const allowed = deletableBuckets();
  log(`Deleting buckets: ${[...allowed].join(', ')}${INCLUDE_ORGS ? ' (+ repo-owned orgs)' : ''}`);

  await deleteBatch('layout preferences', pick(plan, 'layoutPrefs', allowed), '/api/customer-preferences');
  await deleteBatch('orders', pick(plan, 'orders', allowed), '/api/order/customerOrders');
  if (INCLUDE_ORG_ORDERS) {
    await deleteBatch('org-scoped orders', pick(plan, 'orgOrders', allowed), '/api/order/customerOrders');
  }
  await deleteBatch('documents', pick(plan, 'documents', allowed), '/api/sales-rep/documents');
  await deleteBatch('sales reps', pick(plan, 'reps', allowed), '/api/sales-rep');

  if (INCLUDE_ORGS) await deleteBatch('repo-owned orgs/contacts', pick(plan, 'orgs', allowed), '/api/members');
  else log('repo-owned orgs/contacts: SKIPPED (pass --include-orgs to sweep paging orgs + the rep-only org)');

  for (const u of pick(plan, 'adminUsers', allowed)) {
    if (!DRY_RUN) {
      await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(u.userName)}`, null, { expectStatus: [200, 204, 404] });
    }
    log(`admin user deleted: ${u.userName}`);
  }
  await deleteBatch('admin roles', pick(plan, 'adminRoles', allowed), '/api/platform/security/roles');
}

// ---- overlay prune ---------------------------------------------------------

/**
 * Remove the pruned entities' GUIDs from `test-data/aliases.<env>.json`. MANDATORY, not cosmetic:
 * `td:reconcile` check [11] probes every overlay member GUID for liveness, so a stale SR_* entry
 * left behind after the wipe is a permanent red that says nothing about the environment.
 *
 * Precedent: clearWhiteLabelingAliases() in scripts/lib/user-provision.mjs.
 */
function pruneOverlay() {
  const path = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  if (!existsSync(path)) { log(`overlay prune: no aliases.${TEST_ENV}.json — skipped`); return 0; }
  let cur;
  try {
    cur = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    log(`WARN overlay prune: aliases.${TEST_ENV}.json is unparsable (${e.message}) — left untouched`);
    return 0;
  }
  const owned = fileOwnedAliases();
  const removed = Object.keys(cur).filter(
    (k) => owned.has(k) || OVERLAY_PRUNE_RE.test(k) || OVERLAY_PRUNE_EXACT.has(k),
  );
  if (!removed.length) { log('overlay prune: nothing to remove'); return 0; }
  if (DRY_RUN) { log(`[DRY] overlay prune: would remove ${removed.length} key(s)`); return removed.length; }
  for (const k of removed) delete cur[k];
  writeFileSync(path, `${JSON.stringify(cur, null, 2)}\n`);
  log(`overlay prune: removed ${removed.length} key(s) from test-data/aliases.${TEST_ENV}.json`);
  return removed.length;
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();

  if (DELETE) {
    // The overlay this run rewrites is COMMITTED for vcst/vcptcore. An env mismatch here would blank
    // the alias file every suite resolves @td() through, so it is a hard stop, not a warning.
    if (!ENV_CONFIRM || ENV_CONFIRM !== TEST_ENV) {
      console.error(`ABORT: --delete requires --env-confirm ${TEST_ENV} (got ${ENV_CONFIRM || 'nothing'}).`);
      console.error('  This run rewrites test-data/aliases.<env>.json, which is committed for the QA envs.');
      process.exit(2);
    }
    if (!TOKEN_ARG) {
      console.error('ABORT: --delete requires --token <t> from a preceding `npm run sr:inventory` run.');
      process.exit(2);
    }
  }

  await auth();
  const plan = await buildPlan();
  report(plan);

  if (!DELETE) {
    const out = writePlanFile(plan);
    console.log(`Plan written to ${out}`);
    console.log('  This file is the ONLY record that the `foreign` entities existed. Archive it before deleting.\n');
    console.log('To delete, review the report above, then run:');
    console.log(`  TEST_ENV=${TEST_ENV} npm run sr:inventory:delete -- --token ${plan.token} --env-confirm ${TEST_ENV} [--include-foreign] [--include-orgs]\n`);
    return;
  }

  if (plan.token !== TOKEN_ARG) {
    console.error(`ABORT: confirm token mismatch — approved ${TOKEN_ARG}, environment now hashes to ${plan.token}.`);
    console.error('  The sales-rep surface changed since the inventory you approved. Re-run `npm run sr:inventory`,');
    console.error('  read the new report, and approve that set instead.');
    process.exit(2);
  }

  const out = writePlanFile(plan);
  log(`Pre-delete plan archived to ${out}`);
  await runDelete(plan);
  pruneOverlay();

  // Audit: re-enumerate and report residue per class, excluding protected accounts.
  // Skipped under --dry-run, where nothing was deleted: the audit would re-find every row and
  // report the whole plan as residue, which reads as a failure of a run that did exactly its job.
  if (DRY_RUN) { console.log('\nDry run complete — no writes were made, so no residue audit.'); return; }
  const after = await buildPlan();
  const allowed = deletableBuckets();
  let residue = 0;
  for (const [cls, rows] of Object.entries(after.classes)) {
    const left = rows.filter((r) => allowed.has(r.bucket));
    if (left.length) { log(`WARN residue: ${cls} still holds ${left.length} deletable row(s)`); residue += left.length; }
  }
  console.log(residue === 0
    ? '\nTeardown complete — zero residue in every deletable bucket.'
    : `\nTeardown finished with ${residue} residual row(s). Re-run the inventory to see what is left.`);
}

main().catch((e) => { console.error('INVENTORY FAILED:', e.message); process.exit(1); });
