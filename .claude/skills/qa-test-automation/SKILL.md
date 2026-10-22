---
name: qa-test-automation
description: "[QA Method] Loaded ONLY while writing or repairing a Playwright `.spec` beside a suite CSV row (the executable twin of a case that PASSED, or of a bug's reproduction). Layout, ID link, fixtures, the one-run proof. Not for authoring CSV rows, running agent waves, or runner-native GraphQL/REST rows."
argument-hint: "<CASE-ID> [--repro]"
---

# /qa-test-automation — write the `.spec` twin of a case

A CSV row and its `.spec` are **one case**: the row says WHAT is checked, the spec is HOW a machine runs it.
Whoever writes the case writes its spec (`test-management-specialist`); this skill is loaded for that
step and for nothing else. The design and every decision (D1–D18) are in
[`docs/superpowers/specs/2026-10-21-suites-reorg-design.md`](../../../docs/superpowers/specs/2026-10-21-suites-reorg-design.md) §4–§8 — **cited here, never restated**.

**Files in this skill (read only the one the step names):**
[`writing-a-spec.md`](writing-a-spec.md) — layout, title, preconditions, writing from source (a `playwright-cli` session as fallback), the one run ·
[`practice.md`](practice.md) — locators, waits, `[MATH]`, collectors, cleanup, anti-flake checklist.

## When a spec is written (and when it is not)

| Situation | Do |
|---|---|
| A deterministic check **passed** (its spec's own run, or an agent run) | Write the spec (D2, D18) |
| A confirmed **bug reproduction** | Write the spec; it must FAIL on an `expect` (D9) |
| A new API check (GraphQL / REST) that **passed** | A **runner-grammar CSV row**, no spec (D12). A handwritten API spec only for what the grammar cannot express |
| Exploratory, visual, `vs. DESIGN`, or a check that cannot be scripted | No spec. The row stays; a mini agent wave runs only those rows (D15) |
| A runner-native row that already exists | Never rewrite it. The wrapper (`regression/lib/runner-cases.spec.ts`) exposes it to Playwright (D4) |

`Automation_Status` gets **no new value** (D10).

## Procedure (numbered; each step is a gate)

1. **Read the row, not your memory of the run.** Open the CSV row for the case ID: Preconditions,
   Test_Data, Steps, Assertions, Cross_Layer_Checks, Cleanup. **The row is the truth for WHAT (D7).** The
   spec implements every assertion the row states, no fewer and none invented. Tags (`[PRE:*]`, `[ACT]`,
   `[MATH]`, `[API]`, `[CONSOLE]`, `[NETWORK]` …): [`../../knowledge/execution/test-runner-tags.md`](../../knowledge/execution/test-runner-tags.md).
2. **Ask the base before you write ANY assertion about platform behaviour.** For each page path /
   GraphQL operation / endpoint the spec touches: `mcp__kb__kb_ask` (a deferred tool — load the six `kb`
   tools via `ToolSearch` → `select:mcp__kb__kb_ask,mcp__kb__kb_show,mcp__kb__kb_none,mcp__kb__kb_capture,mcp__kb__kb_confirm,mcp__kb__kb_dispute`;
   CLI fallback: `npm run kb -- ask "<coordinate> <question>"`), the **coordinate in the question**.
   Close each list by its handle (`kb_show` / `kb_none`); a miss is not a blocker. Then VirtoOZ
   (`/vc-docs`) for what the platform is *supposed* to do, then **observe live** last. Docs bind MECHANISM,
   never SURFACE (labels, control types, counts are `{OBSERVED}`). Rule: [`CLAUDE.md`](../../../CLAUDE.md)
   §Essential Rules → *Product context*; authoring step: [`../../knowledge/agents/authoring-standard.md`](../../knowledge/agents/authoring-standard.md) §5.
3. **Write from source first (D18).** Draft the spec from the component/source and the generated selector
   surface ([`practice.md`](practice.md) §Locators); its one headless run (step 5) is the proof. **Only if** the
   selectors cannot be found that way, pause the draft spec with `npm run specs:debug -- -g "<CASE-ID>:"` and
   attach `npx playwright-cli attach <session>`: sign-in and data come from the spec's own fixtures, and each CLI
   action prints the Playwright line to keep ([`writing-a-spec.md`](writing-a-spec.md) §From a CLI session to a
   spec). The session counts toward the ≤3 browser agents. Do not install the CLI's own skills.
4. **Write the file** at the layout in [`writing-a-spec.md`](writing-a-spec.md) §Layout and title. One
   case per file. Every observed literal goes through `regression/lib/data.ts`; auth only through the
   fixtures in `regression/lib/fixtures.ts` ([`../../rules/test-data.md`](../../rules/test-data.md), all
   rules — `DV-025` fails a literal URL / GUID / e-mail / `reports/` path / `process.env` / `config.js` import).
   Worked examples (read, do not paste):
   `regression/suites/Frontend/cart/028-cart-core/CART-001.spec.ts`, `CART-006.spec.ts`, `CART-007.spec.ts`.
5. **Run it once (D9).** `npx playwright test -g "<CASE-ID>:"`. A passed check must PASS; a bug
   reproduction must FAIL **on an `expect`**. Anything else is a defect of the spec: fix the spec
   ([`writing-a-spec.md`](writing-a-spec.md) §The one run).
6. **Gates.** `npm run suites:lint` (SP-001 spec ID has no row in the sibling CSV; SP-002 file name vs
   `test()` title) and `npm run td:validate` (DV-025). Both must be clean before you hand back.
7. **Bank what the run established** — for each platform behaviour the spec asserts or that you saw on
   the side: matched an entry ⇒ `mcp__kb__kb_confirm`, contradicted ⇒ `kb_dispute`, base held nothing ⇒
   `kb_capture` (CLI: `npm run kb -- capture`). Anchor = the route or request, never a label; contract:
   [`../../knowledge/execution/kb-capture-contract.md`](../../knowledge/execution/kb-capture-contract.md).
   Public base: nothing client-specific. List the entry ids in your hand-back.

## Non-negotiables

- **D7 — never edit the CSV expectation to make a spec pass.** A spec that cannot be made to pass
  *faithfully* is **reported** (a product finding, or a row that is wrong for a human to decide), never
  "fixed" by weakening an `expect`, loosening a locator until it matches something else, or editing the row.
  Why: [`../../knowledge/execution/cases-that-catch-bugs.md`](../../knowledge/execution/cases-that-catch-bugs.md).
- **D8 — outcome mapping.** An `expect` failure is `FAIL`. Any other thrown error (action or navigation
  timeout, fixture or auth failure, a precondition guard) is `BLOCKED` with `spec-defect` in its notes. So a
  precondition the seed should have provided is guarded with a plain `throw new Error(...)`, never an `expect`.
- **No hardcodes, no secrets, no evidence paths in a spec.** The spec never signs in itself, never types a
  password, never names a screenshot or HAR path (THIRD RULE: evidence output belongs to the run's policy,
  [`../qa-evidence/evidence-capture-policy.md`](../qa-evidence/evidence-capture-policy.md)).
- **One author per change covers the spec folder** — the CSV and `<stem>/` beside it are one unit
  ([`../../knowledge/execution/regression-suites.md`](../../knowledge/execution/regression-suites.md) §Executable specs beside a suite).
- **No new `scripts/unit/` file** for a spec or its helpers ([`../../knowledge/execution/when-to-write-a-test.md`](../../knowledge/execution/when-to-write-a-test.md)).
- **Do not alter `regression/lib/` from a spec task.** A missing helper is reported to the owner of the
  harness; a spec-local helper stays in the spec file.

## Hand-back (your output)

One line per spec: `<CASE-ID> → <path>`, the D9 result (`PASS` / `FAIL on expect: <which>`), `suites:lint`
and `td:validate` status, **"pending D17 fidelity review — the case stays on the agent lane until it passes"**, anything reported instead of fixed, and the `kb` ids read / confirmed / disputed /
captured.
