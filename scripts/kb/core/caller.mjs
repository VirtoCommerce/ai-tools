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
 * Every transcript touched since `sinceMs`, with who wrote it. Subagents first: they are small, and
 * most calls that matter are theirs. `only`, when given, is the set of session ids to read — a
 * session's main transcript is `<id>.jsonl` and its subagents' are under `<id>/subagents/`.
 */
function* transcripts(dirs, sinceMs, names, only = null) {
  const wanted = (id) => !only || only.has(id);
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let sessions;
    try { sessions = readdirSync(dir); } catch { continue; }
    for (const s of sessions) {
      if (!wanted(s)) continue;
      const sub = join(dir, s, 'subagents');
      if (!existsSync(sub)) continue;
      let files;
      try { files = readdirSync(sub); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const path = join(sub, f);
        if (!recent(path, sinceMs)) continue;
        let type = null;
        try { type = JSON.parse(readFileSync(path.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType ?? null; } catch { /* no meta */ }
        yield { path, who: type && names.has(type) ? type : 'other' };
      }
    }
    for (const s of sessions) {
      if (!s.endsWith('.jsonl') || !wanted(s.slice(0, -'.jsonl'.length))) continue;
      const path = join(dir, s);
      if (recent(path, sinceMs)) yield { path, who: 'main' };
    }
  }
}

const readOrNull = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

/**
 * call id -> 'main' | a known agent name | 'other', for every id found in a transcript touched
 * since `sinceMs`. Ids found nowhere are absent from the map.
 */
export function resolveCallers(callIds, { dirs, sinceMs = 0, names = knownAgentNames() }) {
  const pending = new Set(callIds.filter((c) => typeof c === 'string' && c));
  const out = new Map();
  if (!pending.size) return out;
  // Matched as the `tool_use` record's own `"id"` — never as a bare substring, which would also hit
  // any transcript that merely QUOTES the id (a debugging session printing log lines, for one).
  for (const { path, who } of transcripts(dirs, sinceMs, names)) {
    const text = readOrNull(path);
    if (text === null) continue;
    for (const id of [...pending]) if (text.includes(`"id":"${id}"`)) { out.set(id, who); pending.delete(id); }
    if (!pending.size) break;
  }
  return out;
}

// THE CLI DOOR (VCST-6146). A CLI call runs inside a shell tool call and the kb process never sees
// that tool-use id, so the line carries no `call` — 812 of one week's 916 agent calls were invisible
// to any per-agent reading. The transcript still holds the call: a `Bash`/`PowerShell` `tool_use`
// whose command invokes kb with the same verb and the same question or entry id, written just
// BEFORE the line (the record is the request; the line is written while it runs). That tool-use id
// becomes the line's `call`, and `agent` follows from the transcript it sits in.
//
// Exact, not plausible: only the transcripts of the session that wrote the line are read (its queue
// sidecar records them, `metaTranscripts` in queue.mjs), the verb must match, the line's key
// (question, entry id, capture subject) must appear in the command, the line must fall between the
// call and its result (and at most CLI_WINDOW_MS after the call), and a call is spent once per kb
// invocation it holds. Anything
// else — a plain terminal, a key the command does not carry — stays unstamped, as an unresolved MCP
// call does.

const SHELLS = new Set(['Bash', 'PowerShell']);
// `npm run -s kb -- ask`, `npm run kb -- show`, `node scripts/kb/kb.mjs confirm` — npm's own flags may
// sit between `run` and `kb`.
const KB_VERB = /(?:npm\s+run(?:-script)?(?:\s+-{1,2}[\w-]+)*\s+kb(?:\s+--)?|scripts[\\/]+kb[\\/]+kb\.mjs["']?)\s+(ask|show|capture|confirm|dispute)\b/g;
// Shell loop syntax, not the words: "for" and "while" are common in a question. So it is tested on
// the command with its quoted strings removed, and a bash loop must reach its `do`.
const LOOP = /\b(?:for|while|until)\b[^;\n]*[;\n]\s*do\b|\bxargs\b|\bForEach-Object\b|\bforeach\s*\(/;
const unquoted = (s) => s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
/** A shell tool call runs for at most ten minutes; nothing older than that wrote the line. */
export const CLI_WINDOW_MS = 10 * 60 * 1000;

/** Quotes, escapes and whitespace differ between a shell command and the argv kb logged. */
const flat = (s) => String(s ?? '').replace(/[\\"'`]/g, '').replace(/\s+/g, ' ').trim();

/** The verb a CLI line came from and the text its command must carry; null when it cannot match. */
export function cliKey(line) {
  if (!line || line.via !== 'cli' || line.call) return null;
  const verb = String(line.kind ?? '').replace(/-(invalid|refused)$/, '');
  const key = verb === 'ask' ? line.q
    : verb === 'capture' ? line.subject
      : ['show', 'confirm', 'dispute'].includes(verb) ? line.id : null;
  const needle = flat(key);
  return needle ? { verb, needle } : null;
}

/**
 * Slack on the end of a call: the line is written while the process runs and the `tool_result`
 * after it exits (measured 156 ms apart), so this only absorbs timestamp rounding.
 */
const END_SLACK_MS = 1000;

/**
 * Every shell `tool_use` in one transcript that invokes kb: `{ id, atMs, endMs, verbs, runs, text }`.
 * `endMs` is its `tool_result`'s time, or Infinity while it has none: a line written after the call
 * returned was not written by it (a later `!` command asking the same question, say), and that holds
 * across pushes with no state kept between them.
 */
export function kbShellCalls(text) {
  const out = [];
  const ends = new Map();
  for (const raw of String(text).split('\n')) {
    const result = raw.includes('"tool_result"');
    if (!result && !raw.includes('kb')) continue;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    const atMs = Date.parse(rec.timestamp);
    for (const c of content) {
      if (c?.type === 'tool_result' && typeof c.tool_use_id === 'string' && Number.isFinite(atMs)) ends.set(c.tool_use_id, atMs);
      if (c?.type !== 'tool_use' || !SHELLS.has(c.name) || typeof c.input?.command !== 'string') continue;
      const runs = [...c.input.command.matchAll(KB_VERB)].map((m) => m[1]);
      // A loop runs its one kb invocation once per item, so it is not spent by count (measured
      // 2026-10-01: one `while read q; do npm run -s kb -- ask "$q"` wrote 17 lines).
      const limit = LOOP.test(unquoted(c.input.command)) ? Infinity : runs.length;
      if (runs.length) out.push({ id: c.id, atMs, verbs: new Set(runs), runs: limit, text: flat(c.input.command) });
    }
  }
  for (const c of out) c.endMs = ends.has(c.id) ? ends.get(c.id) + END_SLACK_MS : Infinity;
  return out;
}

/**
 * line index -> `{ call, agent }` for every CLI line whose shell call was found. Each line takes the
 * NEAREST matching call written before it; a call is spent once per kb invocation in its command.
 * `sessions` are the transcript ids of the session that wrote the lines; none means no match.
 */
export function resolveCliCalls(lines, { dirs, sinceMs = 0, names = knownAgentNames(), sessions = [] }) {
  const out = new Map();
  const only = new Set(sessions);
  if (!only.size) return out;
  const wanted = lines.map((l, i) => ({ i, key: cliKey(l), atMs: Date.parse(l?.at) }))
    .filter((w) => w.key && Number.isFinite(w.atMs));
  if (!wanted.length) return out;
  const calls = [];
  for (const { path, who } of transcripts(dirs, sinceMs, names, only)) {
    const text = readOrNull(path);
    if (!text?.includes('kb')) continue;
    for (const c of kbShellCalls(text)) if (Number.isFinite(c.atMs)) calls.push({ ...c, who });
  }
  const spent = new Map();
  for (const w of wanted.sort((a, b) => a.atMs - b.atMs)) {
    let best = null;
    for (const c of calls) {
      if ((spent.get(c.id) ?? 0) >= c.runs || c.atMs > w.atMs || w.atMs > c.endMs || w.atMs - c.atMs > CLI_WINDOW_MS) continue;
      if (!c.verbs.has(w.key.verb) || !c.text.includes(w.key.needle)) continue;
      if (!best || c.atMs > best.atMs) best = c;
    }
    if (best) { spent.set(best.id, (spent.get(best.id) ?? 0) + 1); out.set(w.i, { call: best.id, agent: best.who }); }
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
 * `sessions` — the transcript ids the queue file's sidecar recorded — scopes the CLI match.
 */
export function stampCallersFromTranscripts(lines, { env = process.env, cwd = process.cwd(), names, sessions = [] } = {}) {
  try {
    const calls = lines.filter((l) => l?.call && !l.agent).map((l) => l.call);
    const cli = sessions.length > 0 && lines.some((l) => cliKey(l));
    if (!calls.length && !cli) return lines;
    const oldest = Math.min(...lines.map((l) => Date.parse(l?.at)).filter(Number.isFinite));
    const sinceMs = Number.isFinite(oldest) ? oldest - CLI_WINDOW_MS : 0;
    const dirs = env.KB_TRANSCRIPTS_DIR
      ? [env.KB_TRANSCRIPTS_DIR]
      : [...new Set([transcriptDirFor(cwd), transcriptDirFor(REPO_ROOT)])];
    const known = names ?? knownAgentNames();
    const stamped = stampCallers(lines, resolveCallers(calls, { dirs, sinceMs, names: known }));
    if (!cli) return stamped;
    const found = resolveCliCalls(stamped, { dirs, sinceMs, names: known, sessions });
    return stamped.map((l, i) => (found.has(i) && !l.agent ? { ...l, ...found.get(i) } : l));
  } catch {
    return lines;
  }
}
