/**
 * affected-suites — placing a free-text CHANGE_SOURCE, deterministically.
 *
 * The property under test is mostly a REFUSAL: an unplaceable change source must return null so
 * `ci/run-full-cycle.ts` keeps its configured selection. The predecessor parsed a suite list out
 * of an agent's prose, and a model asked to name ids names plausible ones — so "I cannot place
 * this" has to be expressible, and has to be the answer whenever it is true.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { placeChange, selectAffectedSuites } from "../../ci/lib/affected-suites.ts";
import { loadManifest } from "../../ci/lib/suite-manifest.ts";

const noDiff = () => [] as string[];

test("`module <name>` places to the module repo, and the name IS the path token", () => {
  // `module catalog` and `.../CatalogModule.Data/...` must narrow the same way, so the name goes
  // through the same tokeniser rather than a second code path.
  const p = placeChange("module catalog", noDiff);
  assert.deepEqual(p, { repo: "vc-module-catalog", paths: ["catalog"], via: "module name 'catalog'" });
});

test("`module <Name>` is case-insensitive on the way in", () => {
  assert.equal(placeChange("module Catalog", noDiff)?.repo, "vc-module-catalog");
});

test("`diff` defaults to the last commit; `diff <range>` honours the range", () => {
  const seen: string[] = [];
  const reader = (r: string) => {
    seen.push(r);
    return ["a.ts"];
  };
  assert.equal(placeChange("diff", reader)?.via, "git diff HEAD~1..HEAD (1 path(s))");
  placeChange("diff main..HEAD", reader);
  assert.deepEqual(seen, ["HEAD~1..HEAD", "main..HEAD"]);
});

test("a bare git range is placed as a diff of this repo", () => {
  const p = placeChange("main..HEAD", () => ["x.ts"]);
  assert.equal(p?.repo, "vc-mcp-testing-module");
  assert.match(p?.via ?? "", /git diff main\.\.HEAD/);
});

test("REFUSAL: a PR reference is NOT placed — the file list needs a call this module will not make", () => {
  // Inferring a repo from a PR number would be inventing, which is the whole failure being
  // removed. Null here means the caller keeps SUITE_SELECTION.
  for (const src of ["PR #123", "https://github.com/VirtoCommerce/vc-frontend/pull/2451"]) {
    assert.equal(placeChange(src, noDiff), null, src);
  }
});

test("REFUSAL: a changelog version, a ticket key and empty input are not placed", () => {
  for (const src of ["changelog 3.1061.0", "VCST-5811", "", "   "]) {
    assert.equal(placeChange(src, noDiff), null, JSON.stringify(src));
  }
});

test("selectAffectedSuites returns null for an unplaceable source, never a narrower guess", () => {
  assert.equal(selectAffectedSuites("PR #123", { readDiff: noDiff }), null);
});

test("selectAffectedSuites places a module change against the real manifest", () => {
  const r = selectAffectedSuites("module catalog", { readDiff: noDiff });
  assert.ok(r, "catalog should be placeable");
  assert.ok(r.ids.length > 0);
  assert.ok(r.ids.every((id) => /^[0-9]/.test(id)), `unexpected id shape: ${r.ids.join(",")}`);
  assert.match(r.note, /module name 'catalog'/);
  assert.match(r.note, /predicted \d+ min of \d+/);
});

test("every returned id exists in the manifest — the point of replacing the LLM", () => {
  // The one property the parsed-from-prose predecessor could not have: an id it prints came out
  // of the manifest, so it cannot be the next sequential number after a real suite's maximum.
  const r = selectAffectedSuites("module catalog", { readDiff: noDiff });
  assert.ok(r);
  const manifestIds = new Set(loadManifest().suites.map((s) => s.id));
  for (const id of r.ids) assert.ok(manifestIds.has(id), `${id} is not a real suite id`);
});

test("a target trims and the excluded ids are reported, not dropped in silence", () => {
  const r = selectAffectedSuites("module catalog", { readDiff: noDiff, targetMinutes: 60 });
  assert.ok(r);
  assert.ok(r.excludedIds.length > 0, "a 60-minute target has to exclude something");
});

test("an empty diff still yields the risk floor rather than nothing", () => {
  const r = selectAffectedSuites("diff", { readDiff: noDiff });
  assert.ok(r);
  assert.ok(r.ids.length > 0, "the P0 gate always runs");
});
