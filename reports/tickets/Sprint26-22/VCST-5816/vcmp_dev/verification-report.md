# VCST-5816 — fix verification on vcmp-dev (Vendor Portal)

**Date:** 2026-11-06 11:44–11:56 UTC · **Lane:** playwright-edge · **User:** admin (platform administrator = operator)
**Build (read live, `/api/platform/modules` + systeminfo):** Platform 3.1071.0 · MarketplaceCommunication 3.1001.0-alpha.220 ·
Communication 3.1001.0-alpha.72 · MarketplaceVendor 3.1002.0-alpha.1034 · vc-shell framework 2.11.0 (console banner), app 2.3.3
**RED baseline:** Jira comment 2026-09-25 (framework 2.6.0-rc.1, build 30207): GET/POST unreadcount → 500, NULL `UserId` SqlException, raw exception in a toast. Not re-created (pre-fix modules not deployed).

## Verdict

**The unreadcount fix works: PASS.** `POST /api/vcmp/message/unreadcount` as admin with no vendor returns 200 with the
operator group's real unread count (it matched for 5 of 5 entities).
**The symptom users see is still there, through a different endpoint: FAIL.** This build's UI no longer calls
`unreadcount`. Since commit `91eeeaa5` (2026-10-28, "unread messages as blade widget alerts") the blade's Communication
badge calls `POST /api/vcmp/message/search` with `unreadOnly:true`. That handler has the same flaw: with no `SellerId`
it looks up the recipient for a null user id, and there is no operator-group fallback. Opening an offer or product that
already has a conversation therefore still gives 500 ×3 and a red error banner. The banner now reads
`Value cannot be null. (Parameter 'userId')` (the new `ArgumentNullException` from Communication #3) and no longer
shows the SQL exception text.

## STR — 3 consecutive fresh-load runs (admin, Vendor Switcher = none)

| Run | Idle ≥60 s: unreadcount polls | GET unreadcount | POST unreadcount (blade entity) | Blade badge call (UI) | Error banner/toast |
|---|---|---|---|---|---|
| 1 (11:44) | none (~2 min idle) | 405 ×3 (`Allow: POST`) | 200 `0` ×3 — offer Spyglass (no conversation) | message/search unreadOnly 200 ×3 | none |
| 2 (11:47) | none (60 s) | — | 200 `0` — offer Epson; 200 `0` — order CO261029-00002 | message/search 200 ×3 | none (order messenger: see A3) |
| 3 (11:50) | none (60 s) | — | 200 `0` — offer Mero ones1 (has conversation) | **message/search 500 ×3** | **banner "Value cannot be null. (Parameter 'userId')"** |
| 4 (11:55, after vendor revert) | — | 405 | 200 **`3`** — offer Black Crows Camox (3 unread for operator) | — | — |

Response shape: a bare JSON integer (`0`, `3`). An empty body gives 400 with EntityId/EntityType "required" errors.
The UI issued no `unreadcount` call at all in about 12 min of session, idle or on blade/messenger open. Every
`unreadcount` result above comes from an in-page `fetch` with the session cookie (exploratory API probe, API layer only).

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | GET unreadcount → 200, 3/3 | **AMBIGUOUS** | 405 ×4, `Allow: POST`. The controller declares only `[HttpPost] unreadcount`, unchanged since 2024-11 and not touched by PR #4; vcst returned 405 as well. The UI never sends a GET. A "GET → 500" cannot come from this route, so the RED comment's GET may be mislabelled. No 500. `api/get-unreadcount-admin-novendor.json` |
| 2 | POST unreadcount on offer/product/order → 200, 3/3; widget loads | **PASS** (endpoint) | 200 in every run for an offer, an order and seller products. The Communication widget opens and its badge renders `0`. But the UI does not send this POST: see A1. `api/post-unreadcount-admin-novendor-run1..4.json` |
| 3 | Root cause: count is the operator group's, not a swallowed error | **PASS** | `GET communicationuser/operator` returns "Operator org" (437285b9…). `conversation/search` for that user gives `unreadMessagesCount` 3/2/1/6/5, and `unreadcount` returned 3/2/1/6/5 for the same offer, order and products. The count stayed 3 before and after the session, so nothing was marked read. `api/post-unreadcount-operator-vs-conversation-search.json` |
| 4 | Vendor selected: GET + POST → 200 (seller path) | **PASS (API) / FAIL (UI)** | With vendor Trata-ta org selected, the URL becomes `#/<sellerId>/…` and `seller/offers/search` carries `sellerId`. `unreadcount` with `sellerId` returned 200 `0` ×3, and `message/search` with `sellerId` returned 200. The UI badge call omits `sellerId`, so it still gave 500 ×3 with the banner. `api/post-unreadcount-vendor-selected.json`, `FAIL-vendor-selected-offer-message-search-500-userId.png` |
| 5 | Seller user GET/POST | **BLOCKED** | No seller account: `ADMIN_PASSWORD_VCMP_DEV` is the only `*_VCMP_DEV` key name in `.env.playwright.all`. No account was created. |
| 6 | Messaging still works (existing messages load) | **PASS** | On Mero ones1 the messenger lists 2 existing messages (Nov 13 2025, Operator org ↔ Trata-ta org). `message/search` without unreadOnly 200, `communicationuser/info` 200. Read only; nothing sent. `04-offer-messenger-existing-messages-admin-no-vendor.png` |
| 7 | No toast with raw exception text (disclosure) | **PASS** (disclosure) | Every error body has `stackTrace:null`, and there is no SQL host, server path or stack anywhere. Error banners still appear and show a .NET exception message (A1, A2). |
| 8 | Console: no new unreadcount/communication errors | **FAIL** | No "Error getting unread count" message. But there are new communication errors: `use-error-handler` "Value cannot be null. (Parameter 'userId')" ×3 per affected blade (A1), "UserIds" (A2), and "Error initializing messenger" (A3). Other console errors have unrelated causes: 404s on images (i.etsystatic.com, relative `apps/vendor-portal/catalog/*.jpg` on order lines, a `cms-content/assets/offers/…` thumbnail) and the 405s from my own GET probes. |
| 9 | API direct with admin bearer token | **PASS** (via session cookie) | The bearer-token script was denied by the permission classifier and was not retried. The same calls made with the session cookie gave GET 405 and POST 200 with the integer count. |

## Anomalies and new findings (reported up, not filed)

- **A1 — Same root cause, different endpoint (Medium, user-visible).** `POST /api/vcmp/message/search`
  `{entityId, entityType, unreadOnly:true, sort, take:20}` returns 500 `{"message":"Value cannot be null. (Parameter 'userId')"}`.
  It happens for an operator with no `sellerId`, on any offer or seller-product that already has a conversation.
  Entities without a conversation return 200.
  - **Source:** `SearchMessagesQueryHandler.SearchUnreadAsync` calls `GetOrCreateCommunicationUser(request.SellerId, …)`.
    `SearchMessagesQuery` implements `IHasSellerId` only, not `IHasOperatorId`, so there is no `OperatorGroupId` fallback.
  - **Front end:** the widget also omits `sellerId` when a vendor is selected.
  - **Not compared:** the RED-era behaviour of this path. It did not exist at RED; it was added 2026-10-28.
  - **Evidence:** `FAIL-offer-with-conversation-message-search-500-userId.png`, `FAIL-product-with-conversation-message-search-500-userId.png`, `api/post-message-search-unreadonly-500.json`
- **A2 — Communication page (Medium).** As admin with no vendor, `POST /api/vcmp/conversation/search {skip,take,responseGroup}`
  returns 500 `{"message":"UserIds"}`. The page shows a "UserIds" alert and a toast, and "There are no conversations yet",
  although the operator group has 65 conversations.
  - **Source:** `SearchConversationsQueryHandler` has the same missing operator fallback.
  - **Evidence:** `FAIL-communication-conversation-search-500-userids.png`, `api/post-conversation-search-500.json`
- **A3 — Order with no seller (Low, data-dependent).** Opening the messenger on order CO261029-00002 makes
  `POST /api/vcmp/communicationuser/seller` return 500 "…CustomerOrder with id … has no Seller". There is no toast; the
  console shows "Error initializing messenger". A 4xx would be more accurate for this case.
  Evidence: `FAIL-order-messenger-communicationuser-seller-500.png`, `api/post-communicationuser-seller-order-500.json`
- **A4 — Duplicate calls.** Each blade open sends 3 identical `message/search` unreadOnly requests.
- **A5 — Idle polling** of unreadcount is gone. The "~15 errors / 40 min" baseline cannot recur through that endpoint.

## Evidence

- **Screenshots** (`screenshots/`):
  - `00-dashboard-admin.png`
  - `01-vendor-switcher-all.png` (no vendor selected)
  - `02-offer-blade-communication-widget-admin-no-vendor.png` (the previously failing step, clean)
  - `03-offer-messenger-open-admin-no-vendor.png`
  - `04-offer-messenger-existing-messages-admin-no-vendor.png`
  - the five `FAIL-*.png` files above
- **API captures:** `api/*.json` (10 files; cookies and auth redacted).
- **HAR, console and network:** per the lane config, plus `test-results/edge/console-*.log`.
- **kb:** asked — no answer (`kb_none`). Captured KB-BBEA0B0D (unreadcount behaviour) and KB-12AE72E7 (A1/A2/A3, defect=suspected).
- **Teardown:** vendor context reverted (URL back to `#/`, no seller id). No entities created, no messages sent, no settings changed.
