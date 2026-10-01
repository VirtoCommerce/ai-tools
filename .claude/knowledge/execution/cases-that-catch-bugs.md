# Cases that catch bugs, not cases that turn green

**Read this before you write, repair or review a functional test case or a checklist item.** A case
exists to **fail when the product is wrong**. A suite that always passes is not proof of quality; it is
proof that nothing in it can see the bugs customers find. Design record and figures:
`docs/bug-detection-requirements.md` (D2, D13, REQ-01, REQ-02, REQ-06, REQ-12); the internal figures live
in the tracking ticket, never in this public repository.

What this file governs, and what it does not: it applies to cases whose purpose is `FUNC` (REQ-02).
Happy-path and visual cases keep their own purpose and are not judged by the rules in §2–§4.

## 1. The measure is what a case catches, never its pass rate

- **A PASS is evidence only if the case could have FAILED.** Before a case counts, name the wrong
  implementation that would make one of its steps fail. If you cannot name one, the case is a presence
  check ("the list is not empty") and it catches nothing.
- **The arbiter is mechanical.** A suite is judged by the response mutants it kills
  (`npm run detect:mutate -- <suite>`: KILLED / SURVIVED / NOT_EXERCISED) and by the closed bugs it would
  have caught (`npm run gaps`), not by how green its last run was. A mutant of the case's own bug class
  that SURVIVES means the case is weaker than it reads.
- **A red run is information, not a defect of the suite.** A case that fails on the current build has
  done its job until someone shows the expectation is wrong (§2).

## 2. Never rewrite an expectation to match the build

When a live run or a review sees the build do something other than the case expects, what happens next is
decided by **where the expectation came from** — its provenance tag — never by the wish for a green run.

| The expectation came from | The build disagrees, so | Never |
|---|---|---|
| `{SPEC}` — ticket AC | **a bug candidate**: keep the assertion, hold the case red, route the mismatch down the defect path (`/qa-defect`, `/qa-triage-results`) | rewrite the assertion to the observed behaviour |
| `{DOC}` — a docs page | **a bug candidate**, or a docs finding if the docs are wrong for a released feature — either way a finding, recorded | rewrite the assertion |
| `{BL}` — a `DECLARED` rule (`bl/<domain>.yaml`) | **a bug candidate**; the rule goes `SUSPECT` until the Jira decision on that bug (BL 2.0 §7.0) | edit the rule or the case to agree |
| a Fixed bug's resolution (`Catches:` key) | **a regression**: the bug is back | soften the assertion |
| `{HYPOTHESIS}` — an agent's own guess, no human source behind it | may be corrected to what was observed and re-tagged `{OBSERVED}`, **with the correction recorded** in `References` (`Corrected: <date> hypothesis → observed`) — or dropped | silently overwrite |
| `{OBSERVED}` only | a **change in behaviour**: re-observe, then report it; an unexplained change is a regression signal | silently update |

Write the tag with its source in parentheses — `{SPEC} (VCST-1234)`, `{BL} (BL-SRCH-006)`: the GraphQL
runner's evaluator strips `{TAG}` plus a parenthesised or dashed tail from an operand, and a bare
`{SPEC} VCST-1234` stays inside the compared value.

**A Cancelled, Won't-fix or "By design" ticket is not a resolution source.** Nothing shipped, so it cannot
state the expected behaviour. A case may still target that bug class when another human source states the
expectation (a `DECLARED` rule, AC, docs); cite the ticket in `Catches:` for traceability and take the
provenance from that other source.

Code and the live stand agreeing is **not** a source for an expectation: any bug is present in both, so the
two always agree (BL 2.0 §7.3a, the oracle problem). Only AC, docs or a bug resolution can make an
observed behaviour the expected one.

## 3. Every functional case names the bug it would catch

`References` already carries `Archetype:<TOKEN> · Technique:<TOKEN>` (`skills/qa-test/authoring.md`
§Carry the model's design decision into the row; tokens: `knowledge/oracles/vc-bug-catalog.md`
§Defect archetypes). A `FUNC` case adds, where it applies:

- **`Catches:<ISSUE-KEY>`** — the closed bug this case would have caught. Its expectation is the fixed
  behaviour, so the case **must fail on the pre-fix behaviour**. This is also what makes the bug count as
  traced in `npm run gaps`.
- Several bugs with one breaking condition may share one case: repeat the stamp, `Catches:VCST-1 Catches:VCST-2`.
- When no archetype token fits the shape, use the nearest token and say why in the row, and raise the gap in
  the run report. The vocabulary is extended deliberately in `vc-bug-catalog.md`, never per case.
- **`Catches:mutant:<ID>`** — the response mutant (`scripts/detection/mutants.mjs`) the case is built to
  kill.

And in its Assertions, at least one check that **discriminates**: a value, a count, a set, an order or an
equality across layers — not the mere presence of an element. Equal values on both sides of a distinction
under test are a data defect (`.claude/rules/test-data.md` §SECOND RULE).

### 3a. Declare the purpose: `Purpose:HAPPY` · `Purpose:VISUAL` · `Purpose:FUNC` (REQ-02)

Every new case carries one `Purpose:` stamp in `References`:

| Purpose | The case answers | Presence-only assertions are |
|---|---|---|
| `HAPPY` | does the path complete | fine |
| `VISUAL` | does it look right: layout, tokens, screenshot, accessibility | fine — "is visible" is the oracle for "does the user see it" |
| `FUNC` | is the data or the logic right | **not enough** — at least one assertion must be a relation, an invariant, a derived value or a shape |

`npm run assert:strength` classifies every assertion line (`PRES` / `REL` / `INV` / `DER` / `SHAPE`; `--case <ID>`
shows the class and the rule for each line) and lists the `FUNC` cases with only `PRES`. A case with no stamp gets
a derived purpose there — `FUNC` when it cites a data/logic `BL-*` rule (`P0-*`, `P1-data`) or a `Catches:` bug,
`VISUAL` for visual suites — which is a stand-in for the stamp, not a replacement. The figure is report-only today
(it prints as an info line in `suites:lint`); the ratchet on new `FUNC` cases is the next step of REQ-02. If a
reconciliation is free on a `HAPPY` step (cards on page 1 == page size while `totalCount` is larger), add it.

## 4. Learn from bugs: every escape becomes a case or a stated reason

`npm run gaps` lists the closed bugs no suite cites, customer-reported (`support`) first, and the mind-map
behaviours no case stamps. Work it as a queue that only shrinks (REQ-06, REQ-12):

1. Read the bug and its resolution: what broke, under which condition, what the fix made true.
2. Write the case that **fails on the pre-fix behaviour**: preconditions recreate the breaking condition,
   the assertion is the fixed behaviour, `References` carries `Catches:<KEY>` and the archetype.
3. Or record why no case is possible (one-off data repair, infrastructure, not reproducible on a QA stand)
   in the gap list's reason — never silence.
4. Prove it can fail before it counts (§6).

## 5. The breaking dimensions — a mandatory axis for checklists and test design

These are the conditions under which customer-reported bugs actually broke (trial 1 of the design record).
For every functional area, a checklist or a test model asks of **each** row "does it break here?", and
covers it or waives it with a reason. Each maps to an archetype token:

| Dimension | Ask | Archetype |
|---|---|---|
| non-default culture / currency | does it hold in a non-`en` culture and a non-default currency, at the rounding midpoint? | `MONEY` |
| timezone and date boundaries | across midnight, month end, DST, a store in another timezone? | `BOUNDARY` |
| sort × search × filter | does combining them change *which* items come back, not only their order? | `PARITY` |
| more than one page | is every item returned exactly once and does the count match? | `BOUNDARY` |
| concurrency | two sessions, double submit, two tabs on one cart? | `RACE` |
| a second login path | SSO, impersonation, organization switch, sign-in from checkout? | `SCOPE` |
| a swallowed upstream error | a `200` with `errors[]`, a partial failure that reports success? | `SILENT` |
| a dependency or bundle upgrade | does the contract still hold after the module version moves? | `CONFIG` |

Plus the scope dimensions every case already varies: role / organization, store, entity state.

## 6. Prove a case can fail before it counts

A new `FUNC` case is not done when it passes; it is done when it has been seen to **fail for the right
reason** at least once:

- against its mutant — `npm run detect:mutate -- <suite> --cases <ID> --mutants <MUTANT>` must report it
  KILLED; for a check on one layer, scope the mutant with `DETECTION_OP`;
- or against the pre-fix behaviour of its `Catches:` bug (an older build, a fixture that recreates the
  breaking data);
- or, for an invariant check, against the in-process mock the driver test uses
  (`scripts/unit/invariants-driver.test.ts`).

A case that cannot be made to fail is either re-designed or re-labelled with an honest purpose; it is not
promoted as `FUNC`.

- **Fails only under its breaking condition.** Many real bugs need a state to appear (an index holding stale
  documents, a race actually provoked, a scale the stand has). The case states that condition in its
  Preconditions and, when the run could not create it, ends `BLOCKED:<CONDITION_NOT_MET>` — never `PASS`,
  because a pass without the condition proves nothing.
- **No route to a stand, no proof yet.** A case authored where nothing can run stays `Draft`, with the
  missing proof stated in the row. It is promoted only after §6 is met on a stand; `Draft` without proof is a
  normal waiting state, not a pass.
