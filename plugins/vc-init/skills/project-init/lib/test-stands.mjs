/**
 * skills/project-init/lib/test-stands.mjs — declare the test-data answer to vc-test, so a host-governed
 * project needs no /vc-test:init for it.
 *
 * vc-test decides per run whether it may write (`plugins/vc-test/lib/capabilities.mjs` standOf): the env is in
 * `test.environments` with `writable: true`, the BACK_URL loaded is the `backUrl` recorded there, and
 * `governance.stand.writable` is not false. /vc-test:init writes that block from a second question; on a
 * host-governed project vc-init already asked it (`governance.stand.envs`, host-governed.md step 3), so it
 * writes the per-env declarations itself, in the shape vc-test's init-plan writes them:
 *   test.environments.<env> = { ...what is there, writable: <its host env is in stand.envs>, backUrl }
 * Every other key of the `test` block (knowledge store, routing, budget) stays vc-test's and is not touched;
 * a later /vc-test:init may still change any of it. A project with no host, or a host never asked
 * (`stand.envs: null`), gets nothing written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readKey } from "./project-env.mjs";
import { ourEnvs } from "./test-env-selector.mjs";

/** `{ <env>: <BACK_URL of its .env.<env>> }` for every env this project defines. Reads files. */
export function envBackUrls(root) {
  const out = {};
  for (const env of ourEnvs(root)) {
    try { out[env] = readKey(readFileSync(join(root, `.env.${env}`), "utf-8"), "BACK_URL") || ""; } catch { out[env] = ""; }
  }
  return out;
}

/**
 * The `test.environments` map that declares the answer, merged over `current`; null when there is no
 * answer to declare. An env is writable when its host env (governance.envs maps a renamed one) is in
 * stand.envs and its `.env.<env>` names a BACK_URL — without one, vc-test could not pin the stand. Pure.
 */
export function testEnvironmentsFrom(governance, backUrls, current = {}) {
  if (!governance?.host || !Array.isArray(governance?.stand?.envs)) return null;
  const allowed = new Set(governance.stand.envs);
  const out = { ...(current && typeof current === "object" ? current : {}) };
  for (const [env, backUrl] of Object.entries(backUrls || {})) {
    const hostEnv = governance.envs?.[env] || env;
    out[env] = { ...(out[env] && typeof out[env] === "object" ? out[env] : {}), writable: allowed.has(hostEnv) && Boolean(backUrl), ...(backUrl ? { backUrl } : {}) };
  }
  return out;
}

/**
 * Fold the declarations into a profile object (returns a new one) and say what changed, one line per env;
 * `{ profile, lines: [] }` when nothing changed. Reads the project's env files.
 */
export function declareTestStands(profile, root) {
  const current = profile?.test?.environments;
  const next = testEnvironmentsFrom(profile?.governance, envBackUrls(root), current);
  if (!next || JSON.stringify(next) === JSON.stringify(current ?? {})) return { profile, lines: [] };
  const lines = Object.entries(next)
    .filter(([env, d]) => JSON.stringify(d) !== JSON.stringify(current?.[env]))
    .map(([env, d]) => `test.environments.${env}: ${d.writable ? "writable" : "read-only"}${d.backUrl ? "" : " (no BACK_URL in its .env file)"}`);
  return { profile: { ...profile, test: { ...(profile.test || {}), environments: next } }, lines };
}
