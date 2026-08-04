// Unit tests for the .vc-fix/expected.json suppression list (VCST-5582 C4) —
// plugins/vc-fix/hooks/expected.mjs (loadExpected + matchesExpected + findExpected).
// Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadExpected, matchesExpected, findExpected, expectedPath } from "../../plugins/vc-fix/hooks/expected.mjs";

function withRoot(entries, fn) {
  const root = mkdtempSync(join(tmpdir(), "vc-fix-expected-"));
  try {
    mkdirSync(join(root, ".vc-fix"), { recursive: true });
    if (entries !== undefined) writeFileSync(expectedPath(root), JSON.stringify(entries));
    return fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("loadExpected: absent / unreadable file ⇒ no suppressions (fail open)", () => {
  withRoot(undefined, (root) => assert.deepEqual(loadExpected(root).entries, []));
  const root = mkdtempSync(join(tmpdir(), "vc-fix-expected-"));
  try {
    mkdirSync(join(root, ".vc-fix"), { recursive: true });
    writeFileSync(expectedPath(root), "{ not json");
    assert.deepEqual(loadExpected(root).entries, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("loadExpected: an entry MUST carry a reason and at least one target; bad ones are counted invalid", () => {
  withRoot([
    { subject: "tracker_field_contract" },                          // no reason
    { reason: "nothing targeted" },                                 // no class/subject/pluginFile
    { class: "degraded_artifact", reason: "ok" },                   // valid
    { subject: "ado", reason: "  " },                               // blank reason
  ], (root) => {
    const e = loadExpected(root);
    assert.equal(e.entries.length, 1);
    assert.equal(e.invalid, 3);
    assert.equal(e.entries[0].class, "degraded_artifact");
  });
});

test("loadExpected: an expired entry is dropped (not active), a future one stays", () => {
  const now = 1_000_000_000_000;
  withRoot([
    { subject: "a", reason: "old", expires: now - 1 },
    { subject: "b", reason: "future", expires: now + 1 },
    { subject: "c", reason: "iso", expires: new Date(now + 86_400_000).toISOString() },
  ], (root) => {
    const e = loadExpected(root, now);
    assert.deepEqual(e.entries.map((x) => x.subject).sort(), ["b", "c"]);
    assert.equal(e.expired, 1);
  });
});

test("loadExpected: accepts both [] and { expected: [] } shapes", () => {
  withRoot({ expected: [{ subject: "x", reason: "r" }] }, (root) => {
    assert.equal(loadExpected(root).entries.length, 1);
  });
});

test("matchesExpected: every declared+testable constraint must match; at least one comparison happens", () => {
  const e = { class: "degraded_artifact", subject: "tracker_field_contract", pluginFile: null };
  // collector-shaped signal (class + subject, no pluginFile)
  assert.ok(matchesExpected(e, { cls: "degraded_artifact", subject: "tracker_field_contract" }));
  assert.equal(matchesExpected(e, { cls: "script_exit_nonzero", subject: "tracker_field_contract" }), false, "class mismatch");
  assert.equal(matchesExpected(e, { cls: "degraded_artifact", subject: "ado" }), false, "subject mismatch");
});

test("matchesExpected: a constraint the signal can't express is not tested (finding has no class)", () => {
  const e = { class: "degraded_artifact", subject: "tracker_field_contract", pluginFile: null };
  // finding-shaped signal (subject only, no class) — matches on subject; the class constraint is skipped
  assert.ok(matchesExpected(e, { subject: "tracker_field_contract" }));
});

test("matchesExpected: a pluginFile-only entry never suppresses a pluginFile-less signal", () => {
  const e = { class: null, subject: null, pluginFile: "skills/qa-fix-routing/ado.mjs" };
  assert.equal(matchesExpected(e, { cls: "script_exit_nonzero", subject: "ado" }), false, "no file on the obs → no match");
  assert.ok(matchesExpected(e, { pluginFile: "skills/qa-fix-routing/ado.mjs" }), "matches when the file IS present");
});

test("matchesExpected: subjectEq lets the deliver side normalize the enum (raw slug entry matches enum finding)", () => {
  const e = { class: null, subject: "ado", pluginFile: null };
  const enumEq = (entrySubj, findingSubj) => (entrySubj === "ado" ? "ado_cli" : entrySubj) === findingSubj;
  assert.ok(matchesExpected(e, { subject: "ado_cli" }, enumEq));
});

test("findExpected: returns the first matching entry or null", () => {
  const entries = [{ subject: "a", reason: "r1" }, { subject: "b", reason: "r2" }];
  assert.equal(findExpected(entries, { subject: "b" }).reason, "r2");
  assert.equal(findExpected(entries, { subject: "z" }), null);
});
