import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveBase, baseProvenance, baseNotFoundMessage, looksLikeBase, managedBaseDir,
  BASE_MARKER, PROFILE_NAME,
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

// Every call passes `cwd`, `env` AND `home` explicitly. A test that let any of them default would
// read whatever the machine running it happens to have — including a real managed checkout at
// ~/.claude/vc-knowledge — which is the whole class of defect this file is about.
const NO_HOME = scratch();
const nowhere = { env: {}, cwd: scratch(), home: NO_HOME };

test('--base is taken as given, unchecked, because a base under construction is not yet a base', () => {
  const dir = scratch(); // deliberately NOT a base: no kb.json
  assert.equal(looksLikeBase(dir), false);
  assert.equal(resolveBase({ explicit: dir, ...nowhere }), dir);
  rmSync(dir, { recursive: true, force: true });
});

test('KB_BASE is used when it carries the manifest', () => {
  const dir = asBase(scratch());
  assert.equal(resolveBase({ env: { KB_BASE: dir }, cwd: nowhere.cwd, home: NO_HOME }), dir);
  rmSync(dir, { recursive: true, force: true });
});

test('a stale KB_BASE does NOT resolve — an empty directory must not read as an empty base', () => {
  const dir = scratch();
  assert.equal(resolveBase({ env: { KB_BASE: dir }, cwd: nowhere.cwd, home: NO_HOME }), null);
  rmSync(dir, { recursive: true, force: true });
});

test('the profile is the third candidate: knowledgeBase.path, relative to the profile itself', () => {
  const root = project();
  assert.equal(resolveBase({ env: {}, cwd: root, home: NO_HOME }), join(root, '.vc-knowledge'));
  rmSync(root, { recursive: true, force: true });
});

test('an absolute knowledgeBase.path is honoured as written', () => {
  const elsewhere = asBase(scratch());
  const root = project({ declared: elsewhere, withBase: false });
  assert.equal(resolveBase({ env: {}, cwd: root, home: NO_HOME }), elsewhere);
  rmSync(root, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
});

test('PROJECT_PROFILE_PATH names the profile, the same override every other reader here honours', () => {
  const root = project();
  const away = scratch();
  assert.equal(
    resolveBase({ env: { PROJECT_PROFILE_PATH: join(root, PROFILE_NAME) }, cwd: away, home: NO_HOME }),
    join(root, '.vc-knowledge'),
    'the profile is read from where it was named, not from the working directory',
  );
  assert.equal(resolveBase({ env: {}, cwd: away, home: NO_HOME }), null, 'and the working directory has none');
  rmSync(root, { recursive: true, force: true });
  rmSync(away, { recursive: true, force: true });
});

test('a profile declaring a directory that is not a base does not resolve', () => {
  const root = project({ withBase: false });
  assert.equal(resolveBase({ env: {}, cwd: root, home: NO_HOME }), null);
  const msg = baseNotFoundMessage({ env: {}, cwd: root, home: NO_HOME });
  assert.match(msg, new RegExp(`no ${BASE_MARKER}`));
  assert.match(msg, /knowledgeBase\.path/);
  rmSync(root, { recursive: true, force: true });
});

test('a profile with no knowledgeBase at all is simply not a candidate', () => {
  const root = scratch();
  writeFileSync(join(root, PROFILE_NAME), JSON.stringify({ projectType: 'platform' }));
  assert.equal(resolveBase({ env: {}, cwd: root, home: NO_HOME }), null);
  rmSync(root, { recursive: true, force: true });
});

test('a profile that will not parse is not a candidate, and does not throw', () => {
  const root = scratch();
  writeFileSync(join(root, PROFILE_NAME), '{ this is not json');
  assert.equal(resolveBase({ env: {}, cwd: root, home: NO_HOME }), null);
  rmSync(root, { recursive: true, force: true });
});

// The bug this pins: a probe pointed at a bogus KB_BASE answered, confidently, out of the real
// corpus — because resolution walked past the directory the operator had named.
test('a named candidate that is not a base STOPS the search; it does not fall through to the profile', () => {
  const root = project();
  const bogus = scratch();

  assert.equal(resolveBase({ env: {}, cwd: root, home: NO_HOME }), join(root, '.vc-knowledge'), 'found when nobody named anything');
  assert.equal(resolveBase({ env: { KB_BASE: bogus }, cwd: root, home: NO_HOME }), null, 'and NOT used once somebody has');

  const msg = baseNotFoundMessage({ env: { KB_BASE: bogus }, cwd: root, home: NO_HOME });
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

  assert.equal(resolveBase({ env: {}, cwd: root, home: NO_HOME }), join(root, '.vc-knowledge'));
  assert.equal(resolveBase({ env: { KB_BASE: env }, cwd: root, home: NO_HOME }), env);
  assert.equal(resolveBase({ explicit, env: { KB_BASE: env }, cwd: root, home: NO_HOME }), explicit);

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

  assert.deepEqual(baseProvenance({ env: {}, cwd: root, home: NO_HOME }), {
    dir: join(root, '.vc-knowledge'),
    source: `knowledgeBase.path in ${join(root, PROFILE_NAME)}`,
  });
  assert.deepEqual(baseProvenance({ env: { KB_BASE: env }, cwd: root, home: NO_HOME }), { dir: env, source: 'KB_BASE' });
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

  assert.equal(resolveBase({ env: {}, cwd: tool, home: NO_HOME }), null, 'not from the tool directory');
  assert.equal(resolveBase({ env: {}, cwd: join(root, 'repo'), home: NO_HOME }), null, 'nor from the repository root');

  rmSync(root, { recursive: true, force: true });
});

// The failure a default path would hide: an outage reported as a gap in knowledge.
test('the not-found message separates "no base" from "nothing known", and names every place looked', () => {
  const stale = scratch();
  const msg = baseNotFoundMessage({ env: { KB_BASE: stale }, cwd: nowhere.cwd, home: NO_HOME });
  assert.match(msg, /NOT the same as a base holding nothing/);
  assert.ok(msg.includes(stale), 'names the directory it rejected');
  assert.match(msg, /KB_BASE/);
  assert.match(msg, new RegExp(`no ${BASE_MARKER}`), 'says WHY that candidate was rejected');
  rmSync(stale, { recursive: true, force: true });
});

// THERE IS NO "NOWHERE" ANY MORE, and that is what the fourth step bought. Before it, a machine that
// had simply never fetched the base got a message listing three ways to point at a directory it did
// not have — which reads as "you have misconfigured this" when the truth is "you have not got it
// yet". The ordinary cause now has an ordinary answer.
test('with nothing named, the message names the managed checkout and offers to fetch it', () => {
  const msg = baseNotFoundMessage(nowhere);
  assert.ok(msg.includes(managedBaseDir({ env: {}, home: NO_HOME })), 'says where it would go');
  assert.match(msg, /managed checkout/, 'and how that candidate was arrived at');
  assert.match(msg, /kb sync/, 'and the one command that fixes the ordinary cause');
  assert.match(msg, /NOT the same as a base holding nothing/, 'while still keeping the three states apart');
});

// The overrides stay available, but BELOW the remedy — a message whose first offer is a list of
// escape hatches teaches the reader that the normal path does not work.
test('the overrides are still offered, after the remedy rather than instead of it', () => {
  const msg = baseNotFoundMessage(nowhere);
  assert.match(msg, /KB_BASE/);
  assert.match(msg, /knowledgeBase\.path/);
  assert.ok(msg.indexOf('kb sync') < msg.indexOf('KB_BASE'), 'the fix comes before the workarounds');
});

// An operator who NAMED a directory is told about THAT and nothing else: offering to fetch a corpus
// into a different place would be answering a question they did not ask.
test('a named-but-wrong candidate suppresses the fetch offer', () => {
  const bogus = scratch();
  const msg = baseNotFoundMessage({ env: { KB_BASE: bogus }, cwd: nowhere.cwd, home: NO_HOME });
  assert.match(msg, /STOPPED there/);
  assert.ok(!msg.includes('kb sync'), 'their directory is the subject, not ours');
  rmSync(bogus, { recursive: true, force: true });
});

// The last resort, and the property that makes the fourth step safe: it is CHECKED like any other.
test('the managed checkout is used when it is a base, and ignored when it is not', () => {
  const home = scratch();
  const managed = join(home, '.claude', 'vc-knowledge');
  assert.equal(resolveBase({ env: {}, cwd: nowhere.cwd, home }), null, 'absent: not a base');

  mkdirSync(managed, { recursive: true });
  assert.equal(resolveBase({ env: {}, cwd: nowhere.cwd, home }), null, 'present but empty: still not a base');

  asBase(managed);
  assert.equal(resolveBase({ env: {}, cwd: nowhere.cwd, home }), managed, 'a real base: used');
  assert.deepEqual(
    baseProvenance({ env: {}, cwd: nowhere.cwd, home }),
    { dir: managed, source: 'managed checkout' },
  );

  rmSync(home, { recursive: true, force: true });
});

// It is LAST, so anything a person said still wins — including the profile.
test('the profile still outranks the managed checkout', () => {
  const home = scratch();
  const managed = join(home, '.claude', 'vc-knowledge');
  mkdirSync(managed, { recursive: true });
  asBase(managed);
  const root = project();

  assert.equal(resolveBase({ env: {}, cwd: root, home }), join(root, '.vc-knowledge'));

  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});
