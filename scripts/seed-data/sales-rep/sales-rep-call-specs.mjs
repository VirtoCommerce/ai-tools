/**
 * sales-rep-call-specs.mjs — side-effect-free source of truth for the VCST-6256 "Call a customer"
 * fixtures (vc-module-sales-rep PR #37): one DEDICATED rep, SR_REP_CALL, serving ONLY the eleven
 * AGENT-TEST-SR-Call-NN orgs below, so its My customers page shows exactly these rows.
 *
 * What the feature reads (PR #37, read at 0b3c557 — re-read it if the module moves):
 *   server  `phone`          = primaryContact.phones[0] ?? organization.phones[0]   (MemberExtensions.GetPrimaryPhone)
 *           `primaryContact` = org owner; else the OLDEST (createdDate asc) contact member that is NOT a
 *                              granting sales-rep member of that org; else null  (SalesRepPrimaryContactResolver)
 *           `address`        = the org's default address (its `phone` field)
 *   client  buildCustomerPhones(): candidates = primaryContact.phones (label = contact fullName),
 *           then `phone`, then `address.phone` (label = org name); normalized to digits + leading '+',
 *           empties dropped, first occurrence wins; the first entry is the default number.
 *
 * Every variant exists because it makes a WRONG implementation observable (SECOND RULE):
 *   01 MULTI      3 owner phones, three spellings      -> a list that keeps only phones[0] shows 1, not 3
 *   02 DUP        contact "+1 (555) 020-3040" vs address "+1-555-020-3040" (same digits, different text)
 *                 + org phone "+1-555-020-9999"          -> dedup on RAW text shows 2; and the org phone is
 *                 MASKED because `phone` takes the contact's first number — so the expected list is ONE
 *                 number. A client that read organization.phones directly would show it (2 numbers).
 *   03 ORGONLY    no contact but the rep; org phone only -> label must be the ORG name; the rep's own
 *                 contact phone (+1-555-090-0001) must NOT surface (rep exclusion)
 *   04 OWNERLESS  no owner; contacts = SR_REP_CALL's contact (older, phone +1-555-090-0001) and a
 *                 non-rep contact created later (+1-555-041-0002) -> primaryContact must be the NON-rep
 *   05 NONE       owner contact with no phones, no org/address phone -> 0 numbers, contact still shown
 *   06 EXT        "+1-555-040-5060 x45" -> stored text kept; href = normalized digits (the product folds
 *                 the extension into the dial string: tel:+1555040506045 — see EXT note in the report)
 *   07 ADDR       contact +1-555-050-6070, address +1-555-050-6071 -> 2 numbers, 2nd labelled ORG name
 *   08 ORGADDR    owner without phones; org "+1 (555) 080-9010", address "+1-555-080-9010" -> `phone`
 *                 falls back to the org number and collapses with the address: 1 number, ORG label
 *   09/10 FILLER  nothing — they only push org 11 onto page 2
 *   11 PAGE2      owner phone +1-555-110-1100 — the only row on page 2 (10 per page) with a number
 *
 * Order on the page: the rep has NO orders, so the default "my-last-orders" rule ties every row and the
 * handler falls back to ThenBy(Name) — the NN in the name fixes the order, 01..10 on page 1, 11 on page 2.
 *
 * FIFTH RULE: nothing in the environment moves these states (no job, query or expiry touches member
 * phones / owners / memberships), so seeding — not in-case creation — is correct. A case that EDITS a
 * phone here must restore it in Cleanup.
 */

export const CALL_PREFIX = 'AGENT-TEST-SR-Call-';
export const CALL_STORE = 'B2B-store';
export const PAGE_SIZE = 10;

/** The dedicated rep. Password = SR_REP_PASSWORD (same var every seeded rep uses). */
export const CALL_REP = {
  aliasName: 'SR_REP_CALL',
  email: 'agent-test-sr-call@example.com',
  firstName: 'Cal', lastName: 'Caller', fullName: 'Cal Caller',
  store: CALL_STORE,
  // On the rep's OWN contact: it is the oldest contact member of every served org, so a resolver that
  // forgets to exclude reps surfaces this number on 03 / 04 / 09 / 10.
  phones: ['+1-555-090-0001'],
};

const addr = (n, phone = '') => ({
  addressType: 'Shipping', line1: `${n} Call Center Way`, city: 'Seattle', regionName: 'Washington',
  countryName: 'United States', countryCode: 'USA', postalCode: '98101', isDefault: true, phone,
});

/**
 * contacts[]: { key, fullName, phones, owner } in CREATION order. `owner: true` makes it the org owner.
 * Names carry the prefix so teardown finds them by keyword; the contact's label on the page is fullName.
 */
export const CALL_ORGS = [
  { key: 'V1', aliasName: 'ORG_SR_CALL_MULTI', name: `${CALL_PREFIX}01-MultiPhone`, orgPhones: [], address: addr(1),
    contacts: [{ key: 'V1C', fullName: `${CALL_PREFIX}01-Owner`, phones: ['+1 555 010 2030', '+1-555-010-2031', '(555) 010-2032'], owner: true }] },
  { key: 'V2', aliasName: 'ORG_SR_CALL_DUP', name: `${CALL_PREFIX}02-Duplicate`, orgPhones: ['+1-555-020-9999'], address: addr(2, '+1-555-020-3040'),
    contacts: [{ key: 'V2C', fullName: `${CALL_PREFIX}02-Owner`, phones: ['+1 (555) 020-3040'], owner: true }] },
  { key: 'V3', aliasName: 'ORG_SR_CALL_ORGONLY', name: `${CALL_PREFIX}03-OrgOnly`, orgPhones: ['+1-555-030-4050'], address: addr(3),
    contacts: [] },
  { key: 'V4', aliasName: 'ORG_SR_CALL_OWNERLESS', name: `${CALL_PREFIX}04-Ownerless`, orgPhones: [], address: addr(4),
    contacts: [{ key: 'V4C', fullName: `${CALL_PREFIX}04-Buyer`, phones: ['+1-555-041-0002'], owner: false }] },
  { key: 'V5', aliasName: 'ORG_SR_CALL_NONE', name: `${CALL_PREFIX}05-NoNumber`, orgPhones: [], address: addr(5),
    contacts: [{ key: 'V5C', fullName: `${CALL_PREFIX}05-Owner`, phones: [], owner: true }] },
  { key: 'V6', aliasName: 'ORG_SR_CALL_EXT', name: `${CALL_PREFIX}06-Extension`, orgPhones: [], address: addr(6),
    contacts: [{ key: 'V6C', fullName: `${CALL_PREFIX}06-Owner`, phones: ['+1-555-040-5060 x45'], owner: true }] },
  { key: 'V7', aliasName: 'ORG_SR_CALL_ADDR', name: `${CALL_PREFIX}07-AddressDistinct`, orgPhones: [], address: addr(7, '+1-555-050-6071'),
    contacts: [{ key: 'V7C', fullName: `${CALL_PREFIX}07-Owner`, phones: ['+1-555-050-6070'], owner: true }] },
  { key: 'V8', aliasName: 'ORG_SR_CALL_ORGADDR', name: `${CALL_PREFIX}08-OrgAddressDup`, orgPhones: ['+1 (555) 080-9010'], address: addr(8, '+1-555-080-9010'),
    contacts: [{ key: 'V8C', fullName: `${CALL_PREFIX}08-Owner`, phones: [], owner: true }] },
  { key: 'F9', aliasName: 'ORG_SR_CALL_FILL09', name: `${CALL_PREFIX}09-Filler`, orgPhones: [], address: addr(9), contacts: [] },
  { key: 'F10', aliasName: 'ORG_SR_CALL_FILL10', name: `${CALL_PREFIX}10-Filler`, orgPhones: [], address: addr(10), contacts: [] },
  { key: 'P2', aliasName: 'ORG_SR_CALL_PAGE2', name: `${CALL_PREFIX}11-PageTwo`, orgPhones: [], address: addr(11),
    contacts: [{ key: 'P2C', fullName: `${CALL_PREFIX}11-Owner`, phones: ['+1-555-110-1100'], owner: true }] },
];

/** Same rule as the storefront's normalizePhone(): digits + a leading '+' when the text starts with one. */
export function normalizePhone(value) {
  const trimmed = String(value ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits && trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** The primary contact the server should resolve for a spec org (null = none). Pure. */
export function expectedPrimaryContact(org) {
  return org.contacts.find((c) => c.owner) || org.contacts[0] || null; // the rep's contact is always excluded
}

/** The server's `phone`: primary contact's first phone, else the org's first phone, else null. */
export function expectedPhoneField(org) {
  const pc = expectedPrimaryContact(org);
  return pc?.phones?.[0] ?? org.orgPhones[0] ?? null;
}

/** The list the storefront should render — the oracle the drift guard and the live verify share. */
export function expectedPhones(org) {
  const pc = expectedPrimaryContact(org);
  const candidates = [
    ...(pc?.phones || []).map((n) => ({ name: pc.fullName || org.name, number: n })),
    { name: org.name, number: expectedPhoneField(org) },
    { name: org.name, number: org.address?.phone },
  ];
  const seen = new Set(); const out = [];
  for (const { name, number } of candidates) {
    const stored = (number ?? '').trim(); const norm = normalizePhone(stored);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm); out.push({ name, number: stored, href: `tel:${norm}` });
  }
  return out;
}

/** Non-vacuity: each variant must still discriminate what it exists for. Returns problem strings. */
export function callShortfalls(orgs = CALL_ORGS, rep = CALL_REP) {
  const p = []; const by = Object.fromEntries(orgs.map((o) => [o.key, o]));
  const n = (k) => (by[k] ? expectedPhones(by[k]).length : -1);
  if (n('V1') < 3) p.push('V1 must yield >= 3 contact numbers');
  if (by.V1 && new Set(by.V1.contacts[0].phones.map((x) => x.replace(/\d/g, '#'))).size < 2) p.push('V1 phones must use different spellings');
  const v2 = by.V2; if (v2) {
    const c = v2.contacts[0].phones[0]; const a = v2.address.phone;
    if (c === a || normalizePhone(c) !== normalizePhone(a)) p.push('V2 contact and address phone must be the same number in DIFFERENT text');
    if (!v2.orgPhones[0] || normalizePhone(v2.orgPhones[0]) === normalizePhone(c)) p.push('V2 needs a DISTINCT org phone (the masked one)');
    if (n('V2') !== 1) p.push('V2 must collapse to exactly 1 number');
  }
  if (by.V3 && (by.V3.contacts.length || n('V3') !== 1 || expectedPhones(by.V3)[0].name !== by.V3.name)) p.push('V3 must be org-only: 1 number labelled with the org name');
  const v4 = by.V4; if (v4) {
    if (v4.contacts.some((c) => c.owner)) p.push('V4 must have NO owner');
    if (!rep.phones?.length || normalizePhone(rep.phones[0]) === normalizePhone(v4.contacts[0]?.phones?.[0])) p.push('V4 rep phone and buyer phone must DIFFER');
  }
  if (by.V5 && (n('V5') !== 0 || !expectedPrimaryContact(by.V5))) p.push('V5 must have a contact and 0 numbers');
  if (by.V6 && !/x\d+/i.test(by.V6.contacts[0].phones[0])) p.push('V6 must carry an extension');
  if (by.V7) { const l = expectedPhones(by.V7); if (l.length !== 2 || l[1].name !== by.V7.name || l[0].name === l[1].name) p.push('V7 must yield 2 numbers, the 2nd labelled with the ORG name'); }
  if (by.V8) { const l = expectedPhones(by.V8); if (l.length !== 1 || l[0].name !== by.V8.name || by.V8.orgPhones[0] === by.V8.address.phone) p.push('V8 must collapse org+address (different text) to 1 org-labelled number'); }
  // Paging: > PAGE_SIZE orgs, and the rows past the first page (by name) include a number.
  const sorted = [...orgs].sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length <= PAGE_SIZE) p.push(`needs > ${PAGE_SIZE} orgs for a page 2`);
  if (!sorted.slice(PAGE_SIZE).some((o) => expectedPhones(o).length)) p.push('page 2 must hold an org with a number');
  // Rep phone must never be an expected number (proves rep exclusion is observable).
  const repNorm = normalizePhone(rep.phones?.[0]);
  for (const o of orgs) if (expectedPhones(o).some((x) => normalizePhone(x.number) === repNorm)) p.push(`${o.key} would expose the rep's own phone`);
  for (const o of orgs) if (!o.name.startsWith(CALL_PREFIX) || o.contacts.some((c) => !c.fullName.startsWith(CALL_PREFIX))) p.push(`${o.key}: name lacks ${CALL_PREFIX}`);
  if (new Set(orgs.map((o) => o.aliasName)).size !== orgs.length) p.push('alias names must be unique');
  return p;
}

/**
 * PERSISTED ORDER (measured on vcptcore 2026-11-09): the Customer module does NOT return a contact's
 * phones in the order they were written — V1 written [2030, 2031, (555)2032] reads back
 * [2031, (555)2032, 2030], stably, on REST and on xAPI alike. So within the CONTACT block the order is
 * the platform's, and "the default number" is whatever primaryContact.phones[0] reads back as. The
 * statically knowable default exists only when the contact block has <= 1 entry; otherwise it is ''
 * here and the seeder writes the observed one to the overlay as `default_href`.
 */
export function defaultIsStatic(org) {
  return (expectedPrimaryContact(org)?.phones?.length || 0) <= 1;
}

/** The overlay/alias fields the committed base declares per org alias (expectations are DERIVED). */
export function orgAliasExpectations(org) {
  const list = expectedPhones(org); const pc = expectedPrimaryContact(org);
  return {
    name: org.name,
    expected_phone_count: String(list.length),
    expected_default_href: defaultIsStatic(org) ? (list[0]?.href || '') : '',
    // Order = contact block (platform order, see above) → `phone` → address; compare the contact block as a set.
    expected_hrefs: list.map((x) => x.href).join(';'),
    expected_labels: list.map((x) => x.name).join(';'),
    expected_primary_contact: pc?.fullName || '',
  };
}
