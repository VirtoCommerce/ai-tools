// The write-zone check (spec §8, U10 — a committed test by the owner's decision): at close, every file a
// /vc-test:qa-ticket run changed lies inside the `writes` globs of the artifacts that ran, or the run is BLOCKED.
// A wrong answer here either blocks a clean run or lets a stray write through, and nothing else would notice.
// Each test builds its own temporary git repository; this repository's tree is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { changed, outside, registryErrors, runDirProblem, snapshot, zonesFor } from "./write-zones.mjs";
import { loadRegistry } from "./strategy-artifacts.mjs";

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" });

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "vct-wz-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  writeFileSync(join(root, ".gitignore"), "reports/\n.vc-fix/\n");
  writeFileSync(join(root, "README.md"), "x\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");
  return root;
}
const put = (root, rel, text = "x") => { const f = join(root, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
const RUN = "reports/tickets/S1/K-1/vcst";
const registry = loadRegistry();
const zones = (root, ran, extra = {}) => zonesFor({ registry, ran, runDir: join(root, RUN), store: "qa-knowledge/", root, platform: "linux", ...extra });
const outsideOf = (root, ran, before, extra) => outside(changed(before, snapshot({ root, runDir: join(root, RUN) })), zones(root, ran, extra));

test("a scenario instance owns its own S-n files and no other instance's", (t) => {
  const root = repo(t);
  const before = snapshot({ root, runDir: join(root, RUN) });
  put(root, `${RUN}/scenarios/S-2.rows.md`);
  put(root, `${RUN}/scenarios/S-3.rows.md`);
  assert.deepEqual(outsideOf(root, ["checklist", "scenario:S-2"], before), [`${RUN}/scenarios/S-3.rows.md`]);
});

test("a prior-bug instance owns its own PB-n rows file and no other instance's", (t) => {
  const root = repo(t);
  const before = snapshot({ root, runDir: join(root, RUN) });
  put(root, `${RUN}/scenarios/PB-1.rows.md`);
  put(root, `${RUN}/scenarios/PB-2.rows.md`);
  assert.deepEqual(outsideOf(root, ["checklist", "bug:PB-1"], before), [`${RUN}/scenarios/PB-2.rows.md`]);
});

test("a file written by an artifact that did not run is outside", (t) => {
  const root = repo(t);
  const before = snapshot({ root, runDir: join(root, RUN) });
  put(root, `${RUN}/design-report.md`);
  put(root, `${RUN}/testing-checklist.md`);
  assert.deepEqual(outsideOf(root, ["checklist"], before), [`${RUN}/design-report.md`]);
  assert.deepEqual(outsideOf(root, ["checklist", "visual"], before), []);
});

test("a file present at the snapshot and left alone is not changed; the same file edited is", (t) => {
  const root = repo(t);
  put(root, `${RUN}/stray.md`, "one");
  put(root, "notes.txt", "dirty before");
  const before = snapshot({ root, runDir: join(root, RUN) });
  assert.deepEqual(changed(before, snapshot({ root, runDir: join(root, RUN) })), []);
  put(root, `${RUN}/stray.md`, "two");
  assert.deepEqual(changed(before, snapshot({ root, runDir: join(root, RUN) })), [`${RUN}/stray.md`]);
});

test("a deletion counts as a change", (t) => {
  const root = repo(t);
  put(root, `${RUN}/gone.md`);
  rmSync(join(root, "README.md"));
  const before = snapshot({ root, runDir: join(root, RUN) });
  rmSync(join(root, RUN, "gone.md"));
  assert.deepEqual(changed(before, snapshot({ root, runDir: join(root, RUN) })), [`${RUN}/gone.md`]);
});

test("an edit to a tracked .gitignore after the snapshot is outside; one already dirty and untouched is not", (t) => {
  const root = repo(t);
  put(root, ".gitignore", "reports/\n.vc-fix/\ndirty-before\n");
  const before = snapshot({ root, runDir: join(root, RUN) });
  assert.deepEqual(outsideOf(root, ["checklist"], before), []);
  put(root, ".gitignore", "reports/\n.vc-fix/\ndirty-before\nedited-by-the-run\n");
  assert.deepEqual(outsideOf(root, ["checklist"], before), [".gitignore"]);
});

test("a tracked file edited after the snapshot, and a new untracked one, are outside", (t) => {
  const root = repo(t);
  const before = snapshot({ root, runDir: join(root, RUN) });
  put(root, "README.md", "changed");
  put(root, "src/new.ts");
  assert.deepEqual(outsideOf(root, ["checklist"], before).sort(), ["README.md", "src/new.ts"]);
});

test("** matches any depth including none; * stays within a segment", (t) => {
  const root = repo(t);
  const z = zones(root, ["ac-checks"]);
  const inside = (p) => outside([p], z).length === 0;
  assert.ok(inside(`${RUN}/ac-checks/C-1.json`));
  assert.ok(inside(`${RUN}/ac-checks/x/y/C-1.json`));
  assert.ok(inside(`${RUN}/bugs/a.md`)); // orchestrator: <run>/bugs/**
  assert.ok(inside(`${RUN}/bugs/x/y.md`));
  assert.ok(inside(`${RUN}/evidence-1/a.png`)); // <run>/evidence-*/**
  assert.ok(!inside(`${RUN}/evidence/a.png`)); // `evidence-*` needs its dash
  assert.ok(!inside(`${RUN}/a/evidence-1/x.png`)); // `*` does not cross a segment, and the glob is anchored
  assert.ok(!inside(`${RUN}/ac-checksX/C-1.json`));
  assert.ok(!inside(`${RUN}-other/testing-checklist.md`));
});

test("the knowledge store is the orchestrator's zone; with no store its globs match nothing", (t) => {
  const root = repo(t);
  assert.deepEqual(outside(["qa-knowledge/api/x.md"], zones(root, [])), []);
  assert.deepEqual(outside(["qa-knowledge/api/x.md"], zones(root, [], { store: null })), ["qa-knowledge/api/x.md"]);
});

test("working state under .vc-fix/ is never outside", (t) => {
  const root = repo(t);
  assert.deepEqual(outside([".vc-fix/vc-test/K/vcst/run-plan.json", ".vc-fix/vc-test/K/vcst/zones-snapshot.json"], zones(root, [])), []);
});

test("registryErrors flags a literal reports/tickets/ glob and one outside <run> and <store>", () => {
  const bad = { artifacts: [
    { id: "a", writes: ["<run>/ok.md", "reports/tickets/S1/K/vcst/x.md", "scratch/x.md", "<run>/reports/tickets/y.md", "<store>/ok/**"] },
  ], orchestrator: { writes: ["<run>/verdict.md", "/etc/x"] } };
  const errs = registryErrors(bad);
  assert.equal(errs.length, 4);
  for (const g of ["reports/tickets/S1/K/vcst/x.md", "scratch/x.md", "<run>/reports/tickets/y.md", "/etc/x"]) assert.ok(errs.some((e) => e.includes(g)), g);
  assert.deepEqual(registryErrors(registry), []);
});

test("Windows compares paths without regard to case; Linux does not", (t) => {
  const root = repo(t);
  const p = `${RUN}/TESTING-CHECKLIST.md`;
  assert.deepEqual(outside([p], zones(root, ["checklist"], { platform: "win32" })), []);
  assert.deepEqual(outside([p], zones(root, ["checklist"], { platform: "linux" })), [p]);
});

// --- fix round 1: no git scope, an outside run folder, renames, symlinks ---------------------------------------------

const CLI = fileURLToPath(new URL("./write-zones.mjs", import.meta.url));
function cli(root, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, VC_FIX_HOME: root, TEST_ENV: "vcst", GIT_CEILING_DIRECTORIES: dirname(root) } });
  return { code: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout.trim().split("\n").pop()) : null, err: r.stderr };
}
function plain(t) { // a folder that is not a git repository
  const root = mkdtempSync(join(tmpdir(), "vct-wz-nogit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  put(root, `${RUN}/testing-checklist.md`);
  put(root, "plan.json", JSON.stringify({ waves: [[{ id: "checklist" }]], notRun: [] }));
  return root;
}

test("no git scope is recorded by snapshot and is never a clean pass for check (exit 3)", (t) => {
  const root = plain(t);
  const s = cli(root, ["snapshot", "--key", "K-1", "--run-dir", RUN]);
  assert.equal(s.code, 0);
  assert.equal(s.out.gitScope, false);
  assert.match(s.out.reason, /git rev-parse failed/);
  assert.ok(!/at .*\.mjs:\d+/.test(s.err), "no stack trace");
  const c = cli(root, ["check", "--key", "K-1", "--run-dir", RUN, "--run-plan", join(root, "plan.json")]);
  assert.equal(c.code, 3);
  assert.deepEqual(c.out.outside, []);
  assert.equal(c.out.gitScope, false);
  assert.ok(c.out.reason);
  assert.equal(c.err, "");
});

test("a stray file inside the run folder is exit 2 even without git scope", (t) => {
  const root = plain(t);
  cli(root, ["snapshot", "--key", "K-1", "--run-dir", RUN]);
  put(root, `${RUN}/design-report.md`);
  const c = cli(root, ["check", "--key", "K-1", "--run-dir", RUN, "--run-plan", join(root, "plan.json")]);
  assert.equal(c.code, 2);
  assert.deepEqual(c.out.outside, [`${RUN}/design-report.md`]);
  assert.equal(c.out.gitScope, false);
});

test("a run folder outside the output root is not checkable (exit 3), never checked blind", (t) => {
  const root = repo(t);
  assert.equal(runDirProblem({ root, runDir: join(root, RUN) }), null);
  assert.equal(runDirProblem({ root, runDir: RUN }), null);
  for (const bad of [join(root, "..", "elsewhere"), "../elsewhere"]) assert.equal(runDirProblem({ root, runDir: bad }), "run folder outside the output root: not checkable");
  for (const cmd of ["snapshot", "check"]) {
    const r = cli(root, [cmd, "--key", "K-1", "--run-dir", join(root, "..", "elsewhere"), "--run-plan", "x"]);
    assert.equal(r.code, 3);
    assert.equal(r.out.reason, "run folder outside the output root: not checkable");
  }
});

test("a tracked file renamed to a path with a space after the snapshot: the old and the new path both changed", (t) => {
  const root = repo(t);
  const before = snapshot({ root, runDir: join(root, RUN) });
  mkdirSync(join(root, "my docs"));
  git(root, "mv", "README.md", "my docs/read me.md");
  assert.deepEqual(changed(before, snapshot({ root, runDir: join(root, RUN) })), ["README.md", "my docs/read me.md"]);
  assert.deepEqual(outsideOf(root, ["checklist"], before), ["README.md", "my docs/read me.md"]);
});

test("a symlink loop in the run folder is not followed", (t) => {
  const root = repo(t);
  put(root, `${RUN}/a/file.md`);
  try { symlinkSync(join(root, RUN), join(root, RUN, "a", "loop"), "junction"); } catch { return t.skip("cannot create a symlink here"); }
  const snap = snapshot({ root, runDir: join(root, RUN) });
  assert.deepEqual(Object.keys(snap.files), [`${RUN}/a/file.md`]);
});

// --- final review: the root spelled differently from git's toplevel -----------------------------------------------------

test("a root reached through a symlink or junction still sees an edit after the snapshot as outside", (t) => {
  const real = repo(t);
  const holder = mkdtempSync(join(tmpdir(), "vct-wz-link-"));
  t.after(() => rmSync(holder, { recursive: true, force: true }));
  const link = join(holder, "root");
  try { symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir"); } catch { return t.skip("cannot create a symlink here"); }
  const runDir = join(link, RUN);
  const before = snapshot({ root: link, runDir });
  assert.equal(before.gitScope, true);
  put(real, "README.md", "edited by the run");
  put(real, "new-untracked.txt");
  put(real, `${RUN}/design-report.md`);
  const stray = outside(changed(before, snapshot({ root: link, runDir })), zones(link, ["checklist"]));
  assert.deepEqual(stray, [`${RUN}/design-report.md`, "README.md", "new-untracked.txt"].sort());
});

test("a root that is a subfolder of the repository keys git's paths relative to it, and ignores those outside it", (t) => {
  const top = repo(t);
  const root = join(top, "proj");
  put(top, "proj/keep.md");
  git(top, "add", ".");
  git(top, "commit", "-q", "-m", "proj");
  const runDir = join(root, RUN);
  const before = snapshot({ root, runDir });
  put(top, "proj/keep.md", "edited");
  put(top, "outside-the-root.md");
  assert.deepEqual(outside(changed(before, snapshot({ root, runDir })), zones(root, ["checklist"])), ["keep.md"]);
});

test("a root whose folder name starts with a space keeps git's prefix whole and still sees an edit", (t) => {
  const top = repo(t);
  const root = join(top, " lead-space");
  put(top, " lead-space/keep.md");
  git(top, "add", ".");
  git(top, "commit", "-q", "-m", "lead-space");
  const runDir = join(root, RUN);
  const before = snapshot({ root, runDir });
  put(top, " lead-space/keep.md", "edited");
  assert.deepEqual(outside(changed(before, snapshot({ root, runDir })), zones(root, ["checklist"])), ["keep.md"]);
});

test("the contract-refresh zone covers every file the repo's run layout gives its commands (schema, cache, fixtures report)", async (t) => {
  let runLayout;
  try { ({ runLayout } = await import("../../../scripts/lib/run-dir.mjs")); } catch { return t.skip("the repo's scripts/lib/run-dir.mjs is not beside this plugin"); }
  const root = repo(t);
  const L = runLayout(join(root, RUN));
  const files = [L.schema, L.schemaCache, L.fixturesReport].map((f) => f.slice(root.length + 1).split("\\").join("/"));
  assert.deepEqual(outside(files, zones(root, ["contract-refresh"])), []);
});
