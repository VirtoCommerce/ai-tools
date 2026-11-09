# [Marketplace Communication] Operator with no vendor selected: message/search (unread badge) and conversation/search return 500

## Status: CONFIRMED
**Tracker:** VCST-6730
**Found by:** agent — testing VCST-5816
**Severity:** Medium · **Related:** VCST-5816 (same root cause, fixed there for `unreadcount` only)

## Summary
For an operator (platform administrator, or any user with `operator:resources`) with no vendor selected
in the Vendor Portal, two Communication queries still fail with 500 because they have no operator-group
fallback — the fallback VCST-5816 added to `GetUnreadCountQuery` only:
- `POST /api/vcmp/message/search` with `unreadOnly:true` — the blade's Communication badge, since vc-shell
  commit `91eeeaa5` (2026-10-28) the call that replaced `unreadcount` — returns 500
  `Value cannot be null. (Parameter 'userId')` and a red banner on every offer / product blade that has a conversation.
- `POST /api/vcmp/conversation/search` on the **Communication** page returns 500 `UserIds`; the page shows
  "There are no conversations yet" while the operator group has 65 conversations.

## Environment
- vcmp-dev (`https://vcmp-dev.govirto.com`, Vendor Portal `/apps/vendor-portal/`), Edge (playwright-edge), 2026-11-06 11:44–11:56 UTC
- Platform 3.1071.0 · MarketplaceCommunication 3.1001.0-alpha.220 · Communication 3.1001.0-alpha.72 ·
  MarketplaceVendor 3.1002.0-alpha.1034 · vc-shell framework 2.11.0, app 2.3.3
- User: `admin` (Administrator), Vendor Switcher empty

## Steps to reproduce
1. Sign in to the Vendor Portal as an administrator; leave the Vendor Switcher empty.
2. **Offers** → open an offer that already has a conversation (e.g. "Mero ones1").
3. Observe the blade and the `POST /api/vcmp/message/search` requests (3 per open).
4. Open **Communication** in the main menu; observe `POST /api/vcmp/conversation/search`.

## Expected
- `message/search` (unreadOnly) returns 200 with the operator group's unread messages for the entity, as
  `unreadcount` now does (VCST-5816); the badge shows the count; no banner.
- `conversation/search` returns the operator group's conversations; the Communication page lists them
  (docs: Operator portal → Communication "includes all the dialogs between Vendor and Operator").

## Actual
- `message/search` → **500** `{"message":"Value cannot be null. (Parameter 'userId')","stackTrace":null}` ×3, red banner
  on the blade. Entities without a conversation return 200.
- With a vendor selected, the badge call still omits `sellerId` → same 500.
- `conversation/search {skip:0,take:20,responseGroup:"Full"}` → **500** `{"message":"UserIds"}`, banner "UserIds",
  "There are no conversations yet".

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Vendor Portal UI (vc-shell) | FAIL | banner on blade / Communication page — screenshots below |
| 2. Back office (Admin SPA) | N/A | not exercised |
| 3. GraphQL xAPI | N/A | the module has no GraphQL schema |
| 4. Platform REST API | FAIL | `api/post-message-search-unreadonly-500.json`, `api/post-conversation-search-500.json` |

**Owning layer:** Layer 4 — REST (`vc-module-marketplace-communication`).

## Root Cause Analysis (source, `dev` @ 1f4f8640)
- `SearchMessagesQuery : SearchMessageCriteria, IQuery<…>, IHasSellerId` — no `IHasOperatorId`.
  `SearchMessagesQueryHandler.SearchUnreadAsync` (line 59) calls
  `GetOrCreateCommunicationUser(request.SellerId, Organization)`; `SellerId` is empty for an operator →
  Communication's new guard (vc-module-communication #3) throws `ArgumentNullException('userId')`.
- `SearchConversationsQuery : …, IHasSellerId` — no `IHasOperatorId`. `SearchConversationsQueryHandler` (lines 31–39)
  fills `UserIds` only from `SellerId`, then throws `ArgumentException(nameof(UserIds))` when empty.
- Fix shape = VCST-5816's PR #4: implement `IHasOperatorId` and fall back to `MarketplaceOptions.OperatorGroupId`.

## Also seen (not part of this fix)
- Vendor Portal badge call omits `sellerId` even with a vendor selected (front end).
- `POST /api/vcmp/communicationuser/seller` on an order with no seller (CO261029-00002) → 500 "…has no Seller"; a 4xx fits (Low).
- 3 identical `message/search` requests per blade open.

## Evidence
- `../../screenshots/FAIL-offer-with-conversation-message-search-500-userId.png`
- `../../screenshots/FAIL-communication-conversation-search-500-userids.png`
- `../../screenshots/FAIL-product-with-conversation-message-search-500-userId.png`, `FAIL-vendor-selected-offer-message-search-500-userId.png`
- `../../api/post-message-search-unreadonly-500.json`, `../../api/post-conversation-search-500.json` (auth redacted)

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-module-marketplace-communication
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** MarketplaceCommunication — `SearchMessages`, `SearchConversations` queries
- **RCA anchor:** `SearchMessagesQueryHandler.SearchUnreadAsync` (`GetOrCreateCommunicationUser(request.SellerId, …)`); `SearchConversationsQueryHandler` `throw new ArgumentException(nameof(request.UserIds))`
- **Routing confidence:** HIGH
