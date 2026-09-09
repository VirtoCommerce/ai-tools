/**
 * Unit tests for missions-specs.overlayShadowProblems — the [8s] drift guard in
 * validate-missions-data.mjs. Pure logic only: no network, no env, no fs.
 *
 * The guard exists because of a failure that was invisible to every OTHER guard in the repo, so the
 * tests are written against that shape rather than against "does it find a wrong value": an env
 * overlay that carries an AUTHORED business key silently WINS over the committed base, the reference
 * still RESOLVES (so `td:validate` stays green), and re-seeding cannot remove it because
 * writeEnvAliasOverride merges per alias and never deletes.
 *
 * The first test replays the measured 2026-09-08 vcst drift verbatim, so a future refactor that
 * loosens the rule fails here rather than in a suite run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlayShadowProblems, RUNTIME_FIELDS_BY_KIND, PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT,
} from '../seed-data/loyalty/missions-specs.mjs';

/** The real runtime map for the two created PerSku targets, assembled the way the validator does. */
const RUNTIME = Object.fromEntries(
  [...PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT].map((p) => [p.aliasName, RUNTIME_FIELDS_BY_KIND.createdProduct]),
);

const BASE = {
  MSN_PERSKU_PRODUCT_A: { sku: 'AGENT-TEST-MSN-TARGET-A', name: 'AGENT-TEST Missions PerSku Target A', productId: '', catalogId: '', currency: '' },
  MSN_PERSKU_PRODUCT_B: { sku: 'AGENT-TEST-MSN-TARGET-B', name: 'AGENT-TEST Missions PerSku Target B', productId: '', catalogId: '', currency: '' },
};

test('replays the measured 2026-09-08 vcst drift: a discovered-generation sku/name shadow is caught on both slots', () => {
  const overlay = {
    MSN_PERSKU_PRODUCT_A: {
      productId: '7bd305cb-55ef-440a-8488-1aa9b777c70a',
      sku: '201482',
      name: 'PEPSI COLA REGULAR CRATE 28X0.20L',
      catalogId: '6032bd3c-77dc-4035-a94f-6f60ee5abb4e',
      currency: 'USD',
    },
    MSN_PERSKU_PRODUCT_B: {
      productId: 'e908c979-d79e-4cea-ad8b-57907b1c4f37',
      sku: '55557702',
      name: 'Xerox WorkCentre 3335DNI Mono Laser Multifunction Printer/Copier/Scanner/Fax Machine',
      catalogId: '6032bd3c-77dc-4035-a94f-6f60ee5abb4e',
      currency: 'USD',
    },
  };
  const problems = overlayShadowProblems(RUNTIME, overlay, BASE);
  assert.equal(problems.length, 4, `expected sku+name on both slots, got:\n${problems.join('\n')}`);
  for (const key of ['MSN_PERSKU_PRODUCT_A.sku', 'MSN_PERSKU_PRODUCT_A.name', 'MSN_PERSKU_PRODUCT_B.sku', 'MSN_PERSKU_PRODUCT_B.name']) {
    assert.ok(problems.some((p) => p.startsWith(key)), `no problem reported for ${key}`);
  }
  // The message must quote the value the shadow HIDES, or a reader cannot tell which side is correct.
  const a = problems.find((p) => p.startsWith('MSN_PERSKU_PRODUCT_A.sku'));
  assert.match(a, /"201482"/);
  assert.match(a, /AGENT-TEST-MSN-TARGET-A/);
});

test('the repaired overlay is clean — the runtime ids it legitimately carries are not flagged', () => {
  const overlay = {
    MSN_PERSKU_PRODUCT_A: { productId: '7bd305cb-55ef-440a-8488-1aa9b777c70a', catalogId: '6032bd3c-77dc-4035-a94f-6f60ee5abb4e', currency: 'USD' },
    MSN_PERSKU_PRODUCT_B: { productId: 'e908c979-d79e-4cea-ad8b-57907b1c4f37', catalogId: '6032bd3c-77dc-4035-a94f-6f60ee5abb4e', currency: 'USD' },
  };
  assert.deepEqual(overlayShadowProblems(RUNTIME, overlay, BASE), []);
});

test('every field the spec declares runtime is accepted — the guard must not fight the seeder it guards', () => {
  const overlay = {
    MSN_PERSKU_PRODUCT_A: Object.fromEntries(RUNTIME_FIELDS_BY_KIND.createdProduct.map((f) => [f, 'x'])),
  };
  assert.deepEqual(overlayShadowProblems(RUNTIME, overlay, BASE), []);
});

test('`fields` and `_`-prefixed documentation keys are not data and are never flagged', () => {
  const overlay = {
    MSN_PERSKU_PRODUCT_A: { productId: 'x', fields: { sku: 'sku' }, _inline: true, _notes: 'hand-edited' },
  };
  assert.deepEqual(overlayShadowProblems(RUNTIME, overlay, BASE), []);
});

test('an alias absent from the overlay, or a non-object entry, is not a shadow', () => {
  assert.deepEqual(overlayShadowProblems(RUNTIME, {}, BASE), []);
  assert.deepEqual(overlayShadowProblems(RUNTIME, { MSN_PERSKU_PRODUCT_A: null }, BASE), []);
  assert.deepEqual(overlayShadowProblems(RUNTIME, { MSN_PERSKU_PRODUCT_A: 'oops' }, BASE), []);
  assert.deepEqual(overlayShadowProblems(RUNTIME, { MSN_PERSKU_PRODUCT_A: ['oops'] }, BASE), []);
  assert.deepEqual(overlayShadowProblems(RUNTIME, undefined, BASE), []);
});

test('an EMPTY-STRING shadow is still a shadow — it is the worst case, not an exemption', () => {
  // A key blanked in the overlay wins exactly as hard as a wrong one: the authored base SKU becomes
  // '' and every @td() consumer silently addresses nothing. Distinct from the base, where '' is the
  // CORRECT value for a runtime field (check [4]) — which is why the two checks cannot be merged.
  const problems = overlayShadowProblems(RUNTIME, { MSN_PERSKU_PRODUCT_A: { sku: '' } }, BASE);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^MSN_PERSKU_PRODUCT_A\.sku/);
});

test('a key that is in NEITHER the runtime list nor the base is reported, and says so', () => {
  const problems = overlayShadowProblems(RUNTIME, { MSN_PERSKU_PRODUCT_A: { list_price: 999 } }, { MSN_PERSKU_PRODUCT_A: {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /absent from the base/);
});

test('the message names the repair AND rules out the wrong one — a re-seed cannot remove a shadow', () => {
  const problems = overlayShadowProblems(RUNTIME, { MSN_PERSKU_PRODUCT_A: { sku: '201482' } }, BASE);
  assert.match(problems[0], /Re-seeding cannot fix this/);
  assert.match(problems[0], /merges per alias and never deletes/);
});

test('the authored keys of the CREATED products are genuinely outside createdProduct — the guard has something to catch', () => {
  // If a refactor ever moved sku/name INTO createdProduct, every test above would still pass while
  // the guard silently stopped guarding. This asserts the premise directly.
  for (const f of ['sku', 'name']) {
    assert.ok(
      !RUNTIME_FIELDS_BY_KIND.createdProduct.includes(f),
      `RUNTIME_FIELDS_BY_KIND.createdProduct now lists "${f}" — a created fixture's ${f} is the business key the seeder finds-or-creates by, and listing it here disarms [8s]`,
    );
  }
});
