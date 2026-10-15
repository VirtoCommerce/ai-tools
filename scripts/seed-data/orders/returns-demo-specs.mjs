/**
 * scripts/seed-data/orders/returns-demo-specs.mjs
 *
 * The DEMO returns dataset — declarations and derivations, side-effect free (no env reads, no
 * network, no `main()`), so the seeder and the drift guard import ONE source of truth.
 *
 * WHY A SECOND RETURNS DATASET. The three returns fixture seeders (seed-return-orders,
 * seed-return-decisions, seed-org-returns) are built to be FINDABLE and DISCRIMINATING for a test:
 * `AGENT-TEST-ORD-RET-*` order numbers, yopmail buyers, `AGENT-TEST VCST-5883 …` comments, one
 * fixture per input of the returnable-quantity rule. Every one of those strings renders in the
 * buyer's Returns list, the return details page and the Admin SPA Return blade. Correct for QA;
 * unusable in front of a customer. This module is the presentation-grade counterpart.
 *
 * IT STANDS ON THE SALES-REP DEMO. The organizations and buyer accounts are the ones
 * `sales-rep-demo-specs.mjs` declares (Northwind, Contoso, Fabrikam, Wingtip and their seven
 * buyers), resolved at seed time from that seeder's ledger. One customer base across both demos is
 * the point: a rep who opens Contoso sees the same people who filed the returns. Consequence: the
 * sales-rep demo must be seeded first, and this one torn down first (`seed-demo.mjs` orders both).
 *
 * THE DELETE HANDLE IS NOT A NAME PREFIX. As in the sales-rep demo, `AGENT-TEST` is gone from every
 * visible field, so two other handles replace it:
 *   1. a hidden marker `DEMO-RET:ORD:<key>` in CustomerOrder.outerId (rendered by no grid or page);
 *   2. an id ledger under `_demo_returns_ledger` in `test-data/aliases.<env>.json` — the Return
 *      entity has no spare field a viewer cannot see, so for returns the ledger plus "every return on
 *      a marked order" is the handle.
 * The marker is deliberately NOT `AGENT-TEST` (an unrelated `sweepAgentTestMembers()` would reach it)
 * and NOT `DEMO-SR` (sr:inventory would claim these orders as the sales-rep demo's own).
 *
 * WHAT THE DATA CANNOT DO. `createdDate` is server-assigned (see sales-rep-demo-specs.mjs §header), so
 * order age is narrated through the shipment DELIVERY date, which the platform does accept — and which
 * is exactly the date the return window is computed from. Every order is delivered inside the store's
 * window (read live; the seeder aborts if the window is shorter than DEMO_WINDOW_DAYS_ASSUMED).
 *
 * COPY IS PRODUCT-NEUTRAL ON PURPOSE. The products are discovered, so a line can be a cooker on one
 * env and a fastener on another (measured on virtostart 2026-10-15: Northwind's "steel" family is
 * kitchenware). A comment naming "toner" or "12 AWG reels" over a line that is a printer or a USB
 * cable is the first thing an audience notices; damage, model, length and count read true on any line.
 *
 * NOTHING ENVIRONMENT-SPECIFIC IS DECLARED: the store is STORE_ID, the reason codes and window are
 * read from the live store and checked by the seeder, and no product is named.
 *
 * NO CATALOG ENTITIES ARE DECLARED. Line items come from each organization's live product family,
 * discovered with the sales-rep demo's own `productSearch` / `productMatch` / `isDemoSafeProduct`, so
 * an electrical supplier returns cable, never a dress, and no `AGENT-TEST-*` product reaches a line.
 */

import { readFileSync } from 'node:fs';
import {
  DEMO_ORGS, DEMO_CONTACTS, DEMO_REPS, DEMO_ORDERS as SR_DEMO_ORDERS, DEMO_LEDGER_KEY as SR_DEMO_LEDGER_KEY,
  demoOrderNumber, demoOrderAddress, isDemoSafeProduct,
} from '../sales-rep/sales-rep-demo-specs.mjs';

export { isDemoSafeProduct, SR_DEMO_LEDGER_KEY, DEMO_ORGS };

// ---- marker / ledger / profile ----------------------------------------------

export const DEMO_RET_MARKER_PREFIX = 'DEMO-RET';
/** CustomerOrder.OuterId is [StringLength(128)]; over-long silently truncates. */
export const DEMO_RET_MARKER_MAX_LENGTH = 128;
export const demoRetMarker = (type, key) => `${DEMO_RET_MARKER_PREFIX}:${type}:${key}`;
export const isDemoRetMarker = (v) => String(v ?? '').trim().startsWith(`${DEMO_RET_MARKER_PREFIX}:`);
export function demoRetMarkerKey(v) {
  if (!isDemoRetMarker(v)) return null;
  return String(v).trim().split(':').slice(2).join(':') || null;
}

/** `_`-prefixed for the same reason as the sales-rep ledger: overlay-specs skips `_` keys in check [11]. */
export const DEMO_RET_LEDGER_KEY = '_demo_returns_ledger';

/**
 * The returns family's profile stamp, `_meta.dataset_profiles.returns` — one key per family, so a
 * returns stamp can never clear another family's guard.
 */
export const RETURNS_FAMILY = 'returns';
export const RETURNS_PROFILE = Object.freeze({ fixtures: 'returns-fixtures', demo: 'returns-demo' });

/**
 * THE DATASET IS A FIXTURE, NOT CODE: test-data/orders/returns-demo/returns-demo.json. This module
 * loads it and derives; it declares no order, return or line of copy. Editing the demo is a data
 * change reviewed as data, and the gates below run over whatever the file says.
 */
export const DEMO_RET_FIXTURE = 'orders/returns-demo/returns-demo.json';
const FIXTURE = JSON.parse(readFileSync(new URL(`../../../test-data/${DEMO_RET_FIXTURE}`, import.meta.url), 'utf8'));

/** The window the fixture's delivery offsets were designed against. The seeder aborts when the LIVE policy is shorter. */
export const DEMO_WINDOW_DAYS_ASSUMED = FIXTURE.windowDaysAssumed;
export const DEMO_RET_CURRENCY = FIXTURE.currency;
/** The one order status returns are designed against; the seeder checks it is in the LIVE allowedOrderStatuses. */
export const DEMO_RET_REQUIRED_ORDER_STATUS = 'Completed';

/** Return statuses a demo return can end in, and how each is reached. */
export const OUTCOME = Object.freeze({
  DRAFT: 'Draft',                       // createReturn only — the buyer's unfinished request
  REQUESTED: 'Requested',               // submitted, awaiting the agent: the live Approve / decline demo
  NEW: 'New',                           // logged by a back-office agent on the buyer's behalf, awaiting a decision
  APPROVED: 'Approved',                 // authorize, every line approved in full
  PARTIAL: 'PartiallyApproved',         // authorize, some units approved
  REJECTED: 'Rejected',                 // authorize, every line 0
  CANCELLED: 'Cancelled',               // buyer withdrew before a decision
  PROCESSING: 'Processing',             // decided, goods being handled by the back office
  COMPLETED: 'Completed',               // decided, then carried through by the back office
});

/**
 * Orders the returns sit on — placed BY the buyer (customerId = the buyer's login), because return
 * ownership is the order's customer; the sales-rep demo's rep-attributed orders can never be returned.
 * Two carry no return (delivered in the last two days) for a live Request-return walkthrough.
 */
export const DEMO_RET_ORDERS = Object.freeze(FIXTURE.orders);

/**
 * The returns. Submitted with the buyer's own token (createReturn -> evidence upload -> updateReturn
 * -> submitReturn), decided through `POST /api/return/{id}/authorize`, never by writing a status.
 */
export const DEMO_RETURNS = Object.freeze(FIXTURE.returns);

/**
 * Who may open the ORGANIZATION returns view (xAPI `organizationReturns`, gated by
 * `xapi:my_organization:return:view`). No role on the store carries that permission, so the demo owns a
 * role that holds only it, and ADDS it to memberships — a built-in role is never edited and an existing
 * role on a membership is never removed.
 */
export const DEMO_ORG_RETURNS_ACCESS = Object.freeze(FIXTURE.orgReturnsAccess || { role: null, buyers: [], reps: [] });
export const ORG_RETURNS_VIEW_PERMISSION = 'xapi:my_organization:return:view';
export const ORG_RETURNS_SUBMIT_PERMISSION = 'xapi:my_organization:return:submit';
/** The only permissions the demo role may hold: it must never widen a real colleague's access beyond org returns. */
export const ORG_RETURNS_PERMISSIONS = Object.freeze([ORG_RETURNS_VIEW_PERMISSION, ORG_RETURNS_SUBMIT_PERMISSION]);

// ---- derivations ----------------------------------------------------------------

export const retOrderByKey = (key) => DEMO_RET_ORDERS.find((o) => o.key === key) || null;
export const orgByKey = (key) => DEMO_ORGS.find((o) => o.key === key) || null;
export const contactByKey = (key) => DEMO_CONTACTS.find((c) => c.key === key) || null;

/**
 * Who owns an order — and so who may return it (ownership is the order's customer). Usually a buyer
 * contact; a REP's own order instead names `owner: {rep, login}`, where login "record" is the account
 * the sales-rep record points at and "email" the rep's declared email login (one contact, two logins —
 * sales-rep-profiles.md §5). The key is what tokens and ledger rows are keyed by.
 */
export const REP_LOGINS = Object.freeze(['record', 'email']);
export const isRepOwned = (o) => !!o?.owner;
export const ownerKeyOf = (o) => (o.buyer ? o.buyer : `${o.owner.rep}@${o.owner.login}`);

/** The person printed on the order. A rep's order is addressed to the ORG's .example mailbox, never her own. */
export function ownerPersonOf(o) {
  if (o.buyer) return contactByKey(o.buyer);
  const rep = DEMO_REPS.find((r) => r.key === o.owner?.rep);
  const org = orgByKey(o.org);
  return rep && org ? { key: ownerKeyOf(o), firstName: rep.firstName, lastName: rep.lastName, email: org.email, org: o.org } : null;
}
export const returnsInSubmitOrder = () => [...DEMO_RETURNS].sort((a, b) => a.seq - b.seq);

/** Order numbers share the sales-rep demo's SO-###### scheme, so both demos read as one ledger of sales. */
export const demoRetOrderNumber = (key) => demoOrderNumber(key);

/** Distinct products each organization needs: one per declared line across its orders. */
export function retProductNeedByOrg(orders = DEMO_RET_ORDERS) {
  const need = {};
  for (const o of orders) need[o.org] = (need[o.org] || 0) + o.lines.length;
  return need;
}

/** ISO delivery instant `days` before `now`, at a fixed mid-morning UTC so the date never straddles midnight. */
export function deliveryDateFor(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

const round2 = (n) => Math.round(n * 100) / 100;
export const orderTotal = (spec) => round2(spec.lines.reduce((s, l) => s + l.qty * l.price, 0));

/**
 * PHASE-1 create body (PURE). Shipment items stay empty: the platform assigns line ids and ignores
 * client ones, and a shipment item referencing our own id 500s (seed-return-orders.mjs, observed
 * 2026-09-22). Monetary totals on shipment/payment are zero for the same reason as the sales-rep
 * demo: the calculator folds them back into the order total.
 */
export function buildDemoRetOrderBody(spec, { storeId, orgId, customerId, products }) {
  const org = orgByKey(spec.org);
  const contact = ownerPersonOf(spec);
  const number = demoRetOrderNumber(spec.key);
  const items = spec.lines.map((l, i) => {
    const p = products[i];
    return {
      sku: p.sku, productId: p.id, catalogId: p.catalogId, name: p.name,
      ...(p.imgSrc ? { imageUrl: p.imgSrc } : {}),
      quantity: l.qty, price: l.price, placedPrice: l.price, extendedPrice: round2(l.qty * l.price),
      productType: 'Physical', currency: DEMO_RET_CURRENCY,
    };
  });
  const total = orderTotal(spec);
  const shipAddr = demoOrderAddress(org, contact, 'Shipping');
  const billAddr = demoOrderAddress(org, contact, 'Billing');
  const customerName = `${contact.firstName} ${contact.lastName}`;
  return {
    number,
    outerId: demoRetMarker('ORD', spec.key),
    storeId,
    organizationId: orgId,
    organizationName: org.name,
    customerId,
    customerName,
    purchaseOrderNumber: spec.purchaseOrder,
    currency: DEMO_RET_CURRENCY,
    status: DEMO_RET_REQUIRED_ORDER_STATUS,
    total, subTotal: total,
    shippingTotal: 0, shippingTotalWithTax: 0, taxTotal: 0,
    items,
    addresses: [shipAddr, billAddr],
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency: DEMO_RET_CURRENCY,
      organizationId: orgId, organizationName: org.name,
      price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'Delivered', number: `${number}-S1`, deliveryAddress: shipAddr, items: [],
    }],
    inPayments: [{
      gatewayCode: 'DefaultManualPaymentMethod', currency: DEMO_RET_CURRENCY,
      customerId, customerName, organizationId: orgId, organizationName: org.name,
      sum: total, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'Paid', paymentStatus: 'Paid', isApproved: true,
      number: `${number}-P1`, billingAddress: billAddr,
    }],
  };
}

/**
 * PHASE-2 body (PURE): link every line into the shipment and stamp its delivery date. Shipment items
 * need the inline `lineItem` object — with `lineItemId` alone the PUT returns 200 and drops the item
 * (seed-return-orders.mjs). Lines are matched by SKU because the platform does not keep POST order.
 */
export function buildDemoRetDeliveryBody(spec, fullOrder, skus, now = new Date()) {
  const body = structuredClone(fullOrder);
  const deliveryDate = deliveryDateFor(spec.deliveredDaysAgo, now);
  for (const s of body.shipments || []) {
    s.status = 'Delivered';
    s.deliveryDate = deliveryDate;
    s.items = skus.map((sku) => body.items.find((li) => li.sku === sku)).filter(Boolean)
      .map((line) => ({ lineItemId: line.id, lineItem: line, quantity: line.quantity, barCode: null, outerId: null, shipmentId: s.id }));
  }
  return body;
}

/** True when a live order already carries the delivered shipment this spec needs (PURE). */
export function orderIsDelivered(spec, order) {
  const sh = (order?.shipments || []).find((s) => !s.isCancelled);
  if (!sh?.deliveryDate) return false;
  const linked = new Map((sh.items || []).map((i) => [i.lineItemId, i.quantity]));
  return order.status === DEMO_RET_REQUIRED_ORDER_STATUS
    && (order.items || []).length === spec.lines.length
    && (order.items || []).every((li) => linked.get(li.id) === li.quantity);
}

/** xAPI createReturn/updateReturn line inputs (PURE). `lineIds[i]` is the ORDER line id of line i+1. */
export function buildDemoReturnItems(ret, lineIds, { attachmentUrlByLine = {}, requiresComment = () => false } = {}) {
  return ret.lines.map((l) => {
    const orderLineItemId = lineIds[l.line - 1];
    if (!orderLineItemId) throw new Error(`${ret.key}: order has no line ${l.line}`);
    const item = { orderLineItemId, quantity: l.qty, reasonCode: l.reason };
    if (l.reasonComment || requiresComment(l.reason)) item.reasonComment = l.reasonComment || ret.comment;
    const url = attachmentUrlByLine[l.line];
    if (url) item.attachmentUrls = [url];
    return item;
  });
}

/**
 * The agent decision body for `POST /api/return/{id}/authorize` (PURE). `lineItemId` is the RETURN
 * line's own id, not the order line's — ReturnFlowService.ValidateDecisions matches
 * `orderReturn.LineItems[].Id` (vc-module-return 3.1004.0, read 2026-10-15). Every line must be
 * decided, or the call is refused with "has no decision".
 */
export function buildDemoAuthorizeBody(ret, returnEntity, lineIds) {
  const byOrderLine = new Map((returnEntity.lineItems || []).map((li) => [li.orderLineItemId, li]));
  return {
    returnId: returnEntity.id,
    rejectReason: ret.declineReason || null,
    items: ret.lines.map((l) => {
      const li = byOrderLine.get(lineIds[l.line - 1]);
      if (!li) throw new Error(`${ret.key}: return ${returnEntity.number} has no line for order line ${l.line}`);
      return { lineItemId: li.id, approvedQuantity: l.approve, rejectReason: l.approve < l.qty ? (l.decline || null) : null };
    }),
  };
}

/** Is this a decided outcome (one that goes through authorize)? */
export const isDecided = (outcome) => [OUTCOME.APPROVED, OUTCOME.PARTIAL, OUTCOME.REJECTED, OUTCOME.PROCESSING, OUTCOME.COMPLETED].includes(outcome);

/** Statuses reached by an edit AFTER the decision (the module's available-statuses for a decided return). */
export const isPostDecision = (outcome) => [OUTCOME.PROCESSING, OUTCOME.COMPLETED].includes(outcome);

/** A back-office agent logs the return (admin create, status New) instead of the buyer submitting it. */
export const VIA_AGENT = 'agent';
export const isAgentLogged = (ret) => ret.via === VIA_AGENT;

/** The status the authorize call itself must produce for a spec (Completed is reached afterwards). */
export function authorizedStatusFor(ret) {
  const all = ret.lines.every((l) => l.approve === l.qty);
  const none = ret.lines.every((l) => (l.approve ?? 0) === 0);
  if (all) return OUTCOME.APPROVED;
  if (none) return OUTCOME.REJECTED;
  return OUTCOME.PARTIAL;
}

// ---- gates -------------------------------------------------------------------------

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const FORBIDDEN_IN_VISIBLE = /AGENT-TEST|VCST-\d+/i;
/** Every recipient this dataset can trigger mail to must be on the RFC 2606 reserved `.example` TLD. */
const RESERVED_RECIPIENT_RE = /@[a-z0-9.-]+\.example$/i;

/** Every string the dataset puts on a screen (buyer Returns pages, Admin Return blade, order detail). */
export function visibleStrings() {
  const out = [];
  for (const o of DEMO_RET_ORDERS) out.push(['order.number', o.key, demoRetOrderNumber(o.key)], ['order.purchaseOrder', o.key, o.purchaseOrder]);
  for (const r of DEMO_RETURNS) {
    out.push(['return.reference', r.key, r.reference], ['return.comment', r.key, r.comment]);
    if (r.declineReason) out.push(['return.declineReason', r.key, r.declineReason]);
    if (r.cancelReason) out.push(['return.cancelReason', r.key, r.cancelReason]);
    for (const l of r.lines) {
      if (l.reasonComment) out.push(['line.reasonComment', r.key, l.reasonComment]);
      if (l.decline) out.push(['line.decline', r.key, l.decline]);
      if (l.evidence) out.push(['line.evidence', r.key, l.evidence]);
    }
  }
  return out;
}

/**
 * Every way the dataset could be wrong in a way no other guard catches: PRESENTATION (a fixture
 * string or GUID on screen, a real mailbox notified) and NON-VACUITY (a returns demo where every
 * return ends in one status shows a list, not a lifecycle).
 */
export function demoReturnProblems({ reasonCodes = null } = {}) {
  const problems = [];

  for (const [field, key, value] of visibleStrings()) {
    if (FORBIDDEN_IN_VISIBLE.test(value)) problems.push(`${field} (${key}) carries a fixture string: "${value}"`);
    if (GUID_RE.test(value)) problems.push(`${field} (${key}) contains a raw GUID: "${value}"`);
  }

  for (const list of [DEMO_RET_ORDERS, DEMO_RETURNS]) {
    const keys = list.map((x) => x.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) problems.push(`duplicate keys: ${[...new Set(dupes)].join(', ')}`);
  }

  // Order numbers must not collide with each other OR with the sales-rep demo's (same scheme, one store).
  const numbers = [...DEMO_RET_ORDERS.map((o) => demoRetOrderNumber(o.key)), ...SR_DEMO_ORDERS.map((o) => demoOrderNumber(o.key))];
  const dupeNums = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (dupeNums.length) problems.push(`order numbers collide (with each other or the sales-rep demo): ${[...new Set(dupeNums)].join(', ')}`);

  for (const o of DEMO_RET_ORDERS) {
    const org = orgByKey(o.org);
    const buyer = ownerPersonOf(o);
    if (!org) problems.push(`order ${o.key}: org ${o.org} is not a sales-rep demo organization`);
    if (!!o.buyer === !!o.owner) problems.push(`order ${o.key}: declare exactly one of buyer / owner`);
    if (isRepOwned(o)) {
      const rep = DEMO_REPS.find((r) => r.key === o.owner.rep);
      if (!rep) problems.push(`order ${o.key}: owner rep ${o.owner.rep} is not a demo rep`);
      else if (!rep.servedOrgs.includes(o.org)) problems.push(`order ${o.key}: ${rep.key} does not serve ${o.org} — she has no membership to place it in`);
      if (!REP_LOGINS.includes(o.owner.login)) problems.push(`order ${o.key}: owner login must be one of ${REP_LOGINS.join(' | ')}`);
    }
    if (!buyer) problems.push(`order ${o.key}: owner ${ownerKeyOf(o)} does not resolve`);
    else if (buyer.org !== o.org) problems.push(`order ${o.key}: buyer ${o.buyer} belongs to ${buyer.org}, not ${o.org} — the return would surface under the wrong customer`);
    if (buyer && !RESERVED_RECIPIENT_RE.test(buyer.email)) problems.push(`order ${o.key}: buyer email ${buyer.email} is not on .example — order/return notifications would reach a real mailbox`);
    if (org && !RESERVED_RECIPIENT_RE.test(org.email)) problems.push(`org ${org.key}: email ${org.email} is not on .example — Return.NotifyOrganizationEmail would mail it`);
    if (!(o.deliveredDaysAgo >= 0) || o.deliveredDaysAgo >= DEMO_WINDOW_DAYS_ASSUMED) {
      problems.push(`order ${o.key}: delivered ${o.deliveredDaysAgo} day(s) ago — outside the ${DEMO_WINDOW_DAYS_ASSUMED}-day window, so nothing on it is returnable`);
    }
    if (!o.lines.length || o.lines.some((l) => !(l.qty > 0) || !(l.price > 0))) problems.push(`order ${o.key}: every line needs a positive qty and price`);
    // A reused order whose SKU record is lost is mapped back by quantity; equal quantities would swap lines.
    if (new Set(o.lines.map((l) => l.qty)).size !== o.lines.length) problems.push(`order ${o.key}: two lines share a quantity — a reused order's lines could not be told apart`);
  }

  const requested = new Map(); // orderKey|line -> units held by undecided/approved returns
  for (const r of DEMO_RETURNS) {
    const o = retOrderByKey(r.order);
    if (!o) { problems.push(`return ${r.key}: order ${r.order} is not declared`); continue; }
    if (!Object.values(OUTCOME).includes(r.outcome)) problems.push(`return ${r.key}: unknown outcome ${r.outcome}`);
    if (r.outcome === OUTCOME.CANCELLED && !r.cancelReason) problems.push(`return ${r.key}: Cancelled without a cancelReason — the details page shows an empty reason`);
    const lineNos = r.lines.map((l) => l.line);
    if (new Set(lineNos).size !== lineNos.length) problems.push(`return ${r.key}: two entries for one order line`);
    for (const l of r.lines) {
      const ol = o.lines[l.line - 1];
      if (!ol) { problems.push(`return ${r.key}: order ${o.key} has no line ${l.line}`); continue; }
      if (reasonCodes && !reasonCodes.includes(l.reason)) problems.push(`return ${r.key}: reason "${l.reason}" is not one of ${reasonCodes.join(' | ')}`);
      if (!(l.qty > 0)) problems.push(`return ${r.key} line ${l.line}: qty must be > 0`);
      if (r.outcome !== OUTCOME.DRAFT && !isAgentLogged(r) && !l.evidence) problems.push(`return ${r.key} line ${l.line}: no evidence file — Return.AttachmentsRequired refuses the submit`);
      if (isDecided(r.outcome)) {
        if (!(l.approve >= 0 && l.approve <= l.qty)) problems.push(`return ${r.key} line ${l.line}: approve must be 0..${l.qty}`);
        if (l.approve < l.qty && !l.decline) problems.push(`return ${r.key} line ${l.line}: declined units with no per-line decline reason`);
      } else if (l.approve !== undefined) problems.push(`return ${r.key}: outcome ${r.outcome} is undecided but line ${l.line} declares approve`);
      // Units still HELD by this return: Draft/Cancelled/Rejected hold 0; Requested holds what it asks;
      // a decided line holds its approved units (ReturnQuantityService, domain map §1 link 3).
      const held = [OUTCOME.DRAFT, OUTCOME.CANCELLED, OUTCOME.REJECTED].includes(r.outcome) ? 0
        : isDecided(r.outcome) ? l.approve : l.qty;
      const k = `${o.key}|${l.line}`;
      requested.set(k, (requested.get(k) || 0) + held);
      if (l.qty > ol.qty) problems.push(`return ${r.key} line ${l.line}: requests ${l.qty} of ${ol.qty} ordered`);
    }
    if (isAgentLogged(r) && ![OUTCOME.NEW, ...[OUTCOME.APPROVED, OUTCOME.PARTIAL, OUTCOME.REJECTED, OUTCOME.PROCESSING, OUTCOME.COMPLETED]].includes(r.outcome)) {
      problems.push(`return ${r.key}: an agent-logged return starts New, so it cannot end ${r.outcome}`);
    }
    if (!isAgentLogged(r) && r.outcome === OUTCOME.NEW) problems.push(`return ${r.key}: only an agent-logged return (via "agent") is New — a buyer submit lands Requested`);
    if (isDecided(r.outcome)) {
      const got = authorizedStatusFor(r);
      const ok = isPostDecision(r.outcome) ? [OUTCOME.APPROVED, OUTCOME.PARTIAL].includes(got) : got === r.outcome;
      if (!ok) problems.push(`return ${r.key}: lines decide to ${got}, which cannot end ${r.outcome}${isPostDecision(r.outcome) ? ' (a Rejected return is closed)' : ''}`);
      if (got === OUTCOME.APPROVED && r.declineReason) problems.push(`return ${r.key}: a fully approved return drops its return-level decline reason — remove it`);
    }
  }
  for (const [k, held] of requested) {
    const [orderKey, line] = k.split('|');
    const ordered = retOrderByKey(orderKey).lines[Number(line) - 1].qty;
    if (held > ordered) problems.push(`order ${orderKey} line ${line}: returns hold ${held} of ${ordered} — the later submit is refused (RETURN_QUANTITY_UNAVAILABLE)`);
  }

  // Organization returns access: a demo-owned, view-only role on real demo members.
  const acc = DEMO_ORG_RETURNS_ACCESS;
  if (acc.role) {
    if (/AGENT-TEST/i.test(acc.role.name) || /^(org-|purchasing|store-)/.test(acc.role.id)) problems.push(`org-returns role ${acc.role.id} looks like a fixture or built-in role — the demo must own its own`);
    if (!acc.role.permissions.includes(ORG_RETURNS_VIEW_PERMISSION)) problems.push(`org-returns role lacks ${ORG_RETURNS_VIEW_PERMISSION} — nobody could open the organization view`);
    const extra = acc.role.permissions.filter((x) => !ORG_RETURNS_PERMISSIONS.includes(x));
    if (extra.length) problems.push(`org-returns role holds ${extra.join(', ')} — only ${ORG_RETURNS_PERMISSIONS.join(' / ')} are allowed; anything more widens a real colleague's access`);
    for (const b of acc.buyers) if (!contactByKey(b)) problems.push(`org-returns access: buyer ${b} is not a demo contact`);
    for (const r of acc.reps) {
      const rep = DEMO_REPS.find((x) => x.key === r.key);
      if (!rep) { problems.push(`org-returns access: rep ${r.key} is not a demo rep`); continue; }
      for (const o of r.orgs) if (!rep.servedOrgs.includes(o)) problems.push(`org-returns access: ${r.key} does not serve ${o}`);
    }
    const viewerOrgs = new Set([...acc.buyers.map((b) => contactByKey(b)?.org), ...acc.reps.flatMap((r) => r.orgs)]);
    const multiBuyer = Object.entries(DEMO_RETURNS.reduce((m, r) => { const o = retOrderByKey(r.order); if (o) (m[o.org] ||= new Set()).add(ownerKeyOf(o)); return m; }, {})).filter(([, s2]) => s2.size > 1).map(([org]) => org);
    if (!multiBuyer.some((o) => viewerOrgs.has(o))) problems.push('no viewer sits in an organization with returns from two buyers — the organization view would look like a personal one');
  }

  // Non-vacuity: the lifecycle, not a list.
  for (const outcome of Object.values(OUTCOME)) {
    if (!DEMO_RETURNS.some((r) => r.outcome === outcome)) problems.push(`no return ends in ${outcome} — that status never appears in the demo`);
  }
  if (!DEMO_RETURNS.some((r) => r.lines.length > 1 && r.outcome === OUTCOME.PARTIAL)) {
    problems.push('no multi-line partially approved return — the per-line Requested / Approved columns are undemonstrable');
  }
  const withReturns = new Set(DEMO_RETURNS.map((r) => r.order));
  if (!DEMO_RET_ORDERS.some((o) => !withReturns.has(o.key))) problems.push('every order already carries a return — nothing is left for a live Request-return walkthrough');
  // An org-level view needs returns from two different buyers of one organization.
  const buyersByOrg = {};
  for (const r of DEMO_RETURNS) { const o = retOrderByKey(r.order); if (o) (buyersByOrg[o.org] ||= new Set()).add(ownerKeyOf(o)); }
  if (!Object.values(buyersByOrg).some((s) => s.size > 1)) problems.push('no organization has returns from two buyers — the organization returns view would equal a personal one');
  for (const k of new Set(DEMO_RET_ORDERS.filter(isRepOwned).map(ownerKeyOf))) {
    if (!DEMO_RET_ORDERS.some((o) => ownerKeyOf(o) === k && !withReturns.has(o.key))) problems.push(`${k} has no order without a return — no clean Request-return walkthrough on that login`);
  }
  const seqs = DEMO_RETURNS.map((r) => r.seq);
  if (new Set(seqs).size !== seqs.length) problems.push('two returns share a seq — submit order (and so RET numbering) is a race');

  const m = demoRetMarker('ORD', 'x'.repeat(20));
  if (m.length > DEMO_RET_MARKER_MAX_LENGTH) problems.push(`marker "${m}" exceeds ${DEMO_RET_MARKER_MAX_LENGTH} chars`);
  if (/AGENT-TEST|DEMO-SR/.test(DEMO_RET_MARKER_PREFIX)) problems.push(`marker prefix ${DEMO_RET_MARKER_PREFIX} would be claimed by another family's sweep`);

  for (const bad of ['AGENT-TEST-Cordless Drill', 'AGENT-TEST-Gloves Winter']) {
    if (isDemoSafeProduct({ id: 'x', sku: 'x', name: bad })) problems.push(`isDemoSafeProduct accepts "${bad}" — a fixture product would reach a demo order line`);
  }
  return problems;
}
