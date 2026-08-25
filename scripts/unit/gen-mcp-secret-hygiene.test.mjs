// Regression tests for the five must-fix findings of the VCST-5774 review round 2.
//
// Each was reproduced against the previous branch head before being fixed, so each test here is a
// recorded failure, not a hypothesis:
//
//   #1 an unparsable .claude/settings.local.json was silently REPLACED — taking `permissions.deny`
//      (guard #1 of the never-auto-merge interlock) with it — and this change had just made that
//      same file the credential's home.
//   #2 `--inline-secrets false` ENABLED literal substitution: parseArgs yields the string "false"
//      and Boolean("false") is true, so the natural way to disable a safety flag turned it on.
//   #3 a `.gitignore` rule cannot untrack a tracked file, so writing the credential into an
//      already-tracked settings.local.json staged it — under a reassuring `.gitignore +=` line.
//   #4 the ignore block was written only by gen-mcp at §7, while `.env.local` — the file the
//      operator is told to paste real tokens into, during a PAUSE — is created at §3b.
//   #5 the CERTAIN secret net matched any base64 of a JSON object (`{"` encodes to `eyJ`), so an
//      ordinary APP_CONFIG_B64 FAILed readiness.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
import { asBool } from "../../plugins/vc-fix/skills/project-init/gen-mcp.mjs";
import { SECRET_PREFIX_RE } from "../../plugins/vc-fix/hooks/redact.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PI_DIR = join(ROOT, "plugins/vc-fix/skills/project-init");

// spawnSync, not execFileSync: several of these assertions are about a `console.warn`, and
// execFileSync returns ONLY stdout on success — a warning on stderr would read as absent and the
// test would pass for the wrong reason. Returns both streams joined; throws (carrying them) on a
// non-zero exit, so the refuse-to-write tests can assert on the message too.
function runScript(dir, script, args = [], extraEnv = {}) {
  const r = spawnSync(process.execPath, [join(PI_DIR, script), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: dir, GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test", ...extraEnv },
  });
  const out = String(r.stdout || "") + String(r.stderr || "");
  if (r.status !== 0) {
    const err = new Error(`${script} exited ${r.status}`);
    err.stdout = r.stdout;
    err.stderr = r.stderr;
    throw err;
  }
  return out;
}
const runGenMcp = (dir, args = [], extraEnv = {}) => runScript(dir, "gen-mcp.mjs", args, extraEnv);
const outputOf = (err) => String(err?.stdout || "") + String(err?.stderr || "");

// ─── #1 — never flatten a file we cannot read ─────────────────────────────────────
test("#1: an UNPARSABLE settings.local.json halts the run and is left byte-for-byte intact", () => withTempDir((dir) => {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const settingsPath = join(dir, ".claude", "settings.local.json");
  const original = '{\n  "permissions": { "deny": ["Bash(gh pr merge:*)"] },,\n}\n'; // deliberate trailing comma
  writeFileSync(settingsPath, original);

  let err;
  try { runGenMcp(dir); } catch (e) { err = e; }
  assert.ok(err, "the run must fail rather than proceed");
  const out = outputOf(err);
  assert.match(out, /not valid JSON/i);
  assert.match(out, /nothing was written/i);
  assert.equal(readFileSync(settingsPath, "utf8"), original, "the operator's file must be untouched");
  assert.ok(!existsSync(join(dir, ".mcp.json")), "and no partial output left behind");
}));

test("#1: on a NORMAL run every operator key survives — permissions.deny included", () => withTempDir((dir) => {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const settingsPath = join(dir, ".claude", "settings.local.json");
  writeFileSync(settingsPath, JSON.stringify({
    permissions: { deny: ["Bash(gh pr merge:*)", "mcp__github__merge_pull_request"], allow: ["Bash(npm test)"] },
    hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
  }, null, 2));

  runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_survivorcheck12345" });
  const after = JSON.parse(readFileSync(settingsPath, "utf8"));
  assert.deepEqual(after.permissions.deny, ["Bash(gh pr merge:*)", "mcp__github__merge_pull_request"]);
  assert.deepEqual(after.permissions.allow, ["Bash(npm test)"]);
  assert.ok(after.hooks?.Stop, "unrelated keys are preserved");
  assert.equal(after.env.GITHUB_PERSONAL_ACCESS_TOKEN, "ghp_survivorcheck12345", "and ours is merged in");
}));

// ─── #2 — a safety flag must not invert ───────────────────────────────────────────
test("#2: `--inline-secrets false` turns the flag OFF (it used to turn it ON)", () => withTempDir((dir) => {
  runGenMcp(dir, ["--inline-secrets", "false"], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_mustnotinline123" });
  const raw = readFileSync(join(dir, ".mcp.json"), "utf8");
  assert.ok(!raw.includes("ghp_mustnotinline123"), "a literal was written despite --inline-secrets false");
  assert.match(raw, /\$\{GITHUB_PERSONAL_ACCESS_TOKEN\}/);
}));

test("#2: `--inline-secrets` bare still opts IN (the escape hatch keeps working)", () => withTempDir((dir) => {
  runGenMcp(dir, ["--inline-secrets"], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_deliberateinline9" });
  assert.match(readFileSync(join(dir, ".mcp.json"), "utf8"), /Bearer ghp_deliberateinline9/);
}));

test("#2: asBool — bare flag, every falsey spelling, anything else", () => {
  for (const v of [true, "true", "1", "yes", "on", "anything"]) assert.equal(asBool(v), true, `asBool(${JSON.stringify(v)})`);
  for (const v of ["false", "FALSE", " false ", "0", "no", "off", "Off", undefined]) assert.equal(asBool(v), false, `asBool(${JSON.stringify(v)})`);
});

// ─── #3 — a .gitignore rule cannot untrack a tracked file ─────────────────────────
test("#3: an ALREADY-TRACKED settings.local.json blocks the run — no credential is staged", () => withTempDir((dir) => {
  const git = (cmd) => execFileSync("git", cmd, { cwd: dir, stdio: "ignore" });
  git(["init", "-q"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "t"]);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const settingsPath = join(dir, ".claude", "settings.local.json");
  writeFileSync(settingsPath, JSON.stringify({ permissions: { deny: [] } }, null, 2));
  git(["add", "-f", ".claude/settings.local.json"]);
  git(["commit", "-qm", "tracked"]);

  let err;
  try { runGenMcp(dir, [], { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_mustnotbestaged12" }); } catch (e) { err = e; }
  assert.ok(err, "the run must refuse rather than write a secret into a tracked file");
  const out = outputOf(err);
  assert.match(out, /already tracked by git/);
  assert.match(out, /git rm --cached/, "the remediation must be the one that actually works");
  assert.ok(!readFileSync(settingsPath, "utf8").includes("ghp_mustnotbestaged12"), "no credential reached the tracked file");
}));

test("#3: a tracked .mcp.json only WARNS — it holds ${VAR} refs, not a credential", () => withTempDir((dir) => {
  const git = (cmd) => execFileSync("git", cmd, { cwd: dir, stdio: "ignore" });
  git(["init", "-q"]);
  git(["config", "user.email", "t@example.com"]);
  git(["config", "user.name", "t"]);
  writeFileSync(join(dir, ".mcp.json"), "{}\n");
  git(["add", "-f", ".mcp.json"]);
  git(["commit", "-qm", "tracked"]);

  const out = runGenMcp(dir); // must NOT throw
  assert.match(out, /already tracked by git/);
  assert.match(out, /Not blocking/, "a credential-free file is untidy, not exposed");
  assert.ok(!readFileSync(join(dir, ".mcp.json"), "utf8").includes("ghp_"), "still no literal");
}));

// ─── #4 — protect before creating, for EVERY generated file ───────────────────────
test("#4: the ignore block is in place before `.env.local` exists, not only before `.mcp.json`", () => withTempDir((dir) => {
  runScript(dir, "scaffold-secrets.mjs", ["--env", "acme", "--tracker", "jira", "--client-vcs", "github"]);
  assert.ok(existsSync(join(dir, ".env.local")), "precondition: the secrets file was created");
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  for (const entry of [".env.local", ".env.*.local", ".mcp.json", ".claude/settings.local.json", "project-profile.json", ".vc-fix/"]) {
    assert.match(gi, new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), `${entry} not ignored by the time .env.local exists`);
  }
}));

test("#4: scaffold-env protects too — the very first writer in the flow", () => withTempDir((dir) => {
  runScript(dir, "scaffold-env.mjs", ["--env", "acme", "--tracker", "jira", "--client-vcs", "github"]);
  assert.match(readFileSync(join(dir, ".gitignore"), "utf8"), /^\.env\.local$/m);
}));

test("#4: all four writers together produce ONE block with no duplicate entries", () => withTempDir((dir) => {
  runScript(dir, "scaffold-env.mjs", ["--env", "acme", "--tracker", "jira", "--client-vcs", "github"]);
  runScript(dir, "scaffold-secrets.mjs", ["--env", "acme", "--tracker", "jira", "--client-vcs", "github"]);
  runScript(dir, "gen-profile.mjs", ["--project-type", "client", "--tracker", "jira", "--client-vcs", "github"]);
  runGenMcp(dir);
  const lines = readFileSync(join(dir, ".gitignore"), "utf8").split("\n").map((l) => l.trim());
  for (const entry of [".mcp.json", ".env.local", "project-profile.json", ".vc-fix/", ".claude/settings.local.json"]) {
    assert.equal(lines.filter((l) => l === entry).length, 1, `${entry} appears more than once`);
  }
  assert.equal(
    lines.filter((l) => l.startsWith("# === vc-fix (/project-init) — generated local config")).length, 1,
    "one labelled block, not four",
  );
}));

// ─── #5 — the net that can BLOCK must not fire on a harmless value ────────────────
test("#5: the CERTAIN net does not fire on ordinary base64 (it used to FAIL readiness)", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
  for (const value of [
    b64({ theme: "dark", locale: "en-US" }),
    b64({ features: ["a", "b"], retries: 3 }),
    b64({ padding: "x".repeat(120) }),
  ]) {
    assert.equal(SECRET_PREFIX_RE.test(value), false, `base64 config misread as a credential: ${value.slice(0, 24)}…`);
  }
});

test("#5: …and a real JWT, which has two dots, still is one", () => {
  assert.equal(SECRET_PREFIX_RE.test("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"), true);
  assert.equal(SECRET_PREFIX_RE.test("eyJhbGciOiJub25lIn0.eyJzdWIiOiJhYmMxMjM0NSJ9."), true, "an unsigned JWT is still a JWT");
});
