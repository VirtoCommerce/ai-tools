// The runner bridge tool (vc-test U32, B10): it runs agent-written .spec files and node check scripts with
// the current env's test-user passwords. These cases are the ones a regression would turn into a leak or
// into code running from anywhere: a token in the child, a file outside the declared roots, an env the
// profile never listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArgv, toolInGroup } from "./allowlist.mjs";
import { buildInnerEnv } from "./run.mjs";
import { checkRunnerFiles, checkRunnerShape, findPlaywright, runnerCommand, runnerEnvAllowed } from "./runner.mjs";
import { runnerTask } from "../skills/project-init/lib/passwords.mjs";

const RUN = fileURLToPath(new URL("./run.mjs", import.meta.url));
const ok = (r) => assert.equal(r.ok, true, r.reason);
const no = (r, re) => {
  assert.equal(r.ok, false);
  if (re) assert.match(r.reason, re);
};

function project({ test: block = { environments: { vcst: { writable: true } }, scriptRoots: ["reports/tickets"] }, decl } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vc-runner-"));
  mkdirSync(join(dir, "reports", "tickets"), { recursive: true });
  writeFileSync(join(dir, "project-profile.json"), JSON.stringify({ schemaVersion: 3, test: block }));
  if (decl) {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "vc-secrets.local.json"), JSON.stringify(decl));
  }
  return dir;
}

test("shape: only `playwright <spec…>` or `node <script> [args…]`, no flags for the runner", () => {
  for (const bad of [[], ["bash"], ["node"], ["node", "-e", "x"], ["node", "x.sh"], ["playwright"], ["playwright", "--config", "x.ts", "a.spec.ts"], ["playwright", "a.ts"]]) {
    no(checkRunnerShape(bad));
  }
  ok(checkRunnerShape(["node", "check.mjs", "--flag", "-e"]));
  ok(checkRunnerShape(["playwright", "a.spec.ts", "b.spec.mjs"]));
  assert.equal(checkArgv("runner", ["node", "a\n.mjs"]).ok, false);
  assert.equal(checkArgv("runner", ["node", "check.mjs"]).ok, true);
});

test("files: inside a declared root only, checked after realpath", () => {
  const dir = project();
  const roots = { projectRoot: dir, scriptRoots: ["reports/tickets"] };
  writeFileSync(join(dir, "reports", "tickets", "ok.mjs"), "");
  writeFileSync(join(dir, "outside.mjs"), "");
  ok(checkRunnerFiles(["node", "reports/tickets/ok.mjs"], roots));
  no(checkRunnerFiles(["node", "reports/tickets/../../outside.mjs"], roots), /outside/);
  no(checkRunnerFiles(["node", join(dir, "outside.mjs")], roots), /outside/);
  no(checkRunnerFiles(["node", "reports/tickets/missing.mjs"], roots), /no such file/);
  // A link inside the root that points out of it (a junction on Windows needs no privilege).
  mkdirSync(join(dir, "elsewhere"));
  writeFileSync(join(dir, "elsewhere", "evil.mjs"), "");
  symlinkSync(join(dir, "elsewhere"), join(dir, "reports", "tickets", "link"), "junction");
  no(checkRunnerFiles(["node", "reports/tickets/link/evil.mjs"], roots), /outside/);
  no(checkRunnerFiles(["node", "reports/tickets/ok.mjs"], { projectRoot: dir, scriptRoots: [] }), /run \/vc-test:init/);
  no(checkRunnerFiles(["node", "reports/tickets/ok.mjs"], { projectRoot: dir }), /run \/vc-test:init/);
});

test("env: only an environment the profile's test block lists", () => {
  no(runnerEnvAllowed(null, "vcst"), /run \/vc-test:init/);
  no(runnerEnvAllowed({}, "vcst"), /vcst/);
  no(runnerEnvAllowed({ environments: { qa: { writable: true } } }, "prod"), /prod/);
  ok(runnerEnvAllowed({ environments: { vcst: { writable: false } } }, "vcst"));
});

test("inner env: passwords only — never a token, never NODE_OPTIONS", () => {
  const source = { ...process.env, ADMIN_PASSWORD: "p1", GH_TOKEN: "t1", GITHUB_TOKEN: "t2", GITHUB_FIX_BUGS_TOKEN: "t3", ADO_PAT: "t4", JIRA_API_TOKEN: "t5", NODE_OPTIONS: "--require x" };
  const { env, secrets } = buildInnerEnv(source, "runner");
  assert.equal(env.ADMIN_PASSWORD, "p1");
  for (const k of ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_FIX_BUGS_TOKEN", "ADO_PAT", "JIRA_API_TOKEN", "NODE_OPTIONS"]) assert.equal(k in env, false, k);
  assert.deepEqual(secrets, { ADMIN_PASSWORD: "p1" });
});

test("groups: runner is its own group, and no other tool runs in it", () => {
  assert.equal(toolInGroup("runner", "runner"), true);
  assert.equal(toolInGroup("runner", "onboard"), false);
  assert.equal(toolInGroup("gh", "runner"), false);
  assert.equal(runnerTask("vcst"), "vc-init-runner.vcst");
});

test("command: a fixed argv, the pinned config, the project's own Playwright first", () => {
  assert.deepEqual(runnerCommand(["playwright", "a.spec.ts"], { node: "N", playwrightCli: "CLI", config: "CFG", files: ["/abs/a.spec.ts"] }),
    { command: "N", args: ["CLI", "test", "--config", "CFG", "/abs/a.spec.ts"] });
  assert.deepEqual(runnerCommand(["node", "c.mjs", "--x", "1"], { node: "N", files: ["/abs/c.mjs"] }), { command: "N", args: ["/abs/c.mjs", "--x", "1"] });
  const dir = project();
  const plugin = (name, rel) => (name === "vc-test" ? `/plugin/${rel}` : null);
  assert.deepEqual(findPlaywright(dir, plugin), { playwrightCli: "/plugin/node_modules/@playwright/test/cli.js", config: "/plugin/harness/playwright.config.mjs" });
  mkdirSync(join(dir, "node_modules", "@playwright", "test"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "@playwright", "test", "cli.js"), "");
  assert.equal(findPlaywright(dir, plugin).playwrightCli, join(dir, "node_modules", "@playwright", "test", "cli.js"));
  assert.match(findPlaywright(dir, () => null).error, /vc-test/);
});

function bridge(args, { cwd, env = {} }) {
  const clean = { ...process.env };
  for (const k of ["VC_SECRETS", "VC_RUN_ARGV", "TEST_ENV", "VC_FIX_HOME", "PROJECT_PROFILE_PATH"]) delete clean[k];
  return spawnSync(process.execPath, [RUN, ...args], { cwd, env: { ...clean, ...env }, encoding: "utf8" });
}

test("outer: an env the test block does not list is refused before anything starts", () => {
  const dir = project();
  writeFileSync(join(dir, "reports", "tickets", "c.mjs"), "console.log('ran')");
  const r = bridge(["runner", "node", "reports/tickets/c.mjs"], { cwd: dir, env: { TEST_ENV: "prod" } });
  assert.equal(r.status, 64, r.stderr);
  assert.doesNotMatch(r.stdout, /ran/);
  const none = project({ test: {} });
  writeFileSync(join(none, "reports", "tickets", "c.mjs"), "console.log('ran')");
  assert.equal(bridge(["runner", "node", "reports/tickets/c.mjs"], { cwd: none, env: { TEST_ENV: "vcst" } }).status, 64);
});

test("outer: a declared runner task gets the argv; with none, the script runs directly in the project", () => {
  const dir = project({ decl: { tasks: { [runnerTask("vcst")]: { command: "node" } } } });
  writeFileSync(join(dir, "reports", "tickets", "c.mjs"), "console.log('ran')");
  const fake = join(dir, "fake-vc-secrets.mjs");
  writeFileSync(fake, "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), forwarded: process.env.VC_RUN_ARGV }));");
  const r = bridge(["runner", "node", "reports/tickets/c.mjs"], { cwd: dir, env: { TEST_ENV: "vcst", VC_SECRETS: fake } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.argv, ["task", runnerTask("vcst")]);
  assert.deepEqual(JSON.parse(out.forwarded), ["runner", "node", "reports/tickets/c.mjs"]);
  const direct = project();
  writeFileSync(join(direct, "reports", "tickets", "c.mjs"), "console.log(process.cwd(), process.env.NODE_OPTIONS ?? 'none')");
  const d = bridge(["runner", "node", "reports/tickets/c.mjs"], { cwd: direct, env: { TEST_ENV: "vcst", NODE_OPTIONS: "--no-warnings" } });
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /none/);
});

test("inner: passwords reach the script, tokens do not, and the output is redacted", () => {
  const dir = project({ decl: { tasks: { [runnerTask("vcst")]: { command: "node" } } } });
  writeFileSync(join(dir, "reports", "tickets", "leak.mjs"),
    "console.log(process.env.ADMIN_PASSWORD, ['GH_TOKEN','GITHUB_TOKEN','ADO_PAT','JIRA_API_TOKEN'].filter((k) => k in process.env).join(',') || 'no-tokens')");
  const r = bridge(["--inner", "runner"], { cwd: dir, env: {
    TEST_ENV: "vcst", VC_RUN_ARGV: JSON.stringify(["runner", "node", "reports/tickets/leak.mjs"]),
    ADMIN_PASSWORD: "Sup3r-Secret-Pw!", GH_TOKEN: "ghp_x", GITHUB_TOKEN: "ghp_y", ADO_PAT: "ado", JIRA_API_TOKEN: "jira",
  } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Sup3r-Secret-Pw!/);
  assert.match(r.stdout, /«redacted» no-tokens/);
});

test("inner: another group's task cannot run the runner, and the runner task cannot run another tool", () => {
  const dir = project({ decl: { tasks: { [runnerTask("vcst")]: { command: "node" } } } });
  writeFileSync(join(dir, "reports", "tickets", "c.mjs"), "");
  assert.equal(bridge(["--inner", "onboard"], { cwd: dir, env: { VC_RUN_ARGV: JSON.stringify(["runner", "node", "reports/tickets/c.mjs"]) } }).status, 64);
  assert.equal(bridge(["--inner", "runner"], { cwd: dir, env: { ADMIN_PASSWORD: "p", VC_RUN_ARGV: JSON.stringify(["gh", "pr", "list"]) } }).status, 64);
});
