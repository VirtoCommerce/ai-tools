// WHO CALLED — derived on this machine from the session transcripts, never reported by the agent.
//
// `verbs.mjs` and `mcp.mjs` explain why the SERVER cannot tell a subagent from the main thread:
// one stdio connection, `_meta` with two keys, nothing per caller. That stays true. What they also
// concluded — that the `call` id is no use as a join key because a subagent's tool-use id never
// appears in the PARENT transcript — was measured against the wrong file. Claude Code writes each
// subagent's turns to its own transcript, `<project>/<session>/subagents/agent-*.jsonl`, beside a
// `.meta.json` that names its `agentType`. Measured 2026-09-23 on SMOKE-2026-09-23-0733: 12 of 12
// logged `call` ids resolved — 1 in the main transcript, 11 in the storefront agent's.
//
// WHY DERIVED AND NOT SELF-REPORTED. An agent asked to name itself can omit it or misname it (the
// storefront agent's own definition never states its name), and saying so costs a line in every
// prompt file, most of which are at their size budget. The join is exact and costs no prompt.
//
// WHY A CLOSED VOCABULARY. The log is PUBLIC. An agent type is recorded only when it names an agent
// this repository defines — `.claude/agents/*.md` or `plugins/<p>/agents/*.md` (as `<p>:<name>`),
// read from their `name:` frontmatter, never listed here. Anything else — a built-in type, a
// client's own agent — is `other`, and the main thread is `main`. A call nobody can find is left
// WITHOUT the field: absent beats plausible.
//
// IT RUNS AT PUSH TIME, because by then the transcripts hold the calls; and it never fails a push —
// every error here means "no field", nothing more.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Claude Code's per-project transcript directory for a working directory. */
export function transcriptDirFor(cwd, home = homedir()) {
  return join(home, '.claude', 'projects', String(cwd).replace(/[^A-Za-z0-9]/g, '-'));
}

function nameOf(file) {
  try {
    const m = /^---\r?\n[\s\S]*?^name:\s*["']?(.+?)["']?\s*$/m.exec(readFileSync(file, 'utf8'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}

/** Every agent name this repository defines — the only names the public log may carry. */
export function knownAgentNames(root = REPO_ROOT) {
  const names = new Set();
  const scan = (dir, prefix) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const n = nameOf(join(dir, f));
      if (n) names.add(prefix ? `${prefix}:${n}` : n);
    }
  };
  scan(join(root, '.claude', 'agents'), null);
  const plugins = join(root, 'plugins');
  if (existsSync(plugins)) for (const p of readdirSync(plugins)) scan(join(plugins, p, 'agents'), p);
  return names;
}

const recent = (file, sinceMs) => {
  try { return statSync(file).mtimeMs >= sinceMs; } catch { return false; }
};

/**
 * call id -> 'main' | a known agent name | 'other', for every id found in a transcript touched
 * since `sinceMs`. Ids found nowhere are absent from the map.
 */
export function resolveCallers(callIds, { dirs, sinceMs = 0, names = knownAgentNames() }) {
  const pending = new Set(callIds.filter((c) => typeof c === 'string' && c));
  const out = new Map();
  // Matched as the `tool_use` record's own `"id"` — never as a bare substring, which would also hit
  // any transcript that merely QUOTES the id (a debugging session printing log lines, for one).
  const take = (text, who) => {
    for (const id of [...pending]) if (text.includes(`"id":"${id}"`)) { out.set(id, who); pending.delete(id); }
  };
  for (const dir of dirs) {
    if (!pending.size || !existsSync(dir)) continue;
    let sessions;
    try { sessions = readdirSync(dir); } catch { continue; }
    // Subagents first: they are small, and most calls that matter are theirs.
    for (const s of sessions) {
      const sub = join(dir, s, 'subagents');
      if (!pending.size) break;
      if (!existsSync(sub)) continue;
      for (const f of readdirSync(sub)) {
        if (!f.endsWith('.jsonl') || !pending.size) continue;
        const path = join(sub, f);
        if (!recent(path, sinceMs)) continue;
        let type = null;
        try { type = JSON.parse(readFileSync(path.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType ?? null; } catch { /* no meta */ }
        try { take(readFileSync(path, 'utf8'), type && names.has(type) ? type : 'other'); } catch { /* unreadable */ }
      }
    }
    for (const s of sessions) {
      if (!pending.size) break;
      if (!s.endsWith('.jsonl')) continue;
      const path = join(dir, s);
      if (!recent(path, sinceMs)) continue;
      try { take(readFileSync(path, 'utf8'), 'main'); } catch { /* unreadable */ }
    }
  }
  return out;
}

/** The lines, with `agent` stamped where the call resolved. Pure: never overwrites a stamp. */
export function stampCallers(lines, resolved) {
  return lines.map((l) => (l && l.call && !l.agent && resolved.has(l.call) ? { ...l, agent: resolved.get(l.call) } : l));
}

/**
 * Stamp a batch of queue lines in place of the push. Never throws.
 * `KB_TRANSCRIPTS_DIR` overrides where transcripts are looked for (tests, unusual layouts).
 */
export function stampCallersFromTranscripts(lines, { env = process.env, cwd = process.cwd(), names } = {}) {
  try {
    const calls = lines.filter((l) => l?.call && !l.agent).map((l) => l.call);
    if (!calls.length) return lines;
    const oldest = Math.min(...lines.map((l) => Date.parse(l?.at)).filter(Number.isFinite));
    const sinceMs = Number.isFinite(oldest) ? oldest - 10 * 60 * 1000 : 0;
    const dirs = env.KB_TRANSCRIPTS_DIR
      ? [env.KB_TRANSCRIPTS_DIR]
      : [...new Set([transcriptDirFor(cwd), transcriptDirFor(REPO_ROOT)])];
    return stampCallers(lines, resolveCallers(calls, { dirs, sinceMs, names: names ?? knownAgentNames() }));
  } catch {
    return lines;
  }
}
