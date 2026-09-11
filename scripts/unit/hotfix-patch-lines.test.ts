// Unit tests for `patchLines` in scripts/hotfix/hotfix-precheck.ts — the pure core of the
// precheck's CONTENT-level "is the fix already on this support branch" detection.
//
// Why this layer exists at all: `branchHasFix` used to answer the question with SHA ancestry plus
// a `git cherry-pick -x` trailer. Neither can ever fire for the write step /qa-hotfix actually
// runs — a plain `git cherry-pick` mints a NEW commit SHA and writes no trailer. Measured on
// VCST-5940 (2026-09-10): minutes after the run published 3.1001.8 and 3.1009.3, re-running the
// precheck still reported "✓ READY → cherry-pick → 3.1001.9" for both lines, i.e. it invited a
// duplicate hotfix of a fix it had just shipped. `already-applied` was unreachable in practice.
//
// The content layer closes that by asking whether the fix's own diff is present in the branch's
// files, and `patchLines` is the part that decides WHICH lines carry that signal. Its contract:
//   - added/removed lines are trimmed (a re-indent must not defeat the match);
//   - blank lines carry no signal (every file has them; they'd match anything);
//   - a line on BOTH sides is a MOVE, not a change — keeping it makes the caller's conjunctive
//     test ("all added present AND all removed absent") self-contradictory, so it can never
//     report applied. This is the case that silently degrades the whole layer back to broken.
//   - diff headers (---/+++/@@) are metadata, never content, even though they start with -/+.
//
// Run: `npx tsx --test scripts/unit/hotfix-patch-lines.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { patchLines } from "../hotfix/hotfix-precheck.ts";

/** A unified-diff hunk, written the way GitHub's `files[].patch` sends it. */
const hunk = (...lines: string[]) => lines.join("\n");

test("the real VCST-5940 fix: one line swapped", () => {
  // The actual patch GitHub returned for 578c47e — an attribute rename in an AngularJS template.
  const { added, removed } = patchLines(
    hunk(
      "@@ -2,7 +2,7 @@",
      "   <div class=\"blade-inner\">",
      "     <div class=\"inner-block\">",
      "       <div class=\"form-group __preview\">",
      "-        <iframe id=\"p\" srcdoc=\"{{blade.html}}\" frameborder=\"0\"></iframe>",
      "+        <iframe id=\"p\" ng-attr-srcdoc=\"{{blade.html}}\" frameborder=\"0\"></iframe>",
      "       </div>",
    ),
  );
  assert.deepEqual(added, ['<iframe id="p" ng-attr-srcdoc="{{blade.html}}" frameborder="0"></iframe>']);
  assert.deepEqual(removed, ['<iframe id="p" srcdoc="{{blade.html}}" frameborder="0"></iframe>']);
});

test("context lines are ignored — only +/- carry signal", () => {
  const { added, removed } = patchLines(hunk("@@ -1,3 +1,3 @@", " untouched", "-old", "+new", " also untouched"));
  assert.deepEqual(added, ["new"]);
  assert.deepEqual(removed, ["old"]);
});

test("diff file headers are metadata, not content", () => {
  // `---`/`+++` start with the same markers as removed/added lines and must not be mistaken
  // for them: they'd be searched for in the branch's file and never found → false "not applied".
  const { added, removed } = patchLines(
    hunk("--- a/src/Foo.cs", "+++ b/src/Foo.cs", "@@ -1,1 +1,1 @@", "-var a = 1;", "+var a = 2;"),
  );
  assert.deepEqual(added, ["var a = 2;"]);
  assert.deepEqual(removed, ["var a = 1;"]);
});

test("lines are trimmed, so a pure re-indent does not defeat the match", () => {
  const { added } = patchLines(hunk("@@ -1,1 +1,1 @@", "+      deeply.indented(call);"));
  assert.deepEqual(added, ["deeply.indented(call);"]);
});

test("blank added/removed lines are dropped — they would match any file", () => {
  const { added, removed } = patchLines(hunk("@@ -1,4 +1,4 @@", "+", "+   ", "+real();", "-", "-gone();"));
  assert.deepEqual(added, ["real();"]);
  assert.deepEqual(removed, ["gone();"]);
});

test("a MOVED line is dropped from both sides", () => {
  // The regression this guards: `using X;` moved within the file appears as both -/+. Kept on
  // both sides, the caller's conjunctive test demands it be simultaneously present and absent,
  // so `already-applied` could never be reported for any fix that moves a line.
  const { added, removed } = patchLines(
    hunk("@@ -1,4 +1,4 @@", "-using System;", "-var a = 1;", "+var a = 2;", "+using System;"),
  );
  assert.deepEqual(added, ["var a = 2;"], "the moved using is not evidence of the fix");
  assert.deepEqual(removed, ["var a = 1;"], "the real removal survives; only the moved line drops out");
});

test("a pure move yields no signal at all", () => {
  // Not "applied" and not "not applied" — nothing to conclude. The caller treats an all-empty
  // patch as inconclusive, which reads as READY, never as already-applied.
  const { added, removed } = patchLines(hunk("@@ -1,2 +1,2 @@", "-a();", "-b();", "+b();", "+a();"));
  assert.deepEqual(added, []);
  assert.deepEqual(removed, []);
});

test("multiple hunks in one patch are all collected", () => {
  const { added, removed } = patchLines(
    hunk("@@ -1,1 +1,1 @@", "-first-old", "+first-new", "@@ -40,1 +40,1 @@", "-second-old", "+second-new"),
  );
  assert.deepEqual(added.sort(), ["first-new", "second-new"]);
  assert.deepEqual(removed.sort(), ["first-old", "second-old"]);
});

test("duplicate identical additions collapse (a set, not a bag)", () => {
  // Presence is what the caller tests, so a line added twice is one fact, not two.
  const { added } = patchLines(hunk("@@ -1,2 +1,4 @@", "+log();", "+log();"));
  assert.deepEqual(added, ["log();"]);
});

test("an empty patch yields nothing rather than throwing", () => {
  assert.deepEqual(patchLines(""), { added: [], removed: [] });
});
