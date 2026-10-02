/**
 * scripts/seed-data/validate-orders-data.mjs
 *
 * STATIC drift guard for the order & quote state fixtures (VCST-5482, multi-env rule). Shares the
 * single source of truth orders-specs.mjs with the seeders and the unit tests, so the fixture,
 * the seeder, and this guard can never disagree. No network, no env — safe in CI.
 *
 * Checks (exit 1 on any hard problem):
 *   1. Each Swagger-shaped fixture (test-data/orders|quotes/*.json) parses, carries the required
 *      create-body keys, its `number`/`status` MATCH orders-specs.mjs (no drift), and contains NO
 *      runtime GUID (those live in aliases.<env>.json).
 *   2. Each owned @td() alias exists in aliases.json as a JSON-fixture alias (`json` → the fixture),
 *      and pins NO runtime GUID in the committed base (id belongs in the env overlay).
 *   3. (informational) The committed vcst overlay carries each alias id so @td(<ALIAS>.id) resolves.
 *
 * Usage:  npm run td:validate:orders
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  ORDER_FIXTURES, QUOTE_FIXTURES, ALL_FIXTURES, OWNED_ALIASES,
  validateFixtureShape, findGuidLeaks, GUID_RE,
  RETURN_ORDER_FIXTURES, RETURN_LINE_X_ALIAS, RETURN_WINDOW_DAYS_ASSUMED,
  validateReturnFixtureSet, validateReturnFixtureShape,
  suiteRowsConsuming, orderedFor, LINE_ROLE_X, LINE_ROLE_Y,
} from './orders-specs.mjs';
import {
  RETURN_DECISION_FIXTURES, DECISION_OWNED_ALIASES, DECISION_TEMPLATE_FIXTURE,
  validateDecisionFixtureSet, validateDecisionTemplate,
} from './return-decisions-specs.mjs';

/**
 * The env whose SEEDED STATE section [6] checks. Static checks ([1]–[5]) are env-agnostic; the
 * returns fixtures' age can only be judged against the overlay of the env they were seeded on.
 */
const TARGET_ENV = process.env.TEST_ENV || 'vcst';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const aliases = readJson('test-data/aliases.json');

// 1. Fixture shape + status match + no GUID leak.
console.log('\n[1] Order/quote JSON fixtures — shape, status match, no GUID leak');
for (const [kind, list] of [['order', ORDER_FIXTURES], ['quote', QUOTE_FIXTURES]]) {
  for (const spec of list) {
    const rel = `test-data/${spec.fixtureFile}`;
    if (!existsSync(join(ROOT, rel))) { fail(`${spec.alias}: fixture ${rel} missing`); continue; }
    let obj;
    try { obj = readJson(rel); } catch (e) { fail(`${spec.alias}: ${rel} is not valid JSON (${e.message})`); continue; }
    const { ok: shapeOk, problems: ps } = validateFixtureShape(spec, obj, kind);
    if (shapeOk) ok(`${spec.alias} (${spec.fixtureFile}) — ${kind} body valid, status "${obj.status}" matches spec, no GUID`);
    else ps.forEach((p) => fail(`${spec.alias}: ${p}`));
  }
}

// 2. Owned aliases are JSON-fixture aliases in the base registry, no pinned GUID.
console.log('\n[2] aliases.json — owned aliases are JSON-fixture-backed, no runtime GUID pinned');
for (const spec of ALL_FIXTURES) {
  const a = aliases[spec.alias];
  if (!a || typeof a !== 'object') { fail(`alias ${spec.alias} missing from aliases.json`); continue; }
  if (!a.json) { fail(`alias ${spec.alias} must be a JSON-fixture alias (needs a "json" pointer to ${spec.fixtureFile})`); continue; }
  const expectedJson = spec.fixtureFile.replace(/\.json$/, '');
  if (a.json !== expectedJson) fail(`alias ${spec.alias}.json = "${a.json}" — expected "${expectedJson}"`);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'fields' || k === 'notes' || k === 'json' || k.startsWith('_')) continue;
    if (typeof v === 'string' && GUID_RE.test(v)) fail(`alias ${spec.alias}.${k} pins a runtime GUID ("${v}") — move it to aliases.<env>.json`);
  }
  if (!problems.some((p) => p.includes(spec.alias))) ok(`${spec.alias} → json:${a.json} (no pinned GUID)`);
}

// 3. Informational: vcst overlay carries the runtime ids.
console.log('\n[3] (info) vcst overlay carries the seeded ids');
const vcstPath = join(ROOT, 'test-data', 'aliases.vcst.json');
if (existsSync(vcstPath)) {
  const overlay = JSON.parse(readFileSync(vcstPath, 'utf8'));
  for (const alias of OWNED_ALIASES) {
    const id = overlay[alias]?.id;
    if (id && GUID_RE.test(String(id))) ok(`aliases.vcst.json → ${alias}.id = ${id}`);
    else warn(`aliases.vcst.json has no ${alias}.id — @td(${alias}.id) won't resolve on vcst until \`npm run seed:orders\`/\`seed:quotes\` runs.`);
  }
} else warn('aliases.vcst.json absent — run seed:orders / seed:quotes to populate the overlay.');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 4-6. VCST-5628 — the returnable-quantity fixtures (buyer's own returns, step 1).
//
// These have a drift mode the order/quote fixtures do not: their delivery dates are RELATIVE, so a
// fixture set that was correct when it was seeded becomes WRONG purely by the passage of time — the
// "delivered today" orders age out of the store's return window and start reporting
// OUTSIDE_RETURN_WINDOW, and every case built on them flips from a real assertion to a vacuous one.
// A static-only guard cannot see that, so [6] measures the ACTUAL seeded instants recorded in
// aliases.<env>.json against the window. This is the check that makes "re-seed, never re-date" a gate
// rather than a comment.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n[4] Returns fixtures (VCST-5628) — spec table coherence + the divergences that make the cases decidable');
{
  const set = validateReturnFixtureSet();
  if (set.ok) ok(`spec table coherent — ${RETURN_ORDER_FIXTURES.length} fixtures, window ${RETURN_WINDOW_DAYS_ASSUMED}d, A2 ordered!=delivered, E straddles the boundary with unequal quantities, F pairs a cancelled line with a live one`);
  else set.problems.forEach((p) => fail(`returns spec: ${p}`));

  for (const spec of RETURN_ORDER_FIXTURES) {
    const rel = `test-data/${spec.fixtureFile}`;
    if (!existsSync(join(ROOT, rel))) { fail(`${spec.alias}: fixture ${rel} missing`); continue; }
    let obj;
    try { obj = readJson(rel); } catch (e) { fail(`${spec.alias}: ${rel} is not valid JSON (${e.message})`); continue; }
    const { ok: shapeOk, problems: ps } = validateReturnFixtureShape(spec, obj);
    if (shapeOk) ok(`${spec.alias} (${spec.fixtureFile}) — body valid, matches the spec, no literal date, no GUID`);
    else ps.forEach((p) => fail(`${spec.alias}: ${p}`));
  }
}

// 4b. A disposable fixture a whole suite drains (consumedBySuite) must be DEEPER than the suite. The
// floor is DERIVED from the suite CSV — one unit per row that references the alias — never transcribed,
// so a case added to the suite raises it and this check fails loud instead of the suite running dry.
console.log('\n[4b] Suite-consumed returns fixtures — each line deeper than the rows that drain it');
for (const spec of RETURN_ORDER_FIXTURES.filter((f) => f.consumedBySuite)) {
  const rel = spec.consumedBySuite;
  if (!existsSync(join(ROOT, rel))) { fail(`${spec.alias}: consumedBySuite ${rel} does not exist`); continue; }
  let rows;
  try { rows = parseCsv(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true }); } catch (e) { fail(`${spec.alias}: ${rel} does not parse (${e.message})`); continue; }
  const consumers = suiteRowsConsuming(spec.alias, rows.map((r) => ({ id: r.ID, text: Object.values(r).join('\n') })));
  if (!consumers.length) { fail(`${spec.alias}: no row of ${rel} references @td(${spec.alias}.…) — the fixture is consumed by nobody, or the suite went back to live-discovering an order`); continue; }
  const roles = [LINE_ROLE_X, LINE_ROLE_Y].filter((role) => orderedFor(spec, role) !== undefined);
  const shallow = roles.filter((role) => orderedFor(spec, role) < consumers.length);
  if (shallow.length) fail(`${spec.alias}: ${shallow.map((r) => `${r} ordered ${orderedFor(spec, r)}`).join(', ')} < ${consumers.length} consuming rows in ${rel} — one pass of the suite can drain it`);
  else ok(`${spec.alias} — ${consumers.length} rows of ${rel} consume it; lines ordered ${roles.map((r) => orderedFor(spec, r)).join(' / ')} (each >= ${consumers.length})`);
}

console.log('\n[5] aliases.json — returns aliases registered, no runtime GUID pinned in the committed base');
for (const spec of RETURN_ORDER_FIXTURES) {
  const a = aliases[spec.alias];
  if (!a) { fail(`alias ${spec.alias} missing from aliases.json`); continue; }
  const expectedJson = spec.fixtureFile.replace(/\.json$/, '');
  if (a.json !== expectedJson) { fail(`alias ${spec.alias}.json = "${a.json}" — expected "${expectedJson}"`); continue; }
  const pinned = Object.entries(a).filter(([k, v]) => typeof v === 'string' && GUID_RE.test(v) && k !== 'notes');
  if (pinned.length) { pinned.forEach(([k, v]) => fail(`alias ${spec.alias}.${k} pins a runtime GUID ("${v}") — move it to aliases.<env>.json`)); continue; }
  ok(`${spec.alias} → json:${a.json} (no pinned GUID)`);
}
{
  const lx = aliases[RETURN_LINE_X_ALIAS];
  if (!lx) fail(`alias ${RETURN_LINE_X_ALIAS} missing from aliases.json`);
  else if (!lx._inline) fail(`alias ${RETURN_LINE_X_ALIAS} must be _inline (its values are live-discovered per env, so they arrive via the overlay)`);
  else if (Object.entries(lx).some(([k, v]) => typeof v === 'string' && GUID_RE.test(v) && k !== 'notes')) fail(`alias ${RETURN_LINE_X_ALIAS} pins a runtime GUID in the committed base`);
  else ok(`${RETURN_LINE_X_ALIAS} → _inline, no committed product identity (live-discovered per env)`);
}

console.log(`\n[6] aliases.${TARGET_ENV}.json — what was ACTUALLY seeded, and whether it has aged out of the return window`);
{
  const overlayPath = join(ROOT, 'test-data', `aliases.${TARGET_ENV}.json`);
  if (!existsSync(overlayPath)) {
    warn(`aliases.${TARGET_ENV}.json absent — run \`TEST_ENV=${TARGET_ENV} npm run seed:returns\` before any case that uses these fixtures.`);
  } else {
    const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
    const now = Date.now();
    let seeded = 0;
    for (const spec of RETURN_ORDER_FIXTURES) {
      const o = overlay[spec.alias];
      if (!o?.id) { warn(`${spec.alias} not seeded on ${TARGET_ENV} — @td(${spec.alias}.id) will not resolve`); continue; }
      seeded++;
      if (!GUID_RE.test(String(o.id))) fail(`${spec.alias}.id "${o.id}" on ${TARGET_ENV} is not a platform GUID`);
      if (!o.lineXItemId) fail(`${spec.alias} on ${TARGET_ENV} has no lineXItemId — the seeder's phase-2 link did not record the line under test`);
      if (spec.cancelledLine && !o.cancelledLineItemId) fail(`${spec.alias} on ${TARGET_ENV} has no cancelledLineItemId`);
      // A two-eligible-lines fixture answers nothing the moment its two lines become interchangeable.
      // The spec table cannot see this — the products are live-discovered per env — so it is checked
      // here, against what was ACTUALLY seeded.
      if (spec.lineY) {
        if (!o.lineAItemId || !o.lineBItemId) {
          fail(`${spec.alias} on ${TARGET_ENV} is missing lineAItemId/lineBItemId — the bulk-reason and per-line-attachment cases address each line by its own id, so they cannot run. Re-seed.`);
        }
        if (o.lineASku && o.lineASku === o.lineBSku) {
          fail(`${spec.alias} on ${TARGET_ENV}: BOTH lines carry the same product ("${o.lineASku}") — a PER-LINE rule is now indistinguishable from a PER-RETURN one, which is exactly the distinction these cases exist to prove. Re-seed.`);
        }
        if (o.lineAOrderedQuantity && o.lineAOrderedQuantity === o.lineBOrderedQuantity) {
          fail(`${spec.alias} on ${TARGET_ENV}: both lines ordered ${o.lineAOrderedQuantity} — a bulk-applied reason landing on each line independently becomes undecidable. Re-seed.`);
        }
        if (o.lineADeliveredQuantity && o.lineADeliveredQuantity === o.lineBDeliveredQuantity) {
          fail(`${spec.alias} on ${TARGET_ENV}: both lines delivered ${o.lineADeliveredQuantity} — a per-line attachment hint cannot be told from a per-return one. Re-seed.`);
        }
      }

      const windowDays = o.windowDaysAtSeed || RETURN_WINDOW_DAYS_ASSUMED;
      const expectedOutside = spec.expect?.ineligibilityReason === 'OUTSIDE_RETURN_WINDOW';
      const dates = Object.values(o.deliveryDates || {}).filter(Boolean).map((d) => (now - new Date(d).getTime()) / 86400000);
      if (!dates.length) {
        if ((spec.shipments || []).some((s) => s.hasDeliveryDate)) fail(`${spec.alias} on ${TARGET_ENV} recorded no delivery date though the spec has ${spec.shipments.filter((s) => s.hasDeliveryDate).length}`);
        else ok(`${spec.alias} — no delivery date by design (${spec.key})`);
        continue;
      }
      const newest = Math.min(...dates);
      const oldest = Math.max(...dates);
      if (expectedOutside && newest < windowDays) {
        fail(`${spec.alias} DRIFTED: its delivery is now ${newest.toFixed(1)}d old, INSIDE the ${windowDays}-day window, but the fixture's whole purpose is to sit OUTSIDE it — the OUTSIDE_RETURN_WINDOW case is currently vacuous. Re-seed.`);
      } else if (!expectedOutside && newest >= windowDays) {
        fail(`${spec.alias} STALE: its latest delivery is ${newest.toFixed(1)}d old and has aged OUT of the ${windowDays}-day window — this fixture now reports OUTSIDE_RETURN_WINDOW instead of what it was built to test. Re-seed with \`TEST_ENV=${TARGET_ENV} npm run seed:returns\`.`);
      } else if (dates.length > 1 && !(oldest > windowDays && newest < windowDays)) {
        fail(`${spec.alias} no longer STRADDLES the ${windowDays}-day boundary (oldest ${oldest.toFixed(1)}d, newest ${newest.toFixed(1)}d) — "the window runs from the LATEST delivery" is untestable. Re-seed.`);
      } else {
        ok(`${spec.alias} → id ${o.id} | latest delivery ${newest.toFixed(1)}d old vs a ${windowDays}d window — still ${expectedOutside ? 'OUTSIDE (correct)' : 'inside (correct)'}`);
      }
    }
    const lx = overlay[RETURN_LINE_X_ALIAS];
    const needsLineY = RETURN_ORDER_FIXTURES.some((f) => f.lineY && overlay[f.alias]?.id);
    if (seeded && !lx?.sku) fail(`${RETURN_LINE_X_ALIAS} has no sku on ${TARGET_ENV} — @td(${RETURN_LINE_X_ALIAS}.sku) will not resolve`);
    else if (lx?.sku && lx.sku === lx.cancelledSku) fail(`${RETURN_LINE_X_ALIAS}: lineX and the cancelled line are the SAME product ("${lx.sku}") — fixture F's question is undecidable`);
    else if (needsLineY && !lx?.lineYSku) fail(`${RETURN_LINE_X_ALIAS} has no lineYSku on ${TARGET_ENV} though a two-eligible-lines fixture is seeded — the second line cannot be identified in returnableItems output`);
    else if (lx?.lineYSku && (lx.lineYSku === lx.sku || lx.lineYSku === lx.cancelledSku)) fail(`${RETURN_LINE_X_ALIAS}: lineY reuses the ${lx.lineYSku === lx.sku ? 'lineX' : 'cancelled-line'} product ("${lx.lineYSku}") — two roles collapsed onto one product`);
    else if (lx?.sku) ok(`${RETURN_LINE_X_ALIAS} → lineX ${lx.sku}, cancelled line ${lx.cancelledSku}, lineY ${lx.lineYSku ?? '(n/a)'} (distinct)`);
  }
}

// 7–9. VCST-5883 return-decision fixtures (return-decisions-specs.mjs). The divergences that make an
// approve/decline case able to FAIL are checked here, not in a unit test (FOURTH RULE).
console.log('\n[7] Return-decision fixtures (VCST-5883) — ordered != requested != approved, FR culture != order language, TWO returns unequal');
{
  const set = validateDecisionFixtureSet();
  if (set.ok) ok(`spec table coherent — ${RETURN_DECISION_FIXTURES.length} fixtures, every discriminating gap holds`);
  else set.problems.forEach((p) => fail(`decision fixtures: ${p}`));
}
console.log('\n[8] Return-decision template fixture — shape, no literal date, no runtime GUID');
{
  const rel = `test-data/${DECISION_TEMPLATE_FIXTURE}`;
  if (!existsSync(join(ROOT, rel))) fail(`${rel} missing`);
  else {
    const t = validateDecisionTemplate(readJson(rel));
    if (t.ok) ok(`${DECISION_TEMPLATE_FIXTURE} valid (lineX + lineY, one shipment delivered today, no date/GUID)`);
    else t.problems.forEach((p) => fail(`${DECISION_TEMPLATE_FIXTURE}: ${p}`));
  }
}
console.log(`\n[9] Return-decision aliases — registered _inline with no committed value; seeded state on ${TARGET_ENV}`);
{
  const overlayPath = join(ROOT, 'test-data', `aliases.${TARGET_ENV}.json`);
  const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
  for (const alias of DECISION_OWNED_ALIASES) {
    const a = aliases[alias];
    if (!a) { fail(`alias ${alias} missing from aliases.json`); continue; }
    if (!a._inline) fail(`alias ${alias} must be _inline (every value is runtime, from the overlay)`);
    else if (Object.entries(a).some(([k, v]) => typeof v === 'string' && GUID_RE.test(v) && k !== 'notes')) fail(`alias ${alias} pins a runtime GUID in the committed base`);
    else ok(`${alias} → _inline, no committed value`);
  }
  for (const spec of RETURN_DECISION_FIXTURES) {
    const o = overlay[spec.alias];
    if (!o?.orderId) { warn(`${spec.alias} not seeded on ${TARGET_ENV} — run \`TEST_ENV=${TARGET_ENV} npm run seed:returns:decisions\``); continue; }
    const missing = spec.returns.map((_, i) => (i === 0 ? 'returnId' : `return${i + 1}Id`)).filter((k) => !o[k]);
    if (missing.length) fail(`${spec.alias} on ${TARGET_ENV}: seeded order but no ${missing.join(', ')} — the case has nothing to decide`);
    if (spec.key === 'FR' && o.orderLanguageCode && o.orderLanguageCode === o.returnSubmissionCulture) fail(`${spec.alias} on ${TARGET_ENV}: order language == submission culture (${o.orderLanguageCode}) — the language-source question collapsed`);
    if (spec.lineX.measureUnit && o.lineAMeasureUnit !== spec.lineX.measureUnit) fail(`${spec.alias} on ${TARGET_ENV}: order line A measureUnit is ${JSON.stringify(o.lineAMeasureUnit)}, spec ${spec.lineX.measureUnit} — the unit in the notification is unobservable`);
  }
}

console.log('\n=== order/quote/returns fixture validation (VCST-5482 + VCST-5628 + VCST-5883) ===');
console.log(`  target env for the seeded-state checks: ${TARGET_ENV}`);
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nOrder/quote/returns fixture test-data OK — Swagger-shaped, spec-matched, multi-env-clean, in-window.');
process.exit(0);
