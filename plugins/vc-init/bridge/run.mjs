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
 * Exit codes: the child's own, or 64 refused by the allowlist, 69 the bridge's prerequisites are
 * missing (vc-secrets, vc-fix, a declared secret), 70 an internal error.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, checkArgv, groupOf, toolInGroup } from "./allowlist.mjs";
import { createRedactor } from "./redact.mjs";
import { resolvePluginFile, resolvePluginRoot, selfRoot } from "./resolve-plugin.mjs";

export const EX_REFUSED = 64;
export const EX_UNAVAILABLE = 69;
export const EX_SOFTWARE = 70;

/** The env var each group's secret arrives in (the task declaration binds it to `secret:<name>`). */
export const GROUP_SECRETS = Object.freeze({
  github: ["GITHUB_FIX_BUGS_TOKEN"],
  ado: ["ADO_PAT"],
  jira: ["JIRA_API_TOKEN"],
  onboard: ["GITHUB_FIX_BUGS_TOKEN", "ADO_PAT", "JIRA_API_TOKEN"],
});

/** The vc-secrets task name for a group. */
export const taskName = (group) => `vc-init-${group}`;

/**
 * Environment keys the inner side passes to its child. Everything else the caller had — including any
 * credential exported in the shell — is dropped. Names are matched case-insensitively (Windows keeps
 * `Path`, `SystemRoot`, … in mixed case).
 */
const ENV_KEEP = [
  "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "OS", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
  "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "COMMONPROGRAMFILES",
  "USERNAME", "USER", "LOGNAME", "SHELL", "TEMP", "TMP", "TMPDIR", "LANG", "LANGUAGE", "TERM", "TZ", "NO_COLOR", "FORCE_COLOR",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "GIT_SSL_CAINFO", "REQUESTS_CA_BUNDLE",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "GH_CONFIG_DIR", "AZURE_CONFIG_DIR", "GIT_EXEC_PATH",
  "TEST_ENV", "VC_FIX_HOME", "PROJECT_PROFILE_PATH", "CLAUDE_PROJECT_DIR", "CLAUDE_CODE_SESSION_ID", "HOST_SESSION_ID",
  // Identifiers only. Anything that names a HOST (JIRA_BASE_URL, ADO_ORG, …) is deliberately not
  // passed: the child reads those from the profile and the .env files, so a caller cannot point a
  // token-holding script at another server by exporting a variable.
  "JIRA_EMAIL", "JIRA_USER",
];
const ENV_KEEP_PREFIX = ["LC_"];

/** Build the inner child's environment: kept keys + this group's secrets + the bridge's own settings. */
export function buildInnerEnv(source, group, { nodePath = process.execPath, helperPath = join(selfRoot(), "bridge", "git-credential.mjs") } = {}) {
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
  Object.assign(env, secrets);
  if (secrets.GITHUB_FIX_BUGS_TOKEN) env.GH_TOKEN = secrets.GITHUB_FIX_BUGS_TOKEN;
  if (secrets.ADO_PAT) env.ADO_AUTH = "pat";
  Object.assign(env, {
    VC_BRIDGE: "1",
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  }, gitConfigEnv({ nodePath, helperPath }));
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
 */
export function findDeclarations(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    const local = join(dir, ".claude", "vc-secrets.local.json");
    const project = join(dir, ".claude", "vc-secrets.json");
    if (existsSync(local) || existsSync(project)) {
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

/** Is the vc-secrets task for this group declared in the nearest declaration? */
export function taskDeclared(decls, group) {
  if (!decls) return false;
  const name = taskName(group);
  return [decls.local, decls.project].some((d) => d && d.tasks && typeof d.tasks === "object" && name in d.tasks);
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
  git-gh  [-C <dir>] <clone|fetch|pull|push|ls-remote> …          git on github.com
  git-ado [-C <dir>] <clone|fetch|pull|push|ls-remote> …          git on Azure Repos
  ado <command> …        vc-fix qa-fix-routing/ado.mjs
  jira <command> …       vc-fix qa-fix-routing/jira.mjs
  deliver …              vc-fix vc-self-check/deliver.mjs
  onboard <script> …     vc-init /project-init scripts (verify-access, discover-repos, discover-tracker, derive-context)
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
      vcSecrets: process.env.VC_SECRETS || null,
      vcSecretsPresent: Boolean(process.env.VC_SECRETS && existsSync(process.env.VC_SECRETS)),
      declarations: decls ? decls.root : null,
      tasks: Object.fromEntries(GROUPS.map((g) => [taskName(g), taskDeclared(decls, g)])),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }
  const check = checkArgv(tool, args);
  if (!check.ok) {
    say(`refused — ${check.reason}`);
    return EX_REFUSED;
  }
  const group = groupOf(tool);
  // From the cwd, exactly as vc-secrets finds its declarations: the route decided here and the task
  // vc-secrets then launches must come from the same file.
  const decls = findDeclarations(process.cwd());
  if (taskDeclared(decls, group)) {
    const shim = process.env.VC_SECRETS;
    if (!shim || !existsSync(shim)) {
      say(`the ${group} axis keeps its token in vc-secrets, but VC_SECRETS ${shim ? `points at a missing file (${shim})` : "is not set"} — run /vc-secrets:install, add VC_SECRETS to ~/.claude/settings.json "env", and restart Claude Code`);
      return EX_UNAVAILABLE;
    }
    return runChild(process.execPath, [shim, "task", taskName(group)], {
      env: { ...process.env, VC_RUN_ARGV: JSON.stringify([tool, ...args]) },
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
  if (!toolInGroup(tool, group)) {
    say(`refused — ${JSON.stringify(tool)} does not belong to the ${group} group; a task never runs another axis's tool`);
    return EX_REFUSED;
  }
  const check = checkArgv(tool, args);
  if (!check.ok) {
    say(`refused — ${check.reason}`);
    return EX_REFUSED;
  }
  const { env, secrets } = buildInnerEnv(process.env, group);
  if (group !== "onboard" && Object.keys(secrets).length === 0) {
    say(`vc-secrets started the ${group} task without its secret (${GROUP_SECRETS[group].join(", ")}) — check the declaration with "node \\"$VC_SECRETS\\" doctor"`);
    return EX_UNAVAILABLE;
  }
  const cmd = commandFor(tool, args, { trustedOnly: true });
  if (cmd.error) {
    say(cmd.error);
    return EX_UNAVAILABLE;
  }
  return runChild(cmd.command, cmd.args, {
    env,
    secrets: Object.values(secrets),
    emails: [process.env.JIRA_EMAIL, process.env.JIRA_USER].filter(Boolean),
  });
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
    code = argv[0] === "--inner" ? await inner(argv[1]) : await outer(argv);
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
