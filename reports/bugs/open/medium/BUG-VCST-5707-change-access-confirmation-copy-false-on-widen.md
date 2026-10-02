# "Change who can access?" says recipients lose access when widening to "Anyone with link" — they don't — [Medium]

**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0604 · 2026-09-29
**Found by:** /qa-test VCST-5707 (3x, 4a D3, C1 B2C-LIST-078) · **Provenance:** IN-SCOPE (new confirmation in vc-frontend PR #2476) · **Archetype:** LIFECYCLE

## STR
1. As @td(SR_REP_PRIMARY) share a list with a specific customer (@td(ORG_TECHFLOW)).
2. Share → "Anyone with link" → Save.

## Expected vs Actual
- Expected: the copy matches the effect — the audience grows, nobody loses access.
- Actual: "Change who can access?" / "Everyone the list is shared with now will lose access." / Cancel · Change access. After confirming, the key is unchanged, scope is AnyoneAnonymous, and the previous recipients (and anonymous users) still read the list. The same copy is correct for Anyone with link → Specific customers.

## Evidence
`reports/tickets/Sprint26-19/VCST-5707/screenshots/4a-fe-change-access-customer-to-anyone.png`, `3x-change-access-confirm.png`; post-change `sharedWishlist` reads (Read for the previous recipient, another org and anonymous).

## Fix Routing
`vc-frontend` `share-wishlist-modal.vue` / `stop-sharing-confirmation-modal.vue` — skip the confirmation (or use neutral copy) when the target scope is a superset (→ Anyone with link).

## Retest 2026-10-02 — VCST-6104 fix (vc-frontend 43bcb9c) — PARTIALLY FIXED, defect remains
**Env:** vcptcore-qa · theme 2.59.0-pr-2476-31b5-31b5550c · /qa-test VCST-5925 · kb: KB-91DF8883
The fix changed the locale strings only; `revokesCurrentAudience` still opens the confirmation on ANY scope change. Same key `sharingSetting.id` throughout.
- Customers → Anyone with link (widen): "Change who can access?" / "The link stays the same. Some users may lose access." / Cancel · Change access. "Link stays the same" is TRUE. "Some users may lose access" is FALSE: ACME keeps Read, and TechFlow and anonymous users gain Read. The copy does not say the list becomes public or that links already sent now open for anyone, which is VCST-6104's Expected. Screenshot `reports/tickets/Sprint26-19/VCST-5925/screenshots/fe-copy-c4-customers-to-anyone-widen.png`.
- Anyone with link → Customers (narrow): same copy, both sentences TRUE (`fe-copy-c5-anyone-to-customers-narrow.png`).
- The inverse gap: removing an org inside Specific customers revokes it at once (Forbidden) with NO confirmation (`fe-copy-c3-remove-techflow-no-warning.png`). The warning fires where nobody loses access and is absent where someone does.
