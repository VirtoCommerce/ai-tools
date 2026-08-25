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
