# BL Proposals — 2026-07-31

Held drafts from the first real `/qa-review-tests suite 015 --triangulate --fix` run (Dimension 11,
behavioral triangulation against docs + live + source). **Nothing here is applied to the oracle.**

There is no `BL-QUOTE-*` domain in the oracle yet; suite 015 carries `PROPOSED-BL-QUOTE-001..004` as
forward-refs (BLC-002-exempt). These drafts take `005..007`. Reconfirm the whole `BL-QUOTE` block
before promoting any of them.

**Evidence anchors used throughout:**

| Ref | Anchor |
|---|---|
| `[SRC-CONST]` | `vc-module-quote/src/VirtoCommerce.QuoteModule.Core/ModuleConstants.cs` |
| `[SRC-BLADE]` | `vc-module-quote/src/VirtoCommerce.QuoteModule.Web/Scripts/blades/quote-detail.js` |
| `[SRC-VIEW]` | `vc-frontend/client-app/modules/quotes/pages/view-quote.vue` |
| `[SRC-LIST]` | `vc-frontend/client-app/modules/quotes/pages/quotes.vue` |
| `[SRC-MUT]` | `vc-frontend/client-app/modules/quotes/api/graphql/mutations/approveQuoteRequest/…graphql` |
| `[LIVE]` | vcst-qa, Platform `3.1053.0-pr-3093-e27a`, observed 2026-07-31 |
| `[DOC]` | StorefrontUserGuide §Quote Requests |

---

## New BL-* proposed

### PROPOSED-BL-QUOTE-005: The quote status vocabulary is a back-office dictionary, not a code enum `[P1-data]`

- **Rule:** A quote's `status` is a free-text string whose **selectable** set is the
  `Quotes.Status` platform **dictionary**, managed from the back-office at
  *Settings → Quotes → General → Quote statuses* (and reachable from the ✏️ beside Status on any
  quote). It is administrator-editable per deployment, so the selectable set is **environment
  state, not a code constant** — the module's compiled `AllowedValues` is only the seeded default.
  A test may assert a transition, or that a status it relies on is present in the environment's
  dictionary, but must never assert the vocabulary as though code closed it.
- **Verify:** Read the dictionary for the environment under test, then assert every status a case
  relies on is present. Assert a newly submitted quote's initial status separately — it comes from
  `Quotes.DefaultStatus` (`Draft`) and need not be in the dictionary.
- **Violation signal:** A case asserts a literal status absent from the environment's dictionary, so
  the assertion can never pass and reads as a product bug; or a case assumes the dictionary equals
  the module default and breaks where an administrator edited it.
- **Agents:** qa-backend-expert (Admin dictionary blade), qa-frontend-expert (storefront badge)
- **Source:** `[SRC-CONST]` — `class QuoteStatus` = `Draft`, `Processing`, `Cancelled`,
  `Proposal sent`, `Ordered`, `Declined`; the `Quotes.Status` descriptor is `IsDictionary = true`,
  `DefaultValue = "New"`, `AllowedValues = { Draft, "New", Processing, Proposal sent, Ordered,
  Cancelled, Declined }`; `Quotes.DefaultStatus = QuoteStatus.Draft`. `[SRC-BLADE]` — the Status
  dropdown is bound to `settings.getValues({ id: 'Quotes.Status' })`, and
  `openDictionarySettingManagement` opens the platform `settingDictionaryController` for
  `currentEntityId: 'Quotes.Status'`. `[LIVE]` — the dictionary holds exactly six values:
  `Declined`, `New`, `On hold`, `Ordered`, `Processing`, `Proposal sent`; `QuoteType.status` is a
  plain `String` in the deployed schema with no enum constraining it. `[DOC]` — documents `Draft`,
  `Processing`, `Proposal sent`, `Ordered`, `Declined`, `On hold`.
- **The disagreements, precisely:**

  | Status | `[DOC]` | `QuoteStatus` const | `AllowedValues` default | `[LIVE]` dictionary |
  |---|---|---|---|---|
  | `Draft` | ✅ | ✅ (also `DefaultStatus`) | ✅ | ❌ — yet real on existing quotes |
  | `New` | ❌ | ❌ (bare string) | ✅ | ✅ |
  | `Processing` | ✅ | ✅ | ✅ | ✅ |
  | `Proposal sent` | ✅ | ✅ | ✅ | ✅ |
  | `On hold` | ✅ | ❌ | ❌ | ✅ (see DEFECT-2) |
  | `Ordered` | ✅ | ✅ | ✅ | ✅ |
  | `Declined` | ✅ | ✅ | ✅ | ✅ |
  | `Cancelled` | ❌ | ✅ | ✅ | ❌ (see DEFECT-1) |

- **Why held:** CONTRADICTORY. Three axes, three vocabularies. Most of the spread is benign drift
  that `IsDictionary = true` explicitly permits — but two entries are **not** benign and are filed
  as defects below. `Draft` is legitimately absent from the dictionary: it is the buyer's
  pre-submission state, set by `Quotes.DefaultStatus`, and is never something an operator picks.
- **Re-audit trigger:** after DEFECT-1 and DEFECT-2 are resolved, re-read the dictionary and
  `AllowedValues`; the axes should then reconcile and this promotes with the vocabulary stated as
  *dictionary-derived* rather than enumerated.

### PROPOSED-BL-QUOTE-006: Status and hold are two independent mechanisms, and either side can approve `[P1-data]`

**Corrected 2026-07-31** — an earlier draft framed approval as buyer-only and terminal. It is not.

- **Rule:** A quote carries **two independent pieces of state**:
  1. **`status`** — a dictionary string (PROPOSED-BL-QUOTE-005). It is set by *any* of: an operator
     selecting a value and saving (permission `quote:update`), the *Submit proposal* command
     (→ `Proposal sent`), the *Cancel document* command, or the buyer's storefront **Decline**
     (→ `Declined`).
  2. **`isLocked`** — a boolean toggled by *Put on hold* / *Release hold*. **It is not a status.**
- **Approval is available from both sides, and the two are not equivalent:**
  - **Back-office** — an admin or quote manager approves by setting `status` directly in the Status
    dropdown and saving. There is **no dedicated approve command** in the blade toolbar (Save ·
    Reset · Submit proposal · Put/Release on hold · Cancel document · Delete). This path changes
    the status only — **it does not create an order.**
  - **Storefront (buyer)** — **Approve** is offered only while `status === 'Proposal sent'`, calls
    `approveQuoteRequest`, which **returns an `orderId`**, and the app navigates straight to the
    order-details page. This path **is** order creation.
- **Verify:** As the buyer, open a quote in `Proposal sent` → assert exactly two actions, **Approve**
  and **Decline** → Approve → assert navigation to a newly created order's details page. On any
  other status assert no approve/decline action. Separately, as an operator, set `status` to
  `Ordered` and save → assert the status changed and that **no** order was created.
- **Violation signal:** Approve/Decline offered when status is not `Proposal sent`; the buyer's
  approve not producing an order; an operator status-set silently creating an order; a test
  expecting a distinct "convert to order" step after approval.
- **Agents:** qa-frontend-expert (storefront), qa-backend-expert (Admin blade)
- **Source:** `[SRC-VIEW]` — the action block is gated by the single hardcoded comparison
  `v-if="quote.status === 'Proposal sent'"` and holds exactly two buttons, `common.buttons.decline`
  and `common.buttons.approve`; `approve()` awaits `approveItem(...)` then
  `router.push({ name: "OrderDetails", params: { orderId: result.orderId } })`. `[SRC-MUT]` —
  `approveQuoteRequest(command:) { id orderId }`. `[SRC-BLADE]` — toolbar command list as above;
  `blade.updatePermission = 'quote:update'`; `submit-proposal` sets
  `status = 'Proposal sent'`. `edit-quote.vue` `onMounted` redirects to `ViewQuote` unless status is
  `Draft`, so buyer editing is Draft-only. `[DOC]` — "Approve or decline quote request";
  "**Ordered** — You have accepted the seller's proposal, ordering the goods at the proposed
  prices." `[LIVE]` — a `Processing` quote's storefront detail page renders **no** action buttons,
  exactly as the gate predicts.
- **Label drift:** the real buttons are **"Approve" / "Decline"**. Suite 015 asserts
  `'Accept Quote'`, `'Reject Quote'` and `'Convert to Order'` — none exist.
- **Consequence for suite 015 — a human decision, not a rewrite:** QUOTE-006 ("Accept Quote"),
  QUOTE-007 ("Convert Quote to Order") and QUOTE-030 encode a two-step *accept → convert* flow with
  an intermediate `'Accepted'` and terminal `'Closed'`. Neither value exists in any axis, and the
  flow itself does not exist. Swapping literals would leave three cases testing a fiction. The
  honest options are **merge QUOTE-006+007 into one "Approve proposal → order created" case** and
  **retire or re-scope QUOTE-030**. Neither is a `--fix` action.
- **Residual gap:** the *positive* live case is unobserved — no quote in `Proposal sent` exists for
  the available test users, so the Approve/Decline buttons were never seen rendered. The template is
  unambiguous, but seeding that fixture would close it properly.

### PROPOSED-BL-QUOTE-007: Quote expiry is a date, and approval is not gated on it `[P1-ux]`

- **Rule (candidate):** Expiry is expressed by the quote's `Expiry date`
  (`QuoteType.expirationDate`), never by a status — there is no `Expired` status. **The storefront
  does not gate approval on expiry:** the only condition on Approve/Decline is
  `status === 'Proposal sent'`, so an expired quote still in `Proposal sent` still renders both.
- **Source:** `[SRC-VIEW]` — no reference to `expirationDate` and no expiry condition anywhere in
  the action gate. `[SRC-CONST]` — no `QuoteStatus.Expired`. `[LIVE]` — the Admin blade exposes an
  `Expiry date` field and `QuoteType.expirationDate` is in the deployed schema; the dictionary has
  no `Expired`. `[DOC]` — no `Expired` row.
- **Why held:** A candidate product gap, not just a test defect. Suite 015 QUOTE-022 asserts an
  expired quote cannot be accepted and shows an `'Expired'` badge — the badge cannot render, and the
  storefront appears to offer Approve regardless. Whether the **backend** rejects
  `approveQuoteRequest` on an expired quote is **unverified**; if it does, the gap is only the
  missing UI affordance, and if it does not, expiry is unenforced end-to-end.
- **Re-audit trigger:** seed a quote in `Proposal sent` with a **past** `Expiry date`, then (a)
  observe whether Approve renders and (b) click it and record whether the mutation succeeds. That
  one fixture settles this draft *and* the residual gap in PROPOSED-BL-QUOTE-006.

---

## Candidate product defects (recommend tracker tickets, not oracle entries)

### DEFECT-1 — *Cancel document* writes `'Canceled'`; the constant is `'Cancelled'` `[P1-data]`

`[SRC-BLADE]` — the Cancel document command sets the status with a **one-L** spelling:

```js
blade.currentEntity.cancelReason = reason;
blade.currentEntity.isCancelled = true;
blade.currentEntity.status = 'Canceled';   // one L
```

while `[SRC-CONST]` defines `public const string Cancelled = "Cancelled";` — **two Ls**. The
back-office therefore persists a status string that matches **no** constant, and `[LIVE]` shows
**neither** spelling in the dictionary.

**Impact:** a cancelled quote lands on an out-of-vocabulary status. Any consumer comparing against
`QuoteStatus.Cancelled` (server-side filters, reporting, notification triggers) silently misses
cancelled quotes, and the storefront renders the raw string — `QuoteType.status` is a plain `String`
with no i18n mapping, so whatever is stored is what the buyer sees. Because `isCancelled` is set
independently, the boolean and the status disagree in a way nothing validates.

**Suggested fix:** use `QuoteStatus.Cancelled` in the blade rather than a literal, and decide whether
`Cancelled` belongs in the seeded dictionary. **Not auto-fixable from this repo** — it is a change in
`vc-module-quote`.

### DEFECT-2 — `On hold` is a dictionary status, but *Put on hold* toggles a boolean `[P1-ux]`

`[SRC-BLADE]` — `onHoldCommand.executeMethod` flips `blade.currentEntity.isLocked` and saves. It
**never touches `status`**. Yet `[LIVE]` carries `On hold` as a manually selectable dictionary value,
and `[DOC]` documents it as a status ("The seller has put the proposal on hold"). `[SRC-CONST]` has
no `OnHold` constant and does not list it in `AllowedValues`.

**Impact:** two representations of the same idea that cannot be kept consistent. A quote put on hold
via the command is `isLocked = true` with an unchanged status; a quote whose status was set to
`On hold` by hand is not locked. Docs describe a status the code never sets. A test asserting either
one is right only by coincidence — and the storefront's approve gate reads **`status`**, so a
genuinely locked quote in `Proposal sent` still shows Approve to the buyer.

**Suggested fix:** pick one mechanism. Either have the command set `status = 'On hold'` (and add the
constant), or drop `On hold` from the dictionary and surface the lock separately in the UI. Also
worth noting: `submit-proposal`'s guard is only `status !== 'Proposal sent'`, so it can be fired from
`Ordered` or `Declined`.

---

## Two storefront test defects from the same pass (suite 015, not applied)

Both are Dim-11 DRIFT candidates that need a decision about what to assert, not a literal swap:

1. **The quotes list has no item-count column.** `[SRC-LIST]` defines exactly four columns —
   `number`, `createdDate`, `status`, `total` (confirmed `[LIVE]`: *Quote number · Date · Status ·
   Total*). QUOTE-002 asserts `[DOM] item count on row matches number of cart items submitted`,
   targeting a column that does not exist. Drop it, or move it to the detail page where line items
   *are* listed.
2. **A `Draft` quote opens an editor, not a viewer.** `[SRC-LIST]` `goToQuoteDetails` routes `Draft`
   → `EditQuote` and everything else → `ViewQuote`, and row activation opens a **new tab** when the
   browser-target setting is `BLANK`. Cases assuming one detail page for all statuses, or same-tab
   navigation, will drift.

---

## What the same run *did* apply to suite 015

For the record, so this file is not read as the whole outcome: **4 CONFIRMED** stamp-only rows
(`'Processing'`, agreeing across all three axes) and **9 literal DRIFT rewrites across 3 cases**
where the asserted string is absent from every axis and the replacement is unambiguous from `[DOC]`:
`'Quote Received'` → `'Proposal sent'` (QUOTE-004/005/008) and `'Rejected'` → `'Declined'`
(QUOTE-008).

Two boundaries the run deliberately respected:

1. **Do not enumerate the dictionary in a case** — per PROPOSED-BL-QUOTE-005 it is per-environment,
   so asserting its contents would be a fresh DV-016 violation even though every value is currently
   correct.
2. **Button labels were not touched** — `'Accept Quote'` etc. are i18n'd and no evidence for their
   rendered values was found beyond the `error.approve` / `error.decline` keys, so rewriting them
   would be a GRD-002 invented literal.
