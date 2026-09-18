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

import { createReader } from './reader.mjs';

/**
 * The declared default: the `v2/` prefix of the public `VirtoCommerce/vc-knowledge` repo, read
 * through `raw` (PLAN §2, §3.1). It is a constant and not a discovery; it is also not reachable by
 * anything in this session, because no `https` reader is registered yet -- which surfaces as a
 * named refusal rather than a silent fallback, per rule 2.
 */
export const DEFAULT_BASE = 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main/v2';

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
