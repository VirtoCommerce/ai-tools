/**
 * sales-rep-orders-specs.mjs — the ROLLING-WINDOW rule for test-data/sales-rep/sales-rep-orders.csv.
 *
 * Side-effect-free (no env read, no network, no fs) so the seeder (seed-sales-rep.mjs), the drift
 * guard (validate-sales-rep-orders-data.mjs) and the unit tests all import the SAME rules.
 *
 * WHY A ROLLING WINDOW NEEDS ITS OWN RULE
 * ---------------------------------------
 * Two storefront cases assert against a window that MOVES: SR-CP-057 ("New orders" stat card counts
 * New-status orders in the rolling 7 days) and SR-HD-048 (change a New order's status in Admin and
 * watch the KPI decrement). Both need at least one order INSIDE the window at run time.
 *
 * `CustomerOrder.createdDate` is SERVER-ASSIGNED and silently ignored on POST and PUT — a body
 * carrying a past instant reads back as the server's own `now` (documented in
 * sales-rep-stats-specs.mjs, re-confirmed on vcst 2026-08-25). That cuts both ways:
 *
 *   - A window lying strictly in the PAST cannot be seeded at all. Nothing here tries.
 *   - A window that INCLUDES NOW is trivially seedable — a freshly created order lands in it by
 *     construction. That is the case here, and it is why these two cases are fixable at all.
 *
 * The catch is that such an order STOPS satisfying its own precondition after `windowDays`. The base
 * seeder's idempotency is content-based (total / org / status / items), so a correct-but-stale order
 * passes every check and is left alone — which is exactly how SR-HD-048 broke a week after it was
 * seeded. A rolling-window row therefore adds ONE extra idempotency term: FRESHNESS. When the
 * existing order fell out of the window, it is deleted and recreated so it lands at the server's now.
 *
 * The date is never a literal. `windowDays` is a duration; the instant comes from the server at seed
 * time. A fixed seed date is precisely the defect this module exists to prevent.
 */

/** The CSV this rule reads, and the column that opts a row into it. */
export const ORDERS_CSV = 'test-data/sales-rep/sales-rep-orders.csv';
export const CSV_KEY = 'sales-rep/sales-rep-orders';
export const WINDOW_COLUMN = 'rolling_window_days';

/**
 * Columns holding RUNTIME, server-assigned values. They MUST be blank in the committed CSV and are
 * written per-env to aliases.<env>.json instead. `created_date` is here for the same reason as an id:
 * it is decided by the server at seed time and differs on every env and every re-seed — and it is
 * what lets a later run (and the guard) tell whether the fixture has aged out of its window.
 */
export const RUNTIME_COLUMNS = ['order_id', 'created_date'];

/** Alias name for a rolling-window row — `SRO-ACME-WIN-NEW` → `SR_ORDER_ACME_WIN_NEW`. Pure. */
export const aliasNameFor = (orderKey) => `SR_ORDER_${String(orderKey).replace(/^SRO-/, '').replace(/-/g, '_')}`;

/**
 * Parsed rolling-window requirement for a row: a positive number of days, or null when the row is an
 * ordinary date-agnostic fixture. Pure. A blank / 0 / non-numeric cell means "no freshness rule" —
 * NOT "0 days" — because an accidental 0 would rebuild the order on literally every seed run.
 */
export function windowDaysFor(row) {
  const raw = String(row?.[WINDOW_COLUMN] ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Inclusive UTC bounds of the rolling window ending at `now`. Pure. */
export function windowBounds(windowDays, now = new Date()) {
  const to = new Date(now);
  const from = new Date(to.getTime() - windowDays * 86400000);
  return { from, to };
}

/**
 * Is an existing order still inside its row's rolling window? Pure.
 * An unparsable / missing createdDate counts as STALE — the seeder should rebuild rather than assume
 * freshness, because assuming freshness is the silent-failure direction.
 */
export function isFresh(createdDate, windowDays, now = new Date()) {
  if (!windowDays) return true;               // no freshness rule on this row
  const t = Date.parse(createdDate ?? '');
  if (!Number.isFinite(t)) return false;
  const { from, to } = windowBounds(windowDays, now);
  return t >= from.getTime() && t <= to.getTime();
}

/** The rows that carry a rolling-window rule. Pure. */
export const rollingRows = (rows) => (rows || []).filter((r) => windowDaysFor(r) !== null);

/**
 * Shape assertions shared by the drift guard and the unit tests. Returns a list of problem strings —
 * empty means the committed fixture can still satisfy SR-CP-057 / SR-HD-048.
 *
 * These are VACUITY checks, not presence checks. A rolling-window block that has collapsed to a
 * single status, or to a single org, still seeds green and still leaves both cases unable to
 * discriminate — which is the failure mode that has bitten this repo repeatedly.
 */
export function validateRollingShape(rows) {
  const problems = [];
  const rolling = rollingRows(rows);

  if (!rolling.length) {
    return [`${ORDERS_CSV}: no row declares ${WINDOW_COLUMN} — SR-CP-057 / SR-HD-048 need at least one order INSIDE the rolling window at run time, and every date-agnostic row drifts out of it`];
  }

  for (const r of rolling) {
    const d = windowDaysFor(r);
    if (d > 30) problems.push(`row ${r.order_key}: ${WINDOW_COLUMN}=${d} — a window wider than a month makes the freshness rule meaningless (the case asserts a 7-day window)`);
    if (String(r.seeded ?? '').trim().toLowerCase() !== 'true') {
      problems.push(`row ${r.order_key}: declares ${WINDOW_COLUMN}=${d} but seeded=${r.seeded} — the seeder would never create it, so the window stays empty`);
    }
    for (const col of RUNTIME_COLUMNS) {
      if (String(r[col] ?? '').trim()) problems.push(`row ${r.order_key}: "${col}"="${r[col]}" must be BLANK — it is server-assigned and per-env, and belongs in aliases.<env>.json`);
    }
  }

  // The discriminating property of SR-CP-057: the card counts New-status orders in the window, and
  // its delta is that window's ALL-status volume. With only New-status orders in the window the two
  // figures are identical and the assertion cannot fail. With only non-New orders the card reads 0.
  const byOrg = {};
  for (const r of rolling) (byOrg[r.org] ||= []).push(r);
  const orgsWithBoth = Object.entries(byOrg).filter(([, rs]) =>
    rs.some((r) => r.status === 'New') && rs.some((r) => r.status !== 'New'));
  if (!orgsWithBoth.length) {
    const detail = Object.entries(byOrg).map(([o, rs]) => `${o}=[${rs.map((r) => r.status).join(', ')}]`).join(' ');
    problems.push(
      `${ORDERS_CSV}: no single org has BOTH a New and a non-New rolling-window order (${detail}). `
      + `SR-CP-057's card value is New-only while its delta is the same window's ALL-status volume — `
      + `with one status present the two figures coincide and the case cannot discriminate.`);
  }

  // Distinct totals keep the SR-HD-048 arithmetic falsifiable: the KPI total must drop by EXACTLY the
  // changed order's amount, which is unprovable if two candidate orders share a total.
  for (const [org, rs] of Object.entries(byOrg)) {
    const totals = rs.map((r) => Number(r.total));
    if (new Set(totals).size !== totals.length) {
      problems.push(`org ${org}: rolling-window orders share a total (${totals.join(', ')}) — SR-HD-048 asserts the KPI total drops by exactly the changed order's amount, which cannot be attributed when two orders match`);
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// RECENCY CONTRACTS — "this row must be the org's globally most recent order"
// ---------------------------------------------------------------------------
/**
 * WHY THIS EXISTS (REG-2026-08-26-1631, SR-GQL-013)
 * ------------------------------------------------
 * SR-GQL-013 proves `salesRepCustomers.lastOrder` is store-scoped: the lastOrder for a specific
 * store must DIFFER from the global (no-storeId) lastOrder. Its oracle asserts the global one is the
 * order on the SECONDARY store, so `SRO-ACME-ELEC` has to be ORG-001's most recent order — a claim
 * its own `test_purpose` has always made in prose ("created last => globally most recent").
 *
 * Nothing enforced it. Ordering came only from the ORDER IN WHICH THE SEEDER POSTS, because
 * `createdDate` is server-assigned (see the header above): the seeder walks the CSV top-to-bottom and
 * every POST lands at the server's `now`, so on a fresh env row order alone happened to satisfy the
 * claim. Then the rolling-window rows `SRO-ACME-WIN-*` were appended BELOW it. Two consequences,
 * only the first of which row order can explain:
 *
 *   1. On a fresh seed they are POSTed after ELEC, so they are newer.
 *   2. Worse, and unfixable by reordering: a rolling-window row is DELETED AND RECREATED every time
 *      it ages out of its window (the `freshOk` idempotency term). ELEC has no freshness rule, so it
 *      is never rebuilt. Within `windowDays` of any seed run the WIN rows are newer again — measured
 *      live on vcst 2026-08-26: ELEC 2026-08-07T13:49:16Z vs WIN-PROC 2026-08-25T14:23:29Z.
 *
 * A THIRD breaker needs no fixture at all: any foreign order on the same org outruns ELEC simply by
 * being created later (`AGENT-TEST-SRO-TZ-VCST-2104-001`, 2026-08-16, is not in this CSV and already
 * beat it before the WIN rows existed).
 *
 * So a recency claim cannot live in prose, and cannot live in row order either. A row DECLARES it in
 * the `recency_contract` column; the seeder re-asserts it against the LIVE order set on every run
 * (rebuilding the row last, after every other order for that org); and the checks below fail the
 * static guard when one row's declared contract is contradicted by another row — the class of defect
 * that silently took the guarantee away and left SR-GQL-013 failing for four runs.
 */

/** The column that carries a row's recency contract, and the one value it accepts today. */
export const RECENCY_COLUMN = 'recency_contract';
export const NEWEST_IN_ORG = 'newest-in-org';
export const RECENCY_CONTRACTS = [NEWEST_IN_ORG];

/**
 * A row's declared recency contract, or null. Pure.
 * An UNRECOGNISED value returns null but is reported by validateRecencyContracts — silently ignoring
 * a typo'd contract would restore exactly the unenforced-claim state this column exists to end.
 */
export function recencyContractFor(row) {
  const raw = String(row?.[RECENCY_COLUMN] ?? '').trim().toLowerCase();
  return RECENCY_CONTRACTS.includes(raw) ? raw : null;
}

/** The rows declaring `newest-in-org`. Pure. */
export const newestRows = (rows) => (rows || []).filter((r) => recencyContractFor(r) === NEWEST_IN_ORG);

/**
 * Prose that CLAIMS global recency. Used to catch the original defect shape: a `test_purpose` that
 * promises the row is newest while no column makes it so, which is unenforceable and therefore rots.
 * Deliberately narrow — it must not fire on the ordinary "default recency" hydration note.
 */
const RECENCY_PROSE_RE = /(globally most recent|global(?:ly)? newest|most recent order|created last|newest order|latest order)/i;
export const claimsRecencyInProse = (row) =>
  RECENCY_PROSE_RE.test(`${row?.test_purpose ?? ''} ${row?.notes ?? ''}`);

/**
 * Is `candidate` strictly newer than every instant in `others`? Pure — the runtime half of the
 * contract, used by the seeder against the org's LIVE order dates.
 *
 * An unparsable candidate is NOT newest (rebuild rather than assume — the silent direction again),
 * and an unparsable comparand is skipped rather than treated as epoch, which would fake a pass.
 * Strict `>` so a tie (two orders at the same instant) also rebuilds: `lastOrder` picks one of them
 * arbitrarily, so a tie is not a guarantee.
 */
export function isStrictlyNewest(candidate, others = []) {
  const t = Date.parse(candidate ?? '');
  if (!Number.isFinite(t)) return false;
  return others
    .map((o) => Date.parse(o ?? ''))
    .filter((n) => Number.isFinite(n))
    .every((n) => t > n);
}

/**
 * Declares that the seeder's maximality re-post pass exists (seed-sales-rep.mjs, Phase 4b). It is a
 * constant rather than a runtime probe because this guard is STATIC (no fs, no network): the pass and
 * this flag ship in the same change, and check [5] below plus its unit tests assert both directions,
 * so deleting the pass without clearing the flag fails the tests.
 */
export const MAXIMALITY_REBUILD_WIRED = true;

/**
 * DRIFT GUARD for declared recency contracts. Returns a list of problem strings; empty means no row's
 * stated ordering claim is contradicted by another row in the same org.
 *
 * These are CONTRADICTION checks, not presence checks. Every individual row below is well-formed on
 * its own; what the guard catches is a PAIR whose claims cannot both hold — which is why adding the
 * WIN rows broke SR-GQL-013 without any single row looking wrong, and why no existing check objected.
 */
export function validateRecencyContracts(rows) {
  const problems = [];
  const all = rows || [];
  const isSeeded = (r) => String(r?.seeded ?? '').trim().toLowerCase() === 'true';

  // [0] An unrecognised contract value is a silent no-op — the failure mode this column replaces.
  for (const r of all) {
    const raw = String(r?.[RECENCY_COLUMN] ?? '').trim();
    if (raw && !RECENCY_CONTRACTS.includes(raw.toLowerCase())) {
      problems.push(`row ${r.order_key}: ${RECENCY_COLUMN}="${raw}" is not a recognised contract (expected one of: ${RECENCY_CONTRACTS.join(', ')}) — it would be silently ignored, leaving the claim unenforced`);
    }
  }

  const declared = newestRows(all);

  // [1] A prose recency claim with no column to enforce it. THE ORIGINAL DEFECT: SRO-ACME-ELEC's
  //     test_purpose promised "created last => globally most recent" and nothing made it true.
  for (const r of all) {
    if (claimsRecencyInProse(r) && recencyContractFor(r) !== NEWEST_IN_ORG) {
      problems.push(`row ${r.order_key}: its prose claims global recency but it does not declare ${RECENCY_COLUMN}=${NEWEST_IN_ORG} — a recency claim in prose is unenforceable, and row order does not survive a rolling-window rebuild (this is exactly how SR-GQL-013 broke)`);
    }
  }

  // [2] Two rows on one org cannot both be its newest order.
  const byOrg = {};
  for (const r of declared) (byOrg[r.org] ||= []).push(r);
  for (const [org, rs] of Object.entries(byOrg)) {
    if (rs.length > 1) {
      problems.push(`org ${org}: ${rs.length} rows declare ${RECENCY_COLUMN}=${NEWEST_IN_ORG} (${rs.map((r) => r.order_key).join(', ')}) — only one order can be an org's most recent, so at most one of these claims can hold`);
    }
  }

  for (const r of declared) {
    // [3] A row the seeder never creates cannot be anyone's newest order.
    if (!isSeeded(r)) {
      problems.push(`row ${r.order_key}: declares ${RECENCY_COLUMN}=${NEWEST_IN_ORG} but seeded=${r.seeded} — the seeder would never create it, so the org's newest order is whatever else happens to exist`);
    }
    // [4] The two contracts are mutually exclusive: a freshness window wants the row inside a moving
    //     span, maximality wants it strictly after everything. Declaring both hides which rule drives
    //     the rebuild and makes the row compete with itself.
    if (windowDaysFor(r) !== null) {
      problems.push(`row ${r.order_key}: declares BOTH ${RECENCY_COLUMN}=${NEWEST_IN_ORG} and ${WINDOW_COLUMN}=${windowDaysFor(r)} — the contracts are mutually exclusive; a maximality row is rebuilt when it stops being newest, not when it ages out`);
    }

    const rivals = all.filter((o) => o !== r && o.org === r.org && isSeeded(o) && windowDaysFor(o) !== null);

    // [5] THE CONTRADICTION THAT ACTUALLY HAPPENED. A rolling-window row on the same org is deleted
    //     and recreated at the server's `now` every time it ages out, so it periodically overtakes a
    //     row that is never rebuilt. The seeder's answer is to re-post the maximality row LAST, after
    //     every other order for that org — this asserts that answer is still wired, because without
    //     it the pair is simply incompatible and no amount of CSV row-reordering fixes it.
    if (rivals.length && !MAXIMALITY_REBUILD_WIRED) {
      problems.push(`row ${r.order_key}: org ${r.org} also has periodically-rebuilt ${WINDOW_COLUMN} row(s) (${rivals.map((o) => o.order_key).join(', ')}) that will overtake it, and the seeder's maximality re-post pass is NOT wired — the two claims are incompatible`);
    }

    // [6] A maximality row is re-posted on every run, so it lands INSIDE every rolling window on its
    //     org. SR-HD-048 asserts the KPI total drops by EXACTLY the changed order's amount, which is
    //     unattributable if it shares a total with an in-window rival.
    for (const o of rivals) {
      if (Math.abs(Number(r.total) - Number(o.total)) < 0.005) {
        problems.push(`row ${r.order_key}: total ${r.total} equals rolling-window row ${o.order_key}'s total on the same org — a maximality row is re-posted every run so it sits inside that window too, and SR-HD-048's "drops by exactly this order's amount" assertion could not attribute the change`);
      }
    }
  }

  return problems;
}
