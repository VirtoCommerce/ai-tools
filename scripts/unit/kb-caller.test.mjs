// WHO CALLED — the `agent` a log line is stamped with, derived from this machine's transcripts
// (`core/caller.mjs`). What is tested is the DERIVATION: which transcript a call id is found in,
// what that makes the caller, and what the public log is allowed to say about it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLI_WINDOW_MS, cliKey, kbShellCalls, knownAgentNames, resolveCallers, resolveCliCalls, stampCallers,
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
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cli = (s, kind, key) => ({ at: iso(s), kind, via: 'cli', ...key });
const resolveAt = (dir, lines) => resolveCliCalls(lines, { dirs: [dir], names: NAMES });

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
    { env: { KB_TRANSCRIPTS_DIR: dir }, names: NAMES },
  );
  assert.equal(out[0].call, 'toolu_SUB_ASK');
  assert.equal(out[0].agent, 'qa-frontend-expert');
  assert.equal('call' in out[1], false);
  assert.equal('agent' in out[1], false);
}));
