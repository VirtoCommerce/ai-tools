// The permission boundary of /review-pr-gh-workflow: .claude/hooks/review-pr-allow.mjs (what is
// approved without a prompt), its registration in settings.json and the skill frontmatter, the
// helper's tool list, and the argument and git-hook guards of prepare.mjs, which that hook approves.
// Committed on purpose — exempt from when-to-write-a-test.md RULE 2 like plugins/vc-secrets/: a
// regression here widens what runs without the user's yes, silently, and no other gate checks it.
// Both scripts are driven as subprocesses with the JSON a PreToolUse hook receives; nothing is mocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = realpathSync.native(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const HOOK = join(ROOT, ".claude", "hooks", "review-pr-allow.mjs");
const PREPARE = ".claude/skills/review-pr-gh-workflow/prepare.mjs";
const SLUG = ROOT.replace(/[^A-Za-z0-9]/g, "-");

// A session scratchpad as Claude Code lays it out: <tmp>/claude-…/<slug>/<session>/scratchpad.
const TMP = realpathSync.native(mkdtempSync(join(tmpdir(), "claude-unit-")));
const SCRATCH = join(TMP, SLUG, "session", "scratchpad");
const PR_DIR = join(SCRATCH, "pr-7");
mkdirSync(join(SCRATCH, "wt", "pr-7"), { recursive: true });
mkdirSync(PR_DIR, { recursive: true });
for (const f of ["pr.diff", ".env.local", "deploy.pem"]) writeFileSync(join(PR_DIR, f), "x\n");
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));
const fwd = (p) => p.replace(/\\/g, "/");

function hook(input) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify({ cwd: ROOT, ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "none";
}
const read = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });
const web = (url) => ({ tool_name: "WebFetch", tool_input: { url } });
const bash = (command, cwd = ROOT) => ({ tool_name: "Bash", tool_input: { command }, cwd });

test("default mode: approves only reads inside the review scratch, never a credential name", () => {
  assert.equal(hook(read(join(PR_DIR, "pr.diff"))), "allow");
  assert.equal(hook(read(fwd(join(PR_DIR, "pr.diff")))), "allow");
  assert.equal(hook({ tool_name: "Grep", tool_input: { pattern: "x", path: PR_DIR } }), "allow");
  assert.equal(hook({ tool_name: "Glob", tool_input: { pattern: "**/*", path: join(SCRATCH, "wt") } }), "allow");
  for (const input of [
    read(join(PR_DIR, ".env.local")), read(join(PR_DIR, "deploy.pem")),
    read(join(ROOT, "package.json")), read(join(SCRATCH, "other.txt")),
    read(join(PR_DIR, "..", "..", "..", "..", "x")), read("\\\\server\\share\\scratchpad\\pr-1\\a"),
    { tool_name: "Glob", tool_input: { pattern: "../../*", path: PR_DIR } },
    { tool_name: "Grep", tool_input: { pattern: "x", path: PR_DIR, glob: "/etc/*" } },
    { tool_name: "Grep", tool_input: { pattern: "x" } },
    { tool_name: "Edit", tool_input: { file_path: join(PR_DIR, "pr.diff") } },
  ]) assert.equal(hook(input), "none", JSON.stringify(input));
  // Another project's scratchpad, and a link inside the scratch that leads out: decided on the real path.
  const other = join(TMP, "other-project", "session", "scratchpad", "pr-7");
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "pr.diff"), "x\n");
  assert.equal(hook(read(join(other, "pr.diff"))), "none", "another project's scratch");
  const link = join(PR_DIR, "out");
  symlinkSync(join(ROOT, "scripts"), link, "junction");
  assert.equal(hook(read(join(link, "unit", "review-pr-allow.test.mjs"))), "none", "a link out of the scratch");
});

test("default mode: WebFetch only of docs pages on WEB_HOSTS", () => {
  for (const u of ["https://docs.github.com/en/actions", "https://learn.microsoft.com/en-us/powershell/x",
    "https://www.gnu.org/software/bash/manual/bash.html", "https://nodejs.org/api/fs.html",
    "https://rhysd.github.io/actionlint/", "https://docs.zizmor.sh/audits/",
    "https://learn.microsoft.com/en-us/powershell/x?view=powershell-7.4", "https://docs.github.com/en/actions#section"])
    assert.equal(hook(web(u)), "allow", u);
  for (const u of ["http://docs.github.com/", "https://docs.github.com.evil.io/", "https://user:p@docs.github.com/",
    "https://docs.github.com:8443/", "https://learn.microsoft.com/en-us/azure/x", "https://www.gnu.org/licenses/",
    "https://nodejs.org/en/", "https://rhysd.github.io/other/", "https://evil.example/?k=1", "https://evil.example/x",
    "https://learn.microsoft.com/en-us/dotnet/powershell/x", "not a url",
    "https://docs.zizmor.sh/x?d=secret", "https://docs.github.com/en/actions?x=1", "https://learn.microsoft.com/en-us/powershell/x?view=a&d=1"])
    assert.equal(hook(web(u)), "none", u);
});

test("default mode: approves prepare.mjs only as one plain command from the project directory", () => {
  const ok = `node ${PREPARE} .github 45 C:/src/.github C:/Users/ABCDEF~1/AppData/Local/Temp/claude/x/y/scratchpad`;
  assert.equal(hook(bash(ok)), "allow");
  assert.equal(hook(bash(ok, TMP)), "none", "from another directory a PR-planted script could run");
  for (const c of [`${ok}; rm -rf x`, `${ok} && x`, `${ok} | tee x`, `${ok} $(id)`, `${ok} \`id\``,
    `${ok}\nid`, `${ok} > out`, `${ok} 'x'`, `node ${PREPARE} .github 45 ~/src C:/s`, `node ${PREPARE} log x=~/a`,
    `node ${PREPARE} .github 45 C:\\src C:/s`, `node ${PREPARE} .github 45 *`, `node ./${PREPARE} .github 45`,
    `node .claude/skills/other/prepare.mjs .github 45`, `node ${PREPARE}x`, `id; ${ok}`, `x && ${ok}`,
    `node ${PREPARE} search $GH_TOKEN`, `node ${PREPARE} search {a,b}`, `node ${PREPARE} search a#b`])
    assert.equal(hook(bash(c)), "none", c);
});

test("malformed input gets no decision", () => {
  assert.equal(hook("not json"), "none");
  assert.equal(hook(""), "none");
});

// The registration Claude Code runs. settings.json reaches the helpers (only settings hooks fire inside
// a subagent) and so runs in every session: it must stay one Read entry behind an `if`, so no process
// starts for any other call. The helper's own boundary is its tool list: Read and nothing else.
const SETTINGS = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8"));
test("the helper has Read only, and settings.json runs this hook for scratch Reads only", () => {
  const agent = readFileSync(join(ROOT, ".claude/agents/pr-review-reader.md"), "utf8");
  assert.match(agent, /^tools: Read\r?$/m, "pr-review-reader must have Read and nothing else");
  const ours = SETTINGS.hooks.PreToolUse.flatMap((e) => e.hooks.filter((h) => /review-pr-/.test(h.command))
    .map((h) => ({ matcher: e.matcher, if: h.if })));
  assert.deepEqual(ours, [{ matcher: "^Read$", if: "Read(//**/scratchpad/**)" }]);
});

// The skill frontmatter's Grep/Glob command (the lead only, once the skill is invoked) — run exactly,
// through sh, as the harness does.
const skillLine = readFileSync(join(ROOT, ".claude/skills/review-pr-gh-workflow/SKILL.md"), "utf8")
  .split(/\r?\n/).find((l) => l.includes("review-pr-allow.mjs") && l.includes("*scratchpad*"));
const SKILL_COMMAND = skillLine && JSON.parse(skillLine.match(/command: ("(?:[^"\\]|\\.)*")/)[1]);
function viaShell(command, input) {
  const r = spawnSync("sh", ["-c", command], { input: JSON.stringify({ cwd: ROOT, ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "none";
}
test("SKILL.md: the lead's Grep/Glob command allows the scratch and decides nothing else", () => {
  assert.ok(SKILL_COMMAND, "no Grep/Glob hook in the skill frontmatter");
  assert.equal(viaShell(SKILL_COMMAND, { tool_name: "Grep", tool_input: { pattern: "x", path: PR_DIR } }), "allow");
  assert.equal(viaShell(SKILL_COMMAND, { tool_name: "Glob", tool_input: { pattern: "*", path: fwd(PR_DIR) } }), "allow");
  assert.equal(viaShell(SKILL_COMMAND, { tool_name: "Grep", tool_input: { pattern: "x", path: "scripts" } }), "none");
  assert.equal(viaShell(SKILL_COMMAND, { tool_name: "Glob", tool_input: { pattern: "*", path: join(SCRATCH, "x") } }), "none");
});


function prepare(args) {
  return spawnSync(process.execPath, [PREPARE, ...args], { cwd: ROOT, encoding: "utf8" });
}

test("prepare.mjs: no argument may become a gh or git option", () => {
  for (const args of [["search", "--web"], ["ref", "-x", "main", "a"], ["runs", "x", "-w"], [".github", "--help", "c", "s"]]) {
    const r = prepare(args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /may not start with "-"/);
  }
});

test("prepare.mjs: a git hook the PR's tree carries never runs", () => {
  const clone = join(TMP, "clone");
  const g = (...a) => execFileSync("git", ["-C", clone, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" });
  execFileSync("git", ["init", "-q", clone]);
  g("remote", "add", "origin", "https://github.com/VirtoCommerce/unit.git");
  // husky's layout: a relative hooksPath, which git resolves inside whichever worktree runs the hook.
  g("config", "core.hooksPath", ".husky/_");
  mkdirSync(join(clone, ".husky", "_"), { recursive: true });
  for (const name of ["post-checkout", "reference-transaction"]) {
    const f = join(clone, ".husky", "_", name);
    writeFileSync(f, `#!/bin/sh\necho ran > "${fwd(join(TMP, name))}"\n`);
    chmodSync(f, 0o755);
  }
  g("add", "-A");
  g("commit", "-qm", "hooks");
  for (const f of ["post-checkout", "reference-transaction"]) rmSync(join(TMP, f), { force: true });

  const r = prepare(["snapshot", clone, SCRATCH]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(SCRATCH, "wt", "snapshot", ".husky", "_", "post-checkout")), "the snapshot was checked out");
  assert.ok(!existsSync(join(TMP, "post-checkout")), "post-checkout from the PR ran");
  assert.ok(!existsSync(join(TMP, "reference-transaction")), "reference-transaction from the PR ran");
  assert.equal(prepare(["snapshot-cleanup", clone, SCRATCH]).status, 0);
});

test("prepare.mjs: a user's submodule.recurse=true does not make the checkout fetch the PR's submodules", () => {
  // A local repository stands in for the host a PR's .gitmodules would name; file transport is allowed
  // in the clone's config so that only submodule.recurse decides whether the fetch happens.
  const sub = join(TMP, "subsrc"), clone = join(TMP, "clone-sub");
  const git = (dir, ...a) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t",
    "-c", "protocol.file.allow=always", ...a], { stdio: "ignore" });
  execFileSync("git", ["init", "-q", sub]);
  writeFileSync(join(sub, "fetched.txt"), "x\n");
  git(sub, "add", "-A"); git(sub, "commit", "-qm", "sub");
  execFileSync("git", ["init", "-q", clone]);
  git(clone, "remote", "add", "origin", "https://github.com/VirtoCommerce/unit.git");
  git(clone, "submodule", "add", "-q", fwd(sub), "vendored");
  git(clone, "commit", "-qm", "with submodule");
  git(clone, "config", "submodule.recurse", "true");
  git(clone, "config", "protocol.file.allow", "always");
  const r = prepare(["snapshot", clone, SCRATCH]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(SCRATCH, "wt", "snapshot", ".gitmodules")), "the snapshot was checked out");
  assert.ok(!existsSync(join(SCRATCH, "wt", "snapshot", "vendored", "fetched.txt")), "the submodule was fetched");
  assert.equal(prepare(["snapshot-cleanup", clone, SCRATCH]).status, 0);
});

test("prepare.mjs: refuses a scratch directory of another project", () => {
  const other = join(TMP, "other-project", "session", "scratchpad");
  mkdirSync(other, { recursive: true });
  const r = prepare(["fetch", other, "1", "VirtoCommerce/.github", "main", "README.md"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not a session scratchpad/);
});
