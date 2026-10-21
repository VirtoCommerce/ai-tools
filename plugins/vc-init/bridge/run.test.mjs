// The $VC_RUN dispatcher (bridge/run.mjs): which route a call takes, what the inner side refuses,
// what its child's environment holds, and that the child's output is redacted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInnerEnv, findDeclarations, findGovernance, gitConfigEnv, hostRefusal, runChild, taskDeclared, taskName } from "./run.mjs";

const RUN = fileURLToPath(new URL("./run.mjs", import.meta.url));
const TOKEN = "ghp_BRIDGETEST0123456789abcdefABCDEF";

function project(decl) {
  const dir = mkdtempSync(join(tmpdir(), "vc-run-"));
  if (decl) {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "vc-secrets.local.json"), JSON.stringify(decl));
  }
  return dir;
}

function bridge(args, { cwd, env = {} } = {}) {
  const clean = { ...process.env };
  for (const k of ["VC_SECRETS", "VC_RUN_ARGV", "GITHUB_FIX_BUGS_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "ADO_PAT", "JIRA_API_TOKEN", "VC_FIX_HOME", "PROJECT_PROFILE_PATH"]) delete clean[k];
  return spawnSync(process.execPath, [RUN, ...args], { cwd, env: { ...clean, ...env }, encoding: "utf8" });
}

test("outer: a refused command line never reaches vc-secrets", () => {
  const dir = project({ tasks: { [taskName("github")]: { command: "node" } } });
  const r = bridge(["gh", "auth", "token"], { cwd: dir, env: { VC_SECRETS: join(dir, "missing.mjs") } });
  assert.equal(r.status, 64);
  assert.match(r.stderr, /refused — gh auth/);
});

test("outer: a PAT axis goes through `vc-secrets task vc-init-<group>` with the argv in VC_RUN_ARGV", () => {
  const dir = project({ tasks: { [taskName("github")]: { command: "node" } } });
  const fake = join(dir, "fake-vc-secrets.mjs");
  writeFileSync(fake, "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), forwarded: process.env.VC_RUN_ARGV }));");
  const r = bridge(["gh", "pr", "view", "12"], { cwd: dir, env: { VC_SECRETS: fake } });
  assert.equal(r.status, 0, r.stderr);
  const seen = JSON.parse(r.stdout);
  assert.deepEqual(seen.argv, ["task", "vc-init-github"]);
  assert.deepEqual(JSON.parse(seen.forwarded), ["gh", "pr", "view", "12"]);
});

test("outer: a PAT axis with vc-secrets missing stops with the install instruction", () => {
  const dir = project({ tasks: { [taskName("ado")]: { command: "node" } } });
  // HOME is an empty temp dir, so the default shim path the bridge falls back to holds nothing. Not the
  // project itself: HOME/.claude is the user scope, which findDeclarations skips, as vc-secrets does.
  const r = bridge(["ado", "whoami"], { cwd: dir, env: { HOME: mkdtempSync(join(tmpdir(), "vc-run-home-")) } });
  assert.equal(r.status, 69);
  assert.match(r.stderr, /project-init --check/);
});

test("outer: the exit code of the task is propagated", () => {
  const dir = project({ tasks: { [taskName("jira")]: { command: "node" } } });
  const fake = join(dir, "fake.mjs");
  writeFileSync(fake, "process.exit(7);");
  assert.equal(bridge(["jira", "get", "--key", "A-1"], { cwd: dir, env: { VC_SECRETS: fake } }).status, 7);
});

test("inner: a tool from another group is refused (no escalation between axes)", () => {
  const cwd = project({ tasks: {} });
  const r = bridge(["--inner", "github"], { cwd, env: { VC_RUN_ARGV: JSON.stringify(["ado", "whoami"]), GITHUB_FIX_BUGS_TOKEN: TOKEN } });
  assert.equal(r.status, 64);
  assert.match(r.stderr, /does not belong to the github group/);
  const r2 = bridge(["--inner", "onboard"], { cwd, env: { VC_RUN_ARGV: JSON.stringify(["gh", "api", "user"]), GITHUB_FIX_BUGS_TOKEN: TOKEN } });
  assert.equal(r2.status, 64);
});

test("inner: the allowlist is re-checked — VC_RUN_ARGV is caller-controlled", () => {
  const r = bridge(["--inner", "github"], { env: { VC_RUN_ARGV: JSON.stringify(["gh", "auth", "token"]), GITHUB_FIX_BUGS_TOKEN: TOKEN } });
  assert.equal(r.status, 64);
  assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
});

test("inner: host governance comes from the declared project, not a PROJECT_PROFILE_PATH the caller set", () => {
  const dir = project({ tasks: {} });
  const elsewhere = project(null);
  writeFileSync(join(elsewhere, "project-profile.json"), JSON.stringify({ governance: { host: "x", secrets: "host" } }));
  const r = bridge(["--inner", "github"], { cwd: dir, env: { VC_RUN_ARGV: '["gh","pr","list"]', PROJECT_PROFILE_PATH: join(elsewhere, "project-profile.json") } });
  assert.equal(r.status, 69, r.stderr);
  writeFileSync(join(dir, "project-profile.json"), JSON.stringify({ governance: { host: "x", secrets: "host" } }));
  assert.equal(bridge(["--inner", "github"], { cwd: dir, env: { VC_RUN_ARGV: '["gh","pr","list"]' } }).status, 78);
});

test("inner: malformed VC_RUN_ARGV, an unknown group, a missing secret", () => {
  assert.equal(bridge(["--inner", "github"], { env: { VC_RUN_ARGV: "gh pr list" } }).status, 64);
  assert.equal(bridge(["--inner", "github"], { env: { VC_RUN_ARGV: "[1]" } }).status, 64);
  assert.equal(bridge(["--inner", "root"], { env: { VC_RUN_ARGV: '["gh","pr","list"]' } }).status, 64);
  // Outside a declared project the inner side refuses before it looks at a secret.
  const none = bridge(["--inner", "github"], { cwd: project(null), env: { VC_RUN_ARGV: '["gh","pr","list"]' } });
  assert.equal(none.status, 64);
  assert.match(none.stderr, /no vc-secrets declaration/);
  const r = bridge(["--inner", "github"], { cwd: project({ tasks: {} }), env: { VC_RUN_ARGV: '["gh","pr","list"]' } });
  assert.equal(r.status, 69);
  assert.match(r.stderr, /without its secret/);
});

test("inner env: kept keys + this group's secret only; a caller's other credentials are dropped", () => {
  const source = {
    PATH: "/bin", Path: "C:\\bin", SystemRoot: "C:\\Windows", TEST_ENV: "qa", LC_ALL: "C",
    GITHUB_FIX_BUGS_TOKEN: TOKEN, ADO_PAT: "adopat0123456789", JIRA_API_TOKEN: "jiratok0123456789",
    AWS_SECRET_ACCESS_KEY: "aws", NODE_OPTIONS: "--require evil.js", GIT_TRACE: "1", GIT_SSH_COMMAND: "evil",
    VC_FIX_HOME: "/elsewhere", PROJECT_PROFILE_PATH: "/elsewhere/p.json", GH_CONFIG_DIR: "/caller/gh", XDG_CONFIG_HOME: "/caller/xdg",
    NODE_EXTRA_CA_CERTS: "/caller/ca.pem", GIT_SSL_CAINFO: "/caller/ca.pem", GIT_CONFIG_GLOBAL: "/caller/gitconfig",
  };
  const { env, secrets } = buildInnerEnv(source, "github", {
    nodePath: "/n/node", helperPath: "/h/git-credential.mjs", projectRoot: "/proj", ghConfigDir: "/own/gh", gitGlobalConfig: "/own/gitconfig",
  });
  // The caller cannot choose the profile, gh's or git's configuration, or a CA: the bridge sets its own.
  assert.equal(env.VC_FIX_HOME, "/proj");
  assert.match(env.PROJECT_PROFILE_PATH, /proj[\\/]project-profile\.json$/);
  assert.equal(env.GH_CONFIG_DIR, "/own/gh");
  assert.equal(env.GIT_CONFIG_GLOBAL, "/own/gitconfig");
  for (const k of ["XDG_CONFIG_HOME", "NODE_EXTRA_CA_CERTS", "GIT_SSL_CAINFO"]) assert.equal(env[k], undefined, k);
  assert.equal(env.GIT_ASKPASS, "");
  assert.deepEqual(Object.keys(secrets), ["GITHUB_FIX_BUGS_TOKEN"]);
  assert.equal(env.GH_TOKEN, TOKEN);
  assert.equal(env.ADO_PAT, undefined);
  assert.equal(env.JIRA_API_TOKEN, undefined);
  for (const k of ["AWS_SECRET_ACCESS_KEY", "NODE_OPTIONS", "GIT_TRACE", "GIT_SSH_COMMAND"]) assert.equal(env[k], undefined, k);
  for (const k of ["PATH", "Path", "SystemRoot", "TEST_ENV", "LC_ALL"]) assert.ok(k in env, k);
  assert.equal(env.VC_BRIDGE, "1");
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  const onboard = buildInnerEnv(source, "onboard").secrets;
  assert.deepEqual(Object.keys(onboard).sort(), ["ADO_PAT", "GITHUB_FIX_BUGS_TOKEN", "JIRA_API_TOKEN"]);
  assert.equal(buildInnerEnv(source, "ado").env.ADO_AUTH, "pat");
  // GITHUB_TOKEN is the same secret under its new name: alone it is the whole github secret, and gh gets it.
  const renamed = buildInnerEnv({ PATH: "/bin", GITHUB_TOKEN: TOKEN }, "github");
  assert.deepEqual(Object.keys(renamed.secrets), ["GITHUB_TOKEN"]);
  assert.equal(renamed.env.GH_TOKEN, TOKEN);
});

test("git config: the helper is reset then pinned, hooks and other transports are off", () => {
  const env = gitConfigEnv({ nodePath: "C:\\Program Files\\nodejs\\node.exe", helperPath: "C:\\p\\git-credential.mjs" });
  const pairs = Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, i) => [env[`GIT_CONFIG_KEY_${i}`], env[`GIT_CONFIG_VALUE_${i}`]]);
  assert.deepEqual(pairs[0], ["credential.helper", ""]);
  assert.deepEqual(pairs[1], ["credential.helper", '!"C:/Program Files/nodejs/node.exe" "C:/p/git-credential.mjs"']);
  const map = Object.fromEntries(pairs.slice(2));
  assert.equal(map["protocol.allow"], "never");
  assert.equal(map["protocol.https.allow"], "always");
  assert.equal(map["core.fsmonitor"], "false");
  assert.match(map["core.hooksPath"], /no-hooks$/);
});

test("declarations: the nearest .claude/vc-secrets*.json up the tree decides the route", () => {
  const dir = project({ tasks: { [taskName("github")]: {} } });
  const nested = join(dir, ".fix-workspace", "repo");
  mkdirSync(nested, { recursive: true });
  const d = findDeclarations(nested);
  assert.equal(d.root, dir);
  assert.equal(taskDeclared(d, "github"), true);
  assert.equal(taskDeclared(d, "ado"), false);
  assert.equal(taskDeclared(null, "github"), false);
});

test("declarations: ~/.claude is the user scope, never a project, as in vc-secrets", () => {
  const home = project({ tasks: { [taskName("github")]: {} } });
  const below = join(home, "work", "undeclared");
  mkdirSync(below, { recursive: true });
  // Not `null`: on Windows os.tmpdir() sits inside the real profile, so the climb may still reach a
  // developer's own ~/.claude, which this fake HOME does not name. What matters is that HOME is not it.
  assert.notEqual(findDeclarations(below, { HOME: home })?.root, home);
  // The same tree under another HOME is an ordinary declared project.
  assert.equal(findDeclarations(below, { HOME: project(null) }).root, home);
});

test("runChild: a child that prints its secret has it masked on both streams", async () => {
  const script = `process.stdout.write("out:" + process.env.T + "\\n"); process.stderr.write("err:" + Buffer.from(":" + process.env.T).toString("base64") + "\\n"); process.exit(3);`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { runChild } from ${JSON.stringify(new URL("./run.mjs", import.meta.url).href)};
    const code = await runChild(process.execPath, ["-e", ${JSON.stringify(script)}], { env: { ...process.env, T: ${JSON.stringify(TOKEN)} }, secrets: [${JSON.stringify(TOKEN)}] });
    process.exitCode = code;
  `], { encoding: "utf8" });
  assert.equal(child.status, 3);
  assert.ok(!child.stdout.includes(TOKEN), child.stdout);
  assert.ok(!child.stderr.includes(Buffer.from(`:${TOKEN}`).toString("base64")), child.stderr);
  assert.match(child.stdout, /out:«redacted»/);
  assert.match(child.stderr, /err:«redacted»/);
  void runChild;
});

// ─── host-governed projects (VCST-6402 step 8) ──────────────────────────────────────────────────
const HOST_GOV = { host: "opus-governance", secrets: "host", servers: { tracker: "azure-mcp-work", codeHost: "azure-mcp-dev", github: "github" } };

function governedProject(extra = {}) {
  const dir = project({ tasks: { [taskName("github")]: { command: "node" }, [taskName("ado")]: { command: "node" } } });
  writeFileSync(join(dir, "project-profile.json"), JSON.stringify({ schemaVersion: 3, governance: HOST_GOV, ...extra }));
  return dir;
}

test("host-governed: EVERY token-bearing tool is refused before vc-secrets is touched, naming the host server", () => {
  const dir = governedProject();
  const fake = join(dir, "fake-vc-secrets.mjs");
  writeFileSync(fake, "require('fs').writeFileSync(process.argv[1] + '.ran', '1');");
  const cases = [
    [["gh", "pr", "list"], /github MCP server/],
    [["git-gh", "ls-remote", "https://github.com/a/b"], /github MCP server/],
    [["git-ado", "ls-remote", "https://dev.azure.com/o/p/_git/r"], /azure-mcp-dev MCP server/],
    [["ado", "whoami"], /azure-mcp-work MCP server/],
    [["jira", "myself"], /azure-mcp-work MCP server/],
    [["deliver", "--json"], /github MCP server/],
    [["onboard", "verify-access"], /MCP server/],
  ];
  for (const [argv, re] of cases) {
    const r = bridge(argv, { cwd: dir, env: { VC_SECRETS: fake, GITHUB_FIX_BUGS_TOKEN: TOKEN } });
    assert.equal(r.status, 78, `${argv.join(" ")}: ${r.stderr}`);
    assert.match(r.stderr, /host-governed project/);
    assert.match(r.stderr, re);
    assert.match(r.stderr, /opus-governance/);
  }
  assert.equal(existsSync(fake + ".ran"), false, "vc-secrets must never be launched on a host-governed project");
});

test("host-governed: the inner side refuses too, even with a token in its environment", () => {
  const dir = governedProject();
  const r = bridge(["--inner", "github"], { cwd: dir, env: { VC_RUN_ARGV: JSON.stringify(["gh", "api", "user"]), GITHUB_FIX_BUGS_TOKEN: TOKEN } });
  assert.equal(r.status, 78);
  assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
});

test("host-governed: the profile is found from a nested directory; no governance ⇒ no refusal", () => {
  const dir = governedProject();
  const nested = join(dir, ".fix-workspace", "repo");
  mkdirSync(nested, { recursive: true });
  assert.equal(findGovernance(nested).host, "opus-governance");
  assert.equal(hostRefusal("gh", null), null);
  assert.equal(hostRefusal("gh", { host: null, secrets: "vc-secrets" }), null);
  assert.match(hostRefusal("ado", HOST_GOV), /azure-mcp-work/);
  assert.match(hostRefusal("git-ado", HOST_GOV), /azure-mcp-dev/);
});
