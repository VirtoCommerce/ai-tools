# Business Logic Proposals — TLC-2026-08-05-1200 (Lists / Wishlist + Save-for-Later)

These are **drafts**. Nothing here is applied to `knowledge/oracles/business-logic.md`.

**Why none were auto-applied.** The `/qa-review-bl` evidence bar is *applicable axes* — docs + live + source, with a
structurally-unavailable axis waived. Here the **docs axis (VirtoOZ MCP) was unauthenticated for the whole run**, which is
*unverifiable this session*, **not** structurally unavailable: Virto does publish Lists documentation, so the axis is
applicable and simply could not be read. Under the rule that makes a candidate a held draft rather than a promotion, all
four below are held. Each carries a concrete re-audit trigger.

There is **no `BL-LIST-*` / `BL-WISH-*` family in the oracle today** — `BL-CART-015` (configuration items survive a
Saved-for-Later round trip) is the only invariant touching this feature area at all. That absence is the finding behind
this file.

| Candidate | Docs | Live | Source | Verdict |
|---|---|---|---|---|
| PROPOSED-BL-LIST-001 | unread | partial | met | HELD |
| PROPOSED-BL-LIST-002 | unread | not reached | met | HELD |
| PROPOSED-BL-LIST-DUP | unread | met (UI layer only) | open | HELD |
| PROPOSED-BL-LIST-003 | unread | met | met | HELD — closest to promotable |

---

## New invariants proposed

### PROPOSED-BL-LIST-001: Wishlist ownership/isolation across scope levels `[P1-data]`
- **Rule:** A personal-scope wishlist is never readable by another user, by ID or by direct-URL guess; an
  Organization-scope wishlist is never readable by a user outside that organization.
- **Verify:** Read another user's list ID as a non-owner, and an org list as a non-member — both denied.
- **Violation signal:** List payload returned to a non-owner/non-member instead of a denial.
- **Agents:** qa-backend-expert (xAPI), qa-frontend-expert (storefront)
- **Source axis:** met — `graphql-schema.md` exposes `wishlists(scope:)` and `wishlist(listId:)`; suite 050h
  WISH-020/021/022/023 are `Automated` against this behavior.
- **Live axis:** partial — the cross-user personal case is covered by an Automated case, but the **org** half could not be
  observed: the only session available signed in as role `USER` (`kind: customer`, not an org member), and `ORG_USER`
  was at `/connect/token` failed-attempt `count:3` so it was deliberately not retried.
- **Triggered by:** WISH-020, WISH-025/026 (Draft), B2C-LIST-037 (new, Draft)
- **Re-audit trigger:** an org-capable storefront login is available (`ORG_USER` credential state repaired, or a second
  org fixture seeded) **and** the docs axis is readable.

### PROPOSED-BL-LIST-002: Wishlist share-key generation is platform-exclusive `[P1-data]`
- **Rule:** A wishlist's public `sharingKey` is generated only by the platform when the scope is anonymous-shareable; a
  client-supplied `sharingKey` is ignored, never honored.
- **Verify:** Supply a `sharingKey` on create/change and confirm the persisted key differs; read via `sharedWishlist`.
- **Violation signal:** A client-chosen key resolves through `sharedWishlist` — a guessable-link exposure.
- **Agents:** qa-backend-expert
- **Source axis:** met — `sharedWishlist(sharingKey: String!)` exists in the schema; WISH-009 exercises it.
- **Live axis:** not reached — WISH-009 is `Manual`, and the storefront share surface was not observable on the account
  available (see the note under §Not promoted).
- **Triggered by:** WISH-009 (rewritten this run — its `D-001` Critical is fixed)
- **Re-audit trigger:** WISH-009 executed once against a live endpoint with a client-supplied key.

### PROPOSED-BL-LIST-DUP: Wishlist duplicate-add behavior `[P2-ux]`
- **Rule (UNRESOLVED at the API layer):** adding a product already in a list either increments the existing line's
  quantity (the cart-like `BL-CART-007` analogue) or is rejected/no-op — it does **not** create a second line.
- **Verify:** `addWishlistItem` twice with the same productId; inspect the resulting item count.
- **Violation signal:** Two lines for one product, or a silent quantity loss.
- **Agents:** qa-backend-expert
- **Live axis (UI):** **met** — the add-to-list modal places an already-listed product under `Already in the lists` with
  its checkbox pre-checked and offers no "add again" action, so duplication is prevented **structurally in the UI**.
- **Open question:** the UI preventing it says nothing about what the **API** does when called directly. That is exactly
  what the new `WISH-029` discovery probe (`{HYPOTHESIS}`, `Draft`) is for.
- **Triggered by:** WISH-029 (new)
- **Re-audit trigger:** WISH-029 run under `--verify`; its outcome decides which half of the rule is true.

### PROPOSED-BL-LIST-003: List membership is independent of the catalog `[P2-ux]`
- **Rule:** Deleting a list, or removing a product from it, never affects the catalog product record or any other list
  containing that product.
- **Verify:** Remove a product from list A; confirm its PDP is intact and list B still holds it.
- **Violation signal:** PDP degraded/404, or the product vanishing from an unrelated list.
- **Agents:** qa-frontend-expert
- **Source axis:** met — separate `removeWishlistItem` / `removeWishlist` mutations, no catalog write path.
- **Live axis:** **met** — observed 2026-08-05 on vcst-qa: a product removed from a list left its PDP fully intact
  (price, rating, reviews) with the wishlist control reverting to unpressed `Add to list`.
- **Triggered by:** B2C-LIST-008 (existing assertion, never codified as a named invariant)
- **Re-audit trigger:** docs axis readable — this is the one candidate where only the docs axis is outstanding.

---

## Not promoted / needs a human decision

- **`CART-012` / `CART-013` (suite 029) have a blank `Business_Rule`, and it was left blank on purpose.** No existing
  `BL-CART-*` describes a **plain, non-configurable** Save-for-Later move; `BL-CART-015` covers only the
  configuration-preservation variant. A fabricated citation would be worse than an empty cell, so the gap is recorded
  here instead. The live pass did confirm the underlying behavior (a round trip preserves quantity **and** price), so
  this is a strong candidate for a new `BL-CART-*` once the docs axis can corroborate it.
- **Suite 007's sharing/privacy assumptions are unconfirmed, not refuted.** No Share control, privacy toggle, or share
  modal was visible anywhere in the Lists UI (row kebab = `Edit`/`Delete` only; List settings = Name + Description) —
  but that was observed on a **customer** account, and cases 016–026/037 are org-scoped by design. Treat as unverified
  pending an org login. Cases 009/010/011 (public link, email share, privacy toggle) are B2C-shaped and *should* have
  been visible to a customer, so they are the sharper question — possibly descoped, possibly store-setting-gated.

## Provenance

Env-agnostic by policy; the live observations above were made against a QA deployment on Platform `3.1055.0` with a
storefront theme PR build, 2026-08-05. Docs axis: **not consulted — MCP unauthenticated.**
