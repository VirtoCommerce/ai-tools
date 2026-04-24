/**
 * OAuth2 password-grant token acquisition + per-run token cache for the
 * GraphQL runner. Resolves a role alias (e.g. USER_DEFAULT) through
 * test-data/aliases.json to credentials from .env, then exchanges them for
 * an access token via POST {BACK_URL}/connect/token.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface RoleCredentials {
  role: string;
  email: string;
  password: string;
  storeId?: string;
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
    | { _inline?: boolean; email_env?: string; password_env?: string; store_id?: string }
    | undefined;

  if (entry?._inline && entry.email_env && entry.password_env) {
    const email = process.env[entry.email_env];
    const password = process.env[entry.password_env];
    if (!email || !password) {
      throw new Error(
        `Role "${role}" expects env vars ${entry.email_env}/${entry.password_env}, but they are not set`
      );
    }
    return {
      role,
      email,
      password,
      storeId: entry.store_id || process.env.STORE_ID,
    };
  }

  // Fallback: direct env var pattern
  const emailKey = `${role.toUpperCase()}_EMAIL`;
  const pwdKey = `${role.toUpperCase()}_PASSWORD`;
  const email = process.env[emailKey];
  const password = process.env[pwdKey];

  if (!email || !password) {
    throw new Error(
      `Cannot resolve role "${role}": no alias in aliases.json and no ${emailKey}/${pwdKey} in .env`
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
