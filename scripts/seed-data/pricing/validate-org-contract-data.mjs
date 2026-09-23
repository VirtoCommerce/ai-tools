/**
 * validate-org-contract-data.mjs — DRIFT / VACUITY GUARD for the B2B contract-pricing fixture
 * (VCST-5378 story 2). STATIC only (no network). `npm run td:validate:org-contract`; exits 1 on any
 * hard problem.
 *
 * WHAT IT PROTECTS — the fixture is defined by a DIVERGENCE, and a divergence is invisible to every
 * "does it exist?" gate. The contract, the pricelist and the assignments can all be present and
 * healthy while the contract price has quietly drifted onto the anonymous price, at which point the
 * cases built on it pass no matter what the product does. So this guard asserts, per §7a, the whole
 * DECLARATION side of the contract (the derivation side is `scripts/unit/seed-org-contract-pricing.test.mjs`):
 *
 *   1. org-contract-specs.validateFixtureShape() — the divergence itself, per tier break.
 *   2. The contract GROUP is declared on the organisation's committed CSV row, so a `seed:b2b`
 *      re-seed (which rewrites org groups from that column) cannot silently un-contract the org.
 *   3. The alias contract: every alias registered, field-complete, and carrying no runtime GUID in
 *      the committed base (DV-021's local twin).
 *   4. No credential literal — the buyer password is a {{VAR}} token.
 *   5. Informational: whether this env's overlay carries the runtime ids and the read-back numbers.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT, CONTRACT_GROUP, CONTRACTED_PRODUCT, CONTROL_PRODUCT, ORG_ONLY_PRODUCT, CONTRACT_BUYER,
  RUNTIME_FIELDS, anonymousTiers, contractTiers, priceDeltas, validateFixtureShape,
} from './org-contract-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;

/** Alias → the fields authored cases reference. A renamed field passes @td() through unresolved. */
const ALIAS_CONTRACT = {
  [CONTRACT.aliasName]: ['name', 'code', 'group', 'org_alias', 'id'],
  [CONTRACTED_PRODUCT.aliasName]: ['sku', 'currency', 'anonymous_price', 'contract_price', 'price_delta', 'id'],
  [CONTROL_PRODUCT.aliasName]: ['sku', 'id'],
  [ORG_ONLY_PRODUCT.aliasName]: ['sku', 'name', 'price', 'currency', 'slug', 'url', 'tag', 'id'],
  [CONTRACT_BUYER.aliasName]: ['email', 'group', 'org_alias', 'id'],
};

const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// 1. The divergence — the whole reason the fixture exists.
console.log('\n[1] org-contract-specs.mjs: the contract price still DIVERGES from the anonymous price');
const shape = validateFixtureShape();
for (const p of shape) fail(p);
if (!shape.length) {
  for (const d of priceDeltas()) {
    ok(`qty ${String(d.minQuantity).padStart(2)}+  anonymous ${d.anonymous} → contract ${d.contract}  (Δ ${d.delta}, ${((d.delta / d.anonymous) * 100).toFixed(0)}%)`);
  }
  ok(`control ${CONTROL_PRODUCT.sku} is NOT contracted — a blanket discount cannot masquerade as contract pricing`);
}

// 2. The org's committed groups column must declare the contract group.
console.log('\n[2] b2b/organizations.csv: the contracted org declares the contract group');
const orgCsv = join(ROOT, 'test-data', 'b2b', 'organizations.csv');
if (!existsSync(orgCsv)) fail(`b2b/organizations.csv not found`);
else {
  const lines = readFileSync(orgCsv, 'utf8').split(/\r?\n/);
  const header = (lines[0] || '').split(',');
  const groupsIdx = header.indexOf('groups');
  const row = lines.find((l) => l.startsWith(`${CONTRACT.orgCsvId},`));
  if (!row) fail(`b2b/organizations.csv has no ${CONTRACT.orgCsvId} row — there is no organisation to put on contract`);
  else if (groupsIdx < 0) fail('b2b/organizations.csv has no `groups` column');
  else if (!row.includes(CONTRACT_GROUP)) {
    fail(`b2b/organizations.csv ${CONTRACT.orgCsvId} does not declare group "${CONTRACT_GROUP}". \`seed:b2b\` rewrites an organisation's groups from that column (user-provision.orgBody), so a re-seed would strip the contract group and the org would quietly stop being on contract — with every guard still green.`);
  } else ok(`${CONTRACT.orgCsvId} declares "${CONTRACT_GROUP}" — survives a seed:b2b re-seed`);
}

// 3. Alias registry — registered, complete, GUID-free in the committed base.
console.log('\n[3] aliases.json: registered, field-complete, no committed runtime GUID');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
for (const [name, fields] of Object.entries(ALIAS_CONTRACT)) {
  const def = aliases[name];
  if (!def) { fail(`${name} is not registered in aliases.json — every @td(${name}.*) passes through unresolved`); continue; }
  const missing = fields.filter((f) => !(f in def));
  if (missing.length) fail(`${name} is missing field(s) the cases reference: ${missing.join(', ')}`);
  for (const rf of RUNTIME_FIELDS) {
    const v = String(def[rf] ?? '').trim();
    if (v && GUID_RE.test(v)) fail(`${name}.${rf}="${v}" is a runtime GUID committed into the BASE aliases.json — it belongs in aliases.<env>.json only (DV-021)`);
  }
  if (!missing.length) ok(`${name}: ${fields.length} contract field(s) present, no committed GUID`);
}

// 3b. The alias prices must equal what the spec derives — a hand-edited alias is a silent lie.
console.log('\n[4] aliases.json prices agree with org-contract-specs (derived, not hand-maintained)');
const a0 = anonymousTiers()[0], c0 = contractTiers()[0], d0 = priceDeltas()[0];
const prod = aliases[CONTRACTED_PRODUCT.aliasName] || {};
const cmp = [
  ['anonymous_price', a0?.amount], ['contract_price', c0?.amount], ['price_delta', d0?.delta],
];
for (const [field, derived] of cmp) {
  const declared = Number(prod[field]);
  if (!(field in prod)) continue; // already reported in [3]
  if (!Number.isFinite(declared) || Math.abs(declared - derived) > 1e-9) {
    fail(`${CONTRACTED_PRODUCT.aliasName}.${field}="${prod[field]}" != derived ${derived} (standard-specs SPEC_OVERLAYS['${CONTRACTED_PRODUCT.specId}'] + CONTRACT_PRICE_BY_MIN_QTY). A case asserting the alias would assert a number the seeder never wrote.`);
  } else ok(`${field} = ${derived}`);
}

// 3c. The assortment alias must stay derived from the spec — a hand-edited url or tag is silent.
const orgOnly = aliases[ORG_ONLY_PRODUCT.aliasName] || {};
for (const [field, derived] of [['url', ORG_ONLY_PRODUCT.url], ['slug', ORG_ONLY_PRODUCT.slug], ['tag', CONTRACT_GROUP], ['price', String(ORG_ONLY_PRODUCT.listPrice)]]) {
  if (!(field in orgOnly)) continue;
  if (String(orgOnly[field]) !== String(derived)) {
    fail(`${ORG_ONLY_PRODUCT.aliasName}.${field}="${orgOnly[field]}" != derived "${derived}" — the storefront path and the scoping tag are both DERIVED (standard-specs.storefrontPathForAdHoc / the contract code); a hand-maintained one drifts silently, and a wrong PDP path renders an SPA soft-404 behind HTTP 200`);
  } else ok(`${ORG_ONLY_PRODUCT.aliasName}.${field} = ${derived}`);
}

// 4. No credential literal anywhere in the committed alias block.
console.log('\n[5] no password literal in the committed fixture');
const buyer = aliases[CONTRACT_BUYER.aliasName] || {};
const leaked = Object.entries(buyer).find(([k, v]) => /pass/i.test(k) && !/^\{\{[A-Z0-9_]+\}\}$/.test(String(v)));
if (leaked) fail(`${CONTRACT_BUYER.aliasName}.${leaked[0]} carries a literal credential — it must be a {{VAR}} token resolved from .env.local`);
else ok(`${CONTRACT_BUYER.aliasName} carries no password literal`);

// 5. Overlay presence (informational — an unseeded env is a legitimate state).
const env = process.env.TEST_ENV || 'vcst';
console.log(`\n[6] aliases.${env}.json: runtime ids + read-back observations (informational)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
for (const name of Object.keys(ALIAS_CONTRACT)) {
  const have = Object.entries(overlay[name] || {}).filter(([, v]) => String(v || '').trim());
  if (!have.length) warn(`${name} has no overlay on ${env} — @td(${name}.id) resolves "" until \`TEST_ENV=${env} npm run seed:org-contract\` runs`);
  else ok(`${name}: ${have.map(([k]) => k).join(', ')}`);
}
const seen = overlay[CONTRACTED_PRODUCT.aliasName] || {};
if (seen.anonymous_price_at_seed && seen.contract_price_at_seed) {
  if (seen.anonymous_price_at_seed === seen.contract_price_at_seed) {
    fail(`aliases.${env}.json records the SAME price in both contexts (${seen.anonymous_price_at_seed}) — the last live read-back found the fixture non-discriminating on this env; re-run \`npm run seed:org-contract\` then \`:verify\``);
  } else ok(`last live read-back on ${env}: anonymous ${seen.anonymous_price_at_seed} vs contract ${seen.contract_price_at_seed}`);
} else warn(`no live read-back recorded on ${env} — run \`TEST_ENV=${env} npm run seed:org-contract:verify\``);
const seenAssort = overlay[ORG_ONLY_PRODUCT.aliasName] || {};
if (seenAssort.anonymous_visible_at_seed && seenAssort.contract_visible_at_seed) {
  if (seenAssort.anonymous_visible_at_seed === seenAssort.contract_visible_at_seed) {
    fail(`aliases.${env}.json records the SAME visibility in both contexts for ${ORG_ONLY_PRODUCT.sku} (${seenAssort.anonymous_visible_at_seed}) — the assortment half does not discriminate on this env`);
  } else ok(`last live read-back on ${env}: anonymous visible=${seenAssort.anonymous_visible_at_seed}, contract buyer visible=${seenAssort.contract_visible_at_seed}`);
}

console.log('\n=== org contract-pricing fixture drift/vacuity check ===');
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nContract-pricing fixture OK — the org price and the anonymous price still diverge.');
process.exit(0);
