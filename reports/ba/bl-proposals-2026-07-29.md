# BL Proposals — 2026-07-29

Held drafts from `/qa-review-bl` Phase 4c (notification-editor scope, 5-candidate audit —
see `reports/knowledge/BL-AUDIT-2026-07-29.md`). **Not applied to the oracle.** Each item
below failed the applicable-axes bar for a stated reason and carries a re-audit trigger.

Both drafts are **out of the 5-candidate scope** of that run: they are sub-clauses that were
deliberately split off a promoted invariant rather than smuggled into it without their own
axis support. IDs shown are the next free ones after that run's promotions
(`BL-NOTIF-004..007`, `BL-UI-007`) — reconfirm before promoting.

---

## New BL-* proposed

### PROPOSED-BL-UI-008: Error chrome must not occlude a surface's own controls `[P1-data]`

- **Rule:** An error/notification banner raised inside an editing surface is additive chrome. It
  must not displace or hide the surface's own always-available controls — most importantly its
  close and maximize affordances — so the user can never be left unable to leave or resize a
  surface that is reporting an error. The banner is dismissible, and dismissing it restores the
  original control set.
- **Verify:** Provoke an error that renders a banner in the surface's header → enumerate the
  header's interactive elements and assert the close and maximize controls are still present and
  hit-testable → dismiss the banner → assert the control set is unchanged from the pre-error state.
- **Violation signal:** A header scan finds zero close/maximize elements while an error banner is
  shown; the only way to recover the controls is to dismiss the banner; a surface reporting an
  error cannot be closed.
- **Agents:** ui-ux-expert (header control enumeration), qa-backend-expert (Admin SPA blades)
- **Source:** **Live only.** `{OBSERVED}` this run — an HTTP 500 from the template render endpoint
  injected a `500: Internal server error` banner into the blade header and a header scan found no
  close/maximize element until `Dismiss` was pressed. The banner is raised by the **platform** blade
  chrome, not by `vc-module-notification`, and no `vc-platform` source anchor was read this run.
- **Why held:** UNGROUNDED — one axis only. Live is fresh and unambiguous, but the source axis is
  missing (wrong repo: the anchor lives in `vc-platform`'s blade-header / error-surface markup, not
  in the module under audit), and Docs is a §1a class-1 waiver at best. A lone surviving axis never
  canonicalizes.
- **Re-audit trigger:** read the `vc-platform` blade-header error surface (the
  `bladeNavigationService.setError` render path and the blade-header template that consumes it) to
  establish whether the banner *replaces* the control row or merely overlays it. If it replaces it,
  the axes agree and this promotes on source + live with Docs waived. Cheap — no browser needed,
  the live axis is already collected above.
- **Triggered by:** BL-NOTIF-007 (candidate 5); tracker VCST-5614.

### PROPOSED-BL-NOTIF-008: A destructive restore/reset confirmation must enumerate what it will remove `[P1-data]`

- **Rule:** A confirmation that gates a destructive reset must state precisely what will be deleted —
  the count and the identity of each affected item (for a template reset, every language whose
  override will be discarded). A type-to-confirm dialog that names nothing gives the user no basis
  for the decision it demands.
- **Verify:** Trigger the reset from every entry path that offers it → assert the dialog renders a
  non-empty list of the affected items and a count that matches that list → cancel → assert nothing
  was removed.
- **Violation signal:** The dialog says "template(s) for the following languages will be deleted:"
  above an empty list; the count renders blank or zero while a real override exists; the same dialog
  enumerates correctly from one entry path and not from another.
- **Agents:** qa-backend-expert (Admin SPA dialogs), qa-testing-expert (per-entry-path dialog capture)
- **Source:** Source + live agree on the mechanism.
  `vc-module-notification/src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notification-templates-list-reset-dialog.tpl.html`
  iterates `templates.slice(0, 10)` and counts `templates.length` (:8-12) — i.e. it expects an
  **array** under the key `templates`. The template-editor blade's
  `restoreTemplate()` (`notifications-edit-template.js` :477-488) passes a **single** object under the
  key `template`, so the dialog's `templates` binding is undefined on that path and both the list and
  the count render empty. `{OBSERVED}`: the dialog showed the "following languages will be deleted:"
  heading above an empty list.
- **Why held:** **Out of the audited scope** — the run's brief fixed the scope at 5 candidates and
  explicitly directed that this clause be drafted separately rather than folded into `BL-NOTIF-005`.
  The evidence would likely clear the bar (source + live fresh and agreeing, Docs a §1a class-1
  waiver for confirm-dialog mechanics), so this is a *not-yet*, not a rejection.
- **Re-audit trigger:** next `/qa-review-bl domain notif` (or any notification-scoped audit) — add
  the live axis for the **templates-list** entry path, which is expected to pass `templates` correctly
  and would confirm the asymmetry rather than a blanket failure. No new source reading needed.
- **Triggered by:** BL-NOTIF-005 (candidate 2); tracker VCST-5557.

---

# Second pass — 2026-07-29 (trigger/config scope, 5 candidates)

Appended by a later `/qa-review-bl` Phase 4c pass over the 5 trigger/configuration candidates from
`review 057,058`. **Nothing was applied to the oracle this pass** — `business-logic.md` was not
edited at all. Every candidate is held here.

**Why all five are held.** The pass ran **without a browser**: docs (VirtoOZ `PlatformUserGuide`) and
source (GitHub MCP, read-only) axes only. Per `bl-audit-criteria.md` §1a the `N/A` waiver covers
**Docs only** — it "never substitutes for a missing Source or Live axis" — and the verdict table scores
"any two present, third absent" as **UNGROUNDED**. None of these live axes is *structurally*
unavailable (each is observable in principle: a real payment/shipment transition, a notification
record, a CC'd send, a cron run, a template deletion); they were simply not observed this pass. So
each is a *not-yet*, not a rejection. Candidate 1 is additionally **CONTRADICTORY** and would be held
even with a live axis.

**ID numbering note.** `PROPOSED-BL-NOTIF-008` and `PROPOSED-BL-UI-008` were already taken by the
first pass above, so these five start at **009** — one higher than the numbering used in the request.
The oracle max is still `BL-NOTIF-007` / `BL-UI-007`; reconfirm before promoting.

## ⚠ Docs ↔ source contradiction (candidate 1) — report this upward

The documented order-shipped trigger and the implemented one **do not match**, and the mismatch is a
real defect signal, not an audit failure. Detail in `PROPOSED-BL-NOTIF-009` below. In short: the guide
promises "when **all** ordered items have been shipped"; the handler fires when the count of shipments
in a sent state goes from **zero to non-zero** — i.e. the **first** shipment of a multi-shipment order
triggers the customer's "order shipped" email. The payment half of the same pair *does* aggregate
correctly, which makes the shipment half look like an oversight rather than a deliberate design.

## New BL-* proposed (second pass)

### PROPOSED-BL-NOTIF-009: Order-paid and order-shipped notifications fire on order-level completion, once `[P1-data]`

- **Rule:** The order-paid notification fires only when the order is **fully paid** — the sum of its
  payments in a paid state covers the order total — and only on the transition into that state. The
  order-shipped notification fires only when **all ordered items have shipped**, and only on the
  transition into that state. A partial payment or a partial shipment must not fire either
  notification, and completing the remainder must not fire a duplicate. Both are gated by an
  order-level setting; when that setting is off neither fires. Per-document payment/shipment
  status-change notifications are a **separate** family and do fire per document — they must not be
  conflated with these two.
- **Verify:** On a multi-payment order, mark one payment paid for less than the order total → assert no
  order-paid notification record is created; pay the remainder → assert exactly one is created. On a
  multi-shipment order, mark one shipment sent while items remain unshipped → assert **no**
  order-shipped notification record is created; ship the remainder → assert exactly one is created.
  Repeat with the order-level paid/sent notification setting disabled → assert neither is created.
- **Violation signal:** The customer receives an "order shipped" email while part of the order is still
  unshipped; a partial payment triggers the order-paid email; the remainder-completing transition
  sends a second copy of either; an additional paid payment recorded after the order is already fully
  paid re-fires the order-paid email.
- **Agents:** qa-backend-expert (order API, notification records), qa-testing-expert (admin-driven
  payment/shipment transitions)
- **Docs:** PlatformUserGuide → Order management → Notifications: "Notification on order payment — The
  customer gets an email notification when **all payments related to an order have been completed**";
  "Notification on shipped order — The customer gets an email notification when **all ordered items
  have been shipped**."
  (`https://docs.virtocommerce.org/platform/user-guide/order-management/notifications`)
- **Source:** `vc-module-order` `src/VirtoCommerce.OrdersModule.Data/Handlers/SendNotificationsOrderChangedEventHandler.cs`
  (branch `dev`). Both are gated on the `OrderPaidAndOrderSentNotifications` setting (:105) inside the
  `SendOrderNotifications` gate (:57) and dispatched via a background job (:62 → :160
  `ScheduleSendNotificationAsync`).
  **Payment half agrees with the docs:** `IsOrderPaid` (:221-226) sums the payments in a paid state on
  both the old and new entry and requires `NewEntry.Total <= newPaidTotal` (:225) — a genuine
  order-level aggregate, so a partial payment cannot fire it.
  **Shipment half contradicts the docs:** `IsOrderSent` (:233-238) counts shipments whose status is
  `Send`/`Sent` before and after, and returns `oldSentShipmentsCount == 0 && newSentShipmentsCount > 0`
  (:237). There is **no comparison against the ordered items or the shipment set** — the first shipment
  to enter a sent state satisfies it. The no-duplicate half is upheld only incidentally, by the
  `old == 0` latch rather than by a completion test.
  Separately, the per-document family — `PaymentStatusChangedEmailNotification` /
  `ShipmentStatusChangedEmailNotification` (:86-103, via `GetEntriesWithChangedStatus` :194-212) — is
  gated on a different setting and *does* fire per changed document, by design.
- **Why held:** **CONTRADICTORY.** Docs and source disagree on the shipment trigger, so no Rule text can
  be canonicalized without a human deciding which is authoritative — is the guide aspirational (code is
  the bug) or is the guide wrong (the latch is intended)? The `Rule` above is written to the
  **documented** contract deliberately, so that promoting it later would make the current
  implementation a detectable violation. The live axis is also absent this pass.
  A second, smaller gap noted while reading: `IsOrderPaid`'s `oldPaidTotal != newPaidTotal` guard means
  an *extra* paid payment recorded against an already-fully-paid order re-satisfies the condition and
  re-fires the order-paid notification. Covered by the Rule's "must not fire a duplicate" clause.
- **Re-audit trigger:** (a) **route the contradiction to a human/tracker decision first** — this is the
  substantive output of this candidate; then (b) add the live axis on a **multi-shipment** order: create
  two shipments, mark only one `Sent`, and check the order's notification feed for an order-shipped
  record. That single observation settles which side is authoritative. No further source reading needed.
- **Triggered by:** NOTIF-023, NOTIF-024 (both previously asserted `{DOC}` with no invariant behind them).

### PROPOSED-BL-NOTIF-010: Every dispatched notification leaves an inspectable record `[P1-data]`

- **Rule:** Dispatching a notification persists a message record **before** any send is attempted, and
  that record is the audit surface: it carries the notification kind, the resolved recipient, the
  rendered subject and body, a send status, the attempt count and last-attempt time, and — on failure —
  the captured error. A trigger that produces no record is a defect even if the mail arrives. A record
  that failed to render is still persisted, with an error status rather than silently dropped. Send
  attempts are retried with backoff within a dispatch, and the attempt count on the record is the
  evidence. A notification that is **inactive** is not dispatched and correctly produces no record —
  absence of a record is only a defect for an active notification. Order-scoped notifications are
  additionally reachable from the originating order's own notification feed.
- **Verify:** Trigger an active notification → read its record and assert kind, recipient, rendered
  subject/body, a terminal send status, and a non-zero attempt count with a last-attempt time. Force a
  send failure → assert the record persists with an error status and a captured error, and that the
  attempt count reflects more than one try. Trigger an order-scoped notification → assert the record is
  reachable from that order's notification feed as well as the module-wide log. Disable a notification
  and trigger it → assert no record is created.
- **Violation signal:** A notification arrives with no corresponding record; a record shows a terminal
  status but a zero attempt count; a render failure produces neither a record nor an error; an
  order-scoped notification is absent from that order's feed while present module-wide; a record's
  recipient or body is blank while the delivered message had them.
- **Agents:** qa-backend-expert (notification record API + order feed), qa-testing-expert (trigger + record inspection)
- **Docs:** *Partial.* PlatformUserGuide → Notifications → Notification Log establishes the surfaces —
  "You can view a log of: All the notifications sent via the **Notification activity feed**. A specific
  notification via the **Notification log** widget" — and Order management → Notifications →
  *View order notifications* documents the per-order **Notification feed** widget. Neither page
  enumerates the recorded fields, the status vocabulary, or the retry contract; that half of the Rule
  is source-grounded only.
- **Source:** `vc-module-notification` `src/VirtoCommerce.NotificationsModule.Data/Senders/NotificationSender.cs`
  (branch `feat/VCST-5557`). `CreateMessageAsync` (:110-126) builds the message, renders it (:116) and
  **persists it (:123) before any send** — a render exception is caught and stored as the error with an
  error status (:118-122), still persisted. `ScheduleSendNotificationAsync` (:33-41) is gated on
  `IsActive == true`, which is why an inactive notification legitimately has no record.
  `TrySendNotificationMessageAsync` (:65-108) applies a Polly retry policy with exponential backoff
  (:83), stamps the last-attempt time and increments the attempt count per try (:87-88), sets the sent
  status and send date on success (:95-96) or the error status and captured error on failure
  (:100-102), and persists (:105). `MaxSendAttemptCount` is set at creation (:113). The recorded fields
  live on `Core/Model/NotificationMessage.cs` and `Core/Model/EmailNotificationMessage.cs` (:21-53 —
  From/To/CC/BCC/Subject/Body/Attachments). Order scoping comes from
  `vc-module-order` `SendNotificationsOrderChangedEventHandler.cs` :255-262, which stamps the record's
  tenant identity with the order (or the subscription when the order has one) — the mechanism behind
  the per-order feed.
- **Why held:** **UNGROUNDED** — live axis absent, and the docs axis covers only the *existence* of the
  log/feed surfaces, not the field/status/retry contract the Rule asserts. Docs here is **not**
  `N/A`-waivable: a notification log is exactly the kind of user-facing surface a guide describes, and
  §1a forbids waiving in that case ("when in doubt, UNGROUNDED, not N/A").
  **One clause deliberately weakened from the candidate wording:** "a record with an error status must
  show a retry" was asserted as an *ongoing* retry. Source shows retries happen **within** a dispatch
  (the Polly policy), and that a record already in an error state is explicitly **refused** on a later
  re-enqueue (:77-81) — so an errored record is not re-attempted afterwards. The Rule above states the
  attempt-count evidence instead of a post-hoc retry guarantee. This distinction matters for the 058
  cases and should be settled before promotion.
- **New ID rather than an amendment to `BL-NOTIF-001` — deliberate.** `BL-NOTIF-001` is scoped to the
  *order confirmation* email and to *once-only* delivery; it mentions the activity feed only in passing
  as a place failures show up. This candidate is a **cross-type observability contract** covering every
  notification kind (registration, password reset, abandoned cart, order events). Folding it into
  `BL-NOTIF-001` would let a P1 order-confirmation rule silently govern password-reset notifications
  and would blur a once-only delivery rule with a record-shape rule. `BL-NOTIF-001` should instead gain
  a cross-reference to this ID once promoted.
- **Re-audit trigger:** add the live axis — trigger one non-order notification (password reset is the
  cheapest: no order, no payment) and one order notification, then inspect both records for the field
  set above, plus one forced-failure record. Also settle the retry-clause wording noted above. This is
  the highest-value re-audit of the five: **24 rewritten cases in suite 058 currently rest on this
  invariant**, so it should not stay a draft long.
- **Triggered by:** the 058 rewrite (all 24 trigger cases).

### PROPOSED-BL-NOTIF-011: CC/BCC are a testing aid and never replace the primary recipient `[P1-data]`

- **Rule:** The primary recipient of a notification is resolved programmatically from the entity being
  notified about — for an order, the order's own address email, falling back to the customer's account
  email. CC and BCC are additive testing aids layered on top: setting either must never replace,
  redirect, or suppress the primary recipient, and clearing them must not change who the message is
  addressed to. A message whose primary recipient cannot be resolved is a failed send, not a message
  delivered to the CC/BCC addresses instead.
- **Verify:** Populate CC (and separately BCC) on a notification, trigger it, and read the resulting
  record → assert the primary recipient is the entity-derived address and that the CC/BCC values appear
  only in their own fields. Clear CC/BCC and re-trigger → assert the primary recipient is unchanged.
  Assert no configuration of CC/BCC alone causes a send whose primary recipient is a CC/BCC address.
- **Violation signal:** A CC or BCC value appears as the primary recipient; populating CC suppresses
  delivery to the customer; a message with CC set but an unresolved primary recipient is delivered to
  the CC address; the customer address is silently replaced by a testing address in a non-test flow.
- **Agents:** qa-backend-expert (notification record recipient fields), qa-testing-expert (CC/BCC configuration)
- **Docs:** PlatformUserGuide → Notifications → Notification list: "Both the **CC** and **BCC** fields
  are provided for **testing purposes only**, for example, to see if your email notification works
  correctly and can reach the specified addresses. In a production environment, the emails are
  programmed to go to the appropriate customer addresses, and you don't need to enter them manually."
  (`https://docs.virtocommerce.org/platform/user-guide/notifications/notification-list`)
- **Source:** Source agrees with the docs at three independent layers, all on branch `feat/VCST-5557`
  unless noted.
  (1) **Model** — `Core/Model/EmailNotification.cs` declares `To` (:32) and `CC`/`BCC` as separate
  arrays (:42, :47); `ToMessageAsync` copies each to the message independently (:82-85), so `To` is
  never derived from CC/BCC.
  (2) **Recipient resolution** — `vc-module-order` `SendNotificationsOrderChangedEventHandler.cs`
  `SetNotificationParametersAsync` sets `emailNotification.To` from the order at send time (:251), via
  `GetOrderRecipientEmailAsync` → the order address email, else the customer's account email
  (:264-269, :276-289). This is the literal mechanism behind the docs' "programmed to go to the
  appropriate customer addresses"; CC/BCC are not consulted.
  (3) **Transport** — `src/VirtoCommerce.NotificationsModule.Smtp/SmtpEmailNotificationMessageSender.cs`
  `SetupMailAddresses` (:89-124) adds the primary recipient **unconditionally** (:92) and then appends
  CC (:105-113) and BCC (:116-124) as additive loops guarded by a tolerant parse — a malformed CC entry
  is skipped without affecting the primary recipient. Note the asymmetry that *reinforces* the
  invariant: the primary recipient is parsed strictly (:92), so an unresolved one throws and the whole
  send fails (:54-56) rather than degrading into a CC-only delivery.
- **Why held:** **UNGROUNDED** — docs and source are both fresh, concrete and in agreement (2 of 3),
  but the live axis is absent this pass. Two surviving agreeing axes is the *minimum* only when the
  third is structurally waived; live is not waivable here (§1a covers Docs only) and a CC'd send is
  cheaply observable.
- **Re-audit trigger:** add the live axis — set CC on one notification, trigger it, and read the
  resulting record's recipient fields. Cheap and needs no order flow if paired with a
  registration/password-reset notification. Both other axes are already collected above.
- **Triggered by:** NOTIF-004.

### PROPOSED-BL-NOTIF-012: Abandoned-cart reminder scheduling is global; per-store settings select participation and threshold `[P2-ux]`

- **Rule:** The abandoned-cart reminder runs on a **single globally configured schedule** (a cron
  expression) with a global enable flag; the schedule is **not** per-store. Within each scheduled run,
  per-store settings decide two things: whether that store participates at all, and how long a cart
  must be idle before it counts as abandoned. Changing a per-store value must not alter the global
  schedule, and changing the global schedule must not reset per-store participation or thresholds. A
  store that has not opted in receives no reminders even while the global job runs.
- **Verify:** Read the global schedule and enable flag, then set a per-store enable flag and a
  per-store idle threshold that differ from the global defaults → re-read both scopes and assert
  neither overwrote the other. Assert the reminder is attempted only for stores whose own enable flag
  is on, and that each participating store's abandonment threshold is its own value, not the global
  one. Assert no per-store schedule override exists.
- **Violation signal:** Editing a per-store reminder setting rewrites the global cron expression, or
  vice versa; a store with its enable flag off still receives reminders; every store is evaluated
  against the global idle threshold rather than its own; a per-store schedule field is offered and
  silently ignored.
- **Agents:** qa-backend-expert (settings API, background job), qa-testing-expert (admin settings, both scopes)
- **Docs:** PlatformUserGuide → Cart → Settings → *Abandoned cart reminder*: the global path is "Click
  **General** to configure the **cron expression** for periodic notification sending", and a separate
  "To configure **store-specific reminders**" path goes to Stores → store → Settings → Cart. The
  store-specific field list is shown only as a screenshot, so the guide never claims the cron itself is
  store-overridable — consistent with source, but silent on the distinction.
  Also: "The notification text is configured via the Notifications module."
  (`https://docs.virtocommerce.org/platform/user-guide/cart/settings`)
- **Source:** `vc-module-cart`, branch `dev`.
  `src/VirtoCommerce.CartModule.Core/ModuleConstants.cs` declares three reminder settings (:77-99):
  the enable flag, the cron expression (default `0 9 * * *`, :85-91) and the idle-hours threshold
  (:93-99). All three appear in the module-wide setting list (:110-112), but **`StoreSettings` yields
  only the enable flag (:121) and the idle-hours threshold (:122)** — the cron expression is
  **deliberately absent from the store scope**.
  `src/VirtoCommerce.CartModule.Web/Module.cs` registers the recurring job from the **global** settings
  only — `.SetEnablerSetting(General.EnableAbandonedCartReminder)` + `.SetCronSetting(General.CronAbandonedCartReminder)`
  (:112-113).
  `src/VirtoCommerce.CartModule.Data/BackgroundJobs/AbandonedCartReminderJob.cs` then reads the
  **per-store** values inside that single run: it filters to stores whose own enable flag is on (:64)
  and uses each store's own idle-hours threshold (:83), resolving the notification per store tenant
  (:101-106).
- **Why held:** **UNGROUNDED** — live axis absent. Docs and source agree, but only after a correction:
  **the candidate's proposed rule was wrong.** It asserted the cron expression is "overridable per
  store" with "the store value taking precedence"; source shows the cron is **global-only** and that
  what varies per store is *participation* and the *abandonment threshold*. The Rule above is the
  corrected, evidence-grounded version. Because the correction changes what the invariant asserts, it
  should not be promoted on two axes without a live confirmation that no per-store schedule field is in
  fact surfaced in the admin UI.
- **Domain note:** filed under `BL-NOTIF` because the observable outcome is a notification firing;
  the settings themselves are cart-module settings, so `BL-CART` is a defensible alternative. Decide at
  promotion time — it affects which suite the coverage lands in.
- **Re-audit trigger:** add the live axis — open the store-scoped cart settings in the admin UI and
  enumerate the reminder fields present. If no cron/schedule field is offered there, docs + source +
  live all agree and this promotes as written. No browser-driven cron wait is needed; the settings
  enumeration is sufficient for the scope-precedence half.
- **Triggered by:** NOTIF-018, NOTIF-019, NOTIF-020.

### PROPOSED-BL-NOTIF-013: Default-language and predefined templates cannot be deleted, and a mixed selection is refused whole `[P1-data]`

- **Rule:** A template that is either the default-language template or shipped predefined is protected
  from removal. A removal request targeting one is refused with a localized message naming the reason,
  and a **mixed** selection containing at least one protected template is refused **as a whole** — no
  unprotected row in that selection is removed either. Refusal is a distinct outcome from the ordinary
  delete confirmation: the protected case must not present a confirmation that then partially succeeds.
- **Verify:** Select only a default-language template → invoke delete → assert a localized refusal
  naming default/predefined templates, and assert the template is still present. Repeat for a
  predefined template. Select one protected and one deletable template together → invoke delete →
  assert the same refusal and assert **both** rows survive. Select only deletable templates → assert
  the ordinary confirmation appears and, once accepted, only those rows are removed. Repeat the refusal
  under a second UI language to confirm the message is localized.
- **Violation signal:** A default-language or predefined template is removed; a mixed selection removes
  the unprotected rows and silently keeps the protected one; the refusal renders a hardcoded English
  string under a non-English UI; the protected case shows the ordinary delete confirmation and then
  partially succeeds.
- **Agents:** qa-backend-expert (Admin SPA template list), qa-testing-expert (multi-select + localization sweep)
- **Docs:** **Absent — and not `N/A`-waivable.** PlatformUserGuide → Notifications → Notification
  templates documents the predefined label, the warn-on-override behaviour and Restore, and the
  same-language override warning, but says **nothing about deletion being restricted**. A
  "you cannot delete this" refusal is exactly the user-facing behaviour a user guide would normally
  describe, so §1a forbids waiving Docs here; it is a genuine documentation gap, not an undocumentable
  implementation detail. **Worth filing as a docs gap independently of this invariant.**
- **Source:** `vc-module-notification`
  `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notification-templates-list.js`
  (branch `feat/VCST-5557`) — `deleteList(selections)` (:113-150). The guard evaluates
  `_.any(selections, item => !item.languageCode || item.isPredefined)` (:114-116): `!languageCode` is
  the default-language template and `isPredefined` the shipped one. Because it is `_.any` over the
  whole selection and the refusal branch (:118-124) **returns without touching any row**, the
  all-or-nothing behaviour is confirmed structurally. The refusal is a localized error dialog keyed
  `notifications.dialogs.notification-template-delete-notification.title`/`.message` (:120-122), which
  resolves in the shipped locale to *"Unable to delete template"* / *"You cannot delete default or
  predefined templates. Please deselect such templates and try again"*. Only the unprotected path
  (:125-149) reaches the confirm-gated delete.
  Two related observations from the same file, recorded but **not** asserted in the Rule:
  (a) removal on the accepted path is a client-side splice of the in-memory template collection
  (:132-144) with no request issued — persistence is deferred to the parent surface, which is the
  staged-edit shape already covered by `BL-NOTIF-004`;
  (b) the list controller widens `isPredefined` client-side — within a language group containing any
  predefined template, non-predefined siblings are re-flagged predefined (:22-31) — so the guard can
  refuse a template that is not predefined server-side. That widening deserves its own audit before
  anyone writes a case asserting *only* genuinely-predefined templates are protected.
- **Why held:** **UNGROUNDED** on two axes — source is strong and unambiguous, but Docs is absent
  (non-waivable, see above) and Live is absent. A lone surviving axis never canonicalizes.
- **New ID rather than a second clause on `BL-NOTIF-005` — deliberate.** `BL-NOTIF-005` is scoped by
  its own title and Rule to the *predefined* template's edit → override → restore lifecycle. This
  candidate covers a different operation (removal), on a different surface (the templates list, not the
  editor), and — decisively — protects a class `BL-NOTIF-005` does not mention at all: the
  **default-language** template, which need not be predefined. Folding it in would either silently drop
  the default-language half or force `BL-NOTIF-005`'s scope open beyond "predefined", making both rules
  harder to cite precisely. The two should cross-reference instead.
- **Re-audit trigger:** two cheap additions, no order/payment flow needed — (a) **docs**: confirm with
  the docs owner whether the deletion restriction is undocumented by omission (then file the gap and
  treat Docs as a real, satisfiable axis once written) or intentionally unnarrated; (b) **live**: in the
  admin template list, attempt to delete a default-language template alone, then a mixed selection, and
  capture the refusal plus the survival of both rows. With those two, this promotes on all three axes.
- **Triggered by:** NOTIF-076 (new case in 057).

---

## Stale BL-* flagged

None. No existing invariant was contradicted this run — `BL-NOTIF-001/002/003` are order-email
scoped and were untouched, and `BL-UI-001..006` are layout-geometry rules that `BL-UI-007` extends
rather than supersedes.

**Second pass:** likewise none. `BL-NOTIF-001` is *adjacent* to `PROPOSED-BL-NOTIF-010` (it mentions
the activity feed in passing) but is not contradicted by it — it should gain a cross-reference, not an
amendment, if that draft promotes. No existing invariant covers order-paid/order-shipped triggers,
CC/BCC routing, abandoned-cart scheduling, or template-deletion protection, so nothing was superseded.
