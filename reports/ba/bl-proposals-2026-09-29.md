# BL Proposals — 2026-09-29 (staged, not applied)

Triggered by: `BL-AUDIT-2026-09-29` (`/qa-review-oracles bl UCPA-013`). Both entries in scope came back
**UNGROUNDED**, so nothing was written to `business-logic.md`. The source axis is certain. The docs
axis is a gap, and the live axis reached only the both-flags-ON state.

| Entry | Verdict | Value (`oracles:rank`) | Missing axes |
|---|---|---|---|
| BL-CHK-001 | UNGROUNDED (substantively DRIFT) | high · high → high, T1, 38 citing cases | Docs; Live for both OFF branches |
| BL-AUTH-001 | UNGROUNDED | high · high → high, T1, 42 citing cases | Docs; Live for a real token expiry |
| (new) anonymous-users-allowed sign-in gate | MISSING candidate | `[P0-revenue]` proposed ⇒ gate would APPLY once confirmed | Docs; Live for the OFF branch |

## BL-CHK-001 — the Rule names the wrong setting

**Finding.** The Rule says `createAnonymousOrderEnabled` gates sign-in before checkout. Source shows two
separate settings with two separate effects:

- **The storefront route guard reads `anonymousUsersAllowed`.** When it is off, an anonymous visitor is
  sent to sign-in on every non-public route, checkout included, with the destination kept as `returnUrl`.
  - Guard: vc-frontend `client-app/router/index.ts:41-56` @ `0604e3f1` (the deployed build).
  - The checkout route sets no `requiresAuth` (`router/routes/checkout.ts:81-148`), so this guard is the
    only gate.
  - Setting key: `Stores.AllowAnonymousUsers`, default `true` (vc-module-store `ModuleConstants.cs:48-54`).
- **`XOrder.CreateAnonymousOrderEnabled` is enforced only when the order is created.** It is checked at
  `createOrderFromCart` (vc-module-x-order `OrderSchema.cs:115-118, 275-286`; default `true`,
  `ModuleConstants.cs:24-31`). When it is off, a guest can still reach checkout, but the anonymous order
  create is refused with `AnonymousAccessDenied`.
- **The storefront never reads `createAnonymousOrderEnabled`.** It fetches the field but no router or
  guard code uses it.

The entry's own `Source:` line ("no auth guard on the checkout route") already contradicted its Rule.

**Proposed text:** the batch agent's DRIFT draft is in the audit report
(`reports/knowledge/BL-AUDIT-2026-09-29.md` §Proposed text). Keep `[P0-revenue]`.

**Re-audit trigger:**
1. A store whose `Stores.AllowAnonymousUsers` is off, and one whose `XOrder.CreateAnonymousOrderEnabled`
   is explicitly off. Neither exists on the environment, and this audit may not toggle a shared store.
   Both need a dedicated store or a maintenance window.
2. Pin the backend source refs to the deployed module versions. x-order, x-api and store were read at
   `main`.
3. A human decision on the docs axis. VirtoOZ does not describe either setting, which is a docs gap,
   not a §1a waiver.

**Observation, not yet a defect claim.** The deprecated xAPI `store.settings.createAnonymousOrderEnabled`
field returns `false` for stores where the setting is unset. The server-side enforcement defaults to
`true` for the same stores. So a client reading the field is told "no guest orders" for a store that
would appear to accept one. This is unconfirmed: an anonymous `createOrderFromCart` against such a store
was not run, because it would create an order.
- Field: vc-module-x-api `GetStoreQueryHandler.cs:115` (a `SettingDescriptor` with no default).
- Marked obsolete: `StoreSettings.cs:26-27`, `[Obsolete … VC0010]`.

## BL-AUTH-001 — plausible, but the expiry path itself was not exercised

- **Live, on a store with anonymous users allowed:** signing out in another tab turns the open tab into
  a guest view with an empty cart. There is no redirect. Signing in again with `returnUrl=/cart` lands on
  the same cart with the item intact.
- **Source:** on refresh-token failure the auth state resets and `unauthorizedErrorEvent` routes to
  sign-in with a redirect URL. The cart stays server-side and nothing clears it.
  - `client-app/core/composables/useAuth.ts:105-127`
  - `client-app/broadcast.ts:97-108`
- **Not established:**
  - a genuinely expired token (the REAL-USER rule blocks clearing storage programmatically);
  - "checkout resumable from last step", since the multistep `/checkout` routes were not walked.
- **Tightening, once confirmed:**
  - add the `Source:` line above;
  - make the "redirected to homepage" signal conditional on `anonymousUsersAllowed`. With anonymous
    access on, an unauthorized state redirects nowhere; the user silently becomes a guest.

## New candidate — the anonymous-users-allowed sign-in gate

If a human prefers a separate entry rather than folding clause (1) into BL-CHK-001, the rule would be:
*when the store's anonymous-users-allowed setting is disabled, an unauthenticated visitor is redirected
to sign-in on any route not flagged public, and lands on the intended destination after signing in.*

It uses the same anchors as above. The guard also has a dedicated UCP-handoff branch that keeps
`to.fullPath` as the return URL (`index.ts:46-50`). Suggested severity: `[P0-revenue]`. It has no
coverage today. UCPA-013 is its natural first citer, once that case can run on such a store.

## Citation reconciliation (hand to `/qa-review-tests --fix`, not done here)

- UCPA-013 (suite 102) cites `BL-AUTH-001`. Its subject is the anonymous-users-allowed sign-in gate, not
  session expiry.
  - Re-point it to the corrected BL-CHK-001 or the new entry, once one lands. Until then a re-point
    would dangle, so leave it.
  - Also correct the case's wording from "guest-checkout setting" to anonymous-users-allowed. Toggling
    create-anonymous-order would test a different failure: server refusal at Place order.
