/**
 * bridge/run.mjs — the $VC_RUN dispatcher: how a process gets a GitHub / Azure DevOps / Jira token.
 *
 * No token sits in a project file (VCST-6402). A PAT is stored by vc-secrets, and a process receives
 * it only by being launched through here:
 *
 *   node "$VC_RUN" gh pr create --title …            # GitHub CLI
 *   node "$VC_RUN" git-gh -C .fix-workspace/repo push origin HEAD
 *   node "$VC_RUN" git-ado clone https://dev.azure.com/org/proj/_git/repo
 *   node "$VC_RUN" ado comment --id 967 --text-file body.txt     # vc-fix qa-fix-routing/ado.mjs
 *   node "$VC_RUN" jira comment --key ABC-1 --text-file body.md  # vc-fix qa-fix-routing/jira.mjs
 *   node "$VC_RUN" deliver --confirm < struct.json              # vc-fix vc-self-check/deliver.mjs
 *   node "$VC_RUN" onboard verify-access                         # vc-init's own onboarding scripts
 *   node "$VC_RUN" playwright chrome                             # a Playwright MCP lane (.mcp.json, option B)
 *
 * Two sides, one file:
 *
 * OUTER (what the caller runs; holds no secret). Checks the command line against allowlist.mjs, then
 *   decides the route from the project's vc-secrets declaration: when the task `vc-init-<group>` is
 *   declared — written by write-secrets-decl.mjs for every axis the operator chose a PAT for — it runs
 *   `node "$VC_SECRETS" task vc-init-<group>` with the command line in VC_RUN_ARGV. vc-secrets
 *   resolves the secret and starts the INNER side. With no such task the axis uses a session login
 *   (`gh auth login`, `az login`, Atlassian OAuth) and the tool runs directly, with nothing injected.
 *   The prompt idiom is the same either way, so a prompt never has to know which one it is on.
 *
 * INNER (`--inner <group>`, started only by the trusted declaration). Re-checks the command line —
 *   the authoritative check, since the caller wrote VC_RUN_ARGV — refuses a tool from another group,
 *   builds the child's environment from an allowlist of keys plus the group's secrets, configures git
 *   with a host-pinned credential helper and no hooks, and passes the child's stdout and stderr
 *   through a redactor that masks every spelling of the secrets.
 *
 * PASSWORDS (option B, skills/project-init/lib/passwords.mjs). Test-user passwords live in vc-secrets
 *   per environment. `onboard` routes to the task `vc-init-onboard.<env>` of the current env (TEST_ENV)
 *   when it is declared, so the onboarding scripts' API logins get that env's passwords; `playwright
 *   <lane>` — the command .mcp.json gives a lane — runs the vc-secrets server `playwright-<lane>.<env>`,
 *   whose inner side is `--playwright` (bridge/playwright-mcp.mjs, the passwords in memory only).
 *
 * Exit codes: the child's own, or 64 refused by the allowlist, 69 the bridge's prerequisites are
 * missing (vc-secrets, vc-fix, a declared secret), 70 an internal error, 78 a host-governed project
 * (project-profile.json governance — the host plugin's MCP servers do this job; nothing runs here).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, checkArgv, checkPlaywright, groupOf, toolInGroup } from "./allowlist.mjs";
import { createRedactor } from "./redact.mjs";
import { resolvePluginFile, resolvePluginRoot, selfRoot } from "./resolve-plugin.mjs";
import { vcSecretsShim } from "./vc-secrets-path.mjs";
import { currentEnv, declaredPasswords, isPasswordName, laneServer, onboardTask } from "../skills/project-init/lib/passwords.mjs";

export const EX_REFUSED = 64;
export const EX_UNAVAILABLE = 69;
export const EX_SOFTWARE = 70;
export const EX_CONFIG = 78;

/** Which host server role a bridge tool's job belongs to on a host-governed project. */
const HOST_ROLE = Object.freeze({ gh: "github", "git-gh": "github", deliver: "github", ado: "tracker", "git-ado": "codeHost", jira: "tracker", onboard: "tracker", playwright: "browsers" });

/**
 * The nearest project-profile.json's `governance` block (PROJECT_PROFILE_PATH, VC_FIX_HOME, then the cwd
 * and its parents), or null. Read-only; an unreadable profile reads as not governed — the scripts the
 * bridge launches stop on it themselves.
 */
export function findGovernance(start = process.cwd(), { useEnv = true } = {}) {
  const candidates = [];
  // The inner side passes useEnv:false and the declarations root: the caller sets those variables.
  if (useEnv && process.env.PROJECT_PROFILE_PATH) candidates.push(process.env.PROJECT_PROFILE_PATH);
  if (useEnv && process.env.VC_FIX_HOME) candidates.push(join(resolve(process.env.VC_FIX_HOME), "project-profile.json"));
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    candidates.push(join(dir, "project-profile.json"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf8")).governance || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The refusal for a host-governed project (VCST-6402 step 8), or null when the project is not one.
 * There, the client's governance plugin owns every MCP server and secret: no tool of ours may carry a
 * token, and nothing falls back to .env.local, a PAT or `az login`. Pure.
 */
export function hostRefusal(tool, governance) {
  if (!governance || (governance.secrets !== "host" && !governance.host)) return null;
  const role = HOST_ROLE[tool] || "tracker";
  const server = governance.servers?.[role] || "(none mapped)";
  return `host-governed project: use the ${server} MCP server from ${governance.host || "the host plugin"} (see project-profile.json governance.servers) — ${tool} does not run through $VC_RUN here`;
}

/**
 * The env vars each group's secret arrives in (the task declaration binds them to `secret:<name>`).
 * GitHub's token has two names, both bound to github-pat: a declaration written before GITHUB_TOKEN
 * existed carries only GITHUB_FIX_BUGS_TOKEN, one written after the old name is dropped will carry
 * only GITHUB_TOKEN — either alone is the whole secret.
 */
export const GROUP_SECRETS = Object.freeze({
  github: ["GITHUB_FIX_BUGS_TOKEN", "GITHUB_TOKEN"],
  ado: ["ADO_PAT"],
  jira: ["JIRA_API_TOKEN"],
  onboard: ["GITHUB_FIX_BUGS_TOKEN", "GITHUB_TOKEN", "ADO_PAT", "JIRA_API_TOKEN"],
});

/** The vc-secrets task name for a group. */
export const taskName = (group) => `vc-init-${group}`;

/**
 * Environment keys the inner side passes to its child. Everything else the caller had — including any
 * credential exported in the shell — is dropped. Names are matched case-insensitively (Windows keeps
 * `Path`, `SystemRoot`, … in mixed case).
 */
// Not kept, on purpose: the custom-CA variables (a caller-chosen CA would let it read the TLS traffic
// that carries the token — the proxy variables stay, a proxy cannot read TLS without a trusted CA);
// GH_CONFIG_DIR / GIT_CONFIG_* (the bridge gives gh and git its own empty configuration, below);
// VC_FIX_HOME / PROJECT_PROFILE_PATH (the bridge sets them to the declarations' project, so the caller
// cannot choose the profile a token-holding script takes its host from).
const ENV_KEEP = [
  "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "OS", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
  "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "COMMONPROGRAMFILES",
  "USERNAME", "USER", "LOGNAME", "SHELL", "TEMP", "TMP", "TMPDIR", "LANG", "LANGUAGE", "TERM", "TZ", "NO_COLOR", "FORCE_COLOR",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY",
  "XDG_CACHE_HOME", "XDG_DATA_HOME", "AZURE_CONFIG_DIR", "GIT_EXEC_PATH",
  "TEST_ENV", "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "HOST_SESSION_ID",
  // Identifiers only. Anything that names a HOST (JIRA_BASE_URL, ADO_ORG, …) is deliberately not
  // passed: the child reads those from the profile and the .env files, so a caller cannot point a
  // token-holding script at another server by exporting a variable.
  "JIRA_EMAIL", "JIRA_USER",
];
const ENV_KEEP_PREFIX = ["LC_"];

/**
 * Build the inner child's environment: kept keys + this group's secrets + the bridge's own settings.
 * `projectRoot` — the declarations' directory: the profile and the env files the child reads come from
 * there, whatever the caller exported. `ghConfigDir` / `gitGlobalConfig` — an empty gh config directory
 * and an empty global git config the bridge owns, so neither tool reads configuration the caller chose.
 */
export function buildInnerEnv(source, group, { nodePath = process.execPath, helperPath = join(selfRoot(), "bridge", "git-credential.mjs"), projectRoot, ghConfigDir, gitGlobalConfig } = {}) {
  const keep = new Set(ENV_KEEP);
  const env = {};
  for (const [k, v] of Object.entries(source)) {
    const up = k.toUpperCase();
    if (keep.has(up) || ENV_KEEP_PREFIX.some((p) => up.startsWith(p))) env[k] = v;
  }
  const secrets = {};
  for (const name of GROUP_SECRETS[group] || []) {
    if (typeof source[name] === "string" && source[name].length) secrets[name] = source[name];
  }
  // onboard also logs in over the API: the `vc-init-onboard.<env>` task injects that env's passwords.
  if (group === "onboard") {
    for (const [name, v] of Object.entries(source)) if (isPasswordName(name) && typeof v === "string" && v.length) secrets[name] = v;
  }
  Object.assign(env, secrets);
  const githubToken = secrets.GITHUB_FIX_BUGS_TOKEN || secrets.GITHUB_TOKEN;
  if (githubToken) env.GH_TOKEN = githubToken;
  if (secrets.ADO_PAT) env.ADO_AUTH = "pat";
  Object.assign(env, {
    VC_BRIDGE: "1",
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    // An empty askpass is "none": git then neither prompts nor runs a repository's core.askPass.
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
  }, gitConfigEnv({ nodePath, helperPath }));
  if (projectRoot) Object.assign(env, { VC_FIX_HOME: projectRoot, PROJECT_PROFILE_PATH: join(projectRoot, "project-profile.json") });
  if (ghConfigDir) env.GH_CONFIG_DIR = ghConfigDir;
  if (gitGlobalConfig) env.GIT_CONFIG_GLOBAL = gitGlobalConfig;
  return { env, secrets };
}

/**
 * git configuration for every git the inner child starts — the bridge's own `git-gh`/`git-ado` and any
 * git a plugin script spawns. GIT_CONFIG_COUNT entries sit at command-line precedence, above the user's
 * and the repository's config:
 *   - credential.helper reset, then ours: only the host-pinned helper answers, with the token from env;
 *   - core.hooksPath at a directory that does not exist: no repository hook runs with a token in its
 *     environment (a checked-out repository's hooks are whatever its last writer left there);
 *   - protocol.allow=never + protocol.https.allow=always: no ext::, file:// or ssh transport;
 *   - core.fsmonitor=false: a repository config cannot name a command for git to run.
 * The SYSTEM config is still read, on purpose: it is admin-owned (GIT_CONFIG_SYSTEM is not passed from
 * the caller), and on Git for Windows it carries the TLS backend and CA bundle git needs to reach
 * https at all; its credential.helper is reset by the first pair above.
 * With GIT_CONFIG_GLOBAL at an empty file (buildInnerEnv) and only clone / fetch / push / ls-remote
 * allowed (allowlist.mjs — no pull, so no merge), a token-holding git runs no filter or merge driver:
 * a fresh clone's config defines none, and fetch / push / ls-remote never run one.
 */
export function gitConfigEnv({ nodePath = process.execPath, helperPath } = {}) {
  const fwd = (p) => String(p).replace(/\\/g, "/");
  const pairs = [
    ["credential.helper", ""],
    ["credential.helper", `!"${fwd(nodePath)}" "${fwd(helperPath)}"`],
    ["core.hooksPath", fwd(join(selfRoot(), "bridge", "no-hooks"))],
    ["protocol.allow", "never"],
    ["protocol.https.allow", "always"],
    ["core.fsmonitor", "false"],
  ];
  const env = { GIT_CONFIG_COUNT: String(pairs.length) };
  pairs.forEach(([k, v], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = k;
    env[`GIT_CONFIG_VALUE_${i}`] = v;
  });
  return env;
}

/**
 * The nearest vc-secrets declaration files, walking up from `start` the way vc-secrets does: the first
 * directory holding `.claude/vc-secrets.local.json` or `.claude/vc-secrets.json`. Returns the parsed
 * files (local and project) found there, or null.
 *
 * `~/.claude` is skipped, as vc-secrets' configPaths skips it: it is the USER scope's home, and the walk
 * passes through it for any cwd under $HOME. Taking it for a project made the home directory the
 * project root, so a call from an undeclared folder ran against the user's own declaration.
 */
export function findDeclarations(start = process.cwd(), env = process.env) {
  const canonical = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  const userClaude = canonical(join(env.HOME || os.homedir(), ".claude"));
  let dir = resolve(start);
  for (;;) {
    const local = join(dir, ".claude", "vc-secrets.local.json");
    const project = join(dir, ".claude", "vc-secrets.json");
    if ((existsSync(local) || existsSync(project)) && canonical(join(dir, ".claude")) !== userClaude) {
      const read = (f) => {
        if (!existsSync(f)) return null;
        try {
          return JSON.parse(readFileSync(f, "utf8"));
        } catch {
          return { _unparsable: true };
        }
      };
      return { root: dir, local: read(local), project: read(project), localPath: local };
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Is the vc-secrets task (or, with kind "servers", the server) `name` declared in the nearest declaration? */
export function declared(decls, name, kind = "tasks") {
  if (!decls) return false;
  return [decls.local, decls.project].some((d) => d && d[kind] && typeof d[kind] === "object" && name in d[kind]);
}

/** Is the vc-secrets task for this group declared in the nearest declaration? */
export function taskDeclared(decls, group) {
  return declared(decls, taskName(group));
}

/** The environments whose passwords the nearest declaration keeps in vc-secrets. */
export function passwordEnvs(decls) {
  return [...new Set([decls?.local, decls?.project].flatMap((d) => Object.keys(declaredPasswords(d))))];
}

/**
 * The task an `onboard` call runs: the current env's `vc-init-onboard.<env>` when its passwords are in
 * vc-secrets, else `vc-init-onboard` when a token axis declared it, else none (run directly). Pure.
 * @returns {{ task: string|null, env: string|null }}
 */
export function onboardRoute(decls, env) {
  if (declared(decls, onboardTask(env))) return { task: onboardTask(env), env };
  return { task: taskDeclared(decls, "onboard") ? taskName("onboard") : null, env: null };
}

/**
 * The command to run for a bridge tool.
 * @param {string} tool
 * @param {string[]} args
 * @param {{ trustedOnly?: boolean }} opts  inner side: plugin files only from this install's own location
 * @returns {{ command: string, args: string[] } | { error: string }}
 */
export function commandFor(tool, args, { trustedOnly = false } = {}) {
  const node = process.execPath;
  const vcFix = (rel) => {
    const file = resolvePluginFile("vc-fix", rel, { trustedOnly });
    return file ? { command: node, args: [file, ...args] } : { error: `vc-fix is not installed (looked for ${rel}) — /plugin install vc-fix@ai-tools` };
  };
  switch (tool) {
    case "gh": return { command: "gh", args };
    case "git-gh":
    case "git-ado": return { command: "git", args };
    case "ado": return vcFix("skills/qa-fix-routing/ado.mjs");
    case "jira": return vcFix("skills/qa-fix-routing/jira.mjs");
    case "deliver": return vcFix("skills/vc-self-check/deliver.mjs");
    case "onboard": {
      const [script, ...rest] = args;
      const file = join(selfRoot(), "skills", "project-init", `${script}.mjs`);
      return existsSync(file) ? { command: node, args: [file, ...rest] } : { error: `onboarding script ${script}.mjs is missing from ${selfRoot()}` };
    }
    default: return { error: `unknown tool ${tool}` };
  }
}

function say(message) {
  process.stderr.write(`vc-run: ${message}\n`);
}

/** Run a child, optionally piping its output through redactors; resolves to its exit code. */
export function runChild(command, args, { env = process.env, secrets = [], emails = [] } = {}) {
  return new Promise((done) => {
    const redact = secrets.length > 0;
    let child;
    try {
      child = spawn(command, args, { env, stdio: ["inherit", redact ? "pipe" : "inherit", redact ? "pipe" : "inherit"], windowsHide: true });
    } catch (e) {
      say(`cannot start ${command}: ${e.message}`);
      done(EX_UNAVAILABLE);
      return;
    }
    const forward = (sig) => () => {
      try {
        child.kill(sig);
      } catch {
        /* already gone */
      }
    };
    const onInt = forward("SIGINT");
    const onTerm = forward("SIGTERM");
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    const sinks = [];
    if (redact) {
      for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
        const r = createRedactor(secrets, { emails });
        sinks.push(new Promise((ended) => {
          stream.on("data", (c) => {
            const text = r.push(c);
            if (text) out.write(text);
          });
          stream.on("end", () => {
            const tail = r.end();
            if (tail) out.write(tail);
            ended();
          });
          stream.on("error", () => ended());
        }));
      }
    }
    child.on("error", (e) => {
      say(e.code === "ENOENT" ? `${command} is not installed or not on PATH` : `${command} failed to start: ${e.message}`);
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      done(EX_UNAVAILABLE);
    });
    child.on("close", async (code, signal) => {
      await Promise.all(sinks);
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
      done(signal ? 1 : (code ?? 1));
    });
  });
}

const USAGE = `usage: node "$VC_RUN" <tool> [args…]
  gh <pr|issue|run|repo|release|search|workflow|label|api> …   GitHub CLI
  git-gh  [-C <dir>] <clone|fetch|push|ls-remote> …               git on github.com (merge locally after fetch)
  git-ado [-C <dir>] <clone|fetch|push|ls-remote> …               git on Azure Repos
  ado <command> …        vc-fix qa-fix-routing/ado.mjs
  jira <command> …       vc-fix qa-fix-routing/jira.mjs
  deliver …              vc-fix vc-self-check/deliver.mjs
  onboard <script> …     vc-init /project-init scripts (verify-access, discover-repos, discover-tracker, derive-context)
  playwright <lane>      a Playwright MCP lane with the current env's passwords from vc-secrets (.mcp.json runs this)
  --where                print what the bridge resolves (plugins, vc-secrets, the project's declared tasks)`;

/** OUTER side. */
async function outer(argv) {
  const [tool, ...args] = argv;
  if (!tool || tool === "--help" || tool === "-h") {
    process.stdout.write(`${USAGE}\n`);
    return tool ? 0 : EX_REFUSED;
  }
  if (tool === "--where") {
    const decls = findDeclarations(process.cwd());
    const report = {
      vcInit: selfRoot(),
      vcFix: resolvePluginRoot("vc-fix"),
      vcSecrets: vcSecretsShim().path || null,
      vcSecretsPresent: vcSecretsShim().present,
      declarations: decls ? decls.root : null,
      tasks: Object.fromEntries(GROUPS.map((g) => [taskName(g), taskDeclared(decls, g)])),
      passwordEnvs: passwordEnvs(decls),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  const refusal = hostRefusal(tool, findGovernance(process.cwd()));
  if (refusal) {
    say(refusal);
    return EX_CONFIG;
  }
  if (tool === "playwright") return playwrightLane(args);
  const check = checkArgv(tool, args);
  if (!check.ok) {
    say(`refused — ${check.reason}`);
    return EX_REFUSED;
  }
  const group = groupOf(tool);
  // From the cwd, exactly as vc-secrets finds its declarations: the route decided here and the task
  // vc-secrets then launches must come from the same file.
  const decls = findDeclarations(process.cwd());
  const route = group === "onboard"
    ? onboardRoute(decls, currentEnv(decls ? decls.root : process.cwd(), passwordEnvs(decls)))
    : { task: taskDeclared(decls, group) ? taskName(group) : null, env: null };
  if (route.task) {
    const { path: shim, present, source } = vcSecretsShim();
    if (!present) {
      say(`the ${group} axis keeps its secrets in vc-secrets, but ${source === "VC_SECRETS" ? `VC_SECRETS points at a missing file (${shim})` : "the vc-secrets shim is not installed"} — run /project-init --check (its §0d installs the shim and writes VC_SECRETS into this project's .claude/settings.local.json), then restart Claude Code`);
      return EX_UNAVAILABLE;
    }
    // TEST_ENV goes along, so the scripts load the env files of the env whose passwords they received.
    return runChild(process.execPath, [shim, "task", route.task], {
      env: { ...process.env, ...(route.env ? { TEST_ENV: route.env } : {}), VC_RUN_ARGV: JSON.stringify([tool, ...args]) },
    });
  }
  // A session axis (gh auth login / az login / Atlassian OAuth): no secret to inject, so no inner side.
  const cmd = commandFor(tool, args);
  if (cmd.error) {
    say(cmd.error);
    return EX_UNAVAILABLE;
  }
  return runChild(cmd.command, cmd.args);
}

/**
 * OUTER side of a Playwright lane: run the vc-secrets server `playwright-<lane>.<env>` of the current env.
 * stdio passes straight through (MCP), and nothing here holds a secret.
 */
async function playwrightLane(args) {
  const check = checkPlaywright(args);
  if (!check.ok) {
    say(`refused — ${check.reason}`);
    return EX_REFUSED;
  }
  const decls = findDeclarations(process.cwd());
  const envs = passwordEnvs(decls);
  const env = currentEnv(decls ? decls.root : process.cwd(), envs);
  const server = laneServer(args[0], env);
  if (!declared(decls, server, "servers")) {
    say(envs.length
      ? `no vc-secrets server ${server} — passwords are declared for ${envs.join(", ")} only; set TEST_ENV (or .env.test-env) to one of them, or add this env with /project-init --add-env, then restart Claude Code`
      : `no vc-secrets server ${server} — this project keeps its passwords in .env.local; re-run gen-mcp.mjs (/project-init --check) to rewrite .mcp.json`);
    return EX_UNAVAILABLE;
  }
  const { path: shim, present } = vcSecretsShim();
  if (!present) {
    say("the vc-secrets shim is not installed — run /project-init --check, then restart Claude Code");
    return EX_UNAVAILABLE;
  }
  return runChild(process.execPath, [shim, "run", server]);
}

/** INNER side — runs inside `vc-secrets task vc-init-<group>`, with that group's secrets in its env. */
async function inner(group) {
  if (!GROUPS.includes(group)) {
    say(`refused — unknown group ${JSON.stringify(group)}`);
    return EX_REFUSED;
  }
  let argv;
  try {
    argv = JSON.parse(process.env.VC_RUN_ARGV || "null");
  } catch {
    argv = null;
  }
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((a) => typeof a !== "string")) {
    say("refused — VC_RUN_ARGV must be a JSON array of strings (the bridge's outer side sets it)");
    return EX_REFUSED;
  }
  const [tool, ...args] = argv;
  // The project is the one whose declarations vc-secrets trusted for this launch — found from the cwd,
  // exactly as vc-secrets found them. Its profile and env files are the ones the child reads, and its
  // profile alone says whether the project is host-governed.
  const decls = findDeclarations(process.cwd());
  if (!decls) {
    say("refused — no vc-secrets declaration above the working directory; the inner side runs only inside a declared project");
    return EX_REFUSED;
  }
  const refusal = hostRefusal(tool, findGovernance(decls.root, { useEnv: false }));
  if (refusal) {
    say(refusal);
    return EX_CONFIG;
  }
  if (!toolInGroup(tool, group)) {
    say(`refused — ${JSON.stringify(tool)} does not belong to the ${group} group; a task never runs another axis's tool`);
    return EX_REFUSED;
  }
  const check = checkArgv(tool, args);
  if (!check.ok) {
    say(`refused — ${check.reason}`);
    return EX_REFUSED;
  }
  const { env, secrets } = buildInnerEnv(process.env, group, { projectRoot: decls.root });
  if (group !== "onboard" && Object.keys(secrets).length === 0) {
    say(`vc-secrets started the ${group} task without its secret (${GROUP_SECRETS[group].join(", ")}) — check the declaration with "node \\"$VC_SECRETS\\" doctor"`);
    return EX_UNAVAILABLE;
  }
  const cmd = commandFor(tool, args, { trustedOnly: true });
  if (cmd.error) {
    say(cmd.error);
    return EX_UNAVAILABLE;
  }
  // Created only now that the child will run, and removed whatever way it ends.
  const own = bridgeConfig();
  try {
    return await runChild(cmd.command, cmd.args, {
      env: { ...env, GH_CONFIG_DIR: own.ghConfigDir, GIT_CONFIG_GLOBAL: own.gitGlobalConfig },
      secrets: Object.values(secrets),
      emails: [process.env.JIRA_EMAIL, process.env.JIRA_USER].filter(Boolean),
    });
  } finally {
    own.cleanup();
  }
}

/**
 * The bridge's own, empty configuration for one inner launch: a fresh gh config directory and an empty
 * global git config, under the user's own data directory. The home comes from the OS account
 * (os.userInfo), not HOME / USERPROFILE, which the caller sets.
 */
function bridgeConfig() {
  let home;
  try {
    home = os.userInfo().homedir;
  } catch {
    home = os.homedir();
  }
  const base = join(home, ".claude", "plugins", "data", "vc-init-ai-tools", "bridge");
  mkdirSync(base, { recursive: true });
  const gitGlobalConfig = join(base, "gitconfig-empty");
  writeFileSync(gitGlobalConfig, "");
  const ghConfigDir = mkdtempSync(join(base, "gh-"));
  return {
    ghConfigDir,
    gitGlobalConfig,
    cleanup: () => {
      try {
        rmSync(ghConfigDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

/**
 * Entry point, called by the stable shim (vc-run-shim.mjs → <data>/vc-run.mjs).
 * @param {string[]} argv
 * @param {{ shimContract?: number }} [opts]
 */
export async function runBridge(argv, { shimContract } = {}) {
  void shimContract;
  let code;
  try {
    if (argv[0] === "--playwright") {
      // Started by the vc-secrets server playwright-<lane>.<env>: the lane runs in THIS process, and
      // a started server keeps it alive on stdin — no exit code to set.
      const { runPlaywrightMcp } = await import("./playwright-mcp.mjs");
      code = await runPlaywrightMcp(argv.slice(1));
      if (code === undefined) return undefined;
    } else {
      code = argv[0] === "--inner" ? await inner(argv[1]) : await outer(argv);
    }
  } catch (e) {
    say(`internal error: ${e?.message || e}`);
    code = EX_SOFTWARE;
  }
  process.exitCode = code;
  return code;
}

// Also runnable directly (development, tests): node bridge/run.mjs <tool> …
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runBridge(process.argv.slice(2));
}
