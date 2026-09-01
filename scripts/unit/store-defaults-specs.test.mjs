/**
 * Unit tests for scripts/seed-data/store/store-defaults-specs.mjs — the store required-defaults
 * invariant (defaultCurrency / defaultLanguage / url). Pure logic only: no network, no env, no fs.
 *
 * The tests are written against the two ways this guard can be WORSE THAN NOTHING, not against the
 * happy path:
 *
 *   (a) It can fail to see the outage it exists for. The 2026-08-27 incident was a partial
 *       `PUT /api/stores` that nulled three fields on a live store while leaving `id`, `name`,
 *       `catalog` and `settings` intact — so a shape check, an existence check, and every
 *       entity-liveness probe in td:reconcile all passed. §1/§2 reproduce that exact wreckage.
 *
 *   (b) It can WRITE A GUESS. A guard that confidently proposes "USD" for a store that is
 *       legitimately EUR is more expensive than no guard at all, because someone will apply it.
 *       §4 is mostly about making `deriveExpectation` REFUSE — on disagreeing orders, on a
 *       multi-entry list, on a store FRONT_URL does not describe, and on peer-store consensus,
 *       which must never be promoted to a value however lopsided it is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_FIELDS, REQUIRED_FIELD_NAMES, INFORMATIONAL_FIELDS, CODES,
  isBlank, isStorefrontServing, gatedStoreIds, auditStore,
  deriveExpectation, deriveExpectations, peerCorroboration,
  formatFinding, formatExpectation, summarize,
  fieldsLostByWrite, coerceSettingValue, mergeSettingValue,
} from '../seed-data/store/store-defaults-specs.mjs';

/* ── Fixtures: the live vcst-qa B2B-store, healthy and wrecked ──────────────────
 * `healthy` is transcribed from the real record on vcst-qa after the 17:02:56Z restore.
 * `wrecked` is what suite 075d's partial PUT actually left behind — the SAME record with the
 * omitted fields nulled and everything the body did send still present.
 */
const healthy = () => ({
  id: 'B2B-store',
  name: 'B2B-store',
  storeState: 'Open',
  catalog: 'fc596540864a41bf8ab78734ee7353a3',
  defaultCurrency: 'USD',
  currencies: ['GHS', 'CZK', 'CNY', 'PTS', 'AUD', 'EUR', 'XPT', 'GBP', 'USD'],
  defaultLanguage: 'en-US',
  languages: ['pl-PL', 'de-DE', 'en-GB', 'en-US', 'ru-RU', 'es-ES'],
  url: 'https://vcst-qa-storefront.govirto.com',
  secureUrl: 'https://vcst-qa-storefront.govirto.com',
  settings: [{ name: 'Loyalty.Missions.Enable', valueType: 'Boolean', value: true }],
});

const wrecked = () => ({
  ...healthy(),
  defaultCurrency: null,
  defaultLanguage: null,
  url: null,
  secureUrl: null,
  currencies: [],
  languages: [],
});

const codesOf = (findings) => findings.map((f) => f.code).sort();
const fieldsOf = (findings, sev) => findings.filter((f) => f.severity === sev).map((f) => f.field).sort();

/* ── §0 The invariant is declared, not implied ─────────────────────────────── */

test('§0 the three required fields are exactly the ones that break the storefront', () => {
  assert.deepEqual(REQUIRED_FIELD_NAMES, ['defaultCurrency', 'defaultLanguage', 'url']);
  // Every required field must say what it BREAKS — a guard that fails without saying why gets
  // triaged as flake. This is the text a human reads at 5pm on a broken shared env.
  for (const s of REQUIRED_FIELDS) assert.ok(s.breaks && s.breaks.length > 10, `${s.field} declares no breakage`);
});

test('§0 secureUrl is INFORMATIONAL, never gated — B2B-store served correctly with it null', () => {
  assert.deepEqual([...INFORMATIONAL_FIELDS], ['secureUrl']);
  assert.ok(!REQUIRED_FIELD_NAMES.includes('secureUrl'));
  const a = auditStore({ ...healthy(), secureUrl: null }, { gated: true, orderCount: 50 });
  assert.equal(a.missingRequired.length, 0);
  assert.equal(a.findings.filter((f) => f.severity === 'fail').length, 0, 'a null secureUrl must never gate');
  assert.deepEqual(codesOf(a.findings), [CODES.INFO_MISSING]);
});

/* ── §1 It SEES the 2026-08-27 wreckage ────────────────────────────────────── */

test('§1 the healthy live store produces no failure and no warning', () => {
  const a = auditStore(healthy(), { gated: true, orderCount: 8137 });
  assert.equal(a.missingRequired.length, 0);
  assert.equal(a.findings.filter((f) => f.severity !== 'info').length, 0);
});

test('§1 the partial-PUT wreckage fails on all three required fields, on a GATED store', () => {
  const a = auditStore(wrecked(), { gated: true, orderCount: 8137 });
  assert.deepEqual(a.missingRequired.sort(), ['defaultCurrency', 'defaultLanguage', 'url']);
  assert.deepEqual(fieldsOf(a.findings, 'fail'), ['defaultCurrency', 'defaultLanguage', 'url']);
});

test('§1 REGRESSION: the fields the partial PUT DID send stay intact — a shape check cannot see this', () => {
  // This is why nothing detected the outage: id/name/catalog/settings were all present and valid.
  const w = wrecked();
  assert.equal(w.id, 'B2B-store');
  assert.equal(w.catalog, 'fc596540864a41bf8ab78734ee7353a3');
  assert.equal(w.settings.length, 1);
  // ...and the guard still fails it, on the fields alone.
  assert.equal(auditStore(w, { gated: true }).findings.filter((f) => f.severity === 'fail').length, 3);
});

test('§1 every finding NAMES the store and the field — "a store is broken" is not actionable', () => {
  for (const f of auditStore(wrecked(), { gated: true }).findings) {
    assert.match(f.message, /B2B-store/, 'finding does not name the store');
    assert.match(f.message, new RegExp(f.field), 'finding does not name the field');
    assert.ok(f.code && f.storeId && f.field, 'finding is not attributable');
    assert.match(formatFinding(f), new RegExp(`\\[${f.code}\\]`));
  }
});

test('§1 an empty string and a whitespace-only string are blank; 0 and false are NOT', () => {
  assert.equal(isBlank(''), true);
  assert.equal(isBlank('   '), true);
  assert.equal(isBlank(null), true);
  assert.equal(isBlank(undefined), true);
  assert.equal(isBlank(0), false);
  assert.equal(isBlank(false), false);
  // A store whose url was set to "" rather than null is the same outage.
  assert.equal(auditStore({ ...healthy(), url: '   ' }, { gated: true }).missingRequired.join(), 'url');
});

/* ── §2 Coherence — populated but unusable is its own broken state ──────────── */

test('§2 a default that is not in its own list field is INCOHERENT, not merely present', () => {
  const s = { ...healthy(), defaultCurrency: 'JPY' }; // not in currencies[]
  const a = auditStore(s, { gated: true });
  assert.equal(a.missingRequired.length, 0, 'the field IS populated — a null check passes');
  const f = a.findings.find((x) => x.code === CODES.INCOHERENT);
  assert.ok(f, 'incoherent default not detected');
  assert.equal(f.severity, 'fail');
  assert.match(f.message, /JPY/);
  assert.match(f.message, /currencies\[/);
});

test('§2 a populated default over an EMPTY list is flagged separately (SD-003)', () => {
  const a = auditStore({ ...healthy(), currencies: [], languages: [] }, { gated: true });
  const codes = a.findings.filter((f) => f.severity === 'fail').map((f) => f.code);
  assert.deepEqual([...new Set(codes)], [CODES.EMPTY_LIST]);
  assert.equal(a.findings.filter((f) => f.code === CODES.EMPTY_LIST).length, 2, 'both currencies[] and languages[]');
});

/* ── §3 Scope — gate the store under test, do not manufacture noise elsewhere ── */

test('§3 the gated set is DERIVED from STORE_ID + stores.csv, never a hardcoded id list', () => {
  const g = gatedStoreIds({
    envStoreId: 'B2B-store',
    fixtureStoreIds: ['B2B-store', 'B2C-store', 'B2B-EU-store'], // template rows, not all provisioned
    liveStoreIds: ['B2B-store', 'Electronics', 'QA-STORE', 'test_del', 'B2C-store'],
  });
  assert.deepEqual([...g].sort(), ['B2B-store', 'B2C-store']);
  // A stores.csv row that is NOT live is not gated (it is a template for another env)...
  assert.ok(!g.has('B2B-EU-store'));
  // ...and a live store the repo never declared is not gated either.
  assert.ok(!g.has('Electronics'));
  assert.ok(!g.has('QA-STORE'));
});

test('§3 STORE_ID is gated even when it is absent live — that is a worse outage, not an exemption', () => {
  const g = gatedStoreIds({ envStoreId: 'B2B-store', fixtureStoreIds: [], liveStoreIds: ['Electronics'] });
  assert.ok(g.has('B2B-store'));
});

test('§3 an ungated DORMANT store is silent; an ungated SERVING one warns', () => {
  const dormant = { id: 'Electronics', defaultCurrency: 'USD', defaultLanguage: 'en-US', url: null, currencies: ['USD'], languages: ['en-US'] };
  // No url and no orders ⇒ not serving anything ⇒ reporting it forever is noise that trains
  // people to ignore the guard.
  assert.equal(isStorefrontServing(dormant, { orderCount: 0 }), false);
  assert.equal(auditStore(dormant, { gated: false, orderCount: 0 }).findings.filter((f) => f.severity !== 'info').length, 0);
  // Same record, but orders are being placed in it ⇒ somebody is using it ⇒ warn.
  assert.equal(isStorefrontServing(dormant, { orderCount: 3 }), true);
  assert.deepEqual(fieldsOf(auditStore(dormant, { gated: false, orderCount: 3 }).findings, 'warn'), ['url']);
});

test('§3 an ungated store NEVER escalates to fail — only the gated set gates', () => {
  const a = auditStore(wrecked(), { gated: false, orderCount: 500 });
  assert.equal(a.findings.filter((f) => f.severity === 'fail').length, 0);
  assert.equal(a.findings.filter((f) => f.severity === 'warn').length > 0, true);
  assert.equal(summarize([a]).failures.length, 0);
});

test('§3 summarize rolls up per severity and only failures gate', () => {
  const s = summarize([auditStore(wrecked(), { gated: true }), auditStore(healthy(), { gated: true })]);
  assert.equal(s.storesAudited, 2);
  assert.equal(s.failures.length, 3);
  assert.ok(s.infos.length >= 1); // wrecked secureUrl
});

/* ── §4 Derivation — evidence in, or NOTHING out. Never a guess. ────────────── */

const ordersUSD = (n = 12) => Array.from({ length: n }, () => ({ currency: 'USD', languageCode: 'en-US' }));

test('§4 unanimous recent orders are the primary evidence, and the source names them', () => {
  const e = deriveExpectation('defaultCurrency', { storeId: 'B2B-store', orders: ordersUSD(12) });
  assert.equal(e.value, 'USD');
  assert.equal(e.confidence, 'high');
  assert.match(e.source, /12 recent order/);
  assert.equal(e.reason, null);
  const l = deriveExpectation('defaultLanguage', { storeId: 'B2B-store', orders: ordersUSD(12) });
  assert.equal(l.value, 'en-US');
});

test('§4 DISAGREEING orders yield NO value — ambiguity is reported, never averaged or majority-voted', () => {
  const orders = [...ordersUSD(9), { currency: 'EUR', languageCode: 'de-DE' }];
  const e = deriveExpectation('defaultCurrency', { storeId: 'B2B-store', orders });
  assert.equal(e.value, null, 'a 9:1 majority must NOT become a value');
  assert.equal(e.confidence, 'none');
  assert.match(e.reason, /AMBIGUOUS/);
  assert.match(e.reason, /EUR/, 'the reason must name the competing values a human has to choose between');
});

test('§4 with no orders, a SINGLE-entry list field is evidence; a multi-entry one is not', () => {
  const one = deriveExpectation('defaultCurrency', { storeId: 'S', orders: [], storeCurrencies: ['USD'] });
  assert.equal(one.value, 'USD');
  assert.match(one.source, /exactly one entry/);
  // The real B2B-store has 9 currencies — picking one of them would be a coin flip.
  const many = deriveExpectation('defaultCurrency', { storeId: 'S', orders: [], storeCurrencies: healthy().currencies });
  assert.equal(many.value, null);
  assert.match(many.reason, /9 candidates/);
});

test('§4 with no orders and an empty list there is NO evidence — report null, let a human decide', () => {
  const e = deriveExpectation('defaultCurrency', { storeId: 'S', orders: [], storeCurrencies: [] });
  assert.equal(e.value, null);
  assert.match(e.reason, /no evidence/);
});

test('§4 PEER-STORE CONSENSUS IS NEVER PROMOTED TO A VALUE, however lopsided', () => {
  // This env really does carry a live EUR store (`test_del`) alongside four USD ones. A modal
  // value would have confidently rewritten it. Corroboration is text a human reads, nothing more.
  const peerStores = [
    { id: 'a', defaultCurrency: 'USD' }, { id: 'b', defaultCurrency: 'USD' },
    { id: 'c', defaultCurrency: 'USD' }, { id: 'd', defaultCurrency: 'USD' },
  ];
  const e = deriveExpectation('defaultCurrency', { storeId: 'test_del', orders: [], storeCurrencies: [], peerStores });
  assert.equal(e.value, null, '4/4 peer agreement must still not produce a value');
  assert.match(e.corroboration, /CORROBORATION ONLY/);
  assert.match(e.corroboration, /USD/);
  // ...and the corroboration text is not silently reused as the answer anywhere in the render.
  assert.match(formatExpectation(e), /NO DEFENSIBLE VALUE/);
});

test('§4 peerCorroboration reports the spread, so a split env cannot read as consensus', () => {
  const p = peerCorroboration([{ defaultCurrency: 'USD' }, { defaultCurrency: 'USD' }, { defaultCurrency: 'EUR' }], 'defaultCurrency');
  assert.equal(p.value, 'USD');
  assert.equal(p.count, 2);
  assert.equal(p.total, 3);
  assert.equal(p.distinct, 2, 'the number of DISTINCT values is what tells a human not to trust it');
  assert.equal(peerCorroboration([], 'defaultCurrency'), null);
});

test('§4 FRONT_URL supplies url ONLY for the env\'s own STORE_ID', () => {
  const ok = deriveExpectation('url', { storeId: 'B2B-store', envStoreId: 'B2B-store', frontUrl: 'https://vcst-qa-storefront.govirto.com' });
  assert.equal(ok.value, 'https://vcst-qa-storefront.govirto.com');
  assert.match(ok.source, /FRONT_URL/);
  // A DIFFERENT store: FRONT_URL says nothing about it, so pointing it at the env storefront
  // would silently re-home someone else's store.
  const other = deriveExpectation('url', { storeId: 'QA-STORE', envStoreId: 'B2B-store', frontUrl: 'https://vcst-qa-storefront.govirto.com' });
  assert.equal(other.value, null);
  assert.match(other.reason, /not "QA-STORE"/);
  // No FRONT_URL at all ⇒ no value.
  assert.equal(deriveExpectation('url', { storeId: 'B2B-store', envStoreId: 'B2B-store', frontUrl: '' }).value, null);
});

test('§4 a trailing slash on FRONT_URL is normalised away', () => {
  const e = deriveExpectation('url', { storeId: 'S', envStoreId: 'S', frontUrl: 'https://x.example.com///' });
  assert.equal(e.value, 'https://x.example.com');
});

test('§4 an unknown field name refuses rather than inventing a rule', () => {
  const e = deriveExpectation('timeZone', { storeId: 'S' });
  assert.equal(e.value, null);
  assert.match(e.reason, /no derivation rule/);
});

test('§4 deriveExpectations covers exactly the missing fields, and the wreckage derives cleanly', () => {
  const a = auditStore(wrecked(), { gated: true });
  const es = deriveExpectations(a.missingRequired, {
    storeId: 'B2B-store', envStoreId: 'B2B-store',
    frontUrl: 'https://vcst-qa-storefront.govirto.com',
    orders: ordersUSD(12), storeCurrencies: [], storeLanguages: [], peerStores: [],
  });
  assert.deepEqual(es.map((e) => e.field).sort(), ['defaultCurrency', 'defaultLanguage', 'url']);
  // These are exactly the three values a human restored by hand at 17:02:56Z — re-derived from
  // evidence rather than transcribed.
  assert.deepEqual(
    Object.fromEntries(es.map((e) => [e.field, e.value])),
    { defaultCurrency: 'USD', defaultLanguage: 'en-US', url: 'https://vcst-qa-storefront.govirto.com' },
  );
  for (const e of es) assert.match(formatExpectation(e), /evidence:/);
});

/* ── §5 The write guard — the rule the destructive PUT broke ────────────────── */

test('§5 the exact 075d partial body is REFUSED — all three required fields would be lost', () => {
  const partial = {
    id: 'B2B-store',
    catalog: 'fc596540864a41bf8ab78734ee7353a3',
    name: 'B2B-store',
    settings: [{ name: 'Loyalty.Missions.Enable', value: false }],
  };
  assert.deepEqual(fieldsLostByWrite(healthy(), partial).sort(), ['defaultCurrency', 'defaultLanguage', 'url']);
});

test('§5 the setMissionsEnabled-shaped full-body merge loses nothing', () => {
  const store = healthy();
  const next = mergeSettingValue(store, 'Loyalty.Missions.Enable', false);
  assert.deepEqual(fieldsLostByWrite(store, next), []);
  assert.equal(next.settings.find((s) => s.name === 'Loyalty.Missions.Enable').value, false);
  // Nothing but that one value moved.
  assert.equal(next.defaultCurrency, 'USD');
  assert.equal(next.url, store.url);
  assert.equal(next.settings.length, store.settings.length);
});

test('§5 mergeSettingValue does not INVENT a settings row for an unknown name', () => {
  const next = mergeSettingValue(healthy(), 'Not.A.Real.Setting', true);
  assert.equal(next.settings.length, 1);
  assert.ok(!next.settings.some((s) => s.name === 'Not.A.Real.Setting'));
});

test('§5 an ALREADY-blank required field is not attributed to this write', () => {
  // Blaming the current writer for a pre-existing null would make the guard cry wolf and get
  // bypassed; the SD-001 audit is what reports the pre-existing state.
  assert.deepEqual(fieldsLostByWrite(wrecked(), { id: 'B2B-store' }), []);
});

test('§5 coerceSettingValue reads the declared type instead of guessing it', () => {
  assert.equal(coerceSettingValue('false', 'Boolean'), false);
  assert.equal(coerceSettingValue('TRUE', 'Boolean'), true);
  // The bug this prevents: the STRING "false" is truthy, so a loose coercion silently enables
  // the setting you asked to disable.
  assert.notEqual(coerceSettingValue('false', 'Boolean'), 'false');
  assert.throws(() => coerceSettingValue('nope', 'Boolean'), /must be true\|false/);
  assert.equal(coerceSettingValue('42', 'Integer'), 42);
  assert.throws(() => coerceSettingValue('', 'Integer'), /must be numeric/);
  assert.equal(coerceSettingValue('Mixed Cart', 'ShortText'), 'Mixed Cart');
});
