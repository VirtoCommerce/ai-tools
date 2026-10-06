// Where the kb write contract is written down -- one constant, in a module that imports nothing, so
// the Stop hook (`kb-remind`) can name it without loading the ranker and the vocabulary that
// `door-hints.mjs` needs (PR #400 review).
export const CONTRACT = '.claude/knowledge/execution/kb-capture-contract.md';
