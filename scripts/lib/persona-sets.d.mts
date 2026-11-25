/** Type declarations for `persona-sets.mjs` — per-wave persona sets (test-data/personas/sets.json). */

export interface PersonaSets { personas: string[]; sets: string[] }

/** `test-data/personas/sets.json`. */
export declare const SETS_FILE: string;
/** `persona-set.json` — the set a run folder was planned with. */
export declare const RUN_SET_FILE: string;

export declare function loadPersonaSets(root?: string): PersonaSets;
/** `<ALIAS>_<SET>`. */
export declare function cloneAlias(alias: string, set: string): string;
/** QA_PERSONA_SET, else the run folder's persona-set.json; null = the shared personas. */
export declare function activeSet(opts?: { env?: Record<string, string | undefined>; runDir?: string | null }): string | null;
/** Throws on a set sets.json does not declare. */
export declare function assertSet(set: string | null, defs: PersonaSets): void;
export declare function mapAlias(alias: string, set: string | null, defs: PersonaSets): string;
/** Rewrites [PRE:SIGNIN_AS|SWITCH_ORG|VERIFY_AUTH:X], [AUTH role=X] and @td(X.…) for the set. */
export declare function rewriteForSet(text: string, set: string | null, defs: PersonaSets): string;
