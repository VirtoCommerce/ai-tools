// Option B — test-user passwords in vc-secrets (skills/project-init/lib/passwords.mjs): the Playwright
// lane that takes them from memory (bridge/playwright-mcp.mjs), the bridge routes that pick the current
// env's declaration (bridge/run.mjs), and the declarations write-secrets-decl.mjs builds for them.
// The property that matters: a password reaches only the declared process of its own env, and the
// declaration changes only when an env or a lane changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackage, pinnedVersion, refusal, takePasswords } from "./playwright-mcp.mjs";
import { buildInnerEnv, onboardRoute, passwordEnvs } from "./run.mjs";
import { checkPlaywright } from "./allowlist.mjs";
import { currentEnv, declaredLanes, declaredPasswords, envFilePasswords, passwordSecret, splitSuffixedKey, vcSecretsRoles } from "../skills/project-init/lib/passwords.mjs";
import { laneCommands } from "../skills/project-init/lib/playwright-lanes.mjs";
import { buildDeclarations, nextPasswords } from "../skills/project-init/write-secrets-decl.mjs";

const RUN = fileURLToPath(new URL("./run.mjs", import.meta.url));
const SHIM = "/data/vc-init-ai-tools/vc-run.mjs";
const SPEC = "@playwright/mcp@0.0.77";
const LANES = { edge: { command: "npx", args: ["-y", "-p", SPEC, "node", SHIM, "--playwright", SPEC, "--browser", "msedge"] } };

test("the lane takes only bare password names, and every PASSWORD key leaves the environment", () => {
  const { secrets, env, dropped } = takePasswords({
    ADMIN_PASSWORD: "a", USER_PASSWORD: "", ADMIN_PASSWORD_VCST: "other-env", PLAYWRIGHT_MCP_SECRETS_FILE: "f", API_KEY_PASSWORD: "k", PATH: "p",
  });
  assert.deepEqual(secrets, { ADMIN_PASSWORD: "a" });
  assert.deepEqual(env, { PATH: "p" });
  assert.deepEqual(dropped.sort(), ["ADMIN_PASSWORD", "ADMIN_PASSWORD_VCST", "API_KEY_PASSWORD", "PLAYWRIGHT_MCP_SECRETS_FILE", "USER_PASSWORD"]);
});

test("a password file or an HTTP listener is refused on the lane's command line", () => {
  assert.match(refusal(["--secrets", "x.env"]), /password file/);
  assert.match(refusal(["--secrets=x.env"]), /password file/);
  assert.match(refusal(["--port", "8931"]), /stdio only/);
  assert.equal(refusal(["--browser", "msedge", "--isolated"]), null);
  assert.equal(pinnedVersion(SPEC), "0.0.77");
  assert.equal(pinnedVersion("@playwright/mcp@latest"), null);
  assert.equal(pinnedVersion("@playwright/mcp"), null);
});

test("the package is found through npx's .bin on PATH, and only at the pinned version", () => {
  const manifests = {
    [join("/old/node_modules/.bin", "..", "@playwright", "mcp", "package.json")]: JSON.stringify({ version: "0.0.70" }),
    [join("/npx/node_modules/.bin", "..", "@playwright", "mcp", "package.json")]: JSON.stringify({ version: "0.0.77" }),
  };
  const fs = { exists: (p) => p in manifests, read: (p) => manifests[p] };
  const path = ["/usr/bin", "/old/node_modules/.bin", "/npx/node_modules/.bin"].join(delimiter);
  assert.equal(findPackage(path, "0.0.77", fs), join("/npx/node_modules/.bin", "..", "@playwright", "mcp"));
  assert.equal(findPackage(path, "0.0.78", fs), null);
});

test("the lane's outer side takes one lane name and nothing else", () => {
  assert.equal(checkPlaywright(["chrome"]).ok, true);
  assert.equal(checkPlaywright([]).ok, false);
  assert.equal(checkPlaywright(["chrome", "--secrets", "x"]).ok, false);
  assert.equal(checkPlaywright(["../evil"]).ok, false);
});

test("names: one vc-secrets entry per password per env, and a suffixed key maps back to it", () => {
  assert.equal(passwordSecret("ADMIN_PASSWORD", "vcptcore_qa1"), "admin-password-vcptcore-qa1");
  assert.throws(() => passwordSecret("GITHUB_TOKEN", "vcst"));
  assert.throws(() => passwordSecret("ADMIN_PASSWORD", "Bad-Env"));
  assert.deepEqual(splitSuffixedKey("USER_PASSWORD_VCPTCORE_QA1", ["vcst", "vcptcore_qa1"]), { name: "USER_PASSWORD", env: "vcptcore_qa1" });
  assert.equal(splitSuffixedKey("ADMIN_PASSWORD_OTHER", ["vcst"]), null);
});

test("the current env: TEST_ENV, else .env.test-env, else the only declared env, else vcst", () => {
  const dir = mkdtempSync(join(tmpdir(), "vc-env-"));
  assert.equal(currentEnv(dir, ["a", "b"], { env: { TEST_ENV: "b" } }), "b");
  assert.equal(currentEnv(dir, ["staging"], { env: {} }), "staging");
  assert.equal(currentEnv(dir, ["a", "b"], { env: {} }), "vcst");
  writeFileSync(join(dir, ".env.test-env"), "# chosen once\nTEST_ENV=a\n");
  assert.equal(currentEnv(dir, ["a", "b"], { env: {} }), "a");
});

test("declarations: per env its secrets, an onboard task with the tokens + its passwords, and its lanes", () => {
  const passwords = nextPasswords({}, { addEnvs: ["vcst", "staging"] });
  const d = buildDeclarations(null, { pat: { github: false, ado: false, jira: true }, shim: SHIM, projectId: "p", passwords, lanes: LANES });
  assert.deepEqual(d.tasks["vc-init-onboard.vcst"], {
    command: "node", args: [SHIM, "--inner", "onboard"],
    env: { JIRA_API_TOKEN: "secret:jira-token", ADMIN_PASSWORD: "secret:admin-password-vcst", USER_PASSWORD: "secret:user-password-vcst" },
  });
  assert.deepEqual(d.servers["playwright-edge.staging"].env, {
    ADMIN_PASSWORD: "secret:admin-password-staging", USER_PASSWORD: "secret:user-password-staging", npm_config_prefer_offline: "literal:true",
  });
  assert.deepEqual(declaredPasswords(d), passwords);
  // A lane server names its env, so it can read that env's .env.local roles; read back, the lane is env-free.
  assert.deepEqual(d.servers["playwright-edge.vcst"].args.slice(5, 9), ["--playwright", SPEC, "--vc-env", "vcst"]);
  assert.deepEqual(declaredLanes(d), LANES);
  // Kept as is when nothing changes; an env removed leaves nothing of it behind.
  const again = buildDeclarations(d, { pat: { jira: true }, shim: SHIM, projectId: "p" });
  assert.equal(JSON.stringify(again), JSON.stringify(d));
  const back = buildDeclarations(d, { pat: { jira: true }, shim: SHIM, projectId: "p", passwords: nextPasswords(declaredPasswords(d), { addEnvs: "none" }), lanes: {} });
  assert.deepEqual(Object.keys(back.secrets), ["jira-token"]);
  assert.deepEqual(Object.keys(back.tasks), ["vc-init-jira", "vc-init-onboard"]);
  assert.equal(back.servers, undefined);
});

test("an extra password name joins the given envs only, and a bad name or env is refused", () => {
  const p = nextPasswords({ vcst: ["ADMIN_PASSWORD", "USER_PASSWORD"], qa: ["ADMIN_PASSWORD", "USER_PASSWORD"] }, { addEnvs: ["qa"], addNames: ["EUR_USER_PASSWORD"] });
  assert.deepEqual(p, { vcst: ["ADMIN_PASSWORD", "USER_PASSWORD"], qa: ["ADMIN_PASSWORD", "EUR_USER_PASSWORD", "USER_PASSWORD"] });
  assert.throws(() => nextPasswords({}, { addEnvs: ["Staging-2"] }));
  assert.throws(() => nextPasswords({}, { addEnvs: ["qa"], addNames: ["ADO_PAT"] }));
});

test("a lane's command comes from the template entry: the pin twice, the project's own config, no --secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "vc-lanes-"));
  mkdirSync(join(root, "config"));
  writeFileSync(join(root, "config", "mcp-playwright-firefox.config.json"), "{}");
  writeFileSync(join(root, ".env.playwright.local"), "ADMIN_PASSWORD=x\n");
  const servers = {
    "playwright-firefox": { command: "cmd", args: ["/c", "npx", SPEC, "--browser", "firefox", "--isolated", "--output-dir", "reports/bugs/screenshots/_incoming/firefox"] },
    "playwright-chrome": { command: "cmd", args: ["/c", "npx", SPEC, "--browser", "chrome", "--output-dir", "x/chrome"] },
    "Chrome DevTools": { command: "cmd", args: ["/c", "npx", "chrome-devtools-mcp@1.6.0"] },
  };
  const lanes = laneCommands({ servers, root, shim: SHIM });
  assert.deepEqual(Object.keys(lanes).sort(), ["chrome", "firefox"]);
  assert.deepEqual(lanes.firefox.args, ["-y", "-p", SPEC, "node", SHIM, "--playwright", SPEC, "--config", join(root, "config", "mcp-playwright-firefox.config.json")]);
  assert.deepEqual(lanes.chrome.args.slice(7), ["--browser", "chrome", "--output-dir", join(root, "reports", "bugs", "screenshots", "_incoming", "chrome")]);
});

test("onboard runs the current env's password task when declared, else the token task, else directly", () => {
  const decls = { local: { tasks: { "vc-init-onboard": {}, "vc-init-onboard.vcst": { env: { ADMIN_PASSWORD: "secret:admin-password-vcst" } } } } };
  assert.deepEqual(passwordEnvs(decls), ["vcst"]);
  assert.deepEqual(onboardRoute(decls, "vcst"), { task: "vc-init-onboard.vcst", env: "vcst" });
  assert.deepEqual(onboardRoute(decls, "staging"), { task: "vc-init-onboard", env: null });
  assert.deepEqual(onboardRoute({ local: {} }, "vcst"), { task: null, env: null });
});

test("the onboard child gets the injected passwords (masked in its output); another group's child does not", () => {
  const source = { PATH: "p", ADMIN_PASSWORD: "pw-1", JIRA_API_TOKEN: "t" };
  assert.deepEqual(buildInnerEnv(source, "onboard").secrets, { JIRA_API_TOKEN: "t", ADMIN_PASSWORD: "pw-1" });
  assert.equal(buildInnerEnv(source, "jira").env.ADMIN_PASSWORD, undefined);
});

test("a lane of an env with no declaration fails with the envs that have one, and starts nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "vc-lane-"));
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".claude", "vc-secrets.local.json"), JSON.stringify({
    tasks: { "vc-init-onboard.vcst": { env: { ADMIN_PASSWORD: "secret:admin-password-vcst" } } },
    servers: { "playwright-chrome.vcst": { command: "npx", args: [] } },
  }));
  const env = { ...process.env, TEST_ENV: "staging", VC_SECRETS: join(dir, "no-such-shim.mjs") };
  const r = spawnSync(process.execPath, [RUN, "playwright", "chrome"], { cwd: dir, encoding: "utf8", env });
  assert.equal(r.status, 69);
  assert.match(r.stderr, /no vc-secrets server playwright-chrome\.staging .*declared for vcst/);
  const refused = spawnSync(process.execPath, [RUN, "playwright", "chrome", "--secrets"], { cwd: dir, encoding: "utf8", env });
  assert.equal(refused.status, 64);
});

test("per role: a new env takes the roles the project keeps in vc-secrets, or the ones asked for", () => {
  const adminsOnly = nextPasswords({}, { addEnvs: ["vcst"], roles: ["admin"] });
  assert.deepEqual(adminsOnly, { vcst: ["ADMIN_PASSWORD"] });
  assert.deepEqual(vcSecretsRoles(adminsOnly), ["admin"]);
  assert.deepEqual(nextPasswords(adminsOnly, { addEnvs: ["staging"] }), { vcst: ["ADMIN_PASSWORD"], staging: ["ADMIN_PASSWORD"] });
  assert.deepEqual(nextPasswords({}, { addEnvs: ["qa"] }), { qa: ["ADMIN_PASSWORD", "USER_PASSWORD"] });
  assert.throws(() => nextPasswords({}, { addEnvs: ["qa"], roles: ["root"] }));
});

test("a lane reads its own env's .env.local passwords: suffixed first, then bare, never another env's or a token", () => {
  const text = [
    "USER_PASSWORD=bare-for-every-env",
    "USER_PASSWORD_VCST=\"with space # and hash\"",
    "BUYER2_PASSWORD_VCST=b2 # a note",
    "ADMIN_PASSWORD_STAGING=other-env",
    "GITHUB_TOKEN_VCST=never",
    "EMPTY_PASSWORD_VCST=",
  ].join("\n");
  assert.deepEqual(envFilePasswords(text, "vcst"), { USER_PASSWORD: "with space # and hash", BUYER2_PASSWORD: "b2" });
  assert.deepEqual(envFilePasswords(text, "qa"), { USER_PASSWORD: "bare-for-every-env" });
});
