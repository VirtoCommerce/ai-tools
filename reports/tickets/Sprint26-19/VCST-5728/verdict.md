# VCST-5728 — PASS WITH NOTES
The four ACs pass on vcst-qa with vc-frontend#2476 head deployed (theme 2.59.0-pr-2476-0604). Backend is XCart pr-141 · SalesRep pr-21 · Cart pr-194. On reopen, Share shows the last message and its recipients. A message-only edit saves without notifying, and adding customers notifies only the new ones.
Page: https://claude.ai/artifact/EGLiNEmRHLMhppEoZiwMzt

| AC | Result | Evidence |
|---|---|---|
| AC-1 Message field visible when editing a share | PASS | screenshots/pm-B1-02-reopen1-M1-prefilled.png |
| AC-2 Previous message shown, latest only | PASS (M1 → M2, no history) | pm-B1-04-reopen2-M2-recipients-AB.png · pm-A1-graphql.json |
| AC-3 Edit + new customers → shared with and sent to the new ones only | PASS (one send, `organizationIds` = [new org]; existing customer got no new push) | pm-B1-03, pm-B2-01 · pm-B-lane.har |
| AC-4 Edit message only → saved, not sent | PASS (add [] / remove [] + message, no send) | pm-B3-01-reopen-M3-prefilled.png · HAR |
| AC-D2 Custom message replaces the default in push | PASS | pm-A8-graphql.json |

## Bugs
- Low: widening a Customer share to "Anyone with link" warns that recipients will lose access, but their links become public. `reports/bugs/open/low/BUG-rep-share-widen-confirm-says-recipients-lose-access-VCST-6104.md` (VCST-6104)
- Low: share message limits disagree (250 in the dialog, 1000 for the notification, 1024 stored). An over-cap stored message saves, then the notification fails and there is no way to re-notify. `reports/bugs/open/low/BUG-rep-share-message-limits-disagree-250-1000-1024-VCST-6105.md` (VCST-6105)
- Not filed:
  - High, pre-existing: the target customer still can't read the list by id or see it in their own lists; only the share link works (A4, DRIFT HOLDS). VCST-5925 owns this in its ACs (In review). The existing report is `reports/bugs/open/critical-high/BUG-rep-shared-wishlist-grants-customer-no-access.md`.
  - High, pre-existing duplicate: the Message textarea has no accessible name (B12). It's the same defect as `BUG-vc-textarea-has-no-accessible-name-shared-ui-kit.md`, which now lists this surface. Accessibility, standalone; it doesn't block this ticket.
  - Low, for VCST-5707: the Stop-sharing confirmation reads "Stop sharing this list? Everyone the list is shared with will lose access." The 5707 AC says "…this page? Anyone with the link will lose access." (B10)
  - Low: API rejections return a generic `INVALID_OPERATION`, and `addSharedWithIds [""]` is accepted silently (A3, A6, A7). You chose not to file these.
  - Low, accessibility: focus goes to the page root after Cancel on the Stop-sharing confirmation (B12).

## Not tested, and why
- Email rendering of the rep message: not observed. Only the push was checked.
- PO questions:
  - Re-share after Stop sharing reuses the link but restores neither the message nor the recipients (A3, B10). Every link sent before the stop works again.
  - The customer never sees the message on `/shared-list`, only in the push (B2, EXP g).
  - Rep messages render raw HTML, including remote `<img>` (EXP-07).
  - Should a failed notification be retryable, with a delivery state per recipient (EXP-05)?
- Candidate cases (passed here, no suite case stamps them): `sr.list-share.edit-prefill`, `.recipients-prefill`, `.message-only-save`, `.send-new-only`, `.save-enabled-rule`, `.remove-customer`, `.clear-undo`, `.stop-sharing-confirm`.
- Exploratory scenarios EXP-05..08 are proposed for suites 007/068, for a later `/qa-test-lifecycle` run.

## Data
- Created 8 AGENT-TEST- lists and removed all 8 by id. Each re-read returns null (pm-teardown-graphql.json). No settings or fixtures changed.
- 7 notifications went out (5 to ORG_ACME, 2 to AGENT-TEST-Org-BuildRight). They can't be recalled.
- Deploy note: the 10:06Z auto-deploy had pinned a stale #2476 artifact (2.58.0-pr-2476-8640, built Sep 10). The head was redeployed before testing.

## Context used
Model reports/ba/test-models/VCST-5728-2026-09-29.md (Round 3) · Checklist reports/tickets/Sprint26-19/VCST-5728/testing-checklist.md · Domain map PRESENT (sales-rep.md rev 3) · Mind map .claude/knowledge/domain/sales-rep.mind-map.json (+9 nodes) · Exploratory reports/exploratory/SBTM-VCST-5728-2026-09-29.md · PRs vc-frontend#2476, vc-module-x-cart#141, vc-module-cart#194, vc-module-sales-rep#21 (all OPEN)
