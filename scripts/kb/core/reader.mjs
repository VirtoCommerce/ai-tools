// THE SEAM. Every read of the base goes through here and nowhere else.
//
// Two implementations will exist: the LOCAL one below (a fixture directory, used by the unit
// tests and by `--base <dir>`) and an HTTP one over raw.githubusercontent.com (PLAN §3.1),
// registered by a later session. Nothing above this file knows which it is talking to.
//
// Why a seam at all, stated plainly: without it the tests need a network, and tests that need a
// network are slow, flaky, and quietly skipped -- at which point the thing they were guarding is
// unguarded and nobody notices. The fixture is not a convenience here; it is the only shape of the
// v2 base that exists at all (v2/ does not yet exist on the remote).
//
// THE ONE RULE THIS FILE ENFORCES: a reader NEVER THROWS for a "could not read" condition, and it
// never returns an empty result for one either. It returns a discriminated result whose `reason`
// says WHICH kind of failure it was. PLAN §3.5: "I asked and nobody wrote this down" and "I could
// not ask" mean opposite things and must never look alike. A thrown error would be caught
// somewhere up the stack by a `catch` that cannot tell them apart, and the two would collapse --
// which is exactly the failure the fourth exit state exists to prevent. Making the distinction
// part of the RETURN TYPE means it cannot be lost by accident.

import { readFile } from 'node:fs/promises';
import { isAbsolute, normalize, resolve, sep } from 'node:path';

/**
 * @typedef {{ok: true, text: string}} ReadOk
 * @typedef {{ok: false, reason: 'missing'|'unreachable', detail: string}} ReadFail
 * @typedef {ReadOk|ReadFail} ReadResult
 *
 * `missing`     -- the base answered, and that file is not in it (ENOENT / HTTP 404).
 *                  For the manifest this means "the named base is not a base", which STOPS
 *                  (PLAN §12 rule 2). For an entry it means the index is ahead of `entries/`,
 *                  which is drift worth reporting, not a network problem.
 * `unreachable` -- could not ask (ETIMEDOUT, EACCES, DNS, 5xx). Never confusable with the above.
 *
 * @typedef {object} BaseReader
 * @property {string} kind      'local' | 'http' -- what `stat` prints
 * @property {string} locator   the base itself, as declared
 * @property {string} how       how this base was chosen, for `stat` (PLAN §12 rule 5)
 * @property {() => Promise<ReadResult>} readManifest   reads kb.json
 * @property {(name: string) => Promise<ReadResult>} readIndex   reads an index by manifest name
 * @property {(path: string) => Promise<ReadResult>} readEntry   reads an entry by its index `path`
 */

/** Map an fs errno onto the two reasons. Anything that is not "it isn't there" is "could not ask". */
function reasonFor(err) {
  return err?.code === 'ENOENT' || err?.code === 'ENOTDIR' ? 'missing' : 'unreachable';
}

/**
 * A relative path out of `index.json` is data, not a trusted input -- in the shipping shape it
 * arrives over the network. So it is confined to the base directory before it reaches the disk:
 * an absolute path, a drive letter or any `..` that escapes is refused as `missing` rather than
 * read. Refused and not thrown, for the same reason as everything else in this file.
 */
function confine(root, relative) {
  if (typeof relative !== 'string' || relative === '') return null;
  if (isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) return null;
  const abs = resolve(root, normalize(relative));
  const within = resolve(root) + sep;
  return abs.startsWith(within) ? abs : null;
}

/**
 * The local fixture reader: a directory laid out exactly like the `v2/` prefix -- `kb.json`,
 * the declared indexes, `entries/KB-XXXXXXXX.md`.
 */
export function localReader(dir, { how = 'declared' } = {}) {
  const root = resolve(dir);
  const read = async (relative) => {
    const abs = confine(root, relative);
    if (!abs) return { ok: false, reason: 'missing', detail: `path escapes the base: ${relative}` };
    try {
      return { ok: true, text: await readFile(abs, 'utf8') };
    } catch (err) {
      return { ok: false, reason: reasonFor(err), detail: `${err.code ?? 'EUNKNOWN'} ${relative}` };
    }
  };
  return {
    kind: 'local',
    locator: root,
    how,
    readManifest: () => read('kb.json'),
    readIndex: (name) => read(name),
    readEntry: (path) => read(path),
  };
}

// ── Choosing an implementation ────────────────────────────────────────────────────────────────
//
// A registry rather than a hardcoded `if`, so a later session adds the HTTP reader by registering
// it and touches nothing here. `createReader` on a scheme nobody has registered returns a named
// refusal instead of an obscure import failure.

/** @type {Map<string, (locator: string, opts: object) => BaseReader>} */
const FACTORIES = new Map();

/** Register a reader implementation for a URL scheme, e.g. `registerReader('https', httpReader)`. */
export function registerReader(scheme, factory) {
  FACTORIES.set(String(scheme).toLowerCase(), factory);
}

/** Which schemes currently have an implementation -- `stat` says this out loud. */
export function registeredSchemes() {
  return ['file', ...FACTORIES.keys()].sort();
}

/**
 * Build a reader for a declared base.
 *
 * Declared, never discovered (PLAN §12 rule 1): this resolves exactly the locator it is handed and
 * never searches upward, sideways or for a fallback candidate. A locator with no registered
 * implementation returns `{reader: null, why}` -- it does NOT fall through to another base, which
 * is rule 2, and which a probe pointed at a bogus base once violated by answering confidently out
 * of the real corpus.
 */
export function createReader(locator, { how = 'declared' } = {}) {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(String(locator ?? ''))?.[1]?.toLowerCase();
  if (!scheme || scheme === 'file') {
    return { reader: localReader(String(locator).replace(/^file:\/\//i, ''), { how }), why: null };
  }
  const factory = FACTORIES.get(scheme);
  if (!factory) {
    return {
      reader: null,
      why: `no reader is registered for "${scheme}://" (have: ${registeredSchemes().join(', ')})`,
    };
  }
  return { reader: factory(locator, { how }), why: null };
}
