// Guards the `.claude/` ↔ `plugins/vc-fix/` mirror.
//
// This file used to carry its own hardcoded list of pairs that must stay byte-identical. That list
// could only ever name the files that already happened to match, which is why the 2026-09-07 audit
// found 64 of 92 shared paths diverged with nothing watching them. The list is now DERIVED from
// `scripts/maintenance/mirror-check.mjs` — one registry, one vocabulary of reasons, and a fork that
// nobody declared fails rather than passing silently.
//
// The security argument for byte-identity on the containment core is unchanged (PR #143): the
// self-diagnostics hooks ship twice, BOTH copies are registered, and hooks are AND-gated, so a
// stale copy denies whatever the fresh one allows — and the hardened redaction plus the
// default-deny closed-schema upstream path are what keep client data from leaving the machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditMirror,
  classify,
  canonicalise,
  driftSize,
  FORKS,
  REASONS,
  CONTAINMENT_CORE,
  BYTE_IDENTICAL,
} from "../maintenance/mirror-check.mjs";

// ---- the live corpus ---------------------------------------------------------------------------

const audit = auditMirror();

test("the self-diagnostics containment core is byte-identical on both surfaces", () => {
  assert.deepEqual(
    audit.containmentDrift,
    [],
    "a one-sided edit here reopens the client-data-leak class on one surface while the other stays fixed",
  );
  for (const p of CONTAINMENT_CORE) {
    assert.ok(audit.shared.includes(p), `${p} must exist in BOTH trees, not just one`);
  }
});

test("every shared path is identical, structural, or a DECLARED fork", () => {
  assert.deepEqual(
    audit.undeclared.map((f) => f.path),
    [],
    "add the pair to FORKS in scripts/maintenance/mirror-check.mjs with a reason, or sync it",
  );
});

test("every declared reason is in the closed vocabulary", () => {
  assert.deepEqual(audit.badReason.map((f) => f.path), []);
  for (const reason of Object.values(FORKS)) assert.ok(reason in REASONS, `unknown reason "${reason}"`);
});

test("the registry cannot rot — a declared fork that is no longer forked must be removed", () => {
  assert.deepEqual(audit.resyncedDeclarations, []);
});

test("the mirror has not silently shrunk", () => {
  // Not a transcribed count of anything derived — a floor. Files may be added to either tree; a
  // shared path DISAPPEARING means one side was deleted, which is exactly the fork-by-omission the
  // registry cannot see (it only compares paths present in both).
  assert.ok(audit.shared.length >= 92, `shared paths dropped to ${audit.shared.length}`);
  assert.ok(
    audit.identical.length + audit.structural.length >= 40,
    `gated pairs dropped to ${audit.identical.length + audit.structural.length}`,
  );
});

// ---- the classifier ------------------------------------------------------------------------------

test("a path that MUST differ between the trees does not count as content drift", () => {
  const root = "See `plugins/vc-fix/commands/qa-fix.md` and `.claude/knowledge/execution/quality-gates.md`.";
  const plugin = "See `commands/qa-fix.md` and `.claude/rules/quality-gates.md`.";
  assert.equal(classify(root, plugin), "structural");
});

test("the routing data's relocation into the skill is structural, not drift", () => {
  assert.equal(
    classify("routed by `ci/lib/repo-router.ts` from `ci/config/fix-repos.json`",
             "routed by `skills/qa-fix-routing/repo-router.ts` from `skills/qa-fix-routing/fix-repos.json`"),
    "structural",
  );
});

test("a link into rules/ normalises across depth AND tree shape", () => {
  assert.equal(classify("[x](../../rules/reports.md)", "[x](../../.claude/rules/reports.md)"), "structural");
});

test("a real word change is still a fork, even on a line full of paths", () => {
  assert.equal(
    classify("`plugins/vc-fix/x.md` — always REJECT", "`x.md` — always APPROVE"),
    "forked",
    "normalisation must not swallow content",
  );
});

test("CRLF alone is not a fork", () => {
  assert.equal(classify("a\r\nb\r\n", "a\nb\n"), "structural");
});

test("identical text classifies as identical, not structural", () => {
  assert.equal(classify("same\n", "same\n"), "identical");
});

test("driftSize counts lines on each side, ignoring blank lines", () => {
  const d = driftSize("keep\nonly-root\n\n", "keep\nonly-plugin\nalso-plugin\n");
  assert.deepEqual(d, { rootOnly: 1, pluginOnly: 2, reordered: false });
});

test("canonicalise is idempotent", () => {
  const once = canonicalise("see `plugins/vc-fix/knowledge/x.md` and `../../rules/reports.md`");
  assert.equal(canonicalise(once), once);
});

// ---- the burn-down ---------------------------------------------------------------------------------

test('"undecided" is a burn-down list, not a resting place', () => {
  // A ratchet, not a target: the count may fall, never rise. Each entry is a pair where nobody has
  // decided which side wins. Adjudicating one means replacing "undecided" with a real reason.
  assert.ok(
    audit.undecided.length <= 10,
    `undecided forks rose to ${audit.undecided.length}; declare a real reason instead of adding one`,
  );
});

// ---- regression tests for the 2026-09-09 review findings -------------------------------------
//
// Every test below reproduces a defect the first cut of this gate actually had. They are grouped
// because the shape they share is the one that matters: a gate that reports OK for a state it was
// built to catch is worse than no gate, since it also stops anyone looking.

test("F1 — --json emits parseable JSON and nothing else", async () => {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("node", ["scripts/maintenance/mirror-check.mjs", "--json"], {
    encoding: "utf-8",
  });
  assert.doesNotThrow(() => JSON.parse(out), "the OK banner must not be appended to machine output");
  assert.ok(JSON.parse(out).shared.length > 0);
});

test("F2 — a declared fork whose plugin copy VANISHED is an orphan, not a re-sync", () => {
  // The remedies are opposite: a re-sync says "delete the FORKS entry", and following that advice
  // on a deleted file turns a fork-by-omission green.
  assert.deepEqual(audit.orphanedDeclarations, [], "every declared fork must exist in both trees");
  assert.deepEqual(audit.resyncedDeclarations, []);
  assert.ok(
    Object.keys(audit).includes("orphanedDeclarations") && Object.keys(audit).includes("resyncedDeclarations"),
    "the two must stay separate fields — conflating them is the defect",
  );
});

test("F3 — the AND-gated allowlist hook is byte-gated, not declared a permanent fork", () => {
  assert.ok(CONTAINMENT_CORE.includes("hooks/enforce-real-user.mjs"));
  assert.ok(
    !Object.hasOwn(FORKS, "hooks/enforce-real-user.mjs"),
    "a FORKS entry would exempt it from drift detection — the exact shape of REG-2026-09-07-2225",
  );
});

test("F4 — a line-ending flip on a shared path is a failure, not invisible", () => {
  assert.deepEqual(audit.eolDrift, [], "canonicalise folds CRLF, so nothing else here can see this");
});

test("F5 — the walk skips symlinks and vendor/worktree dirs", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: j } = await import("node:path");
  const root = mkdtempSync(j(tmpdir(), "mirror-walk-"));
  for (const side of [".claude", "plugins/vc-fix"]) {
    mkdirSync(j(root, side, "knowledge"), { recursive: true });
    writeFileSync(j(root, side, "knowledge/a.md"), "same\n");
    mkdirSync(j(root, side, "node_modules/.bin"), { recursive: true });
    writeFileSync(j(root, side, "node_modules/pkg.json"), "{}");
    symlinkSync(j(root, "does-not-exist"), j(root, side, "node_modules/.bin/dangling.mjs"));
  }
  const r = auditMirror(root);
  assert.deepEqual(r.shared, ["knowledge/a.md"], "node_modules must not enter the mirror");
  // The real point: a dangling symlink used to throw ENOENT out of statSync and kill the gate.
});

test("F6 — a reordered or re-duplicated fork does not report as zero drift", () => {
  assert.deepEqual(driftSize("a\nb\n", "b\na\n"), { rootOnly: 0, pluginOnly: 0, reordered: true });
  assert.equal(driftSize("a\na\nb\n", "a\nb\n").rootOnly, 1, "a duplicate is drift; Set membership hid it");
});

test("F7 — a pair that is byte-identical today is on the ratchet", () => {
  assert.deepEqual(audit.unratcheted, [], "add it to BYTE_IDENTICAL — the ratchet only tightens");
  assert.deepEqual(audit.byteDrift, []);
  assert.deepEqual(audit.byteOrphaned, []);
  for (const p of CONTAINMENT_CORE) assert.ok(BYTE_IDENTICAL.includes(p), `${p} must be on the ratchet`);
});

test("F8 — the same target cited at different depths is not a fork", () => {
  assert.equal(classify("[x](knowledge/foo.md)", "[x](../../knowledge/foo.md)"), "structural");
  assert.equal(classify("see `knowledge/a.md`", "see `../../../knowledge/a.md`"), "structural");
  // ...but stripping `../` must not merge genuinely different targets.
  assert.equal(classify("[x](knowledge/foo.md)", "[x](../../knowledge/bar.md)"), "forked");
});

test("F9 — a reason inherited from Object.prototype is not in the vocabulary", () => {
  for (const name of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
    assert.ok(!Object.hasOwn(REASONS, name), `"${name}" must not pass the closed-vocabulary check`);
  }
});
