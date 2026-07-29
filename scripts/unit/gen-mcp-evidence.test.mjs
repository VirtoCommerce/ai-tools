// Unit tests for the evidence-destination half of
// plugins/vc-fix/skills/project-init/gen-mcp.mjs (VCST-5582 C).
//
// The defect: screenshots taken during a /qa-bug run appeared at the PROJECT ROOT. The template's
// `--output-dir` was RELATIVE (`test-results/<browser>`), which playwright-mcp resolves against the
// MCP server's own cwd — a value the plugin does not control — while the destination policy in
// skills/qa-evidence/output-paths.md said `reports/bugs/screenshots/`. Nothing connected the two,
// so the path was guessed. gen-mcp now pins --output-dir to an ABSOLUTE project path, so the
// default target cannot be the root whatever the cwd turns out to be.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
import { ensureGitignoreEntries, absolutizeOutputDir } from "../../plugins/vc-fix/skills/project-init/gen-mcp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugins/vc-fix/skills/project-init/gen-mcp.mjs");
const TEMPLATE = join(ROOT, "plugins/vc-fix/templates/.mcp.json.example");
const PLAYWRIGHT = ["playwright-chrome", "playwright-firefox", "playwright-edge"];

function outputDirOf(server) {
  const i = server.args.indexOf("--output-dir");
  return i >= 0 ? server.args[i + 1] : null;
}
function runGenMcp(dir, args = []) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    // VC_FIX_HOME is outputRoot() — without it the generator would write into the real checkout.
    env: { ...process.env, VC_FIX_HOME: dir },
  });
}

// ─── the shipped template (the hand-copy fallback) ────────────────────────────────
test("template: every Playwright server points --output-dir at the evidence landing zone", () => {
  const tpl = JSON.parse(readFileSync(TEMPLATE, "utf8"));
  for (const name of PLAYWRIGHT) {
    const dir = outputDirOf(tpl.mcpServers[name]);
    assert.ok(dir, `${name} declares --output-dir`);
    assert.match(dir, /^reports\/bugs\/screenshots\/_incoming\//, `${name}: ${dir}`);
    assert.doesNotMatch(dir, /^test-results\//, `${name} must not fall back to the old lane`);
  }
});

// ─── the generated .mcp.json (what actually runs) ─────────────────────────────────
test("gen-mcp: --output-dir is rewritten to an ABSOLUTE project path (cwd can never make it the root)", () => withTempDir((dir) => {
  runGenMcp(dir);
  const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
  for (const name of PLAYWRIGHT) {
    const out = outputDirOf(cfg.mcpServers[name]);
    assert.ok(isAbsolute(out), `${name}: --output-dir must be absolute, got "${out}"`);
    assert.equal(resolve(out), resolve(join(dir, "reports/bugs/screenshots/_incoming", name.replace("playwright-", ""))), name);
    // The whole point: the project root itself is never the target.
    assert.notEqual(resolve(out), resolve(dir), `${name} must not resolve to the project root`);
  }
}));

test("absolutizeOutputDir: a STALE relative value (test-results/<browser>) is migrated, lane preserved", () => {
  // A project onboarded before this fix, or a hand-edited template, must be corrected too —
  // only the browser lane is carried over, the parent dir is re-rooted in the evidence tree.
  const server = { command: "npx", args: ["@playwright/mcp@latest", "--browser", "firefox", "--output-dir", "test-results/firefox"] };
  const out = absolutizeOutputDir(server, "/proj");
  assert.equal(outputDirOf(out).replace(/\\/g, "/"), "/proj/reports/bugs/screenshots/_incoming/firefox");
  assert.deepEqual(server.args[server.args.length - 1], "test-results/firefox", "the input is not mutated");
});

test("absolutizeOutputDir: an ALREADY-absolute value is left alone (a deliberate operator override)", () => {
  const abs = process.platform === "win32" ? "D:\\evidence\\shots" : "/evidence/shots";
  const server = { args: ["--output-dir", abs] };
  assert.equal(outputDirOf(absolutizeOutputDir(server, "/proj")), abs);
});

test("absolutizeOutputDir: a server with no --output-dir (github, postman, …) is untouched", () => {
  const server = { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] };
  assert.deepEqual(absolutizeOutputDir(server, "/proj"), server);
});

// ─── .gitignore entries ───────────────────────────────────────────────────────────
test("gen-mcp: adds the landing-zone ignore entries to the project's .gitignore", () => withTempDir((dir) => {
  runGenMcp(dir);
  const gi = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.match(gi, /^test-results\/$/m);
  assert.match(gi, /^reports\/bugs\/screenshots\/_incoming\/$/m);
}));

test("ensureGitignoreEntries: idempotent — a second run adds nothing", () => withTempDir((dir) => {
  const entries = ["test-results/", "reports/bugs/screenshots/_incoming/"];
  const first = ensureGitignoreEntries(dir, entries);
  assert.deepEqual(first, entries);
  const after = readFileSync(join(dir, ".gitignore"), "utf8");
  const second = ensureGitignoreEntries(dir, entries);
  assert.deepEqual(second, [], "nothing missing the second time");
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), after, "the file is byte-identical");
}));

test("ensureGitignoreEntries: APPENDS — an existing .gitignore is never rewritten or reordered", () => withTempDir((dir) => {
  const original = "node_modules/\n.env.local\n";
  writeFileSync(join(dir, ".gitignore"), original);
  ensureGitignoreEntries(dir, ["test-results/", "reports/bugs/screenshots/_incoming/"]);
  const after = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.ok(after.startsWith(original), "the operator's existing entries are untouched, in order");
  assert.match(after, /^test-results\/$/m);
}));

test("ensureGitignoreEntries: an entry the project already ignores is not duplicated", () => withTempDir((dir) => {
  writeFileSync(join(dir, ".gitignore"), "test-results/\n");
  const added = ensureGitignoreEntries(dir, ["test-results/", "reports/bugs/screenshots/_incoming/"]);
  assert.deepEqual(added, ["reports/bugs/screenshots/_incoming/"]);
  const occurrences = readFileSync(join(dir, ".gitignore"), "utf8").split("\n").filter((l) => l.trim() === "test-results/").length;
  assert.equal(occurrences, 1);
}));

// ─── the destination is documented where the agent will look ──────────────────────
test("docs: output-paths.md carries the no-root rule and the full _incoming → <slug> chain", () => {
  const md = readFileSync(join(ROOT, "plugins/vc-fix/skills/qa-evidence/output-paths.md"), "utf8");
  assert.match(md, /nothing is ever written to the project root/i);
  assert.match(md, /_incoming/);
  assert.match(md, /reports\/bugs\/screenshots\/<bug-slug>\//);
});

test("docs: qa-bug.md mandates relative screenshot filenames and ONE move", () => {
  const md = readFileSync(join(ROOT, "plugins/vc-fix/commands/qa-bug.md"), "utf8");
  assert.match(md, /RELATIVE filenames only/i);
  assert.match(md, /ONE deterministic move/i);
  assert.match(md, /Final sweep/i, "the run must sweep AND name anything left at the root");
});
