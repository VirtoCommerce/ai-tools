/**
 * Type declarations for `user-roles.mjs` — the canonical test-user ROLE registry.
 * Same pattern as `project-profile.d.mts`: the implementation stays plain ESM JS
 * (it is imported by .mjs seeders), this file gives TS consumers real types.
 */

export interface UserRole {
  /** Registry key, e.g. "USER", "ORG_USER", "ADMIN". */
  key: string;
  /** Env var names tried in order for the login/email. */
  emailVars: string[];
  /** Env var name holding the password (secret — `.env.local` only). */
  passwordVar: string;
  /** Optional env var holding the platform user id. */
  idVar?: string;
  kind: "admin" | "customer" | "org" | string;
  required: boolean;
  purpose: string;
  group?: string;
  currency?: string;
  provision?: boolean;
}

export interface ResolvedRole {
  key: string;
  kind: string;
  required: boolean;
  purpose: string;
  group: string | null;
  currency: string | null;
  provision: boolean;
  /** Resolved login, or null when no candidate env var is set. */
  email: string | null;
  /** Resolved password, or null when the secret env var is unset. */
  password: string | null;
  id: string | null;
  emailVar: string | null;
  /** True when both email and password resolved. */
  present: boolean;
  /** Env var names that failed to resolve. */
  missing: string[];
}

export declare const USER_ROLES: UserRole[];
export declare function resolveRole(role: UserRole, env?: NodeJS.ProcessEnv): ResolvedRole;
export declare function resolveAllRoles(env?: NodeJS.ProcessEnv): ResolvedRole[];
export declare function roleByKey(key: string): UserRole | undefined;
