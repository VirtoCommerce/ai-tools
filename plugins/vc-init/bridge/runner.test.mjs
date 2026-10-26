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
import { checkRunnerFiles, checkRunnerShape, fileFilter, findPlaywright, runnerCommand, runnerEnvAllowed } from "./runner.mjs";
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
  // Only what the test sets: a machine's own *PASSWORD variable (CI's PGPASSWORD) is a password too.
  const source = { PATH: process.env.PATH, ADMIN_PASSWORD: "p1", GH_TOKEN: "t1", GITHUB_TOKEN: "t2", GITHUB_FIX_BUGS_TOKEN: "t3", ADO_PAT: "t4", JIRA_API_TOKEN: "t5", NODE_OPTIONS: "--require x" };
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
    { command: "N", args: ["CLI", "test", "--config", "CFG", "^[\\\\/]abs[\\\\/]a\\.spec\\.ts$"] });
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

// ── Fix pass after the branch review ─────────────────────────────────────────────────────────────

test("review 1: a Playwright file filter is an anchored, escaped pattern that matches either separator", () => {
  const win = "C:\\Users\\a\\reports\\tickets\\a.spec.ts";
  const [, , , , filter] = runnerCommand(["playwright", "a.spec.ts"], { node: "N", playwrightCli: "CLI", config: "CFG", files: [win] }).args;
  for (const p of [win, "C:/Users/a/reports/tickets/a.spec.ts"]) assert.equal(new RegExp(filter, "gi").test(p), true, p);
  assert.equal(new RegExp(filter, "gi").test("C:/Users/a/reports/tickets/b.spec.ts"), false);
  const [, , , , wide] = runnerCommand(["playwright", "x|.spec.ts"], { node: "N", playwrightCli: "CLI", config: "CFG", files: ["/p/r/x|.spec.ts"] }).args;
  assert.equal(new RegExp(wide, "gi").test("/p/other/any.spec.ts"), false);
  assert.equal(new RegExp(wide, "gi").test("/p/r/x|.spec.ts"), true);
});

test("review 2: the direct route runs the child on the env it checked", () => {
  const dir = project({ test: { environments: { qa: {} }, scriptRoots: ["reports/tickets"] }, decl: { tasks: { "vc-init-onboard.qa": { command: "node", env: { ADMIN_PASSWORD: "secret:admin-password-qa" } } } } });
  writeFileSync(join(dir, "reports", "tickets", "env.mjs"), "console.log('env=' + process.env.TEST_ENV)");
  const r = bridge(["runner", "node", "reports/tickets/env.mjs"], { cwd: dir, env: {} });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /env=qa/);
});

test("review 3: passwords kept in .env.local are redacted from the output too", () => {
  const dir = project();
  writeFileSync(join(dir, ".env.local"), "ADMIN_PASSWORD_VCST=FilePw-12345\nUSER_PASSWORD=Plain-Pw-678\n");
  writeFileSync(join(dir, "reports", "tickets", "p.mjs"),
    "import { readFileSync } from 'node:fs'; console.log(readFileSync('.env.local', 'utf8'))");
  const r = bridge(["runner", "node", "reports/tickets/p.mjs"], { cwd: dir, env: { TEST_ENV: "vcst" } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /FilePw-12345|Plain-Pw-678/);
});

test("review 4: the inner side reads the declared project's own profile, never a parent's", () => {
  const parent = project();
  const child = join(parent, "sub");
  mkdirSync(join(child, ".claude"), { recursive: true });
  mkdirSync(join(child, "reports", "tickets"), { recursive: true });
  writeFileSync(join(child, ".claude", "vc-secrets.local.json"), JSON.stringify({ tasks: { [runnerTask("vcst")]: { command: "node" } } }));
  writeFileSync(join(child, "reports", "tickets", "c.mjs"), "console.log('ran')");
  writeFileSync(join(parent, "reports", "tickets", "c.mjs"), "console.log('ran')"); // so only the profile decides
  const r = bridge(["--inner", "runner"], { cwd: child, env: { TEST_ENV: "vcst", ADMIN_PASSWORD: "p", VC_RUN_ARGV: JSON.stringify(["runner", "node", "reports/tickets/c.mjs"]) } });
  assert.equal(r.status, 64, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /ran/);
});

test("review 5: a scriptRoot outside the project is no root at all", () => {
  const dir = project();
  const inner = join(dir, "proj");
  mkdirSync(inner);
  no(checkRunnerFiles(["node", join(dir, "outside.mjs")], { projectRoot: inner, scriptRoots: [".."] }));
  writeFileSync(join(dir, "outside.mjs"), "");
  no(checkRunnerFiles(["node", join(dir, "outside.mjs")], { projectRoot: inner, scriptRoots: [".."] }), /outside the project/);
});

test("review 9: the runner keeps PLAYWRIGHT_BROWSERS_PATH (not a credential)", () => {
  const { env } = buildInnerEnv({ ...process.env, PLAYWRIGHT_BROWSERS_PATH: "D:/pw" }, "runner");
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, "D:/pw");
});

// ── Fix pass after the PR review ─────────────────────────────────────────────────────────────────

test("pr review 1+2: .env.playwright.local and every env's .env.local passwords are redacted", () => {
  const dir = project();
  writeFileSync(join(dir, ".env.local"), "ADMIN_PASSWORD_VCST=Vcst-Pw-111\nADMIN_PASSWORD_VIRTOSTART=Other-Env-Pw-222\n");
  writeFileSync(join(dir, ".env.playwright.local"), "USER_PASSWORD=Lane-Pw-333\n");
  writeFileSync(join(dir, "reports", "tickets", "p.mjs"),
    "import { readFileSync } from 'node:fs'; console.log(readFileSync('.env.local', 'utf8'), readFileSync('.env.playwright.local', 'utf8'))");
  const r = bridge(["runner", "node", "reports/tickets/p.mjs"], { cwd: dir, env: { TEST_ENV: "vcst" } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Vcst-Pw-111|Other-Env-Pw-222|Lane-Pw-333/);
});

test("pr review 3: the Playwright filter accepts the real path and the path as walked", () => {
  const filter = new RegExp(fileFilter("C:\\real\\proj\\a.spec.ts", "S:\\proj\\a.spec.ts"), "gi");
  for (const p of ["C:\\real\\proj\\a.spec.ts", "S:/proj/a.spec.ts"]) {
    filter.lastIndex = 0;
    assert.equal(filter.test(p), true, p);
  }
  filter.lastIndex = 0;
  assert.equal(filter.test("S:/proj/b.spec.ts"), false);
});

test("pr review 5: a relative file argument resolves from the caller's cwd, not the project root", () => {
  const dir = project();
  writeFileSync(join(dir, "reports", "tickets", "c.mjs"), "console.log('right')");
  writeFileSync(join(dir, "tickets.mjs"), "");
  const r = bridge(["runner", "node", "tickets/c.mjs"], { cwd: join(dir, "reports"), env: { TEST_ENV: "vcst" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /right/);
});
