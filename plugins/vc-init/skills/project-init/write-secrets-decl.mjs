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
 *   [--github-mcp <json>]          the `servers.github` declaration (gen-mcp passes it); "none" removes it
 *   [--out <path>]                 default <project>/.claude/vc-secrets.local.json
 *
 * Prints one JSON report: { status: "written"|"unchanged", path, projectId, secrets, tasks, servers,
 * trustNeeded, setCommands }. trustNeeded is true when a launchable (task/server) changed — the
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

/** Secret name and the env var it is bound to, per axis. The env names are the runtime contract. */
export const AXIS_SECRETS = Object.freeze({
  github: { secret: "github-pat", env: "GITHUB_FIX_BUGS_TOKEN" },
  ado: { secret: "ado-pat", env: "ADO_PAT" },
  jira: { secret: "jira-token", env: "JIRA_API_TOKEN" },
});

/** Task names this writer owns. */
export const OWNED_TASKS = ["vc-init-github", "vc-init-ado", "vc-init-jira", "vc-init-onboard"];

/** A projectId vc-secrets accepts (^[a-z0-9-]+$), derived from the project directory's name. */
export function newProjectId(projectRoot, rand = () => randomBytes(2).toString("hex")) {
  const slug = basename(resolve(projectRoot)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "project";
  return `vcqa-${slug}-${rand()}`;
}

/**
 * Compute the declaration file from the axes. Pure: (existing file object, inputs) → new object.
 * @param {object|null} existing  the current local file, parsed (null when absent)
 * @param {{ pat: {github:boolean, ado:boolean, jira:boolean}, shim: string, projectId: string, githubServer?: object|null|undefined }} inputs
 */
export function buildDeclarations(existing, { pat, shim, projectId, githubServer }) {
  const base = existing && typeof existing === "object" ? existing : {};
  const secrets = { ...(base.secrets || {}) };
  const tasks = { ...(base.tasks || {}) };
  const servers = { ...(base.servers || {}) };
  for (const { secret } of Object.values(AXIS_SECRETS)) delete secrets[secret];
  for (const t of OWNED_TASKS) delete tasks[t];

  const axes = Object.keys(AXIS_SECRETS).filter((a) => pat[a]);
  const env = (list) => Object.fromEntries(list.map((a) => [AXIS_SECRETS[a].env, `secret:${AXIS_SECRETS[a].secret}`]));
  const task = (group, list) => ({ command: "node", args: [shim, "--inner", group], env: env(list) });
  const owned = {};
  for (const a of axes) {
    secrets[AXIS_SECRETS[a].secret] = { backend: "local" };
    owned[`vc-init-${a}`] = task(a, [a]);
  }
  if (axes.length) owned["vc-init-onboard"] = task("onboard", axes);
  // Owned tasks first, in a fixed order; a person's own tasks after them, in their order.
  const orderedTasks = {};
  for (const t of OWNED_TASKS) if (owned[t]) orderedTasks[t] = owned[t];
  Object.assign(orderedTasks, tasks);

  if (githubServer === null || !pat.github) delete servers.github;
  else if (githubServer !== undefined) servers.github = githubServer;

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
  let pat;
  if (args["from-profile"]) {
    const { raw, error, path } = readProjectProfile(root);
    if (!raw) {
      console.error(`[write-secrets-decl] ${error ? `cannot parse ${path}: ${error}` : `no ${path} — pass the axes as flags`}`);
      process.exit(1);
    }
    const ax = authAxes(raw);
    pat = { github: ax.github.mode === "pat", ado: ax.ado.applies && ax.ado.mode === "pat", jira: ax.jira.applies && ax.jira.mode === "pat" };
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

  const out = resolve(root, args.out || join(".claude", "vc-secrets.local.json"));
  let existing = null;
  if (existsSync(out)) {
    try {
      existing = JSON.parse(readFileSync(out, "utf8"));
    } catch (e) {
      console.error(`[write-secrets-decl] ${out} is not valid JSON (${e.message}) — fix or delete it; nothing was written`);
      process.exit(1);
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

  let githubServer;
  if (args["github-mcp"] === "none") githubServer = null;
  else if (args["github-mcp"]) {
    try {
      githubServer = JSON.parse(args["github-mcp"]);
    } catch (e) {
      console.error(`[write-secrets-decl] --github-mcp is not valid JSON (${e.message})`);
      process.exit(1);
    }
  }

  const shim = args.shim || defaultShimPath();
  const next = buildDeclarations(existing, { pat, shim, projectId, githubServer });
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const changed = !existing || `${JSON.stringify(existing, null, 2)}\n` !== text;
  const trustNeeded = changed && launchables(existing) !== launchables(next);
  if (changed) {
    const added = ensureProjectIgnores(root);
    if (added.length) console.error(`[write-secrets-decl] .gitignore += ${added.join(", ")}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  const secretNames = Object.keys(AXIS_SECRETS).filter((a) => pat[a]).map((a) => AXIS_SECRETS[a].secret);
  console.log(JSON.stringify({
    status: changed ? "written" : "unchanged",
    path: out,
    projectId,
    secrets: secretNames,
    tasks: Object.keys(next.tasks || {}).filter((t) => OWNED_TASKS.includes(t)),
    servers: next.servers?.github ? ["github"] : [],
    trustNeeded,
    shim,
    shimInstalled: existsSync(shim),
  }, null, 2));
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
