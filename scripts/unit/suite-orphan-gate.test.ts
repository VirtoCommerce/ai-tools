// Unit tests for the orphan-CSV gate in scripts/test-cases/sync-test-suites.ts.
//
// This gate used to be a WARNING, and that is exactly why suite 096
// (`Backend/import-export/096-backup-restore.csv`, 75 cases) sat unregistered for weeks: on
// disk, in no selection group, invisible to every gate that iterates the manifest. It could
// neither run nor be seen to rot. A warning printed by a command whose normal output already
// carries warnings is indistinguishable from silence — so it is now fatal.
//
// The gate is tested against a FIXTURE corpus, not the real one: a gate whose only test is
// "the real repo is currently clean" passes just as happily when the check does nothing.
//
// Run: `npx tsx --test scripts/unit/suite-orphan-gate.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findManifestDisagreements, allSuiteCsvs } from "../test-cases/sync-test-suites.ts";
import { loadManifest } from "../../ci/lib/suite-manifest.ts";

const scratch = mkdtempSync(join(tmpdir(), "orphan-gate-"));

/** A fixture corpus + a manifest that declares only some of it. */
function corpus(declared: string[], onDisk: string[]): { root: string; manifest: any } {
  const root = mkdtempSync(join(scratch, "c-"));
  for (const rel of onDisk) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, "ID,Title\nX-001,t\n");
  }
  // `allSuiteCsvs` normalises to forward slashes, so the fixture manifest must too: on Windows
  // `root` carries backslashes and a naive `${root}/${rel}` would never match what the walker
  // returns, making every declared file look absent and every real file look orphaned.
  const asPosix = (p: string) => p.split("\\").join("/");
  return {
    root,
    manifest: {
      suites: declared.map((rel, i) => ({ id: String(i).padStart(3, "0"), file: `${asPosix(root)}/${rel}` })),
      selections: {},
    },
  };
}

test("a CSV on disk with no manifest entry is reported as an orphan", () => {
  const { root, manifest } = corpus(["a/one.csv"], ["a/one.csv", "b/stray.csv"]);
  const { orphans } = findManifestDisagreements(manifest, root);
  assert.equal(orphans.length, 1, JSON.stringify(orphans));
  assert.match(orphans[0], /stray\.csv$/);
});

test("a fully declared corpus reports no orphans", () => {
  const { root, manifest } = corpus(["a/one.csv", "b/two.csv"], ["a/one.csv", "b/two.csv"]);
  assert.deepEqual(findManifestDisagreements(manifest, root).orphans, []);
});

test("two manifest entries sharing an id are reported — only the last would run", () => {
  const { root, manifest } = corpus(["a/one.csv", "b/two.csv"], ["a/one.csv", "b/two.csv"]);
  manifest.suites[1].id = manifest.suites[0].id;
  const { dupIds } = findManifestDisagreements(manifest, root);
  assert.equal(dupIds.length, 1);
  assert.match(dupIds[0], /declared 2×/);
});

test("a declared file that is absent from disk is NOT an orphan", () => {
  // That is `findMissingFiles`'s job, and it is already fatal. Reporting it here too would
  // make one defect produce two contradictory-sounding failures.
  const { root, manifest } = corpus(["a/one.csv", "b/gone.csv"], ["a/one.csv"]);
  assert.deepEqual(findManifestDisagreements(manifest, root).orphans, []);
});

test("the REAL corpus has zero orphans — the state the gate now enforces", () => {
  const manifest = loadManifest();
  const { orphans } = findManifestDisagreements(manifest);
  assert.deepEqual(orphans, [], `orphaned suite CSV(s): ${orphans.join(", ")}`);
});

test("096 is registered and excluded from full — it is a PR verification log, not regression material", () => {
  // Its steps use their own [HTTP]/[STATUS]/[FILE] vocabulary and its titles read
  // "… under the PR platform-version requirement". Registering it makes it visible to the
  // gates; excluding it from `full` keeps a verification log out of a release run.
  const manifest = loadManifest();
  const suite = manifest.suites.find((s) => s.id === "096");
  assert.ok(suite, "096 is unregistered again — the orphan gate should have caught this");
  assert.ok(suite!.tags.includes("verification"));
  const full = manifest.selections.full as { exclude?: string[] };
  assert.ok(full.exclude?.includes("096"), "096 must stay out of full");
});

test("allSuiteCsvs returns forward-slash paths so manifest comparison is platform-stable", () => {
  const { root } = corpus([], ["a/one.csv"]);
  const found = allSuiteCsvs(root);
  assert.equal(found.length, 1);
  assert.ok(!found[0].includes("\\"), `backslash in ${found[0]} would never match a manifest entry`);
});
