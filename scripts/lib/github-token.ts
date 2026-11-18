/**
 * github-token — the operator's own secrets a script needs (GitHub tokens, the Jira identity a Jira token pairs with),
 * read the one way every such script shares: bundle:check, release:diff and the hotfix scripts.
 *
 *   the process environment → .env.local → .env.defaults   (first found wins; in each, NAME_<ENV> beats NAME)
 *
 * Deliberately NOT the env loader's full layering: a committed `.env.<env>` holds someone else's JIRA_EMAIL (it would
 * pair with this operator's .env.local token → 401), and the test-account store has nothing a token reader needs, so
 * a broken store must not stop a GitHub call. The `_<ENV>` pin is the loader's (resolve-test-env.js): by default for
 * the env TEST_ENV or the session selects; `pinEnv` names another (null: no pin) for a script that acts on a stand
 * other than the session's — the hotfix scripts, which deliver to stable / regression whatever the session is bound to.
 * Nothing is written into process.env unless the caller does it.
 */
import { join } from "node:path";
import { readEnvFile } from "./env-layers.mjs";
import { envSuffix, testEnvChoice } from "./resolve-test-env.js";

const NAMES = ["GIT_TOKEN", "GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"] as const;

/** Each of `names` as the operator set it, or undefined. `pinEnv`: undefined = the session's env, null = no `_<ENV>` pin. */
export function loadOperatorSecrets(root: string, names: readonly string[], ambient: Record<string, string | undefined> = process.env, pinEnv?: string | null): Record<string, string | undefined> {
  const env = pinEnv === undefined ? ambient.TEST_ENV?.trim() || testEnvChoice("vcst").env : pinEnv;
  const suffix = env ? envSuffix(env) : null;
  const layers = [ambient, readEnvFile(join(root, ".env.local")) ?? {}, readEnvFile(join(root, ".env.defaults")) ?? {}];
  return Object.fromEntries(names.map((k) => [k, layers.map((l) => (suffix ? l[k + suffix] : undefined) || l[k]).find(Boolean)]));
}

/** Fill `names` into process.env where unset — for a script that reads them from process.env further on. */
export function applyOperatorSecrets(root: string, names: readonly string[], pinEnv?: string | null): void {
  for (const [k, v] of Object.entries(loadOperatorSecrets(root, names, process.env, pinEnv))) if (v && !process.env[k]) process.env[k] = v;
}

/** The first GitHub token set: GIT_TOKEN, GITHUB_TOKEN, GITHUB_PERSONAL_ACCESS_TOKEN. */
export function loadGithubToken(root: string, ambient: Record<string, string | undefined> = process.env): string | undefined {
  const s = loadOperatorSecrets(root, NAMES, ambient);
  return NAMES.map((k) => s[k]).find(Boolean);
}
