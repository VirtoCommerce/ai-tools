import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveBase, baseNotFoundMessage, looksLikeBase, BASE_MARKER } from '../src/base.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'kb-base-'));
const asBase = (dir) => {
  writeFileSync(join(dir, BASE_MARKER), '{"name":"test","namespace":"KB"}\n');
  return dir;
};

test('--base is taken as given, unchecked, because a base under construction is not yet a base', () => {
  const dir = scratch(); // deliberately NOT a base: no kb.json
  assert.equal(looksLikeBase(dir), false);
  assert.equal(resolveBase({ explicit: dir, env: {}, here: null }), dir);
  rmSync(dir, { recursive: true, force: true });
});

test('KB_BASE is used when it carries the manifest', () => {
  const dir = asBase(scratch());
  assert.equal(resolveBase({ env: { KB_BASE: dir }, here: null }), dir);
  rmSync(dir, { recursive: true, force: true });
});

test('a stale KB_BASE does NOT resolve — an empty directory must not read as an empty base', () => {
  const dir = scratch();
  assert.equal(resolveBase({ env: { KB_BASE: dir }, here: null }), null);
  rmSync(dir, { recursive: true, force: true });
});

// The bug this pins: a probe pointed at a bogus KB_BASE answered, confidently, out of the real
// corpus — because resolution walked past the directory the operator had named.
test('a named candidate that is not a base STOPS the search; it does not fall through to the sibling', () => {
  const root = scratch();
  const tool = join(root, 'repo', 'plugins', 'vc-kb');
  mkdirSync(tool, { recursive: true });
  const sibling = join(root, 'vc-knowledge');
  mkdirSync(sibling, { recursive: true });
  asBase(sibling);
  const bogus = scratch();

  assert.equal(resolveBase({ env: {}, here: tool }), sibling, 'the sibling is found when nobody named anything');
  assert.equal(resolveBase({ env: { KB_BASE: bogus }, here: tool }), null, 'and is NOT used once somebody has');

  const msg = baseNotFoundMessage({ env: { KB_BASE: bogus }, here: tool });
  assert.match(msg, /STOPPED there/);
  assert.ok(!msg.includes(sibling), 'the message does not advertise a corpus the operator did not ask for');

  rmSync(root, { recursive: true, force: true });
  rmSync(bogus, { recursive: true, force: true });
});

test('a sibling checkout is found from the tool root, not from the working directory', () => {
  const root = scratch();
  const tool = join(root, 'repo', 'plugins', 'vc-kb');
  mkdirSync(tool, { recursive: true });
  const sibling = join(root, 'vc-knowledge');
  mkdirSync(sibling, { recursive: true });
  asBase(sibling);
  assert.equal(resolveBase({ env: {}, here: tool }), sibling);
  rmSync(root, { recursive: true, force: true });
});

test('--base wins over KB_BASE, and KB_BASE over the sibling', () => {
  const root = scratch();
  const tool = join(root, 'repo', 'plugins', 'vc-kb');
  mkdirSync(tool, { recursive: true });
  const sibling = join(root, 'vc-knowledge');
  mkdirSync(sibling, { recursive: true });
  asBase(sibling);
  const env = asBase(scratch());
  const explicit = scratch();

  assert.equal(resolveBase({ env: {}, here: tool }), sibling);
  assert.equal(resolveBase({ env: { KB_BASE: env }, here: tool }), env);
  assert.equal(resolveBase({ explicit, env: { KB_BASE: env }, here: tool }), explicit);

  rmSync(root, { recursive: true, force: true });
  rmSync(env, { recursive: true, force: true });
  rmSync(explicit, { recursive: true, force: true });
});

test('nothing resolves to null rather than to a plausible default', () => {
  assert.equal(resolveBase({ env: {}, here: null }), null);
});

// The failure a default path would hide: an outage reported as a gap in knowledge.
test('the not-found message separates "no base" from "nothing known", and names every place looked', () => {
  const stale = scratch();
  const msg = baseNotFoundMessage({ env: { KB_BASE: stale }, here: null });
  assert.match(msg, /NOT the same as a base holding nothing/);
  assert.ok(msg.includes(stale), 'names the directory it rejected');
  assert.match(msg, /KB_BASE/);
  assert.match(msg, new RegExp(`no ${BASE_MARKER}`), 'says WHY that candidate was rejected');
  assert.match(msg, /git clone/, 'says how to get one');
  rmSync(stale, { recursive: true, force: true });
});

test('the message is still useful when there was nowhere to look', () => {
  const msg = baseNotFoundMessage({ env: {}, here: null });
  assert.match(msg, /nowhere/);
});
