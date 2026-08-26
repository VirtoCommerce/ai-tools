# BUG — Users with more than one cart can never complete checkout (shipping address silently never binds) — **P0 / Critical**

## Status: FILED

**Tracker:** VCST-5811 (P0/Highest, consolidated). **Env:** vcst-qa @ Platform 3.1061.0, Theme 2.56.0-pr-2451
**Found by:** `REG-2026-08-26-0943` COMP-E2E-007 · live-verified in `/qa-triage-results` Phase 4
**Route:** `vc-module-x-cart` (`VirtoCommerce.XCart`) — default-cart resolution

> ### ⚠ Relationship to a bug already marked FIXED — read before triaging
>
> `reports/bugs/fixed/BUG-b2b-multi-default-cart-readwrite-desync-orphan-shipment-accretion.md` (XCart 3.1026.0 /
> Cart 3.1007.0, verified 2026-07-15) describes the **same desync and the same shipment accretion**, and is
> **incomplete twice over**: it addressed carts *all named* `default` (that half holds), not carts with **different
> names**; and the append path is an upsert only when `shipment.id` is supplied — id omitted it still appends
> (re-confirmed live). **The prior verification named this exact gap and closed the bug anyway**, its own caveat being
> that the account had a single clean cart "so the read/write divergence could not be observed directly". Absence of
> the symptom on a clean account was read as FIXED rather than INCONCLUSIVE. **Reopen it alongside this report.**

## Summary

`Query.cart` and the cart **command** handlers resolve the same identity tuple to **two different carts**, so every
checkout write lands on a cart the customer is not looking at: the shipping address never binds and **Place order
stays permanently disabled**. The failure is silent — `AddOrUpdateCartShipment` returns **HTTP 200, `errors: null`**
and echoes the chosen address — survives reload and re-login, has no UI workaround, and degrades further on each
cart visit. Who is actually affected: see Reach.

## Steps to reproduce

**Precondition:** a signed-in user with **two `type: null` carts**, one named `default` and one not (see Reach).

1. Go to `/cart` with one buyable item in it.
2. Shipping details → **Select address** → pick any row → **OK**; the dialog closes.

**Expected:** the address populates Shipping details; delivery methods load; **Place order** becomes enabled.

**Actual:** "Shipping address\*" still reads *Please select a shipping address*; Payment details likewise;
**Place order stays disabled**. A full reload does not change it — the split is deterministic.

## Evidence

**Re-reproduced live on demand, 2026-08-26 (xAPI, `ORG_USER` = Emily Johnson / TechFlow, `userId 68fed13a…`).**
Deterministic **PASS → FAIL → PASS** toggle driven only by cart count:

| # | Account state | `cart(…)` no `cartName` | `cart(… cartName:"default")` | Verdict |
|---|---|---|---|---|
| 1 | 1 shopping cart | `f5896eb9…` `default` | `f5896eb9…` `default` | **PASS** (control) |
| 2 | + `addItem(cartName:"AGENT-TEST-repro-secondcart")` | `1b4281c3…` `AGENT-TEST-repro-secondcart` | `f5896eb9…` `default` | **FAIL** |
| 3 | repro cart removed | `f5896eb9…` `default` | `f5896eb9…` `default` | **PASS** |

At state 2, `addOrUpdateCartShipment` with no `cartName` returned **HTTP 200, `errors: []`** and echoed the address
back — while writing to `f5896eb9…`; the cart the query returns (`1b4281c3…`) stayed at `shipments.length = 0` with
`deliveryAddress.line1` `undefined`. Silent non-binding, no error anywhere. Append-on-load, same run: two id-less
writes plus the storefront's own `shipment: {}` bootstrap drove the invisible cart **1 → 2 → 3**. Env restored and the
control re-verified. The original run showed the same split on a 7-cart account (see the trace).

Evidence: `reports/regression/REG-2026-08-26-0943/` — `traces/COMP-E2E-007-FAIL-trace.json`, `screenshots/COMP-E2E-007-FAIL-*.png`

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (symptom) | Place order permanently disabled; `COMP-E2E-007-FAIL-*.png` |
| 2. Backend Admin | N/A | not an admin-visible surface |
| 3. GraphQL xAPI | **FAIL (owning)** | `Query.cart` and `AddOrUpdateCartShipment` return different cart ids for one identity tuple |
| 4. Platform REST API | PASS | both carts exist and are individually correct in `vc-module-cart`; only xAPI resolution picks between them |

**Owning layer:** Layer 3 — xAPI (`vc-module-x-cart`): the storefront's arguments and the REST data are both correct; the divergence is created in the resolver.

## Three things that look like the cause but are not

All excluded — each would send the fix to the wrong layer. (1) **The storefront omitting `shipment.id`** — it *does*
send it when its rendered cart has a shipment (captured `"id": "b720f83d-…"`), omitting it here only because that cart
has zero. (2) **`ALL_LINE_ITEMS_UNSELECTED`** — not authoritative for the rendered cart; unselecting the only line item
on a healthy cart still binds, and the error belongs to the *other* cart. The disabled Place order is a symptom, not
correct validation. (3) **Org-context asymmetry** — `GetCartCommand<T>` and `GetCartQuery<T>`
(`ResolveFieldContextExtensions.cs`) both set `OrganizationId` from `context.GetCurrentOrganizationId()`, so
`CartName` is the *sole* asymmetric field.

## Related defect (separate, lower priority)

`addOrUpdateCartShipment` with `shipment.id` omitted **appends** instead of updating, so with the storefront's per-page-load `AddOrUpdateCartShipment(shipment: {})` bootstrap the invisible cart gains a blank shipment every visit (6 and 5 observed). "AddOrUpdate" silently means "Add" — own hardening ticket.

## Reach — who can actually create the competing cart

A cart competes only if it is `type: null` **and** shares one `(customerId, storeId, currency)` tuple with another
(`GetCartAsync` post-filters `x.Type == null`; `CartType` is a closed `Wishlist`/`SavedForLater` set).

**The customer-reachable path needs no `cartName` at all: the platform still mints duplicate `default` carts.**
`npm run carts:check` over the account registry found **6 exposed groups across 2 accounts, 16 surplus carts** — and
the dates rule out "legacy data": `agent-test-sr-primary` has `default` carts created **2026-08-19 + 2026-08-25**
(EUR) and **2026-08-18 + 2026-08-25** (USD), `ricreyacrouyi-3425` another on **2026-07-27** — all *after* the sibling
bug was verified fixed on 2026-07-15, all `createdBy` the account's own user. Its USD group is the worst shape: two
`default` carts *plus* one named cart, so the name-unfiltered query and the `"default"`-pinned mutation are choosing
from **different sets**. Non-idempotent default-cart creation is therefore the live upstream cause, and it is
storefront-reachable — the `cartName` route I used to reproduce is merely the fastest trigger, not the only one.

**A second, historical path also existed.** Of 71 carts named `"Saved for later"`, the three oldest (2026-05-19) carry
`type: null` — an earlier build set the name without the type (`SavedForLaterListService` sets both today, `:76-77`,
and finds by `Type`, `:63`). Two belong to genuine anonymous storefront sessions. Fixed in current code; the stale
rows remain.

**Census context:** of all **62,188** carts on vcst-qa, 60,939 are named `default`, 1,146 type-discriminated, and the 96 remaining named `type: null` carts are test/probe artifacts — some keyed to **synthetic** ids no real login resolves (e.g. `customerId: "user-acme-store-maintainer-1"`, 22 carts; the real ACME account holds one cart).

**Verdict:** P0 stands. The precondition is reachable by ordinary storefront use, via a defect that is **still live**,
so the fix must cover both the resolver asymmetry **and** idempotent default-cart resolution, plus a migration sweep
for accounts already stuck.

## Root cause analysis

The asymmetry is two property declarations funnelling into the same search criteria (read on `dev`):

| Side | Declaration | resulting `ShoppingCartSearchCriteria.Name` |
|---|---|---|
| Query | `GetCartQuery.cs:16` — `public string CartName { get; set; }` (**no default**; `Map()` copies the omitted argument as `null`) | `null` |
| Command | `CartCommandBase.cs:9` — `public string CartName { get; set; } = "default";` | `"default"` |

Both are assigned verbatim (`GetCartQueryHandler.cs:52`, `CartAggregateRepository.GetCartAsync`) and resolved by
`SearchAllAsync(criteria).FirstOrDefault(...)`. So with `cartName` omitted the **query is name-unfiltered** and takes
`FirstOrDefault` of an unordered result set — not the newest or non-default cart by design — while the **mutation
always pins `"default"`**. On a single-cart account both land on the same row, which is why this stayed invisible.
A further filter, `FirstOrDefault(x => CartType != null || x.Type == null)`, is what confines the competing set to
`type: null` carts (see Reach).

## Suggested fix

Make one identity tuple resolve to one cart across both sides — either default `CartName` on the query side to match
the command side, or (better) resolve the active cart through one code path shared by queries and mutations, using the
existing `ModuleConstants.DefaultCartName` rather than `CartCommandBase`'s hardcoded literal. **Plus a data migration**
for legacy competing carts (see Reach) — a resolver-only fix leaves already-affected accounts broken. **Do not patch
this in `vc-frontend`** by always sending `cartName: "default"`: that masks the symptom while leaving the contract
broken for every other consumer of the cart API.

**Oracle gap:** no BL invariant covers "one `(userId, storeId, currency, culture)` tuple ⇒ one cart" — this class is
unguarded. Nearest: **BL-CART-005** (xAPI context must return the correct cart) is violated in spirit; **BL-CHK-005**
is downstream-affected.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3 — xAPI · **repoKind:** module · **Ownership hint:** platform
- **Suggested repo:** `VirtoCommerce/vc-module-x-cart`
- **Component / module:** `VirtoCommerce.XCart` — default-cart resolution (query vs command)
- **RCA anchor:** `XCart.Core/Queries/GetCartQuery.cs:16` (`CartName`, no default) vs
  `XCart.Core/Commands/BaseCommands/CartCommandBase.cs:9` (`CartName = "default"`); both consumed at
  `XCart.Data/Queries/GetCartQueryHandler.cs:52` and `XCart.Data/Services/CartAggregateRepository.GetCartAsync`
- **Routing confidence:** HIGH — single repo, both sides of the divergence read in source on `dev`

> Gate-0 note: the diff is small, but choosing WHICH side to change is a **contract decision** affecting every
> cart-API consumer, and the sibling append-on-load defect lives in the same module. A `too-complex` bail toward
> human design review is a legitimate outcome.
