/**
 * org-contract-specs.mjs — SINGLE SOURCE OF TRUTH for the B2B **contract-pricing** discrimination
 * fixture (VCST-5378 user story 2: "a B2B buyer's contract pricing survives a UCP agent handoff").
 *
 * Side-effect-free: no env, no network, no fs. The seeder, the drift guard and the unit tests all
 * import THIS module, so none of them can drift from the others.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS — the fixture defect it closes
 * ---------------------------------------------------------------------------------------------
 * `.claude/knowledge/domain/ucp.md` §7 (2026-09-17) recorded contract pricing as NOT VERIFIABLE on
 * this environment: no contract bound org `@td(ORG_ACME.platform_id)`, 0 of 99 price-list
 * assignments conditioned on its groups, and `pricelists/evaluate` returned an identical set with
 * and without those groups. Re-measured live 2026-09-22 through the STOREFRONT read path, before
 * this fixture existed: `QA-TIER-001` read **29.99 anonymous and 29.99 org-authenticated**.
 *
 * That is exactly `.claude/rules/test-data.md` SECOND RULE's failure mode — equal values on both
 * sides of the distinction under test. A correct implementation and a broken one produce the same
 * observation, so every case built on it is a vacuous pass. The fix is not "seed a cheaper product":
 * it is to create the org-conditioned pricing that never existed.
 *
 * ---------------------------------------------------------------------------------------------
 * THE MECHANISM (established live 2026-09-22, not assumed)
 * ---------------------------------------------------------------------------------------------
 * `VirtoCommerce.Contracts` is installed. `POST /api/contracts/prices/linkpricelist` creates TWO
 * pricelist assignments on the contract's store, both conditioned on a single
 * `UserGroupsContainsCondition` whose `group` equals the contract's **code**:
 *
 *   <name>-Base      priority 10000  → the pricelist you linked
 *   <name>-Priority  priority 10001  → a SECOND pricelist the module creates for per-product
 *                                      contract prices, written via POST /api/contracts/prices/products
 *
 * `POST /api/contracts/members/add` writes that group onto whichever member you pass.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠ LIMITATION, MEASURED — the group must be on the CONTACT, not only on the ORGANIZATION
 * ---------------------------------------------------------------------------------------------
 * Adding the ORGANISATION to the contract (the natural B2B modelling choice, and what the Admin UI
 * offers) puts the group on the organisation and makes the contract price resolve through the
 * Platform pricing engine — `POST /api/pricing/evaluate` with `userGroups:[<code>]` returned 11.11
 * against 29.99 without it. It does **NOT** change what the storefront serves: an authenticated
 * buyer of that organisation still read 29.99 through xAPI. Moving the same group onto the buyer's
 * CONTACT member flipped the same read to 11.11 with nothing else changed, and an unconditional
 * control assignment proved the pricelist, the index and the xAPI plumbing were never the blocker.
 *
 * So xAPI's price-evaluation context takes user groups from the CONTACT and not from the contact's
 * organisation. This fixture therefore binds BOTH — the organisation (so the contract is real and
 * Admin-visible) and a dedicated contract buyer contact (so the storefront actually applies it).
 * That asymmetry is a candidate product finding, not something this fixture should paper over; it
 * is stated here, at the fixture, per SECOND RULE ("state the fixture's own limits").
 *
 * ---------------------------------------------------------------------------------------------
 * BLAST RADIUS — why a DEDICATED buyer and not an existing one
 * ---------------------------------------------------------------------------------------------
 * Putting the contract group on an existing AcmeCorp buyer would change what every suite that signs
 * in as that buyer reads for `QA-TIER-001` (CART-078 asserts its 29.99/26.99/23.99 tier ladder).
 * The group is therefore given to ONE new, AGENT-TEST- account created and torn down by this
 * seeder. The organisation-level group is inert for other suites precisely because of the
 * limitation above — nothing on the storefront reads it.
 *
 * BL-* preserved: BL-B2B-* (org scoping — the buyer is a member of the contracted org and of no
 * other), BL-PRICE-* (the anonymous ladder is untouched; the contract adds a higher-priority
 * pricelist rather than mutating the standard one).
 *
 * RUNTIME IDS: every server-assigned GUID lands in `test-data/aliases.<env>.json`, never here and
 * never in a committed CSV (`.claude/rules/test-data.md` §Seed writeback, DV-021).
 */

import { SPEC_OVERLAYS, slugify, productSlug, storefrontPathForAdHoc } from '../products/standard-specs.mjs';

/** Everything this seeder creates carries this prefix so teardown sweeps exactly these. */
export const SEED_PREFIX = 'AGENT-TEST';

/** Server-assigned fields that must NEVER appear in a committed file. */
export const RUNTIME_FIELDS = ['id', 'contact_id', 'pricelist_id', 'priority_pricelist_id',
  'base_assignment_id', 'priority_assignment_id', 'org_platform_id'];

/**
 * The contract's code — and therefore the user group its assignments condition on.
 *
 * DERIVED, not transcribed: the Contracts module writes `members/add` groups equal to the contract
 * `code`, and every contract on this platform follows `contract-<slug of name>`
 * (`Contract1` → `contract-contract1`, `New contract` → `contract-new-contract`, confirmed live).
 * Computing it keeps the assignment condition, the member group and the alias in lock-step.
 */
export function contractCode(name) {
  return `contract-${slugify(name)}`;
}

export const CONTRACT = Object.freeze({
  aliasName: 'UCP_ORG_CONTRACT',
  name: 'AGENT-TEST-UCP-Acme-Contract',
  /** The organisation this contract prices for — resolved from b2b/organizations.csv, never hardcoded. */
  orgCsvId: 'ORG-001',
  orgAlias: 'ORG_ACME',
  status: 'Active',
  currency: 'USD',
});

/** The group name the assignments condition on and the members carry. */
export const CONTRACT_GROUP = contractCode(CONTRACT.name);

/** Name of the pricelist linked as the contract's BASE. The module derives the Priority one itself. */
export const BASE_PRICELIST_NAME = `${CONTRACT.name}-${CONTRACT.currency}`;

/**
 * The contracted product — the EXISTING tier fixture, extended rather than replaced.
 *
 * `specId` points at the row in `standard-specs.mjs` SPEC_OVERLAYS that owns its anonymous ladder,
 * so the anonymous side of the comparison is read from its source of truth instead of transcribed
 * (GOLDEN RULE). Adding a tier break there and forgetting it here fails the guard loudly.
 */
export const CONTRACTED_PRODUCT = Object.freeze({
  aliasName: 'UCP_CONTRACT_PRODUCT',
  sku: 'QA-TIER-001',
  specId: 'PROD-104',
  currency: 'USD',
});

/**
 * The contract price per tier break, in the contract's currency.
 *
 * Chosen to be UNMISTAKABLE in an API response: repdigits, roughly a third of list, far outside any
 * plausible tax, rounding or FX artifact, and equal to none of the anonymous ladder's values. A
 * reviewer reading `11.11` next to `29.99` cannot mistake the difference for anything but a
 * different price list.
 */
export const CONTRACT_PRICE_BY_MIN_QTY = Object.freeze({ 1: 11.11, 10: 9.99, 20: 8.88 });

/**
 * The CONTROL product — in the same catalog and the same standard pricelist, deliberately NOT in
 * the contract. Without it, a blanket "this buyer gets everything cheaper" defect would read
 * exactly like working contract pricing. No price is declared for it on purpose: the assertion is
 * an EQUALITY between two contexts, so the fixture needs no number of its own and cannot rot.
 */
export const CONTROL_PRODUCT = Object.freeze({
  aliasName: 'UCP_CONTRACT_CONTROL_PRODUCT',
  sku: 'QA-SUBFIVE-001',
});

/**
 * ASSORTMENT SCOPING — a product visible to the contract buyer and INVISIBLE to an anonymous
 * session. The second half of VCST-5378 story 2's promise, and a genuinely different mechanism from
 * price: `VirtoCommerce.CatalogPersonalization` tags a catalog entity with user groups, and the
 * search filter serves a tagged entity only to a session whose groups intersect the tags. Untagged
 * entities stay visible to everyone, which is why this scopes ONE product instead of hiding a store.
 *
 * SEEDABLE WITHOUT TOUCHING SHARED STORE CONFIG — established live 2026-09-22: the module is
 * installed, its settings are platform-level (`CatalogPersonalization.TagsInheritancePolicy` etc.)
 * and already in production use on this env (25 tagged items, several already tagged with another
 * contract's group). Nothing store-level is changed, and no existing product is tagged — a tag on a
 * shared fixture would hide it from every suite that browses for it.
 *
 * THE fixture property is `tags`. An empty tag list leaves the product visible to everyone, at which
 * point the "not visible anonymously" half asserts nothing — so `validateFixtureShape()` rejects it.
 */
export const ORG_ONLY_PRODUCT = Object.freeze({
  aliasName: 'UCP_ORG_ONLY_PRODUCT',
  sku: 'QA-ORGONLY-001',
  name: 'AGENT-TEST-UCP-Org-Only-Product',
  listPrice: 44.44,
  currency: 'USD',
  stockQty: 50,
  categoryPath: 'Test Fixtures',
  get slug() { return productSlug(this.name); },
  get url() { return storefrontPathForAdHoc(this.categoryPath, this.name); },
  /** The personalization tag that scopes it. Derived from the contract, never a second literal. */
  get tags() { return [CONTRACT_GROUP]; },
});

/**
 * The assortment product's pricelist is deliberately UNCONDITIONED and separate from the contract's.
 * If it were group-conditioned, the anonymous half would fail because the product has no price
 * rather than because it is out of assortment — two different defects with one observation.
 */
export const ASSORTMENT_PRICELIST_NAME = 'AGENT-TEST-UCP-Assortment-USD';

/**
 * The B2C consumer context — VCST-5378's FIRST user story, which every prior pass on the ticket
 * left unfixtured because it only ever used the B2B account.
 *
 * NO NEW ACCOUNT IS SEEDED. `@td(LOY_PERSONAL_NOORG)` already exists on this deployment: a Customer
 * storefront account with NO organisation membership at all. There is no separate B2C *store* on
 * vcst — the committed `STORE_B2C` alias names `B2C-store`, which the platform does not have, and
 * the storefront serves one store per host — so the consumer persona on this environment IS an
 * org-less account on the same store. Creating a second store is shared configuration and is
 * deliberately not done here.
 *
 * It is also the sharpest control this fixture has: an AUTHENTICATED buyer who is not on the
 * contract. Confirmed live 2026-09-22 — signs in, carries no `organization_id` claim, reads
 * QA-TIER-001 at 29.99 (the anonymous ladder, not 11.11) and cannot see the org-only product. That
 * rules out "authentication itself triggers the discount", which the anonymous side alone cannot.
 */
export const B2C_CONSUMER_ALIAS = 'LOY_PERSONAL_NOORG';

/**
 * The dedicated contract buyer. A NEW account, not an existing AcmeCorp user — see BLAST RADIUS.
 * The password is a `{{VAR}}` token resolved at seed time from `.env.local`
 * (`scripts/lib/user-provision.mjs` resolvePassword); never a literal (`td:reconcile` secret hygiene).
 */
export const CONTRACT_BUYER = Object.freeze({
  aliasName: 'UCP_CONTRACT_BUYER',
  email: 'test-ucp-contract-buyer@test-agent.com',
  firstName: 'AGENT-TEST-UCP',
  lastName: 'Contract Buyer',
  password: '{{B2B_USER_PASSWORD}}',
  orgCsvId: CONTRACT.orgCsvId,
});

/** Display name the contact is created with — prefixed so teardown sweeps it. */
export const contractBuyerName = () => `${CONTRACT_BUYER.firstName} ${CONTRACT_BUYER.lastName}`;

// ---------------------------------------------------------------------------------------------
// DERIVATIONS — computed values. These are what the unit tests exercise (§7a): a wrong
// implementation here writes a price, a tier break or a condition tree that no human wrote down.
// ---------------------------------------------------------------------------------------------

/**
 * The ANONYMOUS ladder for the contracted product, read from the product's own spec.
 * `sale ?? list` is what a shopper actually pays at that break.
 */
export function anonymousTiers(specId = CONTRACTED_PRODUCT.specId, overlays = SPEC_OVERLAYS) {
  const rows = overlays[specId]?.tierPrices || [];
  // `??` and NOT `||`: a legitimate sale of 0.00 is a price, and `||` would silently fall back to
  // the list price — the fixture would then compare the contract against a number no shopper pays.
  return rows.map((r) => ({ minQuantity: r.minQuantity, amount: r.sale ?? r.list }));
}

/**
 * The CONTRACT ladder — one row per anonymous tier break, so the contract wins at EVERY break.
 *
 * Mirroring the breaks is not cosmetic. A contract row only at minQuantity 1 leaves the qty-10
 * shopper matching the standard pricelist's own qty-10 row, which would surface as the contract
 * buyer paying 26.99 where the anonymous shopper pays 26.99 — the exact non-discrimination this
 * fixture exists to remove, reappearing above the first tier threshold.
 *
 * An unmapped break yields `amount: undefined`, which `validateFixtureShape()` rejects.
 */
export function contractTiers(specId = CONTRACTED_PRODUCT.specId, overlays = SPEC_OVERLAYS) {
  return anonymousTiers(specId, overlays).map((t) => ({
    minQuantity: t.minQuantity,
    amount: CONTRACT_PRICE_BY_MIN_QTY[t.minQuantity],
  }));
}

/** Per-break divergence: anonymous − contract. This is the number a case asserts. */
export function priceDeltas(specId = CONTRACTED_PRODUCT.specId, overlays = SPEC_OVERLAYS) {
  const anon = anonymousTiers(specId, overlays);
  const contract = contractTiers(specId, overlays);
  return anon.map((a, i) => ({
    minQuantity: a.minQuantity,
    anonymous: a.amount,
    contract: contract[i].amount,
    delta: Number.isFinite(a.amount) && Number.isFinite(contract[i].amount)
      ? Math.round((a.amount - contract[i].amount) * 100) / 100
      : null,
  }));
}

/** Contract create body. Pure — the caller supplies the env's store id. */
export function buildContractBody({ storeId, code = CONTRACT_GROUP } = {}) {
  return {
    name: CONTRACT.name,
    code,
    status: CONTRACT.status,
    storeId,
    description: `${SEED_PREFIX} contract pricing fixture for ${CONTRACT.orgAlias} (VCST-5378 story 2). `
      + 'Seeded by npm run seed:org-contract.',
  };
}

/** Base pricelist create body. Pure. */
export function buildPricelistBody({ name = BASE_PRICELIST_NAME, currency = CONTRACT.currency } = {}) {
  return {
    name,
    currency,
    description: `${SEED_PREFIX} base pricelist linked to ${CONTRACT.name}.`,
  };
}

/**
 * The Price rows written into the contract's PRIORITY pricelist. Pure.
 * One row per contract tier break; `list` carries the contract amount (no `sale` layer — the
 * contract price IS the price, and a sale on top would make "which layer won" unobservable again).
 */
export function buildPriceRows({ productId, pricelistId, specId = CONTRACTED_PRODUCT.specId } = {}) {
  return contractTiers(specId).map((t) => ({
    productId,
    pricelistId,
    list: t.amount,
    minQuantity: t.minQuantity,
    currency: CONTRACTED_PRODUCT.currency,
  }));
}

/**
 * Member group set after joining/leaving the contract. Pure, order-preserving, idempotent.
 * `join=false` is the teardown half — teardown must remove ONLY our group and leave every other
 * group the member carries (AcmeCorp legitimately has "Premium Customers" and "store-acme").
 */
export function applyGroup(existing = [], group = CONTRACT_GROUP, join = true) {
  // Filter BEFORE stringifying: String(null) is the truthy string "null", which would survive a
  // post-map Boolean filter and be written back as a group literally named "null".
  const list = (existing || []).filter((g) => g !== null && g !== undefined && String(g).trim() !== '').map(String);
  if (!join) return list.filter((g) => g !== group);
  return list.includes(group) ? list : [...list, group];
}

/** Contact create body for the dedicated contract buyer. Pure. */
export function buildBuyerContactBody({ orgPlatformId, group = CONTRACT_GROUP } = {}) {
  return {
    memberType: 'Contact',
    firstName: CONTRACT_BUYER.firstName,
    lastName: CONTRACT_BUYER.lastName,
    fullName: contractBuyerName(),
    name: contractBuyerName(),
    emails: [CONTRACT_BUYER.email],
    organizations: orgPlatformId ? [orgPlatformId] : [],
    groups: [group],
    status: 'Approved',
    timeZone: 'America/New_York',
    defaultLanguage: 'en-US',
    currencyCode: CONTRACT.currency,
  };
}

/** Security-account create body for the contract buyer. Pure — password already resolved. */
export function buildBuyerAccountBody({ contactId, storeId, password } = {}) {
  return {
    userName: CONTRACT_BUYER.email,
    email: CONTRACT_BUYER.email,
    password,
    memberId: contactId,
    storeId,
    userType: 'Customer',
    isAdministrator: false,
    status: 'Approved',
  };
}

/**
 * Names of the two assignments the Contracts module derives from the contract + pricelist names.
 * Teardown needs them because `DELETE /api/contracts` does NOT cascade — measured 2026-09-22: both
 * assignments and BOTH pricelists survived the contract's deletion.
 */
export function derivedAssignmentNames({ basePricelistName = BASE_PRICELIST_NAME } = {}) {
  const stem = `Contract-${CONTRACT.name}-${basePricelistName}`;
  return { base: `${stem}-Base`, priority: `${stem}-Priority` };
}

/** True for any pricing entity this seeder owns — the teardown predicate. Pure. */
export function isSeededPricingEntity(name) {
  const s = String(name || '');
  return s.startsWith(BASE_PRICELIST_NAME)
    || s.startsWith(ASSORTMENT_PRICELIST_NAME)
    || s.startsWith(`Contract-${CONTRACT.name}-`);
}

/** Catalog product body for the org-only assortment fixture. Pure. */
export function buildAssortmentProductBody({ catalogId, categoryId } = {}) {
  return {
    catalogId,
    categoryId,
    name: ORG_ONLY_PRODUCT.name,
    code: ORG_ONLY_PRODUCT.sku,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: true,
  };
}

/**
 * CatalogPersonalization tagged-item body. Pure.
 *
 * `existingId` matters: the endpoint is a PUT that creates when the id is absent, so omitting a
 * known id leaves the previous tagged item behind AND the newer one wins non-deterministically.
 */
export function buildTaggedItemBody({ productId, existingId = null, tags = ORG_ONLY_PRODUCT.tags } = {}) {
  return {
    entityType: 'Product',
    entityId: productId,
    label: ORG_ONLY_PRODUCT.name,
    tags: [...tags],
    ...(existingId ? { id: existingId } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// NON-VACUITY CONTRACT — owned by td:validate:org-contract (§7a). Declared here so the guard and
// the seeder's own pre-flight agree; NOT re-asserted in a unit test.
// ---------------------------------------------------------------------------------------------

/** Returns problem strings. Empty ⇒ the fixture can still make its cases FAIL. */
export function validateFixtureShape() {
  const problems = [];
  const anon = anonymousTiers();
  const contract = contractTiers();

  if (!anon.length) {
    problems.push(`${CONTRACTED_PRODUCT.aliasName}: standard-specs SPEC_OVERLAYS['${CONTRACTED_PRODUCT.specId}'] declares no tierPrices — there is no anonymous ladder to diverge FROM, so the fixture compares against nothing`);
  }

  for (let i = 0; i < anon.length; i += 1) {
    const a = anon[i], c = contract[i];
    if (!Number.isFinite(c.amount)) {
      problems.push(`${CONTRACTED_PRODUCT.aliasName}: no CONTRACT_PRICE_BY_MIN_QTY entry for tier break minQuantity=${a.minQuantity} — that break falls back to the anonymous price, so the contract buyer and the anonymous shopper read the SAME number above it`);
      continue;
    }
    if (c.amount === a.amount) {
      problems.push(`${CONTRACTED_PRODUCT.aliasName}: contract ${c.amount} === anonymous ${a.amount} at minQuantity=${a.minQuantity} — equal values on both sides of the distinction under test (test-data.md SECOND RULE); a correct and a broken implementation produce the same observation`);
      continue;
    }
    if (c.amount >= a.amount) {
      problems.push(`${CONTRACTED_PRODUCT.aliasName}: contract ${c.amount} is NOT below anonymous ${a.amount} at minQuantity=${a.minQuantity} — a contract that prices ABOVE list is not the scenario these cases describe`);
    }
    const gap = Math.abs(a.amount - c.amount);
    const pct = a.amount ? gap / a.amount : 0;
    if (pct < 0.2) {
      problems.push(`${CONTRACTED_PRODUCT.aliasName}: the gap at minQuantity=${a.minQuantity} is ${(pct * 100).toFixed(1)}% (${a.amount} → ${c.amount}) — small enough for a reviewer to read as a tax, rounding or FX artifact rather than a different price list`);
    }
  }

  // The contract ladder must stay strictly decreasing, like the anonymous one it shadows.
  for (let i = 1; i < contract.length; i += 1) {
    if (Number.isFinite(contract[i].amount) && Number.isFinite(contract[i - 1].amount)
      && contract[i].amount >= contract[i - 1].amount) {
      problems.push(`${CONTRACTED_PRODUCT.aliasName}: contract tier ${contract[i].minQuantity} (${contract[i].amount}) is not below tier ${contract[i - 1].minQuantity} (${contract[i - 1].amount}) — a volume ladder that stops falling makes the qty-break cases undecidable`);
    }
  }

  // A contract amount colliding with ANY anonymous amount makes "which ladder am I on" unreadable.
  const anonAmounts = new Set(anon.map((t) => t.amount));
  for (const c of contract) {
    if (anonAmounts.has(c.amount)) {
      problems.push(`${CONTRACTED_PRODUCT.aliasName}: contract amount ${c.amount} also appears in the anonymous ladder — a reader cannot tell which list produced it`);
    }
  }

  if (CONTROL_PRODUCT.sku === CONTRACTED_PRODUCT.sku) {
    problems.push('CONTROL_PRODUCT and CONTRACTED_PRODUCT are the same SKU — the control exists to stay EQUAL across contexts while the contracted product diverges; one product cannot do both');
  }

  // Assortment half — the tag IS the fixture.
  const tags = ORG_ONLY_PRODUCT.tags || [];
  if (!tags.length) {
    problems.push(`${ORG_ONLY_PRODUCT.aliasName}: no personalization tags — an untagged product is visible to EVERY session, so the "invisible to an anonymous shopper" half asserts nothing`);
  }
  if (tags.length && !tags.includes(CONTRACT_GROUP)) {
    problems.push(`${ORG_ONLY_PRODUCT.aliasName}: tags ${JSON.stringify(tags)} do not include the contract group "${CONTRACT_GROUP}" — the contract buyer would not see it either, so the fixture is invisible to everyone rather than scoped`);
  }
  if (!ORG_ONLY_PRODUCT.name.startsWith(SEED_PREFIX)) {
    problems.push(`${ORG_ONLY_PRODUCT.aliasName}: name "${ORG_ONLY_PRODUCT.name}" must start with "${SEED_PREFIX}" so teardown sweeps it`);
  }
  const skus = [CONTRACTED_PRODUCT.sku, CONTROL_PRODUCT.sku, ORG_ONLY_PRODUCT.sku];
  if (new Set(skus).size !== skus.length) {
    problems.push(`the three product fixtures must be distinct SKUs — got ${JSON.stringify(skus)}; one product cannot hold three contradictory properties`);
  }
  if (!ORG_ONLY_PRODUCT.url.startsWith('/') || /^[a-z]+:\/\//i.test(ORG_ONLY_PRODUCT.url) || ORG_ONLY_PRODUCT.url.includes('{{')) {
    problems.push(`${ORG_ONLY_PRODUCT.aliasName}: url "${ORG_ONLY_PRODUCT.url}" must be store-RELATIVE — a case composes {{FRONT_URL}}@td(${ORG_ONLY_PRODUCT.aliasName}.url), and /product/<sku> renders an SPA soft-404 behind HTTP 200`);
  }

  if (!CONTRACT.name.startsWith(SEED_PREFIX)) {
    problems.push(`CONTRACT.name "${CONTRACT.name}" must start with "${SEED_PREFIX}" so teardown sweeps it`);
  }
  if (CONTRACT_GROUP !== contractCode(CONTRACT.name)) {
    problems.push(`CONTRACT_GROUP "${CONTRACT_GROUP}" is not the contract's own code — the assignments condition on the code, so a divergent group silently matches nobody and every buyer reads the anonymous price`);
  }
  if (!/^\{\{[A-Z0-9_]+\}\}$/.test(CONTRACT_BUYER.password)) {
    problems.push(`CONTRACT_BUYER.password "${CONTRACT_BUYER.password}" must be a {{VAR}} token resolved from .env.local — a literal is a committed credential`);
  }
  if (!contractBuyerName().startsWith(SEED_PREFIX)) {
    problems.push(`CONTRACT_BUYER display name "${contractBuyerName()}" must start with "${SEED_PREFIX}" so teardown sweeps it`);
  }

  for (const f of [CONTRACT, CONTRACTED_PRODUCT, CONTROL_PRODUCT, ORG_ONLY_PRODUCT, CONTRACT_BUYER]) {
    for (const field of RUNTIME_FIELDS) {
      if (f[field]) problems.push(`${f.aliasName}: carries a runtime "${field}" in the committed spec — server-assigned ids belong in aliases.<env>.json only (DV-021)`);
    }
  }

  return problems;
}
