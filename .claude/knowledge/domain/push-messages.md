---
domain_slug: push
applicability: universal
rationale: |
  Push Messages is the module by which a sender (a marketer in the back office, or a sales rep from
  the storefront) puts a short message into named customers' in-app inbox, and optionally into their
  browser via Firebase Cloud Messaging. The map was built because the domain had no map and no BL
  domain: its only suites cite order-email invariants, and a second producer (sales-rep list sharing,
  VCST-5728) landed without any statement of what the module is. It records what exists and where.
generated: 2026-09-29
rev: 1
amended: 2026-09-29
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/test-models/VCST-5728-2026-09-29.md, reports/exploratory/SBTM-VCST-5728-2026-09-29.md, reports/tickets/Sprint26-19/VCST-5728/ (verdicts in §6)
  - reports/bugs/fixed/BUG-FCM-stale-token-not-pruned.md, open/low BUG-rep-share-message-limits-disagree (VCST-6105), BUG-rep-share-widen-confirm (VCST-6104)
  - .claude/knowledge/domain/store-settings.md §Push Messages, sales-rep.md, test-data/aliases.json PUSH_MSG_SEED
  - regression/suites/Backend/push-messages/068 (22 cases), Backend/graphql/050l (18), smoke/078d, graphql/050m, Frontend/b2b/007, Frontend/sales-rep/089; config/test-suites.json
  - live enumeration on vcst-qa 2026-09-29 (Platform 3.1073.0-pr-3121-9965; storefront theme Ver. 2.59.0-pr-2476-0604-0604e3f1) — Admin SPA push blades + Settings/REST/Swagger (read), storefront bell + /account/notifications (3 accounts), xAPI introspection + reads
  - VirtoCommerce/vc-module-push-messages @ dev, vc-module-sales-rep @ dev (SendCustomerCommunicationCommandHandler), vc-frontend @ dev client-app/modules/push-messages
  - deployed modules 2026-09-29 — PushMessages 3.1005.0, Xapi 3.1023.0, Notifications 3.1014.0, XFrontend 3.1006.0, Store 3.1007.0, SalesRep 3.1012.0-pr-21-f681
  - .claude/knowledge/api/graphql-schema.md (header stamp 2026-09-29 = same day; push types re-introspected live)
excludes: >
  Email notification templates and events (the Notifications module: Admin "Notifications" menu, order/quote emails) are
  adjacent and NOT this domain. Platform SignalR toasts (platform `POST /api/platform/pushnotifications`, `markAllAsRead`, the vc-shell
  in-app notification centre) are adjacent and NOT this domain. The rep's share dialog itself (message field, scope, limits) is the
  sales-rep domain; only its push side effect is here. Real FCM delivery to a browser is a later pass (needs a granted permission).
---

# Push Messages — domain map

> Refresh with `/qa-domain-map push`. This file answers **what the feature is and where its surfaces are**. It does **not** carry
> behavioural rules — those are `BL-*` in the BL oracle (domain `push`, deliberately empty) — and it can **never ground an
> assertion as `{DOC}`**. Pointer index plus surface inventory.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass · `DRIFT` = prior art says otherwise and prior art
is wrong · `MISSING` = documented, does not exist · `UNVERIFIED` = not established, and **not** to be treated as true.
Evidence tags: **live** = observed on vcst-qa this pass · **src** = read in module/frontend source at `dev` (not necessarily the deployed build) · **doc** = verbatim published quote.

## §1 — Purpose and value chain

**Purpose (doc, `CONFIRMED` wording; behaviour per chain below): "The **Push Messages** module enables marketers to send custom notifications to selected
customers or organizations within the Virto Commerce Platform."**
(PlatformUserGuide, https://docs.virtocommerce.org/platform/user-guide/push-messages/overview). The two storefront guides name the sender differently: "notifications sent to them by
**sellers**" (https://docs.virtocommerce.org/storefront/user-guide/account/notifications) versus "tailored information from **marketers**"
(https://docs.virtocommerce.org/storefront/user-guide/shopping/notifications). Both are true of the build — marketers send from the back office, and a
sales rep (a seller) is a second, programmatic producer — but no guide says so. `CONFIRMED` (doc wording); "no guide names the rep producer" `UNVERIFIED` beyond the guides queried
(PlatformUserGuide, StorefrontUserGuide, PlatformDeveloperGuide).

The chain below is reconstructed from source + live and is **the first written statement** — cite against it, do not treat it as authority.

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | A sender writes a message | Admin **Push Messages → New** (Message rich-text, Recipients list / recipients query + Count, Track new recipients, Topic, Schedule send; **Save** = draft, **Send**) → `POST /api/push-message`. **Second producer:** sales rep `sendCustomerCommunication` (sendPush) saves `Topic=title, ShortMessage=message, Status=Sent, MemberIds=org members minus the initiator` — the only in-repo caller of `IPushMessageService` found by an org-wide code search. `CONFIRMED` (live: 96 admin-created and ~99 rep-created rows in the list; src: handler) — completeness of "only caller" `UNVERIFIED` (search returned 2 repos) |
| 2 | Scheduled sends wait for their time | Status vocabulary `Draft` / `Scheduled` / `Sent`. A recurring job flips `Scheduled` with `StartDate` in the past to `Sent`; live cron `0/2 * * * *` (module default `0/5`). `CONFIRMED` (src + live setting). Live `Scheduled` total is **0** — no scheduled message has ever existed on this env; the one draft-with-start-date seed is `Draft`. How `Scheduled` is assigned on Send: `UNVERIFIED` (needs a Send — mutation) |
| 3 | **Async hop.** The system works out who receives it | Only when status becomes `Sent`, `PushMessageChangedEventHandler` enqueues a Hangfire job (`AddRecipientsJob`): `memberIds` and `memberQuery` are expanded to the members' security accounts and one `PushMessageRecipient` row per **user** is saved. Window: the message is `Sent` in the list but not yet in anyone's inbox. `CONFIRMED` (src); window length `UNVERIFIED` (PUSH_MSG_SEED note says "poll before asserting") |
| 4 | Delivery to the customer | Saving recipients raises `PushMessageRecipientChangedEvent`, which (a) publishes to the xAPI hub → subscription `pushMessageCreated` over `wss://…/graphql` (`graphql-transport-ws`), always; (b) **only if** appsettings `UseFirebaseCloudMessaging` is true, sends an FCM multicast **data-only** `{messageId, body}` to each recipient's registered tokens (no `title`). `CONFIRMED` (src; live: websocket connection opened on `/account/notifications`); FCM delivery to a real browser `UNVERIFIED` |
| 5 | The customer sees it | Header bell + dropdown, `/account/notifications` page, and (FCM) an OS notification whose click opens `/push-message/<id>?returnUrl=…`, which marks the message read then redirects. `CONFIRMED` (live: bell + page; src: OS notification + click route) |
| 6 | The customer manages it | Per recipient: mark read/unread (single, all), clear all (= hide). The sender sees per-recipient **Read** in the Recipients blade. `CONFIRMED` (live: per-row Mark as read/unread on the page; read state differs between two org peers; Recipients blade shows Read column); the mutations themselves `UNVERIFIED` (mutating) |
| 7 | New people who match are added later | `Track new recipients` on a `Sent` message: a recurring job (live `0/15 * * * *`, module default hourly) plus **any** member add/modify event enqueue a recipient top-up. It only adds. `CONFIRMED` (src + live setting); end-to-end top-up `UNVERIFIED` |
| 8 | Taking it back | **No reversal exists.** A `Sent` message cannot be modified or deleted (service throws `InvalidOperationException`), recipients are never removed, a sent push cannot be recalled, clear-all only sets a per-recipient hidden flag. The only automatic removal is pruning of dead FCM tokens (`Unregistered`/`InvalidArgument`). `CONFIRMED` (src); the HTTP status of the Sent-delete refusal `UNVERIFIED` live (suite 050l `PUSH-034` says 500) |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Marketer / platform admin | All of `PushMessages:access/create/read/update/delete` (permissions enumerated via platform REST) — list, create, draft, schedule, send, clone, view recipients, change module settings | `CONFIRMED` live (admin walked); a role holding only some of the five permissions `UNVERIFIED` (no such role exercised) |
| Sales rep | Sends a push as a side effect of `sendCustomerCommunication` / list share to the organizations they serve; needs no `PushMessages:*` permission at the module (module's xAPI check is authenticated-only) | `CONFIRMED` src + live (rep-created rows) |
| Recipient (any authenticated user) | Reads only their own recipient rows; marks read/unread; clears; registers/deletes an FCM token | `CONFIRMED` live for read; mutations `UNVERIFIED` |
| Any authenticated user (non-recipient) | Reads `fcmSettings` (Firebase web config) — the xAPI authorization is `IsAuthenticated` only | `CONFIRMED` live (a no-message account and the platform admin token got all seven fields) |
| Anonymous | Refused: HTTP 200 + `Unauthorized`, `data:null`, on both `pushMessages` and `fcmSettings`; no bell in header; `/account/notifications` redirects to `/sign-in` | `CONFIRMED` live |
| Firebase Cloud Messaging | Push transport to browsers | `UNVERIFIED` (not exercised) |
| Hangfire recurring jobs | Scheduled → Sent; track-new-recipients | `CONFIRMED` src + live cron settings |

## §2 — Surface inventory

### Back office (Admin SPA, `#!/workspace/embedded-app/push-messages`, embedded vc-shell app in an iframe)

- **Entry:** main menu **Push Messages** (`CONFIRMED`). Left filter menu: **All messages · Drafts · Scheduled · Track new recipients · Sent** (`CONFIRMED`). Toolbar: **Refresh · New · Delete selected**.
- **List columns, visible by default:** Track new recipients, Status, Topic, Message (truncated), Modified date. **Hidden by default** (Show/Hide Columns): Member Query, Member Ids, **Recipients Total Count, Recipients Read Count, Recipients Read Percent**, Created By, Modified By, Id (`CONFIRMED`). The Drafts filter renders without the Track-new-recipients column (`CONFIRMED`, minor).
- **Push message details** (Sent, opened): toolbar **Save (disabled) · Clone**; sidebar button **Recipients** with badge = recipient count (34 on the row opened); fields Message (rich editor, read-only for Sent), Recipients list (combobox chips), Track new recipients (switch), Topic (read-only), Schedule send (date picker, read-only). `CONFIRMED`. `Clone` effect `UNVERIFIED` (would create).
- **Recipients blade:** columns **Name · Login · Read** (plus Show/Hide Columns). `CONFIRMED`.
- **New push message blade (opened, nothing saved):** toolbar **Save · Send**; Message (required `*`) with editor buttons Bold/Italic/Underline/Strikethrough, H1–H3, bullet/numbered list, blockquote, **Insert link, Insert image, Insert table**, Preview, Side-by-side, Source code, Fullscreen; Recipients list (combobox "Select recipients"); **"Enter recipients query" textbox + Count button**; Track new recipients switch with "Periodically check if there are new users matching the specified recipients list or query."; Topic; Schedule send. No character counter or max-length text visible. `CONFIRMED`. Enforcement of any max on save `UNVERIFIED` (needs Save).
- **Settings (platform REST, read; UI blade render `UNVERIFIED`):** module `VirtoCommerce.PushMessages`. Group **General**: `PushMessages.Enable`, `PushMessages.FCM.Enable`, `PushMessages.BatchSize` (default 50). Group **FCM Receiver Options**: `…FcmReceiverOptions.{ApiKey,AuthDomain,ProjectId,StorageBucket,MessagingSenderId,AppId,VapidKey}` (value null, defaults carried from configuration). Group **Background Jobs**: `SendScheduledMessagesRecurringJob.{Enable,CronExpression}`, `TrackNewRecipientsRecurringJob.{Enable,CronExpression}`. Live overrides: send job `0/2 * * * *` (default `0/5`), track job `0/15 * * * *` (default `0 0/1 * * *`). `CONFIRMED`.
- **Permissions:** `PushMessages:access, :create, :read, :update, :delete` (`CONFIRMED` via `GET /api/platform/security/permissions`); which blade control each one gates `UNVERIFIED`.
- **Platform REST** (Swagger, read): `POST /api/push-message/search`, `POST /api/push-message/search-recipients`, `GET /api/push-message/{id}`, `POST|PUT|DELETE /api/push-message`, `PUT /api/push-message/{id}/tracking/{value}` (`CONFIRMED`). Model `PushMessage`: topic, shortMessage, startDate, status, trackNewRecipients, memberQuery, memberIds, recipientsTotalCount, recipientsReadCount, recipientsReadPercent, audit fields. Search criteria: isDraft, trackNewRecipients, createdDateBefore, startDateBefore, statuses, keyword, sort, skip/take. **There is no `targetOrganizationIds`, `userGroups` or `cultureName` field** (`CONFIRMED`; see §6). Also present but adjacent (excluded): `POST /api/platform/pushnotifications`, `…/markAllAsRead`.
- **NOT manageable from the back office:** a recipient's read/hidden state (only viewable); editing or deleting a `Sent` message; recalling a send; a recipient's FCM tokens (xAPI only); the storefront theme flag `push_messages_enabled` (theme settings); per-store `PushMessages.Enable` / `FCM.Enable` overrides live on the **Store** settings, not this module's blades (src: registered for type Store; Store-settings UI render `UNVERIFIED`).

### Storefront (vc-frontend, Ver. 2.59.0-pr-2476-0604-0604e3f1)

- **Gates (src):** route/bell exist only when the theme setting `push_messages_enabled` is true **and** the user is authenticated **and** module setting `PushMessages.Enable` is true; FCM registration and route `/push-message/:messageId` additionally need `PushMessages.FCM.Enable`. Otherwise `/account/notifications` is registered as a redirect to sign-in. `CONFIRMED` src; theme flag value `true` `CONFIRMED` in the flag inventory (`storefront-config-flags.md`); the negative branches `UNVERIFIED` (no store/theme with the flag off).
- **Header bell:** authenticated header, between Orders and Cart: button "Notifications", badge = unread count ("10 Notifications" for the richest recipient). Dropdown: title, "Show unread only" toggle, message rows, "View all notifications"; empty state "No new notifications at the moment." (`CONFIRMED` live). Anonymous: no bell (`CONFIRMED`).
- **Page `/account/notifications`** (sidebar Marketing → Notifications): heading with count ("Notifications 10"), options menu (Toggle dropdown; mark-all read/unread per src), "Show unread only" switch, one card per message showing **body + timestamp only**, per-row "Mark as read"/"Mark as unread" (whole card is a button containing links), page size 10 with numbered pagination; empty state "You do not have any new notifications at this time" (`CONFIRMED` live). Opening the page or the bell does **not** mark anything read (`CONFIRMED`: unread count identical before and after; src: no mount-time mutation on the page).
- **Also reachable:** footer link "Notifications" → `/account/notifications`, shown to anonymous visitors too (`CONFIRMED`); mobile header/menu variants (src only, `UNVERIFIED` live).
- **Browser side:** `Notification.requestPermission()` on module init, service worker `/fcm-service-worker-v1.12.js` (served 200, Firebase 12.16.0 scripts), sign-out deletes the device token. Permission prompt behaviour `UNVERIFIED` (browser chrome, automation lane).
- **NOT manageable from the storefront:** creating a message; seeing the topic; seeing who else got it or the sender; deleting a message (clear-all hides only); per-message clear (only "clear all" exists per src).
- **Where rep-list-share pushes land:** in the target organization's members' bell and page, as body text + `…/shared-list/<key>` link (`CONFIRMED`: the ACME buyer's page shows them; all three ACME accounts probed hold the same 11 messages).

### API / contract (xAPI `/graphql`, schema stamp 2026-09-29, push types introspected live)

- **Queries:** `pushMessages(after, first, keyword, sort, unreadOnly, withHidden, cultureName)` → `PushMessageConnection{totalCount, pageInfo, edges, items}`; `PushMessageType{id, shortMessage, createdDate, isRead, isHidden}` — **no topic, no sender/createdBy, no unread count field**; `fcmSettings` → 7 non-null strings. `CONFIRMED`.
- **Mutations:** `clearAllPushMessages`, `markAllPushMessagesRead`, `markAllPushMessagesUnread`, `markPushMessageRead{messageId}`, `markPushMessageUnread{messageId}`, `addFcmToken{token}`, `deleteFcmToken{token}` — present `CONFIRMED`; behaviour `UNVERIFIED` (all mutate).
- **Subscription:** `pushMessageCreated` (no args) beside `ping`. Present `CONFIRMED`; a live event `UNVERIFIED` (needs a send).
- **Filters (read live):** `unreadOnly` and `withHidden` change counts (ACME buyer: 11 total, 10 unread, 11 with hidden). `cultureName` is accepted but the query handler never reads it (src). `keyword` is passed to the recipient search (src). `CONFIRMED` (`unread`/`withHidden`), src (`cultureName`), `UNVERIFIED` live (`keyword`, `sort`).
- **Auth:** module policy = authenticated only; rows filtered to the caller's `userId`. Anonymous → `Unauthorized` inside a 200. `CONFIRMED`.
- **Per-user state:** three accounts of one org hold the same 11 messages; only the first has any read state (1 read) → read is per recipient. `CONFIRMED`.
- **NOT reachable over xAPI:** the message topic, the sender, other recipients, admin fields; creating or scheduling a message.

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | **Guide vs build, list metrics.** PlatformUserGuide: "View message status, the number of recipients, and percent read." Live: the Recipients Total/Read Count/Read Percent columns are hidden by default, and when switched on show **0** for a Sent message whose Recipients blade lists 34. REST `POST /api/push-message/search` and `GET /api/push-message/{id}` return `recipientsTotalCount/ReadCount/ReadPercent` = 0 for all 200 newest Sent messages (0 of 200 non-zero); the correct totals come only from `search-recipients`. The detail blade's Recipients badge is right. **Narrowed 2026-09-29 (§7):** the Sent and Track-new-recipients views show "Recipients, #" and "Read, %" by default with non-zero values, so the guide's claim holds there; the zeros are confined to the REST search/get fields and the All-messages view with the hidden columns switched on | `CONFIRMED` (live, UI + REST) — scope narrowed, see §7 |
| D2 | **Guide vs build, max length.** PlatformUserGuide: "Send short messages in HTML format. Max length: 1024." Module source has no length constraint on `ShortMessage`/`Topic` (entity, validators, swagger schema all unconstrained) and the New blade shows no counter. The 1024 exists only on the rep list message (x-cart), the rep send caps at **1000**, the rep dialog at **250** (open bug VCST-6105). Longest message on the env: 1000 | src for module, live (no counter, max 1000 seen); enforcement on Save `UNVERIFIED` |
| D3 | **Topic exists in the back office, never reaches the customer.** Admin lists/edits a Topic; xAPI `PushMessageType` has no topic field; the FCM payload is `{messageId, body}` with no title, while the service worker does `showNotification(data?.title ?? "", …)`; the storefront card shows body only (rep pushes titled "A new list from your sales representative" appear as body text alone) | `CONFIRMED` (live: xAPI introspection + storefront render; src: payload + worker) — OS-notification title empty `UNVERIFIED` live |
| D4 | **Guide vs build, FCM switch.** Developer guide: appsettings `UseFirebaseCloudMessaging` "enables/disables Firebase Cloud Messaging" and the FCM receiver options live in appsettings. Build: the flag governs only the FCM half — false ⇒ no Firebase app, no FCM handler and **the FCM receiver settings and `PushMessages.FCM.Enable` are never registered**; in-app delivery (xAPI hub) is unaffected. Live, the receiver options and `FCM.Enable` exist as Admin settings (default from configuration), and `FCM.Enable` is also registered per Store. `store-settings.md` says `false` "disables all push functionality" | src `CONFIRMED`; live consistent (settings exist ⇒ flag true here); the flag-off branch `UNVERIFIED` |
| D5 | **Three renderers for one body.** Admin editor is a full rich-text/HTML editor (image, table, source view); the storefront card renders sanitised markdown/HTML with auto-linked URLs; the OS notification runs `htmlToText`, stripping markup. Guide says only "HTML format" | src `CONFIRMED`; storefront rich rendering of `<img>` was observed by prior exploratory (EXP-07) not this pass, so `UNVERIFIED` here |
| D6 | **Bell vs page count/list.** Page requests `withHidden: true` and shows the unread count from the with-hidden query; the bell requests `withHidden` false. After "clear all", cleared messages leave the bell but stay on the page, and the two badges can differ | src `CONFIRMED`; live `UNVERIFIED` (needs clear-all) — with no cleared rows today both read 10 |
| D7 | **Audience wording** in two storefront guides: account/notifications says "sent to them by **sellers**", shopping/notifications says "from **marketers**"; the platform guide says "marketers". Build supports both producers | `CONFIRMED` (doc quotes) |
| D8 | **Anonymous dead-end.** Footer link "Notifications" renders for anonymous visitors (`/account/notifications`) but the route redirects to `/sign-in`; the header bell is (correctly) absent | `CONFIRMED` live |
| D9 | **Recipients include non-active accounts.** The recipient list of a rep-created push to a served organization contains members named "Blocked User", "Invited User", "Lena Lock", and test accounts with no global role (name only; account status not read) | live enumeration `CONFIRMED` that they are on the list; whether they are actually locked/invited `UNVERIFIED` — evidence only, not a verdict |
| D10 | **Schedule path never exercised.** The guide and UI offer a Scheduled filter/state; the env holds 0 Scheduled messages ever (1058 Sent, 4 Draft of 1062) and the only seed with a start date is a Draft | `CONFIRMED` (REST counts); whether Send with a future date yields `Scheduled` `UNVERIFIED` |
| D11 | **Settings live on two planes.** Cron for the two jobs is overridden on this env (`0/2`, `0/15`) versus module defaults (`0/5`, hourly), so timing seen here is not the shipped timing | `CONFIRMED` |

## §4 — Coverage shape

**Basis:** every suite CSV parsed with a quote-aware CSV reader; counts are rows whose text matches the keyword, plus the row ranges quoted. Statuses read from `Automation_Status`. `config/test-suites.json` read for entries and `selections`. No count comes from a prior doc.

| Suite | Push-relevant | Suite | Push-relevant |
|---|---|---|---|
| 068 Push Messages (Backend/push-messages) | **22** of 22 — 10 back office (PUSH-001..010), 12 storefront (PUSH-017..037). 18 `Not Automated`, 4 `validated` | 050l GraphQL xAPI — Push Messages | **18** of 18 — 7 xAPI read-state/filter (011..016, 028), 1 auth boundary (026), 7 admin-API/E2E (027, 030..032, 034, 035, 038), 3 rep-share probes (`PUSH-39/40/41`, `Draft`). 15 `Automated`, 3 `Draft` |
| 078d Backend smoke — content workflows | **1** of 28 (BSM-062 "Push Messages Module Health Check"; BSM-044/045/073/082 are email templates, not this domain) | 050m GraphQL sales-rep | **15** of 155 (SR-GQL-042..056, `sendCustomerCommunication`; SR-GQL-053 `Deprecated`, 055/056 `Draft`) |
| 007 B2B lists shared | **14** of 56 in the "Sales Rep sharing" section (B2C-LIST-040..061); push-channel-specific ≈ 4 (keyword scan, basis-limited) | 089 Sales-rep My Customers | **≈9** of 55 keyword hits (SR-FE-031..042); push-channel-specific ≈ 3 (035/036/042) |

**Layer mismatch.** `068` holds 22 cases and lives under `Backend/`, yet 12 of its 22 are storefront cases; `config/test-suites.json` files it `layer: backend`, `concern: admin`.

**Selection groups** (there is no push-specific group):
- `068` is in `backend`, `full`, `domain:communication` and `concern:admin`, and **excluded from `sprint`**.
- `050l` is in `backend`, `sprint`, `full`, `domain:communication` and `concern:api`.
- **The producer-side push tests (050m SR-GQL-042..056, 089) sit outside `backend`, `frontend`, `sprint` and `full`**; they run only under `sales-rep`.
- `007` is in `frontend`.
- Neither `smoke` nor `critical` contains a push case other than BSM-062 via `078d`.

**Zero / near-zero coverage** (keyword count = 0 in `068` and `050l` unless stated):

| Area | Count | Deliberate or hole |
|---|---|---|
| `addFcmToken` / `deleteFcmToken` / `fcmSettings` (whole `regression/suites` tree) | 0 | **hole** (also unguarded: any authenticated user reads `fcmSettings`) |
| `pushMessageCreated` subscription | 0 in 050l (068 PUSH-033 covers real-time, wrongly named SignalR) | **hole** at API layer |
| Anonymous refusal of `pushMessages` | 0 | **hole** (only the customer-token-cannot-create boundary, PUSH-026, exists) |
| Recipients Total/Read Count / Percent | 0 | **hole**, and D1 is a live defect candidate |
| Show-unread-only switch, footer link, `/push-message/:id` click-through | 0 in 068 (`push-message/` appears 13× in 050l, but as the REST path) | **hole** |
| Service worker / FCM permission / FCM-off | 0 | partly deliberate (needs a browser permission and a config change) |
| Settings blade (General / FCM / Background jobs) | 0 | **hole** |
| Clone | 0 | **hole** |
| Permissions matrix (`PushMessages:*` per role) | 1 hit (PUSH-026, customer token only) | **hole** |
| Track new recipients | 7 in 068 (PUSH-009/010 `Not Automated`), 0 in 050l | partly covered; 050l PUSH-030 flips the flag only |

**Over-covered relative to risk:** the send seam — 15 rows of `050m` and 14 of `007` — against 0 rows that ask what the recipient's list and count show.

**Executability:**
- `068`: `envRiskGate: staging`, `clickDriven`, 18 of 22 `Not Automated`.
- `050l`: all 18 on the machine lane, 3 of them `Draft` and never run.
- Cited invariants: `BL-NOTIF-001/003` for both (order-email invariants, see BL-PUSH).
- `PUSH_MSG_SEED` states there is "no static recipient fixture by design" and messages self-seed, so every run adds an irrevocable `Sent` message (1058 exist).

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | Real FCM delivery, browser permission prompt, OS notification title/body (D3, D5) | **OPEN** — needs a headed browser with notification permission granted plus a send to that account; sends cannot be recalled |
| G2 | Create / Save / Send / Schedule / Clone behaviour, max length on save (D2), `Scheduled` assignment (D10) | **OPEN** — every path mutates; needs an isolated recipient fixture (own org) and a decision to allow a real send on vcst-qa |
| G3 | All seven xAPI mutations and the `pushMessageCreated` event | **OPEN** — need a disposable recipient (a fresh user in its own org) so read/clear state cannot collide with the sales-rep run's accounts |
| G4 | FCM-off and module-off negative cases (D4) | **OPEN** — needs a store, theme preset or environment with `push_messages_enabled`, `PushMessages.Enable` or `UseFirebaseCloudMessaging` off; none discoverable read-only. `FCM.Enable` per-store override UI render also unread |
| G5 | Permission model: which of the five `PushMessages:*` permissions gates which control | **OPEN** — needs a scoped role account and a way to assign it (Security is out of read-only scope) |
| G6 | Track-new-recipients end to end (member joins ⇒ inbox row; leaves ⇒ stays) | **OPEN** — needs create/modify of a member |
| G7 | Sent-delete refusal status (500 per suite 050l PUSH-034) and Sent-modify refusal | **OPEN** — needs `DELETE`/`PUT` (mutations named: `DELETE /api/push-message`, `PUT /api/push-message`) |
| G8 | Account status of D9's recipients (blocked / invited / locked) and whether sends should reach them | **OPEN** — read member/user status in Admin Contacts/Security (read-only, not done this pass) + PO decision |
| G9 | Bell vs page divergence after clear-all (D6) | **OPEN** — needs `clearAllPushMessages` on a disposable recipient |
| G10 | Admin settings UI render of the three groups; Store-level Push settings | **OPEN** — REST proves the settings exist; blade not walked |
| G11 | Mobile header/menu variants of the bell | **OPEN** — needs a ≤1024px lane (`mobile-navigation.md`) |
| G12 | Recipient-inbox timing after Send (async hop, link 3) | **OPEN** — needs a send plus polling |
| G13 | Other producers: only sales-rep found by org-wide search (limited result set) | **OPEN** — needs a second search per module manifest dependency on `VirtoCommerce.PushMessages` |

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `store-settings.md` — "Verify `UseFirebaseCloudMessaging: false` disables all push functionality" | **DRIFT** (src) — it disables FCM (Firebase app, sender handler, receiver settings); in-app xAPI delivery continues (D4) |
| `store-settings.md` — "`fcmSettings` returns client-side FCM config (apiKey … vapidKey)" and "Admin UI settings (3 categories): General, Background jobs, FCM receiver options" | **CONFIRMED** live (REST groups `General`, `FCM Receiver Options`, `Background Jobs`; seven fields returned to any authenticated user). Its "`PrivateKey` never exposed" test point: `UNVERIFIED` here (sender options absent from settings and xAPI type; not exhaustively probed) |
| `store-settings.md` — push config is appsettings-only | **DRIFT (partial)** — receiver options and `FCM.Enable` are also Admin/Store settings, seeded from configuration (D4) |
| `PUSH_MSG_SEED` note in `aliases.json`: targeting fields "memberIds[] / targetOrganizationIds[] / userGroups[] / cultureName verified live (PUSH-031)" | **DRIFT** — the current REST `PushMessage` model has only `memberIds` and `memberQuery`; the other three are not fields (unknown JSON properties would be silently dropped) (§2) |
| 068 `PUSH-033` "Real-Time Delivery via SignalR" | **DRIFT** (wording) — the storefront's real-time channel is the xAPI `pushMessageCreated` subscription over `graphql-transport-ws`; the live console shows no SignalR (excluded platform toasts are SignalR) |
| 068/050l cite `BL-NOTIF-001/003` | **DRIFT** — those are order-email invariants; no BL covers push (Domain 27 empty) |
| 050l `PUSH-038` "`cultureName` accepted but not persisted" | **CONFIRMED** (src: query handler ignores it; REST model has no such field) |
| 050l `PUSH-034` "Delete Sent returns HTTP 500 (known defect)" | src half **CONFIRMED** (`InvalidOperationException` on Sent), status code `UNVERIFIED` live |
| `BUG-FCM-stale-token-not-pruned` (FIXED, PR #24) | **CONFIRMED** in source at `dev` — terminal FCM errors (`Unregistered`, `InvalidArgument`) prune the token, transient ones do not; deployed module 3.1005.0 vs PR build not compared |
| VCST-5728 test model / exploratory: push content classes render sanitised (EXP-07), one send per double-click, rep push goes through `sendCustomerCommunication` | seam **CONFIRMED** (src + live rows); EXP-07 render `UNVERIFIED` here (not re-walked); note: `pushMessages` shows body only |
| KB-21BA7389 (xAPI `pushMessages` shape, "no createdBy or sender field") | **CONFIRMED** live (introspection) |
| VCST-6104 / VCST-6105 (open low bugs) | out of this domain's surfaces; VCST-6105's 250/1000/1024 limits are now joined by D2 (module has no limit) |

**Resolved by this map:** "what does a push message look like to the recipient" (body only, D3), and "who can read `fcmSettings`" (any authenticated user, §1).

## §7 — Amendments

| Date | By | What moved |
|---|---|---|
| 2026-09-29 | `/qa-review-tests` 068 `--verify` (live; Platform 3.1074.0-pr-3125-c3b8 — moved from 3.1073.0) | **D1 narrowed:** the Sent and Track-new-recipients views render "Recipients, #" / "Read, %" by default with non-zero values (e.g. 34/0, 10/10, 1/100); the zeros remain on REST `POST /api/push-message/search` / `GET /api/push-message/{id}` and on the All-messages view with the hidden columns enabled. Also observed: `{{BACK_URL}}/push-messages` returns 404 (the admin entry is main menu **Push Messages** only); the storefront page heading count is the unread count; an unread card = leading dot + tinted background; the bell-dropdown footer shows **Clear all** only when the inbox is non-empty; the page ⋮ menu holds **Mark all as read / Mark all as unread**; a Sent message's Recipients-list chips render member GUIDs, not names. Mind map: `push.manage.list-metrics` DRIFT → CONFIRMED, new `push.manage.list-metrics-rest-zero` |
