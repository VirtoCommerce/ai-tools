# Bug-draft backlog audit — 2026-08-25

**Scope:** `reports/bugs/` · **open 76 · fixed 34 · closed 3 · rejected 10**

Prompted by four near-duplicate bug reports nearly created in a single session. Every time, a tracker search returned clean while a local draft already covered the defect.

> **Partial audit.** The deterministic inventory below is complete. The per-draft classification (`FILE` / `STALE` / `LIKELY-FIXED` / `DUPLICATE` / `NOT-A-BUG`) was **not** produced — the agent assigned to it terminated on an account spend limit. That half remains outstanding.

## The actual gap is 33 drafts, not 76

> **Superseded — the real figure is 63.** See the CORRECTION section below: "carries a
> VCST key" was read as "is filed", but 18 of those 43 drafts cite only the Story/Task under test.

| | Count |
|---|---:|
| Open drafts | 76 |
| **Carry a `VCST-` key** | **43** |
| **Carry no key at all** | **33** ← invisible to any tracker-based duplicate check |
| Missing an `Env:` stamp | 1 |

This corrects the framing used earlier in the session ("almost none is filed"). Most drafts *are* traceable. The recurring failure is concentrated in the 33 that are not — and that is a far cheaper problem to fix than filing 76 tickets.

## Staleness: 73 of 76 predate the live build

Live platform at audit time: **`3.1061.0`**.

| Build stamp | Drafts |
|---|---:|
| `3.1043.0` | 15 |
| `3.1051.0` | 14 |
| other / unparsed | 14 |
| `3.1053.0` | 10 |
| `3.1041.0` | 3 |
| **`3.1061.0` (live)** | **3** |
| `3.1037.0` · `3.1035.0` · `3.1032.0` · `3.1057.0` · `3.1001.0` | 2 each |
| `3.1058.0` · `3.1055.0` · `3.1048.0` · `3.1026.0` · `3.1020.0` · `3.1000.0` | 1 each |
| none | 1 |

**Only 3 drafts are stamped against the running build.** A draft stamped `3.1001.0` has spanned ~60 platform releases. None of these can be acted on without re-verification, and re-verifying 73 drafts costs more than most of them are worth — which is the argument against a blanket "file them all".

Today demonstrated both directions: `BUG-platform-search-no-max-page-size` was re-verified and had **degraded** (200-after-55s → 502-after-63s), while `BUG-oos-unavailability-text-title-attribute-only` had degraded differently than recorded (the `title` carrier is now absent entirely). A stale draft is not merely old — it can be *wrong in a way that misleads*.

## Severity

| Severity | Drafts |
|---|---:|
| **unparsed / absent** | **29** |
| P1 | 17 |
| P2 | 13 |
| P3 | 7 |
| P0 | 5 |
| Medium / High / Low (non-P scale) | 5 |

29 drafts — **38%** — carry no severity a script can read, and 5 use a different scale. So the backlog cannot currently be ranked automatically, which is part of why it is never worked.

## Freshly verified today (6)

These are current, re-confirmed against `3.1061.0`, and are the only drafts that need no re-verification before action:

- `BUG-price-retention-guard-bypassed-by-bulk-delete.md` — **new**, P1
- `BUG-cart-coupon-rest-endpoint-silent-noop.md` — **new**, P1
- `BUG-non-usd-price-zero-display.md` — route settled to `vc-frontend`
- `BUG-platform-rest-validation-failures-leak-raw-sql-errors.md` — new manifestation appended
- `BUG-catalog-search-unvalidated-pagination-leaks-es-index-name.md` — re-confirmed
- `BUG-platform-search-no-max-page-size.md` — re-confirmed, **degraded**

## Recommendation

**Do not file 76 tickets.** 73 need re-verification first, 29 cannot be ranked, and the duplicate risk is concentrated in a knowable subset.

Three changes, cheapest first:

1. **Enforce the duplicate check that already exists — and widen it.** `/qa-bug` step 3 *already* prescribes scanning `reports/bugs/open/` and `reports/bugs/fixed/`. So the four near-duplicates were a **compliance** failure, not a missing rule, and adding another prose instruction would change nothing. Two concrete changes instead: (a) widen the scan to `closed/` and `rejected/` (13 more files — a defect closed as won't-fix is exactly the kind that gets re-reported); (b) make it *mechanical* rather than a prose step, e.g. a `bugs:dupecheck <title-or-component>` script that greps all four directories and must be run before a draft is written. A prose instruction in a long command file is the weakest possible enforcement, which is precisely how it was missed four times in one session.
2. **Require a severity and an `Env:` build stamp** in a draft — enforceable by a lint over `reports/bugs/**`, in the same spirit as `T-005`. That makes the backlog rankable and makes staleness visible without opening files.
3. **File the 33 keyless drafts only after triage**, not in bulk. The 6 verified-today drafts are ready now; the 2 new P1s are the strongest candidates.

**On the 43 that do carry keys:** they are not the duplicate risk, but their tracker state was not checked here. Some are likely Done, which would make them `LIKELY-FIXED` and movable out of `open/`. That is a cheap follow-up query and would shrink the backlog without any filing decision.

## Outstanding

Per-draft classification and duplicate-cluster identification: **done** — see the CORRECTION and
duplicate-cluster sections below. What remains is a per-draft STALE-vs-still-valid call on the **45**
unfiled drafts that predate the live build. That is a re-verification cost, not a reading cost: each
needs a live re-check, and today showed the outcome can go either way — one draft had *degraded*
(200-after-55s becoming 502-after-63s) and another had degraded differently than recorded. A stale
draft is not merely old; it can be wrong in a way that misleads.

## CORRECTION (2026-08-25, later same day) — the gap is 63, not 33

The "43 carry a `VCST-` key" figure above is right but **misleading**, and the conclusion drawn from
it was wrong. Carrying a key is not the same as *being filed*: most of those 43 mention the **Story or
Task under test** (`VCST-5281`, `VCST-5412`, `VCST-5239`, `VCST-5367`…) or a *related* bug — not the
draft's own tracker item.

Re-derived by matching only an explicit self-filing marker (`filed as …`, `**JIRA:** …`, `## JIRA: …`,
`CONSOLIDATED → …`) and then querying all 45 distinct keys:

| Bucket | Drafts | Meaning |
|---|---:|---|
| **UNFILED** | **63** | no own tracker item — the real duplicate-risk surface |
| LIKELY-FIXED | 7 | own item is **Done** |
| FILED-OPEN | 6 | own item is open — correctly placed, leave alone |
| REJECTED-UPSTREAM | 2 | own item is **Cancelled** |

**18 of the 43 "keyed" drafts carry only a Story/Task key** — i.e. they are unfiled and were counted as
filed. That is what nearly doubled the gap.

### LIKELY-FIXED — own item Done (7)

`VCST-5533` cart-coupons-a11y · `VCST-5518` coupon-invalid-replacement **and** invalid-coupon-removes-valid
(the latter marked `CONSOLIDATED →`, so the two are one defect) · `VCST-5623` platform-login-500 ·
`VCST-5684` de-avg-order-value · `VCST-5682` global-error-toast · `VCST-5683` orders-count-pluralization.

**Not moved.** A Done tracker item is not a verification: `.claude/rules/reports.md` makes the
`open/` → `fixed/` move conditional on a **VERIFIED** verdict plus a `## Resolution` block, which is
`/qa-verify-fix`'s output. Moving on status alone would record an unverified claim as verified. These
are the queue for `/qa-verify-fix`, nothing more.

### REJECTED-UPSTREAM — own item Cancelled (2)

`VCST-5612` fullscreen-hides-invalid-json · `VCST-5606` predefined-no-overwrite-warning. **Cancelled is
not fixed** — it is won't-fix / cannot-reproduce, so these belong in `rejected/`, not `fixed/`. Also a
human call, and worth a glance: one of them was re-scoped mid-flight, so the draft may describe
something narrower than what was cancelled.

### What this changes

Recommendation 3 above ("file the 33 keyless drafts only after triage") should read **63**. The other
two recommendations stand unchanged, and recommendation 1 (make the duplicate check mechanical) gets
*stronger*: the manual heuristic "does it mention a VCST key?" mislabelled 18 drafts as filed, which is
precisely the failure a `bugs:dupecheck` script would not make.

## Duplicate clusters among the 63 unfiled (closes the Outstanding item)

Pairwise term overlap across filename + title, weighted to rare terms, then **read** the top
candidates — the scoring alone produces mostly noise (`order,place`, `server,error`) and is not
evidence of anything on its own.

### MERGE — one defect, two viewpoints

`BUG-AN-cart-card-number-no-luhn-ghost-order` **+** `BUG-authorizenet-placeorder-enabled-invalid-card`

One root cause: no client-side Luhn validation on the Authorize.Net inline cart form. The first draft
records the downstream consequence (a **ghost unpaid order**), the second the immediate symptom (no
inline error, Place Order stays enabled). They also **disagree on severity for the same root cause** —
`Low` + "by-design candidate" vs `P1`. Filed separately, a triager gets two tickets for one fix and one
of them argues itself down to Low. **Merge as P1**: the ghost order is the real impact, and a
"by-design" reading is hard to sustain once it produces an unpaid order.

### DO NOT MERGE — deliberately split, despite scoring as similar

`BUG-cart-accepts-negative-quantity` **+** `BUG-cart-accepts-non-pack-multiple-quantity`

Both are xAPI quantity-validation gaps on `changeCartItemQuantity` at the same build, so they score as
near-duplicates — but the first draft states it was *"split from the former combined CART-036 into
CART-036/CART-065/CART-066 (one invalid-input class each)"*. They cite different invariants
(`BL-CART-001` vs `BL-CART-006`) and back different cases. Merging would undo deliberate work.

### FILE TOGETHER, not merge — one surface, three distinct defects

The three `BUG-SalesRep-Layout-*` drafts (keyboard grab dropped by pointer · parked-zone hint contrast ·
touch-drag affordance) are separate a11y defects on the **same VCST-5367 drag-drop surface**. Distinct
fixes, but they share a repro setup and a reviewer — worth one batch, not three unrelated tickets.

## Staleness and rankability of the 63

| Build stamp | Drafts |
|---|---:|
| predates live `3.1061.0` | 45 |
| **at live `3.1061.0`** | **5** |
| unparsed / absent | 13 |

**21 of 63 carry no severity a script can read** (33%). Combined with 13 missing a usable build stamp,
roughly a third of the unfiled backlog cannot be ranked or aged without opening the file — which is the
concrete case for the lint proposed in recommendation 2.

---

# Triage pass 2026-08-26 — closes the "which are already fixed?" question

Live build **unchanged at `3.1061.0`**, so yesterday's staleness table still holds. Two things were added:
a **tracker re-query with issue types** (yesterday's pass had summaries only), and **live re-verification of
every draft reachable without a browser**.

## Correction to yesterday's own-item matching

Yesterday's LIKELY-FIXED list was derived from an explicit self-filing marker. With `issuetype` now in hand,
the picture is tighter: of the 45 cited keys, **21 are Story/Task** (the item *under test*, never the draft's
own bug) and 24 are Bugs. Matching each draft's Bug-type key against the issue summary gives:

| Bucket | Drafts | Change vs yesterday |
|---|---:|---|
| Own item **Done** | 8 | +1 — `VCST-5688` went Done on 2026-08-25, after the audit ran |
| Own item **Cancelled** | 3 | +1 — `VCST-5609` (file-upload wiring) also Cancelled |
| Own item open (`To do`/`Draft`/`REFINEMENT`) | 7 | — |
| No own item (unfiled) | 57 | 63 − 2 resolved − 4 reclassified as filed |

Several Done keys are **decoys**: `VCST-5618`, `VCST-5554`, `VCST-5111` and `VCST-5586` each appear in 2–5
drafts as *referenced context*, not as the draft's own item. Matching on "cites a Done Bug key" would have
wrongly closed 5 drafts. This is the same trap as yesterday's Story-key mislabel, one level down.

## Live re-verification (7 drafts, API-level, no browser)

| Draft | Verdict |
|---|---|
| `BUG-platform-security-login-500-on-null-credentials-VCST-5623` | ✅ **FIXED** → moved to `fixed/` |
| `BUG-xapi-seoinfo-id-objecttype-invalid-operation-nulls-product` | ✅ **FIXED** → moved to `fixed/` |
| `BUG-platform-rest-soft-404s-instead-of-real-404` | ❌ still reproduces, unchanged |
| `BUG-catalog-search-unvalidated-pagination-leaks-es-index-name` | ❌ still reproduces, unchanged |
| `BUG-platform-rest-validation-failures-leak-raw-sql-errors` | ❌ still reproduces + **new manifestation** |
| `BUG-org-membership-create-no-input-validation-VCST-5028` | ❌ still reproduces and **is worse** |
| `BUG-cart-accepts-negative-quantity` | ❌ still reproduces (anonymous-cart path) |

**Hit rate: 2 of 7.** Extrapolating, roughly a quarter to a third of the stale backlog is probably dead —
which is the argument for re-verifying before filing, and against both "file them all" and "they're all rotten".

### The two fixed ones

- **`VCST-5623` login-500** — `POST /api/platform/security/login` now returns `400` for null / missing /
  partial credentials (was `500`). Tracker was already Done; live now agrees.
- **`seoInfo.id`/`objectId`/`objectType`** — fixed incidentally by `XCatalog 3.1016.0-pr` → **`3.1018.0`**.
  **Never had a tracker item and now needs none.** Suite case `CAT-GQL-113` (`050a-graphql-xcatalog.csv`)
  was red on this and should now pass — re-run it to confirm the *case* isn't also stale.

### The one that got worse

`org-membership-create-no-input-validation` (`VCST-5314`, still **Draft** in the tracker) does not merely
accept `userId:""` with a `200` — the row it creates is **undeletable**: `DELETE …?ids=<id>` fails with
`500 "The value cannot be an empty string. (Parameter 'subject')"`. Empty-string passes the create guard and
trips the delete guard, so invalid rows are permanent. That is data corruption, not a lax status code, and it
argues the draft is under-severitied.

> **Env note — 2 junk rows on vcst-qa.** A scoped search `{userIds:[""]}` returns `totalCount: 2`:
> `f53d111ca6994c8a92b4362fe6ed0f8f` (pre-existing, presumably from the original 2026-06 investigation) and
> `26e1bf58-5bdc-4fdc-961a-36aa243e1f4b` (**created by this re-verification**). Both are undeletable via the
> API and remain on the environment; clearing them needs a DB-level or platform-side fix.

## What is left, and what it costs

`open/` is now **75**. The remaining work splits three ways, cheapest first:

1. **8 drafts whose tracker item is Done** → the `/qa-verify-fix` queue. A Done status is *not* a verification
   (yesterday's audit is right about this, and today's 2-of-7 hit rate shows why). Six of the eight are UI-level
   (Sales Rep widgets, cart-coupons a11y, vc-shell toast) and need a browser lane.
2. **3 drafts whose item is Cancelled** (`VCST-5606`, `VCST-5612`, `VCST-5609`) → belong in `rejected/`, not
   `fixed/`. Left in place: cancelled-vs-fixed is a human call, and one of the three was re-scoped mid-flight.
3. **~50 unfiled drafts with no browser-free repro** → the expensive tail. Batch them by surface (cart, org/B2B,
   Sales Rep, a11y, admin SPA) so one browser session re-verifies a whole cluster, rather than one draft at a time.

---

# Tier 1 worked 2026-08-26 — the 8 tracker-Done drafts

All eight re-verified. **7 confirmed fixed and moved to `fixed/`; 1 was only partially fixed and stays open, narrowed.**
`open/` is now **69** (was 77 at the start of this triage).

| Draft | Own item | Verdict | Axis |
|---|---|---|---|
| `platform-security-login-500-on-null-credentials` | VCST-5623 | ✅ fixed → `fixed/` | live REST |
| `coupon-invalid-replacement-drops-working-coupon` | VCST-5518 | ✅ fixed → `fixed/` | source + **live UI + network** |
| `invalid-coupon-removes-valid-coupon` | VCST-5518 | ✅ fixed → `fixed/` | same defect, same run |
| `SalesRep-my-customers-orders-count-no-pluralization` | VCST-5683 | ✅ fixed → `fixed/` | source, all 13 locales |
| `SalesRep-de-avg-order-value-subtitle-ytd-untranslated` | VCST-5684 | ✅ fixed → `fixed/` | source, all 13 locales |
| `SalesRep-global-error-toast-on-single-widget-failure` | VCST-5682 | ✅ fixed → `fixed/` | **already human-verified in-tracker**, 2 rounds |
| `vc-shell-session-expiry-toast-buried-by-parse-errors` | VCST-5688 | ✅ fixed → `fixed/` | source (fix cites the ticket) |
| `cart-coupons-a11y-wcag22` | VCST-5533 | ⚠️ **3 of 4 findings fixed** — stays open | live UI + measured contrast |

## The one that a status check would have got wrong

`VCST-5533` is **Done**, and three of its four findings genuinely are. But finding 4 (2.4.7 Focus Visible) is not:
the focus outline was re-tinted brown → red while staying low-alpha, so it moved from **1.46–1.68:1 to 1.93:1** — still
short of the **3:1** gate, and the preset Apply buttons did not move at all (1.68:1). Moving this draft to `fixed/` on
tracker status alone would have recorded a live WCAG failure as resolved.

This is the concrete vindication of yesterday's rule that a Done status is not a verification — and the reason the
remaining Done-status drafts were each checked rather than swept.

## Method note — source is often the right axis, and cheaper

Five of the eight were settled from source rather than a browser, because for those the **defect and the fix are the same
artifact**: a locale string's plural forms, a translated subtitle, the call ordering inside `applyCoupon()`, the
short-circuit in the vc-shell interceptor. Three of those fixes **cite their ticket number in a code comment**
(`VCST-5518`, `VCST-5688`), which is about as direct as provenance gets. Live checks were spent where behaviour, not
text, was the question — the coupon flow (UI *and* network) and the a11y measurements.

Two useful specifics for anyone re-testing this area:

- **The coupon error auto-clears after `COUPON_ERROR_TIMEOUT = 7000` ms**, taking `aria-invalid`/`aria-describedby` with
  it. Measure within 7 s of the failed apply or both read `null` and the fixed bug looks unfixed.
- **A previously-tried invalid code short-circuits client-side** — no `ValidateCoupon` is sent the second time. Use a
  fresh code per attempt or the network evidence is empty.

## Remaining backlog

| Bucket | Drafts | Next step |
|---|---:|---|
| Cancelled tracker item | 3 (`VCST-5606`, `VCST-5612`, `VCST-5609`) | move to `rejected/` — human call |
| Open tracker item | 7 | correctly placed, leave |
| `cart-coupons-a11y-wcag22` | 1 | narrowed to finding 4 — a focus-outline alpha fix |
| Unfiled, no browser-free repro | ~50 | the expensive tail — batch by surface (cart / org-B2B / Sales Rep / a11y / admin SPA) |

Running total across both triage days: **9 drafts closed** (`open/` 77 → 69), 1 narrowed, 5 re-confirmed still-valid,
1 found materially worse than recorded.

---

# Batch A worked 2026-08-26 — API/GraphQL + Org/B2B API-level

Six drafts touched. **None was fixed** — but two were materially corrected, one is blocked, and the batch
surfaced a defect in *this repo's own tooling* that was actively locking a shared fixture out.

| Draft | Verdict |
|---|---|
| `xapi-telemetry-graphql-errors-as-500` | ❌ still reproduces — hardcode unchanged in source |
| `backend-provisioned-membership-not-linked-to-contact-organizations` | ❌ still reproduces — re-run end-to-end |
| `org-switcher-search-returns-nonmatching-orgs` | ⚠️ symptom stands, **root cause was wrong** — corrected |
| `graphql-changeorganizationcontactrole-forbidden` | ⛔ **BLOCKED** — fixture unavailable |
| `graphql-revokeorganizationinvite-resolver-fault` | ⛔ **BLOCKED** — same fixture |

## The correction worth reading

`org-switcher-search-returns-nonmatching-orgs` blamed the frontend for quote-wrapping `searchPhrase`. The
wrapping is still there on `dev` — and a backend A/B proves it changes **nothing** (`ACM` and `"ACM"` return
byte-identical results). Filtering is not broken either: `ZZZQQQNOMATCH` → 0, `TechFlow` → 1.

The real mechanism: all 8 "unrelated" orgs match on **`description`** (`ACME Lone Star Outfitters`,
`ACME Redwood Provisions`, …), a field the switcher never renders. The backend is behaving correctly; the UI
just hides *why* a row matched. So the fix is a product call — scope the search to `name`, or show the matched
description — **not** deleting the two quote-wrapping lines the draft points at.

Also worth knowing before anyone prioritises it: all 8 belong to one special-character org-name fixture family
whose descriptions were seeded as `ACME <name>`. The alarming 8-of-13 ratio is **partly a test-data artifact**.

## Tooling defect found and fixed: `config.js` dropped `ORG_USER_PASSWORD`

`config.js` exported `ORG_USER_EMAIL` but **not** its matching `ORG_USER_PASSWORD` — the value was in
`.env.local` and in `process.env`, just never surfaced on the `env` object. Consumers reading
`env.ORG_USER_PASSWORD` therefore authenticated with an **empty password**.

The platform reports that as `400 user_cannot_login_in_store` — *"You cannot sign in to the current store"* —
which reads as a store-permission problem, not a missing secret. That is dangerously close to the `Forbidden`
symptom the two blocked drafts are about, so it is easy to mistake for a reproduction.

**It also locked the shared `TECHFLOW_ADMIN` fixture out** (`lockoutEnd 2026-08-26T09:27:49Z`) — repeated
empty-password attempts tripped lockout, which is what blocked both ProfileExperienceApi drafts. Temporary,
but any concurrent suite using `ORG_USER` would have failed during the window. Self-inflicted, flagged rather
than left quiet.

Fixed in `config.js` (the pair is now exported symmetrically, with a comment explaining the failure mode); a
scan confirms **no other `*_EMAIL` export is missing its `*_PASSWORD`**. `npm run env:check` stays green.

> **Worth a follow-up:** `td:validate:credentials` guards password *declaration* across fixtures but does not
> check that `config.js` actually **exports** both halves of a credential pair. A three-line assertion there
> would have caught this before it locked an account.

## Method note — an assertion that hid the failure

The first probe checked the token with `typeof t === 'string' && t.length > 60`. The error payload
(`ERR 400 {"userId":null,"errors":[…]`) is **also** longer than 60 characters, so the check printed `OK` on a
failed grant and the loop kept retrying — which is how the lockout accumulated. Assert on the *shape* you
expect (`j.access_token` present), never on a length that both success and failure satisfy.

## Batch A running total

`open/` unchanged at **69** — nothing in this batch cleared. Two drafts now carry a corrected root cause or an
end-to-end re-confirmation, which is worth more than a status flip: the membership-link draft was re-proven on
a **released** `Customer 3.1022.0` (it had only ever been seen on a pre-release), and the org-switcher draft
would have sent a developer to the wrong two lines.

---

# Batch B (Cart/Checkout) — partial, 2026-08-26

| Draft | Verdict |
|---|---|
| `cart-accepts-non-pack-multiple-quantity` | ❌ still reproduces — identical numbers (qty 7 on `packSize 6`, extendedPrice 69.93, no `validationErrors`) |
| `authorizenet-placeorder-enabled-invalid-card` | ❌ still reproduces — **confound ruled out** |
| `cart-storefront-display-gaps` | ⚠️ **1 of 3 sub-findings FIXED** (CART-057 accessible name); other two not re-checked |
| `stale-cart-price-after-admin-price-change` | ⏸ **not re-verified** — pricing write path unresolved on this build |
| `cart-quantity-stepper-invalid-input-no-inline-validation` | ⏸ not reached |
| `guest-checkout-card-gateway-no-payment`, `cart-configurable-line-summary…`, `GA4-add-payment-info-stale` | ⏸ not reached |

## The Authorize.Net result is worth trusting

A disabled button is normally *validation working*, so the interesting part is the control: **before** a
delivery method was selected, "Place order" was correctly `[disabled]` with "Complete all required
information to proceed." **After** selecting Fixed Rate (Ground) — leaving the Luhn-invalid PAN as the only
invalid input — it became **enabled**, hint gone, with no `aria-invalid`, no `aria-describedby` and zero
`role=alert` on the card field. The form gates on required-ness but not on card validity.

The order was **not** submitted: the sibling draft documents that doing so produces an unpaid ghost order, and
the missing gate is provable without creating one. The audit's **MERGE** recommendation stands — file the pair
as one P1.

## Correction — the TechFlow fixture is broken independently of my mistake

Batch A recorded that my empty-password probes locked `TECHFLOW_ADMIN` out. True, but **not the reason the two
ProfileExperienceApi drafts are blocked**. Retried after the lockout expired **and** with a correctly resolved
password: still `400 user_cannot_login_in_store`. The account reads healthy (`Approved`, `storeId: B2B-store`,
`roles: []` as expected for the org-scoped model), yet cannot get a store token.

That is a **fixture/environment defect in its own right** — it blocks any org-scoped suite using `ORG_USER`,
not just these drafts. Possibly the VCST-5281 family (a store-scoped grant refused because the contact is
pinned to an org whose status blocks sign-in). Both drafts now carry this correction so nobody re-diagnoses
`user_cannot_login_in_store` as the `Forbidden` defect under test.

## Batch B completed 2026-08-26 — the four remaining Cart/Checkout drafts

All four resolved on the **source axis** against `vc-frontend@dev`. None is fixed. Two had their root cause
materially corrected — which is the part worth reading, because in both cases the draft's stated anchor would
have sent a fixer to the wrong file.

| Draft | Verdict | What changed |
|---|---|---|
| `guest-checkout-card-gateway-no-payment` | **still open, P0** | root cause **enlarged** — two paired `isAuthenticated &&` prefixes, not one |
| `cart-configurable-line-summary-shows-wrong-option-label` | **still open, Medium** | root cause **corrected** — not an index bug; the header never renders the configuration at all |
| `cart-quantity-stepper-invalid-input-no-inline-validation` | still open, Medium | anchor pinned exactly; the gap is an explicit `disable-validation` opt-out |
| `GA4-add-payment-info-stale-VCST-5198` | still open, P3 | unchanged; VCST-5198 confirmed **Draft / To Do, unresolved** |

### The P0 is a hole between two guards, not a missing one

`place-order.vue` skips the card-valid gate for guests (`isAuthenticated.value && canPayFromCart.value &&
!isCanFinalizePayment.value`) — the draft had this. But `billing-details-section.vue` *also* hides the card
form from guests (`paymentCardVisible = isAuthenticated.value && ...`), so no processor ever registers.
`usePayment.ts` then leaves `isCanFinalizePayment` correctly `false` — the gate would fire, if it were
reachable — and `finalizePayment` uses optional chaining, so it **silently no-ops** rather than throwing.
That last detail is what explains the original "zero requests to any Authorize.Net host": not a network
failure, a no-op.

Hiding the form from guests looks deliberate (guests would normally pay at the post-order `/checkout/payment`
step), but `canPayFromCart` is true for an `allowCartPayment` method, so no redirect step is scheduled either.
**The guest gets neither payment surface.** Fixing only `place-order.vue` would leave guests with an enabled
button and no form to satisfy it — so the two prefixes must be addressed together, or `allowCartPayment`
methods must be withheld from the guest method selector.

No live re-run: proving it end-to-end means clicking "Place order" and creating a *second* unpaid ghost order.
The source contrast is conclusive, so the cost was not worth paying. Server-side rejection is therefore
**carried over, not re-confirmed** — flagged as such in the draft.

### The configurable-label draft was chasing a bug that does not exist

The draft assumed "a shared/first-config value or a wrong index". There is no index. `prepareLineItem` builds
the header from `item.product?.properties` — the **base** product's catalog properties — so every line for the
same configurable product is identical *by construction*, `.slice(0, 3)`'d. The per-line `configurationItems`
are mapped correctly and rendered separately, which is why the Components list is right.

Two consequences. A fixer looking for an off-by-one would have found nothing and likely closed it as
irreproducible. And the defect is **systematic, not intermittent**: it mislabels every configurable cart line
in every cart. The two-variant STR is what makes it *visible*, not what causes it. Severity stays Medium
(totals and data are correct), but it is a wider surface than the draft implies.

### Method note

Source was the right axis for all four: each defect and its fix live in the same artifact, so a byte-unchanged
file is proof the draft is alive. It is *not* proof for anything whose symptom depends on server or data state —
which is why the guest-checkout server half and the earlier `stale-cart-price` draft are still marked
unverified rather than quietly folded in.

## Running total after two days

`open/` **69** · closed **9** · narrowed or root-cause-corrected **7** · re-confirmed still-valid **12** ·
blocked **2** · one tooling defect found and fixed (`config.js` credential-pair asymmetry).

### What is left

- **Not started:** Storefront misc (7), Platform REST (6), SalesRep (6), Admin/CMS (6), A11y (5), vc-shell (5), Other (3).
- **Unfinished:** `stale-cart-price-after-admin-price-change` — blocked on the pricing write path
  (`GET /api/pricing/pricelists?keyword=` is the likely route; `prices/search` 404s, `pricelists/search` 405s).
- **Human calls, untouched:** the 3 Cancelled-tracker drafts (`VCST-5606`, `VCST-5612`, `VCST-5609`) → `rejected/`.
- **Env cleanup owed:** 2 undeletable org-membership rows; the `TECHFLOW_ADMIN` store-login failure.
- **Suggested follow-up:** extend `td:validate:credentials` to assert `config.js` exports both halves of every
  credential pair — the asymmetry that caused the lockout is currently undetectable by any gate.

## vc-shell / Vendor Portal batch 2026-08-26 — 5 of 5 drafts CLOSED

The best-hit batch of the audit by a wide margin. **Every vc-shell draft is fixed.** All five were
written 2026-07-28…07-30 against `@vc-shell/framework` 2.2.0/2.3.0; the framework has since shipped
**v2.4.0** (08-04) and **v2.5.0** (08-19), and the a11y backlog was worked systematically in between.

| Draft | Fixed by | Merged | Verified |
|---|---|---|---|
| `vendor-portal-primary-nav-not-keyboard-operable` (High, WCAG 2.1.1 A) | [#267](https://github.com/VirtoCommerce/vc-shell/pull/267) | 07-30 | source + **deployed bundle** + **live** |
| `vc-shell-target-size-below-wcag22-minimum` (Serious, 2.5.8) | [#271](https://github.com/VirtoCommerce/vc-shell/pull/271) + [#281](https://github.com/VirtoCommerce/vc-shell/pull/281) | 08-04 | 3 of 7 rows **live**, rest source |
| `vc-shell-dashboard-drag-only-no-keyboard-alternative` (Serious, 2.5.7) | [#272](https://github.com/VirtoCommerce/vc-shell/pull/272) +[#283](https://github.com/VirtoCommerce/vc-shell/pull/283) +[#303](https://github.com/VirtoCommerce/vc-shell/pull/303) | 07-30… | **live** |
| `vc-video-sandbox-blocks-youtube-playback` (High) | [#266](https://github.com/VirtoCommerce/vc-shell/pull/266) | 07-30 | source + **live Storybook** |
| `vcdatatable-inline-editing-story-missing-vue-imports` (Medium) | [#269](https://github.com/VirtoCommerce/vc-shell/pull/269) | 07-30 | source + **live Storybook** |

Note the pattern: **#266 and #269 landed exactly ten days after #255 introduced them**, and #267/#272
two days after the reports were filed. This backlog was not ignored — the drafts simply outlived their
defects, which is the failure mode this whole audit exists to catch.

### Why this batch justified live verification and the Cart batch did not

Storefront drafts were closed on source alone because defect and fix sat in the same artifact. Here the
claims were about **rendered, computed state** — "tabIndex is -1", "12×34 px", "the player never
initializes". Source can show intent; only measurement shows the shipped result. So each was measured on
the deployed surface, and for the primary-nav draft on the **served bundle** as well, which is stronger
than reading `main`: it proves the fix reached the environment, not just the branch.

Two representative inversions of the drafts' own probe tables:
- primary nav — 14 items were `div` / `tabIndex -1` / 0 anchors; now all 14 are `button` / `tabIndex 0`,
  `buttonsInNav: 17`. A real backwards tab-walk lands on `Fulfillment Centers` with a 2px focus outline.
- dashboard — `.grid-stack-item` was `tabIndex -1`; now `tabIndex 0`, `role="listitem"`, labelled
  *"widget 1 of 5. Press Enter to pick up and rearrange with the arrow keys."*

`.vc-input__clear` measured **24×30** with `min-width/min-height: 24px` (was 12×34), and the sidebar bell
and burger both **24×24** (was 18×21) — fixed via named tokens (`--input-adornment-target-size`,
`--button-link-target-size`, …), not one-off nudges, so the class is closed rather than the instances.
[#273](https://github.com/VirtoCommerce/vc-shell/pull/273) additionally raised the axe scope to WCAG 2.2,
closing the tooling blind spot that let 2.5.8 ship — the meta-point one of the drafts argued for.

### One new defect found while verifying

[#272](https://github.com/VirtoCommerce/vc-shell/pull/272)'s body states *"Both aria-labels were
misleading … now describe the keyboard route."* Only one was. `GridstackDashboard.vue` got the corrected
string, but the public wrapper `DraggableDashboard.vue` still defaults to
`"Dashboard widgets. Drag widgets to rearrange."` — and because `withDefaults` always materialises the
prop, it is passed down as defined, so **the child's corrected default is unreachable**. The Vendor Portal
uses the wrapper, so the live app announces the stale string: the exact "tells screen-reader users to do
the one thing they cannot" wording that PR set out to delete.

Filed as `BUG-vc-shell-dashboard-container-arialabel-still-says-drag-only.md` (Low). It does not reopen
the parent draft — the functionality exists and the per-widget labels teach it. Worth a general sweep for
other props `DraggableDashboard` re-declares a default for, since the shadowing is structural.

### Carried forward, not closed

The primary-nav draft listed four *related* findings. Each has a plausible fixing PR
([#274](https://github.com/VirtoCommerce/vc-shell/pull/274) html-lang — confirmed live as `<html lang="en">`;
[#282](https://github.com/VirtoCommerce/vc-shell/pull/282) breadcrumb button-name;
[#284](https://github.com/VirtoCommerce/vc-shell/pull/284)/[#286](https://github.com/VirtoCommerce/vc-shell/pull/286)/[#301](https://github.com/VirtoCommerce/vc-shell/pull/301)/[#306](https://github.com/VirtoCommerce/vc-shell/pull/306)
focus management + maximized-blade isolation), but only html-lang was verified. The other three are
recorded as unverified rather than folded into the closure — they were never that report's subject.

### Tooling note

`.env.playwright.local`'s vcmp key is `ADMIN_PASSWORD_VCMP-DEV`. A `grep -oE "^[A-Z0-9_]+"` truncates it
at the hyphen to `ADMIN_PASSWORD_VCMP`, which is not a real key — typing that name submits the literal
string as a password (one failed sign-in before this was spotted). Use `^[A-Za-z0-9_-]+=` when listing
credential names.

## Sales Rep batch 2026-08-26 — 6 drafts: 1 closed, 5 open, 2 root causes wrong

Unlike the vc-shell sweep, this batch mostly survives. The value here is not the one closure — it is that
**two of the five survivors had a root cause that would have sent a fixer at the wrong thing**, and a third
understated its blast radius.

| Draft | Verdict | Note |
|---|---|---|
| `salesrep-mycustomers-unreachable-for-global-role-rep` | **CLOSED — fixed** | fixed exactly as the draft recommended |
| `SalesRep-DE-raw-i18n-keys-account-sidebar` (VCST-5681) | open — **root cause wrong**, mostly fixed | keys were never missing |
| `SalesRep-Layout-Parked-Zone-Hint-Contrast` | open — **root cause incomplete** | token-only fix cannot reach AA |
| `SalesRep-EUR-formattedAmount-placeholder` | open | blast radius 6 call sites, not 2 |
| `SalesRep-Layout-Keyboard-Grab-Dropped-By-Pointer` | open | "likely" root cause now **confirmed** |
| `SalesRep-Layout-Touch-Drag-Affordance` | open | unchanged; its own open question stays open |

### The i18n draft was chasing keys that were never missing

It concluded *"the German locale file is genuinely missing the keys."* All three exist in `de.json`, fully
translated — and two of those files have not been touched since **2024-12-18** and **2025-10-15**, long
before the draft. The remedy it proposed (a CI guard for keys present in `en.json` but absent from a
sibling) already shipped in 2024 as `#1499`; that guard passing is itself evidence the keys are present.

Live on vcst-qa @ 2.56.0: a clean `/de/` load shows **zero** raw keys — `Benachrichtigungsliste`,
`Vertriebsmitarbeiter`, `Punkteverlauf` all render. The in-page EN→DE switch still leaks, but **one** key
now (`Loyalty.navigation.route_name`), down from six. That key resolves to "Punkteverlauf" on a clean load
of the same build, in the same session — so it is conclusively a **lazy module-locale merge race**, the
explanation the draft considered and dismissed. Also explains the silence it flagged: a missing *bundle*
at render time raises no missing-key warning the way an absent key would.

Net: severity drops, and the fix routing as written would be a no-op. Probably not a SalesRep issue at all.

### The contrast draft's fix would not have worked

Re-measured independently at **1.79:1 / 1.73:1** (it reported 1.75 / 1.80) — good corroboration. But it
concludes *"a single token choice"*, and that is not sufficient. The container carries **`opacity-70`**, so
text and hatch composite toward the page white *together* and the contrast between them is compressed.
Strip the opacity and the same tokens still only reach **2.42:1 / 2.31:1** — failing 4.5:1 *and* the 3:1
large-text floor. Both must change. Fixing the token alone would produce a "fixed" ticket that still fails.

Neatly, the draft itself notes the hint is "load-bearing instructional text, not decoration" — `opacity-70`
is a decorative treatment applied to exactly that.

### Smaller corrections

- **EUR `¤`**: path byte-unchanged, but `ToMoneyAsync` now has **6** call sites, not the 2 named — the two
  *comparison* types and `SalesRepTopSellerType` are also affected. Strengthens the draft's own
  recommendation to fix inside the helper: one edit instead of six.
- **Keyboard grab**: the draft hedged its cause as "likely". `onChoose: () => release()` is unchanged and
  the reasoning holds — promote it from hypothesis to confirmed.
- **Touch affordance**: config and instruction string both unchanged; the string still documents mouse and
  keyboard but never the 200 ms hold. Its unresolvable half stays unresolvable — no Playwright MCP server
  exposes a touch/tap tool, so "does a real finger hold work" remains a hardware-manual check.

### The closure

`my-customers` was fixed exactly as the draft's preferred option: `repRouteMeta = { requiresOrganization: false }`
on the child route, with a source comment restating the draft's own argument that serving customers is
independent of corporate membership, plus a `beforeEnter` permission guard. Verified live with the precise
fixture (`SR_REP_NOCUSTOMERS`, "Nora None", zero memberships): URL holds at `/company/my-customers`,
`<h1>` = "My customers", empty state renders. Suite `089` SR-FE-013 should now pass — worth re-running to pin it.

### Method note

Live verification mattered here for the same reason as vc-shell: three of the six make claims about
*rendered* state. The i18n and contrast corrections were both only findable live — source alone would have
shown keys present (looking "fixed") and a plausible-looking colour token (looking like a one-line fix).

## Running total after two days

`open/` **64** · closed **15** · narrowed or root-cause-corrected **11** · re-confirmed still-valid **16** ·
blocked **2** · new defects found while verifying **1** · one tooling defect found and fixed
(`config.js` credential-pair asymmetry).
