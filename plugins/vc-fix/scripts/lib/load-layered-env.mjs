/**
 * scripts/lib/load-layered-env.mjs
 *
 * Shared layered-env loader: .env.defaults → .env.${TEST_ENV} → .env.local
 * (override), plus the `_${TEST_ENV.toUpperCase()}` suffix-promotion config.js
 * also performs. Extracted because this ~8-line pattern had independently
 * drifted into four copies (config.js, notify-teams.ts, ensure-session.mjs,
 * verify-access.mjs, discover-repos.mjs) — one of them (ensure-session.mjs)
 * was missing the `quiet` flag the others carried, proving the duplication
 * was a real, not just theoretical, maintenance risk.
 *
 * Validates TEST_ENV format up front, mirroring config.js: a kebab-case
 * TEST_ENV would silently build a suffix (`_CUSTOMER-STAGING-EU`) that can
 * never match a real variable name, breaking per-env overrides with no error.
 * Throws (does not process.exit) on an invalid format — callers decide
 * whether that should be a loud exit (interactive onboarding scripts) or a
 * caught, degraded warning (a best-effort notifier that must never fail the
 * run it's reporting on).
 */
import { config as dotenv } from "dotenv";
import { resolveTestEnv } from "./resolve-test-env.js";

/** @param {string} [fallback] @returns {string} the resolved, validated TEST_ENV */
export function loadLayeredEnv(fallback = "vcst") {
  const TEST_ENV = resolveTestEnv(fallback);
  if (!/^[a-z0-9_]+$/.test(TEST_ENV)) {
    throw new Error(
      `Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+ (use underscores, not hyphens — the _<ENV> suffix promotion depends on it).`,
    );
  }
  dotenv({ path: ".env.defaults", quiet: true });
  dotenv({ path: `.env.${TEST_ENV}`, override: true, quiet: true });
  dotenv({ path: ".env.local", override: true, quiet: true });
  const SUFFIX = `_${TEST_ENV.toUpperCase()}`;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith(SUFFIX) && value) process.env[key.slice(0, -SUFFIX.length)] = value;
  }
  return TEST_ENV;
}
