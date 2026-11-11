/**
 * skills/project-init/lib/test-stands.mjs — declare the test-data answer to vc-test, so a host-governed
 * project needs no /vc-test:init for it.
 *
 * vc-test decides per run whether it may write (`plugins/vc-test/lib/capabilities.mjs` standOf): the env is in
 * `test.environments` with `writable: true`, the BACK_URL loaded is the `backUrl` recorded there, and
 * `governance.stand.writable` is not false. /vc-test:init writes that block from a second question; on a
 * host-governed project vc-init already asked it (`governance.stand.envs`, host-governed.md step 3), so it
 * writes the per-env declarations itself, in the shape vc-test's init-plan writes them:
 *   test.environments.<env> = { ...what is there, writable, backUrl }
 *
 * Who runs it: gen-profile (every host-governed write), reconcile (`--check` resolving the answer) and
 * default-env.mjs, which already runs after the env files are written in onboarding step 4, `--add-env` and
 * `--check` Step C — so a new env, or a stand whose URL changed, is declared without a step of its own.
 *
 * `writable` follows the answer (its host env — governance.envs maps a renamed one — is in stand.envs) for an
 * env not declared yet, and for every env when `reassert` is set (the answer was just given). Otherwise an
 * existing `writable` is kept, so a later /vc-test:init choice survives unrelated runs. `backUrl` is always
 * refreshed from the env's own file. Every other key of the `test` block (knowledge store, routing, budget)
 * stays vc-test's. A project with no host, or a host never asked (`stand.envs: null`), gets nothing written.
 *
 * The URLs are read with vc-test's OWN env reader (`scripts/lib/env-layers.mjs` ownEnv: the root `.env.<env>`
 * plus the QA_ENV_PATH folders), so the recorded `backUrl` is the one its run check loads — with NO ticket:
 * a `<ticket>` folder is one ticket's stand, and declaring it would pin the project to whichever ticket the
 * session had bound (a ticket's own stand is declared by /vc-test:init, as before). vc-test not installed ⇒
 * nothing is declared (nothing would read it); installed but its reader not loadable ⇒ a line says so.
 */
import { resolvePluginFile } from "../../../bridge/resolve-plugin.mjs";
import { pathToFileURL } from "node:url";

/**
 * `{ urls: { <env>: <its BACK_URL, "" when none> } }` for every env vc-test sees here, read as vc-test reads
 * it; `{ urls: null, why }` when vc-test is not installed (`why: null`) or its reader cannot be loaded.
 */
export async function envBackUrls(root, { file = resolvePluginFile("vc-test", "scripts/lib/env-layers.mjs") } = {}) {
  if (!file) return { urls: null, why: null };
  let layers;
  try { layers = await import(pathToFileURL(file).href); } catch (e) {
    return { urls: null, why: `vc-test's env reader could not be loaded (${String(e?.message || e).split(/\r?\n/)[0]}) — install vc-test's dependencies, then /project-init --check` };
  }
  const urls = {};
  for (const env of layers.knownEnvs(root)) {
    try { urls[env] = String(layers.ownEnv(env, { root, ticket: null }).vars.BACK_URL || "").trim(); } catch { urls[env] = ""; }
  }
  return { urls };
}

/**
 * The `test.environments` map that declares the answer, merged over `current`; null when there is no
 * answer to declare. An env with no BACK_URL is declared read-only: vc-test could not pin its stand. Pure.
 */
export function testEnvironmentsFrom(governance, backUrls, current = {}, { reassert = false } = {}) {
  if (!governance?.host || !Array.isArray(governance?.stand?.envs) || !backUrls) return null;
  const allowed = new Set(governance.stand.envs);
  const out = { ...(current && typeof current === "object" ? current : {}) };
  for (const [env, backUrl] of Object.entries(backUrls)) {
    const had = out[env] && typeof out[env] === "object" ? out[env] : null;
    const answer = allowed.has(governance.envs?.[env] || env);
    // Declared = a writable recorded WITH a stand; one recorded before its BACK_URL existed follows the answer.
    const declared = typeof had?.writable === "boolean" && Boolean(had?.backUrl);
    const writable = !backUrl ? false : reassert || !declared ? answer : had.writable;
    const { backUrl: _old, ...rest } = had || {};
    out[env] = { ...rest, writable, ...(backUrl ? { backUrl } : {}) };
  }
  return out;
}

/**
 * Fold the declarations into a profile object (returns a new one) with one line per changed env;
 * `{ profile, lines: [] }` when nothing changed. Reads the project's env files.
 */
export async function declareTestStands(profile, root, { reassert = false, reader } = {}) {
  if (!profile?.governance?.host || !Array.isArray(profile?.governance?.stand?.envs)) return { profile, lines: [] };
  const current = profile?.test?.environments;
  const { urls, why } = await envBackUrls(root, reader ? { file: reader } : undefined);
  if (!urls) return { profile, lines: why ? [`test environments NOT declared: ${why}`] : [] };
  const next = testEnvironmentsFrom(profile.governance, urls, current, { reassert });
  if (!next || JSON.stringify(next) === JSON.stringify(current ?? {})) return { profile, lines: [] };
  const lines = Object.entries(next)
    .filter(([env, d]) => JSON.stringify(d) !== JSON.stringify(current?.[env]))
    .map(([env, d]) => `test.environments.${env}: ${d.writable ? "writable" : "read-only"}${d.backUrl ? "" : " — its .env file has no BACK_URL yet"}`);
  return { profile: { ...profile, test: { ...(profile.test || {}), environments: next } }, lines };
}
