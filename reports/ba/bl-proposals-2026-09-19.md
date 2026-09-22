# BL Proposals — 2026-09-19 (staged, not applied)

Triggered by: `BL-AUDIT-GA4-2026-09-19` (the `BL-GA4-*` family ADD audit). One item — found as a
byproduct of that triangulation, out of the named `BL-GA4-*` scope, so left as a proposal rather
than applied here.

## DRIFT candidate — BL-CROSS-005

- **Current rule (excerpt):** "...(3) GA4 `purchase` event fired with correct order ID, revenue, and
  items..."
- **Observed behavior:** "revenue" is ambiguous between the order's grand total and its subtotal.
  Docs (StorefrontDeveloperGuide → Google Analytics Events → purchase payload) state `value` is
  "the order total, **excluding tax and shipping**", and source (`vc-frontend`
  `google-analytics/events.ts` `purchase()`) sets `value: order.subTotal.amount` with `shipping`/`tax`
  reported as separate fields on the same event — confirmed live this run via the shared event
  pipeline (`BL-AUDIT-GA4-2026-09-19`).
- **Why this matters:** the ambiguity contributed to a real mis-triage — `SMK-015` (suite 042 smoke,
  triaged the same day) read a subtotal-only `value` as a `BL-CROSS-005` violation ("$89.99 sent
  where the order charged $287.99"), when it is the documented, coded contract.
- **Source:** StorefrontDeveloperGuide, Integrations → Google Analytics Events (purchase payload
  table); `vc-frontend` `client-app/modules/google-analytics/events.ts` (`purchase`, `placeOrder`).
- **Suggested action:** narrow the wording — e.g. "...GA4 `purchase` event fired with the order's own
  id and subtotal (excluding tax/shipping, reported separately) and items..." — so a future reader
  does not re-derive the same false positive. Not applied here: `BL-CROSS-005` sits outside this
  run's named scope (`BL-GA4-*`), and a body edit to it deserves its own triangulated pass rather than
  riding in on an adjacent audit.

No other unconfirmed candidates from this run — all four `BL-GA4-*` clusters cleared the 3-axis bar
and the value gate; see `reports/knowledge/BL-AUDIT-GA4-2026-09-19.md`.
