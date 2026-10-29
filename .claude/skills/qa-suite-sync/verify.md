# qa-suite-sync — Phase 5, verify on the stand

Supporting file for [`qa-suite-sync`](SKILL.md). Read it at Phase 5.

### Phase 5 — VERIFY (Live Environment Check)

**Runs when:** any new or changed case is in scope — every one of them gets a live check. Dispatch `qa-testing-expert` with `playwright-firefox` (fallback: `playwright-edge`).

**Pre-flight:** re-run `/preflight lifecycle --domain <scope>` — a `health` row that is not OK (a WARN for lifecycle) ⇒ skip with warning.

**Verification checks:**
1. **Page reachability** — navigate to each unique URL (max 20 pages)
2. **UI element existence** — P0/Critical case elements: buttons, forms, labels
3. **Flow walkability** — first 3-4 steps of top 5 P0 cases
4. **Precondition validity** — test user login, feature visibility
5. **Console baseline** — JS errors and failed network requests per page
6. **Asserted-behavior grounding (Dimension 10, live half)** — for every `{HYPOTHESIS}` and
   unconfirmed-`{SPEC}` assertion in scope (typically the cases Phase 3 just generated), confirm the
   behavior it claims **actually happens** on the deployed build. This is the only step that can ground a
   new-feature assertion; without it those cases stay `Draft` and are excluded from regression.
7. **Staleness spot-checks** (change-driven only) — verify STALE/BROKEN reclassifications from Phase 2 against live env

**Result classification:**

| Finding | Severity | Action |
|---|---|---|
| VERIFIED | — | Test case is environment-compatible |
| CHANGED | Critical | Element renamed/moved → auto-fix label |
| BROKEN | Blocker | Page error or flow blocked → investigate |
| BLOCKED | High | Precondition can't be met → may be env issue |
| **Behavior CONFIRMED** | — | Upgrade that assertion's provenance tag to `{OBSERVED}` (clears GRD-001) |
| **Behavior REFUTED** | Critical | **ENV-008**. A `{SPEC}`/`{DOC}`/`{BL}`/`Catches:` assertion is a **bug candidate**: keep it red and add it to `bugCandidates[]` (below). Only a `{HYPOTHESIS}` may be rewritten to the observed behaviour (recorded) or dropped. **Never** upgrade the tag. |

Screenshots captured for every CHANGED/BROKEN/BLOCKED finding.

**Filing a bug.** Neither subagent files anything. You (the orchestrator) collect `bugCandidates[]` from
Phase 5 and 4c, list them in the report, and file one only through `/vc-fix:qa-bug` after the user confirms
that candidate — with the found-by labels of `.claude/rules/reports.md` §0b. The bug key it returns is what 4c writes into `suspect_reason`.

---
