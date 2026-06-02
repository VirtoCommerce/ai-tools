# VC QA Plugin — Versioning & Stability Contract

This doc codifies the **standardization promise** the plugin makes to its consumers. It is the contract Tier A files (methodology) commit to honor, and the rules Tier B and C files follow when changing.

> **Tier reference:** [`.claude/architecture/TIER.md`](../.claude/architecture/TIER.md) for the file-by-file A/B/C/D split. This doc is the *governance* over that map.

## Tier Stability Promises

| Tier | Scope | Stability promise | Allowed changes between minor versions |
|------|-------|------------------|---------------------------------------|
| **A — Methodology** | ISTQB lifecycle, test design, defect workflow, evidence policy, report formats, shared agent instructions, BL ID conventions. | **Frozen contract from v1.0.** Customers can rely on every artifact, format, and rule. Breaking changes only on major-version bump with a migration guide. | Wording clarifications, new examples, new optional sub-sections. **NOT allowed:** renaming an ID, changing a report size cap, removing a required section, altering the test-case CSV column set, changing severity tags. |
| **B — Capability** | Orchestrators, runners, env loader, MCP browser configs, test-data resolver, BA agents, suite manifest schema. | **Stable but evolving.** Public env vars, CLI flags, and file formats follow semver. Internal implementation (script structure, helper functions) may refactor freely. | Adding new env vars (with safe defaults), new CLI flags, new optional manifest fields, performance improvements. **NOT allowed (minor bump):** removing an env var, changing an env var's default in a way that breaks existing runs, removing a manifest field, changing the `@td()` resolver syntax. |
| **C — Domain** | Storefront + Admin SPA knowledge: business-logic.md (BLs), products, sitemap, edge cases, regression suites, surface-specialist agents. | **Versioned per VC product release.** Mutates with every sprint as the storefront and Admin SPA evolve. No stability promise across releases — that's the point: this layer captures what's true now. | Anything. New BLs, new suites, retire stale knowledge files, rename BL IDs (with cross-ref note in CHANGELOG). |
| **D — Missing** | Gaps to be filled (see [`TIER.md` § Tier D](../.claude/architecture/TIER.md#tier-d--whats-missing-for-plugin-distribution)). | Promoted to A/B/C as they land. | N/A — not shipped yet. |

## Semver Rules

The plugin's version follows semver: `MAJOR.MINOR.PATCH`.

- **PATCH** (`1.0.0` → `1.0.1`): bug fixes, doc clarifications, new optional defaults. Customers can upgrade without reading the changelog.
- **MINOR** (`1.0.x` → `1.1.0`): new capabilities, new env vars (with safe defaults), new optional schema fields, new suites, new BLs. Customers should read the changelog but don't need to change config.
- **MAJOR** (`1.x.y` → `2.0.0`): breaking Tier A change, removal of a public capability, env-var rename, manifest-field rename, anything that requires customers to update their `.env` or `.vc-qa.json`. Always paired with a migration guide in `docs/migrations/v{N}.md`.

## What Counts as a Breaking Change

A change is **breaking** if any of the following are true:

- An existing env var is renamed or removed.
- An existing env var's default changes in a way that changes behavior for customers who don't override it (e.g. flipping a feature flag from `false` to `true`).
- A Tier A artifact (skill, rule, command) is removed or renamed.
- A Tier A artifact's documented contract changes (a report size cap moves, a required section becomes optional or vice versa, a severity tag renames).
- The Enriched CSV test-case format gains a required column, or removes any column.
- The suite manifest schema gains a required field, or removes any field, or tightens an existing field's type.
- The `@td()` resolver syntax changes such that existing references no longer resolve.
- The plugin requires a new MCP server that wasn't required before, when the customer had a working install.
- The CLI of any script in `scripts/lib/` or the public ones (`env-check`, `validate-td-refs`, `suites:lint`, etc.) changes in a backwards-incompatible way.

A change is **NOT breaking** if:

- A new env var is added with a safe default.
- A new optional schema field is added.
- A new suite is added.
- A new BL is added (always — BLs are additive by convention).
- A doc is reworded without changing the contract.
- An internal helper is refactored without changing its public interface.

## Tier A Lock — What Can Never Change Post-v1.0 Without Major Bump

These are the artifacts customers will reference in their own docs, training, and CI. Any change to their *contract* is a major bump.

| Artifact | Contract |
|----------|----------|
| `.claude/skills/qa-methodology/qa-process/test-process-lifecycle.md` | The 7 phases, their entry/exit criteria, and the phase-to-skill mapping table. |
| `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md` | The 15-column Enriched CSV format. Column names, semantics, order. |
| `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md` | Evidence capture rules, retention, naming. |
| `.claude/skills/qa-methodology/qa-defect/defect-lifecycle-workflow.md` | JIRA Bug Workflow states + transitions, severity-to-priority mapping. |
| `.claude/skills/qa-methodology/qa-metrics/quality-gates.md` | Quality gate thresholds (pass rate, DRE, defect density). |
| `.claude/rules/reports.md` | 4 report categories, hard size caps, naming conventions. |
| `.claude/rules/test-data.md` | `@td()` syntax, no-hardcode rule, four data layers. |
| `.claude/agents/qa/shared-instructions.md` | Four-layer agent architecture, PASS/FAIL/AMBIGUOUS classifier, evidence standards. |
| BL ID convention | `BL-{DOMAIN}-{NNN}` format. Severity tags. |
| Severity tags | `[P0-revenue]`, `[P0-security]`, `[P1-data]`, `[P1-ux]`, `[P2-ux]`. |

## Changelog Discipline

- Every release bumps `CHANGELOG.md` (TBD — added when first GA release ships).
- Every entry categorizes as: **Added** / **Changed** / **Deprecated** / **Removed** / **Fixed** / **Security**.
- Breaking changes get a leading `**BREAKING:**` marker and a link to `docs/migrations/v{N}.md`.
- Tier A changes (even non-breaking) get a `**Tier A:**` marker so reviewers know to read carefully.

## Customer Upgrade Path

The plugin auto-updates through the Claude Code plugin manager. To bound upgrade risk:

- Customers **pin a version range**, not a specific version. Recommended: `^1.0` (any 1.x, no major bumps).
- Customers can opt into prereleases with `1.x-beta` ranges.
- The plugin records its version in `.vc-qa-version` written by the bootstrap; `npm run env:check` warns if the plugin version doesn't match what the consumer's `.env.{TEST_ENV}` declares.

## Pre-v1.0 Status

**Currently:** v0.x. The plugin is in development on `feature/qa-agentic-standardization`. Nothing is frozen yet. Tier A artifacts are being finalized — once they land in `vc-qa-core` (or whichever distribution mechanism we pick in Phase 2 of the plan), they get the v1.0 freeze stamp.

Until then: any consumer of this repo should expect frequent changes and pin to a specific commit, not a branch tip.

## References

- Strategic plan: [`~/.claude/plans/functional-singing-cosmos.md`](file:///~/.claude/plans/functional-singing-cosmos.md)
- Tier classification: [`.claude/architecture/TIER.md`](../.claude/architecture/TIER.md)
- Report standards: [`.claude/rules/reports.md`](../.claude/rules/reports.md)
- Test-data rules: [`.claude/rules/test-data.md`](../.claude/rules/test-data.md)
