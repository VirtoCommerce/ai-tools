/**
 * scripts/lib/load-layered-env.mjs — a plugin's ONE way to load an env into process.env.
 *
 * Byte-identical in plugins/vc-fix, plugins/vc-test and plugins/vc-init: edit it in plugins/vc-fix and run
 * `npm run env:sync` in the ai-tools repo (`env:sync:check` fails a copy that drifted). The layers themselves are
 * ./env-layers.mjs `layered` — the same file, byte-identical, the ai-tools repo loads with — so a plugin and the
 * repo load an env the same way: .env.defaults → .env.${TEST_ENV} → .env.local, the `_<ENV>` suffix promotion,
 * the env's files in the QA_ENV_PATH folders, the test-account store (test-accounts.local.json, ./test-accounts.mjs —
 * it beats every file; a malformed one throws its StoreError; an unmigrated project's legacy password files are read
 * below it) and, on a PASSWORDS=master stand, the master password.
 *
 * What this wrapper adds to the layers, and only this:
 *   - TEST_ENV is resolved (./resolve-test-env.js) and its format validated — a kebab-case TEST_ENV would build a
 *     suffix (`_CUSTOMER-STAGING-EU`) no variable can carry. Throws (never process.exit): the caller decides between
 *     a loud exit (onboarding) and a degraded warning (a notifier that must never fail the run it reports on).
 *   - Under the $VC_RUN bridge (VC_BRIDGE=1) the files come from the trusted project (envDir), and the values the
 *     bridge injected from vc-secrets — tokens and test-user passwords — are put back after the layers: every file
 *     layer beats the environment, so a stale plaintext copy in .env.local must never win over the stored one.
 *   - A token still in .env.local in plaintext is named once per process.
 */
import { join, resolve } from "node:path";
import { TEST_ENV_PATTERN, envDir, resolveTestEnv } from "./resolve-test-env.js";
import { applyLayered, readEnvFile } from "./env-layers.mjs";

/** Token env vars that belong in vc-secrets, never in a file (VCST-6402). */
export const TOKEN_KEYS = ["GITHUB_FIX_BUGS_TOKEN", "GITHUB_TOKEN", "ADO_PAT", "JIRA_API_TOKEN"];

let warnedPlaintext = false;

/** The token keys (or their _<ENV>-suffixed spellings) a parsed .env file holds a value for. */
export function plaintextTokenKeys(parsed) {
  const keys = Object.entries(parsed || {}).filter(([, v]) => String(v ?? "").trim() !== "").map(([k]) => k);
  return TOKEN_KEYS.filter((t) => keys.some((k) => k === t || k.startsWith(`${t}_`)));
}

/** The values the $VC_RUN bridge injected from vc-secrets (tokens, test-user passwords); none outside the bridge. */
function bridgeInjected() {
  if (process.env.VC_BRIDGE !== "1") return {};
  const injected = (k) => TOKEN_KEYS.includes(k) || /^[A-Z][A-Z0-9_]*PASSWORD$/.test(k);
  return Object.fromEntries(Object.keys(process.env).filter((k) => injected(k) && process.env[k]).map((k) => [k, process.env[k]]));
}

/**
 * @param {string} [fallback]
 * @param {{ ticket?: string | null }} [options] the run's ticket for QA_ENV_PATH's `<ticket>` (default: QA_TICKET, else
 *   the session's bound run)
 * @returns {string} the resolved, validated TEST_ENV
 */
export function loadLayeredEnv(fallback = "vcst", { ticket } = {}) {
  const TEST_ENV = resolveTestEnv(fallback);
  if (!TEST_ENV_PATTERN.test(TEST_ENV)) {
    throw new Error(
      `Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+ (use underscores, not hyphens — the _<ENV> suffix promotion depends on it).`,
    );
  }
  const injected = bridgeInjected();
  const root = resolve(envDir());
  applyLayered(TEST_ENV, { root, ticket });
  Object.assign(process.env, injected);
  const plaintext = plaintextTokenKeys(readEnvFile(join(root, ".env.local")));
  if (plaintext.length && !warnedPlaintext) {
    warnedPlaintext = true;
    process.stderr.write(`[env] ⚠ .env.local holds ${plaintext.join(", ")} in plaintext — tokens live in vc-secrets now; run /project-init --check to move them there and strip the file\n`);
  }
  return TEST_ENV;
}
