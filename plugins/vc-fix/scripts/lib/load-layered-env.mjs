/**
 * scripts/lib/load-layered-env.mjs
 *
 * Shared layered-env loader: .env.defaults → .env.${TEST_ENV} → .env.local (override), the
 * `_${TEST_ENV.toUpperCase()}` suffix promotion, the env's files in the QA_ENV_PATH folders and, on a
 * PASSWORDS=master stand, the master password — the order is ./env-layers.mjs `layered`, byte-identical
 * with the ai-tools repo's, so this plugin and the repo load an env the same way. Extracted because this
 * ~8-line pattern had independently drifted into four copies (config.js, notify-teams.ts,
 * ensure-session.mjs, verify-access.mjs, discover-repos.mjs) — one of them (ensure-session.mjs) was missing
 * the `quiet` flag the others carried, proving the duplication was a real, not just theoretical,
 * maintenance risk.
 *
 * Validates TEST_ENV format up front, mirroring config.js: a kebab-case
 * TEST_ENV would silently build a suffix (`_CUSTOMER-STAGING-EU`) that can
 * never match a real variable name, breaking per-env overrides with no error.
 * Throws (does not process.exit) on an invalid format — callers decide
 * whether that should be a loud exit (interactive onboarding scripts) or a
 * caught, degraded warning (a best-effort notifier that must never fail the
 * run it's reporting on).
 */
import { resolveTestEnv } from "./resolve-test-env.js";
import { applyLayered } from "./env-layers.mjs";

/**
 * @param {string} [fallback]
 * @param {{ ticket?: string | null }} [options] the run's ticket for QA_ENV_PATH's `<ticket>` (default: QA_TICKET, else
 *   the session's bound run)
 * @returns {string} the resolved, validated TEST_ENV
 */
export function loadLayeredEnv(fallback = "vcst", { ticket } = {}) {
  const TEST_ENV = resolveTestEnv(fallback);
  if (!/^[a-z0-9_]+$/.test(TEST_ENV)) {
    throw new Error(
      `Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+ (use underscores, not hyphens — the _<ENV> suffix promotion depends on it).`,
    );
  }
  applyLayered(TEST_ENV, { root: process.cwd(), ticket });
  return TEST_ENV;
}
