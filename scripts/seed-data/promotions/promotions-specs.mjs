/**
 * scripts/seed-data/promotions/promotions-specs.mjs
 *
 * Side-effect-free rules shared by seed-promotions.mjs (the seeder) and validate-marketing-data.mjs
 * (the drift guard). No env load, no network, no main() — importing it does nothing.
 *
 * The fixture DATA stays in test-data/promotions/{promotions,coupons}.csv (the seeder's single
 * source of truth). This module holds only what is DERIVED from it:
 *
 *   1. Rolling dates — a `+Nd` / `-Nd` token in a date column means "N whole UTC days from the day
 *      the seed runs". Unlike the legacy yesterday/today/tomorrow tokens (anchored once, at creation,
 *      and then left alone), a rolling date is RE-ANCHORED on every seed, so a fixture that must stay
 *      N days away (an expiry 10 days out) does not lapse while it sits on the stand. Start dates snap
 *      to 00:00:00Z, end dates to 23:59:59Z, so two seeds on one day write the same value (no churn).
 *
 *   2. The salesRepCoupons (VCST-6158, vc-module-sales-rep#30) fixture contracts, keyed by the
 *      coupon's `edge_case_type` (`sr_*`). Each states which side of the distinction under test the
 *      fixture must sit on, so the guard can FAIL when the discriminating gap collapses
 *      (.claude/rules/test-data.md SECOND RULE): equal promotion/coupon end dates make "endDate = the
 *      earlier of the two" undecidable; equal "uses left" on the partial and one-left fixtures make
 *      the singular/plural copy undecidable.
 */

export const DAY_MS = 86400000;
export const ROLLING_DATE_RE = /^([+-])(\d{1,4})d$/i;

export const isRollingDate = (v) => ROLLING_DATE_RE.test(String(v ?? '').trim());

/** `+20d` → 20, `-1d` → -1, anything else → null. */
export function rollingOffsetDays(token) {
  const m = String(token ?? '').trim().match(ROLLING_DATE_RE);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === '-' ? -n : n;
}

/**
 * ISO timestamp for a rolling token: the UTC calendar day `today + N`, at 00:00:00Z (a start) or
 * 23:59:59Z (an end). Returns null for anything that is not a rolling token.
 */
export function rollingDateIso(token, { endOfDay = false, now = Date.now() } = {}) {
  const days = rollingOffsetDays(token);
  if (days == null) return null;
  const day = new Date(now + days * DAY_MS).toISOString().slice(0, 10);
  return `${day}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
}

/** Same instant? (the platform may echo `…Z` as `….000Z` or with an offset) */
export const sameInstant = (a, b) => (a == null || a === '') === (b == null || b === '')
  && (a == null || a === '' || Date.parse(a) === Date.parse(b));

/**
 * A coupon's total-use cap: an explicit `max_uses_number` column wins; otherwise the legacy
 * edge_case_type rule (`max_total` / `maxed` → 1, else 0 = unlimited).
 */
export function couponMaxUses(row) {
  const explicit = String(row?.max_uses_number ?? '').trim();
  if (explicit !== '') return Number(explicit);
  return /max_total|maxed/.test(String(row?.edge_case_type || '').toLowerCase()) ? 1 : 0;
}

/** Uses the seeder must have RECORDED (as real promotion-usage records) against the coupon. */
export const couponRecordedUses = (row) => Number(String(row?.recorded_uses ?? '').trim() || 0);

/**
 * The order number that records use #k of a coupon. AGENT-TEST- prefixed and keyed by the coupon's
 * business key AND the first 8 chars of its live id: a coupon re-created after a teardown starts at
 * zero uses, so it must not collide with an order a previous incarnation left behind.
 */
export const USAGE_ORDER_PREFIX = 'AGENT-TEST-SRCPN-';
export const usageOrderPrefix = (couponId) => `${USAGE_ORDER_PREFIX}${couponId}-`;
export const usageOrderNumber = (couponId, couponGuid, k) =>
  `${usageOrderPrefix(couponId)}${String(couponGuid || '').replace(/-/g, '').slice(0, 8)}-U${k}`;

/**
 * Resolve a `member_ref` cell (an alias NAME, e.g. ORG_TECHFLOW) to the platform id the coupon is
 * bound to. Reads the alias's CSV row through `loadCsvFn` and lets the env overlay win per field —
 * the same layering the @td() resolver applies. Returns '' when it cannot resolve (caller fails).
 */
export function resolveMemberRef(ref, { aliases, overlay = {}, loadCsvFn, field = 'platform_id' }) {
  const name = String(ref ?? '').trim();
  if (!name) return '';
  if (overlay?.[name]?.[field]) return overlay[name][field];
  const def = aliases?.[name];
  if (!def) return '';
  if (def[field] && !def.file) return def[field];
  if (!def.file || !def.filter || !def.fields?.[field]) return '';
  const [col, want] = Object.entries(def.filter)[0];
  const row = loadCsvFn(`test-data/${def.file}.csv`).find((r) => r[col] === want);
  return row?.[def.fields[field]] || '';
}

/**
 * The salesRepCoupons fixture contracts. `listed` is what the rep must see; `endFrom` names the
 * side `endDate` must equal ('coupon' | 'promotion' | null = no end date asserted).
 */
export const SR_CONTRACTS = Object.freeze({
  sr_promo_end_earlier: { listed: true, endFrom: 'promotion', scenario: 'S7' },
  sr_coupon_end_earlier: { listed: true, endFrom: 'coupon', scenario: 'S6' },
  sr_coupon_expired: { listed: false, endFrom: null, scenario: 'S5' },
  sr_cap_partial: { listed: true, endFrom: null, scenario: 'S2' },
  sr_cap_one_left: { listed: true, endFrom: null, scenario: 'S4' },
  sr_cap_used_up: { listed: false, endFrom: null, scenario: 'S3' },
  sr_member_bound: { listed: false, endFrom: null, scenario: 'S8' },
  sr_future_start: { listed: false, endFrom: null, scenario: 'S9' },
  sr_long_code: { listed: true, endFrom: null, scenario: 'S24' },
});

export const isSrRow = (couponRow) => Object.hasOwn(SR_CONTRACTS, String(couponRow?.edge_case_type || '').trim());

/**
 * Non-vacuity check of every `sr_*` coupon row against its contract. Pure over the CSV rows.
 * Returns a list of problem strings (empty = every contract holds).
 */
export function srContractProblems(promotions, coupons) {
  const problems = [];
  const promoById = new Map(promotions.map((p) => [p.promo_id, p]));
  const srRows = coupons.filter(isSrRow);
  const remaining = {};
  for (const c of srRows) {
    const type = c.edge_case_type.trim();
    const tag = `${c.coupon_id} (${type})`;
    const p = promoById.get(c.promo_id);
    if (!p) { problems.push(`${tag}: promo ${c.promo_id} not in promotions.csv`); continue; }
    // Eligibility the query applies BEFORE any coupon filter: active, public, exactly ONE coupon.
    const siblings = coupons.filter((x) => x.promo_id === c.promo_id && (x.code || '').trim());
    if (siblings.length !== 1) problems.push(`${tag}: promo ${c.promo_id} has ${siblings.length} coupons — salesRepCoupons lists only promotions with exactly ONE`);
    if (!/^true$/i.test(p.is_active || '') || !/^true$/i.test(p.is_public || '')) problems.push(`${tag}: promo ${c.promo_id} must be is_active=true and is_public=true`);
    if (!/^AGENT-TEST/.test(p.promo_name || '')) problems.push(`${tag}: promo name "${p.promo_name}" must start with AGENT-TEST`);
    if (!/^AGENTTEST/i.test(c.code || '')) problems.push(`${tag}: code "${c.code}" must start with AGENTTEST`);
    for (const [col, v] of [['promotions.start_date', p.start_date], ['promotions.end_date', p.end_date], ['coupons.end_date', c.end_date]]) {
      if (String(v || '').trim() && !isRollingDate(v)) problems.push(`${tag}: ${col} "${v}" must be a rolling +Nd/-Nd token (never a literal date)`);
    }
    const max = couponMaxUses(c);
    const uses = couponRecordedUses(c);
    const pEnd = rollingOffsetDays(p.end_date);
    const cEnd = rollingOffsetDays(c.end_date);
    const pStart = rollingOffsetDays(p.start_date);
    if (uses > 0 && max === 0) problems.push(`${tag}: recorded_uses ${uses} on an uncapped coupon tests nothing (the query recounts only capped coupons)`);
    if (type !== 'sr_member_bound' && String(c.member_ref || '').trim()) problems.push(`${tag}: only sr_member_bound may carry member_ref`);
    if (type !== 'sr_future_start' && pStart != null && pStart > 0) problems.push(`${tag}: a future start hides it — only sr_future_start may start later`);
    if (SR_CONTRACTS[type].listed && cEnd != null && cEnd <= 0) problems.push(`${tag}: listed fixture whose coupon is already expired`);
    if (SR_CONTRACTS[type].listed && pEnd != null && pEnd <= 0) problems.push(`${tag}: listed fixture whose promotion has already ended`);
    if (SR_CONTRACTS[type].listed && max > 0 && uses >= max) problems.push(`${tag}: listed fixture that is used up (${uses}/${max})`);
    switch (type) {
      case 'sr_promo_end_earlier':
        if (pEnd == null || cEnd == null) problems.push(`${tag}: needs BOTH a promotion end and a coupon end`);
        else if (!(pEnd < cEnd)) problems.push(`${tag}: promotion end (+${pEnd}d) must be strictly EARLIER than the coupon expiry (+${cEnd}d) — equal or reversed dates cannot tell min() from either side`);
        break;
      case 'sr_coupon_end_earlier':
        if (pEnd == null || cEnd == null) problems.push(`${tag}: needs BOTH a promotion end and a coupon end`);
        else if (!(cEnd < pEnd)) problems.push(`${tag}: coupon expiry (+${cEnd}d) must be strictly EARLIER than the promotion end (+${pEnd}d)`);
        break;
      case 'sr_coupon_expired':
        if (cEnd == null || cEnd >= 0) problems.push(`${tag}: coupon end must be in the PAST (-Nd)`);
        if (pEnd != null && pEnd <= 0) problems.push(`${tag}: promotion must still be running — an ended promotion is excluded at the promotion search, not by the coupon-expiry filter under test`);
        break;
      case 'sr_cap_partial':
        if (!(max > 0 && uses > 0 && max - uses >= 2)) problems.push(`${tag}: needs cap>0, ≥1 recorded use and ≥2 uses left (plural copy) — got ${uses}/${max}`);
        remaining[type] = max - uses;
        break;
      case 'sr_cap_one_left':
        if (!(max > 0 && uses > 0 && max - uses === 1)) problems.push(`${tag}: needs ≥1 recorded use and EXACTLY 1 use left (singular copy) — got ${uses}/${max}`);
        remaining[type] = max - uses;
        break;
      case 'sr_cap_used_up':
        if (!(max > 0 && uses >= max)) problems.push(`${tag}: needs recorded uses ≥ cap — got ${uses}/${max}`);
        break;
      case 'sr_member_bound':
        if (!String(c.member_ref || '').trim()) problems.push(`${tag}: needs member_ref (an alias name, e.g. ORG_TECHFLOW)`);
        break;
      case 'sr_future_start':
        if (pStart == null || pStart <= 0) problems.push(`${tag}: promotion start must be in the FUTURE (+Nd)`);
        break;
      case 'sr_long_code':
        if ((c.code || '').trim().length < 40 || /\s/.test(c.code || '')) problems.push(`${tag}: code must be ≥40 chars with no whitespace (got ${(c.code || '').trim().length})`);
        break;
      default: break;
    }
  }
  if (remaining.sr_cap_partial != null && remaining.sr_cap_partial === remaining.sr_cap_one_left) {
    problems.push(`sr_cap_partial and sr_cap_one_left both leave ${remaining.sr_cap_partial} use(s) — the plural/singular distinction collapses`);
  }
  return problems;
}

/**
 * Judge a live salesRepCoupons read-back against the contracts. `items` = the query's items;
 * `seeded` = [{ couponRow, promoRow, liveCoupon, livePromotion }]. Pure; returns rows for a report
 * plus the problems.
 */
export function judgeSalesRepView(items, seeded) {
  const byCode = new Map(items.map((i) => [i.couponCode, i]));
  const rows = [];
  const problems = [];
  for (const s of seeded) {
    const type = s.couponRow.edge_case_type.trim();
    const contract = SR_CONTRACTS[type];
    const code = s.couponRow.code.trim();
    const item = byCode.get(code) || null;
    const listed = !!item;
    const row = { coupon_id: s.couponRow.coupon_id, type, code, expect: contract.listed ? 'listed' : 'hidden', listed, endDate: item?.endDate ?? null, maxUsesNumber: item?.maxUsesNumber ?? null, totalUsesCount: item?.totalUsesCount ?? null };
    if (listed !== contract.listed) problems.push(`${row.coupon_id} ${code}: expected ${row.expect}, got ${listed ? 'listed' : 'hidden'}`);
    if (item && contract.endFrom) {
      const want = contract.endFrom === 'coupon' ? s.liveCoupon?.expirationDate : s.livePromotion?.endDate;
      if (!sameInstant(item.endDate, want)) problems.push(`${row.coupon_id} ${code}: endDate ${item.endDate} ≠ ${contract.endFrom} end ${want}`);
    }
    if (item && couponMaxUses(s.couponRow) > 0) {
      const wantUses = couponRecordedUses(s.couponRow);
      if (item.totalUsesCount !== wantUses) problems.push(`${row.coupon_id} ${code}: totalUsesCount ${item.totalUsesCount} ≠ recorded ${wantUses}`);
      if (item.maxUsesNumber !== couponMaxUses(s.couponRow)) problems.push(`${row.coupon_id} ${code}: maxUsesNumber ${item.maxUsesNumber} ≠ ${couponMaxUses(s.couponRow)}`);
    }
    rows.push(row);
  }
  return { rows, problems };
}
