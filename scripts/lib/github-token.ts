/**
 * github-token — the GitHub token a read-only GitHub script uses, read from the project's env files.
 *
 * For scripts that must NOT import config.js (its validator exits on test-only variables they do not need):
 * `bundle:check` and `release:diff`. Both used to carry their own copy of this loop, and both read the files
 * first-wins — so `.env.defaults` beat `.env.local`, the reverse of the documented order. One copy, the right order:
 *
 *   .env.defaults → .env.${TEST_ENV} (when TEST_ENV is set) → .env.local   (later wins)
 *
 * What the process environment already holds beats every file (CI passes GIT_TOKEN with `-e`). Nothing is written
 * into process.env.
 */
import { join } from "node:path";
import { readEnvFile } from "./env-layers.mjs";

const NAMES = ["GIT_TOKEN", "GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"] as const;

export function loadGithubToken(root: string, ambient: Record<string, string | undefined> = process.env): string | undefined {
  const files = [".env.defaults", ...(ambient.TEST_ENV ? [`.env.${ambient.TEST_ENV}`] : []), ".env.local"];
  const fromFiles: Record<string, string> = {};
  for (const f of files) Object.assign(fromFiles, readEnvFile(join(root, f)) ?? {});
  const value = (k: string) => ambient[k] || fromFiles[k];
  for (const k of NAMES) if (value(k)) return value(k);
  return undefined;
}
