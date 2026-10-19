// The $VC_RUN dispatcher (bridge/run.mjs): which route a call takes, what the inner side refuses,
// what its child's environment holds, and that the child's output is redacted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInnerEnv, findDeclarations, gitConfigEnv, runChild, taskDeclared, taskName } from "./run.mjs";

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
  for (const k of ["VC_SECRETS", "VC_RUN_ARGV", "GITHUB_FIX_BUGS_TOKEN", "ADO_PAT", "JIRA_API_TOKEN", "VC_FIX_HOME"]) delete clean[k];
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
  const r = bridge(["ado", "whoami"], { cwd: dir });
  assert.equal(r.status, 69);
  assert.match(r.stderr, /vc-secrets:install/);
});

test("outer: the exit code of the task is propagated", () => {
  const dir = project({ tasks: { [taskName("jira")]: { command: "node" } } });
  const fake = join(dir, "fake.mjs");
  writeFileSync(fake, "process.exit(7);");
  assert.equal(bridge(["jira", "get", "--key", "A-1"], { cwd: dir, env: { VC_SECRETS: fake } }).status, 7);
});

test("inner: a tool from another group is refused (no escalation between axes)", () => {
  const r = bridge(["--inner", "github"], { env: { VC_RUN_ARGV: JSON.stringify(["ado", "whoami"]), GITHUB_FIX_BUGS_TOKEN: TOKEN } });
  assert.equal(r.status, 64);
  assert.match(r.stderr, /does not belong to the github group/);
  const r2 = bridge(["--inner", "onboard"], { env: { VC_RUN_ARGV: JSON.stringify(["gh", "api", "user"]), GITHUB_FIX_BUGS_TOKEN: TOKEN } });
  assert.equal(r2.status, 64);
});

test("inner: the allowlist is re-checked — VC_RUN_ARGV is caller-controlled", () => {
  const r = bridge(["--inner", "github"], { env: { VC_RUN_ARGV: JSON.stringify(["gh", "auth", "token"]), GITHUB_FIX_BUGS_TOKEN: TOKEN } });
  assert.equal(r.status, 64);
  assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
});

test("inner: malformed VC_RUN_ARGV, an unknown group, a missing secret", () => {
  assert.equal(bridge(["--inner", "github"], { env: { VC_RUN_ARGV: "gh pr list" } }).status, 64);
  assert.equal(bridge(["--inner", "github"], { env: { VC_RUN_ARGV: "[1]" } }).status, 64);
  assert.equal(bridge(["--inner", "root"], { env: { VC_RUN_ARGV: '["gh","pr","list"]' } }).status, 64);
  const r = bridge(["--inner", "github"], { env: { VC_RUN_ARGV: '["gh","pr","list"]' } });
  assert.equal(r.status, 69);
  assert.match(r.stderr, /without its secret/);
});

test("inner env: kept keys + this group's secret only; a caller's other credentials are dropped", () => {
  const source = {
    PATH: "/bin", Path: "C:\\bin", SystemRoot: "C:\\Windows", TEST_ENV: "qa", LC_ALL: "C",
    GITHUB_FIX_BUGS_TOKEN: TOKEN, ADO_PAT: "adopat0123456789", JIRA_API_TOKEN: "jiratok0123456789",
    AWS_SECRET_ACCESS_KEY: "aws", NODE_OPTIONS: "--require evil.js", GIT_TRACE: "1", GIT_SSH_COMMAND: "evil",
  };
  const { env, secrets } = buildInnerEnv(source, "github", { nodePath: "/n/node", helperPath: "/h/git-credential.mjs" });
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
