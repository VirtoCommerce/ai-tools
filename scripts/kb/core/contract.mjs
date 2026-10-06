// The kb write contract's strings a caller prints: where it is written down, where a `deployment`
// comes from, and what a scope is made of. A module of its own so that the Stop hook (`kb-remind`) and the renderer can name them
// without loading the ranker and the vocabulary that `door-hints.mjs` needs (PR #400 review). Its one
// import, `index-load.mjs`, is the surface vocabulary itself -- never transcribed here.
import { SURFACES } from './index-load.mjs';

export const CONTRACT = '.claude/knowledge/execution/kb-capture-contract.md';

/**
 * Where a `deployment` value comes from -- said by every write that takes one (capture, confirm,
 * dispute): a confirm on `vcst` lands on a different stand than an entry on `vcst_qa`, and
 * `canonicalStand` folds spelling only, never one name onto another (PR #400 review).
 */
export const DEPLOYMENT_SOURCE = 'the stand you observed it on, spelled as the base spells it -- the `on <stand>` of an evidence '
  + 'line kb_ask / kb_show printed (vcst_qa, vcptcore_stable); not the bare TEST_ENV value (`vcst` is not `vcst_qa`)';

export const SCOPE_SOURCE = `at least one axis=value, e.g. surface=<${SURFACES.join(' | ')}>`;
