# BL Sync Criteria — what may change a BL record, and how

Reference for `/qa-review-oracles bl` (alias `/qa-review-bl`). The skill's SKILL.md holds the flow;
this file holds the rules the BL axis runs on. Design: `docs/bug-detection-requirements.md` §7.0,
§7.3, §7.3a (BL 2.0). It replaced the BL three-axis triangulation and its M0 freeze on 2026-10-01;
the ECL axis still triangulates (`ecl-audit-criteria.md`).

## 0. The ground rules

- **A record lives in `.claude/knowledge/oracles/bl/<slug>.yaml`** (schema `templates/bl.schema.json`).
  Edit that file, then `npm run bl:render`. **Never edit `business-logic.md`**: it is generated, and
  `npm run bl:convert:check` (CI) fails a hand edit.
- **Only a human source changes what a rule says, adds a rule, or makes a rule `DECLARED`**:
  the ticket's acceptance criteria, a documentation page (VirtoOZ via `/vc-docs`), or a Jira bug
  resolution (Fixed / By design / Won't fix). A Cancelled or duplicate ticket shipped nothing and is
  not a resolution source.
- **Code and the live stand agreeing is one observation, not a source.** A regression is in the code
  AND on the stand, so the two always "agree" with it. They never rewrite a rule, never add one, and
  never raise `trust` (the oracle problem, §7.3a).
- **A run that contradicts a rule does not touch the rule's text.** The mismatch follows the bug path
  (`/qa-bug`); the rule becomes `SUSPECT` until the Jira decision on that bug.
- **Behaviour no rule covers, with no human source,** is an observation: `kb_ask`, then `kb_capture` /
  `kb_confirm` / `kb_dispute` (CLAUDE.md §Essential Rules → *Product context*). Never a new record.
- **No proposals file, no review queue.** What was not applied is listed in the audit report only.

## 1. The operations

Each in-scope record gets exactly one operation per run. This table replaces the CONFIRMED / DRIFT /
MISSING verdicts for `bl`.

| Trigger | Operation | What changes in the record |
|---|---|---|
| A human source states the rule as written | **SYNC** | add the source to `source`; `trust: DECLARED` |
| A human source states the rule differently | **SYNC-UPDATE** | `rule` (and `check` / `violation_signal` where they follow from it) rewritten to the source; source added; `trust: DECLARED`. If the build disagrees with the source, that is a bug candidate, never a reason to keep the old text |
| A human source states a rule no record holds | **NEW** | a record at the next free id in the domain, `trust: DECLARED`, `status: ACTIVE`, severity assigned — and only if it clears the value gate (§5) |
| A citing case failed, or a run observed behaviour ≠ the rule | **MARK-SUSPECT** | `status: SUSPECT`, `suspect_reason`: `[bug] <KEY> …` once the bug is filed (until then `[case] <case ids> failed in <run id>`, §1b). Text untouched |
| `suspect_reason` names a bug that now has a Jira decision | **RESOLVE** | Fixed → `status: ACTIVE`, `suspect_reason` removed, the resolution added to `source`. By design / Won't fix → `rule` rewritten from the resolution, then the same. Still open → stays `SUSPECT` |
| The record has a `check` | **RE-RUN** | pass on the current build → `verified: {date, version, by}` (by = run id). Fail → MARK-SUSPECT and a bug. Could not run → nothing changes; say so |
| A human source says the behaviour was removed | **RETIRE (proposed)** | nothing applied: list it in the report. `status: RETIRED` is set only on the user's confirmation, because citing cases then fail `bl:lint` |
| None of the above | **UNCHANGED** | nothing |

An `INFERRED` record stays `INFERRED` until a human source arrives. A violation of an `INFERRED` rule is
a note in the run report, never a bug report (§7.3).

### 1a. `RE-RUN` — the check must be re-derivable

- `check.kind: executable` → run the check its `ref` names (`npm run inv:run -- <check> …`); exit 0 pass,
  2 violated, 3 could not run.
- `check.kind: manual` → a browser agent follows `check.ref` on its own slot (REAL-USER rule).
- A pass is admissible only when it carries what lets someone re-derive it: the build version, the run
  id, the entity or order ids it used. A relayed result whose state no longer exists (a re-seeded
  fixture) is not a pass. Check the instrument against a known-good control before doubting the data.
- **Ask the observed-behaviour base first, never instead.** `mcp__kb__kb_ask` with the coordinate in the
  question; confirm a matching entry only after you saw it yourself, dispute a contradicting one.

### 1b. What runs without anyone — `npm run bl:fresh` (M5)

`scripts/knowledge/bl-fresh.ts` applies part of §1 by itself. **Every `/qa-regression` run calls it at Step 6.6**
(delegated `/qa-test` runs included) with the run's results; you can run it by hand (dry run by default,
`--write` to apply). The `full-cycle` pipeline also calls it, but that pipeline needs an Anthropic key the repo
does not have, so today the local runs are what keep the oracle fresh. Its settings — age
threshold, closed-bug JQL, which Jira resolutions decide what — are in `bl/_oracle.yaml` `freshness`.

A reason it writes starts with a tag, and the tag decides what may clear it:

| Tag | Set when | Cleared by |
|---|---|---|
| `[code]` | a change touches the rule's `scope.code_ref` (`<repo>:<path>[#symbol]`; a path ending in `/` is a directory). A change known only by its module (`module <name>`) touches every rule whose `code_ref` is in that repo | a pass: every citing case in a run passed, or `check.run` passed |
| `[closed]` | a bug closed since the last pass (`freshness.closed_checked_through`) names the rule's id | a pass, as above |
| `[age]` | `verified.date` is older than the threshold, for the `age_trust` levels | a pass, as above |
| `[case]` / `[check]` | a citing case failed / the executable check found a violation | nothing automatic: file the bug, then write `[bug] <KEY>` |
| `[bug]` | the bug path (`/qa-test-lifecycle` 4c), not the script | `--resolve`: a `holds` resolution → `ACTIVE` with the resolution in `source`. A `rewrite` resolution is listed for you to rewrite the rule (RESOLVE), anything else changes nothing |

A reason with no tag was written by a person, and only a person or this skill clears it. A pass is stamped
into `verified` (`by` = the run id). An executable check re-runs unattended only when its record carries
`check.run` (the `inv:run` arguments); a check that needs an argument only a person can choose has none.

## 2. Where to find the human source, per domain

Start from what the record already cites: the tickets in its `source` and `suspect_reason`. Then:

| Domain prefix | Docs (VirtoOZ tool) | Module for `scope.code_ref` |
|---|---|---|
| BL-PRICE, BL-CART, BL-CHK, BL-LOY | StorefrontUserGuide / StorefrontDeveloperGuide | vc-module-x-cart, vc-module-pricing, vc-module-marketing, vc-frontend |
| BL-ORD, BL-SHIP, BL-BOPIS | StorefrontUserGuide, PlatformUserGuide | vc-module-orders, vc-module-shipping |
| BL-AUTH, BL-B2B, BL-PROFILE | PlatformUserGuide, StorefrontUserGuide, B2BExperts | vc-module-customer, vc-platform, vc-frontend |
| BL-CAT, BL-SRCH | StorefrontUserGuide, PlatformDeveloperGuide | vc-module-catalog, vc-module-search |
| BL-PAY | StorefrontDeveloperGuide | vc-module-payment-*, vc-frontend |
| BL-WL | PlatformUserGuide | vc-module-white-labeling, vc-frontend |
| BL-GQL | StorefrontDeveloperGuide | vc-module-x-* (xAPI) |
| other | PlatformUserGuide / mixed | the matching vc-module-*, vc-frontend |

Jira: the tickets of the feature (AC) and the closed bugs in the domain (resolutions). Code is read only
to fill `scope.code_ref` — the anchor whose change makes a rule `SUSPECT` (§7.3) — never as a source.

## 3. Writing a record

1. **One record per edit**, one domain file at a time, from one writer (§7.3 item 6). Re-read the file
   immediately before writing; for NEW, take the max id in the domain at that moment and add 1
   (zero-padded to 3 digits). **Never change or reuse an id** — suites cite them.
2. A `source` entry is `{kind: doc | ac | resolution, ref: "<KEY or doc reference> — <what it states>"}`.
   Code and live may stay as `kind: code` / `live` context; they never count toward `DECLARED`.
3. **Env-agnostic.** No environment names, URLs, store slugs or customer names anywhere in the record —
   the repository and the kb are public.
4. **No `Amended:` stamps or history fields.** Git is the history; the audit report is the receipt.
5. Then run, in order: `npm run bl:render` · `npm run bl:convert:check` (schema, index, ids, render) ·
   `npm run bl:lint`. A run that leaves any of them red has broken something.

## 4. What is never applied by this skill

- a rule rewritten from code or live alone;
- a new record without a human source (→ `kb`);
- `RETIRED` without the user's confirmation;
- a `SUSPECT` cleared without a Jira decision or a passing re-run on a build that contains the fix.

## 5. Value — which new rules are worth adding, and in what order

Accuracy decides whether a rule is TRUE; value decides whether a true one is worth carrying. Scoring is
deterministic and lives in `scripts/knowledge/oracle-significance.ts`, driven by
`npm run oracles:rank -- --axis=bl`; every result prints the signals behind it.

**Business value — what a violation COSTS**, read from the severity only: `P0-security` / `P0-revenue` →
`high` · `P1-data` / `P1-ux` → `medium` · `P2-ux` → `low` · absent → `unknown`.
**Product value — how much of the tested product leans on it**: citing-case demand — `none` (0) / `low`
(1–2) / `medium` (3–9) / `high` (10+) — lifted one level for a `BL-CROSS` rule.

| Business | NEW is added | Why |
|---|---|---|
| `high` | at any product value | an uncited P0 is untested, not unimportant |
| `medium` | only at product `medium`+ | a P1 nothing leans on is a note, not an invariant |
| `low` | never | demand cannot buy a cosmetic rule into a file that judges PASS/FAIL |
| `unknown` | never | assign the severity first, then re-score: `npm run oracles:rank -- --explain=<ID> --severity=<tag>` |

- **The gate governs growth, never correction.** SYNC, SYNC-UPDATE, MARK-SUSPECT and RESOLVE apply
  whatever the value.
- **The Value label is derived at decision time** and carried in the audit report, never stored in a
  record: product value moves with every suite edit (`.claude/rules/test-data.md` §GOLDEN RULE).
- **Some prefixes are not invariants** and are excluded at any demand; their citations move rather than
  vanish (`/qa-review-tests --fix`):

  | Prefix | Why not | Where the traceability goes |
  |---|---|---|
  | `BL-PERF` | performance budgets are environment-specific | `.claude/knowledge/execution/performance-thresholds.md` |
  | `BL-COMPAT` | browser-engine quirks are tooling facts | `.claude/knowledge/automation/browser-quirks.md` |
  | `BL-API` | a coverage tag, not a rule | the owning domain's own `BL-*` rule |

- **A `low` value is not a delete list.** It is a reason not to add more of the same, never evidence a
  rule is dead.
