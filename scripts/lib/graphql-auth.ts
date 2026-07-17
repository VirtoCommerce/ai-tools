/**
 * OAuth2 password-grant token acquisition + per-run token cache for the
 * GraphQL runner. Resolves a role alias (e.g. USER_DEFAULT) through
 * test-data/aliases.json to credentials from .env, then exchanges them for
 * an access token via POST {BACK_URL}/connect/token.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { TestDataResolver } from "./test-data-resolver.js";

export interface RoleCredentials {
  role: string;
  email: string;
  password: string;
  storeId?: string;
  /**
   * Optional organization context for the password grant (snake_case
   * `organization_id` on the token request). Needed for a multi-org user whose
   * DEFAULT org would otherwise be picked — e.g. a sales rep whose default org
   * membership is locked must sign in under an UNLOCKED served org.
   */
  organizationId?: string;
}

export interface TokenEntry {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  acquiredAt: number;
}

export interface AuthOptions {
  backUrl: string;
  storeId?: string;
  scope?: string; // default: offline_access
}

const TOKEN_REFRESH_BUFFER_MS = 30_000;

/**
 * Expands `{{VAR}}` tokens in a CSV-resolved credential to its env value.
 * Committed test-data CSVs store passwords as `{{VAR}}` tokens (never literals —
 * see .claude/rules/test-data.md), so `@td()` resolution yields the token string,
 * not the secret. Without this, the CSV-backed `@td` path in resolveRole() returned
 * the literal `{{B2B_USER_PASSWORD}}` and every b2b/users.csv-backed role login failed.
 * Mirrors the seeders' per-env suffix promotion (`VAR`, then `VAR_<TEST_ENV>`); throws
 * a clear error if the referenced var is unset (was a silent login_failed).
 */
function expandEnvTokens(value: string, role: string): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const env = (process.env.TEST_ENV || "").toUpperCase();
    const v =
      process.env[name] ?? (env ? process.env[`${name}_${env}`] : undefined);
    if (v === undefined || v === "") {
      throw new Error(
        `Role "${role}" credential references {{${name}}} but neither ${name} nor ${name}_${env} is set in .env`
      );
    }
    return v;
  });
}

/**
 * Resolves a role alias (e.g. "USER_DEFAULT") to concrete credentials.
 * Supports the inline alias form used in test-data/aliases.json:
 *   { "_inline": true, "email_env": "USER_EMAIL", "password_env": "USER_PASSWORD" }
 *
 * Falls back to direct env var lookup by uppercased role name:
 *   "CUSTOMER" → CUSTOMER_EMAIL / CUSTOMER_PASSWORD
 *   "ADMIN" → ADMIN_EMAIL / ADMIN_PASSWORD
 */
export function resolveRole(
  role: string,
  testDataDir: string
): RoleCredentials {
  const aliasPath = join(testDataDir, "aliases.json");
  let aliases: Record<string, unknown> = {};

  if (existsSync(aliasPath)) {
    try {
      aliases = JSON.parse(readFileSync(aliasPath, "utf-8"));
    } catch {
      // fall through to direct env lookup
    }
  }

  const entry = aliases[role] as
    | { _inline?: boolean; email_env?: string; password_env?: string; store_id?: string; organization_id?: string }
    | undefined;

  if (entry?._inline && entry.email_env && entry.password_env) {
    const email = process.env[entry.email_env];
    const password = process.env[entry.password_env];
    if (!email || !password) {
      throw new Error(
        `Role "${role}" expects env vars ${entry.email_env}/${entry.password_env}, but they are not set`
      );
    }
    // organization_id may be a literal GUID or an @td() token — resolve the token form.
    let organizationId = entry.organization_id;
    if (organizationId && /^@td\(/.test(organizationId)) {
      try {
        const resolver = new TestDataResolver(testDataDir);
        const v = resolver.resolve(organizationId);
        if (v && v !== organizationId) organizationId = v;
      } catch { /* leave as-is; token request will send the literal */ }
    }
    return {
      role,
      email,
      password,
      storeId: entry.store_id || process.env.STORE_ID,
      organizationId,
    };
  }

  // CSV-backed or direct-field alias (e.g. TECHFLOW_ADMIN → b2b/users.csv, or an
  // _inline alias carrying literal `email`/`password`): resolve via the @td() resolver.
  if (entry) {
    let emailRaw = "";
    let passwordRaw = "";
    let sidRaw = "";
    try {
      const resolver = new TestDataResolver(testDataDir);
      emailRaw = resolver.resolve(`@td(${role}.email)`);
      passwordRaw = resolver.resolve(`@td(${role}.password)`);
      sidRaw = resolver.resolve(`@td(${role}.store_id)`);
    } catch {
      // resolver/alias error → fall through to the env-var pattern below
    }
    // resolve() passes unresolved tokens through unchanged — treat that as "not found".
    const resolved = (v: string, token: string) => !!v && v !== token;
    if (
      resolved(emailRaw, `@td(${role}.email)`) &&
      resolved(passwordRaw, `@td(${role}.password)`)
    ) {
      // Committed CSVs carry `{{VAR}}` password tokens — expand to the env secret.
      const email = expandEnvTokens(emailRaw, role);
      const password = expandEnvTokens(passwordRaw, role);
      const storeId = resolved(sidRaw, `@td(${role}.store_id)`)
        ? sidRaw
        : process.env.STORE_ID;
      return { role, email, password, storeId };
    }
  }

  // Fallback: direct env var pattern
  const emailKey = `${role.toUpperCase()}_EMAIL`;
  const pwdKey = `${role.toUpperCase()}_PASSWORD`;
  const email = process.env[emailKey];
  const password = process.env[pwdKey];

  if (!email || !password) {
    throw new Error(
      `Cannot resolve role "${role}": no _inline email_env alias, no @td(${role}.email/.password) alias field, and no ${emailKey}/${pwdKey} in .env`
    );
  }

  return { role, email, password, storeId: process.env.STORE_ID };
}

/**
 * Exchanges password-grant credentials for an access token.
 * POST {backUrl}/connect/token with application/x-www-form-urlencoded body.
 */
export async function acquireToken(
  creds: RoleCredentials,
  opts: AuthOptions
): Promise<TokenEntry> {
  const url = `${opts.backUrl.replace(/\/$/, "")}/connect/token`;
  const body = new URLSearchParams({
    grant_type: "password",
    scope: opts.scope || "offline_access",
    username: creds.email,
    password: creds.password,
  });

  if (opts.storeId || creds.storeId) {
    body.set("storeId", opts.storeId || creds.storeId!);
  }

  // Org-scoped grant (snake_case) — sign in under a specific org context.
  if (creds.organizationId) {
    body.set("organization_id", creds.organizationId);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Token acquisition failed for role="${creds.role}" — HTTP ${res.status} at ${url}: ${text.slice(0, 200)}`
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!json.access_token) {
    throw new Error(
      `Token response for role="${creds.role}" has no access_token: ${JSON.stringify(json).slice(0, 200)}`
    );
  }

  const now = Date.now();
  const ttlMs = (json.expires_in ?? 3600) * 1000;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    acquiredAt: now,
    expiresAt: now + ttlMs,
  };
}

/**
 * Per-run in-memory token cache. Returns a cached token if still valid
 * (minus a 30s buffer), otherwise acquires a fresh one.
 */
export class TokenCache {
  private cache = new Map<string, TokenEntry>();

  constructor(
    private readonly testDataDir: string,
    private readonly opts: AuthOptions
  ) {}

  async getToken(role: string): Promise<string> {
    const entry = this.cache.get(role);
    if (entry && entry.expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
      return entry.accessToken;
    }

    const creds = resolveRole(role, this.testDataDir);
    const fresh = await acquireToken(creds, this.opts);
    this.cache.set(role, fresh);
    return fresh.accessToken;
  }

  /** Invalidate a cached token (e.g. on 401 response). */
  invalidate(role: string): void {
    this.cache.delete(role);
  }

  /** Returns metadata for evidence reporting (no raw tokens). */
  summary(): Array<{ role: string; acquiredAt: number; expiresAt: number }> {
    return Array.from(this.cache.entries()).map(([role, entry]) => ({
      role,
      acquiredAt: entry.acquiredAt,
      expiresAt: entry.expiresAt,
    }));
  }
}
