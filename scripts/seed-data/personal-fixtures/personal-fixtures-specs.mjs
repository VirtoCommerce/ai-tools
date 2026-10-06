/**
 * scripts/seed-data/personal-fixtures/personal-fixtures-specs.mjs
 *
 * SINGLE SOURCE OF TRUTH for the "personal fixtures" family (REG-2026-10-02-2022 triage): the
 * per-ACCOUNT state that shared personas need before suites 011 / 045 / 015 can execute.
 * Side-effect-free — no env load, no network, no fs, no main() — so the seeder
 * (seed-personal-fixtures.mjs) and the drift guard (validate-personal-fixtures-data.mjs) import the
 * SAME declarations and the SAME pure checks.
 *
 * WHAT IT PROVISIONS (all ADDITIVE on shared accounts — nothing pre-existing is modified or deleted)
 *   1. USER_DEFAULT address book — three AGENT-TEST-marked addresses picked BY BUSINESS KEY from
 *      test-data/addresses/us-addresses.csv (this module transcribes no address field).
 *      Serves 011 CHK-110 (keyword search), CHK-114 (column sort) and 045 A11Y-SORT-001/002/003.
 *   2. A saved List on USER_DEFAULT (045 A11Y-SR-006 / A11Y-CC-004 need >=1 list CARD).
 *   3. A saved List with >=2 products on ORG_USER_DEFAULT (015 QUOTE-015, RFQ from a saved list).
 *   4. NO WRITE — a read-only liveness check that USER_NO_ADDRESSES still has ZERO addresses
 *      (011 CHK-095 empty state). USER_DEFAULT cannot serve that case: CHK-110/114 need it to hold
 *      >=3 addresses, so the two preconditions are mutually exclusive on one account.
 *
 * WHY THE ROW CHOICE IS LOAD-BEARING (.claude/rules/test-data.md SECOND RULE — decidable per link)
 *   - CHK-110 types @td(ADDRESS_SEARCH.cityNeedle) then @td(ADDRESS_SEARCH.zipNeedle) and asserts the
 *     list shows ONLY the matching addresses. That is falsifiable only if each needle matches >=1
 *     seeded row AND misses >=1, and matches it through the field the case names (city / ZIP) —
 *     a needle that also hits a street or phone makes "filtered by city" unprovable.
 *     `needleProblems()` checks exactly that against the needles read from aliases.json.
 *   - CHK-114 asserts the first-click order DIFFERS from the default order and the second click is
 *     its EXACT reverse. If the seed order were already sorted, or two recipients tied on the sort
 *     key, a broken sort would pass. The sort key is the recipient name (the case says so, without
 *     saying first vs last), so `sortProblems()` requires DISTINCT values and a seed order that is
 *     neither ascending nor descending on firstName, lastName AND "first last".
 *
 * TEARDOWN marker: every seeded address carries outerId `AGENT-TEST-PADDR:<address_id>` (OuterId
 * persists on the customer AddressEntity — rationale in b2b/addresses-specs.mjs). The prefix is
 * deliberately DIFFERENT from b2b's `AGENT-TEST-ADDR:` so neither seeder's sweep can reach the
 * other's addresses. Lists are located by their AGENT-TEST name.
 */
import { regionNameFor, addressContentKey, findGuidLeaks } from '../b2b/addresses-specs.mjs';

export { regionNameFor, addressContentKey, findGuidLeaks };

export const DOMAIN = 'personal-fixtures';

/* ── 1. Address book ────────────────────────────────────────────────────────── */

/** The ONE source of address content. Rows are picked by `address_id`, never transcribed. */
export const ADDRESS_SOURCE_CSV = 'test-data/addresses/us-addresses.csv';

export const ADDRESS_MARKER_PREFIX = 'AGENT-TEST-PADDR';
/** vc-module-customer AddressEntity.OuterId is [StringLength(128)]. */
export const ADDRESS_MARKER_MAX_LENGTH = 128;
export const addressMarker = (rowId) => `${ADDRESS_MARKER_PREFIX}:${String(rowId ?? '').trim()}`;
export const isOurAddressMarker = (v) => String(v ?? '').startsWith(`${ADDRESS_MARKER_PREFIX}:`);

export const ADDRESS_BOOK = {
  alias: 'USER_DEFAULT_ADDRESS_BOOK',
  ownerAlias: 'USER_DEFAULT',
  /** The checkout popup lists shipping-capable addresses; the persona's own address is this type too. */
  addressType: 'BillingAndShipping',
  /**
   * Recipient names are DISTINCT on first, last and full name (sortProblems), so no stable-sort tie
   * can blur "the second click is the exact reverse". The seed order (Brown, Wilson, O'Connor) is
   * not sorted either, but the storefront sorts by the address NAME (recipientName below), and the
   * xAPI DEFAULT order was observed on vcst 2026-10-05 to be name ascending itself — so data can
   * guarantee distinct non-null names and an exactly reversible sort, NOT a default that differs from
   * the first click. The seeder re-checks both on the LIVE xAPI orders, recording the verdict in
   * aliases.<env>.json for the guard.
   *   US-ADDR-005 Michael Brown      Seattle 98101   — misses both needles (the control row)
   *   US-ADDR-006 Lisa Wilson        Houston 77001   — the cityNeedle hit
   *   US-ADDR-051 Mary-Jane O'Connor New York 10001  — the zipNeedle hit
   */
  rowIds: ['US-ADDR-005', 'US-ADDR-006', 'US-ADDR-051'],
  /** CHK-110 / CHK-114 need >=3; A11Y-SORT-* need >=2. Counted over the SEEDED rows alone, so the
   *  persona's own pre-existing address is a bonus, never a dependency. */
  minSeeded: 3,
  needleAlias: 'ADDRESS_SEARCH',
  /** needle field on ADDRESS_SEARCH → the CSV column it must match through (and only through). */
  needles: { cityNeedle: 'city', zipNeedle: 'zip_code' },
  cases: ['CHK-110', 'CHK-114', 'A11Y-SORT-001', 'A11Y-SORT-002', 'A11Y-SORT-003'],
};

/** us-addresses.csv carries the country NAME; the platform wants ISO-3. Only US rows are allowed
 *  (the file is the US address set) — any other value fails the guard loudly instead of guessing. */
export const COUNTRY_NAME_TO_ISO3 = Object.freeze({ 'United States': 'USA' });

/** Every field a storefront keyword search could plausibly match on, per CSV row. */
const SEARCHABLE_COLUMNS = ['first_name', 'last_name', 'company', 'address_line1', 'address_line2', 'city', 'state', 'zip_code', 'phone'];

/**
 * The address `name` — the field the storefront address popup SORTS BY (`sort=name:asc|desc`, observed
 * REG-2026-10-05-1521: with `name` null on the seeded rows the reverse-order assertion was undecidable).
 * Derived from the row's recipient, so it is distinct whenever the recipients are (sortProblems).
 */
export const recipientName = (row) => `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();

/** Fields the seeder reconciles IN PLACE on an already-present marked address (drift repair). */
export const RECONCILE_FIELDS = ['name', 'firstName', 'lastName', 'line1', 'line2', 'city', 'postalCode', 'regionId', 'phone'];

/** CSV row → platform Address body (PURE). */
export function buildAddress(row, addressType = ADDRESS_BOOK.addressType) {
  return {
    addressType,
    name: recipientName(row) || undefined,
    firstName: row.first_name || undefined,
    lastName: row.last_name || undefined,
    organization: row.company || undefined,
    line1: row.address_line1,
    line2: row.address_line2 || undefined,
    city: row.city,
    regionId: row.state || undefined,
    regionName: regionNameFor(row.state),
    postalCode: row.zip_code,
    countryCode: COUNTRY_NAME_TO_ISO3[String(row.country || '').trim()] || undefined,
    countryName: row.country,
    phone: row.phone || undefined,
    isDefault: false,
    outerId: addressMarker(row.address_id),
  };
}

/**
 * CHK-110 decidability (PURE). `needles` = { cityNeedle: 'Hou', zipNeedle: '1000' } as read from
 * the ADDRESS_SEARCH alias. Returns [] when every needle hits >=1 and misses >=1 seeded row, and
 * every hit comes through the column the case filters by.
 */
export function needleProblems(rows, needles, needleColumns = ADDRESS_BOOK.needles) {
  const errs = [];
  for (const [needleKey, column] of Object.entries(needleColumns)) {
    const needle = String(needles?.[needleKey] ?? '').trim().toLowerCase();
    if (!needle) { errs.push(`ADDRESS_SEARCH.${needleKey} is empty — CHK-110 has nothing to type`); continue; }
    const hits = rows.filter((r) => SEARCHABLE_COLUMNS.some((c) => String(r[c] ?? '').toLowerCase().includes(needle)));
    if (hits.length === 0) errs.push(`${needleKey} "${needle}" matches NO seeded address — the filter step would show an empty list (undecidable)`);
    if (hits.length === rows.length) errs.push(`${needleKey} "${needle}" matches EVERY seeded address — "only matching rows shown" cannot fail`);
    for (const r of hits) {
      if (!String(r[column] ?? '').toLowerCase().includes(needle)) {
        const via = SEARCHABLE_COLUMNS.filter((c) => String(r[c] ?? '').toLowerCase().includes(needle));
        errs.push(`${needleKey} "${needle}" hits ${r.address_id} through ${via.join('/')} not ${column} — the case asserts a ${column} filter`);
      }
    }
  }
  return errs;
}

const SORT_KEYS = {
  name: (a) => a.name, // what the popup actually sorts by
  firstName: (a) => a.firstName,
  lastName: (a) => a.lastName,
  fullName: (a) => `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim(),
};

/**
 * CHK-114 / A11Y-SORT decidability (PURE). `addrs` = addresses IN THE ORDER THE LIST RENDERS BY
 * DEFAULT (for the static guard: seed order). Values on each candidate sort key must be distinct
 * (a tie makes "second click is the exact reverse" ambiguous under a stable sort) and the order
 * must be neither ascending nor descending (else the first click cannot visibly reorder).
 */
export function sortProblems(addrs) {
  const errs = [];
  if ((addrs || []).length < 2) return ['fewer than 2 addresses — nothing to sort'];
  for (const [name, key] of Object.entries(SORT_KEYS)) {
    const vals = addrs.map((a) => String(key(a) ?? '').toLowerCase());
    if (vals.some((v) => !v.trim())) errs.push(`${name}: empty/null on ${vals.filter((v) => !v.trim()).length} address(es) — they tie, so the sort cannot be reversed exactly`);
    if (new Set(vals).size !== vals.length) errs.push(`${name}: duplicate values (${vals.join(' | ')}) — a stable sort cannot be reversed exactly`);
    const asc = [...vals].sort((x, y) => x.localeCompare(y));
    const desc = [...asc].reverse();
    if (vals.join('\u0000') === asc.join('\u0000')) errs.push(`${name}: default order is already ASCENDING — the first click cannot reorder`);
    if (vals.join('\u0000') === desc.join('\u0000')) errs.push(`${name}: default order is already DESCENDING — the second click cannot reorder`);
  }
  return errs;
}

/* ── 2/3. Saved lists (xAPI wishlists) ──────────────────────────────────────── */

export const LIST_PREFIX = 'AGENT-TEST';

/**
 * Product ids come from EXISTING buyable @td aliases (runtime ids in aliases.<env>.json) — two
 * DISTINCT products, so "pre-populates with ALL list items" (QUOTE-015) is not satisfied by one.
 */
export const LIST_PRODUCT_ALIASES = ['BUYABLE_PRICED_PRODUCT', 'BUYABLE_SIBLING_B2B'];

export const LISTS = [
  {
    alias: 'PERSONAL_LIST_USER_DEFAULT',
    ownerAlias: 'USER_DEFAULT',
    listName: `${LIST_PREFIX} Personal Saved List`,
    minItems: 1,
    requireBuyable: false, // the a11y cases read the CARD (date + save icon), not the items
    cases: ['A11Y-SR-006', 'A11Y-CC-004'],
  },
  {
    alias: 'ORG_USER_RFQ_LIST',
    ownerAlias: 'ORG_USER_DEFAULT',
    listName: `${LIST_PREFIX} RFQ Saved List`,
    minItems: 2,
    requireBuyable: true, // an RFQ built from an unbuyable / unpriced line would block on the product, not the feature
    cases: ['QUOTE-015'],
  },
];

/* ── 4. Zero-address persona (read-only) ────────────────────────────────────── */

export const ZERO_ADDRESS_PERSONA = {
  alias: 'USER_NO_ADDRESSES',
  csvFile: 'users/test-users',
  rowId: 'USER-021',
  cases: ['CHK-095'],
};

/** Every alias this domain owns. */
export const OWNED_ALIASES = [ADDRESS_BOOK.alias, ...LISTS.map((l) => l.alias), ZERO_ADDRESS_PERSONA.alias];

/* ── Account resolution (PURE, loader injected) ─────────────────────────────── */

/**
 * Resolve a CSV-backed persona alias (`{ file, filter, fields }`) to its row's fields — the same
 * shape `@td(ALIAS.field)` resolves. `loadRows(file)` returns the parsed CSV rows for
 * `test-data/<file>.csv`. Throws when the alias or its row is missing (fail loud).
 */
export function resolvePersona(aliases, aliasName, loadRows) {
  const a = aliases?.[aliasName];
  if (!a?.file || !a?.filter) throw new Error(`alias ${aliasName} is not a CSV-backed persona alias`);
  const rows = loadRows(a.file);
  const row = rows.find((r) => Object.entries(a.filter).every(([k, v]) => String(r[k]) === String(v)));
  if (!row) throw new Error(`alias ${aliasName}: no row in ${a.file} matches ${JSON.stringify(a.filter)}`);
  const out = {};
  for (const [field, col] of Object.entries(a.fields || {})) out[field] = row[col];
  return out;
}

/* ── Static self-consistency (PURE) ─────────────────────────────────────────── */

/**
 * Everything checkable without the platform. `ctx` = { addressRows, aliases, loadRows }.
 * Returns [] when sound. The drift guard calls this; the seeder calls it before any write.
 */
export function validateSpec({ addressRows, aliases, loadRows }) {
  const errs = [];
  const byId = new Map((addressRows || []).map((r) => [r.address_id, r]));
  const rows = [];
  for (const id of ADDRESS_BOOK.rowIds) {
    const r = byId.get(id);
    if (!r) { errs.push(`${id} not found in ${ADDRESS_SOURCE_CSV}`); continue; }
    if (!COUNTRY_NAME_TO_ISO3[String(r.country || '').trim()]) errs.push(`${id}: country "${r.country}" has no ISO-3 mapping (column shift?)`);
    if (!/^\d{5}$/.test(String(r.zip_code || ''))) errs.push(`${id}: zip_code "${r.zip_code}" is not a 5-digit ZIP (column shift?)`);
    if (!r.first_name || !r.last_name || !r.city || !r.address_line1) errs.push(`${id}: missing name/line1/city`);
    if (addressMarker(id).length > ADDRESS_MARKER_MAX_LENGTH) errs.push(`${id}: marker exceeds ${ADDRESS_MARKER_MAX_LENGTH} chars`);
    rows.push(r);
  }
  if (new Set(ADDRESS_BOOK.rowIds).size !== ADDRESS_BOOK.rowIds.length) errs.push('duplicate address row id in ADDRESS_BOOK.rowIds');
  if (rows.length < ADDRESS_BOOK.minSeeded) errs.push(`only ${rows.length} address rows resolve — need >= ${ADDRESS_BOOK.minSeeded}`);
  const keys = rows.map((r) => addressContentKey(buildAddress(r)));
  if (new Set(keys).size !== keys.length) errs.push('two seeded rows share a content key (same type/line1/city/country)');

  const needles = aliases?.[ADDRESS_BOOK.needleAlias];
  if (!needles) errs.push(`alias ${ADDRESS_BOOK.needleAlias} missing — CHK-110 needles are read from it`);
  else errs.push(...needleProblems(rows, needles));
  errs.push(...sortProblems(rows.map((r) => buildAddress(r))));

  for (const l of LISTS) {
    if (!l.listName.startsWith(LIST_PREFIX)) errs.push(`list ${l.alias} lacks the ${LIST_PREFIX} prefix (teardown would miss it)`);
    if (l.minItems > LIST_PRODUCT_ALIASES.length) errs.push(`list ${l.alias} needs ${l.minItems} items but only ${LIST_PRODUCT_ALIASES.length} product aliases are declared`);
  }
  if (new Set(LIST_PRODUCT_ALIASES).size !== LIST_PRODUCT_ALIASES.length) errs.push('LIST_PRODUCT_ALIASES must be DISTINCT products');
  for (const p of LIST_PRODUCT_ALIASES) if (!aliases?.[p]) errs.push(`product alias ${p} missing from aliases.json`);
  if (new Set(LISTS.map((l) => l.listName)).size !== LISTS.length) errs.push('two lists share a name');

  // Persona aliases must resolve, and the zero-address persona must NOT be an account this family writes to.
  const owners = new Set([ADDRESS_BOOK.ownerAlias, ...LISTS.map((l) => l.ownerAlias)]);
  const emails = new Map();
  for (const o of [...owners, ZERO_ADDRESS_PERSONA.alias]) {
    try { const p = resolvePersona(aliases, o, loadRows); emails.set(o, String(p.email || '').toLowerCase());
      if (!/^\{\{[A-Z0-9_]+\}\}$/.test(String(p.password || '').trim())) errs.push(`${o}: password is not a {{VAR}} token`);
    } catch (e) { errs.push(e.message); }
  }
  const zeroEmail = emails.get(ZERO_ADDRESS_PERSONA.alias);
  for (const o of owners) if (zeroEmail && emails.get(o) === zeroEmail) errs.push(`${ZERO_ADDRESS_PERSONA.alias} resolves to the same account as ${o} — it would receive seeded data`);
  return errs;
}
