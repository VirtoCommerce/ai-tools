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
import { join } from "node:path";
import { envDir, resolveTestEnv } from "./resolve-test-env.js";

/** Token env vars that belong in vc-secrets, never in a file (VCST-6402). */
export const TOKEN_KEYS = ["GITHUB_FIX_BUGS_TOKEN", "GITHUB_TOKEN", "ADO_PAT", "JIRA_API_TOKEN"];

let warnedPlaintext = false;

/** The token keys (or their _<ENV>-suffixed spellings) a parsed .env file holds a value for. */
export function plaintextTokenKeys(parsed) {
  const keys = Object.entries(parsed || {}).filter(([, v]) => String(v ?? "").trim() !== "").map(([k]) => k);
  return TOKEN_KEYS.filter((t) => keys.some((k) => k === t || k.startsWith(`${t}_`)));
}

/** @param {string} [fallback] @returns {string} the resolved, validated TEST_ENV */
export function loadLayeredEnv(fallback = "vcst") {
  const TEST_ENV = resolveTestEnv(fallback);
  if (!/^[a-z0-9_]+$/.test(TEST_ENV)) {
    throw new Error(
      `Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+ (use underscores, not hyphens — the _<ENV> suffix promotion depends on it).`,
    );
  }
  // Under the $VC_RUN bridge (VCST-6402) the tokens arrive from vc-secrets in the environment. The
  // files below load with override:true, so a stale plaintext token left in .env.local would
  // silently WIN over the one the operator stored in vc-secrets — snapshot the injected ones and put
  // them back after every layer (and after the _<ENV> promotion, which can override too).
  // The same holds for the test-user passwords the `vc-init-onboard.<env>` task injects (option B).
  const injected = process.env.VC_BRIDGE === "1"
    ? Object.fromEntries(Object.keys(process.env).filter((k) => (TOKEN_KEYS.includes(k) || /^[A-Z][A-Z0-9_]*PASSWORD$/.test(k)) && process.env[k]).map((k) => [k, process.env[k]]))
    : {};
  // Under the bridge the files come from the trusted project, not the cwd (resolve-test-env.js envDir).
  const dir = envDir();
  dotenv({ path: join(dir, ".env.defaults"), quiet: true });
  dotenv({ path: join(dir, `.env.${TEST_ENV}`), override: true, quiet: true });
  const local = dotenv({ path: join(dir, ".env.local"), override: true, quiet: true });
  const SUFFIX = `_${TEST_ENV.toUpperCase()}`;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith(SUFFIX) && value) process.env[key.slice(0, -SUFFIX.length)] = value;
  }
  Object.assign(process.env, injected);
  const plaintext = plaintextTokenKeys(local.parsed);
  if (plaintext.length && !warnedPlaintext) {
    warnedPlaintext = true;
    process.stderr.write(`[env] ⚠ .env.local holds ${plaintext.join(", ")} in plaintext — tokens live in vc-secrets now; run /project-init --check to move them there and strip the file
`);
  }
  return TEST_ENV;
}
