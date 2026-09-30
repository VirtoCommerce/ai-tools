// Unit tests for the vc-fix install picker — plugins/vc-fix/skills/project-init/verify-access.mjs
// `pickPluginInstall`. The marketplace was renamed vc-tools → ai-tools on 2026-09-30, so during a
// migration `claude plugin list` can hold BOTH ids. The picker must prefer the new id whatever order
// the CLI prints them in (a stale pre-rename install still targets the old repo), and must report
// every enabled id so the readiness table can warn about two collectors running at once.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPluginInstall } from "../../plugins/vc-fix/skills/project-init/verify-access.mjs";

const entry = (id, enabled) => ({ id, enabled, installPath: `/cache/${id}` });

test("the new id wins even when the CLI lists the old one first", () => {
  const r = pickPluginInstall([entry("vc-fix@vc-tools", true), entry("vc-fix@ai-tools", true)]);
  assert.equal(r.entry.id, "vc-fix@ai-tools");
  assert.deepEqual(r.enabledIds, ["vc-fix@ai-tools", "vc-fix@vc-tools"]);
});

test("a pre-rename install alone still resolves", () => {
  const r = pickPluginInstall([entry("vc-fix@vc-tools", true)]);
  assert.equal(r.entry.id, "vc-fix@vc-tools");
  assert.deepEqual(r.enabledIds, ["vc-fix@vc-tools"]);
});

test("an enabled old install beats a disabled new one", () => {
  const r = pickPluginInstall([entry("vc-fix@ai-tools", false), entry("vc-fix@vc-tools", true)]);
  assert.equal(r.entry.id, "vc-fix@vc-tools");
});

test("with nothing enabled it falls back to the new id, and reports no enabled ids", () => {
  const r = pickPluginInstall([entry("vc-fix@vc-tools", false), entry("vc-fix@ai-tools", false)]);
  assert.equal(r.entry.id, "vc-fix@ai-tools");
  assert.deepEqual(r.enabledIds, []);
});

test("an unrelated plugin is never picked", () => {
  const r = pickPluginInstall([entry("vc-perf@ai-tools", true), entry("vc-fix@elsewhere", true)]);
  assert.equal(r.entry, null);
  assert.deepEqual(r.enabledIds, []);
});
