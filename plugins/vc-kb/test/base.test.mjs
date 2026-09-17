import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveBase, baseProvenance, baseNotFoundMessage, looksLikeBase, BASE_MARKER, PROFILE_NAME,
} from '../src/base.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'kb-base-'));
const asBase = (dir) => {
  writeFileSync(join(dir, BASE_MARKER), '{"name":"test","namespace":"KB"}\n');
  return dir;
};

// A PROJECT, in the shape /project-init leaves behind: a profile naming the base it cloned, and
// the clone sitting inside the project folder.
function project({ declared, withBase = true } = {}) {
  const root = scratch();
  if (withBase) {
    mkdirSync(join(root, '.vc-knowledge'), { recursive: true });
    asBase(join(root, '.vc-knowledge'));
  }
  writeFileSync(
    join(root, PROFILE_NAME),
    JSON.stringify({ projectType: 'platform', knowledgeBase: { path: declared ?? '.vc-knowledge' } }),
  );
  return root;
}

// Every call passes `cwd` and `env` explicitly. A test that let either default would read whatever
// the machine running it happens to have, which is the whole class of defect this file is about.
const nowhere = { env: {}, cwd: scratch() };

test('--base is taken as given, unchecked, because a base under construction is not yet a base', () => {
  const dir = scratch(); // deliberately NOT a base: no kb.json
  assert.equal(looksLikeBase(dir), false);
  assert.equal(resolveBase({ explicit: dir, ...nowhere }), dir);
  rmSync(dir, { recursive: true, force: true });
});

test('KB_BASE is used when it carries the manifest', () => {
  const dir = asBase(scratch());
  assert.equal(resolveBase({ env: { KB_BASE: dir }, cwd: nowhere.cwd }), dir);
  rmSync(dir, { recursive: true, force: true });
});

test('a stale KB_BASE does NOT resolve — an empty directory must not read as an empty base', () => {
  const dir = scratch();
  assert.equal(resolveBase({ env: { KB_BASE: dir }, cwd: nowhere.cwd }), null);
  rmSync(dir, { recursive: true, force: true });
});

test('the profile is the third candidate: knowledgeBase.path, relative to the profile itself', () => {
  const root = project();
  assert.equal(resolveBase({ env: {}, cwd: root }), join(root, '.vc-knowledge'));
  rmSync(root, { recursive: true, force: true });
});

test('an absolute knowledgeBase.path is honoured as written', () => {
  const elsewhere = asBase(scratch());
  const root = project({ declared: elsewhere, withBase: false });
  assert.equal(resolveBase({ env: {}, cwd: root }), elsewhere);
  rmSync(root, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
});

test('PROJECT_PROFILE_PATH names the profile, the same override every other reader here honours', () => {
  const root = project();
  const away = scratch();
  assert.equal(
    resolveBase({ env: { PROJECT_PROFILE_PATH: join(root, PROFILE_NAME) }, cwd: away }),
    join(root, '.vc-knowledge'),
    'the profile is read from where it was named, not from the working directory',
  );
  assert.equal(resolveBase({ env: {}, cwd: away }), null, 'and the working directory has none');
  rmSync(root, { recursive: true, force: true });
  rmSync(away, { recursive: true, force: true });
});

test('a profile declaring a directory that is not a base does not resolve', () => {
  const root = project({ withBase: false });
  assert.equal(resolveBase({ env: {}, cwd: root }), null);
  const msg = baseNotFoundMessage({ env: {}, cwd: root });
  assert.match(msg, new RegExp(`no ${BASE_MARKER}`));
  assert.match(msg, /knowledgeBase\.path/);
  rmSync(root, { recursive: true, force: true });
});

test('a profile with no knowledgeBase at all is simply not a candidate', () => {
  const root = scratch();
  writeFileSync(join(root, PROFILE_NAME), JSON.stringify({ projectType: 'platform' }));
  assert.equal(resolveBase({ env: {}, cwd: root }), null);
  assert.match(baseNotFoundMessage({ env: {}, cwd: root }), /nowhere/);
  rmSync(root, { recursive: true, force: true });
});

test('a profile that will not parse is not a candidate, and does not throw', () => {
  const root = scratch();
  writeFileSync(join(root, PROFILE_NAME), '{ this is not json');
  assert.equal(resolveBase({ env: {}, cwd: root }), null);
  rmSync(root, { recursive: true, force: true });
});

// The bug this pins: a probe pointed at a bogus KB_BASE answered, confidently, out of the real
// corpus — because resolution walked past the directory the operator had named.
test('a named candidate that is not a base STOPS the search; it does not fall through to the profile', () => {
  const root = project();
  const bogus = scratch();

  assert.equal(resolveBase({ env: {}, cwd: root }), join(root, '.vc-knowledge'), 'found when nobody named anything');
  assert.equal(resolveBase({ env: { KB_BASE: bogus }, cwd: root }), null, 'and NOT used once somebody has');

  const msg = baseNotFoundMessage({ env: { KB_BASE: bogus }, cwd: root });
  assert.match(msg, /STOPPED there/);
  assert.ok(
    !msg.includes(join(root, '.vc-knowledge')),
    'the message does not advertise a corpus the operator did not ask for',
  );

  rmSync(root, { recursive: true, force: true });
  rmSync(bogus, { recursive: true, force: true });
});

test('--base wins over KB_BASE, and KB_BASE over the profile', () => {
  const root = project();
  const env = asBase(scratch());
  const explicit = scratch();

  assert.equal(resolveBase({ env: {}, cwd: root }), join(root, '.vc-knowledge'));
  assert.equal(resolveBase({ env: { KB_BASE: env }, cwd: root }), env);
  assert.equal(resolveBase({ explicit, env: { KB_BASE: env }, cwd: root }), explicit);

  rmSync(root, { recursive: true, force: true });
  rmSync(env, { recursive: true, force: true });
  rmSync(explicit, { recursive: true, force: true });
});

// TWO BASES ON ONE MACHINE is the failure to design against — a workbench checkout and the
// project's own — and reading one while writing the other leaves no trace at all. So the tool can
// always say not just WHICH directory but HOW it got there.
test('the base says how it was chosen, not only where it is', () => {
  const root = project();
  const env = asBase(scratch());

  assert.deepEqual(baseProvenance({ env: {}, cwd: root }), {
    dir: join(root, '.vc-knowledge'),
    source: `knowledgeBase.path in ${join(root, PROFILE_NAME)}`,
  });
  assert.deepEqual(baseProvenance({ env: { KB_BASE: env }, cwd: root }), { dir: env, source: 'KB_BASE' });
  assert.equal(baseProvenance(nowhere), null);

  rmSync(root, { recursive: true, force: true });
  rmSync(env, { recursive: true, force: true });
});

test('nothing resolves to null rather than to a plausible default', () => {
  assert.equal(resolveBase(nowhere), null);
});

// THE BASE IS NEVER SEARCHED FOR. Two earlier versions guessed: one counted three directories up
// because that is how deep `plugins/vc-kb` sits, the other climbed looking for a `vc-knowledge`
// beside any ancestor. Both answered out of a corpus nobody had named. Under decision B
// /project-init clones the base to a known place and records it, so a directory named
// `vc-knowledge` sitting next to the tool is worth exactly nothing.
test('a vc-knowledge beside the tool is NOT found — the base is declared, never discovered', () => {
  const root = scratch();
  const tool = join(root, 'repo', 'plugins', 'vc-kb');
  mkdirSync(tool, { recursive: true });
  mkdirSync(join(root, 'vc-knowledge'), { recursive: true });
  asBase(join(root, 'vc-knowledge'));

  assert.equal(resolveBase({ env: {}, cwd: tool }), null, 'not from the tool directory');
  assert.equal(resolveBase({ env: {}, cwd: join(root, 'repo') }), null, 'nor from the repository root');

  rmSync(root, { recursive: true, force: true });
});

// The failure a default path would hide: an outage reported as a gap in knowledge.
test('the not-found message separates "no base" from "nothing known", and names every place looked', () => {
  const stale = scratch();
  const msg = baseNotFoundMessage({ env: { KB_BASE: stale }, cwd: nowhere.cwd });
  assert.match(msg, /NOT the same as a base holding nothing/);
  assert.ok(msg.includes(stale), 'names the directory it rejected');
  assert.match(msg, /KB_BASE/);
  assert.match(msg, new RegExp(`no ${BASE_MARKER}`), 'says WHY that candidate was rejected');
  assert.match(msg, /git clone/, 'says how to get one');
  assert.match(msg, /project-init/, 'and names the thing that would have set this up');
  rmSync(stale, { recursive: true, force: true });
});

test('the message is still useful when there was nowhere to look', () => {
  assert.match(baseNotFoundMessage(nowhere), /nowhere/);
});
