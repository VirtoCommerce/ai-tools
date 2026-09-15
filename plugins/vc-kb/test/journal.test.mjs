import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildIndex } from '../src/index-build.mjs';
import { capture } from '../src/capture.mjs';
import { backedByOf, questionHash, resolveSession, journalDir, record } from '../src/journal.mjs';
import { DERIVED_ENTRIES, OWNED_ROOTS } from '../src/planes.mjs';

const KB = fileURLToPath(new URL('../bin/kb.mjs', import.meta.url));
const TOOL_LOG = fileURLToPath(new URL('../vendor/agent-log/tool-log.mjs', import.meta.url));

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-journal-base-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  mkdirSync(join(dir, DERIVED_ENTRIES), { recursive: true });
  writeFileSync(join(dir, 'derived-index.json'), JSON.stringify(buildIndex([]), null, 2) + '\n');
  capture(dir, {
    subject: 'connect-token-as-platform-admin',
    question: 'How do I obtain a platform bearer token for the admin API?',
    claim: 'POST /connect/token, form-encoded, grant_type=password with the admin identity.',
    refutableBy: 'observation',
    anchors: ['POST /connect/token'],
    appliesTo: ['principal=platform-admin'],
    deployment: 'localhost',
    at: '2026-09-01T00:00:00Z',
  });
  return dir;
}

const outDir = () => mkdtempSync(join(tmpdir(), 'kb-journal-out-'));
const drop = (dir) => rmSync(dir, { recursive: true, force: true });

// One line into the ground-truth log, written by the real hook rather than hand-shaped, so these
// tests break if the hook's record shape moves.
function fireHook(out, session, command, env = {}) {
  spawnSync(process.execPath, [TOOL_LOG], {
    input: JSON.stringify({ session_id: session, tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, VC_MEASURE_OUT: out, ...env },
    encoding: 'utf8',
  });
}

const runKb = (argv, env = {}) => spawnSync(process.execPath, [KB, ...argv], {
  env: { ...process.env, VC_MEASURE_OUT: '', KB_PHASE: '', ...env },
  encoding: 'utf8',
});

const verbLines = (out) => {
  const f = readdirSync(out).find((x) => /^kb-log-.*\.jsonl$/.test(x));
  if (!f) return [];
  return readFileSync(join(out, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const questionRows = (out) => {
  const f = readdirSync(out).find((x) => /^questions-.*\.csv$/.test(x));
  return f ? readFileSync(join(out, f), 'utf8').trim().split('\n') : [];
};

test('with no output directory set, the journal writes nothing and says nothing', () => {
  const base = makeBase();
  const r = runKb(['ask', 'how do I obtain a platform bearer token', '--base', base]);
  assert.equal(r.status, 0);
  assert.equal(r.stderr.trim(), '', 'an instrument nobody switched on must also be silent');

  // Controlled explicitly rather than assumed: this repository's own settings.json sets
  // VC_MEASURE_OUT for measured sessions, so a test that read the ambient environment would be
  // asserting something about the machine it happens to run on.
  const before = process.env.VC_MEASURE_OUT;
  delete process.env.VC_MEASURE_OUT;
  try {
    assert.equal(journalDir(), null);
  } finally {
    if (before !== undefined) process.env.VC_MEASURE_OUT = before;
  }
  drop(base);
});

test('the verb log is written before the hook is wired, and the question row is not', () => {
  const base = makeBase();
  const out = outDir();
  const r = runKb(['ask', 'how do I obtain a platform bearer token', '--base', base], { VC_MEASURE_OUT: out, KB_PHASE: 'locate' });

  assert.equal(r.status, 0, 'the verb keeps its own exit code whatever the journal does');
  assert.equal(verbLines(out).length, 1, 'the verb log needs nothing from the hook');
  assert.equal(questionRows(out).length, 0, 'an unstamped row is the unverifiable row the toolkit refuses');
  assert.match(r.stderr, /hook is not wired/, 'and the gap is stated, not swallowed');
  drop(base); drop(out);
});

test('a question row appears once the ground truth exists, carrying the plane that answered', () => {
  const base = makeBase();
  const out = outDir();
  fireHook(out, 'sess-a', 'git status');
  const r = runKb(['ask', 'how do I obtain a platform bearer token', '--base', base], { VC_MEASURE_OUT: out, KB_PHASE: 'locate' });

  assert.equal(r.status, 0);
  const rows = questionRows(out);
  assert.equal(rows.length, 2, 'a header and one row');
  assert.match(rows[1], /KNOWLEDGE,KB-EXPERIENTIAL,locate/);
  assert.equal(verbLines(out)[0].backed_by, 'KB-EXPERIENTIAL');
  drop(base); drop(out);
});

test('a base that was asked and held nothing is KB-MISS, not a hit nobody closed', () => {
  const base = makeBase();
  const out = outDir();
  fireHook(out, 'sess-b', 'git status');
  const r = runKb(['ask', 'qqzz flibbertigibbet nonexistentthing', '--base', base], { VC_MEASURE_OUT: out, KB_PHASE: 'orient' });

  assert.equal(r.status, 1, 'a coverage MISS is exit 1');
  assert.match(questionRows(out)[1], /KB-MISS/);
  // The distinction the third value exists for: a MISS is complete at `add` time, so a row left
  // unmarked still says the base had nothing, instead of reading as an unclosed hit.
  assert.equal(verbLines(out)[0].backed_by, 'KB-MISS');
  drop(base); drop(out);
});

test('the top-ranked plane decides the row, and the full mix survives on the verb line', () => {
  assert.equal(backedByOf({ miss: false, served: [{ plane: 'experiential' }, { plane: 'derived-first' }] }), 'KB-EXPERIENTIAL');
  assert.equal(backedByOf({ miss: false, served: [{ plane: 'derived-first' }, { plane: 'experiential' }] }), 'KB-DERIVED');
  assert.equal(backedByOf({ miss: true, served: [] }), 'KB-MISS');
  assert.equal(backedByOf({ miss: false, served: [] }), 'KB-MISS', 'a hit with nothing served is a miss by another name');
  assert.equal(backedByOf(), 'KB-MISS');
});

test('the same question asked twice is marked re-asked; a different one is not', () => {
  const base = makeBase();
  const out = outDir();
  fireHook(out, 'sess-c', 'git status');
  const env = { VC_MEASURE_OUT: out, KB_PHASE: 'locate' };
  runKb(['ask', 'how do I obtain a platform bearer token', '--base', base], env);
  fireHook(out, 'sess-c', 'node bin/kb.mjs ask');
  runKb(['ask', 'How do I   obtain a Platform Bearer Token', '--base', base], env);
  fireHook(out, 'sess-c', 'node bin/kb.mjs ask');
  runKb(['ask', 'what residue does a placed order leave', '--base', base], env);

  const rows = questionRows(out);
  assert.match(rows[1], /,no,NONE/, 'the first asking is not a re-ask');
  assert.match(rows[2], /,yes,NONE/, 'case and spacing do not make a new question');
  assert.match(rows[3], /,no,NONE/, 'and a genuinely different question is not one either');
  drop(base); drop(out);
});

test('question identity is normalized for case and whitespace, and nothing looser', () => {
  assert.equal(questionHash('How  Do I Ask?'), questionHash('how do i ask?'));
  assert.notEqual(questionHash('how do i ask'), questionHash('how do i ask?'),
    'a fuzzy match would answer yes for a question never asked, and no reader could tell');
});

test('a write produces a verb line and no question row', () => {
  const base = makeBase();
  const out = outDir();
  fireHook(out, 'sess-d', 'git status');
  const r = runKb([
    'capture', '--base', base,
    '--subject', 'journal-write-shape',
    '--question', 'does a write land in the question log',
    '--claim', 'It does not: the question log asks what the answer was, and a write is one.',
    '--refutable-by', 'observation',
    '--anchor', 'POST /journal/write', '--scope', 'surface=platform-rest',
    '--deployment', 'localhost',
  ], { VC_MEASURE_OUT: out, KB_PHASE: 'report' });

  assert.equal(r.status, 0);
  const [line] = verbLines(out);
  assert.equal(line.verb, 'capture');
  assert.match(line.wrote.id, /^KB-/);
  assert.deepEqual(line.anchors, ['POST /journal/write']);
  assert.equal(line.question_hash, null, 'a write has no question to hash');
  assert.equal(questionRows(out).length, 0);
  drop(base); drop(out);
});

test('a refusal is recorded whole, with the entry it collided with', () => {
  const base = makeBase();
  const out = outDir();
  fireHook(out, 'sess-e', 'git status');
  const args = (subject) => [
    'capture', '--base', base,
    '--subject', subject,
    '--question', 'does the journal keep a refusal',
    '--claim', 'A second claim on one coordinate under one scope.',
    '--refutable-by', 'observation',
    '--anchor', 'POST /journal/refuse', '--scope', 'surface=platform-rest',
    '--deployment', 'localhost',
  ];
  const first = runKb(args('journal-refusal-one'), { VC_MEASURE_OUT: out });
  const second = runKb(args('journal-refusal-two'), { VC_MEASURE_OUT: out });

  assert.equal(first.status, 0);
  assert.equal(second.status, 4, 'a collision is exit 4');
  const lines = verbLines(out);
  assert.equal(lines[1].exit, 4);
  assert.equal(lines[1].refused.collidesWith, lines[0].wrote.id);
  // Whole, not a first line: the refusal message names the remedy it offers, and whether that
  // remedy is reachable is the thing the journal is being kept to find out.
  assert.ok(lines[1].refused.reason.includes('\n'), 'the message keeps its body');
  drop(base); drop(out);
});

test('without a phase there is no row, and the door says which flag fixes it', () => {
  const base = makeBase();
  const out = outDir();
  fireHook(out, 'sess-f', 'git status');
  const r = runKb(['ask', 'how do I obtain a platform bearer token', '--base', base], { VC_MEASURE_OUT: out });

  assert.equal(r.status, 0, 'a missing phase never fails the verb');
  assert.equal(verbLines(out).length, 1, 'the invocation is still recorded');
  assert.equal(questionRows(out).length, 0, 'nothing is defaulted into the phase column');
  assert.match(r.stderr, /--phase/);
  drop(base); drop(out);
});

test('the phase can be given per call, not only through the environment', () => {
  const base = makeBase();
  const out = outDir();
  fireHook(out, 'sess-g', 'git status');
  runKb(['ask', 'how do I obtain a platform bearer token', '--base', base, '--phase', 'diagnose'], { VC_MEASURE_OUT: out });
  assert.match(questionRows(out)[1], /,diagnose,/);
  drop(base); drop(out);
});

test('two ground-truth logs is a refusal to guess, not a coin toss', () => {
  const out = outDir();
  fireHook(out, 'sess-one', 'git status');
  fireHook(out, 'sess-two', 'git status');
  const r = resolveSession(out);
  assert.equal(r.session, null, 'picking the newest is how a row is filed under another session');
  assert.match(r.reason, /VC_MEASURE_SESSION/, 'and the message names the way out');
  drop(out);
});

// The refusal above is correct and was the wrong thing to need. Two sessions sharing a directory is
// the NORMAL state here -- the authoring session's hook recreates its log on every tool call -- so
// the price of that refusal was an instruction on every kb call a run made: put VC_MEASURE_SESSION
// on the line, twenty-five times, and lose a question row silently the once you forget.
//
// The transcript id the logs are named by is invisible to a child process. The harness's own
// session id is not: it is in the environment, inherited, and the hook now writes it into every
// record. So the question "which of these is mine" has an answer in the files themselves.
test('a session finds its own log among several, without being told which', () => {
  const out = outDir();
  fireHook(out, 'sess-one', 'git status', { CLAUDE_CODE_HOST_SESSION_ID: 'local_aaaa-1111' });
  fireHook(out, 'sess-two', 'git status', { CLAUDE_CODE_HOST_SESSION_ID: 'local_bbbb-2222' });

  const before = process.env.CLAUDE_CODE_HOST_SESSION_ID;
  process.env.CLAUDE_CODE_HOST_SESSION_ID = 'local_bbbb-2222';
  try {
    const r = resolveSession(out);
    assert.equal(r.session, 'sess-two', 'the log that carries this session id is the one this session wrote');
    assert.equal(r.stamped, true);
    assert.equal(r.reason, null);
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CODE_HOST_SESSION_ID;
    else process.env.CLAUDE_CODE_HOST_SESSION_ID = before;
  }
  drop(out);
});

// The fallback has to hold, or every log written before this field existed becomes unreadable --
// which is all six archived runs.
test('logs with no host id still refuse rather than guess', () => {
  const out = outDir();
  fireHook(out, 'old-one', 'git status', { CLAUDE_CODE_HOST_SESSION_ID: '' });
  fireHook(out, 'old-two', 'git status', { CLAUDE_CODE_HOST_SESSION_ID: '' });

  const before = process.env.CLAUDE_CODE_HOST_SESSION_ID;
  process.env.CLAUDE_CODE_HOST_SESSION_ID = 'local_cccc-3333';
  try {
    const r = resolveSession(out);
    assert.equal(r.session, null, 'a session id nothing carries resolves nothing, and must not pick');
    assert.match(r.reason, /VC_MEASURE_SESSION/);
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CODE_HOST_SESSION_ID;
    else process.env.CLAUDE_CODE_HOST_SESSION_ID = before;
  }
  drop(out);
});

test('a journal that cannot write still returns, and never changes the exit code', () => {
  const before = process.env.VC_MEASURE_OUT;
  // A path whose parent is a FILE: mkdir fails, so every later step would too.
  const blocker = mkdtempSync(join(tmpdir(), 'kb-journal-blocked-'));
  writeFileSync(join(blocker, 'wall'), 'not a directory');
  process.env.VC_MEASURE_OUT = join(blocker, 'wall', 'under');
  try {
    const r = record({ cmd: 'ask', argv: {}, base: 'x', exit: 0, outcome: { question: 'q', miss: true, served: [] } });
    assert.equal(r.journalled, false);
    assert.ok(r.reason, 'the failure is named rather than swallowed');
  } finally {
    if (before === undefined) delete process.env.VC_MEASURE_OUT;
    else process.env.VC_MEASURE_OUT = before;
    drop(blocker);
  }
});

test('the corpus is never touched by journalling', () => {
  const base = makeBase();
  const out = outDir();
  const before = readdirSync(join(base, 'captured')).sort();
  fireHook(out, 'sess-h', 'git status');
  runKb(['ask', 'how do I obtain a platform bearer token', '--base', base, '--phase', 'locate'], { VC_MEASURE_OUT: out });
  assert.deepEqual(readdirSync(join(base, 'captured')).sort(), before);
  assert.equal(questionRows(out).length, 2, 'the row goes to the journal, never into the base');
  drop(base); drop(out);
});

// Reading the manual is not doing the work. The journal is what the measurement reads to answer
// 'how often did an agent write to the base?', so a help page counted as a capture inflates the
// one number the whole experiment turns on -- and inflates it in the flattering direction, which
// is the kind of error nobody goes looking for.
test('a verb help page leaves nothing in the journal', () => {
  const out = outDir();
  const r = runKb(['capture', '--help'], { VC_MEASURE_OUT: out, KB_PHASE: 'orient' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /kb capture/);
  assert.equal(readdirSync(out).length, 0, 'help wrote a journal file: ' + readdirSync(out).join(', '));
  drop(out);
});

test('a capture that is actually attempted does leave a line', () => {
  const out = outDir();
  const base = makeBase();
  const r = runKb(['capture', '--base', base], { VC_MEASURE_OUT: out, KB_PHASE: 'orient' });
  assert.notEqual(r.status, 0, 'an empty capture must not succeed');
  const lines = verbLines(out);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verb, 'capture');
  drop(out);
  drop(base);
});
