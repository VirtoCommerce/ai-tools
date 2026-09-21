// Unit tests for scripts/seed-data/cms/shared-components-specs.mjs — the DERIVATION only.
//
// Per .claude/knowledge/execution/when-to-write-a-test.md and .claude/rules/test-data.md FOURTH
// RULE, this file covers builders and transforms whose expected value is computed INDEPENDENTLY of
// the thing asserted: the omit->permission-set derivation, deterministic id assignment, the
// 3-key placement contract, `{ref}` resolution, and usage derivation over a SYNTHETIC fixture.
//
// It deliberately does NOT assert anything the committed fixture declares (block types, section
// texts, which component is unused) — `npm run td:validate:pb-shared` owns that, calls the same
// validateFixtureShape(), and adds the alias-registry / GUID-leak checks on top.
//
// Pure — no env, no network. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SC_PERMISSIONS, BUILDER_BASE_PERMISSIONS,
  rolePermissions, excludedPermissions, roleBody, accountBody, roleId, userEmail,
  blockId, placementId, placementItem, isLinkedPlacement, pageRefs,
  buildContentDoc, buildPageContentBody, buildComponentCreateBody, createGroupedBody,
  expectedUsage, validateFixtureShape,
} from '../seed-data/cms/shared-components-specs.mjs';

// ── permission derivation ────────────────────────────────────────────────────

test('rolePermissions: omitting a verb drops exactly that shared-components permission', () => {
  const all = rolePermissions({ key: 'x', omit: [] });
  const noCreate = rolePermissions({ key: 'x', omit: ['create'] });
  assert.equal(all.length - noCreate.length, 1);
  assert.deepEqual(
    all.filter((p) => !noCreate.includes(p)),
    ['builder:shared-components:create'],
  );
  // the base is untouched — that is what makes a 403 attributable to the sc gate
  for (const b of BUILDER_BASE_PERMISSIONS) assert.ok(noCreate.includes(b), `base ${b} must survive`);
});

test('rolePermissions: omitting every verb leaves the base and nothing else', () => {
  const none = rolePermissions({ key: 'x', omit: ['read', 'create', 'update', 'delete'] });
  assert.deepEqual(none, [...BUILDER_BASE_PERMISSIONS]);
  assert.deepEqual(excludedPermissions({ key: 'x', omit: ['read', 'create', 'update', 'delete'] }), [...SC_PERMISSIONS]);
});

test('excludedPermissions is the exact complement of what the role holds', () => {
  for (const omit of [[], ['read'], ['update'], ['create', 'delete']]) {
    const u = { key: 'x', omit };
    const held = new Set(rolePermissions(u));
    const lacked = excludedPermissions(u);
    assert.equal(lacked.length, omit.length);
    for (const p of lacked) assert.ok(!held.has(p), `${p} must not be held`);
    for (const p of SC_PERMISSIONS) assert.ok(held.has(p) || lacked.includes(p), `${p} must be held or lacked`);
  }
});

test('roleBody / accountBody: the account can never bypass the gate it is meant to prove', () => {
  const u = { key: 'sc-read', omit: ['create', 'update', 'delete'], storeScoped: true };
  const body = roleBody(u);
  assert.equal(body.id, roleId(u));
  assert.deepEqual(body.permissions.map((p) => p.name), rolePermissions(u));
  const acct = accountBody(u, { password: 'pw', storeId: 'S1' });
  assert.equal(acct.isAdministrator, false, 'an administrator bypasses every permission check');
  assert.equal(acct.userType, 'Manager');
  assert.equal(acct.storeId, 'S1');
  assert.equal(acct.userName, userEmail(u));
  assert.deepEqual(acct.roles, [{ id: roleId(u), name: roleId(u) }]);
});

// ── id derivation ────────────────────────────────────────────────────────────

test('blockId: sanitised type + 1-based two-digit index, never a GUID', () => {
  assert.equal(blockId('title', 0), 'title01');
  assert.equal(blockId('predefined-product-list', 4), 'predefinedproductlist05');
  assert.equal(blockId(undefined, 9), 'block10');
});

test('placementId: deterministic, slugified, unique per placement index', () => {
  assert.equal(placementId('PB_SC_CONSUMER_B', 0), 'agsc-pb-sc-consumer-b-ref01');
  assert.notEqual(placementId('PB_SC_CONSUMER_B', 0), placementId('PB_SC_CONSUMER_B', 1));
  assert.notEqual(placementId('PB_SC_CONSUMER_A', 0), placementId('PB_SC_CONSUMER_B', 0));
});

// ── the 3-key placement contract ─────────────────────────────────────────────

test('placementItem emits EXACTLY three keys and isLinkedPlacement accepts only that shape', () => {
  const item = placementItem('p1', 'cid');
  assert.deepEqual(Object.keys(item).sort(), ['componentRef', 'id', 'type']);
  assert.equal(item.type, 'componentRef');
  assert.ok(isLinkedPlacement(item));
  // an ordinary section that merely CARRIES a componentRef property is inert, not a placement
  assert.ok(!isLinkedPlacement({ id: 'p1', type: 'section', componentRef: 'cid' }));
  assert.ok(!isLinkedPlacement({ ...item, background: null }), 'a 4th key makes it not a placement');
  assert.ok(!isLinkedPlacement({ id: 'p1', type: 'componentRef' }));
  assert.ok(!isLinkedPlacement(null));
});

// ── content builders ─────────────────────────────────────────────────────────

test('buildContentDoc: assigns ids by position, defaults background, never mutates the source', () => {
  const src = { settings: { header: 'H' }, content: [{ type: 'title', title: 'A' }, { type: 'text', text: 'B', background: 'keep' }] };
  const out = buildContentDoc(src);
  assert.deepEqual(out.content.map((b) => b.id), ['title01', 'text02']);
  assert.equal(out.content[0].background, null);
  assert.equal(out.content[1].background, 'keep');
  assert.equal(src.content[0].id, undefined, 'source fixture must not be mutated');
  assert.notEqual(out.settings, src.settings);
});

test('buildPageContentBody: {ref} becomes a real placement; ordinary blocks keep positional ids', () => {
  const doc = {
    settings: {},
    content: [
      { type: 'text', text: 'top' },
      { ref: 'SC_MULTI' },
      { ref: 'SC_MULTI' },
      { type: 'text', text: 'bottom' },
    ],
  };
  const out = buildPageContentBody({ alias: 'PG' }, doc, { SC_MULTI: 'CID' });
  assert.equal(out.content.length, 4);
  assert.ok(isLinkedPlacement(out.content[1]));
  assert.ok(isLinkedPlacement(out.content[2]));
  assert.equal(out.content[1].componentRef, 'CID');
  // two placements of ONE component on one page must not collide (scenario #18)
  assert.notEqual(out.content[1].id, out.content[2].id);
  // ordinary blocks are id'd by their position in the WHOLE array, so they cannot collide either
  assert.deepEqual([out.content[0].id, out.content[3].id], ['text01', 'text04']);
  assert.equal(new Set(out.content.map((b) => b.id)).size, 4);
});

test('buildPageContentBody: an unresolved ref THROWS rather than emitting a dangling reference', () => {
  assert.throws(
    () => buildPageContentBody({ alias: 'PG' }, { content: [{ ref: 'NOPE' }] }, {}),
    /unresolved component ref "NOPE"/,
  );
});

test('pageRefs derives the referenced aliases in order, ignoring ordinary blocks', () => {
  assert.deepEqual(
    pageRefs({ content: [{ type: 'text', text: 'x' }, { ref: 'A' }, { type: 'title' }, { ref: 'B' }] }),
    ['A', 'B'],
  );
});

test('buildComponentCreateBody: content is a JSON OBJECT (an array is rejected 400 by the API)', () => {
  const body = buildComponentCreateBody({ name: 'N' }, { content: [{ type: 'text', text: 'x' }] }, { storeId: 'S' });
  assert.equal(body.storeId, 'S');
  assert.equal(body.name, 'N');
  assert.ok(!Array.isArray(body.content));
  assert.ok(Array.isArray(body.content.content));
});

test('createGroupedBody always carries pages:[] (omitting it is a 500 NRE, not a 400)', () => {
  const body = createGroupedBody({ name: 'N', permalink: '/p', culture: 'en-US' }, { storeId: 'S' });
  assert.deepEqual(body.pages, []);
  assert.equal(body.status, 'Draft');
  assert.equal(body.cultureName, 'en-US');
});

// ── usage derivation (synthetic fixture — independent of the committed one) ──

test('expectedUsage counts pages once per component but references individually', () => {
  const synthetic = {
    pages: {
      PB_SC_CONSUMER_A: { content: [{ ref: 'SC_MULTI' }, { ref: 'SC_MULTI' }] },
      PB_SC_CONSUMER_B: { content: [{ ref: 'SC_MULTI' }, { ref: 'SC_SINGLE' }] },
      PB_SC_CONTROL: { content: [{ type: 'text', text: 'none' }] },
    },
  };
  const { byPages, byRefs } = expectedUsage(synthetic);
  assert.equal(byPages.SC_MULTI, 2);
  assert.equal(byRefs.SC_MULTI, 3);
  assert.equal(byPages.SC_SINGLE, 1);
  assert.equal(byPages.SC_UNUSED, 0);
});

// ── the guard's own logic (not the committed data it guards) ─────────────────

test('validateFixtureShape rejects a capitalised block type — the blank-render trap', () => {
  const doc = { components: {}, pages: { PB_SC_MASTER: { content: [{ type: 'Text', text: 'x' }] } } };
  const problems = validateFixtureShape(doc);
  assert.ok(problems.some((p) => /not a RENDERING type/.test(p)), problems.join('\n'));
});

test('validateFixtureShape rejects a collapsed divergence (two identical section texts)', () => {
  const same = 'AGENT-TEST identical';
  const doc = {
    components: {},
    pages: { PB_SC_CONSUMER_A: { content: [{ type: 'text', text: same }, { type: 'text', text: same }] } },
  };
  assert.ok(validateFixtureShape(doc).some((p) => /must be DISTINCT/.test(p)));
});

test('validateFixtureShape rejects a control page that references a shared component', () => {
  const doc = { components: {}, pages: { PB_SC_CONTROL: { content: [{ ref: 'SC_MULTI' }] } } };
  assert.ok(validateFixtureShape(doc).some((p) => /A\/B control/.test(p)));
});
