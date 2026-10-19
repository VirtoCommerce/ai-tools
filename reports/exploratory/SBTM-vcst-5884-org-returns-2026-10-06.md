# Exploratory Session: Organization returns (VCST-5884, ticket mode)
**Date:** 2026-10-06 · **Duration:** ~45 min (box 45, cross-layer) · **Run:** QTF-20261006-VCST-5884 lane X · **Env:** vcptcore_dev, B2B-store, playwright-edge
**Platform:** 3.1077.0-alpha.13406 · Return 3.1005.0-pr-28-62f9 · **Theme:** footer read live "Ver. 2.59.0-pr-2523-3f1b-3f1b9c6a. © 2026 Virto Commerce. All rights reserved"
**Session type:** [EXP+VAL] · **Discovery technique:** user-flow edge enumeration on the model's reverse edges + lifecycle edges, surprise-seeking on each "huh"
**Charter:** the model's unresolved cells (GAP-a storefront half, reverse edges, {HYPOTHESIS} S#13, AC-1c/2b PO notes, at-risk rows), not covered by 014b/014c/050o/073/073a and absent from vc-bug-catalog (no VC-RET section)
**Edge-Case Refs:** none resolve (ECL has no returns / draft-visibility section) | **BL Refs:** BL-B2B-013, BL-B2B-007, BL-NOTIF-001, BL-GQL-004
**Data:** own AGENT-TEST entities only (ledger `SP/ledger-X.jsonl`); seeded cast read-only. Evidence: `reports/tickets/Sprint26-20/VCST-5884/vcptcore_dev/screenshots/X*.png`, `SP/laneX/state.json`

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate (PROPOSED) | Suggested next charter |
|---|---|---|---|---|---|---|
| 1 | Buyer creates, edits, then cancels a DRAFT without submitting; a holder opens the org tab | model L4 says org visibility starts at submit; no case crosses draft→cancel with a holder | RET261006-00028 listed as Cancelled with Buyer name; details show "Requested by", the draft comment and the line reason; the org got 0 emails for it | NONE (PROPOSED-BL-RET "a draft is private to its owner") | PROMOTE → 050o (holder: cancelled-from-draft absent / null) + 014c, after PO ruling | other never-submitted paths to a non-Draft status |
| 2 | Org renamed after returns exist; admin then creates a return on an old order | reverse edge "stamp never recomputed" had no observation | storefront tab = live name; xAPI, REST and the Admin Organization column keep the old name, also for a return created AFTER the rename (stamp = order snapshot) | NONE | PROMOTE → 073 (column = order snapshot) or DECLINE by-design, PO | org name in mail templates after rename |
| 3 | Buyer leaves the org after submitting | PO question in the model, unobserved | returns stay in the former org's list; the departed buyer still cancels, and the former org mailbox gets the "cancelled" copy | NONE | PO first; then PROMOTE → 073a or DECLINE | departed buyer + admin decision copies |
| 4 | Holder's membership locked / set Invited mid-session (live token) | GAP-a storefront half; no locked holder fixture | next org-tab query → organizationReturns Forbidden → /403 "Access denied"; colleague deep link (full load) → return(id) null + organization Forbidden → /403; My returns keeps working; unlock recovers the same session without sign-in | BL-B2B-013 | PROMOTE → 014c (closes GAP-a) | lock while on the details page with an upload in flight |
| 5 | Role attached to the ORGANIZATION (Organization.roles), member has no role | variant absent from the model's actor list | member's token carries :view (scoped and unscoped); organizationReturns(org) granted (0 rows, no error) | NONE | PROMOTE → 050o | org-level role removed live |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new invariant | "a return its buyer never submitted is never visible to the organization" — contradicted live (#1) | X1 screenshots; R2 journal 0 mails | kb_capture; a rule needs a PO source |
| Candidate new pattern | visibility filtered on the CURRENT status leaks an item that was never shared once it reaches a terminal state | #1 | `/qa-review-oracles ecl` |
| Candidate new pattern | identity snapshot on a shared document never recomputed: a departed member keeps notifying the former org | #3 | `/qa-review-oracles ecl` |

## Bugs Found (hand-back only — caller triages, grades, files)
| # | Severity (proposed) | Title | Evidence | Net-new? |
|---|---|---|---|---|
| 1 | Medium–High (privacy, PO) | A cancelled never-submitted draft becomes readable by every organization holder (list + full details) | X1-orgX-tab-lists-cancelled-draft.png, X1-colleague-reads-cancelled-draft-details.png | Yes |
| 2 | Low (PO) | Departed buyer's later status changes still copy the former organization's mailbox | journal RET261006-00027 (4 emails) | Yes |

## Risk Areas
- Org visibility keys on `Status != Draft` at read time, not on "was ever submitted"; any other path out of Draft inherits the leak.
- Org name shown to back office and API is the ORDER's snapshot; a rename or a move never reaches existing or new returns of old orders.
- The org tab is token-driven (shown while the server already refuses); the refusal lands as a generic /403 page.

## Observations
- AC-1c: a non-holder on `/account/returns?scope=organization` sees the own list with the own placeholder, no tab switch, URL left as `?scope=organization`, no message; only GetReturns is sent, GetOrganizationReturns never (client-side fallback).
- AC-2b: Corporate (Company info, Company members, Sales reps) has no returns entry; the org view is only the tab on Purchasing → Returns.
- Plural: holder in Acme and Org X sees one org tab, the selected one; switching replaces it; nothing aggregates.
- Read-only: list rows are plain buttons (no selection, bulk or menu); colleague details render no action; availableActions all RETURN_NOT_FOUND.
- Mail: copy goes to the FIRST org email only; draft create/edit/cancel is silent; admin-created New raises nothing, its approval copies the org; push stays with the buyer.
- `returnStatuses` answers anonymously (10 keys incl. legacy Canceled); anonymous `returns` → Unauthorized.
- Incidental, out of charter: storefront "incompatible backend" danger alert ("VirtoCommerce.Loyalty 3.1008.0 ≥ 3.1007.0-pr-17-df7a", reads as satisfied) overlays the header account button and intercepts clicks until dismissed; Admin login page calls `GET /api/platform/settings/VirtoCommerce.Platform.UI.WidgetColorMarkers` before auth → 401 + "Possibly unhandled rejection".

## Questions
- PO: should a draft the buyer cancelled without submitting stay private? Should a departed buyer's returns stay in, and keep mailing, the former org?
- PO: should back office show the org name at order time (current) or the live name? A buyer in two orgs cannot see which org a return belongs to (S#13).

## Charter-from-Gap
- Explore every route out of Draft (cancel, expiry, admin edit) to find which make a never-submitted return org-visible.
- Explore org copies when the org's FIRST email changes between submit and decision.
