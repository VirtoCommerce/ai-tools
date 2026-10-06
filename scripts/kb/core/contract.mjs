// The kb write contract's two strings a caller prints: where it is written down, and what a scope
// is made of. A module of its own so that the Stop hook (`kb-remind`) and the renderer can name them
// without loading the ranker and the vocabulary that `door-hints.mjs` needs (PR #400 review). Its one
// import, `index-load.mjs`, is the surface vocabulary itself -- never transcribed here.
import { SURFACES } from './index-load.mjs';

export const CONTRACT = '.claude/knowledge/execution/kb-capture-contract.md';

export const SCOPE_SOURCE = `at least one axis=value, e.g. surface=<${SURFACES.join(' | ')}>`;
