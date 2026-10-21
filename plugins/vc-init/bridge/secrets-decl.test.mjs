// The vc-secrets declaration writer (skills/project-init/write-secrets-decl.mjs). Its output is what
// the operator approves with `vc-secrets trust`, so the property that matters is that it only changes
// when something worth re-approving changed — never on a re-run or a plugin update.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeclarations, newProjectId } from "../skills/project-init/write-secrets-decl.mjs";

const WRITER = fileURLToPath(new URL("../skills/project-init/write-secrets-decl.mjs", import.meta.url));
const SHIM = "/data/vc-init-ai-tools/vc-run.mjs";

const write = (cwd, args) => {
  const r = spawnSync(process.execPath, [WRITER, "--shim", SHIM, ...args], { cwd, encoding: "utf8", env: { ...process.env, VC_FIX_HOME: "" } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test("one secret + one task per PAT axis, and an onboard task carrying all of them", () => {
  const d = buildDeclarations(null, { pat: { github: true, ado: true, jira: false }, shim: SHIM, projectId: "vcqa-x-0000" });
  assert.deepEqual(Object.keys(d.secrets), ["github-pat", "ado-pat"]);
  assert.deepEqual(Object.keys(d.tasks), ["vc-init-github", "vc-init-ado", "vc-init-onboard"]);
  assert.deepEqual(d.tasks["vc-init-github"], { command: "node", args: [SHIM, "--inner", "github"], env: { GITHUB_FIX_BUGS_TOKEN: "secret:github-pat", GITHUB_TOKEN: "secret:github-pat" } });
  assert.deepEqual(d.tasks["vc-init-onboard"].env, { GITHUB_FIX_BUGS_TOKEN: "secret:github-pat", GITHUB_TOKEN: "secret:github-pat", ADO_PAT: "secret:ado-pat" });
  assert.equal(d.projectId, "vcqa-x-0000");
});

test("no PAT axis ⇒ nothing owned is declared, and a person's own entries survive", () => {
  const mine = { secrets: { mine: { backend: "local" } }, tasks: { loadtest: { command: "bash", args: ["run.sh"] } }, vaults: { v: {} } };
  const withPat = buildDeclarations(mine, { pat: { github: true }, shim: SHIM, projectId: "p" });
  const d = buildDeclarations(withPat, { pat: { github: false, ado: false, jira: false }, shim: SHIM, projectId: "p" });
  assert.deepEqual(d.secrets, { mine: { backend: "local" } });
  assert.deepEqual(d.tasks, { loadtest: { command: "bash", args: ["run.sh"] } });
  assert.deepEqual(d.vaults, { v: {} });
});

test("the GitHub MCP server is declared only on a PAT github axis", () => {
  const server = { command: "node", args: ["x"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "secret:github-pat" } };
  assert.deepEqual(buildDeclarations(null, { pat: { github: true }, shim: SHIM, projectId: "p", githubServer: server }).servers, { github: server });
  assert.equal(buildDeclarations(null, { pat: { github: false }, shim: SHIM, projectId: "p", githubServer: server }).servers, undefined);
  const had = buildDeclarations(null, { pat: { github: true }, shim: SHIM, projectId: "p", githubServer: server });
  assert.equal(buildDeclarations(had, { pat: { github: true }, shim: SHIM, projectId: "p", githubServer: null }).servers, undefined);
  // Not passed at all ⇒ an existing declaration is kept as it is.
  assert.deepEqual(buildDeclarations(had, { pat: { github: true }, shim: SHIM, projectId: "p" }).servers, { github: server });
});

test("projectId: vc-secrets' name shape, from the directory name", () => {
  assert.equal(newProjectId("/work/Acme QA_Project", () => "beef"), "vcqa-acme-qa-project-beef");
  assert.match(newProjectId("C:\\x\\Ü", () => "0000"), /^[a-z0-9-]+$/);
});

test("the CLI is idempotent: a re-run with the same answers does not touch the file or ask for trust", () => {
  const dir = mkdtempSync(join(tmpdir(), "decl-"));
  const first = write(dir, ["--github-auth", "pat", "--jira-auth", "token", "--tracker", "jira", "--client-vcs", "github"]);
  assert.equal(first.status, "written");
  assert.equal(first.trustNeeded, true);
  const text = readFileSync(first.path, "utf8");
  const again = write(dir, ["--github-auth", "pat", "--jira-auth", "pat", "--tracker", "jira", "--client-vcs", "github"]);
  assert.equal(again.status, "unchanged");
  assert.equal(again.trustNeeded, false);
  assert.equal(readFileSync(first.path, "utf8"), text);
  assert.equal(again.projectId, first.projectId);
});

test("the CLI: switching an axis to a session login rewrites and asks for trust again; the projectId is kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "decl-"));
  const first = write(dir, ["--github-auth", "pat", "--ado-auth", "pat", "--tracker", "azure", "--client-vcs", "azure-repos"]);
  const next = write(dir, ["--github-auth", "gh-cli", "--ado-auth", "pat", "--tracker", "azure", "--client-vcs", "azure-repos"]);
  assert.equal(next.status, "written");
  assert.equal(next.trustNeeded, true);
  assert.deepEqual(next.secrets, ["ado-pat"]);
  assert.equal(next.projectId, first.projectId);
});

test("the CLI: an axis that does not apply is never declared (Jira token on an Azure Boards project)", () => {
  const dir = mkdtempSync(join(tmpdir(), "decl-"));
  const r = write(dir, ["--github-auth", "gh-cli", "--jira-auth", "pat", "--tracker", "azure", "--client-vcs", "github", "--ado-auth", "az-login"]);
  assert.deepEqual(r.secrets, []);
  assert.deepEqual(r.tasks, []);
});

test("the CLI: a committed project file's projectId wins over a new one", () => {
  const dir = mkdtempSync(join(tmpdir(), "decl-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "vc-secrets.json"), JSON.stringify({ projectId: "team-qa" }));
  assert.equal(write(dir, ["--github-auth", "pat"]).projectId, "team-qa");
});

test("the CLI writes the .gitignore entry before the file exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "decl-"));
  write(dir, ["--github-auth", "pat"]);
  assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /^\.claude\/vc-secrets\.local\.json$/m);
});
