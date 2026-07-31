# Triangulation Criteria — the evidence bar, source map, verdict table, and auto-fix matrix

Reference for **Dimension 11** of `/qa-review-tests` (the `--triangulate` flag). The skill's
SKILL.md holds the flow; this file holds the judgment rules the triangulation runs against.

Direct sibling of `.claude/skills/qa-review-bl/bl-audit-criteria.md` — same three axes, same
evidence bar, same waiver logic. The difference is the **subject**: `/qa-review-bl` triangulates a
`BL-*` invariant in the oracle; this triangulates **an assertion in a regression test case**.

## 0. Why this dimension exists

Dimensions 1–10 verify a case against **itself** — CSV shape, step tags, `@td()` refs, duplication —
plus one live check (Dim 8) that asks only *"does this page/element still exist?"*.

The grounding gate (GRD-001, `scripts/test-cases/lint-test-cases.ts`) checks that an assertion
**carries a provenance tag of a grounded class** (`{SPEC}` / `{BL}` / `{DOC}` / `{OBSERVED}`). It
never checks the tag is **true**. So all of these lint green today:

- a `{DOC}` tag whose doc no longer says that
- an `{OBSERVED}` tag captured against a build from six months ago
- a `{BL}` tag citing an invariant that has since been amended or retired
- a `{SPEC}` tag whose ticket was descoped

Dimension 11 is the only thing that asks **"is this asserted behavior still true?"**

## 1. The evidence bar (what "confirmed" requires)

An assertion is **confirmed** (CONFIRMED / DRIFT) only when it has an evidence tuple from **all
applicable axes** that **agree** with each other. Each axis must yield a concrete artifact, not an
opinion:

| Axis | Concrete evidence required | Source |
|------|----------------------------|--------|
| **Docs** | A quote + a doc reference (VirtoOZ topic + section, or a docs URL) that states the behavior | `/vc-docs` (VirtoOZ MCP), Context7 fallback |
| **Source** | A `file:line` anchor **for every surface that can write the asserted state** (§1c) — not one anchor | GitHub MCP `search_code` / `get_file_contents` (read-only; QA never clones) |
| **Live** | An `{OBSERVED}` result (screenshot / captured API response) confirming the behavior on the deployed build | `qa-testing-expert` (playwright-firefox), real UI/API only — REAL-USER rule, no `browser_evaluate` / `run_code_unsafe` bypass |

Any applicable axis with **no** evidence → **UNGROUNDED**. Axes that **disagree** → **CONTRADICTORY**.
Neither is confirmed; both are reported as proposals and **never** write to the CSV.

### 1a. `docs: N/A` allowance — behavior no documentation can cover

Test cases assert far more undocumented behavior than BL invariants do, so this waiver carries more
weight here than in `/qa-review-bl`. Three classes can **never** satisfy the Docs axis:

1. **Implementation / UX mechanics** — rounding, decimal-money arithmetic, GraphQL HTTP status codes,
   coupon-slot UX, quantity-reject-vs-auto-cap, facet-render mechanics, infinite-scroll batching,
   combobox accessible-name behavior. The VirtoOZ guides do not narrate these.
2. **QA-authored methodology** — layout-stability (`BL-UI-*`), a11y, performance-threshold, and
   GA4-tracking assertions. These are *our* oracles, not product documentation.
3. **Project-specific extensions** — capability layered on the platform with no upstream doc surface
   (Mixed-Cart Loyalty, sales-rep scoping, a regression-fix-specific invariant).

The Docs axis may be marked `N/A` and treated as satisfied — so `Source + Live` alone can reach
CONFIRMED/DRIFT — **only** when ALL of these hold:

- **Source AND Live are BOTH present this run and agree** — a fresh `file:line` anchor **and** a fresh
  `{OBSERVED}` result. `N/A` never substitutes for a missing Source or Live axis; it covers **only** Docs.
- the verdict records an explicit `Docs: N/A — <implementation-detail | qa-methodology | project-specific>: <reason>`,
  which is carried into the CSV stamp and the run report, so the substitution is auditable.
- the auditor judged the behavior **genuinely undocumentable** — NOT merely "no doc found this session."
  A doc that exists but wasn't checked (rate-limit, budget) is a *missing* axis → **UNGROUNDED**, not `N/A`.

**When in doubt, UNGROUNDED, not N/A.** A lone surviving axis never confirms anything — at least two
axes must remain and agree.

### 1b. Structurally-unavailable axes beyond docs

| Situation | Axis waived | Consequence |
|---|---|---|
| Suite has `agent: "none"` (runner-native, e.g. `048c`) | **Live** — there is no browser lane for it | Docs + Source must both be present and agree. Assertions here are almost all QA-methodology, so this pairs with a `docs: N/A` — meaning a single-axis run, which **cannot confirm**. Such suites get a source-only report, verdict UNGROUNDED by construction, and are excluded from auto-apply |
| Source repo cannot be resolved (see §2) | **Source** | Docs + Live must both be present and agree |
| A P0-security assertion whose live probe is unsafe to run (real privilege escalation) | **Live** — treated as *absent*, not waived | ⇒ **UNGROUNDED** ⇒ proposal only, never auto-applied |

### 1c. The source axis must cover EVERY writer, not one anchor

A single `file:line` is not the source axis — it is one sample of it. Before claiming the source axis
is satisfied, enumerate **every surface that can write the state being asserted**, and anchor each:

| Surface | Where to look |
|---|---|
| Storefront (buyer-facing) | `vc-frontend/client-app/modules/<domain>/` — pages, composables, GraphQL mutations |
| Module Admin SPA (operator-facing) | `vc-module-<x>/src/…Web/Scripts/blades/*.js` — **toolbar commands and their `canExecuteMethod`**, plus any field bound to a setting |
| Backend / API | the module's `Core` constants + command handlers, and the xAPI (`vc-module-x-*`) mutation resolvers |
| Configuration | a platform setting that constrains or seeds the value — a **dictionary** setting (`IsDictionary = true`) is operator-editable, so its live contents are **environment state**, not a code constant, and the code's `AllowedValues` is only the seeded default |

**Worked failure (2026-07-31, suite 015).** A draft rule about quote status was authored from
`vc-frontend`'s `view-quote.vue` plus the module's `ModuleConstants.cs`, and stated that approval was
buyer-only and terminal. It was wrong on both counts. The module's **Admin blade** — never opened —
showed that (a) an operator approves by setting the status directly via a dictionary-bound dropdown
under `quote:update`, with no dedicated approve command, and (b) the *Put on hold* command toggles an
`isLocked` boolean and never touches `status` at all. Four different sites write that one field; the
draft had anchored one and met the old single-anchor bar while covering a quarter of the writers.

**Scope bias is the trap.** The suite under audit constrains *what you assert*, never *where the
behavior lives*. Auditing a `Frontend/` suite does not license a storefront-only model of a
cross-surface field. Ask "who can change this?" before "what does the page show?".

### 1d. Absence is never an explanation

A missing constant, enum member, i18n key, or column is a **finding, not a cause**. It licenses
exactly one conclusion — "this surface does not define it" — and never a story about *why*.

When the expected definition is absent, the axis is **incomplete until you find the mechanism that
replaces it**. In the worked failure above, `QuoteStatus` had no `OnHold` constant; the draft
explained that as "the dictionary drifted from the code default," which was invented. The real
mechanism was a separate boolean. The absence was the clue; the narrative was fabrication.

If the replacing mechanism cannot be found this run, the verdict is **UNGROUNDED** and the write-up
says *"no constant defines this and the writing mechanism was not located"* — which is a true,
useful sentence — rather than a guess at the reason.

### 1e. Deploy lag is CONTRADICTORY, never DRIFT

The commonest disagreement: **source shows a merged fix, live shows the old behavior** — the pinned
artifact simply trails master. This is a **CONTRADICTORY**, held as a proposal with a re-audit
trigger. Never rewrite a case to match a build that is about to change; a *not-yet*, not a failure.
The inverse (live shows new behavior, source anchor not found) usually means the source axis was
resolved to the wrong repo — re-resolve before concluding anything.

## 2. Source-axis resolution — suite → repo

The source axis needs the repo that backs the suite. There is no direct map, so resolve in this order
and **stop at the first hit**:

1. `config/test-suites.json` → the suite's **`requiresModules`** (module slugs, e.g. `["orders"]`)
2. `.claude/knowledge/execution/module-suite-map.md` → the Module Map table, reverse-lookup the suite
   number → Module name + REST API path + xAPI module
3. `ci/config/fix-repos.json` → the `routing[]` regex rules map a module/domain term → repo name
   (`vc-module-x-cart`, `vc-frontend`, `vc-platform`, …)

**Unresolvable ⇒ the source axis is ABSENT ⇒ UNGROUNDED. Never guess a repo.** A wrong repo produces
a confident `file:line` anchor for unrelated code, which is worse than no anchor — it manufactures a
false CONFIRMED.

### Per-domain source map

Keyed on the suite's `domain` / `layer` fields in `config/test-suites.json`. A starting point —
follow the evidence where it leads.

| Suite domain | Docs (VirtoOZ tool) | Source (likely repo) | Live surface |
|---|---|---|---|
| `purchase-flow` (cart/checkout/payment) | StorefrontUserGuide, StorefrontDeveloperGuide | vc-module-x-cart, vc-module-orders, vc-module-payment-*, vc-frontend | Storefront cart/checkout; Admin SPA for `layer: backend` |
| `catalog-search` | StorefrontUserGuide, PlatformDeveloperGuide | vc-module-catalog, vc-module-search, vc-module-x-catalog | Storefront catalog/search + Admin |
| `customer-b2b` | PlatformUserGuide, StorefrontUserGuide, B2BExperts | vc-module-customer, vc-platform, vc-frontend | Storefront company area + Admin |
| `auth-security` | PlatformUserGuide, StorefrontUserGuide | vc-module-customer, vc-platform, vc-frontend | Storefront auth + Admin users/roles |
| `platform-config` | PlatformUserGuide, PlatformDeveloperGuide | vc-platform, matching vc-module-* | Admin SPA |
| `marketing` | StorefrontUserGuide | vc-module-marketing, vc-module-x-marketing | Storefront promotions + Admin |
| `content-cms` | PlatformUserGuide, MarketplaceUserGuide | vc-module-content, vc-module-pagebuilder | Admin SPA + storefront pages |
| `communication` | PlatformUserGuide | vc-module-notification, vc-module-push-messages | Admin SPA |
| `branding` | PlatformUserGuide | vc-module-white-labeling, vc-frontend | Storefront branding + Admin |
| `sales-rep` | B2BExperts | vc-module-customer, the sales-rep module + its vc-shell app | Storefront + Admin embedded app |
| `cross-cutting` | mixed / often **`docs: N/A`** | vc-frontend, vc-platform | Storefront |

For `layer: backend` + `concern: api` suites (GraphQL/REST), prefer the VirtoOZ `*SourceCode` tools
and `.claude/knowledge/api/graphql-schema.md` over the guide tools; the live axis is GraphiQL, not a
browser flow.

## 3. Verdict decision table

Applied **per assertion**. `D` = docs, `S` = source, `L` = live. "Case text matches?" means the
Steps/Assertions **as written** describe what the agreeing axes show.

| D | S | L | Case text matches evidence? | Verdict |
|---|---|---|---|---|
| ✓ | ✓ | ✓ | yes | **CONFIRMED** |
| ✓ | ✓ | ✓ | no (evidence agrees, case text stale) | **DRIFT** |
| ✓ | ✓ | ✓ | (behavior is real but no case covers it) | **MISSING** |
| N/A (§1a) | ✓ | ✓ | yes | **CONFIRMED** |
| N/A (§1a) | ✓ | ✓ | no (evidence agrees, case text stale) | **DRIFT** |
| N/A (§1a) | ✓ | ✓ | (behavior is real but no case covers it) | **MISSING** |
| an applicable axis absent (incl. docs that *could* exist but wasn't found — not §1a) | — | — | — | **UNGROUNDED** |
| fewer than two axes remain after waivers | — | — | — | **UNGROUNDED** |
| present but conflicting (incl. deploy lag, §1e) | — | — | — | **CONTRADICTORY** |
| all applicable axes say the behavior is gone | — | — | — | **RETIRE** |

**Roll-up:** a case's verdict is its **worst** assertion verdict, ordered
`CONFIRMED < MISSING < DRIFT < UNGROUNDED < CONTRADICTORY < RETIRE`. A case with one DRIFT assertion
and nine CONFIRMED ones is a DRIFT case — but only the DRIFT assertion is rewritten (§5 rule 2).

## 4. Auto-fix matrix — what `--triangulate --fix` may write

**Ordering is fixed:** static review (Dims 1–7, 9, static 10) → live verification (Dim 8) →
triangulation (Dim 11) → **then** one apply pass. Fixes are never applied before the axes are
gathered, because a DRIFT rewrite needs the evidence to rewrite *to*.

`--triangulate` adds two new fix classes to the existing `--fix` set; it does not change any existing
one (`--verify --fix`'s ENV-008 rewrite and `{HYPOTHESIS}`→`{OBSERVED}` upgrade still behave exactly
as SKILL.md Step 6 describes).

| Verdict | Writes to CSV? | What it writes |
|---|---|---|
| **CONFIRMED** | ✅ stamp only | Refresh the `Audited:` stamp in `References`; re-date the assertion's provenance tag (an `{OBSERVED}` re-confirmed today stays `{OBSERVED}` but the row's stamp proves *when*). **No Steps/Assertions text change.** |
| **DRIFT** | ✅ text + stamp | Rewrite **only the drifted assertion** (or the drifted step) to what the agreeing axes show, set its tag to the strongest grounded class available (`{OBSERVED}` when live confirmed it), and stamp. |
| **MISSING** | ❌ | Seed title + the axis evidence into the run report only. Authoring new cases is `/qa-test-lifecycle` Phase 3's job — **never fabricate a case here**. |
| **CONTRADICTORY** | ❌ | Proposal in the report, with the conflicting evidence and a re-audit trigger. |
| **UNGROUNDED** | ❌ | Proposal in the report, naming **which** axis was absent and why. |
| **RETIRE** | ❌ | Proposal in the report. Deprecation is destructive — it silently removes coverage if the verdict is wrong — so it is **always** human. Never set `Automation_Status: Deprecated` automatically. |

### Interactive vs `--ci`

| Mode | Gate on writes |
|---|---|
| `--fix` (interactive) | Present the report, propose per-finding fixes, **ask for confirmation** before touching a CSV (unchanged, SKILL.md Step 7). |
| `--fix --ci` (unattended) | No prompt — apply CONFIRMED + DRIFT directly to the working tree. **The PR review is the human gate.** Everything in the ❌ rows above still never writes, so an unattended run can only ever produce stamp refreshes and evidence-backed assertion rewrites. |

`--ci` is what makes the daily scheduled audit possible. It is a *narrower* privilege than
interactive `--fix`, not a wider one: interactive `--fix` can apply the Dim 1–7 structural fixes a
human approves; `--ci` applies only what three agreeing axes proved.

## 5. Edit-safety rules (when auto-applying)

1. **Row body only.** Edit within the case's own row. Never renumber IDs, never reorder rows, never
   touch the header. The 15-column contract (`scripts/test-cases/append-test-cases-to-suite.ts`)
   is unchanged by this dimension.
2. **Minimal, per-assertion diffs.** Rewrite only the assertion(s) that drifted — not the whole
   `Assertions` cell — so a single wrong rewrite is revertible from `git diff` and a reviewer can see
   exactly what changed.
3. **Stamp provenance on every applied row**, appended to the existing free-text `References` column
   (which already carries `Synced:` / `Corrected:` stamps in this shape):
   ```
   Audited: <date> (TCA-<date>); Source: <repo>/<path>:<line>; Docs: <topic §section | N/A — <reason>>
   ```
   Replace a prior `Audited:` token rather than accumulating them — one stamp per row, always the
   most recent.
4. **Do NOT add a provenance tag to a legacy untagged case.** Provenance is opt-in **per case**
   (GRD-001, `scripts/test-cases/lint-test-cases.ts`): a case becomes *provenance-adopted* the moment
   **any** of its assertions carries a `{...}` tag, and from then on every untagged sibling is a
   **High** finding. So tagging the single assertion you rewrote converts its untouched siblings into
   new findings and fails rule 8's re-gate — the fix gets reverted for a reason that has nothing to do
   with the fix. On a legacy untagged case, rewrite the assertion **without** a tag and let the
   `Audited:` stamp (rule 3) carry the evidence; the stamp is row-level and triggers nothing. Add tags
   only to a case that is *already* provenance-adopted, or tag every assertion in the case — which is
   a larger change than a DRIFT rewrite and belongs to `/qa-test-lifecycle`, not here.

   > Worked case (2026-07-31, suite 011 CHK-087): the row had five untagged assertions. Tagging the
   > one rewritten assertion `{OBSERVED}` would have made the other four GRD-001 High and reverted an
   > otherwise correct, three-axis-confirmed fix. Note this is the mirror image of rule 3 — row-level
   > stamp: always; assertion-level tag: only if already adopted.
5. **Preserve every untouched column.** `ID`, `Priority`, `Business_Rule`, `Test_Data`, `Cleanup`,
   `Automation_Status` are not this dimension's business unless a verdict specifically implicates them.
6. **Never regress the no-hardcode rule.** A DRIFT rewrite must keep `{{VAR}}` / `@td()` resolution
   (`.claude/rules/test-data.md`) — rewriting an assertion to a literal price/SKU/URL observed live
   is a DV-013…020 violation, not a fix. Assert the structural invariant, not the observed literal
   (DV-016). This is the single most likely way an auto-fix does damage.
7. **Never assert an invented literal.** Only a `{DOC}`- or `{OBSERVED}`-grounded message string may
   be asserted verbatim (GRD-002). A DRIFT rewrite grounded in source code may quote an i18n **key**,
   not a guessed rendering of it.
8. **Re-run the deterministic gate after applying** — `npm run suites:review -- <csv>` plus
   `td:validate` and, for GraphQL suites, `graphql:lint-labels`. An auto-fix that introduces a new
   Blocker/Critical is reverted, not shipped. Compare against the **pre-edit baseline**, not against
   zero: these suites carry large pre-existing backlogs, so "no NEW finding" is the bar.
9. **`Automation_Status` transitions are not automatic.** A CONFIRMED case does **not** get promoted
   `Draft → Reviewed` by this dimension; promotion still requires the full peer-review gate in
   SKILL.md Rules. Triangulation supplies evidence *for* that decision, it does not make it.

## 6. What stays human-gated

- **CONTRADICTORY** — the axes disagree; a human decides which is authoritative (most often: wait for
  the deploy).
- **UNGROUNDED** — an applicable axis produced no evidence, including an unresolvable source repo and
  a live-unsafe P0-security assertion.
- **RETIRE** — removing coverage.
- **MISSING** — authoring a new case.

All four are reported, never written. In the scheduled pipeline they appear as the **Proposals**
section of the PR body, which is where a reviewer acts on them.

### 6a. A proposal's prose is held to the same evidence bar as an applied edit

The auto-fix matrix (§4) gates what reaches a CSV. It gates **nothing** about the *rule you write* in
a proposal — that text is LLM-authored and ships straight to a human as though it were established.
That asymmetry is the one place this dimension can be confidently wrong while every guard reports
green.

So, when writing a proposed rule:

- **State only what an anchor supports.** Every clause traces to a `[DOC]` quote, a `file:line`, or an
  `{OBSERVED}` result. A clause with no anchor is deleted, not softened.
- **Name the axis coverage you actually achieved**, including what you did NOT read — "live axis
  covered Admin only, not the storefront" is a required sentence when true, not a caveat to omit.
- **Prefer a narrow true rule to a broad plausible one.** A rule about one surface, labelled as
  such, is worth more than a system-wide rule inferred from one surface.
- **No mechanism, no explanation** (§1d). Absence of a definition is reported as absence.

A proposal that cannot meet this bar is still worth filing — as an *observation* with its evidence and
an explicit open question, rather than as a `Rule:`. The 2026-07-31 worked failure (§1c) was a
correctly-gated run — nothing wrong reached a CSV — that nevertheless handed a reviewer a confidently
wrong rule. Treat the write-up as part of the deliverable, not as commentary on it.
