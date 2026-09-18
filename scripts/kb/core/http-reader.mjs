// The HTTPS reader -- the implementation behind the seam (PLAN §3.1, §3.5).
//
// Reads go through raw.githubusercontent.com and NOT the contents API. Measured (PLAN §1.9): ~3x
// faster, it returns the file rather than base64, and it is a CDN that is not on the 60/h rate
// limit at all -- so no amount of asking can exhaust anything. The API is touched only by the push,
// once per session, and that is a later session's business.
//
// THE ONE RULE, restated because this is the file that could break it: a read failure NEVER throws
// and NEVER returns empty. 404 -> `missing`; timeout, DNS, refused connection, 5xx, 429, 403 ->
// `unreachable`. PLAN §3.5 exists because "I asked and nobody wrote this down" and "I could not
// ask" mean opposite things: collapse them and an agent that could not reach the base concludes
// "the base doesn't know", then guesses -- or writes a duplicate of an entry that already exists,
// so the base starts commissioning work it has already done. A `try/catch` around this whole file
// that returned `{ok:false, reason:'missing'}` would be that collapse, which is why the mapping is
// explicit per status and the catch-all direction is `unreachable`.
//
// WHY THE CATCH-ALL IS `unreachable` AND NOT `missing`: the two errors are not symmetric. Treating
// an unreachable base as missing makes an agent invent facts; treating a missing file as
// unreachable makes it retry and then say it could not tell. Only one of those is expensive.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** How long to wait before calling it unreachable. A hung read is worse than a failed one. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Statuses meaning "the base answered, and that file is not in it". Everything else failed to ask. */
const MISSING_STATUS = new Set([404, 410]);

/**
 * Where the index cache lives -- a scratchpad, never the repo, for the same reason as the queue:
 * these files are transient and a cache in the working tree shows up in `git status`.
 */
export function cacheDir(env = process.env) {
  return env.KB_CACHE_DIR || join(tmpdir(), 'claude-kb-cache');
}

const cacheFile = (dir, url) => join(dir, `${createHash('sha256').update(url).digest('hex').slice(0, 16)}.json`);

/** `max-age=N` out of a Cache-Control header. `raw` sends 300; absent means always revalidate. */
export function maxAgeOf(header) {
  const m = /(?:^|,)\s*max-age\s*=\s*(\d+)/i.exec(String(header ?? ''));
  return m ? Number(m[1]) : 0;
}

/**
 * What actually went wrong, in words an agent can act on.
 *
 * Node's `fetch` wraps every transport failure as a bare `TypeError: fetch failed` and puts the
 * real error -- `ENOTFOUND`, `ECONNREFUSED`, `CERT_HAS_EXPIRED`, the timeout -- in `err.cause`.
 * Reporting the wrapper is technically an honest `unreachable`, and useless: "conclude nothing;
 * retry" is good advice, but whether a retry has any chance depends entirely on whether this was a
 * five-second blip or a hostname that does not exist. Measured live against a bad hostname before
 * this unwrapping existed, the whole detail an operator got was "TypeError: fetch failed".
 *
 * The cause is unwrapped up to two levels, because an aggregate error (a host with several
 * addresses, all refused) nests one deeper.
 */
export function describeFailure(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return `timeout: ${String(err.message ?? err).slice(0, 160)}`;
  }
  const causes = [err, err?.cause, err?.cause?.cause, ...(err?.cause?.errors ?? [])].filter(Boolean);
  const coded = causes.find((c) => c.code);
  const code = coded?.code ?? err?.name ?? 'error';
  const message = (coded ?? err?.cause ?? err)?.message ?? String(err);
  return `${code}: ${String(message).slice(0, 160)}`;
}

/**
 * Resolve a path from `index.json` against the base, refusing anything that escapes it.
 *
 * A path out of the index is DATA, not a trusted input -- in the shipping shape it arrives over the
 * network from a public repository anyone can open a PR against. `../../` in a row would otherwise
 * make the tool fetch a URL nobody declared, which is exactly the "answering out of a corpus nobody
 * named" failure rule 2 exists to prevent. Refused as `missing`, never thrown, like everything else.
 */
export function resolveUrl(base, relative) {
  if (typeof relative !== 'string' || relative === '') return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.startsWith('//')) return null;
  const root = `${String(base).replace(/\/+$/, '')}/`;
  let url;
  try {
    url = new URL(relative, root);
  } catch {
    return null;
  }
  return url.href.startsWith(root) ? url.href : null;
}

/**
 * Build the HTTPS reader for a base URL.
 *
 * `fetchImpl` is injectable for one reason and it is not testing convenience: the unit tests run
 * under a preloaded trap that replaces `fetch` with a thrower, so a reader that reached for the
 * real one would make the test suite need a network -- and a test suite that needs a network is
 * slow, flaky and quietly skipped, at which point the thing it guards is unguarded. Injecting a
 * transport lets the mapping from status to `reason` be tested exhaustively and offline. It is
 * resolved per call, not captured at module load, so the trap applies to the default path too.
 */
export function httpReader(locator, {
  how = 'declared',
  fetchImpl = null,
  timeoutMs = Number(process.env.KB_HTTP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const base = String(locator).replace(/\/+$/, '');

  const store = async (file, record) => {
    try {
      await mkdir(cacheDir(env), { recursive: true });
      await writeFile(file, JSON.stringify(record), 'utf8');
    } catch { /* a cache that cannot be written costs a round trip, never a read */ }
  };

  /** One GET, mapped onto ReadResult. The only place in this file that touches the network. */
  const get = async (url, headers = {}) => {
    const doFetch = fetchImpl ?? globalThis.fetch;
    if (typeof doFetch !== 'function') {
      return { ok: false, reason: 'unreachable', detail: 'no fetch implementation in this runtime' };
    }
    let res;
    try {
      res = await doFetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    } catch (err) {
      // DNS, refused, aborted, TLS, and the unit-test trap all land here. None of them is "the
      // file is not there", and saying so would be the collapse this whole design prevents.
      return { ok: false, reason: 'unreachable', detail: describeFailure(err) };
    }
    if (res.status === 304) return { ok: false, reason: 'not-modified', detail: '304', res };
    if (MISSING_STATUS.has(res.status)) return { ok: false, reason: 'missing', detail: `HTTP ${res.status} ${url}` };
    if (!res.ok) {
      // 403 is GitHub's rate-limit answer as well as its forbidden one, and 5xx is the CDN having
      // a bad day. Both are "could not ask", and neither is evidence about what the base holds.
      return { ok: false, reason: 'unreachable', detail: `HTTP ${res.status} ${url}` };
    }
    try {
      return { ok: true, text: await res.text(), res };
    } catch (err) {
      return { ok: false, reason: 'unreachable', detail: `body read failed: ${err.message}` };
    }
  };

  /** A plain read: no cache, no conditional request. Entry bodies take this path. */
  const read = async (relative) => {
    const url = resolveUrl(base, relative);
    if (!url) return { ok: false, reason: 'missing', detail: `path escapes the base: ${relative}` };
    const r = await get(url);
    if (r.ok) return { ok: true, text: r.text };
    return { ok: false, reason: r.reason === 'not-modified' ? 'unreachable' : r.reason, detail: r.detail };
  };

  /**
   * The index, through the session cache (PLAN §3.1 step 1).
   *
   * Two distinct savings, and only the first is what makes "every question after ~0.35 s" true:
   *
   *   1. WITHIN `max-age` THERE IS NO REQUEST AT ALL. Each `kb ask` is its own process, so "fetch
   *      the index once per session" can only mean an on-disk cache -- otherwise every question
   *      pays the index fetch again. `raw` sends `max-age=300`, and the plan already ACCEPTS that
   *      staleness in writing: a read can be up to five minutes behind, which at worst reads as a
   *      coverage miss and is corrected by the push-time dedup. Honouring it locally is therefore
   *      not a shortcut -- it is the same five minutes, spent on our side of the wire.
   *   2. AFTER IT, `If-None-Match` makes the revalidation a 304 with no body.
   *
   * A cache that cannot be read or written is not an error. It costs a round trip, nothing else,
   * so every cache failure falls through to the plain fetch rather than failing the read.
   */
  const readCached = async (relative) => {
    const url = resolveUrl(base, relative);
    if (!url) return { ok: false, reason: 'missing', detail: `path escapes the base: ${relative}` };
    const file = cacheFile(cacheDir(env), url);

    let cached = null;
    try {
      cached = JSON.parse(await readFile(file, 'utf8'));
    } catch { /* absent, unreadable or corrupt cache -- all three mean "fetch it" */ }

    if (cached?.text != null && Number.isFinite(cached.fetchedAt)) {
      const ageMs = now() - cached.fetchedAt;
      if (ageMs >= 0 && ageMs < Number(cached.maxAge ?? 0) * 1000) {
        return { ok: true, text: cached.text, cache: 'fresh' };
      }
    }

    const r = await get(url, cached?.etag ? { 'if-none-match': cached.etag } : {});

    if (r.reason === 'not-modified' && cached?.text != null) {
      // Still current. Re-stamp so the next question inside the window skips the round trip too.
      const maxAge = maxAgeOf(r.res?.headers?.get?.('cache-control')) || Number(cached.maxAge ?? 0);
      await store(file, { ...cached, fetchedAt: now(), maxAge });
      return { ok: true, text: cached.text, cache: 'revalidated' };
    }
    if (r.reason === 'not-modified') {
      // A 304 with nothing to serve it from: the cache was dropped between the two reads. Not a
      // missing file and not a working read -- say we could not, and ask again next time.
      return { ok: false, reason: 'unreachable', detail: '304 with no cached copy' };
    }
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };

    await store(file, {
      url,
      etag: r.res?.headers?.get?.('etag') ?? null,
      fetchedAt: now(),
      maxAge: maxAgeOf(r.res?.headers?.get?.('cache-control')),
      text: r.text,
    });
    return { ok: true, text: r.text, cache: 'fetched' };
  };

  return {
    kind: 'http',
    locator: base,
    how,
    // The manifest is small, read once, and is the thing that decides whether this is a base at
    // all -- so it is NOT served from a stale cache. Being told "not a base" out of a
    // five-minute-old copy of a file that has since appeared is a confusing way to be sent to a
    // config problem that no longer exists.
    readManifest: () => read('kb.json'),
    readIndex: (name) => readCached(name),
    readEntry: (path) => read(path),
  };
}
