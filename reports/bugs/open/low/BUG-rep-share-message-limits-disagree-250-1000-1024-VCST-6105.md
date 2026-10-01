# BUG: The share message has three limits (250 dialog / 1000 notification / 1024 stored), and a saved message the notification rejects fails silently

## Status: READY_TO_SUBMIT · **Tracker:** VCST-6105 (auto-fix labels withheld: spans 3 repos, routing LOW, limit needs a PO decision)
**Severity: Low** (P3). Reachable only when a list's message was written longer than 250 characters by an API or legacy client. The dialog caps typing at 250.
**Found by:** `/qa-test-fast VCST-5728` 2026-09-29 pm (checklist B7 + A6 + A8, exploratory EXP-05/06) · **Related:** VCST-5728, VCST-5707, VCST-5925. Supersedes the morning run's Low note "1024 vs 1000".
**Archetype:** `PARITY` (three layers, three limits)

**Env:** vcst-qa · Theme `2.59.0-pr-2476-0604-0604e3f1` · Cart `3.1011.0-pr-194-8331` · XCart `3.1037.0-pr-141-fb27` · SalesRep `3.1012.0-pr-21-f681` · Platform `3.1073.0-pr-3121-9965`

## Expected vs Actual
- **Expected:** one message limit across the three layers. At minimum, the Share dialog must not save and re-send a message it cannot deliver.
- **Actual:**
  - `changeWishlist` stores up to **1024** characters.
  - The Share dialog caps typing at **250**. A stored 600-character message reopens as **"600 / 250"** in red, with no error. Adding a recipient enables **Share**, and the dialog saves the 600 characters and sends them (689 characters with the link).
  - `sendCustomerCommunication` rejects anything over **1000** characters: *"Message must not exceed 1000 characters."*
  - The send body is the message plus about **89** characters of link. So any stored message over roughly **911** characters saves the new recipient and then fails their notification. The toast says *"The list was saved, but the notification could not be sent."* There is no way to re-notify that recipient (EXP-05).

## Steps to Reproduce
1. As a sales rep, create a list and set its message via GraphQL: `changeWishlist(command:{listId, scope:"Customer", addSharedWithIds:[<orgA>], message:<950 chars>})`. It succeeds. Up to 1024 characters is accepted.
2. On the storefront, open **/account/lists → Actions → Share** for that list. The counter reads "950 / 250" with no error.
3. Add a second customer, then **Share**. `ChangeWishlist` succeeds and the new customer is saved.
4. The client's `SendCustomerCommunication` (message plus link, over 1000) is rejected. A warning toast shows, and the new customer is never notified.

## Evidence
![600 of 250](../../screenshots/rep-share-message-limits-disagree/pm-B7-01-reopen-600-char-message-counter-600of250.png)
- `…/rep-share-message-limits-disagree/pm-B7-02-add-recipient-share-enabled-over-limit.png`: Share is enabled with an over-cap message. It saved 600 and sent 689 characters (HAR `reports/tickets/Sprint26-19/VCST-5728/screenshots/pm-B-lane.har`).
- `reports/tickets/Sprint26-19/VCST-5728/screenshots/pm-A8-graphql.json`: 1001 characters is rejected. `pm-A6-graphql.json`: 1024 is stored, 1025 is rejected with a generic `INVALID_OPERATION`.
- `…/rep-share-message-limits-disagree/pm-X-04-send-failure-warning-toast.png`: send failure after save (send aborted in the session, EXP-05).
- Not observed end to end: a single run with a 912–1024-character stored message. Steps 3–4 combine two observed facts: the 689-character send in B7 and the 1001-character rejection in A8.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | FAIL | Cap enforced on input only. Save is allowed with an over-cap message (pm-B7-01/02) |
| 2. Backend Admin | N/A | Not admin-visible |
| 3. GraphQL xAPI | FAIL (parity) | x-cart stores 1024, sales-rep send allows 1000 (pm-A6, pm-A8) |
| 4. Platform REST API | N/A | Not exercised |

## Root Cause Analysis
- vc-frontend#2476 `client-app/modules/sales-rep/components/wishlist-customer-sharing.vue:87`: `MESSAGE_MAX_LENGTH = 250`, applied as `:max-length` on the textarea (`:51`). `canSave` (`:244`) checks only `selected.length > 0`, so a pre-filled longer value passes.
- vc-module-cart#194: `CartSharingSetting` `MessageMaxLength = 1024`.
- vc-module-sales-rep#21: `SendCustomerCommunicationCommand` validator, max 1000 (error text above). The client appends the share link (`wishlist-customer-sharing.vue:208-217`).
- Product decision needed: which one limit, and whether the link counts against it.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 Storefront (guard) + Layer 3 xAPI (limit parity)
- **Suggested repo:** VirtoCommerce/vc-frontend (block Save or warn when the message is over the cap). Backend parity is in vc-module-x-cart / vc-module-cart / vc-module-sales-rep.
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** sales-rep `wishlist-customer-sharing`; Cart `CartSharingSetting`; SalesRep `SendCustomerCommunicationCommand`
- **RCA anchor:** `wishlist-customer-sharing.vue:87` `MESSAGE_MAX_LENGTH`; `canSave` `:244`
- **Routing confidence:** LOW. It spans three repos and needs a PO decision on the limit first.
