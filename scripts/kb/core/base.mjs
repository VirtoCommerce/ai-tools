// Where the base is, and how we came to think so.
//
// Three rules carried over from the prior art without re-litigating, because each cost a real
// mistake to learn (PLAN §12):
//
//   1. THE BASE IS DECLARED, NEVER DISCOVERED. Two earlier versions searched for it and both could
//      answer out of a corpus nobody had named. Here it is a flag, an env var, or the declared
//      default -- there is no search, no walk up the tree, no "look for a kb.json nearby".
//   2. A NAMED BASE THAT TURNS OUT NOT TO BE A BASE STOPS. It does not fall through to another
//      candidate. A probe pointed at a bogus base once answered confidently out of the real corpus,
//      which is the worst possible failure: a confident answer from somewhere nobody asked about.
//   3. `stat` NAMES THE BASE AND HOW IT WAS CHOSEN. Both, always -- knowing which base answered is
//      half the question, and the other half is why that one.

import { httpReader } from './http-reader.mjs';
import { createReader, registerReader } from './reader.mjs';

// Registered HERE rather than in the CLI, because every door onto the base -- the CLI, the MCP
// server, the tests that call the verbs directly -- goes through `openBase`. Registering it at the
// door instead would give one caller a working default base and the next caller exit 2 on the same
// locator, which is a difference no user could account for. Importing this module touches no
// network: it only defines the factory.
registerReader('https', (locator, opts) => httpReader(locator, opts));

/**
 * The declared default: the root of the public `VirtoCommerce/vc-knowledge` repo, read through
 * `raw` (PLAN §2, §3.1). It is a constant and not a discovery.
 *
 * It named the `v2/` prefix until 2026-09-18, when that base stopped sharing the repository with
 * the older corpus it had been kept apart from and was lifted to the root. **Nothing but this line
 * changed.** The prefix was only ever part of the LOCATOR: `coordinatesOf()` parses it out, every
 * writer composes paths through `full()`, and `outsideBase()` / `expiredLogs()` take it as a
 * parameter that already defaulted to empty — so an index row's `path` was always `entries/…`,
 * relative and prefix-free, and no stored bytes had to be rewritten.
 */
export const DEFAULT_BASE = 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main';

/**
 * Resolve the base from the precedence chain, most explicit first, and say which link won.
 *
 * @param {{baseArg?: string|null, env?: Record<string,string|undefined>}} opts
 * @returns {{locator: string, how: string, source: 'flag'|'env'|'default'}}
 */
export function resolveBase({ baseArg = null, env = process.env } = {}) {
  if (baseArg) return { locator: baseArg, how: '--base on the command line', source: 'flag' };
  const fromEnv = env.KB_BASE?.trim();
  if (fromEnv) return { locator: fromEnv, how: 'KB_BASE in the environment', source: 'env' };
  return { locator: DEFAULT_BASE, how: 'the declared default base', source: 'default' };
}

/**
 * Resolve, then build a reader for it.
 *
 * Returns `{reader: null, why}` when the locator has no implementation -- the caller turns that
 * into exit 2 (no base configured) and stops. It never tries a second locator.
 */
export function openBase({ baseArg = null, env = process.env } = {}) {
  const chosen = resolveBase({ baseArg, env });
  const { reader, why } = createReader(chosen.locator, { how: chosen.how });
  return { ...chosen, reader, why };
}
