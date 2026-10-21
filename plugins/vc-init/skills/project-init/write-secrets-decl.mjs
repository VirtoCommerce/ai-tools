#!/usr/bin/env node
/**
 * skills/project-init/write-secrets-decl.mjs — write this project's vc-secrets declarations.
 *
 * Every PAT /project-init used to leave in `.env.local` (GITHUB_FIX_BUGS_TOKEN, ADO_PAT,
 * JIRA_API_TOKEN) is a vc-secrets `local`-backend secret now (VCST-6402). This script writes the
 * declarations that make it so, into `<project>/.claude/vc-secrets.local.json` — gitignored, because
 * the bridge's shim path is per machine:
 *
 *   secrets   github-pat / ado-pat / jira-token    { backend: "local" }, one per axis the operator
 *                                                   chose a PAT for (the auth preference, §2d)
 *   tasks     vc-init-github / -ado / -jira        node <vc-run shim> --inner <group>, env binding the
 *             vc-init-onboard                      group's secret(s); the bridge dispatches on these
 *   servers   github                               the GitHub MCP server, when github is a PAT axis
 *                                                   (gen-mcp.mjs points .mcp.json at `vc-secrets run github`)
 *
 * and, when the test-user passwords are kept in vc-secrets too (option B, lib/passwords.mjs), per env:
 *
 *   secrets   admin-password-<env> / user-password-<env> / …   { backend: "local" }
 *   tasks     vc-init-onboard.<env>                 the onboard task plus that env's passwords (API logins)
 *   servers   playwright-<lane>.<env>               each Playwright lane, run in-process with that env's
 *                                                   passwords (bridge/playwright-mcp.mjs; .mcp.json says
 *                                                   `node ${VC_RUN} playwright <lane>`)
 *   projectId vcqa-<project dir>-<4 hex>           stable: reused on every re-run (it namespaces the
 *                                                   keystore entries, so a new id would orphan them)
 *
 * The human review is `vc-secrets trust` — it prints exactly these commands and env names, and a
 * launch is refused until the operator types `y` at a terminal. So this writer is careful to produce
 * a file that only CHANGES when something the operator must re-approve changed:
 *   - it owns only the keys above and preserves everything else in the file (a person's own entries);
 *   - it writes keys in a canonical order and does NOT write when the result is unchanged, so a re-run
 *     of /project-init or a plugin update never asks for trust again. Only a change in which axes
 *     use a PAT (or a moved shim) does.
 *
 * Usage:
 *   node write-secrets-decl.mjs --github-auth pat --ado-auth az-login --tracker jira --client-vcs github
 *   node write-secrets-decl.mjs --from-profile            # the axes from project-profile.json auth.*
 *   [--shim <path to vc-run.mjs>]  default: the installed shim (scripts/install-bridge.mjs)
 *   [--password-envs <env,…>|none] keep these envs' test-user passwords in vc-secrets (option B); added to
 *                                  the envs already declared. "none" returns every env to .env.local (A)
 *   [--password-roles admin,user]  which roles' built-in passwords a NEW env keeps here (§2d asks per role);
 *                                  default: the roles the declaration already keeps here, else both
 *   [--password-names <NAME,…>]    passwords beyond the built-ins, for the envs above (or every declared
 *                                  env when --password-envs is not given)
 *   [--github-mcp <json>|none]     override the `servers.github` declaration (default: lib/github-mcp.mjs
 *                                  GITHUB_MCP_DECL, written only when github is a PAT axis); "none" removes it
 *   [--out <path>]                 default <project>/.claude/vc-secrets.local.json
 *
 * Prints one JSON report: { status: "written"|"unchanged", path, projectId, secrets, tasks, servers,
 * passwords, trustNeeded, setCommands }. trustNeeded is true when a launchable (task/server) changed — the
 * operator has to run `vc-secrets trust` again. Exit 1 on a bad flag or an unparsable existing file.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authAxes, readProjectProfile } from "../../scripts/lib/project-profile.mjs";
import { defaultShimPath } from "../../scripts/install-bridge.mjs";
import { ensureProjectIgnores } from "./lib/gitignore.mjs";
import { outputRoot } from "./lib/paths.mjs";
import { GITHUB_MCP_DECL } from "./lib/github-mcp.mjs";
import { standDownIfHostGoverned } from "./lib/governance.mjs";
import { ENV_NAME_RE, ROLES, ROLE_PASSWORD, declaredLanes, declaredPasswords, isPasswordName, laneArgsForEnv, laneServer, onboardTask, passwordSecret, passwordSecretNames, vcSecretsRoles } from "./lib/passwords.mjs";
import { laneCommands, readTemplateServers } from "./lib/playwright-lanes.mjs";

/**
 * Secret name and the env vars it is bound to, per axis. The env names are the runtime contract.
 * GitHub's one secret goes out under two names: GITHUB_FIX_BUGS_TOKEN for what reads it today, and
 * GITHUB_TOKEN, the name every skill and agent is moving to — same value, so a caller can switch first.
 */
export const AXIS_SECRETS = Object.freeze({
  github: { secret: "github-pat", env: ["GITHUB_FIX_BUGS_TOKEN", "GITHUB_TOKEN"] },
  ado: { secret: "ado-pat", env: ["ADO_PAT"] },
  jira: { secret: "jira-token", env: ["JIRA_API_TOKEN"] },
});

/** Task names this writer owns. */
export const OWNED_TASKS = ["vc-init-github", "vc-init-ado", "vc-init-jira", "vc-init-onboard"];

/** A projectId vc-secrets accepts (^[a-z0-9-]+$), derived from the project directory's name. */
export function newProjectId(projectRoot, rand = () => randomBytes(2).toString("hex")) {
  const slug = basename(resolve(projectRoot)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "project";
  return `vcqa-${slug}-${rand()}`;
}

/**
 * The password map after a change: the declared one, plus `addEnvs` (each with its roles' built-in
 * passwords — `roles`, else the roles the map already keeps here, else both), plus `addNames` on the
 * given envs (or on every env when none is given). `addEnvs === "none"` clears it. Pure; throws on a bad name.
 */
export function nextPasswords(declaredMap, { addEnvs = [], addNames = [], roles } = {}) {
  if (addEnvs === "none") return {};
  for (const e of addEnvs) if (!ENV_NAME_RE.test(e)) throw new Error(`not an environment name: ${JSON.stringify(e)} ([a-z0-9_]+)`);
  for (const n of addNames) if (!isPasswordName(n)) throw new Error(`not a password name: ${JSON.stringify(n)} (upper snake case ending in PASSWORD)`);
  for (const r of roles || []) if (!ROLES.includes(r)) throw new Error(`not a role: ${JSON.stringify(r)} (${ROLES.join(" | ")})`);
  const kept = vcSecretsRoles(declaredMap);
  const builtIns = (roles || (kept.length ? kept : ROLES)).map((r) => ROLE_PASSWORD[r]);
  const out = Object.fromEntries(Object.entries(declaredMap || {}).map(([e, names]) => [e, [...names]]));
  for (const e of addEnvs) out[e] = [...new Set([...(out[e] || []), ...builtIns])];
  for (const e of addEnvs.length ? addEnvs : Object.keys(out)) out[e] = [...new Set([...(out[e] || []), ...addNames])];
  for (const e of Object.keys(out)) out[e].sort();
  return out;
}

/**
 * Compute the declaration file from the axes. Pure: (existing file object, inputs) → new object.
 * @param {object|null} existing  the current local file, parsed (null when absent)
 * @param {{ pat: {github:boolean, ado:boolean, jira:boolean}, shim: string, projectId: string, githubServer?: object|null|undefined,
 *   passwords?: Record<string,string[]>, lanes?: Record<string,{command:string,args:string[]}> }} inputs
 *   passwords / lanes: undefined keeps what the file declares (lib/passwords.mjs)
 */
export function buildDeclarations(existing, { pat, shim, projectId, githubServer, passwords, lanes }) {
  const base = existing && typeof existing === "object" ? existing : {};
  const secrets = { ...(base.secrets || {}) };
  const tasks = { ...(base.tasks || {}) };
  const servers = { ...(base.servers || {}) };
  for (const { secret } of Object.values(AXIS_SECRETS)) delete secrets[secret];
  for (const t of OWNED_TASKS) delete tasks[t];
  // Option B: what the file declared is replaced as a whole, so a removed env leaves nothing behind.
  const priorPasswords = declaredPasswords(base);
  const pw = passwords === undefined ? priorPasswords : passwords;
  const laneDefs = lanes === undefined ? declaredLanes(base) : lanes;
  for (const n of passwordSecretNames(priorPasswords)) delete secrets[n];
  for (const e of Object.keys(priorPasswords)) delete tasks[onboardTask(e)];
  for (const name of Object.keys(servers)) if (/^playwright-[a-z0-9]+\.[a-z0-9_]+$/.test(name)) delete servers[name];

  const axes = Object.keys(AXIS_SECRETS).filter((a) => pat[a]);
  const env = (list) => Object.fromEntries(list.flatMap((a) => AXIS_SECRETS[a].env.map((name) => [name, `secret:${AXIS_SECRETS[a].secret}`])));
  const task = (group, list) => ({ command: "node", args: [shim, "--inner", group], env: env(list) });
  const owned = {};
  for (const a of axes) {
    secrets[AXIS_SECRETS[a].secret] = { backend: "local" };
    owned[`vc-init-${a}`] = task(a, [a]);
  }
  if (axes.length) owned["vc-init-onboard"] = task("onboard", axes);
  // Per env (option B): its password secrets, its onboard task (the tokens + its passwords), its lanes.
  const envTasks = {};
  const laneServers = {};
  for (const e of Object.keys(pw).sort()) {
    const bind = Object.fromEntries(pw[e].map((n) => [n, `secret:${passwordSecret(n, e)}`]));
    for (const n of pw[e]) secrets[passwordSecret(n, e)] = { backend: "local" };
    envTasks[onboardTask(e)] = { ...task("onboard", axes), env: { ...env(axes), ...bind } };
    for (const lane of Object.keys(laneDefs).sort()) {
      laneServers[laneServer(lane, e)] = { command: laneDefs[lane].command, args: laneArgsForEnv(laneDefs[lane].args, e), env: { ...bind, npm_config_prefer_offline: "literal:true" } };
    }
  }
  // Owned tasks first, in a fixed order; a person's own tasks after them, in their order.
  const orderedTasks = {};
  for (const t of OWNED_TASKS) if (owned[t]) orderedTasks[t] = owned[t];
  Object.assign(orderedTasks, envTasks, tasks);

  if (githubServer === null || !pat.github) delete servers.github;
  else if (githubServer !== undefined) servers.github = githubServer;
  Object.assign(servers, laneServers);

  const out = { schemaVersion: 1, projectId };
  // Canonical key order: what this writer owns first, then anything else the file carried.
  if (Object.keys(secrets).length) out.secrets = secrets;
  if (Object.keys(orderedTasks).length) out.tasks = orderedTasks;
  if (Object.keys(servers).length) out.servers = servers;
  for (const [k, v] of Object.entries(base)) if (!(k in out) && !["secrets", "tasks", "servers"].includes(k)) out[k] = v;
  return out;
}

/** The launchables (tasks + servers) of a declaration, for the "does trust have to be re-run" check. */
const launchables = (d) => JSON.stringify({ tasks: d?.tasks || {}, servers: d?.servers || {} });

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(k)}`);
    const name = k.slice(2);
    if (name === "from-profile") {
      a[name] = true;
      continue;
    }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`--${name} needs a value`);
    a[name] = v;
    i++;
  }
  return a;
}

const ENUMS = { "github-auth": ["pat", "gh-cli"], "ado-auth": ["pat", "az-login", ""], "jira-auth": ["pat", "token", "oauth", ""], tracker: ["jira", "azure"], "client-vcs": ["github", "azure-repos"] };

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    for (const [k, allowed] of Object.entries(ENUMS)) {
      if (args[k] !== undefined && !allowed.includes(args[k])) throw new Error(`--${k} must be one of ${allowed.filter(Boolean).join("|")}`);
    }
  } catch (e) {
    console.error(`[write-secrets-decl] ${e.message}`);
    process.exit(1);
  }
  const root = outputRoot();
  standDownIfHostGoverned(root, "write-secrets-decl skipped: the host's secret wrapper owns every credential — no vc-secrets declaration", { json: true });
  let pat;
  if (args["from-profile"]) {
    const { raw, error, path } = readProjectProfile(root);
    if (!raw) {
      console.error(`[write-secrets-decl] ${error ? `cannot parse ${path}: ${error}` : `no ${path} — pass the axes as flags`}`);
      process.exit(1);
    }
    pat = patAxesFromProfile(raw);
  } else {
    const tracker = args.tracker || "jira";
    const host = args["client-vcs"] || "github";
    const adoApplies = tracker === "azure" || host === "azure-repos";
    pat = {
      github: args["github-auth"] === "pat",
      ado: adoApplies && args["ado-auth"] === "pat",
      jira: tracker === "jira" && (args["jira-auth"] === "pat" || args["jira-auth"] === "token"),
    };
  }

  let githubServer = GITHUB_MCP_DECL;
  if (args["github-mcp"] === "none") githubServer = null;
  else if (args["github-mcp"]) {
    try {
      githubServer = JSON.parse(args["github-mcp"]);
    } catch (e) {
      console.error(`[write-secrets-decl] --github-mcp is not valid JSON (${e.message})`);
      process.exit(1);
    }
  }
  const list = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (args["password-roles"] !== undefined && args["password-envs"] === undefined) {
    console.error("[write-secrets-decl] --password-roles needs --password-envs: it chooses the built-in passwords of the envs being added");
    process.exit(1);
  }
  const passwordChange = args["password-envs"] === undefined && args["password-names"] === undefined
    ? undefined
    : {
      addEnvs: args["password-envs"] === "none" ? "none" : list(args["password-envs"]),
      addNames: list(args["password-names"]),
      ...(args["password-roles"] !== undefined ? { roles: list(args["password-roles"]) } : {}),
    };
  try {
    const report = writeSecretsDecl({ root, pat, shim: args.shim || defaultShimPath(), githubServer, out: args.out, passwordChange });
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.error(`[write-secrets-decl] ${e.message}`);
    process.exit(1);
  }
}

/** The PAT axes a profile records (auth.*), as the { github, ado, jira } booleans writeSecretsDecl takes. */
export function patAxesFromProfile(raw) {
  const ax = authAxes(raw);
  return { github: ax.github.mode === "pat", ado: ax.ado.applies && ax.ado.mode === "pat", jira: ax.jira.applies && ax.jira.mode === "pat" };
}

/**
 * Write (or leave unchanged) the declaration file. Shared by this CLI and gen-mcp.mjs, which makes sure
 * the GitHub MCP server it points .mcp.json at is declared.
 * Option B (lib/passwords.mjs): `passwordChange` ({ addEnvs, addNames }, see nextPasswords) changes which
 * envs keep their passwords here; without it the file's own set is kept. Whenever any env does, the lane
 * servers are rebuilt from the template (lib/playwright-lanes.mjs) — `templateServers` overrides it in tests.
 * @param {{ root: string, pat: {github:boolean, ado:boolean, jira:boolean}, shim: string, githubServer?: object|null, out?: string,
 *   passwordChange?: { addEnvs: string[]|"none", addNames: string[] }, templateServers?: object }} opts
 * @returns {{ status: "written"|"unchanged", path: string, projectId: string, secrets: string[], tasks: string[], servers: string[], passwords: Record<string,string[]>, trustNeeded: boolean, shim: string, shimInstalled: boolean }}
 */
export function writeSecretsDecl({ root, pat, shim, githubServer = GITHUB_MCP_DECL, out: outFlag, passwordChange, templateServers }) {
  const out = resolve(root, outFlag || join(".claude", "vc-secrets.local.json"));
  let existing = null;
  if (existsSync(out)) {
    try {
      existing = JSON.parse(readFileSync(out, "utf8"));
    } catch (e) {
      throw new Error(`${out} is not valid JSON (${e.message}) — fix or delete it; nothing was written`);
    }
  }
  // projectId: the local file's, else the committed project file's (vc-secrets refuses the two
  // disagreeing), else a new stable one.
  let projectId = existing?.projectId;
  if (!projectId) {
    const projectFile = join(root, ".claude", "vc-secrets.json");
    try {
      projectId = existsSync(projectFile) ? JSON.parse(readFileSync(projectFile, "utf8")).projectId : undefined;
    } catch {
      /* an unreadable project file — vc-secrets itself will say so */
    }
  }
  if (!projectId) projectId = newProjectId(root);

  const passwords = passwordChange ? nextPasswords(declaredPasswords(existing), passwordChange) : declaredPasswords(existing);
  const lanes = Object.keys(passwords).length ? laneCommands({ servers: templateServers || readTemplateServers(), root, shim }) : {};
  const next = buildDeclarations(existing, { pat, shim, projectId, githubServer, passwords, lanes });
  const text = `${JSON.stringify(next, null, 2)}
`;
  const changed = !existing || `${JSON.stringify(existing, null, 2)}
` !== text;
  const trustNeeded = changed && launchables(existing) !== launchables(next);
  if (changed) {
    const added = ensureProjectIgnores(root);
    if (added.length) console.error(`[write-secrets-decl] .gitignore += ${added.join(", ")}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  return {
    status: changed ? "written" : "unchanged",
    path: out,
    projectId,
    secrets: [...Object.keys(AXIS_SECRETS).filter((a) => pat[a]).map((a) => AXIS_SECRETS[a].secret), ...passwordSecretNames(passwords)],
    tasks: Object.keys(next.tasks || {}).filter((t) => OWNED_TASKS.includes(t) || Object.keys(passwords).some((e) => t === onboardTask(e))),
    servers: Object.keys(next.servers || {}).filter((n) => n === "github" || /^playwright-[a-z0-9]+\./.test(n)),
    passwords,
    trustNeeded,
    shim,
    shimInstalled: existsSync(shim),
  };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
