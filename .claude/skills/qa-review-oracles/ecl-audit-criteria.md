# ECL Audit Criteria — the evidence bar, source map, and verdict table

Reference for `/qa-review-oracles ecl`. The skill's SKILL.md holds the flow; this file holds
the judgment rules the triangulation runs against. Direct sibling of `bl-audit-criteria.md`
— same three axes, same bar, same waiver — differing only where the ECL library's **content
shape** differs from BL's.

## 0. What an ECL entry actually is (and why the bar bends)

A BL invariant is a **normative rule** — the platform either obeys it or has a bug. An ECL
entry is an **observed pattern**: a condition class that has bitten e-commerce systems, with
a Frequency and an Impact. That difference changes what evidence means:

| | BL | ECL |
|---|---|---|
| Claim being made | "the system MUST do X" | "condition C is a real risk here, and here is what it looks like" |
| A failing live axis means | the rule is wrong or the build regressed | possibly nothing — the pattern may simply not be *currently* triggerable |
| Deletion bar | behavior removed everywhere | the pattern is **structurally impossible** on this platform, not merely unobserved |

**Consequence: an ECL entry is far harder to RETIRE than a BL invariant.** "I could not
reproduce it" is the *normal* state for an edge case — that is what makes it an edge case.
Retire only on positive evidence the condition can no longer arise (the feature is gone, the
field no longer exists, the flow was removed). When in doubt, CONFIRMED-by-default and leave it.

## 1. The evidence bar (what "confirmed" requires)

Same tuple as BL: concrete artifacts from all three **applicable** axes, agreeing.

| Axis | Concrete evidence required | Source |
|------|----------------------------|--------|
| **Docs** | A quote + doc reference establishing the feature/flow the pattern applies to exists and behaves as described | `/vc-docs` (VirtoOZ MCP), Context7 fallback |
| **Source** | A `file:line` anchor in an `org:VirtoCommerce` repo showing the code path the pattern targets (the validator, the calculator, the resolver) | GitHub MCP `search_code` / `get_file_contents` (read-only) |
| **Live** | An `{OBSERVED}` result showing the surface exists and is reachable — **not necessarily the failure itself** | `qa-testing-expert` (playwright-firefox), real UI/API only |

> **The live axis proves REACHABILITY, not failure.** For BL, live means "the rule holds". For
> ECL, live means "this condition can still arise on the deployed build" — the flow exists, the
> field accepts the input, the state is constructible. Demanding a live reproduction of every
> edge case would retire most of the library on the first audit, which is precisely backwards:
> an edge case that reproduces easily is a bug, and belongs in the tracker.

**Worked examples of the reachability bar** — the first live run of this axis over-claimed UNGROUNDED
until it re-read this rule, so calibrate against these:

| Pattern | SUFFICIENT live evidence | NOT required |
|---|---|---|
| Search index lag | the search endpoint responds and returns the field the pattern concerns | forcing an actual reindex race |
| GraphQL error-shape | the mutation is callable and the response carries the field in question | provoking a real failure |
| Configurable-product selection gate | the PDP renders and the control the pattern names is present/absent as described | completing a bad configuration |
| Payment form location | the processor is selectable and the page behaves as the row claims | submitting a real payment |
| Validator crash / destructive states | **N/A — do not attempt.** Reachability of the surface is the ceiling | triggering the crash on a shared environment |

If you observed the surface and the pattern's subject is present, that is CONFIRMED at the reachability
bar. Reserve UNGROUNDED for "I could not reach the surface at all", not "I did not see it fail".

> **Team memory is corroboration, never an axis.** A `feedback_*` / `project_*` memory matching a row
> (e.g. stale mini-cart pricing) is useful context and worth citing in the report, but it does **not**
> satisfy docs, source or live and must never upgrade a verdict. Memories record what was true when
> written — the whole reason this audit exists.

> **Prefer `get_file_contents` over `search_code` in parallel runs.** GitHub's Search API has a much
> lower shared quota than the Contents API, and 3 concurrent batch agents contend on it — the first
> live run hit `API rate limit exceeded` almost immediately on `search_code` while `get_file_contents`
> kept working throughout. Navigate to the file by path where you can; save `search_code` for when you
> genuinely don't know where to look. If you do get rate-limited, take the degrade path in SKILL.md
> Step 1 rather than scoring the axis absent.

## 1a. `docs: N/A` allowance

Inherited verbatim from `bl-audit-criteria.md` §1a, and it fires **more often** here. Two
classes can never satisfy the Docs axis:

1. **Implementation / UX mechanics** the VirtoOZ guides do not narrate.
2. **Project-specific or cross-industry patterns** — most of chapters 1–13 are generic
   e-commerce risk patterns (race conditions, coupon abuse, impossible-travel velocity) that
   no Virto document will ever describe. These are **doc-N/A by construction**.

Same guards as BL: `Source AND Live must both be present this run and agree`; the entry
records the reason; `N/A` means *genuinely undocumentable*, never "no doc found this session".
**When in doubt, UNGROUNDED, not N/A.**

## 2. Per-chapter source map

| Chapters | What they are | Docs (VirtoOZ tool) | Source (likely repo) | Live surface |
|---|---|---|---|---|
| **1–13** (generic) | Cross-industry e-commerce risk patterns — pricing, race conditions, search, auth, fraud, fulfilment, subscriptions | Usually **N/A** (§1a class 2); use `StorefrontUserGuide` only to confirm the *feature* exists | vc-frontend, vc-module-x-cart, vc-module-pricing, vc-module-marketing | Storefront |
| **14** (VC-specific) | Patterns observed on **this** platform — xAPI errors, ES index lag, B2B org context, configurable products, payment-processor differences, Hangfire timing, schema drift, validator fault isolation | `StorefrontDeveloperGuide`, `PlatformDeveloperGuide`, `*SourceCode` | the owning `vc-module-*` — trace from the pattern's named component | Storefront + Admin SPA + GraphQL |
| **15** (accessibility) | Screen-reader / WCAG interaction patterns | External WCAG 2.1/2.2 success criteria (not VirtoOZ) | vc-frontend UI kit | Storefront + Storybook |

**Chapter 14 carries a 7-column table** (adds `BL Invariant` + `Status` provenance); chapters
1–13 and 15 carry the 5-column generic shape. Match the neighbours — never introduce a third shape.

## 3. Verdict decision table

| Docs | Source | Live | → Verdict |
|---|---|---|---|
| agrees | agrees | reachable | **CONFIRMED** |
| agrees | agrees | reachable, but the entry's text is stale/wrong | **DRIFT** — rewrite the drifted part only |
| N/A (§1a) | agrees | reachable | **CONFIRMED** (2-axis, waiver stamped) |
| behavior documented + coded + reachable, **no entry exists** | | | **MISSING** — add at the next free ID |
| two entries carry the same signal | | | **DUPLICATE** — merge into the survivor |
| any applicable axis absent / blocked | | | **UNGROUNDED** → proposals |
| axes conflict | | | **CONTRADICTORY** → proposals |
| feature/flow/field **gone everywhere** | | | **RETIRE** → proposals (human-gated; see §0's bar) |

## 4. The ID contract — the one rule that outranks tidiness

`ECL-<n>.<m>` is a **citation contract**. Test cases across `regression/suites/**` cite these
numbers in their `Edge_Case_Refs` column, and `npm run ecl:lint` (ECLC-001) is the gate.

- **NEVER renumber a surviving section.** Renumbering to "tidy up" silently repoints every
  citation that was previously correct — a corruption no gate can detect, because the new
  refs still resolve.
- **A retired number is never reused.** A later section at the same number inherits stale
  citations pointing at unrelated content.
- **A new section takes the next free number in its chapter.** A new *chapter* takes the next
  free top-level number (chapter 15 was added this way for accessibility).
- **Adding at a cited-but-missing number is the preferred fix** when the content belongs
  there — see §5.

## 5. Dangling citation ⇒ ADD or REMAP

`ecl:lint` ECLC-001 reports every ECL id cited by a case but absent from the library. Decide
per **cluster**, not per citation:

| Signal | Read it as | Action |
|---|---|---|
| Many cases, one suite, contiguous ids (e.g. 24 cases citing `ECL-1.4`–`1.8`) | The library is **missing content the authors expected**; they cited what should have existed | **ADD** the sections at those exact numbers — retroactively makes every existing citation true |
| A handful of cases whose subject is already covered elsewhere | A genuine mis-citation | **REMAP** — recommend the target; `/qa-review-tests --fix` does the CSV write |
| One case, no plausible home | Read the case; it may be a MISSING of its own, or the case may be wrong | Judge; if unclear, propose rather than force |

**Never invent a section merely to satisfy a dangling ref.** If the content does not belong at
that number, the citation is wrong — say so and let the remap happen. A section added purely to
turn a gate green is worse than the dangling ref, because it looks like coverage.

## 6. Appendix D coherence

Appendix D maps each ECL section → the BL invariants it relates to. It is a **claim about the
body**, not a definition — `ecl:lint` treats it accordingly (ECLL-002: appendix cites a
non-existent section; ECLL-003: body section missing from the appendix).

- Every section added/merged/retired in a run **must** be reflected in Appendix D in the same run.
- Appendix D's BL references are themselves auditable and were a real drift source: rows cited
  `BL-SEARCH-*` and `BL-ORG-*`, **domains that do not exist** (the real prefixes are `BL-SRCH-*`
  and `BL-B2B-*`). Verify each BL ref against `business-logic.md` — `bl:lint` will not catch a
  bad ref inside the ECL library, only inside a suite CSV.
- Update it as its **own deliberate edit**, never as an incidental side effect of a body change.

## 6a. Where an amendment stamp goes in a TABLE (worked example)

BL entries are prose with their own `- **Amended:**` bullet. ECL rows are **pipe-table cells** with
nowhere to hang a per-row stamp — a stamp inside a cell would wreck the column count. So:

**Rewrite the row in place, then append ONE section-level `**Amended:**` paragraph below the table**,
mirroring the existing `**Agent rule:**` convention chapter 14 already uses. Name which row changed and
why, since the stamp is no longer adjacent to it.

Worked example — §14.6 row 2, audited 2026-08-06:

> **Before:** `| **Skyflow/AuthorizeNet after Place Order** | Skyflow, Authorize.Net, DataTrance require clicking 'Place Order' first — redirects to /checkout/payment | High | … |`
>
> **After:** the pattern **name itself** was wrong, not just the description — Skyflow and Authorize.Net had moved to `allowCartPayment=true` and render inline on the cart, leaving Datatrans as the only redirect processor. The row became `| **Datatrans is the only redirect processor** | … |`, followed by a section-level stamp naming row 2, the source anchors, and the live observation.

Two things that example establishes: a DRIFT may require rewriting the **pattern name**, not only the
description (a stale name is what agents actually read); and the stamp names the row because it cannot sit
beside it.

## 6b. An uncited section (ECLC-002) is not automatically a gap

§5 covers the dangling-citation direction. The inverse — a section **no case cites** — has three
readings, and only one of them is "write a test":

1. **Coverage pending** — a real, testable pattern nobody has covered yet. Note it for
   `/qa-test-lifecycle` Phase 3. Do not author cases here.
2. **Legitimately never suite-coverable** — the condition cannot be exercised as a repeatable functional
   CSV case without doing something destructive or out-of-band. `ECL-14.8` (module version/schema drift)
   is the worked example: reproducing it means deliberately corrupting a shared environment's schema.
   **Say so explicitly and close the finding** — this is an environment-hygiene concern that belongs in a
   deploy health check, not a suite. Never manufacture a destructive test to satisfy the gate.
3. **Genuinely dead** — nothing cites it because the pattern is obsolete. That is a RETIRE candidate, and
   it needs §0's positive-evidence bar, not merely the absence of citations.

ECLC-002 is Medium, not High, precisely because reading 2 is common and legitimate.

## 7. Edit-safety rules

- **Body-only.** Never reflow or reformat a section you did not audit.
- **Table shape is per-chapter** (§2). A row with a different column count breaks the table silently.
- **Env- and data-agnostic.** No env names, URLs, slugs, SKUs, prices, emails. Say "the environment".
  Use `@td(ALIAS.field)` / `{{VAR}}` if a concrete reference is unavoidable.
- **Never edit a CSV from this axis.** Citation remaps belong to `/qa-review-tests --fix`.
- **`npm run ecl:lint` is the acceptance check for your own edits** — run it before returning and
  report the before/after High count. A run that raises the High count has broken something.

## 8. Known limitation this criteria file cannot fix

`ecl:lint` proves a citation **exists**. It cannot prove the citation is **right**: nine loyalty
cases cited `ECL-13.2` ("Subscription & Recurring Billing") meaning `ECL-13.3` ("Loyalty &
Points"), and every gate passed. That semantic call belongs to `/qa-review-tests` **Dimension 6**
— the same split as GRD-001 (a provenance tag is present) vs Dimension 11 (the tag is true).
When an audit notices a semantically wrong citation, **report it for Dimension 6**; do not fix
it here, and do not treat a green `ecl:lint` as evidence the citations are correct.

## 9. Value — which sections are worth the audit budget, and what a new one must declare

Same purpose and the same code as `bl-audit-criteria.md` §6 (`scripts/knowledge/oracle-significance.ts`,
via `npm run oracles:rank -- --axis=ecl`), with the signals a pattern row actually carries.

**Business value — what a violation costs — comes ONLY from the `BL Invariant` column.** A pattern
that maps to a `P0-revenue` invariant costs what that invariant costs: a real cross-reference into
the normative oracle rather than a second opinion about the same behavior. A section that links none
is `unknown`, and `unknown` never promotes.

That is a deliberate, load-bearing consequence: **adding a NEW section means naming the invariant the
pattern endangers.** The library already practises this in prose — several rows read
`— (gap; see bl_proposals)` — and Appendix D's whole ECL↔BL cross-reference exists to keep it
coherent. Measured today, **9 of 54 sections link an invariant**; the other 45 are `undeclared`,
which is a finding about the library, not a verdict on those sections (see below).

**Product value — how much of the tested product is exposed — is demand plus two one-level bumps:**
`[OBSERVED]` share ≥75% lifts it (a predominantly-confirmed section is release-walk material for
`/qa-checklist`), `[THEORETICAL]`-only drops it (charter material for `/qa-exploratory`), and a
`High` / `Low-High` max `Frequency` lifts it.

**`Frequency` scores the PRODUCT axis, never the business one.** It answers "how often does this
bite" — exposure, not cost. An earlier draft of this model used it as a business proxy and produced
exactly the inference this file refuses everywhere else: a frequent-but-cheap pattern reading as
business-critical. **`Impact` is unscored entirely** — it is free prose ("Double charge, order
duplication"), and scoring it would mean a regex judging severity. A `Frequency` cell outside the
closed vocabulary (`Low/Medium/High`) resolves to `null` **with a reason**, contributes zero, and is
reported as unresolved; it is never guessed from its first token. A section whose table cannot be
read at all is capped at the bottom tier — unassessable, not significant.

The promotion rule is §6b's, unchanged: business `high` promotes at any demand, `medium` needs
product `medium`+, `low` and `unknown` do not promote — and it applies to **new sections only**. A
DRIFT correction to an existing section applies whatever its value.

**Read the ECL numbers as an ORDER and a to-do, not as a prune list.** The library is small (54
sections) and densely cited: only two sections are uncited, and the one section that lands at the
very bottom of the queue is `ECL-14.8` (module version/schema drift) — which §6b above had already
reasoned to the same place by hand, as legitimately never suite-coverable. The 45 `undeclared`
sections are not low-value; they are sections whose business exposure nobody has written down yet,
and the fix is to link the invariant (or file the `bl_proposals` gap), not to delete anything. §0's
deletion bar is untouched.
