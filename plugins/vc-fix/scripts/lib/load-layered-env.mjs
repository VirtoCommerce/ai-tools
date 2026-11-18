/**
 * scripts/lib/load-layered-env.mjs — a plugin's ONE way to load an env into process.env.
 *
 * The layers themselves are ./env-layers.mjs `layered`: .env.defaults → .env.${TEST_ENV} → .env.local, the `_<ENV>` suffix promotion,
 * the env's files in the QA_ENV_PATH folders, the test-account store (test-accounts.local.json, ./test-accounts.mjs —
 * it beats every file; a malformed one throws its StoreError; an unmigrated project's legacy password files are read
 * below it) and, on a PASSWORDS=master stand, the master password.
 *
 * What this wrapper adds to the layers, and only this:
 *   - TEST_ENV is resolved (./resolve-test-env.js) and its format validated — a kebab-case TEST_ENV would build a
 *     suffix (`_CUSTOMER-STAGING-EU`) no variable can carry. Throws (never process.exit): the caller decides between
 *     a loud exit (onboarding) and a degraded warning (a notifier that must never fail the run it reports on).
 *   - Under the $VC_RUN bridge (VC_BRIDGE=1) the files come from the trusted project (envDir), and the values the
 *     bridge injected from vc-secrets — the tokens, and the test-user passwords of the env it injected them for — are
 *     put back after the layers: every file layer beats the environment, so a stale plaintext copy in .env.local must
 *     never win over the stored one.
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

/**
 * The values the $VC_RUN bridge injected from vc-secrets; none outside the bridge. Only the names the bridge lists
 * (VC_BRIDGE_SECRETS), and a password only when this is the env it was injected for (VC_BRIDGE_ENV): anything else
 * in the environment — a value an earlier load wrote, one inherited by a child that switched env — is the layers'.
 */
function bridgeInjected(testEnv) {
  if (process.env.VC_BRIDGE !== "1") return {};
  // A bridge older than VC_BRIDGE_SECRETS lists nothing: its tokens are still put back, its passwords are not.
  const raw = process.env.VC_BRIDGE_SECRETS;
  const listed = raw === undefined ? null : new Set(raw.split(",").filter(Boolean));
  const forThisEnv = process.env.VC_BRIDGE_ENV === testEnv;
  const injected = (k) => TOKEN_KEYS.includes(k)
    ? (!listed || listed.has(k))
    : (!!listed?.has(k) && forThisEnv && /^[A-Z][A-Z0-9_]*PASSWORD$/.test(k));
  return Object.fromEntries(Object.keys(process.env).filter((k) => injected(k) && process.env[k]).map((k) => [k, process.env[k]]));
}

/**
 * @param {string} [fallback]
 * @param {{ ticket?: string | null }} [options] the run's ticket for QA_ENV_PATH's `<ticket>` (default: QA_TICKET, else
 *   the session's bound run)
 * @returns {string} the resolved, validated TEST_ENV
 */
export function loadLayeredEnv(fallback = "vcst", options = {}) {
  return loadLayered(fallback, options).testEnv;
}

/**
 * loadLayeredEnv, returning also what the layers gave (`layers`: env-layers' `layered` result) and the names the bridge
 * put back over them (`injected`) — for a caller that reports where each value came from (env:check).
 */
export function loadLayered(fallback = "vcst", { ticket } = {}) {
  const TEST_ENV = resolveTestEnv(fallback);
  if (!TEST_ENV_PATTERN.test(TEST_ENV)) {
    throw new Error(
      `Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+ (use underscores, not hyphens — the _<ENV> suffix promotion depends on it).`,
    );
  }
  const injected = bridgeInjected(TEST_ENV);
  const root = resolve(envDir());
  // `legacy`: a client project may not have migrated yet — its old password files are read below the store.
  const layers = applyLayered(TEST_ENV, { root, ticket, legacy: true, migrateHint: "`/project-init --check` moves them" });
  Object.assign(process.env, injected);
  const plaintext = plaintextTokenKeys(readEnvFile(join(root, ".env.local")));
  if (plaintext.length && !warnedPlaintext) {
    warnedPlaintext = true;
    process.stderr.write(`[env] ⚠ .env.local holds ${plaintext.join(", ")} in plaintext — tokens live in vc-secrets now; run /project-init --check to move them there and strip the file\n`);
  }
  return { testEnv: TEST_ENV, layers, injected: new Set(Object.keys(injected)) };
}
