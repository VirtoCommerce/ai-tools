# VCST-6152 fix verification — wishlist share targets order + legacy `sharedWithId` — PASS

**Parent:** VCST-5925 · **Date:** 2026-10-06 · **Env:** vcptcore-qa (`TEST_ENV=vcptcore`), store `B2B-store`, xAPI `{BACK_URL}/graphql` · **Layer:** GraphQL xAPI only (no browser)
**Build (read live from `/api/platform/modules` + systeminfo):** VirtoCommerce.XCart **3.1038.0-pr-141-b404** (x-cart#141 head b40455e, contains fix cd42696) · SalesRep 3.1012.0-pr-21-8964 · Cart 3.1011.0-pr-194-8331 · Platform 3.1076.0
**Actor:** @td(SR_REP_PRIMARY) (bare password grant + `storeId`) · A = @td(ORG_ACME.platform_id), B = @td(ORG_TECHFLOW.platform_id), C = BuildRight (@td ORG-003, served — confirmed via `salesRepCustomers`), D = AcmeWest (served, not on the list)
**RED baseline (cited, not re-run):** XCart 3.1037.0-pr-141-fb27, 2026-10-01/02 — create response A,B,C / read B,C,A; legacy `sharedWithId`=A → INVALID_OPERATION. See `reports/bugs/open/medium/BUG-VCST-5925-targets-order-unstable-legacy-sharedWithId-refused.md`.

## Verdict
**PASS — fix confirmed.** On every surface `targets` comes back in ONE order (id ascending), and `sharedWithId` == `targets[0]`. Re-sending any present target as a legacy `sharedWithId` is a no-op, including in uppercase. A served org that is NOT on the list is still refused with INVALID_OPERATION, and the grants stay intact. 0 regressions in adjacent ACs. 0 non-200 responses across ~70 GraphQL calls.

## Per-run results (fresh 3-target list each run; ids inserted in DESCENDING order = worst case)
| Run | listId (deleted) | create resp | 3× read | rename resp + read | `wishlists()` | legacy present ×3 (1st + 2 non-1st) | legacy UPPER | legacy absent (D) | grants after |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ff67c100… | asc, swid=A | asc ×3 | asc / asc | asc | 0 errors, 3 targets | 0 errors | INVALID_OPERATION | 3 intact |
| 2 | 6aa87554… | asc, swid=A | asc ×3 | asc / asc | asc | 0 errors, 3 targets | 0 errors | INVALID_OPERATION | 3 intact |
| 3 | 303eef4a… | asc, swid=A | asc ×3 | asc / asc | asc | 0 errors, 3 targets | 0 errors | INVALID_OPERATION | 3 intact |

Inserted order: B(96f1…), C(2352…), A(105c…). Every response returned: A(105c…), C(2352…), B(96f1…), which is ascending by id. The sharing key stayed the same within each run on every save.

## Checklist
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Write-response order == read order | **PASS** 3/3 | create, rename, and changeWishlist responses match the reads, `wishlists()` and `sharedWishlist` |
| 2 | Order = id ascending (case-insensitive); `sharedWithId` == `targets[0]` | **PASS** | Descending insert came back ascending. 4-target list (D added) → A,C,B,D. Deleted-org list [X(1217…),A(105c…)] → A,X |
| 3 | Legacy re-send of ANY present target = no-op (incl. case variant) | **PASS** | First and non-first targets, 3/3 runs: 200, no errors, set unchanged. UPPERCASE first (3 runs), UPPERCASE non-first C and last D (run-1 list): no-op |
| 4 | Legacy id NOT on a multi-target list → INVALID_OPERATION, grants unchanged (AC10) | **PASS** | D (served): 3/3 `INVALID_OPERATION`, follow-up read = 3 targets. Unserved org: also INVALID_OPERATION, grants intact |
| 5 | `addSharedWithIds` keeps existing (AC1); `removeSharedWithIds` removes only that one (AC9) | **PASS** | add D (scope Customer) → A,C,B,D. remove B → A,C,D. Without `scope`, both are ignored silently (200, no write). That is by design per the 5925 contract (KB-B4377884, confirmed) |
| 6 | `sharingSetting.id` stable; `sharedWishlist(sharingKey)` resolves (AC2) | **PASS** | Key unchanged across create, reads, rename, legacy, add and remove. `sharedWishlist(key)` returned the list with the same ordered targets before and after add/remove |
| 7 | Single target: legacy = own target is a no-op; Private → Customer → Private (AC8) | **PASS** | legacy A: 200, no errors, [A]. Private → targets [], swid null. Customer+add B → [B]. Private → []. Key kept throughout |
| 8 | Refusals are HTTP 200 + `errors[]` (AC12); no 5xx | **PASS** | INVALID_OPERATION ×5 and Forbidden ×1, all HTTP 200. Anonymous `wishlist` → 200 + `Unauthorized`. 0 non-200 |
| 9 | Deleted org as target still resolves, ordering intact (AC4) | **PASS** | Disposable rep + org (create in case). After org DELETE (204): target keeps id, name null, order A,X on read ×2, `wishlists()` and rename. Legacy = deleted id → no-op |
| 10 | BL-SR-002 (membership scope) | **PASS** (half a) | Add of an unserved org → `Forbidden: Access denied.`, nothing written. Anonymous read → Unauthorized, `data.wishlist` null. Half (b) (statistics) is out of scope for this fix |

## Observations (no new defects)
- Unchanged and out of scope: refusals still carry the generic text `Error trying to resolve field 'changeWishlist'.` (KB-B4377884).
- The fix behaves as specified. Ordering is by id, so it is NOT stable by name or by insertion, and a newly added org can become `targets[0]`. Only a client that relies on `sharedWithId` meaning "the org I added first" is affected. This matches cd42696 and contract 2.3.

## Evidence (`verification/`)
- `verification/results.json`: structured per-step snapshots (targets order, sharedWithId, key, errors) for the 3 runs plus the AC1/AC2/AC4/AC8/AC9/BL-SR-002 probes.
- `verification/payloads.json`: 81 raw request/response pairs. Authorization is `Bearer [REDACTED]`. Password, passwordHash and security stamps are redacted. Token responses are not stored.

## Cleanup
- Deleted 4 lists as SR_REP_PRIMARY (`removeWishlist` = true ×4). `wishlists()` afterwards shows **0** `AGENT-TEST-6152-*` lists.
- AC4 disposable data: list removed (true), the disposable sales rep deleted (204), and its org deleted as the test step (204). The account lookup afterwards returned an empty body.
- No config changes. SR_REP_PRIMARY's served orgs were not touched.

## kb
- KB-42230B0A **disputed** (the write/read order flip no longer holds on b404).
- KB-B4377884 **confirmed**.
- KB-8F61528A **confirmed**.
- KB-49D2315C **captured**. It turned out to duplicate KB-8F61528A, which kb_ask did not surface, and the duplicate is noted on the confirm.

## Re-check AC6/AC7/AC11 — 2026-10-06
**Build (read live from `/api/platform/modules` + systeminfo):** XCart **3.1038.0-pr-141-b404** · SalesRep **3.1012.0-pr-21-8964** · Cart **3.1011.0-pr-194-8331** · Platform 3.1076.0. This matches the expected build. GraphQL xAPI + platform REST (setup only), no browser.
**Data (created in the case, removed afterwards):** owner @td(SR_REP_PRIMARY) (bare grant + `storeId`). Reader = an `AGENT-TEST-5925 Reader` contact+user in @td(ORG_TECHFLOW) (B). X = an `AGENT-TEST-6152-ORG-*` org that the rep serves via `PUT /api/sales-rep` and is then unassigned from. Each run used a fresh list shared Customer → [X, B, A=@td(ORG_ACME)].

**Verdict: PASS.** AC6, AC7, AC11 and the owner-only-targets rule all hold on b404, with identical results in run 1 and run 2.

| Check | Run 1 | Run 2 | Evidence (identical both runs) |
|---|---|---|---|
| AC6-b add X back while X is still a target (after unassign) | **PASS** | **PASS** | HTTP 200, `Forbidden: Access denied.`, `data.changeWishlist` null. Owner read: targets still A,B,X |
| AC6-a `removeSharedWithIds:[X]` (scope Customer) after unassign | **PASS** | **PASS** | 200, no errors, response + read = A,B. B reader still reads by key (Read) |
| AC6-b add X back after removal | **PASS** | **PASS** | 200, `Forbidden: Access denied.`, targets stay A,B (nothing written) |
| AC7 remove B → reader's next call | **PASS** | **PASS** | `sharedWishlist(key)` 200 + `Forbidden: Access denied.`, data null, about 200 ms after the revoke with no wait. `wishlist(listId)` Forbidden. Absent from `wishlists()` (total 0). Owner: targets = A |
| AC7 regression case WISH-044 (`graphql-runner --case 050h…csv:WISH-044`) | **PASS** 8/8 | **PASS** 8/8 | fixtures resolved. revoked → "Access denied."; stopped/deleted → null, no errors |
| AC11 owner after sharing | **PASS** | **PASS** | access `Write`, isOwner `true`, 3 targets, `sharedWithId` = targets[0] |
| AC11 target reader via `sharedWishlist` | **PASS** | **PASS** | access `Read`, isOwner `false` |
| Privacy: non-owner gets `targets: []`, `sharedWithId: null` | **PASS** | **PASS** | true on every reader read (granted, and after X removed). The reader's `wishlists()` shows 0 non-owner lists that carry targets |

**Known, not new:** VCST-6147 still reproduces. While B is granted, the target member's `wishlist(listId)` returns `Forbidden: Access denied.` and the list is absent from their `wishlists()` (total 0), in both runs.

**Observation (known, KB-1B066196):** the rep's token behaves differently depending on the change.
- After a `PUT /api/sales-rep` that **removes** a served org, the rep's existing token is revoked: `me.userName` = Anonymous and mutations return `Unauthorized`.
- A PUT that only **adds** an org leaves the token valid.
- A first attempt that did not re-mint the token aborted at the unassign step. Every org, contact, user and list it created was removed. The probe now re-mints the token after each PUT. The result is not affected.

**Evidence:** `verification/recheck-payloads.json` holds 55 request/response pairs from the passing run: GraphQL plus the admin setup/cleanup calls. `Bearer [REDACTED]`, password fields redacted, no token responses. WISH-044 evidence: `scripts/.graphql-evidence/WISH-044-1791248396546.json`, `…-1791248404580.json`.
**Cleanup (verified):**
- `removeWishlist` = true ×2 for the run lists, plus ×1 for the list left by the aborted attempt. A rep `wishlists()` check afterwards found 0 `AGENT-TEST-5925-recheck` lists.
- X was unassigned and deleted. The reader user and contact were deleted (GETs return none), for both attempts.
- SR_REP_PRIMARY's served set is restored exactly: 5 orgs, the same ids as before.
**kb:** confirmed KB-D1DF95A5, KB-B4377884, KB-1B066196 (with the add vs remove note). Captured KB-51888868 (revoke allowed after unassignment, re-add refused).
