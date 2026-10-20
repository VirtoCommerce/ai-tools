/**
 * scripts/seed-data/loyalty/missions-demo-specs.mjs
 *
 * The DEMO loyalty-missions dataset — loader, derivations and gates. Side-effect free apart from
 * reading its committed fixture, so the seeder and the drift guard share one source of truth.
 *
 * THE DATA IS THE FIXTURE: test-data/loyalty/missions-demo/missions-demo.json. This module declares no
 * mission, order or line of copy; it derives the progress each buyer must reach and refuses a fixture
 * that would demo badly.
 *
 * WHAT SHAPES THIS DATASET (domain map loyalty-missions.md §1):
 *   - A mission is STORE-WIDE: every account on the store sees every Published mission, so the
 *     fixtures family's AGENT-TEST-MSN missions on the same store would sit beside these cards.
 *   - Progress has NO write API. The only writer is the mission handler on a newly ADDED order, so the
 *     story is told with real orders placed by the buyers after the missions exist — and one order
 *     contributes to EVERY active mission at once (count +1, value +order total, PerSku units).
 *   - Progress is frozen at completion and a granted reward is never reversed (BL-LOY-018/019): a
 *     rebuild cannot reset a mission, so the seeder rebuilds the WHOLE set (new missions, new orders),
 *     and mission-reward points already granted stay in the buyers' ledgers.
 *   - OrderValueGoal reads the order TOTAL and requires a currency (missions-specs.mjs §ORDERVALUE);
 *     the demo's orders carry no shipping, tax or discount, so total = Σ qty × price exactly.
 *
 * THE DELETE HANDLE. A mission has no hidden field (template: name, localizedName, description,
 * bannerUrl, storeId, dates, public, periodicity, dynamicExpression), so missions are tracked by the
 * `_demo_missions_ledger` plus exact declared name on this store; orders carry `DEMO-MSN:ORD:<key>` in
 * outerId. Neither prefix contains AGENT-TEST (an unrelated sweep would reach it) or DEMO-SR.
 */

import { readFileSync } from 'node:fs';
import {
  DEMO_ORGS, DEMO_CONTACTS, DEMO_ORDERS as SR_DEMO_ORDERS, DEMO_LEDGER_KEY as SR_DEMO_LEDGER_KEY,
  demoOrderNumber, demoOrderAddress, isDemoSafeProduct,
} from '../sales-rep/sales-rep-demo-specs.mjs';
import { DEMO_RET_ORDERS } from '../orders/returns-demo-specs.mjs';
import { DANGER_THRESHOLD_DAYS, BANNERS, bannerSourceRel, BANNER_CONTENT_TYPE } from './missions-specs.mjs';

export { DEMO_ORGS, SR_DEMO_LEDGER_KEY, isDemoSafeProduct, BANNERS, bannerSourceRel, BANNER_CONTENT_TYPE };

export const DEMO_MSN_FIXTURE = 'loyalty/missions-demo/missions-demo.json';
const FIXTURE = JSON.parse(readFileSync(new URL(`../../../test-data/${DEMO_MSN_FIXTURE}`, import.meta.url), 'utf8'));

export const DEMO_MISSIONS = Object.freeze(FIXTURE.missions);
export const DEMO_PROGRESS_ORDERS = Object.freeze(FIXTURE.progressOrders);
export const FEATURED_FROM = FIXTURE.featuredFrom;
export const DEMO_MSN_ORDER_STATUS = FIXTURE.orderStatus;

export const DEMO_MSN_MARKER_PREFIX = 'DEMO-MSN';
export const demoMsnMarker = (type, key) => `${DEMO_MSN_MARKER_PREFIX}:${type}:${key}`;
export const isDemoMsnMarker = (v) => String(v ?? '').trim().startsWith(`${DEMO_MSN_MARKER_PREFIX}:`);
export const DEMO_MSN_LEDGER_KEY = '_demo_missions_ledger';
/** Banner assets land in their own folder, never the fixtures family's agent-test/loyalty-missions. */
export const DEMO_MSN_BANNER_FOLDER = 'loyalty-missions/demo';

export const MISSIONS_FAMILY = 'loyalty-missions';
export const MISSIONS_PROFILE = Object.freeze({ fixtures: 'loyalty-missions-fixtures', demo: 'loyalty-missions-demo' });

export const PROGRESS = Object.freeze({ NONE: 'NotStarted', IN_PROGRESS: 'InProgress', COMPLETED: 'Completed' });

export const missionByKey = (key) => DEMO_MISSIONS.find((m) => m.key === key) || null;
export const contactByKey = (key) => DEMO_CONTACTS.find((c) => c.key === key) || null;
export const orgByKey = (key) => DEMO_ORGS.find((o) => o.key === key) || null;
export const ordersInPlaceOrder = () => [...DEMO_PROGRESS_ORDERS].sort((a, b) => a.seq - b.seq);
export const demoMsnOrderNumber = (key) => demoOrderNumber(key);

const round2 = (n) => Math.round(n * 100) / 100;
export const orderTotal = (o) => round2(o.lines.reduce((s, l) => s + l.qty * l.price, 0));

/** The featured product slots the PerSku missions name. */
export const featuredSlots = () => [...new Set(DEMO_MISSIONS.flatMap((m) => (m.goal.type === 'PerSkuGoal' ? m.goal.items.map((i) => i.slot) : [])))];

/** Products each org family must supply for the non-featured lines. */
export function productNeedByOrg() {
  const need = {};
  for (const o of DEMO_PROGRESS_ORDERS) {
    const org = contactByKey(o.buyer)?.org;
    const n = o.lines.filter((l) => !l.slot).length;
    if (org && n) need[org] = (need[org] || 0) + n;
  }
  return need;
}

/** Mission window as ISO dates against `now`. `endInDays: null` = open-ended (null endDate). */
export function missionDates(m, now = new Date()) {
  const at = (d) => (d == null ? null : new Date(now.getTime() + d * 86400000).toISOString());
  return { startDate: at(m.window.startInDays), endDate: at(m.window.endInDays) };
}

/** The goal node's own fields, as the template's availableChildren entry names them. */
function goalFields(goal, currency) {
  if (goal.type === 'OrderValueGoal') return { value: goal.value, currencyCode: currency };
  if (goal.type === 'OrderCountGoal') return { count: goal.count };
  if (goal.type === 'PerSkuGoal') return { all: goal.all !== false };
  throw new Error(`unknown goal type ${goal.type}`);
}

const bareNode = (node) => ({ ...node, availableChildren: [], children: [] });
const blockOf = (tree, id) => (tree?.children || []).find((b) => b.id === id) || null;
const BLOCK = { condition: 'BlockLoyaltyMissionCondition', goals: 'BlockLoyaltyMissionGoals', reward: 'BlockLoyaltyReward' };

/**
 * `POST /api/loyalty-missions` body, overlaid on the LIVE `GET /new` template so a field the module
 * adds arrives with its server default (the same rule missions-specs.mjs follows). Pure.
 */
export function buildDemoMissionBody(m, { template, storeId, currency, cultureName, bannerUrl, now = new Date() }) {
  const tree = template.dynamicExpression;
  const pick = (block, id) => {
    const proto = (blockOf(tree, block)?.availableChildren || []).find((c) => c.id === id);
    if (!proto) throw new Error(`${id} is not offered by this build's mission template`);
    return bareNode(proto);
  };
  const { startDate, endDate } = missionDates(m, now);
  return {
    ...template,
    id: null,
    name: m.name,
    localizedName: { values: { [cultureName]: m.name } },
    description: { values: { [cultureName]: m.description } },
    bannerUrl,
    storeId,
    status: 'Published',
    public: true,
    periodicity: 'None',
    startDate,
    endDate,
    dynamicExpression: {
      ...tree,
      children: [
        { ...blockOf(tree, BLOCK.condition), children: [pick(BLOCK.condition, 'AnyUserGroupCondition')] },
        { ...blockOf(tree, BLOCK.goals), children: [{ ...pick(BLOCK.goals, m.goal.type), ...goalFields(m.goal, currency) }] },
        { ...blockOf(tree, BLOCK.reward), children: [{ ...pick(BLOCK.reward, 'FixedAmountReward'), amount: m.reward }] },
      ],
    },
  };
}

/** Does a live mission still say what the fixture says? (dates excluded: they are relative to the seed clock) */
export function missionMatches(m, live, { currency, bannerUrl }) {
  if (!live || live.status !== 'Published' || live.name !== m.name || live.bannerUrl !== bannerUrl) return false;
  const goals = blockOf(live.dynamicExpression, BLOCK.goals)?.children?.[0];
  const reward = blockOf(live.dynamicExpression, BLOCK.reward)?.children?.[0];
  if (goals?.id !== m.goal.type || Number(reward?.amount) !== m.reward) return false;
  const want = goalFields(m.goal, currency);
  if (Object.entries(want).some(([k, v]) => String(goals[k]) !== String(v))) return false;
  const desc = Object.values(live.description?.values || {})[0];
  return desc === m.description;
}

/** True while `now` is inside the mission's window. */
export function windowOpen(live, now = new Date()) {
  const s = live?.startDate ? new Date(live.startDate) : null;
  const e = live?.endDate ? new Date(live.endDate) : null;
  return (!s || s <= now) && (!e || e > now);
}

/** Order body (PURE). No shipments, tax or discount: the total a value goal reads is exactly Σ qty × price. */
export function buildDemoMsnOrderBody(o, { storeId, currency, orgId, customerId, productsForLines }) {
  const contact = contactByKey(o.buyer);
  const org = orgByKey(contact.org);
  const number = demoMsnOrderNumber(o.key);
  const addr = demoOrderAddress(org, contact, 'Shipping');
  const bill = demoOrderAddress(org, contact, 'Billing');
  const total = orderTotal(o);
  return {
    number,
    outerId: demoMsnMarker('ORD', o.key),
    storeId,
    currency,
    status: DEMO_MSN_ORDER_STATUS,
    customerId,
    customerName: `${contact.firstName} ${contact.lastName}`,
    organizationId: orgId,
    organizationName: org.name,
    total, subTotal: total, shippingTotal: 0, taxTotal: 0, discountTotal: 0,
    addresses: [addr, bill],
    items: o.lines.map((l, i) => {
      const p = productsForLines[i];
      return {
        sku: p.sku, productId: p.id, catalogId: p.catalogId, name: p.name,
        ...(p.imgSrc ? { imageUrl: p.imgSrc } : {}),
        quantity: l.qty, price: l.price, placedPrice: l.price, extendedPrice: round2(l.qty * l.price),
        productType: 'Physical', currency,
      };
    }),
  };
}

/**
 * What every (buyer, mission) must read after the orders are processed. DERIVED from the fixture —
 * the `expect` prose in the JSON is for reviewers; this is what the seeder checks.
 * Contribution rules: OrderCountGoal +1 per order; OrderValueGoal + order total; PerSkuGoal units of
 * each target product, capped per item, completed (all:true) only when every item is met.
 */
export function expectedProgress() {
  const out = {};
  for (const c of DEMO_CONTACTS) {
    const orders = DEMO_PROGRESS_ORDERS.filter((o) => o.buyer === c.key);
    out[c.key] = {};
    for (const m of DEMO_MISSIONS) {
      let current = 0; let target = 0; let completed = false;
      if (m.goal.type === 'OrderCountGoal') { target = m.goal.count; current = Math.min(orders.length, target); completed = orders.length >= target; }
      if (m.goal.type === 'OrderValueGoal') { target = m.goal.value; const v = round2(orders.reduce((s, o) => s + orderTotal(o), 0)); current = Math.min(v, target); completed = v >= target; }
      if (m.goal.type === 'PerSkuGoal') {
        target = m.goal.items.reduce((s, i) => s + i.quantity, 0);
        const units = (slot) => orders.reduce((s, o) => s + o.lines.filter((l) => l.slot === slot).reduce((a, l) => a + l.qty, 0), 0);
        current = m.goal.items.reduce((s, i) => s + Math.min(units(i.slot), i.quantity), 0);
        completed = m.goal.items.every((i) => units(i.slot) >= i.quantity);
      }
      const status = completed ? PROGRESS.COMPLETED : current > 0 ? PROGRESS.IN_PROGRESS : PROGRESS.NONE;
      out[c.key][m.key] = { status, current, target, percent: target ? round2((current / target) * 100) : 0 };
    }
  }
  return out;
}

// ---- gates ----------------------------------------------------------------------------------

const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const FORBIDDEN = /AGENT-TEST|VCST-\d+/i;

export function visibleStrings() {
  return [
    ...DEMO_MISSIONS.flatMap((m) => [['mission.name', m.key, m.name], ['mission.description', m.key, m.description]]),
    ...DEMO_PROGRESS_ORDERS.map((o) => ['order.number', o.key, demoMsnOrderNumber(o.key)]),
  ];
}

export function demoMissionProblems() {
  const problems = [];
  for (const [field, key, value] of visibleStrings()) {
    if (FORBIDDEN.test(value)) problems.push(`${field} (${key}) carries a fixture string: "${value}"`);
    if (GUID_RE.test(value)) problems.push(`${field} (${key}) contains a GUID`);
  }
  for (const list of [DEMO_MISSIONS, DEMO_PROGRESS_ORDERS]) {
    const keys = list.map((x) => x.key);
    const d = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (d.length) problems.push(`duplicate keys: ${[...new Set(d)].join(', ')}`);
  }
  const names = DEMO_MISSIONS.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length) problems.push('two missions share a name — teardown by name could not tell them apart');

  const numbers = [...DEMO_PROGRESS_ORDERS.map((o) => demoMsnOrderNumber(o.key)), ...SR_DEMO_ORDERS.map((o) => demoOrderNumber(o.key)), ...DEMO_RET_ORDERS.map((o) => demoOrderNumber(o.key))];
  const dn = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (dn.length) problems.push(`order numbers collide with another demo: ${[...new Set(dn)].join(', ')}`);

  const slots = featuredSlots();
  for (const m of DEMO_MISSIONS) {
    if (!BANNERS[m.banner]) problems.push(`mission ${m.key}: banner "${m.banner}" is not one of ${Object.keys(BANNERS).join(' | ')}`);
    else if (!BANNERS[m.banner].goals.includes(m.goal.type)) problems.push(`mission ${m.key}: banner "${m.banner}" is the artwork for ${BANNERS[m.banner].goals.join('/')}, not ${m.goal.type}`);
    if (!(m.reward > 0)) problems.push(`mission ${m.key}: reward must be > 0`);
    const { startInDays: s, endInDays: e } = m.window;
    if (!(s < 0) || (e != null && !(e > 0))) problems.push(`mission ${m.key}: window ${s}..${e} is not open now — it accrues nothing and the card reads expired`);
    if (m.goal.type === 'OrderValueGoal' && !(m.goal.value > 0)) problems.push(`mission ${m.key}: value must be > 0`);
    if (m.goal.type === 'OrderCountGoal' && !(m.goal.count > 0)) problems.push(`mission ${m.key}: count must be > 0`);
    if (m.goal.type === 'PerSkuGoal' && !(m.goal.items || []).length) problems.push(`mission ${m.key}: PerSku with no items is uncompletable`);
  }
  for (const o of DEMO_PROGRESS_ORDERS) {
    const c = contactByKey(o.buyer);
    if (!c) { problems.push(`order ${o.key}: buyer ${o.buyer} is not a sales-rep demo contact`); continue; }
    if (!/@[a-z0-9.-]+\.example$/i.test(c.email)) problems.push(`order ${o.key}: ${c.email} is not on .example`);
    for (const l of o.lines) {
      if (!(l.qty > 0) || !(l.price > 0)) problems.push(`order ${o.key}: every line needs a positive qty and price`);
      if (l.slot && !slots.includes(l.slot)) problems.push(`order ${o.key}: slot ${l.slot} is not a featured product of any PerSku mission`);
    }
  }
  if (!orgByKey(FEATURED_FROM)) problems.push(`featuredFrom ${FEATURED_FROM} is not a sales-rep demo organization`);

  // Non-vacuity: the page must show all three card states, and the full card vocabulary.
  const exp = expectedProgress();
  const seen = new Set(Object.values(exp).flatMap((byM) => Object.values(byM).map((p) => p.status)));
  for (const s of Object.values(PROGRESS)) if (!seen.has(s)) problems.push(`no (buyer, mission) ends ${s} — that card state never appears`);
  for (const t of ['OrderValueGoal', 'OrderCountGoal', 'PerSkuGoal']) if (!DEMO_MISSIONS.some((m) => m.goal.type === t)) problems.push(`no ${t} mission`);
  if (!DEMO_MISSIONS.some((m) => m.window.endInDays != null && m.window.endInDays <= DANGER_THRESHOLD_DAYS)) problems.push(`no mission ends within ${DANGER_THRESHOLD_DAYS} days — the red "days left" badge never shows`);
  if (!DEMO_MISSIONS.some((m) => m.window.endInDays == null)) problems.push('no open-ended mission');
  if (!DEMO_CONTACTS.some((c) => Object.values(exp[c.key]).every((p) => p.status === PROGRESS.NONE))) problems.push('every buyer has progress — nobody shows the fresh, not-started page');
  if (!Object.values(exp).some((byM) => Object.values(byM).filter((p) => p.status === PROGRESS.COMPLETED).length >= 2)) problems.push('no buyer completes two missions — the points-history "Mission reward" story is thin');
  return problems;
}
