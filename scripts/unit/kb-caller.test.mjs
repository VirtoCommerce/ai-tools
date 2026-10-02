// WHO CALLED — the `agent` a log line is stamped with, derived from this machine's transcripts
// (`core/caller.mjs`). What is tested is the DERIVATION: which transcript a call id is found in,
// what that makes the caller, and what the public log is allowed to say about it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BACKGROUND_DEFAULT_MS, CLI_WINDOW_MS, carries, cliKey, kbShellCalls, knownAgentNames, resolveCallers, resolveCliCalls, stampCallers,
  stampCallersFromTranscripts, transcriptDirFor,
} from '../kb/core/caller.mjs';

const toolUse = (id) => JSON.stringify({ message: { content: [{ type: 'tool_use', id, name: 'mcp__kb__kb_ask' }] } });

function withTranscripts(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-caller-'));
  try {
    const sub = join(dir, 'sess-1', 'subagents');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(dir, 'sess-1.jsonl'), `${toolUse('toolu_MAIN')}\n`);
    writeFileSync(join(sub, 'agent-a.jsonl'), `${toolUse('toolu_FRONT')}\n`);
    writeFileSync(join(sub, 'agent-a.meta.json'), JSON.stringify({ agentType: 'qa-frontend-expert' }));
    writeFileSync(join(sub, 'agent-b.jsonl'), `${toolUse('toolu_BUILTIN')}\n`);
    writeFileSync(join(sub, 'agent-b.meta.json'), JSON.stringify({ agentType: 'general-purpose' }));
    // A transcript that only QUOTES an id — a debugging session printing log lines.
    writeFileSync(join(dir, 'sess-2.jsonl'), `${JSON.stringify({ text: 'the log said call toolu_QUOTED' })}\n`);
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const NAMES = new Set(['qa-frontend-expert', 'vc-fix:qa-frontend-expert']);

test('a call resolves to the subagent whose transcript holds it, or to main', () => withTranscripts((dir) => {
  const r = resolveCallers(['toolu_FRONT', 'toolu_MAIN'], { dirs: [dir], names: NAMES });
  assert.equal(r.get('toolu_FRONT'), 'qa-frontend-expert');
  assert.equal(r.get('toolu_MAIN'), 'main');
}));

test('the public log names only agents this repo defines; anything else is `other`', () => withTranscripts((dir) => {
  const r = resolveCallers(['toolu_BUILTIN'], { dirs: [dir], names: NAMES });
  assert.equal(r.get('toolu_BUILTIN'), 'other');
}));

test('an id that is only quoted, or found nowhere, gets no caller at all', () => withTranscripts((dir) => {
  const r = resolveCallers(['toolu_QUOTED', 'toolu_NOWHERE'], { dirs: [dir], names: NAMES });
  assert.equal(r.has('toolu_QUOTED'), false);
  assert.equal(r.has('toolu_NOWHERE'), false);
}));

test('only transcripts touched since the window opened are read', () => withTranscripts((dir) => {
  const old = new Date('2020-01-01T00:00:00Z');
  utimesSync(join(dir, 'sess-1', 'subagents', 'agent-a.jsonl'), old, old);
  const r = resolveCallers(['toolu_FRONT'], { dirs: [dir], names: NAMES, sinceMs: Date.parse('2025-01-01') });
  assert.equal(r.has('toolu_FRONT'), false);
}));

test('stamping adds `agent` where resolved and never overwrites one already there', () => {
  const lines = [
    { kind: 'ask', call: 'c1' },
    { kind: 'ask', call: 'c2', agent: 'main' },
    { kind: 'flush' },
  ];
  const out = stampCallers(lines, new Map([['c1', 'qa-frontend-expert'], ['c2', 'other']]));
  assert.equal(out[0].agent, 'qa-frontend-expert');
  assert.equal(out[1].agent, 'main');
  assert.equal('agent' in out[2], false);
});

test('the push-time stamper reads KB_TRANSCRIPTS_DIR and dates its window off the lines', () => withTranscripts((dir) => {
  const at = new Date().toISOString();
  const out = stampCallersFromTranscripts(
    [{ at, kind: 'capture', call: 'toolu_FRONT' }, { at, kind: 'ask', call: 'toolu_MAIN' }],
    { env: { KB_TRANSCRIPTS_DIR: dir }, names: NAMES },
  );
  assert.deepEqual(out.map((l) => l.agent), ['qa-frontend-expert', 'main']);
}));

test('the stamper never throws: a missing directory leaves the lines unstamped', () => {
  const lines = [{ at: new Date().toISOString(), kind: 'ask', call: 'toolu_X' }];
  assert.deepEqual(stampCallersFromTranscripts(lines, { env: { KB_TRANSCRIPTS_DIR: join(tmpdir(), 'kb-caller-absent-dir') } }), lines);
});

test('the vocabulary is read from the repo agent definitions, plugins prefixed', () => {
  const names = knownAgentNames();
  assert.equal(names.has('qa-frontend-expert'), true);
  assert.equal(names.has('vc-fix:qa-frontend-expert'), true);
  assert.equal(names.has('general-purpose'), false);
});

test('the transcript directory is the working directory with every non-alphanumeric made a dash', () => {
  assert.equal(transcriptDirFor('C:\\_VIRTO\\vc-mcp-testing-module', '/h'), join('/h', '.claude', 'projects', 'C---VIRTO-vc-mcp-testing-module'));
});

// ─── THE CLI DOOR (VCST-6146): a CLI line has no `call`; the shell tool call that ran it does ─────

const T0 = Date.parse('2026-10-01T09:00:00.000Z');
const iso = (s) => new Date(T0 + s * 1000).toISOString();
const shell = (id, s, command, name = 'Bash') => JSON.stringify({
  timestamp: iso(s), message: { content: [{ type: 'tool_use', id, name, input: { command } }] },
});

function withShellTranscripts(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-caller-cli-'));
  try {
    const sub = join(dir, 'sess-1', 'subagents');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'agent-a.jsonl'), [
      shell('toolu_SUB_ASK', 0, 'cd /c/repo && npm run -s kb -- ask "What does GET /account/coupons show?" --topic "coupons"'),
      shell('toolu_SUB_SHOW', 5, 'node scripts/kb/kb.mjs show KB-35F20D97'),
    ].join('\n'));
    writeFileSync(join(sub, 'agent-a.meta.json'), JSON.stringify({ agentType: 'qa-frontend-expert' }));
    writeFileSync(join(dir, 'sess-1.jsonl'), [
      shell('toolu_MAIN_OLD', 10, 'npm run kb -- ask "same question twice"'),
      shell('toolu_MAIN_NEW', 40, 'npm run kb -- ask "same question twice"'),
      shell('toolu_MAIN_TWO', 60, 'node scripts/kb/kb.mjs confirm KB-AAAA0001 --note "seen" && node scripts/kb/kb.mjs confirm KB-BBBB0002'),
      shell('toolu_MAIN_LOOP', 80, 'while IFS= read -r q; do npm run -s kb -- ask "$q"; done <<\'EOF\'\nfirst looped question\nsecond looped question\nEOF'),
      shell('toolu_PS', 100, 'npm run kb -- capture --subject "Coupon codes are case-insensitive" --question "q" --claim "c"', 'PowerShell'),
    ].join('\n'));
    // Another Claude session in the same project, asking a question sess-1's lines also ask.
    writeFileSync(join(dir, 'sess-2.jsonl'), shell('toolu_OTHER_SESSION', 120, 'npm run kb -- ask "asked by two sessions"'));
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cli = (s, kind, key) => ({ at: iso(s), kind, via: 'cli', ...key });
const resolveAt = (dir, lines, sessions = ['sess-1']) => resolveCliCalls(lines, { dirs: [dir], names: NAMES, sessions });

test('only the writing session\'s transcripts are searched; no recorded session means no match', () => withShellTranscripts((dir) => {
  const line = cli(121, 'ask', { q: 'asked by two sessions' });
  // A plain terminal or another session asking what sess-2's agent asked must not claim its call.
  assert.equal(resolveAt(dir, [line]).size, 0);
  assert.equal(resolveAt(dir, [line], []).size, 0);
  assert.equal(resolveAt(dir, [line], ['sess-2']).get(0).call, 'toolu_OTHER_SESSION');
}));

test('a line written after its call returned is not that call\'s, in this push or a later one', () => {
  const result = (id, s) => JSON.stringify({ timestamp: iso(s), message: { content: [{ type: 'tool_result', tool_use_id: id }] } });
  const dir = mkdtempSync(join(tmpdir(), 'kb-caller-end-'));
  try {
    // The call ran 0..2 s; a `!` command 300 s later asked the same question with no tool call.
    writeFileSync(join(dir, 'sess-1.jsonl'), [shell('toolu_DONE', 0, 'npm run kb -- ask "asked twice"'), result('toolu_DONE', 2)].join('\n'));
    const r = resolveCliCalls([cli(1, 'ask', { q: 'asked twice' }), cli(300, 'ask', { q: 'asked twice' })], { dirs: [dir], names: NAMES, sessions: ['sess-1'] });
    assert.equal(r.get(0).call, 'toolu_DONE');
    assert.equal(r.has(1), false);
    // A later push sees only the second line, and still does not hand it the finished call.
    assert.equal(resolveCliCalls([cli(300, 'ask', { q: 'asked twice' })], { dirs: [dir], names: NAMES, sessions: ['sess-1'] }).size, 0);
    assert.equal(kbShellCalls(result('toolu_DONE', 2) + '\n' + shell('toolu_DONE', 0, 'npm run kb -- ask "x"'))[0].endMs, T0 + 3000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function withTwoAgents(calls, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-caller-two-'));
  try {
    const sub = join(dir, 'sess-1', 'subagents');
    mkdirSync(sub, { recursive: true });
    for (const [file, type, records] of calls) {
      writeFileSync(join(sub, `${file}.jsonl`), records.join('\n'));
      writeFileSync(join(sub, `${file}.meta.json`), JSON.stringify({ agentType: type }));
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a question is matched as a whole argument, never as the start of a longer one', () => withTwoAgents([
  ['agent-a', 'qa-frontend-expert', [shell('toolu_A', 0, 'npm run kb -- ask "GET /cart"')]],
  ['agent-b', 'vc-fix:qa-frontend-expert', [shell('toolu_B', 1, 'npm run kb -- ask "GET /cart totals" --topic t')]],
], (dir) => {
  const r = resolveAt(dir, [cli(2, 'ask', { q: 'GET /cart' }), cli(3, 'ask', { q: 'GET /cart totals' })]);
  assert.deepEqual(r.get(0), { call: 'toolu_A', agent: 'qa-frontend-expert' });
  assert.deepEqual(r.get(1), { call: 'toolu_B', agent: 'vc-fix:qa-frontend-expert' });
}));

test('two different callers asking the same thing at once: the line names neither', () => withTwoAgents([
  ['agent-a', 'qa-frontend-expert', [shell('toolu_A', 0, 'npm run kb -- ask "same"')]],
  ['agent-b', 'vc-fix:qa-frontend-expert', [shell('toolu_B', 1, 'npm run kb -- ask "same"')]],
], (dir) => {
  assert.equal(resolveAt(dir, [cli(2, 'ask', { q: 'same' })]).size, 0);
}));

test('whole-argument matching: flags, operators, redirections and new lines end an argument', () => {
  assert.equal(carries('npm run kb -- ask GET /cart --topic x', 'GET /cart'), true);
  assert.equal(carries('npm run kb -- ask GET /cart 2>&1 | head', 'GET /cart'), true);
  assert.equal(carries('npm run kb -- ask GET /cart && echo', 'GET /cart'), true);
  assert.equal(carries('while read q; do x; done <<EOF\nGET /cart\nGET /orders\nEOF', 'GET /cart'), true);
  // A `\`-continued line, as flatLines leaves it (measured on a 2026-09-29 capture).
  assert.equal(carries('kb.mjs capture --subject Coupon codes collide \n   --question q', 'Coupon codes collide'), true);
  assert.equal(carries('npm run kb -- ask GET /cart totals', 'GET /cart'), false);
  assert.equal(carries('npm run kb -- ask XGET /cart', 'GET /cart'), false);
  assert.equal(carries('npm run kb -- show KB-10', 'KB-1'), false);
});

test('a background call returns at once but keeps writing until its own timeout', () => {
  const result = (id, s) => JSON.stringify({ timestamp: iso(s), message: { content: [{ type: 'tool_result', tool_use_id: id }] } });
  const bg = (id, s, command, timeout) => JSON.stringify({
    timestamp: iso(s), message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command, run_in_background: true, ...(timeout ? { timeout } : {}) } }] },
  });
  const dir = mkdtempSync(join(tmpdir(), 'kb-caller-bg-'));
  try {
    writeFileSync(join(dir, 'sess-1.jsonl'), [bg('toolu_BG', 0, 'npm run kb -- ask "slow one"', 20 * 60 * 1000), result('toolu_BG', 1)].join('\n'));
    assert.equal(resolveAt(dir, [cli(15 * 60, 'ask', { q: 'slow one' })]).get(0).call, 'toolu_BG', 'after its result, inside its timeout');
    assert.equal(resolveAt(dir, [cli(21 * 60, 'ask', { q: 'slow one' })]).size, 0, 'past its timeout');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a background call ends at its task-notification; without one, at 30 min by default', () => {
  const bg = (id, s) => JSON.stringify({
    timestamp: iso(s), message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'npm run kb -- ask "bg q"', run_in_background: true } }] },
  });
  const done = (id, s) => JSON.stringify({ type: 'queue-operation', timestamp: iso(s), content: `<task-notification>\n<task-id>b1</task-id>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>` });
  const dir = mkdtempSync(join(tmpdir(), 'kb-caller-bgend-'));
  try {
    writeFileSync(join(dir, 'sess-1.jsonl'), [bg('toolu_FIN', 0), done('toolu_FIN', 20), bg('toolu_OPEN', 100)].join('\n'));
    assert.equal(resolveAt(dir, [cli(10, 'ask', { q: 'bg q' })]).get(0).call, 'toolu_FIN');
    assert.equal(resolveAt(dir, [cli(60, 'ask', { q: 'bg q' })]).size, 0, 'FIN has ended and OPEN has not started');
    assert.equal(resolveAt(dir, [cli(150, 'ask', { q: 'bg q' })]).get(0).call, 'toolu_OPEN');
    const open = kbShellCalls(bg('toolu_OPEN', 100)).at(0);
    assert.equal(open.endMs - open.atMs, BACKGROUND_DEFAULT_MS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an entry id matches whatever case the caller typed it in', () => withShellTranscripts((dir) => {
  writeFileSync(join(dir, 'sess-1.jsonl'), shell('toolu_LOWER', 200, 'npm run kb -- show kb-ab12cd34'));
  assert.equal(resolveAt(dir, [cli(201, 'show', { id: 'KB-AB12CD34' })]).get(0).call, 'toolu_LOWER');
}));

test('npm flags before `run` and after `kb` are recognised', () => {
  const verbsOf = (command) => kbShellCalls(shell('t', 0, command)).flatMap((c) => [...c.verbs]);
  assert.deepEqual(verbsOf('npm -s run kb -- ask "q"'), ['ask']);
  assert.deepEqual(verbsOf('npm run kb --silent -- show KB-1'), ['show']);
  assert.deepEqual(verbsOf('npm run kbx -- ask "q"'), []);
});

test('the transcript cache is read through: a cached text is used instead of the disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-caller-cache-'));
  try {
    const path = join(dir, 'sess-1.jsonl');
    writeFileSync(path, '');
    const cache = new Map([[path, shell('toolu_CACHED', 0, 'npm run kb -- ask "cached"')]]);
    const out = stampCallersFromTranscripts([cli(1, 'ask', { q: 'cached' })], { env: { KB_TRANSCRIPTS_DIR: dir }, names: NAMES, sessions: ['sess-1'], cache });
    assert.equal(out[0].call, 'toolu_CACHED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a loop is shell syntax outside quotes, never "for … in" inside a question', () => {
  const limit = (command) => kbShellCalls(shell('t', 0, command))[0].runs;
  assert.equal(limit('npm run kb -- ask "discount for items in cart"'), 1);
  assert.equal(limit("npm run kb -- ask 'while true: what does the cart do'"), 1);
  assert.equal(limit('for q in a b; do npm run kb -- ask "$q"; done'), Infinity);
  assert.equal(limit('while IFS= read -r q\ndo npm run -s kb -- ask "$q"; done < qs.txt'), Infinity);
  assert.equal(limit('foreach ($q in $qs) { npm run kb -- ask $q }'), Infinity);
  assert.equal(limit('$qs | % { npm run kb -- ask $_ }'), Infinity);
  assert.equal(limit('for ($i = 0; $i -lt 3; $i++) { npm run kb -- ask $qs[$i] }'), Infinity);
  assert.equal(limit('while ($q = $r.ReadLine()) { npm run kb -- ask $q }'), Infinity);
  assert.equal(limit('do { npm run kb -- ask $q } until ($done)'), Infinity);
  assert.equal(limit('npm run kb -- ask "for (i) in the cart, do {nothing}"'), 1);
});

test('a sub-agent CLI call is stamped with the Bash tool-use id and that sub-agent', () => withShellTranscripts((dir) => {
  const r = resolveAt(dir, [cli(1, 'ask', { q: 'What does GET /account/coupons show?' }), cli(6, 'show', { id: 'KB-35F20D97' })]);
  assert.deepEqual(r.get(0), { call: 'toolu_SUB_ASK', agent: 'qa-frontend-expert' });
  assert.deepEqual(r.get(1), { call: 'toolu_SUB_SHOW', agent: 'qa-frontend-expert' });
}));

test('the nearest call BEFORE the line wins, and a call written after the line is never used', () => withShellTranscripts((dir) => {
  const r = resolveAt(dir, [cli(41, 'ask', { q: 'same question twice' }), cli(11, 'ask', { q: 'same question twice' })]);
  assert.equal(r.get(0).call, 'toolu_MAIN_NEW');
  assert.equal(r.get(1).call, 'toolu_MAIN_OLD');
  assert.equal(resolveAt(dir, [cli(9, 'ask', { q: 'same question twice' })]).size, 0);
}));

test('a call older than the window, a different verb or a key the command lacks leaves no stamp', () => withShellTranscripts((dir) => {
  const late = { at: new Date(T0 + 40_000 + CLI_WINDOW_MS + 1000).toISOString(), kind: 'ask', via: 'cli', q: 'same question twice' };
  assert.equal(resolveAt(dir, [late]).size, 0);
  assert.equal(resolveAt(dir, [cli(6, 'confirm', { id: 'KB-35F20D97' })]).size, 0);
  assert.equal(resolveAt(dir, [cli(6, 'show', { id: 'KB-FFFFFFFF' })]).size, 0);
}));

test('one invocation serves one line; two in one command serve two; a loop serves every item', () => withShellTranscripts((dir) => {
  const r = resolveAt(dir, [
    cli(61, 'confirm', { id: 'KB-AAAA0001' }), cli(62, 'confirm', { id: 'KB-BBBB0002' }),
    cli(81, 'ask', { q: 'first looped question' }), cli(82, 'ask', { q: 'second looped question' }),
    cli(12, 'ask', { q: 'same question twice' }), cli(13, 'ask', { q: 'same question twice' }),
  ]);
  assert.equal(r.get(0).call, 'toolu_MAIN_TWO');
  assert.equal(r.get(1).call, 'toolu_MAIN_TWO');
  assert.equal(r.get(2).call, 'toolu_MAIN_LOOP');
  assert.equal(r.get(3).call, 'toolu_MAIN_LOOP');
  assert.equal(r.get(4).call, 'toolu_MAIN_OLD');
  assert.equal(r.has(5), false);
}));

test('a capture is matched by its subject, from a PowerShell call as well', () => withShellTranscripts((dir) => {
  const r = resolveAt(dir, [cli(101, 'capture-refused', { subject: 'Coupon codes are case-insensitive' })]);
  assert.deepEqual(r.get(0), { call: 'toolu_PS', agent: 'main' });
}));

test('only a CLI line without a call has a key: MCP lines and stamped lines are left alone', () => {
  assert.equal(cliKey({ kind: 'ask', via: 'mcp', q: 'x' }), null);
  assert.equal(cliKey({ kind: 'ask', via: 'cli', call: 'toolu_X', q: 'x' }), null);
  assert.equal(cliKey({ kind: 'reindex', via: 'cli' }), null);
  assert.deepEqual(cliKey({ kind: 'ask', via: 'cli', q: ' say  "hi" ' }), { verb: 'ask', needle: 'say hi' });
});

test('kb invocations are recognised through npm flags and the script path, nothing else', () => {
  const verbsOf = (command) => kbShellCalls(shell('t', 0, command)).flatMap((c) => [...c.verbs]);
  assert.deepEqual(verbsOf('npm run -s kb -- ask "q"'), ['ask']);
  assert.deepEqual(verbsOf('node C:/repo/scripts/kb/kb.mjs dispute KB-1 --saw x'), ['dispute']);
  assert.deepEqual(verbsOf('npm run kb:install && echo ask'), []);
  assert.deepEqual(kbShellCalls(JSON.stringify({ message: { content: [{ type: 'tool_use', id: 't', name: 'Read', input: { command: 'npm run kb -- ask q' } }] } })), []);
});

test('the push-time stamper stamps CLI lines from a plain-terminal-free transcript, and only those', () => withShellTranscripts((dir) => {
  const out = stampCallersFromTranscripts(
    [cli(1, 'ask', { q: 'What does GET /account/coupons show?' }), cli(1, 'ask', { q: 'typed in a plain terminal' })],
    { env: { KB_TRANSCRIPTS_DIR: dir }, names: NAMES, sessions: ['sess-1'] },
  );
  assert.equal(out[0].call, 'toolu_SUB_ASK');
  assert.equal(out[0].agent, 'qa-frontend-expert');
  assert.equal('call' in out[1], false);
  assert.equal('agent' in out[1], false);
  // A queue whose sidecar recorded no transcript (a plain terminal) is never CLI-matched.
  const bare = stampCallersFromTranscripts([cli(1, 'ask', { q: 'What does GET /account/coupons show?' })], { env: { KB_TRANSCRIPTS_DIR: dir }, names: NAMES });
  assert.equal('call' in bare[0], false);
}));
