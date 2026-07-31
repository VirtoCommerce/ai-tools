// Guards the self-diagnostics containment invariant across BOTH surfaces.
//
// The vc-fix self-diagnostics subsystem ships TWICE — the canonical `plugins/vc-fix/` copy and
// the project-scoped `.claude/` mirror (CLAUDE.md documents the deliberate duplication: Claude Code
// has no reliable plugin-root path resolution to share these in place). The hardened secret
// redaction + the default-deny closed-schema upstream path are security-critical, so a drift on ONE
// surface would silently reopen the client-data-leak class there while the other stays fixed. This
// test fails CI on any byte-divergence of those files (code-review recommendation, PR #143).
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// The files that MUST be byte-identical between plugins/vc-fix/ and .claude/ (the self-diagnostics
// containment core — CLAUDE.md "kept in lock-step"). Non-self-diagnostics surface (SKILL prose,
// commands) may legitimately diverge and is intentionally NOT listed here.
const MIRRORED = [
  "hooks/redact.mjs",
  "hooks/expected.mjs",
  "hooks/session-telemetry.mjs",
  "skills/vc-self-check/deliver.mjs",
  "skills/vc-self-check/upstream-reduce.mjs",
];

for (const rel of MIRRORED) {
  test(`mirror parity: plugins/vc-fix/${rel} === .claude/${rel} (byte-identical)`, () => {
    const a = readFileSync(resolve(ROOT, "plugins/vc-fix", rel));
    const b = readFileSync(resolve(ROOT, ".claude", rel));
    assert.ok(
      a.equals(b),
      `${rel} DRIFTED between plugins/vc-fix/ and .claude/ — the self-diagnostics containment hardening must ship on BOTH surfaces. Re-sync the copy after editing (edit plugins/vc-fix/ first, then copy to .claude/).`,
    );
  });
}
