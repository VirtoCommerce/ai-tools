// `kb sync` — getting the base onto a machine, and the one property the fourth resolution step was
// accepted on: a fetch that fails must leave NOTHING that `looksLikeBase` will believe.
//
// Every test here builds its own git repository on disk and clones from it. Nothing touches the
// network, and nothing touches the real base or the real `~/.claude`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { sync, baseAge, isCheckout, ageNotice, SyncRefused, renderSync, repairIndexes } from '../src/sync.mjs';
import { managedBaseDir, looksLikeBase, BASE_MARKER } from '../src/base.mjs';

const scratch = () => mkdtempSync(join(tmpdir(), 'kb-sync-'));
const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r;
};

/** A git repository that IS a base — the shape `kb sync` expects to find at the far end. */
function originRepo({ asBase = true, extra = {} } = {}) {
  const dir = scratch();
  git(['init', '--quiet', '--initial-branch=main'], dir);
  git(['config', 'user.email', 't@t'], dir);
  git(['config', 'user.name', 'T'], dir);
  if (asBase) writeFileSync(join(dir, BASE_MARKER), '{"name":"test","namespace":"KB"}\n');
  writeFileSync(join(dir, 'README.md'), 'corpus\n');
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, name), body);
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'one'], dir);
  return dir;
}

test('the managed checkout is one path per machine, under ~/.claude, and not beside the plugin', () => {
  assert.equal(managedBaseDir({ env: {}, home: '/h' }), join('/h', '.claude', 'vc-knowledge'));
  // Version-independent by construction: nothing in it can name a plugin version, so a plugin
  // upgrade cannot orphan the corpus.
  assert.ok(!managedBaseDir({ env: {}, home: '/h' }).includes('plugins'));
  assert.equal(managedBaseDir({ env: { KB_HOME: '/elsewhere' }, home: '/h' }), resolve('/elsewhere'));
});

test('a clone lands a base, and the door can then find it', () => {
  const origin = originRepo();
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');

  const r = sync({ dir: dest, repo: origin });
  assert.equal(r.action, 'cloned');
  assert.equal(looksLikeBase(dest), true);
  assert.equal(isCheckout(dest), true);
  assert.match(renderSync(r), /cloned/);

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

// THE CONDITION THE FOURTH RESOLUTION STEP WAS ACCEPTED ON. `looksLikeBase` asks one question — is
// there a kb.json — so a clone interrupted after that file lands but before the entries do would
// answer yes, and the corpus would be real but incomplete. `ask` would then report coverage misses
// for entries that exist, and a miss is the signal meaning "go find out and write it down": the base
// would commission work it already holds the answers to. Staging is what makes that unreachable.
test('a clone that fails installs NOTHING a later read could mistake for a base', () => {
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');

  assert.throws(
    () => sync({ dir: dest, repo: join(home, 'no-such-repo') }),
    (e) => e instanceof SyncRefused && /could not clone/.test(e.message),
  );

  assert.equal(existsSync(dest), false, 'no half-finished directory is left in place');
  assert.equal(looksLikeBase(dest), false);
  const parent = join(home, '.claude');
  const leftovers = existsSync(parent) ? readdirSync(parent) : [];
  assert.deepEqual(leftovers, [], 'and no staging directory is left behind either');

  rmSync(home, { recursive: true, force: true });
});

test('a repository that is not a base is refused, and still installs nothing', () => {
  const origin = originRepo({ asBase: false });
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');

  assert.throws(
    () => sync({ dir: dest, repo: origin }),
    (e) => e instanceof SyncRefused && new RegExp(`carries no ${BASE_MARKER}`).test(e.message),
  );
  assert.equal(existsSync(dest), false, 'checked in staging, so nothing reached the destination');

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('a second sync fast-forwards in place and reports whether anything moved', () => {
  const origin = originRepo();
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');

  sync({ dir: dest, repo: origin });
  assert.equal(sync({ dir: dest, repo: origin }).action, 'current', 'nothing new upstream');

  writeFileSync(join(origin, 'second.md'), 'more\n');
  git(['add', '-A'], origin);
  git(['commit', '--quiet', '-m', 'two'], origin);

  const r = sync({ dir: dest, repo: origin });
  assert.equal(r.action, 'updated');
  assert.notEqual(r.before, r.after);
  assert.equal(existsSync(join(dest, 'second.md')), true);

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

// A corpus is written INTO during a run — `kb capture` puts entries straight into the checkout — so
// a sync that resolved a conflict by re-cloning would destroy exactly what this tool exists to
// accumulate. It refuses and says so instead.
test('a checkout that cannot fast-forward is left ALONE, not replaced', () => {
  const origin = originRepo();
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');
  sync({ dir: dest, repo: origin });

  // Diverge: a local commit here, a different one upstream.
  writeFileSync(join(dest, 'mine.md'), 'an entry captured during a run\n');
  git(['config', 'user.email', 't@t'], dest);
  git(['config', 'user.name', 'T'], dest);
  git(['add', '-A'], dest);
  git(['commit', '--quiet', '-m', 'local work'], dest);
  writeFileSync(join(origin, 'theirs.md'), 'x\n');
  git(['add', '-A'], origin);
  git(['commit', '--quiet', '-m', 'upstream work'], origin);

  assert.throws(
    () => sync({ dir: dest, repo: origin }),
    (e) => e instanceof SyncRefused && /diverged|fast-forward/.test(e.message),
  );
  assert.equal(existsSync(join(dest, 'mine.md')), true, 'the local corpus survives the refusal');

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('a directory that is not a checkout is never overwritten', () => {
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'something-someone-put-here.md'), 'x\n');

  assert.throws(
    () => sync({ dir: dest, repo: originRepo() }),
    (e) => e instanceof SyncRefused && /not a git checkout/.test(e.message),
  );
  assert.equal(existsSync(join(dest, 'something-someone-put-here.md')), true);

  rmSync(home, { recursive: true, force: true });
});

// A month-old base answers plausibly, and a plausible stale answer is worse than no answer because
// nothing about the reply looks wrong. So the age is reported, always.
test('the age of the content is reported, and flagged once it is old', () => {
  const origin = originRepo();
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');
  sync({ dir: dest, repo: origin });

  const age = baseAge(dest);
  assert.ok(age, 'a checkout can say how old its newest commit is');
  assert.equal(age.days, 0, 'just committed');

  const fresh = ageNotice(dest);
  assert.equal(fresh.stale, false);
  assert.match(fresh.line, /content 0d old/);
  assert.ok(!fresh.line.includes('kb sync'), 'a fresh base is not nagged about');

  // The threshold is a parameter so the flag can be tested without waiting a month.
  const old = ageNotice(dest, { staleDays: 0 });
  assert.equal(old.stale, true);
  assert.match(old.line, /kb sync/, 'a stale one names the remedy');

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('age is silent about a directory that is not a checkout, rather than guessing', () => {
  const dir = scratch();
  writeFileSync(join(dir, BASE_MARKER), '{}');
  assert.equal(isCheckout(dir), false);
  assert.equal(baseAge(dir), null);
  assert.equal(ageNotice(dir), null, 'a hand-assembled base has no age to report, and none is invented');
  rmSync(dir, { recursive: true, force: true });
});

test('the real managed path is under the real home, and no test ever wrote to it', () => {
  assert.equal(managedBaseDir({ env: {} }), join(homedir(), '.claude', 'vc-knowledge'));
});

// A FETCH THAT LEAVES `kb ask` DEGRADED IS NOT A FETCH. The base ignores the written stores'
// retrieval indexes — `kb reindex` rebuilds them — so a store whose index was never committed
// arrives with none, and `openBase` answers a missing index with `degraded`. Measured 2026-09-17 on
// a clone taken the documented way: `rules-index.json` was absent and EVERY `kb ask` on that
// machine returned "MISS (degraded)", including questions the corpus answers well.
test('a clone whose index was never committed gets one built, and nothing else is touched', () => {
  const rule = [
    '---',
    'id: KB-00000001',
    'subject: BL-CART-001 A title',
    'plane: normative',
    'status: active',
    'refutableBy: observation',
    'evidence:',
    '---',
    '',
    'BL-CART-001: A title `[P1-data]`',
    '- **Rule:** Something.',
    '',
  ].join('\n');
  // `* -text` exactly as the real base carries it: the corpus is byte-gated, so git must convert
  // nothing. Without it a Windows checkout with core.autocrlf=true hands back CRLF entries and the
  // frontmatter parser rejects every one — which is worth knowing, and is the base's rule, not this
  // test's convenience.
  const origin = originRepo({ extra: {
    '.gitattributes': '* -text\n',
    // The base ignores the written indexes on the ground that `kb reindex` rebuilds them. That
    // is the rule this whole repair exists because of, so the fixture carries it.
    '.gitignore': 'rules-index.json\n',
  } });
  mkdirSync(join(origin, 'rules'));
  writeFileSync(join(origin, 'rules', 'KB-00000001.md'), rule);
  writeFileSync(join(origin, 'rules-catalog.md'), 'a catalog somebody tracks\n');
  git(['add', '-A'], origin);
  git(['commit', '--quiet', '-m', 'rules, but no index'], origin);

  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');
  const r = sync({ dir: dest, repo: origin });

  assert.deepEqual(r.indexed, ['rules-index.json']);
  assert.equal(existsSync(join(dest, 'rules-index.json')), true);
  assert.match(renderSync(r), /built the retrieval index git does not carry: rules-index\.json/);

  // The CATALOG is tracked, and its byte comparison is what catches an entry edited by hand. A
  // fetch that rewrote it would destroy that signal — and would leave the checkout dirty, so the
  // next `kb sync` could not fast-forward.
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: dest, encoding: 'utf8' }).stdout.trim(), '');

  // AN IGNORED INDEX IS OURS, PRESENT OR NOT. It never arrives with a pull, so after a fetch that
  // changed the entries it is stale — and a stale index is not a notice, it is a `kb validate`
  // PROBLEM. Measured the first time a real pull carried a corrected rule.
  writeFileSync(join(dest, 'rules-index.json'), 'stale but present');
  assert.deepEqual(repairIndexes(dest), ['rules-index.json']);
  assert.notEqual(readFileSync(join(dest, 'rules-index.json'), 'utf8'), 'stale but present');

  // A TRACKED one is git's to deliver and is left alone — rewriting it would dirty the tree and the
  // next fast-forward could not run, which is the whole reason this touches only what git ignores.
  writeFileSync(join(dest, 'captured-index.json'), 'tracked and stale');
  git(['add', 'captured-index.json'], dest);
  assert.ok(!repairIndexes(dest).includes('captured-index.json'));
  assert.equal(readFileSync(join(dest, 'captured-index.json'), 'utf8'), 'tracked and stale');

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

// ONE `kb ask` USED TO BREAK THE NEXT `kb sync`, for everybody. `demand.jsonl` is tracked on
// purpose (an unanswered question belongs to the corpus, not to the asker) and appended to on every
// ask, so the checkout is dirty; the first fast-forward that carries somebody else's asks then
// refuses with "your local changes would be overwritten". Reproduced in a sandbox before this was
// written. Git cannot merge the file because git does not know the format; an append-only log of
// independent rows has exactly one correct merge, and the tool does know that.
function ledgerRepo() {
  const dir = originRepo({ extra: { '.gitattributes': '* -text\n', 'demand.jsonl': '{"kind":"ask","key":"a"}\n' } });
  return dir;
}

test('a locally appended demand ledger no longer blocks the fetch, and is kept', () => {
  const origin = ledgerRepo();
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');
  sync({ dir: dest, repo: origin });

  // Both sides write a row: this machine asks a question, somebody else's asks land upstream.
  writeFileSync(join(dest, 'demand.jsonl'), '{"kind":"ask","key":"a"}\n{"kind":"ask","key":"mine"}\n');
  writeFileSync(join(origin, 'demand.jsonl'), '{"kind":"ask","key":"a"}\n{"kind":"ask","key":"theirs"}\n');
  git(['commit', '--quiet', '-am', 'their ask'], origin);

  const r = sync({ dir: dest, repo: origin });
  assert.equal(r.action, 'updated');
  assert.equal(r.replayed, 1);
  assert.match(renderSync(r), /kept 1 unpushed demand row/);

  const ledger = readFileSync(join(dest, 'demand.jsonl'), 'utf8');
  assert.match(ledger, /"theirs"/, 'what came down is there');
  assert.match(ledger, /"mine"/, 'and what was here was not thrown away');
  assert.ok(ledger.indexOf('"theirs"') < ledger.indexOf('"mine"'), 'the local rows go on top, in order');
  assert.equal(existsSync(join(dest, 'demand.jsonl.parked')), false, 'the parking file is cleaned up');

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

// The park RESTORES a tracked file, so between that and the replay the rows exist only in this
// process. The first sandbox run of this code died in that window and took a row with it.
test('rows parked by a run that died are replayed by the next fetch', () => {
  const origin = ledgerRepo();
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');
  sync({ dir: dest, repo: origin });

  // Exactly what a crash between park and replay leaves behind.
  writeFileSync(join(dest, 'demand.jsonl.parked'), '{"kind":"ask","key":"orphan"}\n');
  const r = sync({ dir: dest, repo: origin });
  assert.equal(r.replayed, 1);
  assert.match(readFileSync(join(dest, 'demand.jsonl'), 'utf8'), /"orphan"/);
  assert.equal(existsSync(join(dest, 'demand.jsonl.parked')), false);

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

// A ledger that is NOT the committed file plus new lines was edited or truncated by somebody, and
// this refuses to be clever about that: the fetch fails with git's own words, nothing is discarded.
test('an edited ledger is not parked — the refusal stands, and the file is untouched', () => {
  const origin = ledgerRepo();
  const home = scratch();
  const dest = join(home, '.claude', 'vc-knowledge');
  sync({ dir: dest, repo: origin });

  writeFileSync(join(dest, 'demand.jsonl'), '{"kind":"ask","key":"REWRITTEN"}\n');
  writeFileSync(join(origin, 'demand.jsonl'), '{"kind":"ask","key":"a"}\n{"kind":"ask","key":"theirs"}\n');
  git(['commit', '--quiet', '-am', 'their ask'], origin);

  assert.throws(() => sync({ dir: dest, repo: origin }), SyncRefused);
  assert.equal(readFileSync(join(dest, 'demand.jsonl'), 'utf8'), '{"kind":"ask","key":"REWRITTEN"}\n');

  rmSync(origin, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});
