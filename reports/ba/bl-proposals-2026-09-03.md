# BL proposals — 2026-09-03

Candidates the `bl` axis did not write. **Nothing here has been applied to `business-logic.md`.**
Value is `business · product → label`, derived at decision time via `npm run oracles:rank --axis=bl`.

Both entries below are **HELD on value, not on truth** — each has agreeing evidence and is blocked
because the promotion rule bounds *growth*: an entry whose business value is undeclared cannot enter a
file whose purpose is judging PASS/FAIL.

## 1. Master/variation `addItem` is accepted silently — **HELD (undeclared)**

| Value | Gate | Discovered by |
|---|---|---|
| `unknown · low → undeclared` | **HELD** — needs a severity tag | `ECL-AUDIT-2026-09-03`, `ECL-14.1` row 4 |

Adding a product's **master** id (a product that declares variations) instead of one of its variation ids
is accepted with empty `validationErrors`, and the cart carries a genuine line item bearing the master's
own SKU — indistinguishable from an ordinary single-SKU product. Nothing in the add-item command handler,
the cart aggregate or the cart error describer checks for a variation-bearing product before accepting
the id. Confirmed on source and live during the ECL audit.

**Why it needs an invariant rather than just the ECL row:** the ECL row records the *hazard to a test*;
what is missing is the normative claim about the *product*. `ECL-14.1` row 4 previously cited
**`BL-CAT-006`**, which is the wrong mechanism — that invariant governs configurable-product
**configuration sections**, not the master/variation model. The mis-citation has been removed and the
cell now declares a gap, so nothing currently prices this behaviour.

**What is needed to promote:** a severity tag. If a silently-accepted master line item can reach an
order, `P0-revenue` is arguable and it would promote at any demand; if it is caught downstream, `P1-data`
is more likely and it then needs product `medium`+ (≥3 citing cases). **The audit deliberately did not
assign one** — inventing a severity would be inventing the very thing the gate asks a human to declare.

## 2. Scope disclosure on differently-scoped figures — **HELD (undeclared)**

| Value | Gate | Discovered by |
|---|---|---|
| `unknown · low → undeclared` | **HELD** | `SBTM-salesrep-customer-orders-2026-09-03` |

Two adjacent surfaces render differently-scoped counts of the same entity under identical labels. Both
figures are correct — one is creator-scoped per `BL-SR-002`, the other deliberately creator-agnostic —
so nothing is violated and the divergence is a *predicted consequence* of that design rather than a
defect. What is absent is any rule requiring a figure to disclose the scope it counts.

Blocks `ecl-proposals-2026-09-03.md` §4, which cannot be priced until this invariant exists.

**Related, already recorded:** `BL-AUDIT-2026-09-03` holds a third candidate — the index-backed order
surface's own filter/sort contract (raw field:value narrows; an unknown **field** fails closed to zero
rows with an empty `errors[]`; no discovery companion). That one is `medium · low → qualified`-pending
and clears as soon as a third case on that surface cites it; it is the missing `Business_Rule` for
`SR-CO-031` in suite 097.

## Not proposed — recorded so the decision is not re-litigated

`BL-SR-009` and `BL-SR-010` were both **applied** this day as DRIFT-scope corrections, not held: a
correction to an entry that already exists lands whatever its value, because carrying a known-false rule
is strictly worse than carrying a low-value true one. See `reports/knowledge/BL-AUDIT-2026-09-03.md`.
