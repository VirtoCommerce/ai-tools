// plugins/vc-test/lib/init-plan.mjs — the deterministic half of /vc-test:init (spec U21): from the operator's answers,
// the `test` block vc-init's profile-set.mjs writes, and the accounts each test env still lacks. It never reads,
// asks for or writes a password: an account gap is answered with `/project-init --add-user`, which is vc-init's.
// CLI: node plugins/vc-test/lib/init-plan.mjs --list <add-user --list JSON file> --writable <env,…|none> [--store qa-knowledge/] [--routing <json>]
//   → writes <outputRoot>/.vc-fix/vc-test/test-block.json (for `profile-set.mjs --merge test=@<that file>`) and
//     prints { file, test, warnings, gaps }
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, outputRoot } from "./paths.mjs";
import { ownEnv, readEnvFile } from "../scripts/lib/env-layers.mjs";
import { DEFAULT_TEMPLATE } from "../scripts/lib/run-dir.mjs";

export const ROLES = Object.freeze(["admin", "user"]); // vc-init's roles: the back-office admin, the storefront user
export const ROUTING_ROLES = Object.freeze(["fix-ready", "hotfix-ready", "not-fixed"]); // what a Bug's status can mean to a run (P2-1)

/**
 * `test.routing`: the status names per role, trimmed, empties and case-insensitive duplicates dropped. A role the
 * operator left out stays out (a re-run keeps the stored one); a name under two roles is ambiguous, so it throws.
 */
export function normaliseRouting(routing) {
  const out = {};
  const seen = new Map(); // lower-cased name -> the role that listed it
  for (const [role, names] of Object.entries(routing)) {
    if (!ROUTING_ROLES.includes(role)) throw new Error(`not a routing role: ${role} (known: ${ROUTING_ROLES.join(", ")})`);
    const list = [];
    for (const raw of Array.isArray(names) ? names : []) {
      const name = String(raw).trim();
      const key = name.toLowerCase();
      if (!name) continue;
      if (seen.has(key) && seen.get(key) !== role) throw new Error(`status "${name}" is listed under both ${seen.get(key)} and ${role}`);
      if (seen.has(key)) continue;
      seen.set(key, role);
      list.push(name);
    }
    out[role] = list;
  }
  return out;
}

/** The run folder template up to its first placeholder — the folder every run's files sit under — or null. */
export function scriptRootOf(template) {
  const head = String(template).split("<")[0].replace(/[\\/]+$/, "");
  return head || null;
}

/**
 * The `test` block: every env the project defines, writable only where the operator said so, each with the
 * BACK_URL its own `.env.<env>` declares (capabilities.mjs refuses a writable run whose loaded BACK_URL differs:
 * an override in .env.local must not turn a "writable" declaration onto another stand).
 * @returns {{ test: object, warnings: string[] }}
 */
/**
 * The run-folder template a run will use: QA_OUTPUT_DIR from the process, else from `.env.local` (where
 * run-output.md says it lives), else run-dir's default. The CLI loads no env layer, so it reads the file itself.
 */
export function outputTemplate(root, env = process.env) {
  return env.QA_OUTPUT_DIR?.trim() || readEnvFile(join(root, ".env.local"))?.QA_OUTPUT_DIR?.trim() || DEFAULT_TEMPLATE;
}

export function planTestBlock({ envs, writable = [], knowledgeStore, backUrlOf, template, hasCorpus, routing, root = outputRoot() }) {
  const unknown = writable.filter((e) => !envs.includes(e));
  if (unknown.length) throw new Error(`not an environment of this project: ${unknown.join(", ")} (known: ${envs.join(", ") || "none"})`);
  const environments = {};
  const warnings = [];
  for (const env of envs) {
    const backUrl = backUrlOf(env);
    environments[env] = { writable: writable.includes(env), ...(backUrl ? { backUrl } : {}) };
    if (!backUrl && writable.includes(env)) warnings.push(`${env}: its .env.${env} declares no BACK_URL, so it stays read-only until it does`);
  }
  // The runner runs files only inside the project (vc-init bridge/runner.mjs): a run folder outside it cannot be a
  // script root, so it is named in a warning instead of recorded — the runner would refuse every root otherwise.
  const runRoot = scriptRootOf(template);
  const inProject = runRoot && !isAbsolute(runRoot) && !relative(root, resolve(root, runRoot)).startsWith("..");
  if (runRoot && !inProject) warnings.push(`QA_OUTPUT_DIR (${template}) is outside the project: the runner cannot run a kept .spec there, so it is not a script root`);
  const scriptRoots = [...(inProject ? [runRoot] : []), ...(hasCorpus ? ["regression"] : [])];
  return { test: { environments, scriptRoots, knowledgeStore, ...(routing ? { routing: normaliseRouting(routing) } : {}) }, warnings };
}

/** Each test env needs one account per role with a login; what is missing, with the vc-init command that adds it. */
export function accountGaps(list, envs) {
  const byEnv = new Map((list?.envs ?? []).map((e) => [e.env, e.users ?? []]));
  const gaps = [];
  for (const env of envs) {
    for (const role of ROLES) {
      if ((byEnv.get(env) ?? []).some((u) => u.role === role && typeof u.login === "string" && u.login.trim())) continue;
      gaps.push({ env, role, fix: `/project-init --add-user --env ${env} --role ${role}` });
    }
  }
  return gaps;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const listFile = argOf(process.argv, "list");
  const writableArg = argOf(process.argv, "writable");
  if (!listFile || writableArg === undefined) {
    console.error("usage: init-plan.mjs --list <add-user --list JSON> --writable <env,…|none> [--store qa-knowledge/] [--routing <json>]");
    process.exit(1);
  }
  const root = outputRoot();
  const list = JSON.parse(readFileSync(listFile, "utf8"));
  const envs = (list.envs ?? []).map((e) => e.env);
  const writable = writableArg === "none" ? [] : writableArg.split(",").map((s) => s.trim()).filter(Boolean);
  let plan;
  try {
    const routingArg = argOf(process.argv, "routing");
    plan = planTestBlock({ routing: routingArg ? JSON.parse(routingArg) : undefined, envs, writable, knowledgeStore: argOf(process.argv, "store") ?? "qa-knowledge/",
      backUrlOf: (env) => ownEnv(env, { root }).vars.BACK_URL || null, template: outputTemplate(root), hasCorpus: existsSync(join(root, "regression")), root });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const dir = join(root, ".vc-fix", "vc-test");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "test-block.json");
  writeFileSync(file, JSON.stringify(plan.test, null, 2) + "\n");
  console.log(JSON.stringify({ file, ...plan, gaps: accountGaps(list, envs) }, null, 2));
}
