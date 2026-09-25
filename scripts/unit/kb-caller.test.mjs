// WHO CALLED — the `agent` a log line is stamped with, derived from this machine's transcripts
// (`core/caller.mjs`). What is tested is the DERIVATION: which transcript a call id is found in,
// what that makes the caller, and what the public log is allowed to say about it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  knownAgentNames, resolveCallers, stampCallers, stampCallersFromTranscripts, transcriptDirFor,
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
