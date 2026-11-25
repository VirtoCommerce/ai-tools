/** Type declarations for `persona-sets.mjs` — per-wave persona sets (test-data/personas/sets.json). */

export interface PersonaSets { accounts: string[]; sets: string[] }
export interface ActiveSet { set: string; release?: string; wave?: string; at?: string; defs: PersonaSets }

/** `test-data/personas/sets.json`. */
export declare const SETS_FILE: string;
export declare function loadPersonaSets(root?: string): PersonaSets;
/** `.vc-fix/session-persona/<session id>`, or null outside a Claude Code session. */
export declare function sessionSetFile(root?: string, sessionId?: string): string | null;
/** QA_PERSONA_SET, else this session's binding; null when none. Throws on an undeclared set. */
export declare function activePersonaSet(opts?: { root?: string; ambient?: Record<string, string | undefined> }): ActiveSet | null;
export declare function bindPersonaSet(root: string, set: string, meta?: { release?: string; wave?: string }): string;
export declare function clearPersonaSet(root: string): void;
/** `agent-test-wave-<set>-<local part of login>@test-agent.com`. */
export declare function cloneLogin(login: string, set: string): string;
/** The login variables the set replaces in `env`, for every listed store account. */
export declare function setLogins(store: unknown, env: string, active: ActiveSet | null): Record<string, string>;
