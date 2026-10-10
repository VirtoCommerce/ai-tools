/**
 * return-decisions-specs.mjs — VCST-5883, BUYER'S OWN RETURNS step 2: the agent approves / declines a
 * submitted return PER LINE, and the buyer is notified (email + push).
 *
 * SINGLE SOURCE OF TRUTH, side-effect-free (no env load, no network): imported by the seeder
 * (seed-return-decisions.mjs), the read-only reconcile probe (check-return-decisions.mjs) and the drift
 * guard (validate-orders-data.mjs §7–§9). Also declares the dedicated buyer (DECISION_BUYER).
 *
 * WHY A SIBLING OF orders-specs.mjs, NOT MORE ROWS IN IT: the step-1 family (RETURN_ORDER_FIXTURES)
 * answers "what is returnable"; this family answers "what happens to a return that was SUBMITTED".
 * Every fixture here therefore carries a second entity — one or two returns sitting in status
 * `Requested` — that step 1 never creates. The order half reuses step 1's builders unchanged
 * (finalizeReturnOrderBody, buildReturnPhase2Body, diagnoseSeededOrder), so the two families cannot
 * drift apart in how an order is shaped.
 *
 * THE DECISION IS NEVER SEEDED. The seeder stops at `Requested` (or `New`, for the admin-created
 * legacy return). Approving, declining and partially approving are what the TESTS perform; a
 * pre-decided return would be a fixture that has already answered the question it exists to ask.
 * A decided return is TERMINAL, so the seeder detects one and rebuilds that fixture from scratch:
 * every alias is re-seedable per run.
 *
 * THE SECOND RULE, per fixture — the quantities DIVERGE across every distinction under test:
 *   ordered  !=  requested  !=  (what the test will approve)
 * so an implementation that approved the ordered quantity, or the requested one, or wrote the
 * approved quantity onto the wrong line, produces an observation that differs from the right one.
 * validateDecisionFixtureSet() fails the build when any of those gaps collapses.
 */
import {
  LINE_ROLE_X, LINE_ROLE_Y, RETURN_ORDER_MARK, RETURN_ALLOWED_STATUS, stripFixtureMeta,
} from './orders-specs.mjs';

/** Order-number prefix. Distinct from step 1's `AGENT-TEST-ORD-RET-<A..G>` so neither teardown sweeps the other. */
export const DECISION_ORDER_MARK = `${RETURN_ORDER_MARK}-DEC`;
export const decisionOrderNumber = (key) => `${DECISION_ORDER_MARK}-${key}`;
/** Stamped on every seeded return's customerReference — the handle the teardown sweeps by. */
export const DECISION_RETURN_REF_MARK = 'AGENT-TEST-RET-DEC';
export const decisionReturnRef = (key, ref) => `${DECISION_RETURN_REF_MARK}-${key}-${ref}`;

export const DECISION_TEMPLATE_FIXTURE = 'orders/returns/return-decision-order.json';

/** How a return reaches its seeded state. */
export const VIA_XAPI = 'xapi-buyer';       // createReturn -> updateReturn(attachments) -> submitReturn, buyer token
export const VIA_ADMIN_PUT = 'admin-put';   // legacy PUT /api/return with no id, admin token

/** Status each creation path must leave the return in. Anything else is a fixture that did not take. */
export const SEEDED_STATUS = Object.freeze({ [VIA_XAPI]: 'Requested', [VIA_ADMIN_PUT]: 'New' });

/**
 * The spec table.
 *   lineX / lineY   — { ordered, measureUnit? } ; lineY absent ⇒ single-line order
 *   orderLanguage   — the ORDER's languageCode
 *   returns[]       — { ref, via, cultureName?, lines: { <role>: requestedQty } }
 *   decisionUnderTest — what the test case will do. INFORMATIONAL for the seeder (it never
 *                     authorizes); the drift guard uses it to prove ordered != requested != approved.
 */
export const RETURN_DECISION_FIXTURES = [
  {
    key: 'PARTIAL',
    alias: 'RETURNS_AUTH_PARTIAL_LINE',
    purpose: 'Partial approval of ONE line and full rejection of the other in one decision. Line A: ordered 500 box, '
      + 'requested 240, the test approves 200 — three different numbers, so approving the ordered or the requested '
      + 'quantity is observable. Line B: requested the full 12, the test approves 0.',
    orderLanguage: 'en-US',
    lineX: { ordered: 500, measureUnit: 'box' },
    lineY: { ordered: 12 },
    returns: [{ ref: 'R1', via: VIA_XAPI, lines: { [LINE_ROLE_X]: 240, [LINE_ROLE_Y]: 12 } }],
    decisionUnderTest: { [LINE_ROLE_X]: 200, [LINE_ROLE_Y]: 0 },
  },
  {
    key: 'MIXED',
    alias: 'RETURNS_AUTH_MIXED',
    purpose: 'Approve one line in full and reject the other. Ordered > requested on BOTH lines (8/5, 6/4), so a full '
      + 'approval of the requested quantity is distinguishable from one of the ordered quantity.',
    orderLanguage: 'en-US',
    lineX: { ordered: 8 },
    lineY: { ordered: 6 },
    returns: [{ ref: 'R1', via: VIA_XAPI, lines: { [LINE_ROLE_X]: 5, [LINE_ROLE_Y]: 4 } }],
    decisionUnderTest: { [LINE_ROLE_X]: 5, [LINE_ROLE_Y]: 0 },
  },
  {
    key: 'REJECT',
    alias: 'RETURNS_AUTH_REJECT',
    purpose: 'Reject the whole return (every line approved 0). Both lines requested PARTIALLY (7 of 9, 3 of 4) so a '
      + 'rejection that released the ORDERED quantity back to returnable is observable against one that released the requested.',
    orderLanguage: 'en-US',
    lineX: { ordered: 9 },
    lineY: { ordered: 4 },
    returns: [{ ref: 'R1', via: VIA_XAPI, lines: { [LINE_ROLE_X]: 7, [LINE_ROLE_Y]: 3 } }],
    decisionUnderTest: { [LINE_ROLE_X]: 0, [LINE_ROLE_Y]: 0 },
  },
  {
    key: 'SINGLE',
    alias: 'RETURNS_AUTH_SINGLE',
    purpose: 'Minimal return — one line, quantity 1 of 1. The boundary: approve-all and approve-partial cannot both '
      + 'exist here, so it is the fixture for "full approval" and the lower BVA edge of approvedQuantity.',
    orderLanguage: 'en-US',
    lineX: { ordered: 1 },
    returns: [{ ref: 'R1', via: VIA_XAPI, lines: { [LINE_ROLE_X]: 1 } }],
    decisionUnderTest: { [LINE_ROLE_X]: 1 },
    // ordered == requested == approved is the POINT of this fixture (boundary), not an accident.
    allowEqualQuantities: true,
  },
  {
    key: 'FR',
    alias: 'RETURNS_AUTH_FR',
    purpose: 'Notification language. The ORDER is de-DE; the return is created with cultureName fr-FR. Two candidate '
      + 'sources of Return.LanguageCode exist (order language vs submission culture) and they DISAGREE here, so the '
      + 'language the decision email renders in names its own source.',
    orderLanguage: 'de-DE',
    lineX: { ordered: 3 },
    returns: [{ ref: 'R1', via: VIA_XAPI, cultureName: 'fr-FR', lines: { [LINE_ROLE_X]: 2 } }],
    decisionUnderTest: { [LINE_ROLE_X]: 1 },
  },
  {
    key: 'TWO',
    alias: 'RETURNS_AUTH_TWO_RETURNS',
    purpose: 'Two Requested returns by the same buyer on the SAME line, 6 + 4 = the ordered 10. Deciding one must not '
      + 'touch the other, and a rejection of one must release exactly ITS quantity (6 or 4, never 10) back to returnable.',
    orderLanguage: 'en-US',
    lineX: { ordered: 10 },
    returns: [
      { ref: 'R1', via: VIA_XAPI, lines: { [LINE_ROLE_X]: 6 } },
      { ref: 'R2', via: VIA_XAPI, lines: { [LINE_ROLE_X]: 4 } },
    ],
    decisionUnderTest: { [LINE_ROLE_X]: 3 },
  },
  {
    key: 'DUP',
    alias: 'RETURNS_AUTH_DUP_LINE',
    purpose: 'A plain Requested return of 5 of a 5-unit single line. The TEST adds a duplicate return line for the same '
      + 'order line through the admin PUT and then decides — the seeder deliberately does NOT add it, so the duplicate '
      + 'is created by the case that asserts on it and the fixture stays a valid baseline.',
    orderLanguage: 'en-US',
    lineX: { ordered: 5 },
    returns: [{ ref: 'R1', via: VIA_XAPI, lines: { [LINE_ROLE_X]: 5 } }],
    decisionUnderTest: { [LINE_ROLE_X]: 5 },
    // Full quantity on purpose: the distinction under test is ONE line vs a DUPLICATED line (the case
    // adds it), so a second requested quantity smaller than the ordered one would add nothing here.
    allowEqualQuantities: true,
  },
  {
    key: 'JOURNEY',
    alias: 'RETURNS_AUTH_JOURNEY',
    purpose: 'A fresh Completed + delivered order with two eligible lines (7 and 5) and NO return — the [JOURNEY] case '
      + 'submits through the storefront UI, which is the mechanism under test there.',
    orderLanguage: 'en-US',
    lineX: { ordered: 7 },
    lineY: { ordered: 5 },
    returns: [],
    decisionUnderTest: null,
  },
  {
    key: 'ADMIN',
    alias: 'RETURNS_AUTH_NEW_ADMIN',
    purpose: 'A return created by an ADMIN through the legacy REST path (PUT /api/return, no id) — status New, not '
      + 'Requested. Asks whether the per-line decision applies to a return that never went through submitReturn.',
    orderLanguage: 'en-US',
    lineX: { ordered: 4 },
    returns: [{ ref: 'R1', via: VIA_ADMIN_PUT, lines: { [LINE_ROLE_X]: 3 } }],
    decisionUnderTest: { [LINE_ROLE_X]: 2 },
  },
];

/**
 * The DEDICATED buyer every decision fixture belongs to. Never the env persona `USER`: seeding sends
 * ~20 order/return notifications to the buyer, and USER_EMAIL is a real mailbox on some machines. A public
 * yopmail inbox, AGENT-TEST-named contact (sweepable), NO organization, password from the layered env
 * (`{{DEFAULT_TEST_PASSWORD}}`, never a literal). The seeder find-or-creates it (user-provision
 * ensurePersonalAccount); cases sign in as it with `[AUTH role=RETURNS_AUTH_BUYER]`.
 */
export const DECISION_BUYER = Object.freeze({
  alias: 'RETURNS_AUTH_BUYER',
  email: 'agent-test-retdec-buyer@yopmail.com',
  firstName: 'AGENT-TEST-RetDec',
  lastName: 'Buyer',
  passwordVar: 'DEFAULT_TEST_PASSWORD',
});
export const DECISION_BUYER_PASSWORD_TOKEN = `{{${DECISION_BUYER.passwordVar}}}`;
/** Fail-closed guard (PURE): the seeder refuses to write as anyone but the dedicated AGENT-TEST yopmail buyer. */
export function isDedicatedDecisionBuyer(email) {
  const e = String(email || '').toLowerCase();
  return e === DECISION_BUYER.email && e.startsWith('agent-test-') && e.endsWith('@yopmail.com');
}

export const DECISION_COLLEAGUE_ALIAS = 'RETURNS_COLLEAGUE';
export const DECISION_OWNED_ALIASES = [...RETURN_DECISION_FIXTURES.map((f) => f.alias), DECISION_COLLEAGUE_ALIAS];

/** The roles a spec row actually has lines for, in body order (PURE). */
export function rolesOf(spec) {
  return [LINE_ROLE_X, ...(spec.lineY ? [LINE_ROLE_Y] : [])];
}

/**
 * The step-1 builders expect a step-1-shaped spec (key, orderStatus, lineX, lineY, shipments). Derive
 * one from a decision row (PURE): everything delivered TODAY in one shipment, delivered == ordered.
 * `key` is prefixed so returnOrderNumber(key) === decisionOrderNumber(spec.key) — diagnoseSeededOrder
 * checks the number through that function.
 */
export function toOrderSpec(spec) {
  const deliveredByRole = {};
  for (const role of rolesOf(spec)) deliveredByRole[role] = spec[role].ordered;
  return {
    key: `DEC-${spec.key}`,
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: spec.lineX.ordered },
    ...(spec.lineY ? { lineY: { ordered: spec.lineY.ordered } } : {}),
    shipments: [{ key: 'S1', offsetDays: 0, hasDeliveryDate: true, status: 'Delivered', deliveredByRole }],
    expect: { ineligibilityReason: null },
  };
}

/**
 * Shape the shared template into THIS fixture's create body, before step 1's finalizeReturnOrderBody
 * stamps status / quantities / dates (PURE). Renames every number off the order number, drops the
 * lines the spec does not have, sets the order language and each line's measure unit, and recomputes
 * the money totals from what is left (so a single-line order does not claim a two-line total).
 */
export function shapeDecisionTemplate(spec, template) {
  const body = structuredClone(template);
  const number = decisionOrderNumber(spec.key);
  const roles = new Set(rolesOf(spec));
  body.number = number;
  body.languageCode = spec.orderLanguage;
  body.items = (body.items || []).filter((it) => roles.has(it._role)).map((it) => {
    const line = spec[it._role];
    const out = { ...it, quantity: line.ordered };
    if (line.measureUnit) out.measureUnit = line.measureUnit; else delete out.measureUnit;
    return out;
  });
  const total = body.items.reduce((n, it) => n + (it.price || 0) * it.quantity, 0);
  body.total = total; body.subTotal = total; body.subTotalWithTax = total;
  for (const s of body.shipments || []) {
    const k = s._shipmentKey || 'S1';
    s.number = `${number}-${k}`;
    s.trackingNumber = `AGENT-TEST-TRK-${number.replace(/^AGENT-TEST-/, '')}-${k}`;
  }
  (body.inPayments || []).forEach((p, i) => { p.number = `${number}-P${i + 1}`; p.sum = total; });
  return body;
}

/**
 * Build the xAPI line inputs for ONE return spec (PURE). `lineIdByRole` maps a role to the ORDER line
 * id the platform assigned; `attachmentUrlByRole` is empty for createReturn (a Draft needs none) and
 * filled for updateReturn (AttachmentsRequired is per LINE). A reason that requires a comment gets one;
 * one that does not gets none, so the payload never carries a field the reason did not ask for.
 */
export function buildReturnItems(returnSpec, lineIdByRole, { reason, attachmentUrlByRole = {} } = {}) {
  return Object.entries(returnSpec.lines).map(([role, quantity]) => {
    const id = lineIdByRole[role];
    if (!id) throw new Error(`no order line for role ${role}`);
    const item = { orderLineItemId: id, quantity, reasonCode: reason.code };
    if (reason.requiresComment) item.reasonComment = `AGENT-TEST ${role} evidence comment`;
    const url = attachmentUrlByRole[role];
    if (url) item.attachmentUrls = [url];
    return item;
  });
}

/**
 * The legacy admin create body — PUT /api/return with no `id` (PURE). Shape confirmed live on
 * vcptcore-qa1 2026-09-29 (Return 3.1003.0-pr-27-51fc); see the seeder for the observation.
 */
export function buildAdminReturnBody(returnSpec, spec, order, lineByRole) {
  return {
    storeId: order.storeId,
    customerId: order.customerId,
    customerName: order.customerName,
    orderId: order.id,
    orderNumber: order.number,
    customerReference: decisionReturnRef(spec.key, returnSpec.ref),
    status: SEEDED_STATUS[VIA_ADMIN_PUT],
    lineItems: Object.entries(returnSpec.lines).map(([role, quantity]) => {
      const li = lineByRole[role];
      return {
        orderLineItemId: li.id, productId: li.productId, sku: li.sku, name: li.name,
        measureUnit: li.measureUnit ?? null, orderedQuantity: li.quantity, price: li.price, quantity,
        reason: 'AGENT-TEST admin-created return',
      };
    }),
  };
}

/** Quantity every seeded, undecided return holds per role on this order (PURE). */
export function heldByRole(spec) {
  const held = {};
  for (const r of spec.returns) for (const [role, q] of Object.entries(r.lines)) held[role] = (held[role] || 0) + q;
  return held;
}

/**
 * What returnableItems must report per role once the fixture is seeded (PURE). Delivered == ordered
 * (everything shipped today), minus what the undecided returns hold. This is the reconcile ORACLE;
 * a disagreement is a finding about the feature, never a reason to adjust the fixture.
 */
export function expectedReturnableAfterSeed(spec) {
  const held = heldByRole(spec);
  return Object.fromEntries(rolesOf(spec).map((role) => [role, spec[role].ordered - (held[role] || 0)]));
}

/**
 * Compare the LIVE returns on a seeded order against the spec (PURE). One function serves the
 * seeder's idempotency decision (rebuild on any problem — a decided return shows up here as a
 * status mismatch) and the reconcile probe.
 * `returns` are REST `Return` objects; `lineIdByRole` maps roles to order line ids.
 */
export function diagnoseSeededReturns(spec, returns, lineIdByRole) {
  const problems = [];
  const live = (returns || []).filter((r) => String(r.customerReference || '').startsWith(`${DECISION_RETURN_REF_MARK}-${spec.key}-`));
  if (live.length !== spec.returns.length) problems.push(`${live.length} seeded return(s) live, ${spec.returns.length} in the spec`);
  for (const rs of spec.returns) {
    const ref = decisionReturnRef(spec.key, rs.ref);
    const r = live.find((x) => x.customerReference === ref);
    if (!r) { problems.push(`return ${ref} missing`); continue; }
    if (r.status !== SEEDED_STATUS[rs.via]) problems.push(`return ${ref} status "${r.status}" != "${SEEDED_STATUS[rs.via]}"${r.status && r.status !== 'Draft' ? ' (already decided/cancelled — terminal, rebuild)' : ''}`);
    for (const [role, q] of Object.entries(rs.lines)) {
      const li = (r.lineItems || []).find((l) => l.orderLineItemId === lineIdByRole[role]);
      if (!li) problems.push(`return ${ref}: no line for ${role}`);
      else if (li.quantity !== q) problems.push(`return ${ref}: ${role} requested ${li.quantity} != spec ${q}`);
      else if (li.approvedQuantity) problems.push(`return ${ref}: ${role} already carries approvedQuantity ${li.approvedQuantity} — a decision was taken`);
    }
    if ((r.lineItems || []).length !== Object.keys(rs.lines).length) problems.push(`return ${ref}: ${(r.lineItems || []).length} line(s) != spec ${Object.keys(rs.lines).length}`);
  }
  return { ok: problems.length === 0, problems };
}

const LINE_LETTER = { [LINE_ROLE_X]: 'A', [LINE_ROLE_Y]: 'B' };

/**
 * The aliases.<env>.json record for one seeded fixture (PURE). Returns are addressed as `return*`
 * (first) and `return2*` (second); lines as `lineA*` / `lineB*` — the same neutral naming step 1's
 * G fixture uses, so a case never needs the internal role vocabulary.
 */
export function decisionAliasRecord(spec, order, returnsByRef, lineByRole, { seededAt, observed = {} } = {}) {
  const rec = {
    orderId: order.id,
    orderNumber: order.number,
    orderLanguageCode: order.languageCode ?? null,
  };
  for (const role of rolesOf(spec)) {
    const L = LINE_LETTER[role];
    const li = lineByRole[role];
    rec[`line${L}ItemId`] = li?.id ?? null;
    rec[`line${L}Sku`] = li?.sku ?? null;
    rec[`line${L}OrderedQuantity`] = spec[role].ordered;
    rec[`line${L}MeasureUnit`] = li?.measureUnit ?? null;
  }
  spec.returns.forEach((rs, i) => {
    const p = i === 0 ? 'return' : `return${i + 1}`;
    const r = returnsByRef[rs.ref];
    rec[`${p}Id`] = r?.id ?? null;
    rec[`${p}Number`] = r?.number ?? null;
    rec[`${p}Status`] = r?.status ?? null;
    rec[`${p}Via`] = rs.via;
    rec[`${p}CustomerReference`] = decisionReturnRef(spec.key, rs.ref);
    rec[`${p}LanguageCode`] = r?.languageCode ?? null;
    if (rs.cultureName) rec[`${p}SubmissionCulture`] = rs.cultureName;
    for (const [role, q] of Object.entries(rs.lines)) {
      const L = LINE_LETTER[role];
      rec[`${p}Line${L}RequestedQuantity`] = q;
      rec[`${p}Line${L}ReturnLineItemId`] = (r?.lineItems || []).find((l) => l.orderLineItemId === lineByRole[role]?.id)?.id ?? null;
    }
  });
  const expected = expectedReturnableAfterSeed(spec);
  for (const [role, q] of Object.entries(expected)) rec[`line${LINE_LETTER[role]}ReturnableAfterSeed`] = q;
  if (seededAt) rec.seededAt = seededAt;
  return { ...rec, ...observed };
}

/**
 * The fixture-set drift guard (PURE — validate-orders-data.mjs §7). Every check is about a property
 * that would make a case VACUOUS if it silently collapsed.
 */
export function validateDecisionFixtureSet(fixtures = RETURN_DECISION_FIXTURES) {
  const problems = [];
  const P = (m) => problems.push(m);
  const keys = new Set(); const aliases = new Set();
  for (const f of fixtures) {
    if (keys.has(f.key)) P(`duplicate key ${f.key}`); keys.add(f.key);
    if (aliases.has(f.alias)) P(`duplicate alias ${f.alias}`); aliases.add(f.alias);
    if (!/^RETURNS_AUTH_/.test(f.alias)) P(`${f.key}: alias "${f.alias}" is outside the RETURNS_AUTH_ family`);
    if (f.lineY && f.lineY.ordered === f.lineX.ordered) P(`${f.key}: both lines ordered ${f.lineX.ordered} — interchangeable lines cannot show a decision landing on the WRONG line`);
    const held = heldByRole(f);
    for (const role of rolesOf(f)) {
      if ((held[role] || 0) > f[role].ordered) P(`${f.key}: returns hold ${held[role]} of ${role} but only ${f[role].ordered} were ordered/delivered — the second submit would be refused, not seeded`);
    }
    for (const r of f.returns) {
      if (!SEEDED_STATUS[r.via]) P(`${f.key}/${r.ref}: unknown creation path "${r.via}"`);
      for (const role of Object.keys(r.lines)) if (!f[role]) P(`${f.key}/${r.ref}: requests ${role}, which the order has no line for`);
      for (const [role, q] of Object.entries(r.lines)) if (!(q > 0)) P(`${f.key}/${r.ref}: ${role} requested ${q} — a return line must request at least 1`);
    }
    const d = f.decisionUnderTest;
    if (f.returns.length && !d) P(`${f.key}: has returns but no decisionUnderTest — the non-vacuity check below cannot run`);
    if (d && !f.allowEqualQuantities) {
      const first = f.returns[0];
      for (const [role, approved] of Object.entries(d)) {
        const req = first.lines[role];
        const ord = f[role]?.ordered;
        if (req === undefined) { P(`${f.key}: decisionUnderTest names ${role}, which the first return does not request`); continue; }
        if (approved > req) P(`${f.key}: approves ${approved} of ${role} but only ${req} were requested`);
        // Partial-approval lines must separate all three; full-approve/zero lines separate ordered from requested.
        if (approved > 0 && approved < req && (ord === req)) P(`${f.key}: ${role} partial approval with ordered == requested (${req}) — cannot tell "approved the requested" from "approved the ordered"`);
      }
      const partialLine = Object.entries(d).some(([role, a]) => a > 0 && a < first.lines[role]);
      if (f.key === 'PARTIAL' && !partialLine) P('PARTIAL: no line is PARTIALLY approved — the fixture\'s whole question is gone');
    }
  }
  // Cross-fixture distinctions the brief's cases rely on.
  const fr = fixtures.find((f) => f.key === 'FR');
  if (fr) {
    const c = fr.returns[0]?.cultureName;
    if (!c) P('FR: the return carries no cultureName — "which source does Return.LanguageCode come from" is undecidable');
    else if (c === fr.orderLanguage) P(`FR: submission culture == order language (${c}) — the two candidate sources of Return.LanguageCode agree, so neither is proven`);
  }
  const two = fixtures.find((f) => f.key === 'TWO');
  if (two) {
    const qs = two.returns.map((r) => r.lines[LINE_ROLE_X]);
    if (two.returns.length !== 2) P('TWO: must carry exactly two returns');
    else if (qs[0] === qs[1]) P(`TWO: both returns request ${qs[0]} — a release of the WRONG return's quantity is invisible`);
  }
  const partial = fixtures.find((f) => f.key === 'PARTIAL');
  if (partial && !partial.lineX.measureUnit) P('PARTIAL: line A carries no measureUnit — the unit shown next to the quantity is untested');
  const journey = fixtures.find((f) => f.key === 'JOURNEY');
  if (journey && journey.returns.length) P('JOURNEY must carry NO return — the storefront submit is the mechanism under test');
  const admin = fixtures.find((f) => f.key === 'ADMIN');
  if (admin && !admin.returns.every((r) => r.via === VIA_ADMIN_PUT)) P('ADMIN: its return must be created through the legacy admin PUT');
  return { ok: problems.length === 0, problems };
}

/** Shape check of the committed template (PURE — validator + unit tests). */
export function validateDecisionTemplate(obj) {
  const problems = [];
  const roles = (obj.items || []).map((i) => i._role).sort();
  if (JSON.stringify(roles) !== JSON.stringify([LINE_ROLE_X, LINE_ROLE_Y].sort())) problems.push(`template must carry exactly one lineX and one lineY line, found ${JSON.stringify(roles)}`);
  const skus = (obj.items || []).map((i) => i.sku);
  if (new Set(skus).size !== skus.length) problems.push('template lines share a placeholder sku — the role mapping would collapse');
  if ((obj.shipments || []).length !== 1) problems.push(`template must carry exactly 1 shipment, found ${(obj.shipments || []).length}`);
  if (obj.shipments?.[0]?._deliveryOffsetDays !== 0) problems.push('template shipment must deliver TODAY (_deliveryOffsetDays 0) so every fixture sits inside the window');
  const stripped = JSON.stringify(stripFixtureMeta(obj));
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(stripped)) problems.push('template carries a literal date (GOLDEN RULE)');
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(stripped)) problems.push('template carries a runtime GUID');
  return { ok: problems.length === 0, problems };
}
