# Testing checklist — VCST-5707 [BFE][Sales Rep][Lists] Sharing improvements

**Env:** vcptcore-qa · Theme `2.59.0-pr-2476-0604` · XCart `pr-141-fb27` · Cart `pr-194-8331` · SalesRep `pr-21-f681` · Platform: UNKNOWN (admin probe unavailable)
**Model:** `reports/ba/test-models/VCST-5707-2026-09-29.md` (#1–#28) · **Discovery:** `reports/exploratory/SBTM-VCST-5707-2026-09-29.md` · **C1:** `REG-2026-09-29-1506`
**Actors:** Rep `@td(SR_REP_PRIMARY)` (serves AcmeCorp, TechFlow, BuildRight, AcmeWest) · Reader A `@td(ACME_BUYER)` (AcmeCorp, `organization_id` grant) · Reader B `@td(SR_REP_EXCLUSIVE_TECHFLOW)` as a TechFlow member · Anonymous · Unserved org `@td(SR_UNSERVED_ORG)`
**Oracle:** no list-sharing `BL-*` exists → `{SPEC}` = ticket ACs / attachments / PR #2476 · #21 / VCST-5925.
**Result (2026-09-29, Step 4a/4v/C1):** 26 PASS · 7 FAIL · 1 PASS-behaviour/DRIFT-copy · 1 BLOCKED · 1 PARTIAL · 1 recorded → **verdict FAIL** (AC1 not met; AC2/AC3 DRIFT; IN-SCOPE High VCST-6113). Evidence file names are under `screenshots/`.

## A. Acceptance criteria (as written)

| # | Condition | Source | Model | Verdict |
|---|---|---|---|---|
| A1.1 | Push received by a target-org member names the **organisation** that was shared | AC1 | #9 | **FAIL** — title "A new list from your sales representative", body = note + link; default text has no org name (`4a-fe-reader-bell-no-org-name.png`, `4a-be-C8-notify.json`) → VCST-6114 |
| A1.2 | Email for the same share names the organisation | AC1 | #9 | **FAIL** (re-run 2026-09-30 with admin) — journal holds exactly 1 `SalesRepMessageEmailNotification` per recipient; subject "A new list from your sales representative", body = heading + message + link + footer, no organisation name (`5b-gap-G1a-two-org-notify-once.json`) → VCST-6114 |
| A2.1 | After sharing, editing the list shows sharing details **read-only** with a remove option | AC2 | #4 | **FAIL / DRIFT** — Rename has name + description only; sharing is editable in a separate Share dialog (`4a-fe-rename-dialog-no-sharing-details.png`) — PO decision |
| A3.1 | Stop-sharing confirmation, copy vs AC3 | AC3 | #13 | **PASS behaviour / DRIFT copy** — "Stop sharing this list?" / "Everyone the list is shared with will lose access. You can share it again at any time." / Cancel · Stop sharing (`4a-fe-stop-sharing-confirm.png`) — PO decision |
| A3.2 | **Cancel** keeps the share | AC3 | #13 | PASS — reader still Read after Cancel (C1 B2C-LIST-072) |
| A3.3 | **Stop sharing** → every previous reader loses access immediately | AC3 | #14 | PASS — both readers `sharedWishlist` null; scope Private, targets [], message null (C1 B2C-LIST-073) |
| A4.1 | After stopping, a new sharing works for the new recipient | AC4 | #16 | PASS — re-share to TechFlow read + push; AcmeCorp denied |
| A4.2 | Same link after re-share; earlier recipients/message not restored | AC4 · 5925 2.4 | #16 | PASS — same key; picker empty, message 0/250 (C1 B2C-LIST-075) |

## B. The ticket's problem statement

| # | Condition | Source | Model | Verdict |
|---|---|---|---|---|
| B1 | Share with AcmeCorp, then add TechFlow → AcmeCorp reader still opens the same link | description | #2 | **PASS (fixed)** — targets = both; AcmeCorp Read on the same key (`4a-be-E1-B1-add.json`, UI "Shared with 2 customers") |
| B2 | TechFlow reader opens the link after the second save | description | #1 | PASS — Read |

## C. Journey and recipient handling (PR #2476 / sales-rep #21)

| # | Condition | Model | Verdict |
|---|---|---|---|
| C1 | [JOURNEY] create (Private) → Share 2 customers + message → readers open (read-only, rep attribution) → reopen → Stop → re-share | #1 | PASS WITH NOTE — journey works end to end (C1 B2C-LIST-062); the saved message is NOT rendered on `/shared-list` (push only, Low L5 / B2C-LIST-079) |
| C2 | Removing one recipient revokes only that org | #3 | PASS (C1 B2C-LIST-064) |
| C3 | Rename sends only name/description; sharing unchanged | #4 | PASS — request = listId/listName/description/cultureName |
| C4 | Picker lists exactly the 4 served customers (name + city/region); filter narrows | #5 | PASS |
| C5 | 250 cap; saved message on reopen; whitespace-only not persisted | #6 | PASS — 250/250; whitespace → `message: null` |
| C6 | Reopen after reload shows recipients; card "Shared with N customers" | #7 | PASS |
| C7 | Empty set: Save disabled + hint; Clear all → Undo; ≥4 rows collapse | #8 | PASS — note: after Undo, Share stays disabled until a real change (C1 B2C-LIST-069 AMBIGUOUS) |
| C8 | Only newly added orgs are notified | #10 | PASS — mechanism verified via API (`4a-be-C8-notify.json`: TF +1, ACME +0, rep +0) and UI network (4a storefront run) |
| C9 | Message-only edit | #26 | Recorded — saved, nobody notified (PO question) |
| C10 | Only the owner sees Share | #23 | PASS (C1 B2C-LIST-077) |

## D. Scopes and confirmations

| # | Condition | Model | Verdict |
|---|---|---|---|
| D1 | Private → Specific customers: no confirmation | #15 | PASS |
| D2 | Recipient changes inside Specific customers: no confirmation | #15 | PASS |
| D3 | Specific customers → Anyone / My organization: "Change who can access?" copy vs effect | #15 · #24 | **FAIL** — "…now will lose access." but previous recipients keep Read via the same key (`4a-fe-change-access-customer-to-anyone.png`, C1 B2C-LIST-078) → VCST-6115 |
| D4 | Anyone with link opens anonymously; copy-link = dialog URL | #17 | PASS (`4a-fe-anon-anyone-link-opens.png`) |
| D5 | Customer ↔ Anyone round trip leaves no stray grant | #18 | PASS |
| D6 | My organization: which org is granted; UI names it? | #19 | PARTIAL — stored as Organization, org never named; AcmeCorp/TechFlow denied; AcmeWest read untestable (no fixture) |

## E. Access / contract (GraphQL, server-side refusals)

| # | Condition | Model | Verdict |
|---|---|---|---|
| E1 | add A, add B, remove A → exact target set each step | #1–#3 | PASS (`4a-be-E1-*.json`) |
| E2 | Adding `@td(SR_UNSERVED_ORG)` with a served org → "Access denied.", nothing written | #21 | PASS (`4a-be-E2-unserved.json`) |
| E3 | Empty Customer set → `INVALID_OPERATION`, list unchanged | #8 | **FAIL** — refused change poisons the owner's cache; the next rename persists Customer with 0 targets (`4a-be-E3-*.json`, `4a-be-cache-*.json`, C1 WISH-038) → VCST-6113 |
| E4 | Target reader via `sharedWishlist`: Read, `targets: []`, no `sharedWithId` | #11 | PASS (`4a-be-E4-target-reader-by-key.json`) |
| E5 | Target reader via `wishlist(listId)` | #11 | FAIL (known, VCST-5925 3.1) — "Access denied." |
| E6 | Non-target served-org member reads by link → no data | #11 | PASS (`4a-be-E6-non-target-reader.json`) |
| E7 | Target reader's own `wishlists()` / `/account/lists` | #12 | FAIL (known, VCST-5925 3.2 / VCST-5335) — totalCount 0 |
| E8 | Legacy `sharedWithId`: 1 target replaces; 2 targets refused | #20 | PASS on one observation (`4a-be-E8-legacy-sharedWithId.json`); **conflicting** C1 WISH-041 (no error on 2 targets) — resolved in round 2 (R2-E8: existing target = no-op, new org refused; VCST-6152) |
| E9 | `addSharedWithIds` without `scope` | #25 | Recorded — HTTP 200, silent no-op (Low L2) |
| E10 | Reader write attempt refused, nothing changed | #11 | **FAIL** — refused `addWishlistItem` still persists quantity (pre-existing x-cart) → VCST-6116 |
| E11 | No HTTP 5xx; errors are `errors[]` | 5925 3.3 | PASS — 330/331 HTTP 200 (the 400 was a probe typo) |

## G. Former FIXTURE-GAP scenarios — run 2026-09-30 with admin on disposable fixtures (run `rmunz9s7y`, torn down, zero residue)

| # | Condition | Model | Verdict |
|---|---|---|---|
| G1a | Member of two targeted orgs gets ONE push and ONE email for one share; the rep (member of both) gets none | #10 · #22 | PASS — push delta 1, journal 1 email, rep delta 0 (`5b-gap-G1a-two-org-notify-once.json`) |
| G1b | Multi-org member: access follows the ACTIVE org | #22 | PASS (observed) — TechFlow-only list: Acme context "Access denied.", TechFlow context Read (`5b-gap-G1b-active-org-access.json`) |
| G2a–c | Org the rep stops serving: grant persists; owner still sees name + city; re-adding refused, nothing written; removal allowed → member denied, others unaffected | V7 | PASS (`5b-gap-G2c-*.json`) |
| G2d | Share dialog row for a no-longer-served org | V7 | PASS — name, city, Remove button (`5b-gap-G2d-share-dialog-no-longer-served-row.png`) |
| G3a–c | Deleted org: targets keep id with null name; removal allowed; fresh token of an orphan member denied | V7 | PASS (contract) — note: a token minted before the delete keeps Read until expiry (≤30 min) |
| G3c-UI | Share dialog / card for a deleted org | V7 | **FAIL** — recipient renders as the raw GUID (name, avatar, aria-label); card still "Shared with 2 customers" (`5b-gap-G3c-share-dialog-deleted-org-row.png`) |
| G4 | Non-owner with Write (AcmeCorp member on a rep's "My organization" list): UI offers no Share; server refuses audience changes | #23 | **UI PASS / server FAIL** — UI: Rename + Remove list, no Share; Rename sends no scope. Server: `changeWishlist(scope: any)` by the co-owner is accepted and **transfers ownership** (customerId → co-owner); the rep then gets "Access denied." and loses the list; with AnyoneAnonymous the list is publicly readable. Co-owner can also `removeWishlist` the rep's list. PRE-EXISTING by source (`x-cart@dev` `CartSharingService.ApplyScope` → `SetOwner(CurrentUserId)`), no control run (`5c-coowner-step3c-c1-anyone.json`, `5c-coowner-step3f-*.json`, `5c-coowner-ui-card-menu.png`) |
| G-adm | Side effects (admin REST, out of scope) | — | Editing a rep's served orgs revokes the rep's live token (signed out mid-work); after an org delete, saving the rep unchanged → HTTP 500 `FK_MemberRelation_Member_AncestorId` (`5b-gap-G2b-rep-token-probe.json`, `5b-gap-G3d-rep-record-side-effects.json`) |

## F. Not in scope / not reachable (stated, not skipped silently)

- Select all + "N of M" counter + picker paging >100 — VCST-5923, out of this PR.
- "Notify via" checkboxes and email on recipient rows — deliberate PR deviations (PR #2476 notes).
- All former FIXTURE-GAP scenarios, the non-owner Write co-owner and email are now in section G (2026-09-30).
- The permanent buyer fixtures (TECHFLOW_BUYER, ACMEWEST_ADMIN, BUILDRIGHT_ADMIN, MULTI_ORG_TF_BR) still have no usable membership on vcptcore. `seed:b2b:memberships` can fix it now that admin works; not run in this ticket.
- Visual / a11y / 375 px layout — `design-report.md` (VCST-6117/6118/6119 filed; textarea name, touch targets, theme contrast = pre-existing duplicates).

---

## Round 2 — 2026-10-05 (new build; PO accepted the shipped UI for AC2/AC3; AC1 → VCST-6114/5723)

**Result (round 2):** 17 PASS · 1 PASS-with-note (E8) · 1 NOT RUN (G3c) + C1 → **verdict PASS WITH NOTES**.

**Env:** vcptcore-qa · Platform 3.1076.0 · theme `2.59.0-pr-2476-0abb` · XCart `3.1038.0-pr-141-b404` · SalesRep `3.1012.0-pr-21-8964` · Cart `pr-194-8331` (deployed = declared). **Model:** round-2 amendment, rows #29–#35. Same actors as round 1.

| # | Condition | Model | Lane | Verdict |
|---|---|---|---|---|
| R2-A2 | Shipped Share dialog shows current sharing (scope, recipients, message) and lets the owner remove recipients / stop sharing — accepted as AC2 | #4 #7 | FE | PASS — scope, recipients (name, city, Remove), message 21/250; remove + save OK (`r2-4a-fe-R2-A2-*`) |
| R2-A3 | Stop-sharing confirmation (shipped copy accepted) → Cancel keeps, Stop revokes every reader | #13 #14 | FE+BE | PASS — Cancel keeps (reader opens), Stop revokes: both readers + anon get null by key (`r2-4a-fe-R2-A3-*`, `r2-4a-be-A3-stop-revokes-every-reader.json`) |
| R2-A4 | Re-share after stop: same link, new recipient reads, old recipients/message not restored | #16 | FE | PASS — same key, picker empty, 0/250; TechFlow reads, AcmeCorp 403 (`r2-4a-fe-R2-A4-*`) |
| R2-B | Add TechFlow to an AcmeCorp share → both read the same link (the ticket's bug) | #2 | FE+BE | PASS — both readers on the same key; card "Shared with 2 customers" (`r2-4a-fe-R2-B-*`, `r2-4a-be-E1-B-6152-targets-order.json`) |
| R2-D3a | Customer → Anyone with link: **no** "will lose access" claim (VCST-6104) | #24 | FE | PASS — Customer → Anyone saves with no confirmation; previous recipient keeps Read; anonymous FE read: PASS per C1 B2C-LIST-076 run note only, no artifact (AllowAnonymousUsers temporarily True for C1, reverted to False 2026-10-05, verified); BE anonymous refusals evidenced in R2-E4/E6, R2-E10 (`r2-4a-fe-R2-D3a-*`) |
| R2-D3b | Customer → My organization: copy matches the actual effect (target orgs lose access) | #24 #15 | FE+BE | PASS — "Change who can access? The link stays the same. Some users may lose access."; TechFlow denied, AcmeCorp reads (with **Write**) (`r2-4a-be-D3b-*`, `r2-4a-fe-R2-D3b-*`) |
| R2-D3c | Anyone → Customer / → Private and My org → Customer: the warning still appears where an audience IS lost | #15 | FE | PASS — Anyone→Customer and Org→Customer warn; →Private shows "Stop sharing this list?"; NEW: removing a recipient inside Specific customers also warns (e4a4cf5) (`r2-4a-fe-R2-D3c-*`) |
| R2-E3 | Refused empty-Customer save → list unchanged; next rename keeps scope + targets; link still works (VCST-6113) | #32 | BE | PASS — refused empty set + refused unserved add leave the list intact; rename keeps scope/targets/message (`r2-4a-be-E3-refused-empty-set-cache.json`) |
| R2-E8 | Legacy `sharedWithId` on a 2-target list → refused deterministically, list unchanged (3 repeats) | #34 | BE | PASS (note) — new org via legacy `sharedWithId` refused 3/3; an EXISTING target is now accepted as a deterministic no-op (set preserved) — round 1 refused it; both shapes are allowed by the VCST-6152 contract (no position-dependent outcome); WISH-041/049 to accept either shape (`r2-4a-be-E8-*`, C1 WISH-041/049) |
| R2-E10 | Reader / other-org / anonymous `addWishlistItem` + `updateWishListItems` → refused, nothing persisted (VCST-6116) | #31 | BE | PASS — reader / other org Forbidden, anonymous Unauthorized; owner readback qty unchanged (`r2-4a-be-E10-*`) |
| R2-G4a | Write co-owner on a "My organization" list: `changeWishlist(scope/targets/message)` → refused, owner unchanged, rep keeps the list (VCST-6125) | #29 | BE | PASS — every scope-bearing co-owner edit Forbidden; owner, scope, key unchanged (`r2-4a-be-G4a-*`) |
| R2-G4b | Non-owner `removeWishlist` → refused, list intact | #30 | BE | PASS — co-owner / other member / anon cannot removeWishlist (`r2-4a-be-G4b-*`) |
| R2-G4c | Non-owner (co-owner + reader) sees neither Share nor Remove list in the UI | #23 #30 | FE | PASS — co-owner card menu = Rename only; reader page has no actions (`r2-4a-fe-R2-G4c-*`) |
| R2-E1 | add A, add B, remove A → exact target set; order of `targets` equal in save response and next read (VCST-6152) | #1–#3 #33 | BE | PASS — exact sets each step; `targets` order equal in save and 3 reads (`r2-4a-be-E1-B-6152-targets-order.json`) |
| R2-E2 | Unserved org add (with a served one) → "Access denied.", nothing written | #21 | BE | PASS — "Access denied.", nothing written (`r2-4a-be-E2-*`) |
| R2-E4/E6 | Target reader reads by link; non-target served-org member gets no data; anonymous denied on Customer scope | #11 | BE | PASS — target reads by key; non-target Forbidden; anon Unauthorized; list-id path still denied for the target (known VCST-5925 3.1) (`r2-4a-be-E4-E6-*`) |
| R2-C8 | Only newly added orgs are notified; re-save of the same set notifies nobody | #10 | BE | PASS — only TechFlow +1 on add; re-save same set +0 for all (`r2-4a-be-C8-notify-delta.json`) |
| R2-UI | Share dialog: bottom padding kept when content scrolls (≥4 recipients) at 1920/375; confirmation dialogs render the new copy | #35 | 4v | PASS — 16 px bottom padding kept when scrolled at 375/768; dialogs render at 1920/375 (Low: "Change access" wraps at 375) — design-report.md §Round 2 |
| R2-G3c | Deleted target org row in the Share dialog (round 1: raw GUID) — still reproduces? | V7 | FE (if fixture cheap) | NOT RUN — needs an admin org delete; round-1 finding stands (unfiled, pending) |
| R2-C1 | Exact-set regression: the 44 round-1 cases after 2a (REPAIR / RE-BASE resolved as intended change) | — | 4c | REG-2026-10-05-1613 — 22/35 PASS; 13 non-pass all triaged: 7 known-fail, 4 test-defect (074/078 copy, WISH-041/049 no-op), 057 pre-existing a11y, 079 PO question |
