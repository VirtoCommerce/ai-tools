// Unit tests for the upstream-ref baseline resolver in the SHIPPED plugin copy
// (plugins/vc-fix/skills/project-init/discover-repos.mjs). Covers the PRIMARY
// "append .0 + verify existence" rule and its fallbacks. Pure — no env, no network.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
//
// NOTE: this imports the plugins/vc-fix copy on purpose — the .claude/ copy of
// discover-repos.mjs is an older mirror that does not yet carry parseSemver/pickBaselineTag
// (pre-existing tree drift, tracked separately). The distributed plugin is the copy under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSemver,
  pickBaselineTag,
} from "../../plugins/vc-fix/skills/project-init/discover-repos.mjs";

test("parseSemver: parses bare, v-prefixed, and refs/tags forms; ignores suffix", () => {
  assert.deepEqual(parseSemver("2.49.0"), [2, 49, 0]);
  assert.deepEqual(parseSemver("v2.49.7"), [2, 49, 7]);
  assert.deepEqual(parseSemver("refs/tags/2.48.3"), [2, 48, 3]);
  assert.deepEqual(parseSemver("2.49.0-alpha.1"), [2, 49, 0]);
  assert.equal(parseSemver("garbage"), null);
});

test("pickBaselineTag: PRIMARY — <major>.<minor>.0 wins when it exists", () => {
  // Even though .3/.5 are the highest on the line, the constructed base .0 is chosen.
  const tags = ["2.49.0", "2.49.3", "2.49.5", "2.48.9"];
  assert.equal(pickBaselineTag(tags, "2.49"), "2.49.0");
});

test("pickBaselineTag: PRIMARY — v-prefixed X.Y.0 is returned verbatim (fetchable)", () => {
  const tags = ["v2.49.0", "v2.49.4"];
  assert.equal(pickBaselineTag(tags, "2.49"), "v2.49.0");
});

test("pickBaselineTag: FALLBACK 1 — smallest patch on the line when X.Y.0 is absent", () => {
  const tags = ["2.49.3", "2.49.7", "2.48.0"];
  assert.equal(pickBaselineTag(tags, "2.49"), "2.49.3");
});

test("pickBaselineTag: FALLBACK 2 — highest earlier-line tag when the line was never tagged", () => {
  const tags = ["2.48.5", "2.48.2", "2.47.9"];
  assert.equal(pickBaselineTag(tags, "2.49"), "2.48.5");
});

test("pickBaselineTag: no candidate (only newer lines) ⇒ empty string", () => {
  assert.equal(pickBaselineTag(["2.50.0", "2.51.0"], "2.49"), "");
});

test("pickBaselineTag: unparseable line ⇒ empty string", () => {
  assert.equal(pickBaselineTag(["2.49.0"], "not-a-line"), "");
  assert.equal(pickBaselineTag(["2.49.0"], ""), "");
});
