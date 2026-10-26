// plugins/vc-test/lib/init-plan.mjs — the deterministic half of /vc-test:init (spec U21): from the operator's answers,
// the `test` block vc-init's profile-set.mjs writes, and the accounts each test env still lacks. It never reads,
// asks for or writes a password: an account gap is answered with `/project-init --add-user`, which is vc-init's.
// CLI: node plugins/vc-test/lib/init-plan.mjs --list <add-user --list JSON file> --writable <env,…|none> [--store qa-knowledge/]
//   → writes <outputRoot>/.vc-fix/vc-test/test-block.json (for `profile-set.mjs --merge test=@<that file>`) and
//     prints { file, test, warnings, gaps }
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { argOf, outputRoot } from "./paths.mjs";
import { ownEnv } from "../scripts/lib/env-layers.mjs";
import { runDirTemplate } from "../scripts/lib/run-dir.mjs";

export const ROLES = Object.freeze(["admin", "user"]); // vc-init's roles: the back-office admin, the storefront user

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
export function planTestBlock({ envs, writable = [], knowledgeStore, backUrlOf, template, hasCorpus }) {
  const unknown = writable.filter((e) => !envs.includes(e));
  if (unknown.length) throw new Error(`not an environment of this project: ${unknown.join(", ")} (known: ${envs.join(", ") || "none"})`);
  const environments = {};
  const warnings = [];
  for (const env of envs) {
    const backUrl = backUrlOf(env);
    environments[env] = { writable: writable.includes(env), ...(backUrl ? { backUrl } : {}) };
    if (!backUrl && writable.includes(env)) warnings.push(`${env}: its .env.${env} declares no BACK_URL, so it stays read-only until it does`);
  }
  const root = scriptRootOf(template);
  const scriptRoots = [...(root ? [root] : []), ...(hasCorpus ? ["regression"] : [])];
  return { test: { environments, scriptRoots, knowledgeStore }, warnings };
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
    console.error("usage: init-plan.mjs --list <add-user --list JSON> --writable <env,…|none> [--store qa-knowledge/]");
    process.exit(1);
  }
  const root = outputRoot();
  const list = JSON.parse(readFileSync(listFile, "utf8"));
  const envs = (list.envs ?? []).map((e) => e.env);
  const writable = writableArg === "none" ? [] : writableArg.split(",").map((s) => s.trim()).filter(Boolean);
  let plan;
  try {
    plan = planTestBlock({ envs, writable, knowledgeStore: argOf(process.argv, "store") ?? "qa-knowledge/",
      backUrlOf: (env) => ownEnv(env, { root }).vars.BACK_URL || null, template: runDirTemplate(), hasCorpus: existsSync(join(root, "regression")) });
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
