# Exploratory Session: Organization returns, round 2 (VCST-5884, ticket mode)
**Date:** 2026-10-09 · **Duration:** ~25 min of a 45-min hard box (20:07–20:32Z) · **Run:** QTF-VCST-5884-20261009 lane X · **Env:** vcptcore_dev, B2B-store, playwright-firefox (clicks worked)
**Platform:** 3.1079.0-alpha.13411 · Return 3.1005.0-pr-28-fb4f · **Theme:** footer read "Ver. 2.60.0-pr-2523-466f-466fa0a8. © 2026"
**Session type:** [EXP+VAL] · **Discovery technique:** user-flow edge enumeration on the model's unresolved links and reverse edges; hypotheses from source (ReturnAccessService, ReturnController, ReturnService @fb4fc43d)
**Charter:** the 5 sources handed over by the Test Model R2 (legacy spelling, stamp writers, store-less; irreversible backfill; 6 UNVERIFIED nodes; AC-2b/AC-4/AC-3d-3h; at-risk rows) + the VCST-5993 rider. Not covered by 014b/014c/050o/073/073a; there is no VC-RET section in vc-bug-catalog
**Edge-Case Refs:** none resolve (no returns or visibility section in the ECL) | **BL Refs:** BL-B2B-013, BL-GQL-001, BL-NOTIF-001
**Data:** only our own AGENT-TEST entities, 1 order, 13 returns, 2 contacts, 2 users, 1 membership row (`SP/ledger-X.jsonl`); seeded cast read-only. Evidence: `reports/tickets/Sprint26-20/VCST-5884/vcptcore_dev/screenshots/X-r2-*.png`; HAR from the lane config (`test-results/firefox/har/`)

## Net-New Scenarios Discovered
| # | Scenario | Why uncovered | What we found | Oracle ref | Fate (PROPOSED) | Suggested next charter |
|---|---|---|---|---|---|---|
| 1 | The owner opens their own Requested return whose stored customerId differs only in letter case (written by an admin or integration PUT) | node UNVERIFIED; no case writes customerId through REST | Page shows "Requested by <own name>" and no Cancel return. The server, asked with the same token, still offers `cancel` isAvailable=true (RET261009-00017) | NONE | PROMOTE → 014c, after triage | other client-side id compares (orders, quotes) |
| 2 | Admin-created New return cancelled in the Admin SPA | R2 unresolved item "admin status change after the stamp" | Date set when the return was created and kept after the Save. Holder lists and reads it as Cancelled; the buyer and the organization each get a "cancelled" copy (RET261009-00020) | NONE (PROPOSED-BL-RET "visibility, once granted, is not revoked") | PROMOTE → 073 or 050o | admin Completed/Processing paths |
| 3 | Re-opening a draft that was cancelled before submit | reverse edge, never exercised | No path re-opens it. available-statuses is [Cancelled], PUT to New or Requested returns 400, submit and update return WRONG_STATUS. It stays private and sends no mail (RET261009-00010) | NONE | PROMOTE → 050o | expiry or job-driven status moves |
| 4 | How a contact is linked to the organization: associated only, a membership row without contact.organizations, or no row with a blocking contact status | 3 UNVERIFIED nodes | Forbidden ×3. Contact status Rejected or Invited is refused, while Locked and null are answered. Control: the same role with real membership was answered (25 rows) | BL-B2B-013 | PROMOTE → 050o (3 negatives + 1 control) | membership row Deleted vs contact Approved |
| 5 | Returns submitted and then cancelled before this build | AC-3h, a PO question | RET261006-00002/-00008: the organization mailbox holds their received and cancelled copies, but submittedDate is null and the holder gets return(id) null | NONE | DECLINE: by design (Jira 111790), PO note | none |

## Oracle Feedback
| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new pattern | client ownership check is case-sensitive while the server's is case-insensitive, so the owner is shown as a colleague and loses actions | #1 | `/qa-review-oracles ecl` |
| Candidate new invariant | "once a return is submitted (stamped), no later status change hides it from the organization" | #2, RET261009-00006/-00007 | kb KB-BFD13716; a rule needs a PO source |
| Contradicted (fixed) | KB-17232A1F said a draft cancelled before submit is listed | #3 | kb_dispute filed |

## Bugs Found (hand-back only: the caller triages, grades and files)
| # | Severity (proposed) | Title | Evidence | Net-new? |
|---|---|---|---|---|
| 1 | Low | Storefront return details treat the owner as a colleague when customerId differs only in letter case: "Requested by" is shown and Cancel return is hidden although the server allows cancel | X-r2-owner-loses-cancel-uppercase-customerid.png, X-r2-owner-sees-requested-by-uppercase-customerid.png; KB-C482EE8A | Yes |

## Risk Areas
- Organization visibility follows the migration date, not the return's history: the same submit → cancel path is visible after the deploy (#2) and hidden before it (#5).
- The access gate trusts `contact.organizations` alone; `PUT /api/members` with a changed organizations list returned 204 and changed nothing (Customer module), so a membership fix made that way silently fails.
- Contact status `Locked` is outside the membership status list (Invited, Approved, Rejected, Deleted), so it does not remove access to organization returns.

## Observations
- Legacy `Canceled`: the stand has 0 such rows (32 surveyed), so the backfill half cannot be reached here; per source the migration excludes `lower(status)='canceled'`. A return created as `Canceled` gets no date. An admin New → `Canceled` edit keeps the date and is listed as "Canceled". `statuses:[Cancelled]` and `[Canceled]` both match it, and the cancelled mail is sent. PUT accepts `Canceled` although available-statuses offers only `Cancelled` (a variant of the known pair, R8).
- A REST move of a buyer Draft into New or Requested is refused (400, available-statuses [Draft]), so that variant has no live path.
- Store-less return: not reachable here. There are 0 such returns, a return needs a line, and the store is filled from the order. vcst_qa holds 11 (KB-4E9C8D27).
- A buyer reads their own return from another store (Electronics) by id with a B2B-store token, but neither the buyer's list nor the holder's list shows it. KB-890E6A04 confirmed.
- AC-2b: the organization view is a second toggle button (aria-pressed, named after the selected organization) next to "My returns" on Purchasing → Returns. It is not a tablist, and Corporate has no returns entry (X-r2-ac2b-org-view-is-toggle-on-returns-page.png).
- AC-4 (proposed): Registered on an Acme order sends 2 emails, one to the buyer and one to the organization. An admin cancel also sends the organization a copy. Drafts send nothing.
- VCST-5993 rider: the cancel dialog textbox is named "Reason (optional)" and the per-line textarea is named "What is wrong with it?"; both pass.
- Admin grid on a fresh context: 7 columns (Return number, Order number, Customer, Organization, Return status, Create date, Item count).
- Dismissed after 60 s: the Reason box shows "NoLongerNeeded". On this stand every `returnReasons.localizedName` equals its code, which is configuration, not this change.
- Incidental, known from R1: the incompatible-backend alert intercepts clicks on the header account button; Admin login logs a 401 on WidgetColorMarkers.

## Questions
- PO (AC-3h): should returns that were submitted before the build, and whose copies the organization already holds, stay visible to holders?
- PO: should contact status `Locked` (as opposed to a membership lock) remove access to organization returns?

## Charter-from-Gap
- Deleted user with a still-valid token. Not run because the run forbids deletes. Recipe for Stage-3 teardown: `SP/x-teardown-deleted-probe.mjs`.
- Run the store-less legacy listing on vcst_qa, where 11 such rows exist.
