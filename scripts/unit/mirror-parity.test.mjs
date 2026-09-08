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
  // --- Extended 2026-09-08 (audit D3: "5 of 99 mirrored paths have a parity gate; the other 94 are
  // governed by prose alone"). Every pair below was byte-identical on that date, so listing it costs
  // nothing today and turns a future one-sided edit into a red test instead of a silent fork. A pair
  // that is MEANT to diverge is removed from this list in the same commit that forks it, with the
  // reason in the commit message — that is the declaration of a winner D1 asked for.
  "knowledge/api/api-auth.md",
  "knowledge/api/graphiql-interaction.md",
  "knowledge/api/order-creation-matrix.md",
  "knowledge/api/platform-patterns.md",
  "knowledge/automation/browser-quirks.md",
  "knowledge/automation/storefront-config-flags.md",
  "knowledge/domain/products.md",
  "knowledge/domain/sitemap.md",
  "knowledge/execution/debugging-signals.md",
  "knowledge/execution/performance-thresholds.md",
  // The ECL oracle: re-synced root → plugin 2026-09-08 (plugin was frozen at v1.0 / March 2026 with
  // 23 of 54 ECL ids). It carries no relative links, so byte identity holds.
  "knowledge/oracles/e-commerce-edge-cases-library.md",
  // The BL oracle: re-synced root → plugin 2026-09-08 (plugin had drifted to 145 of 226 ids, CRLF hid
  // the diff — audit §4.3). Its two cross-links are phrased to hold on both surfaces, so byte identity holds.
  "knowledge/oracles/business-logic.md",
  "skills/angular-admin/angular-patterns.md",
  "skills/angular-admin/css-layout-patterns.md",
  "skills/angular-admin/scratch-harness-patterns.md",
  "skills/dotnet-fix/dotnet10-best-practices.md",
  "skills/dotnet-fix/fix-patterns.md",
  "skills/dotnet-unit-test/xunit-patterns.md",
  "skills/qa-risk/risk-prioritization-framework.md",
  "skills/vc-shell-fix/vc-shell-scratch-harness-patterns.md",
  "skills/vue-fix/vue-fix-patterns.md",
  "skills/vue-fix/vue3-best-practices.md",
  "skills/vue-unit-test/vitest-patterns.md",
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
