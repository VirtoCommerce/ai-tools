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
import { join, resolve } from "node:path";
import { envDir, resolveTestEnv } from "./resolve-test-env.js";
import { applyLayered, readEnvFile } from "./env-layers.mjs";

/** Token env vars that belong in vc-secrets, never in a file (VCST-6402). */
export const TOKEN_KEYS = ["GITHUB_FIX_BUGS_TOKEN", "ADO_PAT", "JIRA_API_TOKEN"];

let warnedPlaintext = false;

/** The token keys (or their _<ENV>-suffixed spellings) a parsed .env file holds a value for. */
export function plaintextTokenKeys(parsed) {
  const keys = Object.entries(parsed || {}).filter(([, v]) => String(v ?? "").trim() !== "").map(([k]) => k);
  return TOKEN_KEYS.filter((t) => keys.some((k) => k === t || k.startsWith(`${t}_`)));
}

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
  // Under the $VC_RUN bridge (VCST-6402) the tokens arrive from vc-secrets in the environment. Every file
  // layer beats the environment, so a stale plaintext token left in .env.local (or in a QA_ENV_PATH file)
  // would silently WIN over the one the operator stored in vc-secrets — snapshot the injected ones and put
  // them back after the layers (and after the _<ENV> promotion, which can override too).
  const injected = process.env.VC_BRIDGE === "1"
    ? Object.fromEntries(TOKEN_KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
    : {};
  // Under the bridge the files come from the trusted project, not the cwd (resolve-test-env.js envDir) — the
  // QA_ENV_PATH folders too, since `layered` reads them from that root's .env.local.
  const root = resolve(envDir());
  applyLayered(TEST_ENV, { root, ticket });
  Object.assign(process.env, injected);
  const plaintext = plaintextTokenKeys(readEnvFile(join(root, ".env.local")));
  if (plaintext.length && !warnedPlaintext) {
    warnedPlaintext = true;
    process.stderr.write(`[env] ⚠ .env.local holds ${plaintext.join(", ")} in plaintext — tokens live in vc-secrets now; run /project-init --check to move them there and strip the file
`);
  }
  return TEST_ENV;
}
