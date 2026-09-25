#!/usr/bin/env node
/**
 * scripts/seed-data/sales-rep/probe-demo-markers.mjs
 *
 * Prove that the demo dataset's hidden marker actually SURVIVES a round trip, per entity type.
 *
 * WHY THIS IS A GATE AND NOT A NICETY. The demo carries no visible family prefix, so `outerId` is
 * the only thing that lets teardown find an entity the ledger missed — an interrupted run, a
 * reverted overlay. `Address.OuterId` is proven (b2b/addresses-specs.mjs verified it against
 * vc-module-core), but `Member.OuterId` and `CustomerOrder.OuterId` were ASSUMED. If the platform's
 * FromModel/ToModel/Patch drops the field on create or on update, then:
 *
 *   - the marker is silently absent,
 *   - the orphan sweep finds nothing,
 *   - and teardown reports a clean sweep over entities that are still there.
 *
 * That is a false clean — the failure mode the whole two-layer design exists to avoid — and no
 * other check in the repo would notice it. Hence: run this before trusting a marker sweep on a new
 * deployment, and re-run it after a platform upgrade.
 *
 * SELF-CLEANING. It creates one throwaway Organization, one Contact and one CustomerOrder, all
 * named and marked as probes, then deletes them in the `finally` — so a crash mid-probe still
 * cleans up. Nothing it creates is ever left behind for a demo to trip over.
 *
 * Usage:
 *   TEST_ENV=virtostart node scripts/seed-data/sales-rep/probe-demo-markers.mjs
 *   TEST_ENV=virtostart node scripts/seed-data/sales-rep/probe-demo-markers.mjs --dry-run
 */

import {
  DRY_RUN, STORE_ID, assertSafeTarget, auth, api, log, verbose, idsParam,
} from '../../lib/seed-common.mjs';
import { DEMO_MARKER_PREFIX, isDemoMarker } from './sales-rep-demo-specs.mjs';

const STAMP = Date.now();
const MARK = `${DEMO_MARKER_PREFIX}:PROBE:${STAMP}`;
const PROBE_NAME = `zz-marker-probe-${STAMP}`;

/** One entity type's verdict. `dropped-on-update` is the nastiest: create looks fine, reseed loses it. */
const VERDICTS = {
  ROUND_TRIPS: 'round-trips',
  DROPPED_ON_CREATE: 'dropped-on-create',
  DROPPED_ON_UPDATE: 'dropped-on-update',
  NOT_SEARCHABLE: 'round-trips-but-not-searchable',
};

const cleanup = [];

/**
 * Create → GET → PUT (unrelated field) → GET. The second GET is the one that matters: a field the
 * platform accepts on POST but drops on Patch survives the first check and vanishes on the next
 * reseed, which is exactly when nobody is looking.
 */
async function probeMember(memberType) {
  const body = {
    memberType,
    name: PROBE_NAME,
    outerId: MARK,
    status: 'Active',
    ...(memberType === 'Contact' ? { firstName: 'Marker', lastName: 'Probe', fullName: PROBE_NAME } : {}),
  };
  const created = await api('POST', '/api/members', body);
  if (!created?.id) return { verdict: 'create-failed', detail: 'no id returned' };
  cleanup.push(['/api/members', created.id]);

  const afterCreate = await api('GET', `/api/members/${created.id}`);
  if (afterCreate?.outerId !== MARK) {
    return { verdict: VERDICTS.DROPPED_ON_CREATE, detail: `outerId came back ${JSON.stringify(afterCreate?.outerId)}` };
  }

  // Touch something else entirely; the marker must survive an update that never mentions it.
  await api('PUT', '/api/members', { ...afterCreate, status: 'Approved' }, { expectStatus: [200, 201, 204] });
  const afterUpdate = await api('GET', `/api/members/${created.id}`);
  if (afterUpdate?.outerId !== MARK) {
    return { verdict: VERDICTS.DROPPED_ON_UPDATE, detail: `outerId came back ${JSON.stringify(afterUpdate?.outerId)}` };
  }

  // Can teardown FIND it? Carrying the marker is useless if no search returns the row.
  const found = await api('POST', '/api/members/search', { memberType, keyword: PROBE_NAME, take: 10, deep: true }, { expectStatus: [200, 201] });
  const hit = (found?.results || []).find((m) => m.id === created.id);
  if (!hit) return { verdict: VERDICTS.NOT_SEARCHABLE, detail: 'keyword search did not return the probe row' };
  if (!isDemoMarker(hit.outerId)) {
    return { verdict: VERDICTS.NOT_SEARCHABLE, detail: `search row carries outerId ${JSON.stringify(hit.outerId)} — the sweep filters on this` };
  }
  return { verdict: VERDICTS.ROUND_TRIPS, detail: `id ${created.id}`, id: created.id };
}

async function probeOrder(customerId) {
  const number = `ZZPROBE-${STAMP}`;
  // customerId is server-REQUIRED (NotNullValidator on CustomerId) — an order cannot be created
  // without one, so the probe borrows the throwaway contact's id rather than inventing a value.
  const body = {
    number, outerId: MARK, storeId: STORE_ID, currency: 'USD', status: 'New',
    customerId, customerName: PROBE_NAME, total: 0, subTotal: 0, items: [],
  };
  const created = await api('POST', '/api/order/customerOrders', body);
  if (!created?.id) return { verdict: 'create-failed', detail: 'no id returned' };
  cleanup.push(['/api/order/customerOrders', created.id]);

  const afterCreate = await api('GET', `/api/order/customerOrders/${created.id}`);
  if (afterCreate?.outerId !== MARK) {
    return { verdict: VERDICTS.DROPPED_ON_CREATE, detail: `outerId came back ${JSON.stringify(afterCreate?.outerId)}` };
  }
  await api('PUT', '/api/order/customerOrders', { ...afterCreate, status: 'Processing' }, { expectStatus: [200, 201, 204] });
  const afterUpdate = await api('GET', `/api/order/customerOrders/${created.id}`);
  if (afterUpdate?.outerId !== MARK) {
    return { verdict: VERDICTS.DROPPED_ON_UPDATE, detail: `outerId came back ${JSON.stringify(afterUpdate?.outerId)}` };
  }
  return { verdict: VERDICTS.ROUND_TRIPS, detail: `id ${created.id}` };
}

async function main() {
  assertSafeTarget();
  if (DRY_RUN) {
    log('This probe must WRITE to prove anything — a dry run would report a verdict it never tested.');
    log('Re-run without --dry-run. It creates 3 throwaway rows and deletes them in a finally block.');
    process.exit(0);
  }
  await auth();
  log(`Marker round-trip probe — marker "${MARK}"`);

  const results = {};
  // Each type is probed independently and its THROW is captured, not propagated: one entity type
  // failing to create (a required field, a missing module) must not discard the verdicts already
  // earned by the others. The first draft let the order's 400 swallow two passing member results.
  const steps = [
    ['Organization', () => probeMember('Organization')],
    ['Contact', () => probeMember('Contact')],
    ['CustomerOrder', () => probeOrder(results.Contact?.id)],
  ];
  try {
    for (const [name, run] of steps) {
      try {
        results[name] = await run();
      } catch (e) {
        results[name] = { verdict: 'probe-error', detail: String(e.message).slice(0, 180) };
      }
    }
  } finally {
    // Always, even on a throw: a probe that leaves rows behind is worse than no probe.
    const byPath = new Map();
    for (const [path, id] of cleanup) byPath.set(path, [...(byPath.get(path) || []), id]);
    for (const [path, ids] of byPath) {
      await api('DELETE', `${path}?${idsParam(ids)}`, null, { expectStatus: [200, 204, 404] })
        .then(() => verbose(`cleaned ${ids.length} probe row(s) from ${path}`))
        .catch((e) => log(`  WARN: could not clean ${ids.length} probe row(s) from ${path}: ${e.message}`));
    }
  }

  log('');
  let bad = 0;
  for (const [type, r] of Object.entries(results)) {
    const ok = r.verdict === VERDICTS.ROUND_TRIPS;
    if (!ok) bad += 1;
    log(`${ok ? 'PASS' : 'FAIL'}  ${type.padEnd(14)} ${r.verdict}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  log('');
  if (bad) {
    log('A failing type CANNOT be swept by marker. Teardown for it is ledger-only, which means an');
    log('interrupted run or a lost overlay orphans its rows permanently. For orders the fallback is');
    log('an owner sweep by customerId; for members there is no fallback — fix the marker or accept');
    log('that orphans need `npm run sr:inventory` to find.');
    process.exit(1);
  }
  log('All marker types round-trip. The orphan sweep in seed-sales-rep-demo.mjs --teardown is sound.');
}

main().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
