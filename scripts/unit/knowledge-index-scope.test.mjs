// Guard over the scope DERIVATION in scripts/maintenance/gen-knowledge-index.mjs.
//
// Per `.claude/knowledge/execution/when-to-write-a-test.md`: test the derivation, never the
// declaration. The roster's file list is a declaration (the directory owns it) and the gate
// `knowledge:index:check` already covers it — nothing here re-asserts which files exist. What IS a
// derivation, and what this file guards, is `scopeOfText`: four fallback layers over hand-written
// markdown whose failures are all SILENT, because a wrong scope line still renders as a plausible
// table row and nobody re-reads 60 of them.
//
// Every case below is a bug that actually shipped into a generated index on 2026-09-25 and was
// caught only by eyeballing the output:
//
//   1. `rationale: |` captured one line deep — the `m` flag makes the lookahead's `$` match END OF
//      LINE, so the lazy quantifier stopped at the first newline. Cut every domain map mid-clause.
//   2. a `**bold**` lead paragraph skipped as a list bullet — `[-*+]` without a trailing space.
//   3. a hard-wrapped paragraph cut at the wrap, because extraction read one LINE, not the paragraph.
//   4. `**Generated:** …` provenance headers surfacing as the scope — the metadata test ran against
//      raw markdown, so the `**` prefix meant it never matched.
//   5. a `---` horizontal rule returned AS the scope line.
//
// These are exactly the mutations a reviewer passes over, which is the case for a test rather than
// a second pair of eyes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeOfText } from "../maintenance/gen-knowledge-index.mjs";

test("a block-scalar frontmatter summary is captured WHOLE, not one line deep", () => {
  const scope = scopeOfText(
    [
      "---",
      "domain_slug: b2b",
      "rationale: |",
      "  What the B2B feature IS — actors, the value chain, the surface inventory per",
      "  layer, and where those layers DISAGREE.",
      "generated: 2026-09-16",
      "---",
      "",
      "# B2B — Domain Map",
      "",
      "## 1. Actors",
    ].join("\n"),
  );
  // The `m`-flag bug truncated this at "per".
  assert.match(scope, /layer/, "block scalar was cut at the first newline");
  assert.ok(!scope.endsWith("per"), `scope cut mid-clause: ${scope}`);
});

test("a **bold** lead paragraph is a paragraph, not a list bullet", () => {
  const scope = scopeOfText("# Authoring standard\n\n**Read this before you create a component.** It is the checklist.\n");
  assert.match(scope, /^Read this before you create a component\./);
});

test("a hard-wrapped paragraph is joined before the sentence is taken", () => {
  const scope = scopeOfText(
    ["# Shared BA Instructions", "", "Shared framework for the BA team — ba-system-analyzer, ba-api-specialist, and", "ba-doc-writer. These agents analyze a project.", ""].join("\n"),
  );
  assert.match(scope, /ba-doc-writer\.$/, `stopped at the line wrap: ${scope}`);
});

test("a provenance header is skipped, even when bolded, and the next paragraph wins", () => {
  const scope = scopeOfText(
    ["# Sitemap", "", "**Generated:** September 18, 2026 (rev 9)", "**Base URL:** FRONT_URL", "", "Full storefront URL map for the deployed theme.", ""].join("\n"),
  );
  assert.match(scope, /^Full storefront URL map/, `provenance header leaked: ${scope}`);
});

test("a horizontal rule is never returned as the scope", () => {
  const scope = scopeOfText("# Products\n\n---\n\nStorefront product types plus the xAPI fields behind them.\n");
  assert.ok(!/^-{2,}$/.test(scope), `horizontal rule returned as scope: ${scope}`);
  assert.match(scope, /^Storefront product types/);
});

test("applicability_rationale ranks BELOW the body paragraph — it answers a different question", () => {
  const raw = [
    "---",
    'applicability_rationale: "Universal across VC customers; the storefront under analysis is data."',
    "---",
    "",
    "# Platform patterns",
    "",
    "Cross-layer architecture knowledge shared by all QA agents.",
  ].join("\n");
  assert.match(scopeOfText(raw), /^Cross-layer architecture knowledge/);
});

test("applicability_rationale IS used when the file has no body paragraph, unquoted", () => {
  const raw = [
    "---",
    'applicability_rationale: "VC platform OAuth2 token endpoint pattern. Same for every deployment."',
    "---",
    "",
    "# Platform API Authentication",
    "",
    "## OAuth2 Token Endpoint",
  ].join("\n");
  const scope = scopeOfText(raw);
  assert.equal(scope, "VC platform OAuth2 token endpoint pattern.", "YAML quote leaked into the row");
});

test("the H1 is the last resort, for a generated dump with no prose at all", () => {
  assert.equal(
    scopeOfText("# UCP contract surface — GENERATED, do not edit by hand\n\n## Types\n\n| a | b |\n"),
    "UCP contract surface — GENERATED, do not edit by hand",
  );
});

test("a pipe is escaped so a scope line cannot split the table cell it lands in", () => {
  const scope = scopeOfText("# Lanes\n\nRouting for chrome | firefox | edge across the pool.\n");
  assert.ok(!/(^|[^\\])\|/.test(scope), `unescaped pipe would break the row: ${scope}`);
});

test("a file with nothing usable yields null, so the generator can flag KB-IDX-002", () => {
  assert.equal(scopeOfText("| a | b |\n|---|---|\n| 1 | 2 |\n"), null);
});
