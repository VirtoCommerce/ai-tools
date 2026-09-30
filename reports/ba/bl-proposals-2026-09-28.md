# BL Proposals — 2026-09-28 (staged, not applied)

Triggered by: `BL-AUDIT-2026-09-28` (`/qa-review-oracles bl BL-LOY-017`). BL-LOY-017 itself was applied
(DRIFT). This file holds the one adjacent question the triangulation raised but did not evidence.

## UNGROUNDED candidate — mission accrual on an order paid with the loyalty payment gateway

- **Question:** in Payment-Method mode (`BL-LOY-012`) an order's lines are cash-priced but it is **paid**
  from the points balance through `LoyaltyPaymentMethod`. Should such an order advance a mission? By the
  reasoning of `BL-LOY-017` (spending points must not buy fresh progress), probably not.
- **Source only (unverified by me):** `LoyaltyProgramHandler.ProcessOrderAsync` skips earn for an order
  settled by the loyalty gateway; `LoyaltyMissionLogicService.ProcessOrderAsync` has **no** equivalent
  skip. That asymmetry is the same shape as the PerSku one in `BL-LOY-017`, but on a SUPPORTED
  configuration.
- **Missing axes:** file:line anchors for both code paths (the triangulation named them without lines);
  a live observation, which requires placing an order in Payment-Method mode on a disposable account;
  and the product intent (is gateway-paid spend "real spend" for a mission?). The last one is a product
  decision, like the 2026-09-02 one, and cannot be derived from code.
- **Value if promoted:** `[P0-revenue]` candidate (self-feeding points loop) ⇒ business high ⇒ the gate
  would APPLY once confirmed.
- **Re-audit trigger:** a PO answer on gateway-paid orders + a source read with anchors, then one live
  order in Payment-Method mode. Output would be either a new `BL-LOY-021` or an extension of `BL-LOY-017`.
