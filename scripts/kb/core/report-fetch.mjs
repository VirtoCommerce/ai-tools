// The report's NETWORK layer — reading the log subtree and the index off the base (PLAN §8).
//
// It reads the logs from the base over the network, analyses them locally, renders a local HTML
// file, and STORES NOTHING IN THE BASE. Nothing here writes; there is no token path at all.
//
// TWO CALLS, not 91. One git-tree call enumerates `log/` (the whole base's tree is 483 KB / 0.725 s
// and this is the only way to enumerate over `raw`, which is a CDN with no directory listing —
// `core/reader.mjs` says so in the comment on `listEntries`), then one `raw` fetch per selected
// session file and one for `index.json`. At ~1 session/day over 30 days that is ~30 files ≈ 330 KB.
//
// THE BOUND IS A REFUSAL, NOT A TRUNCATION (PLAN §8): above ~200 files it stops and says so. A
// report that silently analysed the first 200 of 900 files would publish a number that looks like
// the answer and is not, which is worse than no report — and a report that hangs on 900 fetches is
// a report nobody runs twice.
//
// AND: when the base is unreachable it renders from cache BEHIND A BANNER, never an empty report
// that reads as "no activity". That is §3.5's confusion relocated into the report, and it is the
// one thing the report must not do. Hence `fromCache` and `failure` on the result — the renderer
// cannot produce a clean-looking page without knowing.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { coordinatesOf } from './github-api.mjs';
import { dayOf, parseLogFile, sessionOf } from './report-analyse.mjs';

/** Above this many session files the report refuses rather than hanging (PLAN §8). */
export const MAX_FILES = 200;

/** Default window. 30 days at the measured 10.8 KB/day is ~325 KB — no incremental cache needed. */
export const DEFAULT_DAYS = 30;

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Where the cache lives — a scratchpad, never the repo, for the same reason as the queue and the
 * index cache: these files are transient and a cache in the working tree shows up in `git status`,
 * which is load-bearing for `/qa-fix` and every review flow.
 */
export function reportCacheDir(env = process.env) {
  return env.KB_REPORT_CACHE_DIR || join(tmpdir(), 'claude-kb-report-cache');
}

const cacheKey = (url) => createHash('sha256').update(String(url)).digest('hex').slice(0, 16);

/** The `YYYY-MM-DD` day folders inside the window, inclusive of today. */
export function windowDays(days = DEFAULT_DAYS, at = new Date()) {
  const out = new Set();
  const ms = 24 * 60 * 60 * 1000;
  for (let i = 0; i < Math.max(1, days); i += 1) {
    out.add(new Date(at.getTime() - i * ms).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Which tree blobs are session logs inside the window.
 *
 * Selection is on the DAY FOLDER, not on the file's timestamp: the folder is what §7 named the
 * window for ("date folder → 'last 30 days' is one tree read"), and a log pushed at 04:38 UTC
 * carrying lines from the previous evening lives under the day it was pushed. Filtering on line
 * timestamps instead would drop a file whose lines are all older than the window even though its
 * folder is inside it — and those lines are exactly the ones a late push carries.
 */
export function selectLogPaths(treeEntries, { days = DEFAULT_DAYS, at = new Date(), prefix = '' } = {}) {
  const head = prefix ? `${prefix}/log/` : 'log/';
  const want = windowDays(days, at);
  return (treeEntries ?? [])
    .filter((e) => e?.type === 'blob' && typeof e.path === 'string' && e.path.startsWith(head))
    .filter((e) => e.path.endsWith('.jsonl'))
    .map((e) => e.path)
    .filter((p) => want.has(dayOf(p.slice(prefix ? prefix.length + 1 : 0))))
    .sort();
}

async function getJson(url, { fetchImpl, timeoutMs }) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return { ok: false, detail: 'no fetch implementation in this runtime' };
  try {
    const res = await doFetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'vc-kb/1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${url.replace(/\?.*/, '')}` };
    return { ok: true, json: JSON.parse(text) };
  } catch (err) {
    return { ok: false, detail: `${err?.cause?.code ?? err?.name ?? 'error'}: ${String(err?.message ?? err).slice(0, 160)}` };
  }
}

async function getText(url, { fetchImpl, timeoutMs }) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return { ok: false, detail: 'no fetch implementation in this runtime' };
  try {
    const res = await doFetch(url, { headers: { 'user-agent': 'vc-kb/1' }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, detail: `${err?.cause?.code ?? err?.name ?? 'error'}: ${String(err?.message ?? err).slice(0, 160)}` };
  }
}

/** Writing to the cache must never fail a report that already succeeded. */
async function cacheWrite(dir, url, payload) {
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${cacheKey(url)}.json`), JSON.stringify({ url, at: new Date().toISOString(), payload }), 'utf8');
    return true;
  } catch { return false; }
}

async function cacheRead(dir, url) {
  try {
    const raw = await readFile(join(dir, `${cacheKey(url)}.json`), 'utf8');
    const j = JSON.parse(raw);
    return { ok: true, at: j.at, payload: j.payload };
  } catch { return { ok: false }; }
}

/** Every cached file, newest record first — what a banner-mode render is built from. */
async function cacheAll(dir) {
  let names = [];
  try { names = await readdir(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try {
      const j = JSON.parse(await readFile(join(dir, n), 'utf8'));
      out.push({ url: j.url, at: j.at, payload: j.payload });
    } catch { /* a torn cache file costs one entry, not the report */ }
  }
  return out;
}

/**
 * Collect everything the analysis needs: the log lines in the window, and the index rows.
 *
 * @returns {{ok, lines, rows, meta}} — `meta.fromCache` and `meta.failure` are how the renderer
 *          knows to put up the banner. `ok: false` is reserved for "refused", which is not a
 *          failure to reach the base and must not be shown as one.
 */
export async function collect({
  base,
  days = DEFAULT_DAYS,
  at = new Date(),
  fetchImpl = null,
  timeoutMs = Number(process.env.KB_HTTP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  cacheDir = reportCacheDir(),
  maxFiles = MAX_FILES,
  useCache = true,
} = {}) {
  const coords = coordinatesOf(base);
  if (!coords) {
    return {
      ok: false,
      refused: true,
      lines: [],
      rows: [],
      meta: { base, days, why: `the base ${JSON.stringify(String(base))} is not a raw.githubusercontent.com locator, so its log subtree cannot be enumerated` },
    };
  }
  const { owner, repo, branch, prefix } = coords;
  const net = { fetchImpl, timeoutMs };
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  const tree = await getJson(treeUrl, net);
  if (!tree.ok) {
    return fromCacheOnly({ base, days, cacheDir, detail: tree.detail, useCache, at });
  }
  if (useCache) await cacheWrite(cacheDir, treeUrl, { tree: tree.json?.tree ?? [], truncated: Boolean(tree.json?.truncated) });

  const paths = selectLogPaths(tree.json?.tree ?? [], { days, at, prefix });
  if (paths.length > maxFiles) {
    return {
      ok: false,
      refused: true,
      lines: [],
      rows: [],
      meta: {
        base, days, files: paths.length,
        why: `${paths.length} log files in the last ${days} days exceeds the ${maxFiles}-file bound. Narrow the window with --days N.`,
      },
    };
  }

  const rawRoot = String(base).replace(/\/+$/, '');
  const lines = [];
  const failures = [];
  let malformed = 0;

  for (const path of paths) {
    const rel = prefix ? path.slice(prefix.length + 1) : path;
    const url = `${rawRoot}/${rel}`;
    const got = await getText(url, net);
    if (!got.ok) { failures.push({ path: rel, detail: got.detail }); continue; }
    if (useCache) await cacheWrite(cacheDir, url, { text: got.text });
    const parsed = parseLogFile(got.text, { path: rel, session: sessionOf(rel) });
    lines.push(...parsed.lines);
    malformed += parsed.malformed;
  }

  const indexUrl = `${rawRoot}/index.json`;
  const idx = await getText(indexUrl, net);
  let rows = [];
  if (idx.ok) {
    try { rows = JSON.parse(idx.text)?.entries ?? []; } catch { failures.push({ path: 'index.json', detail: 'unparseable' }); }
    if (useCache) await cacheWrite(cacheDir, indexUrl, { text: idx.text });
  } else {
    failures.push({ path: 'index.json', detail: idx.detail });
  }

  return {
    ok: true,
    lines,
    rows,
    meta: {
      base, days, at: at.toISOString(),
      files: paths.length,
      truncated: Boolean(tree.json?.truncated),
      malformed,
      failures,
      fromCache: false,
      // An index that failed to load is NOT silently an empty index: every panel that resolves an
      // id would then report "not in the index", and panel 6 would call every judgement
      // undecidable. Said out loud so the reader discounts those panels rather than believing them.
      indexLoaded: idx.ok && rows.length > 0,
    },
  };
}

/**
 * The unreachable path: render from whatever the cache holds, behind a banner.
 *
 * It renders ANYWAY and it says so — never an empty report that looks like "no activity". The
 * banner names the failure and the timestamp of the newest record held, so a reader can tell a
 * stale report from a current one without checking anything else.
 */
async function fromCacheOnly({ base, days, cacheDir, detail, useCache, at }) {
  const cached = useCache ? await cacheAll(cacheDir) : [];
  const rawRoot = String(base).replace(/\/+$/, '');
  const lines = [];
  let rows = [];
  let newest = '';
  let files = 0;
  for (const c of cached) {
    if (String(c.at ?? '') > newest) newest = String(c.at ?? '');
    if (!String(c.url ?? '').startsWith(rawRoot)) continue;
    const rel = String(c.url).slice(rawRoot.length + 1);
    if (rel === 'index.json') {
      try { rows = JSON.parse(c.payload?.text ?? '')?.entries ?? []; } catch { /* keep going */ }
      continue;
    }
    if (!rel.endsWith('.jsonl')) continue;
    files += 1;
    lines.push(...parseLogFile(c.payload?.text ?? '', { path: rel, session: sessionOf(rel) }).lines);
  }
  return {
    ok: true,
    lines,
    rows,
    meta: {
      base, days, at: at.toISOString(),
      files,
      fromCache: true,
      failure: detail,
      newestCached: newest || null,
      cacheEmpty: cached.length === 0,
      indexLoaded: rows.length > 0,
      failures: [],
      malformed: 0,
    },
  };
}

/** Exposed for the tests and for `--no-network`: build a result straight out of the cache. */
export const collectFromCache = (opts) => fromCacheOnly({ at: new Date(), useCache: true, ...opts });

/** How old the newest cached record is, in words, for the banner. */
export async function cacheAge(dir) {
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
    let newest = 0;
    for (const n of names) newest = Math.max(newest, (await stat(join(dir, n))).mtimeMs);
    return newest ? new Date(newest).toISOString() : null;
  } catch { return null; }
}
