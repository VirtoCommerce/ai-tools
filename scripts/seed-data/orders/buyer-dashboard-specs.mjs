/**
 * buyer-dashboard-specs.mjs — single source of truth for the VCST-6078 buyer-dashboard fixtures.
 *
 * Side-effect free apart from reading the committed fixture: the DATA lives in
 * test-data/orders/buyer-dashboard.json (business keys only — emails, org names, order keys, totals,
 * declared expectations); this module holds the RULES the seeder, the drift guard and the read-back
 * share: which orders the statistics count, the expected figures derived from the orders, and the
 * non-vacuity contract (the distinctions each buyer exists to make decidable must stay divergent).
 *
 * The counting rule mirrors the X-Frontend orderStatistics contract (vc-module-x-frontend PR #12
 * README + OrderStatisticsService): customer = token user; organization = token org when there is
 * one, else no organization filter; optional store filter; !IsCancelled && !IsPrototype (the STATUS
 * string is irrelevant); per-currency aggregate converted with Money.ConvertTo
 * (amount * from.rate / to.rate), rounded to the target currency; a currency the platform does not
 * configure is excluded and reported in excludedCount / excludedCurrencies.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FIXTURE_REL = 'test-data/orders/buyer-dashboard.json';
export const FIXTURE_ALIAS_JSON = 'orders/buyer-dashboard';

export function loadFixture(root = ROOT) {
  return JSON.parse(readFileSync(join(root, FIXTURE_REL), 'utf8'));
}

/** Alias name per buyer key — one JSON-fixture alias per buyer (BD_STATS, BD_LARGE, …). */
export const aliasFor = (buyerKey) => `BD_${buyerKey}`;

export const orderNumber = (fx, key) => `${fx.orderPrefix}${key}`;

/** Every order number the fixture owns (teardown deletes exactly these). */
export function allOrderNumbers(fx) {
  return Object.values(fx.buyers).flatMap((b) => b.orders.map((o) => orderNumber(fx, o.key)));
}

/** The order numbers of ONE buyer (a `--teardown --only <BUYER>` deletes exactly these). */
export const buyerOrderNumbers = (fx, key) => (fx.buyers[key]?.orders || []).map((o) => orderNumber(fx, o.key));

/** Every org KEY a buyer touches: its own org plus any org its orders are stamped with. */
export function buyerOrgKeys(buyer) {
  return [...new Set([buyer.org, ...buyer.orders.map((o) => orderOrgKey(buyer, o))].filter(Boolean))];
}

/** Org keys only `key` uses — a scoped teardown may delete these and must leave every other buyer's. */
export function orgKeysOwnedOnlyBy(fx, key) {
  const others = new Set(Object.entries(fx.buyers).filter(([k]) => k !== key).flatMap(([, b]) => buyerOrgKeys(b)));
  return buyerOrgKeys(fx.buyers[key]).filter((o) => !others.has(o));
}

/**
 * The X-Frontend account-dashboard layout preference: `Layout.accountDashboard` or, store-scoped,
 * `Layout.accountDashboard.{storeId}` (KB-AC688064). Case-insensitive. Any other `Layout.*` scope
 * (a sales-rep layout on the same account, say) is not this fixture's to delete.
 */
export const ACCOUNT_DASHBOARD_LAYOUT_SCOPE = 'accountDashboard';
const ACCOUNT_DASHBOARD_LAYOUT_RE = /^Layout\.accountDashboard(\..+)?$/i;
export const isAccountDashboardLayoutPreference = (name) => ACCOUNT_DASHBOARD_LAYOUT_RE.test(String(name || '').trim());

/** The buyers a case may save a dashboard layout as (fixture flag layoutDisposable). */
export const layoutDisposableBuyers = (fx) => Object.keys(fx.buyers).filter((k) => fx.buyers[k].layoutDisposable === true);

/**
 * Opt-in demo targets: orders for an EXISTING env persona (never created or deleted by this seeder).
 * Seeded only by `--only <KEY>`; their numbers are NOT in allOrderNumbers() of a buyer teardown scope
 * unless asked — see demoOrderNumbers().
 */
export const demoTargets = (fx) => fx.demoTargets || {};
export const demoOrderNumber = (t, o) => `${t.orderPrefix}${o.key}`;
export const demoOrderNumbers = (t) => t.orders.map((o) => demoOrderNumber(t, o));

/** What the demo orders add to the persona's figures (all counted: plain New, not cancelled/prototype). */
export function demoAdded(t) {
  const total = round2(t.orders.reduce((s, o) => s + o.total, 0));
  return { count: t.orders.length, total, average: t.orders.length ? round2(total / t.orders.length) : 0 };
}

function demoProblems(fx) {
  const p = [];
  const bdNumbers = new Set(allOrderNumbers(fx));
  for (const [k, t] of Object.entries(demoTargets(fx))) {
    if (fx.buyers?.[k]) p.push(`demo ${k}: key collides with a buyer key`);
    if (!String(t.orderPrefix).startsWith('AGENT-TEST-')) p.push(`demo ${k}: orderPrefix must start with AGENT-TEST-`);
    if (String(t.orderPrefix).startsWith(fx.orderPrefix)) p.push(`demo ${k}: orderPrefix must not share the buyer prefix ${fx.orderPrefix}`);
    for (const v of ['emailVar', 'passwordVar']) if (!/^[A-Z][A-Z0-9_]*$/.test(t[v] || '')) p.push(`demo ${k}: ${v} must be an env var NAME`);
    if (!t.orders?.length) p.push(`demo ${k}: needs orders`);
    const totals = (t.orders || []).map((o) => o.total);
    if (new Set(totals).size !== totals.length) p.push(`demo ${k}: order totals must be distinct`);
    for (const o of t.orders || []) {
      if (o.isCancelled || o.isPrototype) p.push(`demo ${k}.${o.key}: a demo order must be counted (no cancelled/prototype)`);
      if (bdNumbers.has(demoOrderNumber(t, o))) p.push(`demo ${k}.${o.key}: number collides with a buyer order`);
    }
    const got = demoAdded(t); const want = t.expected?.added || {};
    for (const f of ['count', 'total', 'average']) if (want[f] !== undefined && !near(want[f], got[f])) p.push(`demo ${k}.added.${f}: declared ${want[f]} but the orders give ${got[f]}`);
    if (!(got.count > 0 && got.total > 0)) p.push(`demo ${k}: must add a non-zero count and total (the point of the demo)`);
  }
  return p;
}

/** Org KEY an order is stamped with: 'member' → the buyer's own org, 'none' → null, else an org key. */
export function orderOrgKey(buyer, order) {
  if (order.org === 'none') return null;
  if (order.org === 'member') return buyer.org;
  return order.org;
}

/** Does orderStatistics count this order for this buyer, in this scope? */
export function isCounted(buyer, order, { store = null, tokenOrgKey = buyer.org } = {}) {
  if (order.isCancelled === true || order.isPrototype === true) return false;
  if (store && order.store !== store) return false;
  if (tokenOrgKey && orderOrgKey(buyer, order) !== tokenOrgKey) return false;
  return true;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Expected figures for a buyer: { count, total, average, excludedCount, excludedCurrencies }.
 * `rates` maps currency code → platform exchangeRate (primary = 1); a currency absent from it is
 * UNCONFIGURED and excluded. Aggregation is per currency first (as the SQL GROUP BY does), then
 * converted and summed, then rounded once — the same order of operations as CurrencyFold.
 */
export function expectedFigures(buyer, { store = null, currency = 'USD', rates, waves = null } = {}) {
  const perCur = new Map();
  for (const o of buyer.orders) {
    if (!isCounted(buyer, o, { store })) continue;
    if (waves && !waves.includes(o.wave)) continue;
    const a = perCur.get(o.currency) || { count: 0, total: 0 };
    a.count += 1; a.total += o.total; perCur.set(o.currency, a);
  }
  let count = 0, total = 0, excludedCount = 0; const excludedCurrencies = [];
  for (const [code, a] of perCur) {
    if (!(code in rates)) { excludedCount += a.count; excludedCurrencies.push(code); continue; }
    total += (a.total * rates[code]) / rates[currency];
    count += a.count;
  }
  return { count, total: round2(total), average: count ? round2(total / count) : 0, excludedCount, excludedCurrencies };
}

/** The comparison block orderStatistics returns for current=cur wave vs previous=prev wave. */
export function expectedComparison(buyer, opts) {
  const prev = expectedFigures(buyer, { ...opts, waves: ['prev'] });
  const cur = expectedFigures(buyer, { ...opts, waves: ['cur'] });
  const pct = (c, p) => (p === 0 ? null : round2(((c - p) / p) * 100));
  return {
    previous: { count: prev.count, total: prev.total }, current: { count: cur.count, total: cur.total },
    countChange: cur.count - prev.count, countChangePercent: pct(cur.count, prev.count),
    totalChange: round2(cur.total - prev.total), totalChangePercent: pct(cur.total, prev.total),
  };
}

/** The rates the declared expectations assume: primary USD = 1, EUR from the EUR buyer's fxRate. */
export function declaredRates(fx) {
  return { USD: 1, EUR: fx.buyers.EUR?.expected?.fxRate ?? 1 };
}

const near = (a, b) => a === b || (a != null && b != null && Math.abs(a - b) < 0.011);

/**
 * The value an alias field path (`buyers.<K>.expected.<section>.<field>`) takes under `rates`, or
 * undefined when the path is not a rate-dependent expectation. Sections: today / allStores /
 * todayInEur (figures) and comparison (change block).
 */
function derivedAt(fx, path, rates) {
  const m = /^buyers\.([A-Z0-9_]+)\.expected\.(today|allStores|todayInEur|comparison)\.([A-Za-z]+)$/.exec(path);
  if (!m) return undefined;
  const [, key, section, field] = m;
  const b = fx.buyers[key]; if (!b) return undefined;
  const e = b.expected || {};
  if (section === 'comparison') return expectedComparison(b, { store: e.store, currency: e.currency, rates })[field];
  const opts = section === 'today' ? { store: e.store, currency: e.currency }
    : section === 'allStores' ? { store: null, currency: e.currency } : { store: e.store, currency: 'EUR' };
  const v = expectedFigures(b, { ...opts, rates })[field];
  return typeof v === 'number' ? v : undefined;
}

/**
 * Env-correct expectations for one alias: every rate-dependent field whose value under the LIVE
 * platform rates differs from the committed declaration (which assumes declaredRates). Returns
 * { fieldName: liveValue } — empty when the env's rates match the fixture. The seeder writes it to
 * aliases.<env>.json, which the resolver layers over the fixture field by field.
 */
export function liveExpectationOverrides(fx, aliasFields, liveRates) {
  const out = {};
  const declared = declaredRates(fx);
  for (const [field, path] of Object.entries(aliasFields || {})) {
    const live = derivedAt(fx, path, liveRates);
    const base = derivedAt(fx, path, declared);
    if (live === undefined || base === undefined) continue;
    if (!near(live, base)) out[field] = live;
  }
  return out;
}

/**
 * Non-vacuity + declared-vs-derived contract. Returns a list of problems (empty = sound).
 * Each check names the distinction it protects: if it collapses, a wrong implementation would pass.
 */
export function fixtureProblems(fx) {
  const p = [];
  const rates = declaredRates(fx);
  const b = fx.buyers;
  const all = Object.entries(b).flatMap(([k, x]) => x.orders.map((o) => ({ buyer: k, ...o })));

  // hygiene
  if (!String(fx.orderPrefix).startsWith('AGENT-TEST-')) p.push('orderPrefix must start with AGENT-TEST- (teardown sweeps by it)');
  for (const name of Object.values(fx.orgs)) if (!name.startsWith('AGENT-TEST-')) p.push(`org "${name}" lacks the AGENT-TEST- prefix`);
  for (const [k, x] of Object.entries(b)) {
    if (!x.email.startsWith('agent-test-')) p.push(`${k}: email must start with agent-test-`);
    if (!/^[A-Z][A-Z0-9_]*$/.test(x.passwordVar || '')) p.push(`${k}: passwordVar must be an env var NAME`);
    if (x.org && !fx.orgs[x.org]) p.push(`${k}: org key ${x.org} not declared in orgs`);
  }
  const keys = all.map((o) => o.key);
  if (new Set(keys).size !== keys.length) p.push('order keys must be unique');
  const totals = all.map((o) => o.total);
  if (new Set(totals).size !== totals.length) p.push('every order total must be distinct, or a mis-sum can hide behind a swap');

  // declared expectations == derived
  for (const [k, x] of Object.entries(b)) {
    const e = x.expected || {};
    const check = (label, want, got) => {
      for (const f of ['count', 'total', 'average', 'excludedCount']) {
        if (want?.[f] !== undefined && !near(want[f], got[f])) p.push(`${k}.${label}.${f}: declared ${want[f]} but the orders give ${got[f]}`);
      }
      if (want?.excludedCurrencies && JSON.stringify(want.excludedCurrencies) !== JSON.stringify(got.excludedCurrencies)) p.push(`${k}.${label}.excludedCurrencies drifted`);
    };
    check('today', e.today, expectedFigures(x, { store: e.store, currency: e.currency, rates }));
    if (e.allStores) check('allStores', e.allStores, expectedFigures(x, { store: null, currency: e.currency, rates }));
    if (e.todayInEur) check('todayInEur', e.todayInEur, expectedFigures(x, { store: e.store, currency: 'EUR', rates }));
    if (e.comparison) {
      const got = expectedComparison(x, { store: e.store, currency: e.currency, rates });
      for (const f of ['countChange', 'countChangePercent', 'totalChange', 'totalChangePercent']) {
        if (!near(e.comparison[f], got[f])) p.push(`${k}.comparison.${f}: declared ${e.comparison[f]} but the orders give ${got[f]}`);
      }
    }
  }

  // STATS — period-over-period must disagree between count and revenue, and every exclusion must exist
  if (b.STATS) {
    const c = expectedComparison(b.STATS, { store: b.STATS.expected.store, currency: 'USD', rates });
    if (!(c.countChangePercent > 0 && c.totalChangePercent < 0)) p.push('STATS: count change and revenue change must have OPPOSITE signs (delta-on-count vs delta-on-revenue)');
    if ([c.countChangePercent, c.totalChangePercent].some((v) => v === null || Math.abs(v) === 100 || v === 0)) p.push('STATS: neither change may be 0, ±100% or null');
    const o = b.STATS.orders;
    if (!o.some((x) => x.isCancelled === true && x.status === 'Cancelled')) p.push('STATS: needs a flag-cancelled order');
    if (!o.some((x) => x.isCancelled !== true && x.status === 'Cancelled')) p.push('STATS: needs a status-"Cancelled" order with IsCancelled=false');
    if (!o.some((x) => x.isPrototype === true)) p.push('STATS: needs a prototype order');
    if (!o.some((x) => x.org === 'none')) p.push('STATS: needs an order outside the token organization');
    if (!o.some((x) => x.wave === 'prev') || !o.some((x) => x.wave === 'cur')) p.push('STATS: needs both creation waves');
  }
  // LARGE — the overflow case needs AOV >= 1,000,000 and AOV != total (two different long figures)
  if (b.LARGE) {
    const f = expectedFigures(b.LARGE, { store: b.LARGE.expected.store, rates });
    if (!(f.average >= 1_000_000)) p.push('LARGE: AOV must be >= 1,000,000');
    if (f.average === f.total) p.push('LARGE: AOV must differ from the YTD total');
  }
  // EUR — conversion must be observable: converted total != naive nominal sum
  if (b.EUR) {
    const curs = new Set(b.EUR.orders.map((x) => x.currency));
    if (!curs.has('EUR') || !curs.has('USD')) p.push('EUR: needs orders in EUR and in USD');
    const naive = round2(b.EUR.orders.filter((x) => isCounted(b.EUR, x)).reduce((s, x) => s + x.total, 0));
    if (near(naive, expectedFigures(b.EUR, { store: b.EUR.expected.store, currency: 'USD', rates }).total)) p.push('EUR: the converted total equals the unconverted sum — conversion is undecidable');
  }
  // TWOSTORE — store scoping must change the figure
  if (b.TWOSTORE) {
    if (new Set(b.TWOSTORE.orders.map((x) => x.store)).size < 2) p.push('TWOSTORE: needs orders in two stores');
    const s = expectedFigures(b.TWOSTORE, { store: b.TWOSTORE.expected.store, rates });
    const a = expectedFigures(b.TWOSTORE, { store: null, rates });
    if (s.count === a.count || near(s.total, a.total)) p.push('TWOSTORE: store-scoped and all-store figures must differ');
  }
  // NOORG — "no org filter" vs "org == null filter" must give different figures
  if (b.NOORG) {
    if (b.NOORG.org) p.push('NOORG: the buyer must have no organization');
    const withOrg = b.NOORG.orders.filter((x) => x.org !== 'none' && isCounted(b.NOORG, x));
    if (!withOrg.length) p.push('NOORG: needs a counted order stamped with some organization');
    if (!b.NOORG.orders.some((x) => x.org === 'none')) p.push('NOORG: needs an order with no organization');
  }
  // UNCFG — excluded + a non-empty remainder
  if (b.UNCFG) {
    const f = expectedFigures(b.UNCFG, { store: b.UNCFG.expected.store, rates });
    if (!(f.excludedCount >= 1 && f.count >= 1)) p.push('UNCFG: needs >=1 excluded and >=1 counted order');
    if (!b.UNCFG.orders.some((x) => x.currency === fx.unconfiguredCurrency.code)) p.push('UNCFG: needs an order in the unconfigured currency');
    if (fx.unconfiguredCurrency.code in rates) p.push('UNCFG: the unconfigured currency must not be in the configured rates');
  }
  // LAYOUT — the one disposable-layout buyer, and the status facet must offer every tab
  const disposable = layoutDisposableBuyers(fx);
  if (JSON.stringify(disposable) !== JSON.stringify(['LAYOUT'])) p.push(`exactly one buyer (LAYOUT) may be layoutDisposable, got [${disposable.join(', ')}]`);
  if (b.LAYOUT) {
    const statuses = [...new Set(b.LAYOUT.orders.map((x) => x.status))].sort();
    for (const s of ['Cancelled', 'Completed', 'New', 'Processing']) if (!statuses.includes(s)) p.push(`LAYOUT: needs an order in status ${s} (status-facet tab)`);
    if (JSON.stringify(b.LAYOUT.expected?.statuses || []) !== JSON.stringify(statuses)) p.push(`LAYOUT.expected.statuses must equal the order statuses [${statuses.join(', ')}]`);
    const perStatus = b.LAYOUT.orders.reduce((m, x) => m.set(x.status, (m.get(x.status) || 0) + 1), new Map());
    if (![...perStatus.values()].some((n) => n >= 2)) p.push('LAYOUT: needs a status with >= 2 orders (so a Max rows cap of 1 is observable)');
  }
  p.push(...demoProblems(fx));
  return p;
}
