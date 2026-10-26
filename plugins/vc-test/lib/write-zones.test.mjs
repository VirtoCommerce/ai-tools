// The write-zone check (spec §8, U10 — a committed test by the owner's decision): at close, every file a
// /vc-test:qa-ticket run changed lies inside the `writes` globs of the artifacts that ran, or the run is BLOCKED.
// A wrong answer here either blocks a clean run or lets a stray write through, and nothing else would notice.
// Each test builds its own temporary git repository; this repository's tree is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { changed, outside, registryErrors, snapshot, zonesFor } from "./write-zones.mjs";
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
