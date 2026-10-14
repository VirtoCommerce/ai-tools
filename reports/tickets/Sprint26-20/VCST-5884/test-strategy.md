# Test strategy — VCST-5884 — 2026-10-09 (round 3)

Status: DRAFT · Flow: test (Story) · Round 3 of 3 — the last allowed · Depth label: deep · Dry run, nothing executed
Build to test: Return #28 @ 9bcdf23 · theme #2523 @ b9a7294 · Stand: vcst — **NOT deployed** (manifest: 3.1005.0-pr-28-62f9, 2.60.0-pr-2523-9e4e)

**Mission.** Confirm the round-2 FAIL is fixed (VCST-6226 + the Admin header) without the new `SubmittedDate`
mechanism hiding returns the organization should see, and that the five storefront fixes broke nothing.
Last round: a FAIL here escalates to the developer, PO and QA lead — there is no round 4.

## 1. Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst; round-2 AGENT-TEST org fixtures still seeded; seeder + 46 C1 cases live on unmerged branch `qa/vcst-5884` | P1, P2, P3 |
| Product elements | #28: `SubmittedDate` column + backfill migration, `RecordSubmit` on save, search/access by date, REST `excludeDrafts`→`submittedOnly`, Admin list template · #2523: Draft filter, page<1, refetchQueries, contrast, word-break | — |
| Quality criteria | AC-1..3 + unratified AC-4 · VCST-6226 Expected · #28 module guide · BL-UI-004, BL-A11Y-003, BL-B2B-007 · kb KB-17232A1F, KB-09C378C0, KB-657521DF | R3 oracle ambiguous |

## 2. Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | A colleague's abandoned draft (comment, line reason) is still readable by holders | VCST-6226 · #28 d9233ee | 3×4 | High |
| R2 | A return submitted and then cancelled vanishes from the organization's list | `ReturnService.RecordSubmit`, entity `??=` | 3×4 | High |
| R3 | After the upgrade, returns cancelled earlier disappear — incl. ones the org already saw | migration backfill SQL; guide "cancelled before 3.1005.0 stays out" | 4×3 | High |
| R4 | An admin-created return is missing from (or wrongly in) the org list | `IsSubmittedStatus` (New/Requested vs Cancelled) · KB-1F2EBF83 | 3×3 | Medium |
| R5 | REST clients still sending `excludeDrafts` silently get drafts | `ReturnSearchCriteria` rename · cases RET-ORG-010, -041 | 4×2 | Medium |
| R6 | Draft filter: gone from org tab but also lost on the own tab / old links empty the list | #2523 b9a7294 | 2×3 | Medium |
| R7 | Previously passed access, read-only and org e-mail copy regress | diff touches list/read/search paths | 2×4 | Medium |
| R8 | Hand-edited `?page=` breaks the list | #2523 59a78b5 | 2×2 | Low |
| R9 | Admin headers still clipped; table still breaks words; label still low-contrast; console warning | 9bcdf23 · 67896dc · 8dfc514 · 49ec6d5 | 2×2 | Low |

Project risks: **P1** fixes not deployed on vcst, ticket In progress → entry blocked until `/qa-deploy-pr` for both PRs (P1 also: 2 of 10 PR builds failed — check the fix builds are green first) ·
**P2** the migration re-labels round-2 data: returns cancelled after submit become invisible → re-seed after deploy, never assert on round-2 rows ·
**P3** seeder, aliases and C1 cases exist only on `qa/vcst-5884` → run from that branch (or merge it first) · **P4** `Return.NotifyOrganizationEmail` is shared → BS lane last, restore to `false`, read back.

## 3. Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Regression-averse ✔ (F5: the diff touches covered list/read/search) ·
Model-based ✔ (amend: a new state attribute splits Cancelled in two) · Reactive ✔ (F1: 4 layers; R3 rests on a `{HYPOTHESIS}`) · Process-compliant ✔ (contrast fix, WCAG 1.4.3)

## 4. Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Depth |
|---|---|---|---|---|---|
| R1 | ST: Draft→Cancelled; list, `return(id)`, deep link, keyword | VCST-6226 Expected {SPEC} | xAPI + storefront | edge · qa-backend; chrome · qa-frontend | deep |
| R2 | ST: Draft→Requested→Cancelled, →Approved→…; date kept once | #28 guide {DOC} | xAPI + REST | edge · qa-backend | deep |
| R3 | EXPLORE first + before/after data check across the deploy | guide applied to pr-build data {HYPOTHESIS} → PO | DB via REST search | firefox · qa-testing-expert | deep |
| R4 | DT: admin PUT New / Requested / Cancelled × holder view | code comment {DOC} · KB-1F2EBF83 {OBSERVED} | REST + xAPI | edge · qa-backend | standard |
| R5 | CONTRACT: old vs new criterion name, drafts in/out | guide {DOC} | REST | edge · qa-backend | standard |
| R6 | EP: own/org tab × link with/without `status=Draft` | #2523 tests {DOC} | storefront | chrome · qa-frontend | standard |
| R7 | REGRESSION: round-2 C1 set minus defective cases | round-2 PASS rows {OBSERVED} | all | regression-orchestrator | standard |
| R8 | BVA: page −1, 0, 1, "first", past the end | #2523 tests {DOC} | storefront | chrome · qa-frontend | light |
| R9 | VISUAL: Admin list, 768–960 px table, label contrast, console | BL-UI-004 {BL} · BL-A11Y-003 {BL} | storefront + Admin | DevTools · ui-ux-expert | light |

## 5. Artifacts
| Artifact | Decision |
|---|---|
| Test model | RUN — **amend** `VCST-5884-2026-10-08` (SubmittedDate lifecycle, migration), never fork |
| Mind map | RUN — update `returns`: split `ret.state.cancelled`; resolve DRIFT `ret.buyer.read.org-colleague` |
| Checklist | RUN — new round section; every item names its R-n |
| Exploratory | RUN 30 min, **first** (D3: High R3 on a `{HYPOTHESIS}`) — charter R3, R4 edges |
| Visual lane | RUN (F3) — R9 only, not a full re-audit |
| Contract refresh | RUN — REST criteria renamed |
| Regression (C1) | RUN — 46 round-2 cases **minus 8** (6 known-defective + RET-ORG-010/-041 on the old field) → 38 |
| Case authoring / repair | SKIP — D2: the 8 cases + candidates go to `/qa-test-lifecycle` |

## 6. Data
Re-seed `seed:returns:org` after the deploy (P2). Created **in the case** (FIFTH RULE — other lanes cancel and submit):
per holder org, one each of live draft · draft cancelled before submit · submitted then cancelled · admin New · admin Cancelled.
**Discriminating:** the two Cancelled returns must coexist in one org — R1 and R2 are only decidable side by side.
**Timing:** for R3, create one submitted-then-cancelled return on the OLD build, before the redeploy, and record its id.

## 7. Out of scope
- Attachments of a colleague's return — no FileUpload scope on vcst — residual Low
- CC/BCC overlap, retry duplication of the org copy — unchanged since round 2 — residual Low · vs. DESIGN — no design project · PO questions from round 2 — unchanged

## 8. Criteria
Entry: both PRs deployed and visible in `/api/platform/modules` + theme · ticket back in a testable status · fix builds green · fixtures re-seeded
Suspend (BLOCKED): any entry item fails; the migration did not run · Exit: R1–R9 each resulted or deviated with a reason; exploratory box spent; kb: dispute KB-17232A1F, KB-09C378C0 if R1/R5 confirm the fix

## 9. Amendments
## 10. Reconciliation (filled at close-out)
| R | Planned | Ran | Result | Deviation — reason |
|---|---|---|---|---|
