#!/usr/bin/env node
// `npm run kb:report` — what agents asked this base, and what it could not answer (PLAN §8).
//
// It reads the logs from the base over the network, analyses them locally, renders a local HTML
// file into the SESSION SCRATCHPAD, and stores nothing in the base and nothing in the repository
// tree. `git status` cleanliness is load-bearing for `/qa-fix` and every review flow, and the tree
// is gated by `context:check` and `mirror:check` — so a report file in it would fail a build that
// has nothing to do with the report.
//
// CLI ONLY, and not an MCP tool: this is an OPERATOR verb, like `push` and `stat`. An agent in the
// middle of a task has no use for a 90-day analysis of everyone's questions, and exposing it would
// put a multi-second network fan-out behind a tool an agent might reach for by accident.
//
// EXIT CODES follow the CLI's, with the same distinction that justifies them existing at all:
//   0  a report was rendered from the live base
//   1  rendered, but from CACHE behind a banner — the base was not read
//   2  refused: the base is not enumerable, or the window is too wide to read
//   3  nothing was read and there is no cache — no report at all
// 1 and 3 are separate for §3.5's reason: "stale" and "nothing" are opposite problems.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveBase } from './core/base.mjs';
import { analyse } from './core/report-analyse.mjs';
import { DEFAULT_DAYS, MAX_FILES, collect, collectFromCache, reportCacheDir } from './core/report-fetch.mjs';
import { renderHtml, renderText } from './core/report-render.mjs';

const USAGE = `kb:report — what agents asked this base, and what it could not answer

  npm run kb:report -- [--days 30] [--sessions a,b,c] [--run <handle>] [--base <locator>]
                       [--out <file.html>] [--json] [--no-network]

  --days N        window, in day folders under log/ (default ${DEFAULT_DAYS}). Above ${MAX_FILES}
                  files it refuses rather than hanging.
  --sessions a,b  scope to NAMED SESSIONS instead of a time window — the shape PLAN §15's check
                  wave needs, because a wave is a set of sessions interleaved with other traffic,
                  not a date range. Searches the WHOLE log tree, so --days does not apply.
  --run <handle>  scope to one run handle (KB_RUN, exactly as it was stamped -- it is never
                  parsed). NARROWS the window rather than replacing it, so it composes with
                  --days and --sessions, and the header says how many lines it set aside.
  --base <url>    read a different base. Defaults to KB_BASE, then the declared default.
  --out <file>    where the HTML lands. Defaults to the session scratchpad; never the repo tree.
  --json          print the analysis as JSON instead of writing HTML.
  --no-network    render from cache only — the unreachable path, on demand.

exit: 0 rendered from the live base · 1 rendered FROM CACHE behind a banner · 2 refused
      (base not enumerable, or window too wide) · 3 nothing read and no cache`;

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
    flags[name] = eq === -1 ? (argv[i + 1]?.startsWith('--') ? true : argv[++i] ?? true) : a.slice(eq + 1);
  }
  return flags;
}

/**
 * Where the HTML goes. The scratchpad this session was given, else the OS temp dir — never the
 * working tree, and never a path the caller has to clean up.
 */
export function outputPath(flags, env = process.env, at = new Date()) {
  if (typeof flags.out === 'string') return flags.out;
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dir = env.CLAUDE_SCRATCHPAD_DIR || env.SCRATCHPAD || join(tmpdir(), 'claude-kb-report');
  return join(dir, `kb-report-${stamp}.html`);
}

/**
 * Output is INJECTED, not written straight to `process.stdout`.
 *
 * Not a testing nicety: a test that stubs `process.stdout.write` to capture this ALSO swallows the
 * TAP stream the node test runner writes to the same descriptor, so those tests' results vanish
 * from the run and the file exits non-zero with every subtest passing — measured here, on this
 * file's own tests. An injected writer cannot do that to anybody.
 */
export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  { write = (s) => process.stdout.write(s), writeErr = (s) => process.stderr.write(s) } = {},
) {
  const out = (s = '') => write(`${s}\n`);
  const flags = parseArgs(argv);
  if (flags.help) { out(USAGE); return 0; }

  const at = new Date();
  const base = resolveBase({ baseArg: typeof flags.base === 'string' ? flags.base : null, env });
  const days = Number(flags.days) > 0 ? Math.floor(Number(flags.days)) : DEFAULT_DAYS;
  // `--sessions` REPLACES the day window rather than narrowing it; `--days` keeps its default and
  // its meaning when the flag is absent (PLAN §15.2).
  const sessions = typeof flags.sessions === 'string' ? flags.sessions : null;
  const cacheDir = reportCacheDir(env);

  const got = flags['no-network']
    ? await collectFromCache({ base: base.locator, days, sessions, cacheDir, detail: '--no-network was passed', at })
    : await collect({ base: base.locator, days, sessions, at, cacheDir });

  if (got.refused) {
    writeErr(`kb:report refused — ${got.meta.why}\n`);
    return 2;
  }

  // `run` is a LINE filter and `sessions` is a FILE filter, which is why one reaches `analyse`
  // through meta and the other reaches `collect`: a run's lines are scattered across whatever files
  // the push timer happened to cut, so there is no set of paths to fetch.
  const run = typeof flags.run === 'string' ? flags.run : null;
  const report = analyse({ lines: got.lines, rows: got.rows, meta: { ...got.meta, how: base.how, run } });

  if (flags.json) {
    out(JSON.stringify(report, (_k, v) => (v instanceof Set ? [...v] : v), 1));
  } else {
    const file = outputPath(flags, env, at);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, renderHtml(report), 'utf8');
    out(renderText(report));
    out('');
    out(file);
  }

  // A cache-only render with nothing in the cache is not a report. Saying so with its own exit code
  // is the same discipline as `unreachable` vs `miss`: an empty page that looks like "no activity"
  // is the one output this tool must not produce silently.
  if (report.meta.fromCache) return report.meta.cacheEmpty ? 3 : 1;
  return 0;
}

const invoked = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invoked) {
  main().then((code) => { process.exitCode = code; }, (err) => {
    process.stderr.write(`kb:report failed — ${String(err?.stack ?? err)}\n`);
    process.exitCode = 3;
  });
}
