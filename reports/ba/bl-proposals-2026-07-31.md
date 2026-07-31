# BL Proposals — 2026-07-31

Held draft from the first real `/qa-review-tests suite 015 --triangulate` run (Dimension 11,
behavioral triangulation). **Not applied to the oracle.** The item below is **CONTRADICTORY** —
the three axes disagree with each other, so it fails the applicable-axes bar by definition and a
human must decide which axis is authoritative.

There is no `BL-QUOTE-*` domain in the oracle yet; suite 015 carries `PROPOSED-BL-QUOTE-001..004`
as forward-refs (BLC-002-exempt). This draft takes the next free number, `005`. Reconfirm the
whole `BL-QUOTE` block before promoting any of them.

---

## New BL-* proposed

### PROPOSED-BL-QUOTE-005: The quote status vocabulary is the store's editable dictionary, not a code enum `[P1-data]`

- **Rule:** A quote's `status` is a free-text string validated against the **`Quotes.Status`
  platform dictionary setting**, not a compiled enum. The dictionary is administrator-editable per
  deployment, so the set of selectable statuses is environment state, not a code constant. Two
  statuses exist outside the dictionary and are **system-set only** — never operator-selectable:
  the initial status (`Quotes.DefaultStatus`) and the status applied by the *Cancel document*
  action. Consequently a test may assert a **transition** or the **presence of a status in the
  dictionary**, but must never assert a hardcoded status vocabulary as if it were closed by code.
- **Verify:** Read the `Quotes.Status` dictionary for the environment under test (Admin → Quotes →
  open a quote → Status ✏️ "Quote statuses"), then assert every status a case relies on is present
  in that dictionary. Assert the initial status of a newly submitted quote separately, since it is
  set by `Quotes.DefaultStatus` and need not appear in the dictionary.
- **Violation signal:** A case asserts a literal status string that is absent from the environment's
  dictionary and therefore can never render (the assertion fails forever and reads as a product
  bug); or a case assumes the dictionary equals the module's `AllowedValues` default and breaks on
  a deployment where an administrator edited it.
- **Agents:** qa-backend-expert (Admin SPA dictionary blade), qa-frontend-expert (storefront badge)
- **Source:** **All three axes collected, and they disagree** —
  - *Source:* `vc-module-quote/src/VirtoCommerce.QuoteModule.Core/ModuleConstants.cs` →
    `class QuoteStatus` = `Draft`, `Processing`, `Cancelled`, `Proposal sent`, `Ordered`, `Declined`;
    the `Quotes.Status` descriptor is `IsDictionary = true`, `DefaultValue = "New"`, with
    `AllowedValues = { Draft, "New", Processing, Proposal sent, Ordered, Cancelled, Declined }`, and
    `Quotes.DefaultStatus = QuoteStatus.Draft`.
  - *Live:* the environment's "Quote statuses" dictionary holds exactly six values —
    `Declined`, `New`, `On hold`, `Ordered`, `Processing`, `Proposal sent`. The quote detail
    toolbar exposes *Submit proposal*, *Put on hold*, *Cancel document*; expiry is an
    **`Expiry date`** field (`QuoteType.expirationDate`), not a status. `QuoteType.status` is a
    plain `String` in the deployed schema — no enum constrains it.
  - *Docs:* StorefrontUserGuide §Quote Requests documents `Draft`, `Processing`, `Proposal sent`,
    `Ordered`, `Declined`, `On hold`.
- **The disagreements, precisely:**

  | Status | Docs | Source `QuoteStatus` | Source `AllowedValues` | Live dictionary |
  |---|---|---|---|---|
  | `Draft` | ✅ | ✅ (also `DefaultStatus`) | ✅ | ❌ **absent** — yet real on existing quotes |
  | `New` | ❌ | ❌ (bare string, no const) | ✅ | ✅ |
  | `Processing` | ✅ | ✅ | ✅ | ✅ |
  | `Proposal sent` | ✅ | ✅ | ✅ | ✅ |
  | `On hold` | ✅ | ❌ **no constant** | ❌ **absent** | ✅ (and a *Put on hold* action exists) |
  | `Ordered` | ✅ | ✅ | ✅ | ✅ |
  | `Declined` | ✅ | ✅ | ✅ | ✅ |
  | `Cancelled` | ❌ | ✅ | ✅ | ❌ **absent** — yet a *Cancel document* action exists |

- **Why held:** CONTRADICTORY. Three axes, three different vocabularies. The likeliest reading is
  that the dictionary is simply environment state that has drifted from the module default (which
  is exactly what `IsDictionary = true` permits), and that `Draft`/`Cancelled` are deliberately
  system-set rather than selectable. But that reading is a **hypothesis**, and one of the
  disagreements looks like a genuine product gap rather than benign drift: **`On hold` has no
  `QuoteStatus` constant and is not in `AllowedValues`, yet the UI ships a *Put on hold* action and
  the docs describe the status.** A human should confirm whether that is an unshipped constant, a
  seeded-dictionary-only value, or a doc that describes a value the module never defined.
- **Re-audit trigger:** (1) determine what status the *Put on hold* and *Cancel document* commands
  actually persist — read the module's command handlers, no browser needed; (2) confirm whether
  `Draft` is excluded from the dictionary by design (customer-owned pre-submission state) or by
  omission; (3) re-read `AllowedValues` after (1) to see whether `On hold` should be added there.
  Once those are settled the axes should reconcile and this promotes with the vocabulary stated as
  *dictionary-derived* rather than enumerated.
- **Triggered by:** `/qa-review-tests suite 015 --triangulate --fix` (2026-07-31). The same run
  applied **9 literal DRIFT rewrites across 3 cases** where the asserted string is absent from
  *all three* axes and the correct value is unambiguous: `'Quote Received'` → `'Proposal sent'`
  (QUOTE-004/005/008) and `'Rejected'` → `'Declined'` (QUOTE-008). Four further cases were
  **stamp-only CONFIRMED** (`'Processing'`, QUOTE-001/002/003/015). The remaining five cases are
  the two drafts below — they were **not** rewritten.

### PROPOSED-BL-QUOTE-006: Approving a proposal *is* ordering — there is no intermediate accepted state `[P1-data]`

- **Rule (candidate):** The buyer-side proposal decision is binary and terminal: from
  `Proposal sent`, approving transitions the quote directly to `Ordered` (the goods are ordered at
  the proposed prices) and declining transitions it to `Declined`. There is **no** intermediate
  "accepted-but-not-yet-ordered" state and **no** separate terminal "closed" state, so there is no
  two-step *accept → convert to order* flow.
- **Source:** *Docs* — StorefrontUserGuide §Quote Requests: "**Ordered** — You have accepted the
  seller's proposal, ordering the goods at the proposed prices"; the section is titled "Approve or
  decline quote request". *Source* — `QuoteStatus` has no `Accepted` and no `Closed` constant;
  `vc-frontend/client-app/modules/quotes/locales/en.json` exposes only
  `quote_details.error.approve` / `error.decline`. *Live* — the dictionary has neither value.
- **Why held:** CONTRADICTORY / structural, **not** a literal swap. Suite 015 QUOTE-006
  ("Accept Quote"), QUOTE-007 ("Convert Quote to Order") and QUOTE-030 encode a two-step model with
  an intermediate `'Accepted'` status and a terminal `'Ordered' or 'Closed'` disjunction. Neither
  `Accepted` nor `Closed` exists in any axis — but replacing the strings would leave three cases
  testing a *flow* that does not exist, which is worse than leaving them visibly wrong. Whether the
  storefront really presents one "approve" action or two is a **product-model question** a human
  must settle; it also decides whether those three cases should be rewritten, merged, or retired.
- **Re-audit trigger:** observe the storefront quote-detail page for a quote in `Proposal sent` as a
  B2B buyer and enumerate the available actions (this run's live axis covered **Admin only** — the
  status dictionary — not the storefront). If there is a single approve action, QUOTE-006/007/030
  collapse into one case.

### PROPOSED-BL-QUOTE-007: Quote expiry is a date, not a status `[P1-ux]`

- **Rule (candidate):** Expiry is expressed by the quote's `Expiry date` field
  (`QuoteType.expirationDate`), not by a status value. A past expiry date may gate the approve
  action, but the quote's `status` remains whatever the dictionary holds — it never becomes
  `Expired`.
- **Source:** *Live* — the quote detail blade exposes an **`Expiry date`** field and
  `QuoteType.expirationDate` exists in the deployed schema; the dictionary has no `Expired`.
  *Source* — no `QuoteStatus.Expired` constant. *Docs* — the status table has no `Expired` row.
- **Why held:** UNGROUNDED for the behavior, not the vocabulary. All three axes agree there is no
  `Expired` **status**, so suite 015 QUOTE-022/023 assert a badge that cannot render. But whether
  the *gating* they test (an expired quote cannot be approved) exists at all was **not** verified —
  it needs a storefront observation with an expired fixture. Rewriting the assertion to target the
  date field would silently change what the cases test, so they were left untouched.
- **Re-audit trigger:** seed a quote with a past `Expiry date` in `Proposal sent`, then observe the
  storefront detail page: is the approve action absent/disabled, and what does the badge show?

---

## Note for `/qa-review-tests`

The 9 applied rewrites are safe because the asserted strings appear in **no** axis *and* the
replacement is unambiguous from the docs' own status descriptions. The `'Processing'` assertions are
confirmed by all three axes and were stamped, not changed.

Two boundaries this run deliberately respected:

1. **Do not enumerate the dictionary in a case.** Per PROPOSED-BL-QUOTE-005 the vocabulary is
   per-environment, so a case asserting its full contents would be a new DV-016 violation even
   though every current value is correct.
2. **Button labels were not touched.** `'Accept Quote'`, `'Reject Quote'`, `'Convert to Order'` are
   i18n'd strings and this run found no evidence for their rendered values (only the
   `error.approve` / `error.decline` keys). Rewriting them would be a GRD-002 invented literal.
