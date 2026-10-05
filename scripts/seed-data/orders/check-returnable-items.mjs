#!/usr/bin/env node
/**
 * check-returnable-items.mjs — the ACCEPTANCE probe for the VCST-5628 returns fixtures.
 *
 * Signs in as the buyer the fixtures belong to and calls the feature's OWN query,
 * `returnableItems(orderId)`, once per seeded order, then prints the ACTUAL values beside the
 * spec table's expectations.
 *
 * IT REPORTS, IT DOES NOT ENFORCE. A disagreement between the live answer and
 * RETURN_ORDER_FIXTURES[].expect is a FINDING ABOUT THE FEATURE, and the fixtures are not to be
 * adjusted to make it agree — that would delete the evidence. The exit code is non-zero on a
 * disagreement so a pipeline notices, but the disagreement is printed either way.
 *
 * Read-only: no writes, safe on any env whose orders are already seeded.
 *
 * Usage:  TEST_ENV=<env> node scripts/seed-data/orders/check-returnable-items.mjs [--only <KEY>]
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, ROOT, BACK_URL, STORE_ID, ONLY,
} from '../../lib/seed-common.mjs';
import {
  RETURN_ORDER_FIXTURES, RETURN_LINE_X_ALIAS, returnOrderNumber,
  RETURN_OBSERVED_DIVERGENCE, isKnownDivergence,
} from './orders-specs.mjs';

const TARGET_ENV = process.env.TEST_ENV || 'vcst';

async function buyerToken(email, password) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access', storeId: STORE_ID }),
  });
  if (!res.ok) throw new Error(`buyer sign-in failed for ${email}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function gql(query, variables, token) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const RETURNABLE_QUERY = `query($id:String!){
  returnableItems(orderId:$id){
    orderLineItemId sku orderedQuantity deliveredQuantity returnableQuantity
    isReturnable ineligibilityReason deliveryDate returnableUntil
  }
}`;

async function main() {
  assertSafeTarget();
  await auth();

  const overlayPath = join(ROOT, 'test-data', `aliases.${TARGET_ENV}.json`);
  if (!existsSync(overlayPath)) throw new Error(`aliases.${TARGET_ENV}.json absent — seed first: TEST_ENV=${TARGET_ENV} npm run seed:returns`);
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
  const lineX = overlay[RETURN_LINE_X_ALIAS] || {};

  const email = process.env.USER_EMAIL;
  const token = await buyerToken(email, process.env.USER_PASSWORD);
  log(`Buyer: ${email} | lineX sku ${lineX.sku || '(unknown)'} | cancelled-line sku ${lineX.cancelledSku || '(n/a)'} | lineY sku ${lineX.lineYSku || '(n/a)'}`);

  const policy = await gql(`query($s:String!){ returnPolicy(storeId:$s){ isEnabled windowDays allowedOrderStatuses } }`, { s: STORE_ID }, token);
  log(`returnPolicy: ${JSON.stringify(policy?.data?.returnPolicy)}`);

  const specs = RETURN_ORDER_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  const disagreements = [];
  const knownFindings = [];

  for (const spec of specs) {
    const o = overlay[spec.alias];
    console.log(`\n── ${spec.key} · ${returnOrderNumber(spec.key)} · ${spec.alias}`);
    if (!o?.id) { console.log('   NOT SEEDED on this env'); disagreements.push(`${spec.key}: not seeded`); continue; }
    console.log(`   orderId ${o.id} | order status ${spec.orderStatus} | delivery offsets ${JSON.stringify(spec.shipments.map((s) => s.offsetDays))}`);

    const r = await gql(RETURNABLE_QUERY, { id: o.id }, token);
    if (r.errors) { console.log(`   ERRORS ${JSON.stringify(r.errors).slice(0, 400)}`); disagreements.push(`${spec.key}: query errored`); continue; }
    const items = r.data?.returnableItems || [];
    if (!items.length) { console.log('   returnableItems → [] (empty)'); }

    for (const it of items) {
      const role = it.sku === lineX.sku ? 'lineX' : (it.sku === lineX.cancelledSku ? 'cancelledLine' : (it.sku === lineX.lineYSku ? 'lineY' : 'other'));
      console.log(`   [${role}] sku=${it.sku} ordered=${it.orderedQuantity} delivered=${it.deliveredQuantity} returnable=${it.returnableQuantity} `
        + `isReturnable=${it.isReturnable} reason=${it.ineligibilityReason ?? 'null'} deliveryDate=${it.deliveryDate ?? 'null'} returnableUntil=${it.returnableUntil ?? 'null'}`);
    }

    const x = items.find((i) => i.sku === lineX.sku);
    const e = spec.expect;
    if (!x) { disagreements.push(`${spec.key}: lineX (${lineX.sku}) absent from returnableItems`); continue; }
    const diffs = [];
    const known = [];
    if (x.isReturnable !== e.isReturnable) diffs.push(`isReturnable ${x.isReturnable} != expected ${e.isReturnable}`);
    if (x.returnableQuantity !== e.returnableQuantity) {
      // A divergence this fixture set has ALREADY measured and recorded is reported as KNOWN, not as a
      // fresh surprise — but it is still reported and still fails the probe. An open finding stays loud.
      const msg = `returnableQuantity ${x.returnableQuantity} != expected ${e.returnableQuantity}`;
      if (isKnownDivergence(spec, 'returnableQuantity', x.returnableQuantity)) known.push(msg);
      else diffs.push(msg);
    }
    if (x.orderedQuantity !== e.orderedQuantity) diffs.push(`orderedQuantity ${x.orderedQuantity} != expected ${e.orderedQuantity}`);
    if (x.deliveredQuantity !== e.deliveredTotal) diffs.push(`deliveredQuantity ${x.deliveredQuantity} != expected ${e.deliveredTotal}`);
    if ((x.ineligibilityReason ?? null) !== e.ineligibilityReason) diffs.push(`ineligibilityReason ${x.ineligibilityReason ?? 'null'} != expected ${e.ineligibilityReason ?? 'null'}`);
    // A fixture with a SECOND eligible line is only interesting if BOTH lines answer — so the second
    // one is compared against its own expectation, never assumed to follow the first.
    if (spec.expectLineY) {
      const yExp = spec.expectLineY;
      const yRow = items.find((i) => i.sku === lineX.lineYSku);
      if (!yRow) diffs.push(`lineY (${lineX.lineYSku}) absent from returnableItems — this order reports 1 of 2 lines eligible, which is fixture F, not this one`);
      else {
        if (yRow.isReturnable !== yExp.isReturnable) diffs.push(`lineY isReturnable ${yRow.isReturnable} != expected ${yExp.isReturnable}`);
        if (yRow.returnableQuantity !== yExp.returnableQuantity) diffs.push(`lineY returnableQuantity ${yRow.returnableQuantity} != expected ${yExp.returnableQuantity}`);
        if (yRow.orderedQuantity !== yExp.orderedQuantity) diffs.push(`lineY orderedQuantity ${yRow.orderedQuantity} != expected ${yExp.orderedQuantity}`);
        if (yRow.deliveredQuantity !== yExp.deliveredTotal) diffs.push(`lineY deliveredQuantity ${yRow.deliveredQuantity} != expected ${yExp.deliveredTotal}`);
        if ((yRow.ineligibilityReason ?? null) !== yExp.ineligibilityReason) diffs.push(`lineY ineligibilityReason ${yRow.ineligibilityReason ?? 'null'} != expected ${yExp.ineligibilityReason ?? 'null'}`);
        if (x && yRow.returnableQuantity === x.returnableQuantity) {
          diffs.push(`both lines report returnableQuantity ${yRow.returnableQuantity} — the two lines are no longer distinguishable, so a PER-LINE rule cannot be told from a PER-RETURN one`);
        }
      }
    }
    if (spec.expectCancelled) {
      const c = items.find((i) => i.sku === lineX.cancelledSku);
      if (!c) diffs.push(`cancelled line (${lineX.cancelledSku}) absent from returnableItems`);
      else {
        if (c.isReturnable !== spec.expectCancelled.isReturnable) diffs.push(`cancelled line isReturnable ${c.isReturnable} != expected ${spec.expectCancelled.isReturnable}`);
        if ((c.ineligibilityReason ?? null) !== spec.expectCancelled.ineligibilityReason) diffs.push(`cancelled line reason ${c.ineligibilityReason ?? 'null'} != expected ${spec.expectCancelled.ineligibilityReason}`);
      }
    }
    if (known.length) { console.log(`   ! KNOWN DIVERGENCE (${RETURN_OBSERVED_DIVERGENCE.summary}): ${known.join(' | ')}`); knownFindings.push(`${spec.key}: ${known.join(' | ')}`); }
    if (diffs.length) { console.log(`   ✗ NEW DISAGREEMENT: ${diffs.join(' | ')}`); disagreements.push(`${spec.key}: ${diffs.join(' | ')}`); }
    if (!diffs.length && !known.length) console.log('   ✓ matches the spec table');
  }

  console.log(`\n=== returnableItems acceptance probe (${TARGET_ENV}) ===`);
  if (knownFindings.length) {
    console.log(`  ${knownFindings.length} KNOWN divergence(s) — recorded in orders-specs.mjs RETURN_OBSERVED_DIVERGENCE,`);
    console.log(`  open pending a product-owner call. NOT a reason to edit the fixtures or the expectations:`);
    knownFindings.forEach((d) => console.log(`   ! ${d}`));
  }
  if (disagreements.length) {
    console.log(`  ${disagreements.length} NEW disagreement(s) — these are FINDINGS, not fixtures to adjust:`);
    disagreements.forEach((d) => console.log(`   - ${d}`));
  }
  if (!disagreements.length && !knownFindings.length) { console.log('  all seeded fixtures answer exactly as the spec table says.'); return; }
  process.exitCode = 1;
}

main().catch((e) => { console.error('CHECK FAILED:', e.message); process.exit(1); });
