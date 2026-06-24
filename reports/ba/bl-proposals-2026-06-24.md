# Business Logic Proposals — BA-2026-06-24

> **These are drafts. They are NOT applied to `.claude/agents/knowledge/oracles/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze VCST-5104 write docs` run `2026-06-24` — see the three audience docs in `reports/ba/ba-vcst-5104-*.md`.

---

## New Invariants Proposed

### PROPOSED-BL-LOY-013: Mixed Cart order — `order.orderTotals` exposes one entry per distinct line currency `[P1-data]`

- **Rule:** The GraphQL `order` query MUST return `orderTotals: [OrderTotalType]` with exactly one element per distinct line-item currency on the order. Each element carries `isDefaultTotalCurrency` (`true` for the store's primary currency, `false` otherwise) and per-currency `total`/`subTotal`/`taxTotal`/`discountTotal` (`MoneyType`). Exactly one element has `isDefaultTotalCurrency = true`. A single-currency order returns one element; a mixed-cart loyalty order (cash + points) returns ≥2. The order's top-level scalar `total`/`subTotal`/`taxTotal`/`discountTotal` reflect ONLY the primary-currency leg — the loyalty (points) leg is exposed exclusively in the non-default `orderTotals` element. *(Order-level analog of BL-LOY-003, which governs cart-level `cartTotals`.)*
- **Verify:**
  - Place a mixed-cart order (1 USD line + 1 PTS line); query `order(number: …) { total { amount currency { code } } orderTotals { isDefaultTotalCurrency total { amount currency { code } } subTotal { amount } } }`.
  - Assert exactly 2 `orderTotals` entries; exactly one has `isDefaultTotalCurrency = true` (currency = store currency); the non-default entry's currency = the loyalty/points currency.
  - Assert the top-level `total` equals the default entry's `total` (primary-currency only); the points leg appears only in the non-default entry.
  - Single-currency order → `orderTotals` length 1, `isDefaultTotalCurrency = true`.
- **Violation signal:** `orderTotals` is a single entry on a mixed-currency order (grouping broken); zero or multiple `isDefaultTotalCurrency = true` entries; the points leg leaks into the top-level scalar totals; an entry's totals mix amounts from another currency.
- **Agents:** qa-backend-expert, qa-frontend-expert
- **Source:** Live introspection of `CustomerOrderType.orderTotals: [OrderTotalType]` / `OrderTotalType` / `MoneyType` / `CurrencyType` on `{{BACK_URL}}/graphql` (2026-06-24); confirmed against 4 live orders (CO260624-00012 single-currency length 1; CO260624-00006/00013/00014 mixed length 2). PRs vc-module-x-order #43, vc-module-order #497. NOTE: the JIRA story wording says `totals` — the deployed field is `orderTotals`.
- **Triggered by:** VCST-5104 Tasks 1–2 (CartTotals dictionary calculator + split-by-currency order summary)

---

### PROPOSED-BL-LOY-014: Mixed Cart order — Admin SPA Line items blade shows per-currency totals independently `[P2-ux]`

- **Rule:** In the Admin SPA, the order **Line items** blade for a mixed-currency order MUST display one totals summary bar per currency (e.g. a USD bar and a PTS bar), and the line items table MUST carry a per-row **Currency** column so each line's currency is unambiguous. Neither currency's totals may be omitted. *(The order's top-level totals accordion legitimately shows the primary-currency total only; the per-currency split is surfaced in the Line items blade.)*
- **Verify:**
  - Open the Admin (`{{BACK_URL}}`, `@td(ADMIN_DEFAULT)`), Orders → open a mixed-cart order (one PTS line + one USD line).
  - Open the **Line items** accordion → assert two totals bars (one USD, one PTS) appear above the table.
  - Assert the line items table has a **Currency** column showing PTS for the loyalty line and USD for the cash line.
- **Violation signal:** The Line items blade shows only the primary-currency totals; the points-line total is absent from the summary bars despite PTS line items in the table; the Currency column is missing.
- **Agents:** qa-backend-expert
- **Source:** UI observation 2026-06-24 — `reports/ba/screenshots/vcst-5104/08-admin-order-line-items-split-currency.png` shows two parallel totals bars (USD 240.00 / PTS 10.00) plus a Currency column (PTS + USD rows). PR vc-module-order #497 (Task 4 — Admin UI multi-currency totals).
- **Triggered by:** VCST-5104 Task 4 (Admin UI displays multi-currency totals)

---

## Stale BL-* Flagged

None.

---

## Dropped (logged per Step 4.5 dedup)

- **ba-system-analyzer PROPOSED-BL-CROSS-001** ("Mixed Cart: points earned on USD lines in same order that redeems PTS") — **dropped as a duplicate** of the already-promoted **BL-LOY-007** (Mixed Cart order — points earned and redeemed exactly once, dedup per operation type) and **BL-LOY-009** (only cash-currency lines earn; loyalty-currency lines earn zero). No new coverage; reframe under BL-LOY if the existing pair ever needs a storefront points-history-display refinement.
- **ba-system-analyzer PROPOSED-BL-CROSS-002** — retained but **renumbered to PROPOSED-BL-LOY-014** above (it is a Mixed-Cart/Loyalty admin-UI invariant, Domain 17, not a cross-domain one).

---

## Application Notes

1. Assign final IDs by reading `.claude/agents/knowledge/oracles/business-logic.md` Domain 17 (BL-LOY) for the next available `BL-LOY-NNN` (LOY-012 is the last promoted; LOY-011 is reserved/pending — see `reports/test-lifecycle/TLC-2026-06-24-1121` bl-proposals).
2. Replace the `PROPOSED-` prefix with the final ID.
3. Paste the edited entry into **Domain 17: Loyalty & Mixed Cart (BL-LOY)** of `business-logic.md`; do not touch the Invariant Coverage Summary table separately unless instructed.
4. After the entry lands, re-run any related `/qa-review-tests suite <ID> --verify` (suites 075b / 083b cover the Mixed Cart flow) so test cases gain their `Business_Rule` mapping.
