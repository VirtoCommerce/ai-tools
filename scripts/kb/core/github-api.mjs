// The Git Data API — the only door the base is WRITTEN through (PLAN §2 "The index").
//
// NOT THE CONTENTS API, and this is forced rather than preferred. `PUT /repos/…/contents/{path}`
// writes ONE FILE PER CALL and makes ONE COMMIT PER FILE (verified: the endpoint returns a single
// file object). A session that captured one entry has three files to land — the entry, `index.json`
// and its log — and landing them as three commits allows a state where `index.json` names an entry
// that is not there, which is the one inconsistency the index must never have. So:
//
//   POST /git/blobs   one per changed file
//   POST /git/trees   based on the current head's tree, overriding just those paths
//   POST /git/commits parent = the head we read
//   PATCH /git/refs/heads/main   WITHOUT force — a compare-and-swap covering EVERY file in the push
//
// The last line is the other reason this is the right API: conflict handling is ONE check for the
// whole push, not one per file. If the ref moved between our read and our write the PATCH fails
// with 422 and nothing landed — no half-applied state to reconcile.
//
// EVERY METHOD RETURNS A RESULT AND NEVER THROWS, the same rule the read seam follows
// (`core/reader.mjs`). A push that throws on a 403 somewhere deep gets caught by whatever `catch`
// is nearest and turns into "something went wrong", and the queue's fate then depends on where that
// catch happened to be. Here the failure is data: the caller decides, once, whether to retry, to
// stop, or to leave the queue for the next session.

/** The API is reached once per session at most, and a hung push must not delay shutdown. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/** Ref-update statuses meaning "somebody else moved it" — the compare-and-swap losing, not an error. */
const CONFLICT_STATUS = new Set([409, 422]);

/** Blob mode for a regular file. The base holds nothing else: no symlinks, no submodules, no exec. */
export const FILE_MODE = '100644';

/**
 * Parse a `raw.githubusercontent.com` base URL into the coordinates a write needs.
 *
 * The base is DECLARED as a read locator (`…/vc-knowledge/main`, optionally with a path prefix),
 * and the push must target exactly that base and no other — deriving the repo from it, rather than
 * configuring it a second time, is what makes "you cannot read from one base and write to another"
 * true by construction instead of by discipline.
 *
 * @returns {{owner,repo,branch,prefix}|null} null when the locator is not a writable base at all
 *          (a local fixture directory, say) — which is a fact about the base, not a failure.
 */
export function coordinatesOf(locator) {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(.*))?$/i
    .exec(String(locator ?? '').replace(/\/+$/, ''));
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: m[3], prefix: (m[4] ?? '').replace(/\/+$/, '') };
}

/** Base64 both ways, explicitly, because the API speaks base64 and JS does not do it implicitly. */
export const toBase64 = (text) => Buffer.from(text, 'utf8').toString('base64');
export const fromBase64 = (b64) => Buffer.from(String(b64).replace(/\s+/g, ''), 'base64').toString('utf8');

/**
 * Build a client.
 *
 * `fetchImpl` is injectable for the same reason the reader's is, and it is not test convenience:
 * the unit tests run under a preload that replaces `fetch` with a thrower, so every path here is
 * exercised against a scripted transport — including the 422 retry, which is the one failure mode
 * that silently loses another session's work if it is wrong and therefore the one that must not be
 * tested by hoping it happens.
 */
export function githubApi({
  owner,
  repo,
  branch = 'main',
  token = null,
  fetchImpl = null,
  apiBase = 'https://api.github.com',
  timeoutMs = Number(process.env.KB_HTTP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
} = {}) {
  const root = `${String(apiBase).replace(/\/+$/, '')}/repos/${owner}/${repo}`;

  const headers = () => ({
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'vc-kb/1',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });

  /** One request, mapped onto a result. The only place in this file that touches the network. */
  const call = async (method, path, body = null) => {
    const doFetch = fetchImpl ?? globalThis.fetch;
    if (typeof doFetch !== 'function') {
      return { ok: false, reason: 'unreachable', detail: 'no fetch implementation in this runtime' };
    }
    const url = `${root}${path}`;
    let res;
    try {
      res = await doFetch(url, {
        method,
        headers: { ...headers(), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      return { ok: false, reason: 'unreachable', detail: `${err?.cause?.code ?? err?.name ?? 'error'}: ${String(err?.message ?? err).slice(0, 160)}` };
    }
    let text = '';
    try { text = await res.text(); } catch { /* an unreadable body is still a status */ }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* html error pages and empty 204s */ }

    if (res.ok) return { ok: true, status: res.status, json, text };

    // 401/403 here mean the TOKEN is the problem — not that the base is unreachable and not that
    // the queue is bad. Naming that separately is what lets the caller keep the queue and say why.
    const reason = res.status === 404 ? 'missing'
      : CONFLICT_STATUS.has(res.status) ? 'conflict'
        : res.status === 401 || res.status === 403 ? 'denied'
          : 'unreachable';
    return {
      ok: false,
      status: res.status,
      reason,
      detail: `HTTP ${res.status} ${method} ${path}${json?.message ? ` — ${json.message}` : ''}`,
      json,
    };
  };

  return {
    owner,
    repo,
    branch,
    hasToken: Boolean(token),

    /** The current head. THE READ THE PUSH IS ANCHORED TO — everything else is read at this sha. */
    getRef: async () => {
      const r = await call('GET', `/git/ref/heads/${branch}`);
      return r.ok ? { ok: true, sha: r.json?.object?.sha } : r;
    },

    getCommit: async (sha) => {
      const r = await call('GET', `/git/commits/${sha}`);
      return r.ok ? { ok: true, tree: r.json?.tree?.sha } : r;
    },

    /**
     * The whole tree in one call (measured at 0.725 s for this base, PLAN §1.9). It gives the push
     * three things at once: the blob sha of every file it must re-read, the list of log files old
     * enough to sweep, and the drift check `stat` uses. `truncated` is REPORTED and never ignored —
     * acting on a partial listing is how a retention sweep deletes the wrong thing.
     */
    getTree: async (sha) => {
      const r = await call('GET', `/git/trees/${sha}?recursive=1`);
      if (!r.ok) return r;
      return { ok: true, truncated: Boolean(r.json?.truncated), entries: r.json?.tree ?? [] };
    },

    getBlob: async (sha) => {
      const r = await call('GET', `/git/blobs/${sha}`);
      if (!r.ok) return r;
      const encoding = r.json?.encoding;
      if (encoding !== 'base64') return { ok: false, reason: 'unreachable', detail: `blob ${sha} came back as ${encoding}` };
      return { ok: true, text: fromBase64(r.json.content) };
    },

    createBlob: async (text) => {
      const r = await call('POST', '/git/blobs', { content: toBase64(text), encoding: 'base64' });
      return r.ok ? { ok: true, sha: r.json?.sha } : r;
    },

    /** `entries` are `{path, sha}` — or `{path, sha: null}`, which is how the Git Data API deletes. */
    createTree: async ({ baseTree, entries }) => {
      const r = await call('POST', '/git/trees', {
        base_tree: baseTree,
        tree: entries.map((e) => ({ path: e.path, mode: FILE_MODE, type: 'blob', sha: e.sha ?? null })),
      });
      return r.ok ? { ok: true, sha: r.json?.sha } : r;
    },

    createCommit: async ({ message, tree, parents }) => {
      const r = await call('POST', '/git/commits', { message, tree, parents });
      return r.ok ? { ok: true, sha: r.json?.sha } : r;
    },

    /**
     * The compare-and-swap. `force` is FALSE and is passed explicitly rather than omitted, because
     * this one boolean is the difference between "another session's commit is preserved and we
     * retry" and "another session's commit is gone and nobody will ever know".
     */
    updateRef: async ({ sha }) => {
      const r = await call('PATCH', `/git/refs/heads/${branch}`, { sha, force: false });
      return r.ok ? { ok: true, sha: r.json?.object?.sha } : r;
    },
  };
}
