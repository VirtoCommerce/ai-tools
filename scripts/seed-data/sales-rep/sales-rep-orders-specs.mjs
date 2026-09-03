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
export const RUNTIME_COLUMNS = ['order_id', 'created_date', 'customer_id'];

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

// ---------------------------------------------------------------------------
// AUTHORSHIP × ORG-SCOPE — the VCST-5733 "All Customer Orders" fixture matrix
// ---------------------------------------------------------------------------
/**
 * WHY THIS EXISTS
 * ---------------
 * VCST-5733 adds two queries whose whole point is that they are scoped DIFFERENTLY from the ones
 * that came before. Grounded in the module source (vc-module-sales-rep PR #14):
 *
 *   salesRepOrders         - `criteria.CustomerId = request.UserId`  => "orders I PLACED"
 *   salesRepCustomerOrders - `criteria.OrganizationIds = organizationIds` and NO CustomerId at all
 *                            => "every order in an org I SERVE, whoever placed it"
 *   salesRepCustomerOrder  - loads by id, then `IsVisibleAsync` filters on served OrganizationId;
 *                            an order outside that set returns **null**, not an error.
 *
 * So the surface has exactly TWO independent dimensions - ORDER AUTHORSHIP (is the caller the
 * order's customer?) and ORG SCOPE (does the caller serve the order's organization?) - and the
 * question the fixture has to make decidable is whether the surface routes and authorizes by
 * authorship INDEPENDENTLY of org scope.
 *
 * THE FALSIFIABILITY ARGUMENT (.claude/rules/test-data.md SECOND RULE)
 * -------------------------------------------------------------------
 * That question is undecidable unless the two dimensions VARY INDEPENDENTLY, which needs the
 * fixtures to be ONE-FACTOR-AT-A-TIME pairs, not merely three plausible orders:
 *
 *                        | authored BY the rep   | authored by a BUYER
 *   ---------------------+-----------------------+---------------------
 *   org the rep SERVES   | repPlaced             | buyerPlaced
 *   org the rep does NOT | notServed             | (not seeded - see LIMITS)
 *
 *   repPlaced vs buyerPlaced  differ ONLY in customerId   => isolates AUTHORSHIP
 *   repPlaced vs notServed    differ ONLY in organization => isolates ORG SCOPE
 *
 * If repPlaced and buyerPlaced sat in DIFFERENT orgs, a read-only rendering of buyerPlaced would be
 * explained equally well by org-scoping and by authorship, and both a correct and a broken
 * implementation would produce the same observation. Same for status: if buyerPlaced were
 * `Processing` while repPlaced were `New`, "no Pay-now button" would be explained by the status.
 * Hence AUTHORSHIP_CONTROLLED_COLUMNS below - every one of them must MATCH across the matrix, and
 * `total` must DIFFER so a case can still tell which order it is looking at. Equal values on both
 * sides of a distinction under test are a data defect; equal values on the CONTROLLED factors are
 * the point. `validateAuthorshipShape` enforces both directions.
 *
 * WHY notServed IS REP-AUTHORED, AND WHY THAT IS LOAD-BEARING
 * ----------------------------------------------------------
 * The tempting shape is a buyer-authored order in an unserved org. It is strictly weaker: `null`
 * would then be explainable by EITHER dimension. Making notServed REP-AUTHORED means the rep is
 * that order's own customer, so the only thing separating it from repPlaced - which IS returned - is
 * the organization. A `null` there therefore proves org scope, and an implementation that
 * authorized by authorship alone (the pre-VCST-5733 `salesRepOrders` rule) would WRONGLY return it.
 *
 * WHY THE UNSERVED HOST MUST BE AN **ACTIVE** ORG
 * ----------------------------------------------
 * ORG_SUSPENDED (ORG-006) is the obvious candidate and is DISQUALIFIED: its `status` is `Suspended`,
 * so an exclusion there has two candidate causes and the case cannot attribute the one it is about.
 * `notServedOrgProblems` refuses any host whose committed status is not Active. Verified live on
 * vcst 2026-09-02: ORG-005 is Active, holds ZERO organization memberships, and
 * `salesRepCustomerOrders(organizationId: ORG-005)` returns totalCount 0 for SR_REP_PRIMARY.
 *
 * LIMITS THIS FIXTURE DOES NOT DECIDE (stated here rather than implied by a green case)
 * -----------------------------------------------------------------------------------
 *  - The fourth cell (buyer-authored order in an UNSERVED org) is deliberately not seeded. It adds
 *    no discrimination the other three do not already give, and it would need a buyer contact in an
 *    org nothing else uses.
 *  - These orders are ARRANGED through `POST /api/order/customerOrders`, not placed through the
 *    storefront checkout. That is correct for arranging a precondition and WRONG for proving the
 *    link that arranges it - a journey case must place a real order through the cart. What is being
 *    tested here is the READ surface, and the read surface cannot tell how the row was written.
 *  - `salesRepCustomerOrders.totalCount` is the INDEX count re-filtered after load (PR #14), so it
 *    is an upper bound between a write and a reindex. A count assertion must tolerate that; a
 *    membership assertion (is THIS number in the page?) is the stronger form.
 */

/** The column declaring WHO an order is attributed to. Blank => the legacy default, the rep. */
export const CUSTOMER_ROLE_COLUMN = 'customer_role';

/** The column carrying the FULL platform order number, so `@td(ALIAS.number)` is directly assertable. */
export const ORDER_NUMBER_COLUMN = 'order_number';

/**
 * The order-number prefix the seeder stamps. Duplicated from seed-sales-rep.mjs's `ORDER_MARK` ON
 * PURPOSE: this module may not import the seeder (that would run it), so check [h] asserts the
 * derived number in the committed CSV still matches, which is what catches a divergence.
 */
export const ORDER_MARK = 'AGENT-TEST';

/** The platform order number for a row's business key (PURE). */
export const orderNumberFor = (orderKey) => `${ORDER_MARK}-${orderKey}`;

/** The one non-rep role form: `buyer:<b2b users.csv user_id>`, e.g. `buyer:USR-007`. */
export const BUYER_ROLE_RE = /^buyer:([A-Za-z]{2,5}-\d{2,4})$/;
export const ROLE_REP = 'rep';

/**
 * A row's declared authorship (PURE).
 * Returns `{ kind: 'rep' }` | `{ kind: 'buyer', userKey }` | `{ kind: 'invalid', raw }`.
 * A BLANK cell is `rep` - the legacy default every pre-VCST-5733 row relies on, so adding the
 * column cannot change the meaning of an existing row. An UNRECOGNISED value is `invalid` rather
 * than silently defaulting to `rep`: defaulting would attribute a buyer order to the rep and make
 * the authorship pair collapse into two identical orders, i.e. exactly the vacuity this guards.
 */
export function customerRoleFor(row) {
  const raw = String(row?.[CUSTOMER_ROLE_COLUMN] ?? '').trim();
  if (!raw || raw.toLowerCase() === ROLE_REP) return { kind: ROLE_REP };
  const m = BUYER_ROLE_RE.exec(raw);
  if (m) return { kind: 'buyer', userKey: m[1].toUpperCase() };
  return { kind: 'invalid', raw };
}

/**
 * The three rows of the matrix. Declared HERE (not only in the CSV) because their relationship - not
 * their individual contents - is the fixture: the guard has to know which row is which cell in order
 * to check that the controlled factors match and the varied one differs.
 *
 * `productSlot` indexes the live-discovered catalog product list, exactly as
 * `sales-rep-stats-specs.mjs` does. Distinct, and deliberately ABOVE every slot that spec claims, so
 * these orders add line volume only to products no other sales-rep fixture asserts a ranking on -
 * see `authorshipProductSlotProblems`.
 */
export const AUTHORSHIP_MATRIX = {
  repPlaced: {
    cell: 'served org x rep-authored',
    orderKey: 'SRO-TF-REP-PLACED',
    alias: 'ORDER_REP_PLACED',
    productSlot: 6,
  },
  buyerPlaced: {
    cell: 'served org x buyer-authored',
    orderKey: 'SRO-TF-BUYER-PLACED',
    alias: 'ORDER_BUYER_PLACED',
    productSlot: 7,
  },
  notServed: {
    cell: 'UNSERVED org x rep-authored',
    orderKey: 'SRO-EU-NOT-SERVED',
    alias: 'ORDER_NOT_SERVED',
    productSlot: 8,
  },
};

/** The @td() aliases this fixture set owns. */
export const AUTHORSHIP_ALIASES = Object.values(AUTHORSHIP_MATRIX).map((m) => m.alias);
export const AUTHORSHIP_ORDER_KEYS = Object.values(AUTHORSHIP_MATRIX).map((m) => m.orderKey);
export const isAuthorshipRow = (row) => AUTHORSHIP_ORDER_KEYS.includes(String(row?.order_key || '').trim());

/**
 * The factors that must be held CONSTANT across the matrix so the varied factor is the only
 * explanation for a difference in behaviour. `total` is excluded on purpose - it must DIFFER, so a
 * case can identify which order it read - and so is `customer_name`, which follows `customer_role`.
 */
export const AUTHORSHIP_CONTROLLED_COLUMNS = ['store', 'status', 'items_count'];

/** Matrix row lookup (PURE). */
export function authorshipRow(rows, cellKey) {
  const key = AUTHORSHIP_MATRIX[cellKey]?.orderKey;
  return (rows || []).find((r) => String(r.order_key || '').trim() === key) || null;
}

/**
 * Served-org business keys for a rep, read from the committed rep fixture at run time (PURE - the
 * caller supplies the parsed rows). NEVER a transcribed list: the rep's served set is edited in
 * sales-reps.csv, and a copy here would go stale silently and turn check [f] into a rubber stamp.
 */
export function servedOrgKeysFor(repRows, repKey = 'SR_REP_PRIMARY') {
  const row = (repRows || []).find((r) => String(r.rep_key || '').trim() === repKey);
  return String(row?.served_orgs ?? '')
    .split(';').map((s) => s.trim()).filter((s) => /^[A-Za-z]{2,5}-\d{2,4}$/.test(s));
}

/** Problems with the UNSERVED host org - the check that rejects a Suspended host (PURE). */
export function notServedOrgProblems(orgKey, orgRows, servedKeys) {
  const problems = [];
  const org = (orgRows || []).find((o) => String(o.org_id || '').trim() === orgKey);
  if (!org) {
    problems.push(`the ${AUTHORSHIP_MATRIX.notServed.alias} host org "${orgKey}" is not in b2b/organizations.csv - its id would differ per env and the case could not target it`);
    return problems;
  }
  if (!String(org.platform_id || '').trim()) {
    problems.push(`org ${orgKey} has no pinned platform_id - the ${AUTHORSHIP_MATRIX.notServed.alias} order would land on a per-env id`);
  }
  if ((servedKeys || []).includes(orgKey)) {
    problems.push(`org ${orgKey} IS in the rep's served set (${(servedKeys || []).join(';')}) - ${AUTHORSHIP_MATRIX.notServed.alias} would be VISIBLE and the case would assert null against an order the surface is supposed to return`);
  }
  const status = String(org.status || '').trim();
  if (status !== 'Active') {
    problems.push(`org ${orgKey} status is "${status}", not Active - a blocked/suspended host gives the exclusion a SECOND candidate cause, so a null result could not be attributed to org scope (this is why ORG_SUSPENDED/ORG-006 is disqualified as the host)`);
  }
  return problems;
}

/** Problems with the declared product slots (PURE). `reservedSlotCount` = stats-specs' requirement. */
export function authorshipProductSlotProblems(reservedSlotCount) {
  const problems = [];
  const slots = Object.entries(AUTHORSHIP_MATRIX).map(([k, m]) => [k, m.productSlot]);
  const seen = new Map();
  for (const [cell, slot] of slots) {
    if (!Number.isInteger(slot) || slot < 0) { problems.push(`${cell}: productSlot ${slot} is not a non-negative integer`); continue; }
    if (slot < reservedSlotCount) {
      problems.push(`${cell}: productSlot ${slot} is inside the range reserved by sales-rep-stats-specs (0..${reservedSlotCount - 1}) - these orders would add units/revenue to a product whose by-units vs by-revenue RANKING that fixture asserts (BL-SR-008), so a top-seller case could flip on test data rather than on the product`);
    }
    if (seen.has(slot)) problems.push(`${cell} and ${seen.get(slot)} share productSlot ${slot} - the two orders would pile onto ONE product, doubling the ranking perturbation they exist to avoid`);
    else seen.set(slot, cell);
  }
  return problems;
}

/**
 * DRIFT / VACUITY GUARD for the authorship matrix. Returns a list of problem strings; empty means
 * the three fixtures still make "does this surface route by authorship independently of org scope?"
 * a DECIDABLE question.
 *
 * Every argument is data the caller read from the committed fixtures, so this stays pure and the
 * unit tests can drive it with hand-built rows.
 */
export function validateAuthorshipShape(rows, { orgRows = [], repRows = [], userRows = [], reservedProductSlots = 0 } = {}) {
  const problems = [];
  const all = rows || [];
  const isSeeded = (r) => String(r?.seeded ?? '').trim().toLowerCase() === 'true';

  // [a] All three cells exist and are actually created.
  const cells = {};
  for (const [cellKey, meta] of Object.entries(AUTHORSHIP_MATRIX)) {
    const row = authorshipRow(all, cellKey);
    if (!row) {
      problems.push(`${ORDERS_CSV}: no row "${meta.orderKey}" for the ${meta.cell} cell - ${meta.alias} would resolve to nothing and every case using it would fail on data, not on the product`);
      continue;
    }
    if (!isSeeded(row)) problems.push(`row ${meta.orderKey}: seeded=${row.seeded} - the seeder would never create it, so ${meta.alias} resolves to an id that does not exist`);
    // A date contract would have the seeder rebuild the row for an unrelated reason, changing the id
    // mid-run under a case that already resolved it.
    if (windowDaysFor(row) !== null) problems.push(`row ${meta.orderKey}: declares ${WINDOW_COLUMN}=${windowDaysFor(row)} - an authorship fixture must not also carry a freshness rule, or it is deleted and recreated (new id) on ageing for a reason nothing about ${meta.alias} implies`);
    if (recencyContractFor(row) === NEWEST_IN_ORG) problems.push(`row ${meta.orderKey}: declares ${RECENCY_COLUMN}=${NEWEST_IN_ORG} - an authorship fixture must not also carry a maximality contract, which re-posts it (new id) on every run`);
    const role = customerRoleFor(row);
    if (role.kind === 'invalid') problems.push(`row ${meta.orderKey}: ${CUSTOMER_ROLE_COLUMN}="${role.raw}" is not "${ROLE_REP}" or "buyer:<user_id>" - it would be rejected rather than silently attributed, but the row is unusable as declared`);
    // [h] The committed order number is DERIVED, never transcribed.
    const declared = String(row[ORDER_NUMBER_COLUMN] ?? '').trim();
    const expected = orderNumberFor(meta.orderKey);
    if (declared !== expected) problems.push(`row ${meta.orderKey}: ${ORDER_NUMBER_COLUMN}="${declared}" but the seeder stamps "${expected}" - ${meta.alias}.number is what a storefront case asserts against the visible order number, so a stale value makes the case fail on the fixture`);
    cells[cellKey] = row;
  }
  if (Object.keys(cells).length !== 3) return problems;   // the rest compares cells pairwise

  const { repPlaced, buyerPlaced, notServed } = cells;
  const A = AUTHORSHIP_MATRIX;

  // [b] AUTHORSHIP actually diverges across the served-org pair. This is THE property.
  const repRole = customerRoleFor(repPlaced);
  const buyerRole = customerRoleFor(buyerPlaced);
  if (repRole.kind !== ROLE_REP) problems.push(`row ${A.repPlaced.orderKey}: must be ${ROLE_REP}-authored (it is the "the rep placed it" cell), got ${JSON.stringify(repRole)}`);
  if (buyerRole.kind !== 'buyer') problems.push(`row ${A.buyerPlaced.orderKey}: must be buyer-authored (${CUSTOMER_ROLE_COLUMN}=buyer:<user_id>), got ${JSON.stringify(buyerRole)} - with both rows attributed to the same customer the pair is two identical orders and "read-only for someone else's order" cannot fail`);

  // [c] SAME ORG for the pair - without this, authorship and org scope are confounded.
  if (repPlaced.org !== buyerPlaced.org) {
    problems.push(`rows ${A.repPlaced.orderKey} (${repPlaced.org}) and ${A.buyerPlaced.orderKey} (${buyerPlaced.org}) are in DIFFERENT orgs - a case then cannot tell authorship-routing from org-scoping, and a correct and a broken implementation produce the same observation`);
  }
  // [d] One factor at a time: everything except the customer must match.
  for (const col of AUTHORSHIP_CONTROLLED_COLUMNS) {
    if (String(repPlaced[col] ?? '') !== String(buyerPlaced[col] ?? '')) {
      problems.push(`rows ${A.repPlaced.orderKey} and ${A.buyerPlaced.orderKey} differ on "${col}" (${repPlaced[col]} vs ${buyerPlaced[col]}) - that becomes a rival explanation for any behavioural difference, so the pair no longer isolates AUTHORSHIP`);
    }
  }
  // ...but their totals must differ, or a case cannot say WHICH order it is reading.
  if (Math.abs(Number(repPlaced.total) - Number(buyerPlaced.total)) < 0.005) {
    problems.push(`rows ${A.repPlaced.orderKey} and ${A.buyerPlaced.orderKey} share total ${repPlaced.total} - identical orders in one org are not distinguishable in a list, so an assertion cannot attribute what it saw`);
  }

  // [e] The org-scope arm: same authorship as repPlaced, different org, and that org NOT served.
  const notServedRole = customerRoleFor(notServed);
  if (notServedRole.kind !== ROLE_REP) {
    problems.push(`row ${A.notServed.orderKey}: must be ${ROLE_REP}-authored, got ${JSON.stringify(notServedRole)} - a buyer-authored order in an unserved org makes a null result explainable by EITHER dimension, which is strictly weaker than the rep-authored form (see this module's header)`);
  }
  if (notServed.org === repPlaced.org) {
    problems.push(`row ${A.notServed.orderKey} is in the same org as ${A.repPlaced.orderKey} (${repPlaced.org}) - it must be in an org the rep does NOT serve, or it is visible and asserts nothing`);
  }
  for (const col of AUTHORSHIP_CONTROLLED_COLUMNS) {
    if (String(repPlaced[col] ?? '') !== String(notServed[col] ?? '')) {
      problems.push(`rows ${A.repPlaced.orderKey} and ${A.notServed.orderKey} differ on "${col}" (${repPlaced[col]} vs ${notServed[col]}) - the org-scope arm must vary ONLY the organization, or a null result has a rival explanation`);
    }
  }
  if (Math.abs(Number(repPlaced.total) - Number(notServed.total)) < 0.005) {
    problems.push(`rows ${A.repPlaced.orderKey} and ${A.notServed.orderKey} share total ${repPlaced.total} - a leaked cross-org order would be indistinguishable from the visible one, so the "list must never contain it" assertion could pass on the wrong row`);
  }

  // [f] The served host really is served; the unserved host really is not (and is Active).
  const servedKeys = servedOrgKeysFor(repRows);
  if (!servedKeys.length) {
    problems.push('could not read SR_REP_PRIMARY served_orgs from the rep fixture - checks [f]/[g] would be a rubber stamp, so this is a hard failure rather than a skip');
  } else {
    if (!servedKeys.includes(repPlaced.org)) problems.push(`row ${A.repPlaced.orderKey}: org ${repPlaced.org} is NOT in SR_REP_PRIMARY's served set (${servedKeys.join(';')}) - both served-org fixtures would be invisible`);
    problems.push(...notServedOrgProblems(notServed.org, orgRows, servedKeys));
  }

  // [g] The buyer is a REAL, seeded buyer contact of the pair's org - and not the rep.
  if (buyerRole.kind === 'buyer') {
    const u = (userRows || []).find((x) => String(x.user_id || '').trim() === buyerRole.userKey);
    if (!u) {
      problems.push(`row ${A.buyerPlaced.orderKey}: ${CUSTOMER_ROLE_COLUMN} names user "${buyerRole.userKey}", which is not in b2b/users.csv - the seeder could not resolve a customerId and would fall back to the rep, silently collapsing the pair`);
    } else {
      if (String(u.seeded ?? '').trim().toLowerCase() !== 'true') problems.push(`row ${A.buyerPlaced.orderKey}: buyer ${buyerRole.userKey} has seeded=${u.seeded} - its account may not exist, so the order would carry an unresolvable customerId`);
      const buyerOrgs = String(u.org_id ?? '').split(';').map((s) => s.trim()).filter(Boolean);
      if (!buyerOrgs.includes(buyerPlaced.org)) problems.push(`row ${A.buyerPlaced.orderKey}: buyer ${buyerRole.userKey} belongs to org(s) ${buyerOrgs.join(';') || '(none)'} but the order is in ${buyerPlaced.org} - a buyer who is not a member of the org is not the "a buyer of this customer placed it" case the fixture claims to be`);
    }
  }

  // [i] Product slots stay clear of the ranking-asserting stats fixture.
  problems.push(...authorshipProductSlotProblems(reservedProductSlots));

  return problems;
}
