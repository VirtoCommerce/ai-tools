# VCST-6105 — Testing checklist (Artifact B, FAST)

**Ticket:** [Sales Rep] [Lists] Share message limits disagree (250 dialog / 1000 notification / 1024 stored) · Bug · Low · **Draft** (`not-fixed`)
**Flow / path:** `feature-test` FAST — reproduce and characterize live, with fresh evidence. No fix exists yet; next step `/vc-fix:qa-fix VCST-6105`.
**Env:** vcptcore-qa (`TEST_ENV=vcptcore`) · Theme `2.59.0-pr-2476-43b1` (vc-frontend#2476 head `43b1a918`, 2026-10-06) · Cart `3.1011.0-pr-194-8331` · XCart `3.1038.0-pr-141-b404` · SalesRep `3.1012.0-pr-21-8964` — all four PRs OPEN, unreleased.
**Original find:** vcst-qa, older heads (XCart `pr-141-fb27`, SalesRep `pr-21-f681`, Theme `pr-2476-0604`). Source at the deployed theme head is unchanged on the defect lines: `wishlist-customer-sharing.vue:87` `MESSAGE_MAX_LENGTH = 250` (input only), `:244` `canSave = selected.length > 0`.

**Oracles:** ticket Expected `{SPEC}` (one limit; the dialog must not save and re-send a message it cannot deliver) · `sendCustomerCommunication` message max 1000 `{DOC}` (VirtoOZ, SalesRep xAPI reference) · `changeWishlist` message 1024 stored / 1025 rejected `{OBSERVED}` KB-0BC18481 · ECL-7.2 (silent max-length handling).
**Oracle gap (finding):** no `BL-*` rule covers the list-share message or the communication message limit — `sr.yaml` BL-SR-001..032 are statistics/layout/documents.
**Surface purpose:** DECLARED — domain map `sr` rev 3 §3j + mind-map nodes `sr.list-share.*` (all `UNVERIFIED` for the message branches).
**Test data:** `@td(SR_REP_PRIMARY)` (role `SALES_REP`), its served orgs live-discovered via `salesRepCustomers`. Lists and messages are **created in the case** (FIFTH RULE: a share state is mutable by the rep's own UI) with `AGENT-TEST-6105-` names and deleted in Cleanup. Messages are `random-data` filler of an exact length; never asserted on content.
**Regression:** C1 skipped — FAST, no `--coverage`, so no case was written, repaired or re-based. Feature Release Gate: `not-assessed`.

| # | Condition (atomic) | Layer | Expected `{oracle}` | Verdict | Evidence |
|---|---|---|---|---|---|
| A1 | `changeWishlist(scope:Customer, addSharedWithIds:[orgA], message:<600>)` on a new rep list stores the 600-char message | xAPI | stored verbatim, read back as `sharingSetting.message` `{OBSERVED KB-0BC18481}` | | |
| A2 | Storage boundary on the current XCart head: 1024 stored, 1025 rejected, nothing written | xAPI | 1024 ok / 1025 `INVALID_OPERATION` `{OBSERVED}` | | |
| A3 | `sendCustomerCommunication` boundary: message of 1000 accepted, 1001 rejected with *"Message must not exceed 1000 characters."* | xAPI | `{DOC}` max 1000 | | |
| B1 | Fresh Share dialog: typing past 250 is blocked, counter `250 / 250` | storefront | cap 250 on input (reference behaviour) `{OBSERVED}` | | |
| B2 | Reopen the A1 list's Share dialog: the 600-char message is pre-filled in full and the counter reads `600 / 250` | storefront | **SPEC: the over-cap state is surfaced as an error, or the message is not offered for re-send** | | |
| B3 | In B2's state: is any validation error shown, and is the **Share** button disabled while no recipient was added? | storefront | record what is shown | | |
| B4 | Add orgB → **Share** becomes enabled with the over-cap message | storefront | **SPEC: must not be enabled for a message it cannot deliver** (here 600+link < 1000 still delivers — record) | | |
| B5 | Click **Share** (600 chars): `ChangeWishlist` carries the 600-char message; `SendCustomerCommunication` carries message + separator + link — record the exact sent length and the link length; success toast | storefront + network | record lengths; delivery succeeds below 1000 | | |
| B6 | **End to end, never observed before:** a list whose stored message is 950 → Share dialog → add orgC → **Share** | storefront + network | `{SPEC}` dialog must not save-then-fail | | |
| B6a | …`ChangeWishlist` succeeds and orgC is saved as a target (verify via `wishlist(listId){ sharingSetting{ targets message } }`) | xAPI | record | | |
| B6b | …`SendCustomerCommunication` is rejected (message+link > 1000); its error text recorded | network | `{DOC}` >1000 rejected | | |
| B6c | …the rep sees *"The list was saved, but the notification could not be sent."* (exact text recorded) | storefront | record | | |
| B7 | After B6: reopen the dialog — orgC is listed as an existing recipient and the UI offers **no** way to re-notify it (Share disabled / no resend) | storefront | `{SPEC}` gap — record what exists | | |
| B8 | Threshold: compute `T = 1000 − len(separator + link)`; a stored message of length T shares and notifies OK, T+1 saves and then fails the notification | storefront + network | record T (ticket estimates ≈911) | | |
| B9 | Message-only edit of an over-cap message (delete 1 char of a 600-char message, no recipient change): what does the dialog allow, and what is saved / sent | storefront + network | record (AC-4: message-only save sends nothing) | | |
| P1 | Parity summary: the three limits as observed on THIS build — dialog / notification / storage | all | `{SPEC}` one limit | | |

**Always-on:** console errors, GraphQL `errors[]` inside 200, network 4xx/5xx on every step; HAR always.

**Cleanup:** delete every `AGENT-TEST-6105-*` list the run created (`removeWishlist`), and record their ids before deletion.
