#!/usr/bin/env node
// A/B bench: the same task, the same model, with the knowledge base and without it.
//
//   node scripts/kb/bench/agent-ab/run.mjs [--tasks demo|all|T1-promo-stack,...] [--runs 3]
//        [--arms kb,nokb] [--model sonnet] [--judge-model sonnet] [--parallel 3]
//        [--budget 4] [--timeout-min 25] [--out <dir>]
//
// Every run starts in its OWN empty folder, not in this repo: the repo carries much of the base's
// content already (business-logic.md is generated from it; suites and bug reports restate it), so an
// agent without the base would grep its way to the same answer and the bench would measure grep.
// The only differences between the arms are the `kb` MCP server and one CLAUDE.md line that tells
// the agent when to use it. KB_ENABLED=0 keeps reads working and stops bench sessions from
// capturing into, or logging to, the public base.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../..');
// Before config.js layers the repo's secrets in -- and minus what would tie a run to the session
// that launched it: its session ids and messaging channel, its working directory, and temp dirs
// whose path spells out the repo's name.
const SYSTEM_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/^(CLAUDE_CODE_(SESSION_ID|HOST_SESSION_ID|MESSAGING_SOCKET|MESSAGING_TOKEN|CHILD_SESSION)|CLAUDE_PROJECT_DIR|PWD|OLDPWD|TEMP|TMP|TMPDIR)$/i.test(k)));
await import(pathToFileURL(join(REPO, 'config.js')).href);

// Only these reach the agent. Tracker, GitHub and cloud tokens never do.
const PASS_THROUGH = ['FRONT_URL', 'BACK_URL', 'STORE_ID', 'ADMIN', 'ADMIN_PASSWORD', 'USER_EMAIL',
  'USER_PASSWORD', 'USER2_EMAIL', 'USER2_PASSWORD', 'ORG_USER_EMAIL', 'ORG_USER_PASSWORD',
  'LOCKOUT_TEST_EMAIL', 'LOCKOUT_TEST_PASSWORD'];

const KB_RULE = `# Rule
Before you state how the Virto Commerce platform behaves, call mcp__kb__kb_ask and put the coordinate
(page path, REST endpoint or GraphQL operation) in the question. A "well attested" or
"corroborated" answer is evidence you can build on; re-check live only a single observation or a
disputed entry. This is a measurement run: do not capture, confirm or dispute anything.
`;

const PREAMBLE = (vars) => `You are a QA engineer working on a Virto Commerce B2B deployment.
Storefront: ${vars.FRONT_URL}   Platform (REST, GraphQL, Admin): ${vars.BACK_URL}   Store id: ${vars.STORE_ID}
Credentials are in environment variables (read them with $NAME in Bash, never print them):
ADMIN / ADMIN_PASSWORD (platform admin), USER_EMAIL / USER_PASSWORD and USER2_EMAIL / USER2_PASSWORD
(storefront buyers in one company), ORG_USER_EMAIL / ORG_USER_PASSWORD, LOCKOUT_TEST_EMAIL /
LOCKOUT_TEST_PASSWORD (a dedicated account you may lock).
Work autonomously; nobody will answer questions. Any entity you create must be named AGENT-TEST-...
and deleted before you finish. End with a section headed "FINAL ANSWER".

Task:
`;

// ── args ──────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i === -1 ? dflt : argv[i + 1]; };
const spec = JSON.parse(readFileSync(join(HERE, 'tasks.json'), 'utf8'));
const pick = opt('tasks', 'demo');
const ids = pick === 'all' ? spec.tasks.map((t) => t.id) : pick === 'demo' ? spec.demoSet : pick.split(',');
const tasks = ids.map((id) => spec.tasks.find((t) => t.id === id) ?? fail(`unknown task ${id}`));
const RUNS = Number(opt('runs', 3));
const ARMS = opt('arms', 'kb,nokb').split(',');
const MODEL = opt('model', 'sonnet');
const JUDGE = opt('judge-model', 'sonnet');
// One at a time by default: two agents on one task share the live environment (two runs of T1 would
// create promotions in the same store; two of T7 would lock the same account), so parallel runs of
// one task contaminate each other through the environment itself.
const PARALLEL = Number(opt('parallel', 1));
const BUDGET = opt('budget', '4');
const TIMEOUT_MS = Number(opt('timeout-min', 25)) * 60_000;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = resolve(opt('out', join(tmpdir(), 'kb-ab', stamp)));
mkdirSync(OUT, { recursive: true });
// Agents work somewhere that names neither the repo nor the bench, and that holds no results: a
// working folder next to OUT would let an agent `ls ..` and read the other arm's answer.
const WORK_ROOT = join(homedir(), 'agent-work');
mkdirSync(WORK_ROOT, { recursive: true });

function fail(msg) { console.error(`agent-ab: ${msg}`); process.exit(2); }

const vars = Object.fromEntries(PASS_THROUGH.map((k) => [k, process.env[k] ?? '']));
for (const k of ['FRONT_URL', 'BACK_URL']) if (!vars[k]) fail(`${k} is not set for TEST_ENV=${process.env.TEST_ENV ?? 'vcst'}`);
const hosts = [vars.FRONT_URL, vars.BACK_URL].map((u) => { try { return new URL(u).host; } catch { return null; } }).filter(Boolean);

// ── one claude -p process ─────────────────────────────────────────────────────────────────────
const q = (s) => (process.platform === 'win32' && /[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

function claude(args, stdin, cwd, env, timeoutMs) {
  return new Promise((done) => {
    const child = spawn('claude', args.map(q), { cwd, env, shell: process.platform === 'win32' });
    let out = ''; let err = ''; let timedOut = false;
    // With shell:true on Windows, child.kill() ends cmd.exe and leaves claude running: kill the tree.
    const killTree = () => (process.platform === 'win32'
      ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
      : child.kill());
    const timer = setTimeout(() => { timedOut = true; killTree(); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(timer); done({ code, out, err, timedOut }); });
    child.stdin.end(stdin);
  });
}

// ── metrics from the stream-json transcript ───────────────────────────────────────────────────
const WRITE = /-X\s*(PUT|PATCH|DELETE)\b|\bmutation\b|method:\s*['"](PUT|PATCH|DELETE)/i;
const HTTP_FAIL = /\b(40[0-5]|500)\b[^\n]{0,40}(Not Found|Unauthorized|Forbidden|Bad Request|Method Not Allowed|Internal Server Error)|"errors"\s*:\s*\[\s*\{/i;

const LEAK = /_VIRTO|vc-mcp-testing-module|business-logic\.md|vc-bug-catalog|[\\/]plugins[\\/].*knowledge|kb-ab|agent-work[\\/]*(\.\.|\*)|\.\.[\\/]\.\./i;

function measure(raw, arm) {
  const events = raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const m = { toolCalls: 0, byTool: {}, toolErrors: 0, httpFailures: 0, envCalls: 0, envWrites: 0,
    kbAsks: 0, kbAnswered: 0, contaminated: false, final: '', result: null };
  const pending = new Map();
  for (const e of events) {
    const blocks = e.message?.content;
    if (e.type === 'assistant' && Array.isArray(blocks)) {
      for (const b of blocks.filter((x) => x.type === 'tool_use')) {
        m.toolCalls += 1; m.byTool[b.name] = (m.byTool[b.name] ?? 0) + 1;
        const input = JSON.stringify(b.input ?? {});
        if (hosts.some((h) => input.includes(h)) || /\$(FRONT_URL|BACK_URL)|playwright|browser_/i.test(input + b.name)) {
          m.envCalls += 1; if (WRITE.test(input)) m.envWrites += 1;
        }
        if (/kb_ask$/.test(b.name)) m.kbAsks += 1;
        // A run that reached knowledge it was not given is void, in EITHER arm: this repo, the plugin
        // cache's knowledge/ copy, another run's folder or results, or (without the base) the base.
        if (LEAK.test(input) || (arm === 'nokb' && (/kb_/.test(b.name) || /vc-knowledge/i.test(input)))) m.contaminated = true;
        pending.set(b.id, b.name);
      }
    }
    if (e.type === 'user' && Array.isArray(blocks)) {
      for (const b of blocks.filter((x) => x.type === 'tool_result')) {
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
        if (b.is_error) m.toolErrors += 1;
        else if (HTTP_FAIL.test(text)) m.httpFailures += 1;
        if (/kb_ask$/.test(pending.get(b.tool_use_id) ?? '') && /answered from the base|"verdict"\s*:\s*"answer"/i.test(text)) m.kbAnswered += 1;
      }
    }
    if (e.type === 'result') m.result = e;
  }
  const r = m.result ?? {};
  const u = r.usage ?? {};
  m.final = String(r.result ?? '');
  return { ...m, result: undefined, status: r.subtype ?? 'no-result', turns: r.num_turns ?? null,
    durationSec: r.duration_ms != null ? Math.round(r.duration_ms / 1000) : null, costUsd: r.total_cost_usd ?? null,
    tokens: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0 } };
}

// ── judge ─────────────────────────────────────────────────────────────────────────────────────
async function judge(task, final, cwd, env) {
  const prompt = `Grade a QA agent's answer against a rubric. Use no tools. Reply with ONLY a JSON object:
{"score":0|1|2,"falseClaim":true|false,"evidence":0|1|2,"reason":"<one sentence>"}
score 2 = every "correct" point is present and nothing in "wrong"; 1 = partly; 0 = misses the core point or states a "wrong" item.
evidence = how well the claims are backed: 2 = every load-bearing claim names its source (an observed response, a record id, a doc page, a knowledge-base entry with its trust level); 1 = some; 0 = asserted without sources.
Judge the content only: do not favour one kind of source over another, and do not reward an answer for mentioning a knowledge base.
falseClaim = the answer asserts a "wrong" item as fact (or, for a control task, asserts unevidenced facts).

TASK: ${task.prompt}
RUBRIC correct: ${JSON.stringify(task.rubric.correct)}
RUBRIC wrong: ${JSON.stringify(task.rubric.wrong)}

ANSWER:
${final.slice(-12000)}`;
  const r = await claude(['-p', '--output-format', 'json', '--model', JUDGE, '--strict-mcp-config',
    '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,Agent', '--no-session-persistence'],
  prompt, cwd, env, 5 * 60_000);
  try {
    // `--output-format json` prints the result object on some CLI versions and every event on others.
    const parsed = JSON.parse(r.out);
    const text = (Array.isArray(parsed) ? parsed.find((e) => e.type === 'result') : parsed)?.result ?? '';
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch { return { score: null, falseClaim: null, evidence: null, reason: 'judge output unreadable' }; }
}

// ── one cell: task × arm × run ────────────────────────────────────────────────────────────────
async function cell(task, arm, n) {
  const name = `${task.id}.${arm}.${n}`;
  // A random, meaningless folder name: the task id or the arm in the path would be a hint.
  const dir = join(WORK_ROOT, randomBytes(4).toString('hex'));
  mkdirSync(join(dir, 'tmp'), { recursive: true });
  const mcp = arm === 'kb'
    ? { mcpServers: { kb: { command: 'node', args: [join(REPO, 'scripts/kb/mcp.mjs')], env: { KB_ENABLED: '0' } } } }
    : { mcpServers: {} };
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify(mcp, null, 2));
  if (arm === 'kb') writeFileSync(join(dir, 'CLAUDE.md'), KB_RULE);
  const env = { ...SYSTEM_ENV, ...vars, KB_ENABLED: '0', PWD: dir, TEMP: join(dir, 'tmp'), TMP: join(dir, 'tmp') };
  const allowed = 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch' + (arm === 'kb' ? ',mcp__kb__kb_ask,mcp__kb__kb_show' : '');
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', MODEL, '--strict-mcp-config',
    '--mcp-config', join(dir, 'mcp.json'), '--allowedTools', allowed, '--max-budget-usd', String(BUDGET),
    '--no-session-persistence', '--disable-slash-commands'];
  if (arm === 'nokb') args.push('--disallowedTools', 'mcp__kb__kb_ask,mcp__kb__kb_show,mcp__kb__kb_capture,mcp__kb__kb_confirm,mcp__kb__kb_dispute');
  const prompt = PREAMBLE(vars) + task.prompt.replace(/\$([A-Z_]+)/g, (s, k) => (k in vars && !/PASSWORD/.test(k) ? vars[k] : s));
  const t0 = Date.now();
  const r = await claude(args, prompt, dir, env, TIMEOUT_MS);
  writeFileSync(join(OUT, `${name}.jsonl`), r.out);
  const m = measure(r.out, arm);
  if (r.timedOut) m.status = 'timeout';
  m.wallSec = Math.round((Date.now() - t0) / 1000);
  m.grade = m.final ? await judge(task, m.final, dir, env) : { score: 0, falseClaim: null, reason: 'no final answer' };
  const row = { task: task.id, kind: task.kind, arm, run: n, workDir: dir, ...m };
  delete row.final;
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ ...row, final: m.final }, null, 2));
  // Whatever this agent wrote (scripts, notes, its CLAUDE.md) must not be there for the next one to find.
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name.padEnd(34)} ${row.status.padEnd(8)} calls=${row.toolCalls} errs=${row.toolErrors + row.httpFailures} `
    + `$${row.costUsd?.toFixed(2) ?? '?'} ${row.durationSec ?? row.wallSec}s score=${row.grade.score}${row.contaminated ? ' CONTAMINATED' : ''}`);
  return row;
}

// ── run the grid, a few at a time ─────────────────────────────────────────────────────────────
const grid = [];
// Arms alternate who goes first, so neither always meets the environment the other just left.
for (let n = 1; n <= RUNS; n += 1) for (const t of tasks) for (const a of (n % 2 ? ARMS : [...ARMS].reverse())) grid.push([t, a, n]);
console.log(`agent-ab: ${grid.length} runs (${tasks.length} tasks × ${ARMS.length} arms × ${RUNS}), model ${MODEL}, out ${OUT}`);
const rows = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(PARALLEL, grid.length) }, async () => {
  while (next < grid.length) { const [t, a, n] = grid[next++]; rows.push(await cell(t, a, n)); }
}));

// ── summary ───────────────────────────────────────────────────────────────────────────────────
const med = (xs) => { const v = xs.filter((x) => x != null).sort((p, r) => p - r); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const spread = (xs) => { const v = xs.filter((x) => x != null); return v.length ? +(Math.max(...v) - Math.min(...v)).toFixed(2) : null; };
const sum = (xs) => xs.reduce((s, x) => s + (x ?? 0), 0);
const tok = (r) => r.tokens.input + r.tokens.output + r.tokens.cacheWrite + r.tokens.cacheRead;
const graded = (rs) => rs.filter((r) => r.grade.score != null);
const agg = (rs) => ({
  runs: rs.length,
  correctness: graded(rs).length ? +(sum(graded(rs).map((r) => r.grade.score)) / (2 * graded(rs).length)).toFixed(2) : null,
  ungraded: rs.length - graded(rs).length,
  passAll: rs.length > 0 && rs.every((r) => r.grade.score === 2),
  falseClaims: rs.filter((r) => r.grade.falseClaim).length,
  toolCalls: med(rs.map((r) => r.toolCalls)),
  deadEnds: med(rs.map((r) => r.toolErrors + r.httpFailures)),
  envCalls: med(rs.map((r) => r.envCalls)),
  envWrites: med(rs.map((r) => r.envWrites)),
  toolSearches: med(rs.map((r) => r.byTool.ToolSearch ?? 0)),
  tokens: med(rs.map(tok)),
  outputTokens: med(rs.map((r) => r.tokens.output)),
  costUsd: (() => { const c = med(rs.map((r) => r.costUsd)); return c == null ? null : +c.toFixed(2); })(),
  timeSec: med(rs.map((r) => r.durationSec ?? r.wallSec)),
  kbAsks: med(rs.map((r) => r.kbAsks)),
  evidence: graded(rs).length ? +(sum(graded(rs).map((r) => r.grade.evidence ?? 0)) / (2 * graded(rs).length)).toFixed(2) : null,
  costSpread: spread(rs.map((r) => r.costUsd)),
  timeSpread: spread(rs.map((r) => r.durationSec ?? r.wallSec)),
  costPerCorrect: (() => { const c = sum(rs.map((r) => r.costUsd)); const ok = sum(graded(rs).map((r) => r.grade.score)) / 2; return ok ? +(c / ok).toFixed(2) : null; })(),
  contaminated: rs.filter((r) => r.contaminated).length,
});
const byTask = {};
for (const t of tasks) byTask[t.id] = Object.fromEntries(ARMS.map((a) => [a, agg(rows.filter((r) => r.task === t.id && r.arm === a))]));
const overall = Object.fromEntries(['real', 'control'].flatMap((g) => ARMS.map((a) => [`${g}.${a}`,
  agg(rows.filter((r) => r.arm === a && (g === 'control' ? r.kind === 'control' : r.kind !== 'control')))])));
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ model: MODEL, runs: RUNS, overall, byTask }, null, 2));

const cols = ['correctness', 'falseClaims', 'evidence', 'passAll', 'costPerCorrect', 'toolCalls', 'deadEnds', 'envWrites', 'tokens', 'costUsd', 'costSpread', 'timeSec', 'timeSpread', 'kbAsks', 'contaminated'];
const line = (label, a) => `| ${label} | ${cols.map((c) => a[c] ?? '-').join(' | ')} |`;
const md = [`# KB A/B — ${stamp}, model ${MODEL}, ${RUNS} run(s) per cell`, '',
  `| cell | ${cols.join(' | ')} |`, `|${'---|'.repeat(cols.length + 1)}`,
  ...Object.entries(overall).map(([k, a]) => line(`**${k}**`, a)),
  ...Object.entries(byTask).flatMap(([id, arms]) => Object.entries(arms).map(([a, s]) => line(`${id} · ${a}`, s))),
  '', 'Medians per cell, except correctness (mean score / 2) and falseClaims (count).'].join('\n');
writeFileSync(join(OUT, 'summary.md'), md);
console.log(`\n${md}\n\nraw transcripts and per-run JSON: ${OUT}`);
