/**
 * multiorg-balance-specs.mjs — the SINGLE SOURCE OF TRUTH for the multi-organization loyalty
 * balance fixture (LOYORG-E2E-003, suite 083e). Side-effect-free: importing it starts nothing,
 * performs no I/O and reads no env. The seeder, the drift guard and the unit tests all import
 * THIS file rather than each carrying a similar-looking copy of the arithmetic.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────────────────────
 * LOYORG-E2E-003 asks whether a buyer who belongs to TWO companies sees the RIGHT company's
 * points after switching organization. Measured on vcst 2026-09-14, all three relevant sources
 * read 0 — TechFlow, BuildRight and the account's own user scope — so the two readings agreed
 * trivially and the case's own Preconditions instructed it to record `inconclusive`. It BLOCKED
 * on exactly that in two consecutive runs. A fixture that satisfies every `@td()`, every drift
 * guard and every hygiene check can still make a feature's central question UNDECIDABLE; that is
 * what happened here.
 *
 * ── WHY FUNDING ONE ORGANIZATION IS NOT ENOUGH (`.claude/rules/test-data.md` §SECOND RULE) ────
 * Three implementations must produce three DIFFERENT observations, or the case is vacuous:
 *
 *   1. CORRECT        — pooled, scoped to the active organization   → (T, B)
 *   2. LEAKING        — always one organization, whatever is active → (T, T) or (B, B)
 *   3. WRONG FALLBACK — resolves the USER's own balance instead     → (U, U)
 *
 * Fund only TechFlow and BuildRight stays 0; a 0 read under BuildRight is then indistinguishable
 * from the user-scope fallback, which is also 0. So all THREE quantities must be non-zero and
 * mutually unconfusable — that is what `divergenceProblems()` below enforces, and what
 * `td:validate:multiorg-balance` fails on when a later edit collapses it.
 *
 * ── WHAT "UNCONFUSABLE" MEANS HERE, PRECISELY ────────────────────────────────────────────────
 * Points = factor x unit price x qty, and only the QUANTITY is under a seeder's control (the
 * factor belongs to whichever ProductPoints program wins for the account — `loyalty-earn.mjs`).
 * Every balance is therefore an integer multiple of one `perUnit`, and the only free variable is
 * the multiplier. Two equal multipliers collapse the distinction; but so do several *unequal*
 * ones, because a reader comparing two numbers cannot tell an intended figure from an accidental
 * arithmetic coincidence. `divergenceProblems()` rejects a triple in which any member is:
 *   • equal to another (the obvious collapse);
 *   • an integer multiple of another (a double-count reads as the other pool);
 *   • the SUM of the other two (a "pooled across both organizations" bug reads as the third);
 *   • the DIFFERENCE of the other two (a subtracting bug reads as the third).
 * {2, 3, 7} is the smallest triple that survives all four, which is why the declared quantities
 * are what they are and not {1, 2, 3}.
 *
 * ── HOW ATTRIBUTION ACTUALLY WORKS (read from source at PR #17 head 116e902c, 2026-09-14) ─────
 * Every order-earn branch of `LoyaltyProgramHandler` does exactly this, with no contact or member
 * lookup at all:
 *     if (store.IsOrganizationBalanceCalculationMode()) { loyaltyContext.OrganizationId = order.OrganizationId; }
 * So the pool an earn lands in is the ORDER's `OrganizationId` — which the storefront cart
 * inherits from the `organization_id` claim on the caller's token. That is the entire steering
 * mechanism, and it is why this seeder mints one org-scoped token per pool and gates on the
 * cart's `organizationId` BEFORE placing anything.
 *
 * MEASURED LIMIT on the same run: a multi-organization account cannot place an order with NO
 * organization at all. A `/connect/token` grant that omits `organization_id` still comes back with
 * the claim populated — it falls back to the contact's own `organizationId` (BuildRight, for this
 * fixture) — so every cart this account creates carries some organization. That is harmless for
 * the USER pool only because the mode guard above means a Customer-mode earn never copies
 * `order.OrganizationId` onto the ledger row at all; the row's `OrganizationId` is null because the
 * STORE MODE says so, not because the order had no organization. Which is exactly why the user
 * pool's gate asserts the verified store mode and deliberately asserts nothing about the cart's
 * organization: asserting the latter would be asserting a property that does not decide anything.
 *
 * The ledger keeps both owners (`UserId` always, `OrganizationId` nullable), but the READ side
 * (`LoyaltyBalanceOperationLogSearchService.BuildOwnerQuery`) filters a user-scope query as
 * `UserId == x && OrganizationId == null`. So an Organization-mode earn does NOT contribute to
 * the earner's own user-scope balance — the `UserId` on such a row is provenance, never a key.
 * That is measured here rather than assumed (see `chooseUserQty`).
 *
 * ── WHAT THIS FIXTURE CANNOT EXPRESS (stated limits, per §SECOND RULE) ───────────────────────
 *   • A loyalty balance CANNOT be reset on this platform. `vc-module-loyalty` exposes the
 *     operation log READ-ONLY — no set, no debit — so a balance moves ONLY when a REAL order
 *     earns. Consequences every consumer inherits: seeding places real, non-reversible orders;
 *     re-running EARNS AGAIN (it is idempotent only by FLOOR, never by value); teardown cannot
 *     un-earn; and every assertion must be a RELATIVE delta against a reading taken immediately
 *     before the action. The `*_at_seed` alias fields are a seed-time READING, not a contract.
 *   • Accrual at ORGANIZATION scope only happens while the store setting
 *     `Loyalty.LoyaltyBalanceCalculationMode` is "Organization". The platform default — and the
 *     state the rest of the loyalty corpus assumes — is "Customer", so the seeder flips it, earns,
 *     and restores it, including on failure. A consumer must never assume it is left flipped.
 *   • The storefront READ is gated on the same setting (`ResolveOrganizationIdAsync` returns null
 *     and falls back to the user scope unless the store is in Organization mode), so a case run
 *     against a Customer-mode store sees the USER figure under both organizations — which is the
 *     correct behaviour, not the leak. LOYORG-E2E-003's own Preconditions already require BLOCKED
 *     in that state; this fixture does not change that.
 *   • Nothing here concludes anything about WHICH organization the storefront displays, or about
 *     token re-minting on a switch. It only makes the two pools distinguishable so that question
 *     becomes decidable.
 */

/* ── the account this fixture funds ───────────────────────────────────────────────────────────
 * The FRONTEND-lane multi-org twin, never the backend one. MULTI_ORG_TF_BR is reserved for the
 * backend lane: an OrganizationMembership row is keyed on (userId, organizationId) and carries
 * the per-org status/isLocked a run mutates, so a frontend fixture that authenticated as the
 * backend account would have the two lanes eating each other's state (see that alias's own
 * `_notes`, and `scripts/seed-data/b2b/membership-lock-specs.mjs` LANES).
 *
 * THIS SEEDER MUTATES NO MEMBERSHIP, ROLE, LOCK STATE OR ORGANIZATION RECORD. It only places
 * orders. TechFlow's locked membership is load-bearing for the impersonation suite, and the two
 * organizations are shared, mutable state that other lanes read.
 */
export const ACTOR_ALIAS = 'MULTI_ORG_TF_BR_ALT';

/** Where the seeded figures land. Runtime-only: every field is written by the seeder. */
export const POOL_ALIAS = 'MULTI_ORG_LOY_POOLS';

/**
 * The three scopes, and the QUESTION each one makes decidable. `qty` is the earn multiplier —
 * see the arithmetic note above for why {2, 3, 7} and not {1, 2, 3}.
 *
 * `scope` is how the balance is READ: 'organization' hits
 * /api/loyalty-program-operation-log/balance/organization/{id}, 'user' hits .../balance/user/{id}.
 * `mode` is the store mode the earn must happen UNDER — an accrual only lands at organization
 * scope while the store reads "Organization", and a user-scope row is only produced while it
 * reads "Customer" (an org-mode row carries a non-null OrganizationId and is excluded from every
 * user-scope query).
 */
export const POOLS = Object.freeze([
  Object.freeze({
    key: 'TECHFLOW',
    scope: 'organization',
    mode: 'Organization',
    actorOrgField: 'org_techflow_id',
    orgIdField: 'techflow_org_id',
    balanceField: 'techflow_balance_at_seed',
    qtyField: 'techflow_earn_qty',
    qty: 3,
    decides: 'the figure shown while TechFlow is the active organization — distinct from BuildRight, so a leak names itself',
  }),
  Object.freeze({
    key: 'BUILDRIGHT',
    scope: 'organization',
    mode: 'Organization',
    actorOrgField: 'org_buildright_id',
    orgIdField: 'buildright_org_id',
    balanceField: 'buildright_balance_at_seed',
    qtyField: 'buildright_earn_qty',
    qty: 7,
    decides: 'the figure shown while BuildRight is the active organization — the other half of the switch',
  }),
  Object.freeze({
    key: 'USER',
    scope: 'user',
    mode: 'Customer',
    actorOrgField: null,
    orgIdField: null,
    balanceField: 'user_balance_at_seed',
    qtyField: 'user_earn_qty',
    qty: 2,
    decides: "the account's OWN user-scope balance — non-zero so a wrong-fallback implementation is positively identifiable rather than merely absent",
  }),
]);

export const poolByKey = (key) => POOLS.find((p) => p.key === key) || null;

/** The organization-scoped pools, in seed order. */
export const ORG_POOLS = POOLS.filter((p) => p.scope === 'organization');

/** The store setting that selects the scope. */
export const MODE_SETTING = 'Loyalty.LoyaltyBalanceCalculationMode';
export const MODE_ORGANIZATION = 'Organization';
export const MODE_CUSTOMER = 'Customer';
/**
 * The value to restore when the seeder never obtained a clean reading of the original.
 *
 * Not "whatever we found" as a blanket rule: the rest of the loyalty corpus is authored against
 * Customer mode, so a run that aborts mid-flip and leaves Organization behind silently changes
 * the answer every other loyalty suite gets. The seeder restores the value it OBSERVED, and falls
 * back to this only when it has none.
 */
export const MODE_AMBIENT_DEFAULT = MODE_CUSTOMER;

/** Runtime fields the seeder MUST write. A declared-but-unwritten field resolves to "" via @td(). */
export const RUNTIME_ALIAS_FIELDS = Object.freeze({
  [POOL_ALIAS]: Object.freeze([
    'user_email', 'user_id', 'techflow_org_id', 'buildright_org_id',
    'techflow_balance_at_seed', 'buildright_balance_at_seed', 'user_balance_at_seed',
    'techflow_earn_qty', 'buildright_earn_qty', 'user_earn_qty',
    'earn_points_per_unit', 'earn_sku', 'store_mode_at_seed', 'seeded_at',
  ]),
});

/** Every field the alias exposes through `fields{}` — the @td() contract an authored case may use. */
export const ALIAS_FIELDS = Object.freeze([...RUNTIME_ALIAS_FIELDS[POOL_ALIAS]]);

/* ── the discriminating predicate ─────────────────────────────────────────────────────────── */

const isPos = (n) => Number.isFinite(n) && n > 0;

/**
 * Is a triple of balances mutually unconfusable? Pure; takes POINTS (or units — the rules are
 * scale-free), so it is the same function whether it is grading a declared PLAN or a live
 * READ-BACK.
 *
 * Returns an array of human-readable problems — empty means discriminating.
 */
export function divergenceProblems({ TECHFLOW, BUILDRIGHT, USER } = {}) {
  const entries = [['TECHFLOW', TECHFLOW], ['BUILDRIGHT', BUILDRIGHT], ['USER', USER]];
  const problems = [];

  for (const [name, v] of entries) {
    if (!isPos(Number(v))) {
      problems.push(`${name} is ${v == null ? 'absent' : v} — a zero or missing quantity makes the comparison vacuous: `
        + 'a 0 read under one organization is indistinguishable from the user-scope fallback, which is the '
        + 'exact bug the case exists to catch.');
    }
  }
  if (problems.length) return problems;

  const n = Object.fromEntries(entries.map(([k, v]) => [k, Number(v)]));
  const pairs = [['TECHFLOW', 'BUILDRIGHT'], ['TECHFLOW', 'USER'], ['BUILDRIGHT', 'USER']];

  for (const [a, b] of pairs) {
    if (n[a] === n[b]) {
      problems.push(`${a} and ${b} are both ${n[a]} — equal values on both sides of the distinction under test are a data defect, not a neutral choice (.claude/rules/test-data.md §SECOND RULE).`);
      continue;
    }
    const hi = Math.max(n[a], n[b]);
    const lo = Math.min(n[a], n[b]);
    if (hi % lo === 0) {
      problems.push(`${a}=${n[a]} and ${b}=${n[b]} differ by an exact factor of ${hi / lo} — a double-count of the smaller reads as the larger, so a miscounting implementation is indistinguishable from a correct one.`);
    }
  }

  for (const [name] of entries) {
    const [x, y] = entries.filter(([k]) => k !== name).map(([, v]) => Number(v));
    if (n[name] === x + y) {
      problems.push(`${name}=${n[name]} equals the SUM of the other two (${x} + ${y}) — an implementation that pools across both scopes would read exactly ${name}'s figure.`);
    }
    if (n[name] === Math.abs(x - y)) {
      problems.push(`${name}=${n[name]} equals the DIFFERENCE of the other two (|${x} - ${y}|) — a subtracting implementation would read exactly ${name}'s figure.`);
    }
  }
  return problems;
}

/** The DECLARED plan, graded as quantities (perUnit cancels out of every rule above). Pure. */
export function planProblems(pools = POOLS) {
  const byKey = Object.fromEntries(pools.map((p) => [p.key, p.qty]));
  const missing = ['TECHFLOW', 'BUILDRIGHT', 'USER'].filter((k) => byKey[k] == null);
  if (missing.length) return [`the plan declares no quantity for ${missing.join(', ')}`];
  const shape = pools
    .filter((p) => !Number.isInteger(p.qty) || p.qty < 1)
    .map((p) => `${p.key}.qty=${p.qty} is not a positive integer — the earn quantity is a line-item quantity, not a points target.`);
  return [...shape, ...divergenceProblems(byKey)];
}

/**
 * Candidate user quantities, cheapest first. The declared plan's 2 leads, because on a build where
 * an Organization-mode earn does NOT touch the user scope it is the exact declared figure and the
 * fixture matches its own documentation. The rest are small primes, which maximise the chance of
 * clearing the multiple / sum / difference rules against an arbitrary observed baseline.
 */
export const USER_QTY_CANDIDATES = Object.freeze([2, 5, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);

/**
 * The USER-scope quantity to earn, chosen AFTER the organization pools are funded.
 *
 * Why this is measured rather than declared. Source at PR #17 head says an Organization-mode row
 * carries a non-null `OrganizationId` and is excluded from every user-scope query, so the account's
 * own balance should be untouched by the org earns and the declared 2 should simply win. But a
 * source read is not a live reading, and if that ever changes the account's own balance would
 * already be `techflowQty + buildrightQty` units by the time this runs — adding 2 would land on 12
 * units, which is exactly 4x TechFlow's 3, i.e. precisely the coincidence `divergenceProblems`
 * exists to reject. So the seeder READS the live user balance after the org earns and asks this
 * function for the smallest quantity that still yields a discriminating triple. A literal here
 * would be correct on one build and silently wrong on the other (GOLDEN RULE).
 *
 * All arguments are in UNITS (points / perUnit). Returns `{ qty, problems }` — `qty` null when no
 * candidate works, with `problems` explaining the last failure so the caller can abort rather than
 * place an order that answers nothing. Pure.
 */
export function chooseUserQty({
  currentUserUnits = 0, techflowUnits, buildrightUnits, candidates = USER_QTY_CANDIDATES,
} = {}) {
  let last = ['no candidate quantity was tried'];
  for (const qty of candidates) {
    const problems = divergenceProblems({
      TECHFLOW: techflowUnits,
      BUILDRIGHT: buildrightUnits,
      USER: Number(currentUserUnits) + qty,
    });
    if (!problems.length) return { qty, problems: [] };
    last = problems;
  }
  return { qty: null, problems: last };
}

/**
 * Grade a live READ-BACK. Identical rules to the plan, plus the one thing only a live reading can
 * be wrong about: a pool that did not move at all. Pure.
 *
 * `earned` names the pools this run actually placed an order into. Movement is asserted for those
 * and only those — a `--only USER` repair pass leaves the organization pools deliberately
 * untouched, and demanding that they moved would fail a run that did exactly its job. The
 * DIVERGENCE rule, by contrast, always applies to all three: a partial run still has to leave a
 * triple a case can decide with.
 */
export function seededStateProblems({ before = {}, after = {}, earned = null } = {}) {
  const problems = divergenceProblems(after);
  const scope = earned ? new Set(earned) : new Set(POOLS.map((p) => p.key));
  for (const p of POOLS) {
    if (!scope.has(p.key)) continue;
    const b = Number(before[p.key] ?? 0);
    const a = Number(after[p.key] ?? 0);
    if (!(a > b)) {
      problems.push(`${p.key} did not move (${b} → ${a}). An order was placed but the ledger never credited this scope — `
        + 'do NOT re-run blindly: the order is real and non-reversible, so a retry earns twice. Check the loyalty '
        + 'Hangfire job and the operation log for this owner first.');
    }
  }
  return problems;
}

/**
 * What a reader should conclude from a pair of storefront readings taken either side of an
 * organization switch. Pure; used in the seeder's report and available to a consumer that wants to
 * name the implementation it observed rather than just assert inequality.
 */
export function classifyReading({ first, second, TECHFLOW, BUILDRIGHT, USER } = {}) {
  const eq = (a, b) => a != null && b != null && Number(a) === Number(b);
  if (eq(first, TECHFLOW) && eq(second, BUILDRIGHT)) return 'CORRECT — each organization shows its own pool';
  if (eq(first, BUILDRIGHT) && eq(second, TECHFLOW)) return 'CORRECT — each organization shows its own pool (switched in the other order)';
  if (eq(first, USER) && eq(second, USER)) return "WRONG FALLBACK — the account's own user-scope balance is shown instead of the organization pool";
  if (eq(first, second) && (eq(first, TECHFLOW) || eq(first, BUILDRIGHT))) return "LEAKING — one organization's pool is shown regardless of the active organization";
  return 'UNCLASSIFIED — the readings match none of the three modelled implementations';
}
