# VCST-5103 — Testing Checklist

Scope: Loyalty Points Balance Validator (mixed cart). Coverage exists in suites 075b (backend GraphQL) + 083b (frontend E2E). This run **verifies live** against the deployed build (theme 2.52.0-pr-2335).

E2E scenario family: Mixed-Cart Order (MCO). BL: **BL-LOY-008** (loyalty balance ≥ Σ PTS lines to checkout), BL-LOY-005, BL-LOY-003. ECL-2 (BVA boundaries).

## Backend (qa-backend-expert · canonical `scripts/graphql-runner.ts`)
- [ ] **MCO-GQL-005** — `LOYALTY_INSUFFICIENT_BALANCE`: PTS total > balance emits typed error with `errorParameters` `required`/`available`; `createOrderFromCart` blocked (AC1, AC2, AC3, AC4a, GAP-6). User: `@td(LOYALTY_NOBAL_USER)`.
- [ ] **MCO-GQL-006** — `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED`: PTS-only cart emits typed error; adding a cash line clears it (AC6, AC7). User: `@td(LOYALTY_VIP_USER)`.
- Run: `npx tsx scripts/graphql-runner.ts --case regression/suites/Backend/loyalty/075b-loyalty-mixed-cart-order.csv:MCO-GQL-005` (and `:MCO-GQL-006`). Capture evidence JSON.

## Frontend (qa-frontend-expert · playwright-chrome · live UI)
- [ ] **MCO-E2E-002** — Insufficient-balance blocks order placement through real payment; removing the loyalty line lets a valid checkout complete (AC1, AC3, AC4b, AC5, GAP-5). User: `@td(LOYALTY_NOBAL_USER)`.
  - [ ] On `/cart`: confirm **NO pre-emptive insufficient-balance banner** and Place Order **not disabled** (server-side at placement — this confirms the AC4b DRIFT).
  - [ ] On **Place Order**: localized `loyalty_insufficient_balance` toast surfaces; **no order created**.
  - [ ] After removing the PTS line: re-attempt completes checkout → order number.
- [ ] **MCO-E2E-006** — Points-only cart rejected at placement (needs a cash line); adding a cash line makes it valid (AC6, AC7). Note the **KNOWN** place-order 500 → generic toast (not a fresh defect).

## Exploratory (qa-testing-expert · playwright-firefox · CRISP/Risk charter — boundary BVA)
- [ ] **GAP-1** Σ(PTS) **exactly == balance** → checkout **ALLOWED** (rule is `≤`). ← highest-risk gap.
- [ ] **GAP-2** Σ(PTS) **one unit over balance** → blocked.
- [ ] **GAP-3** Two+ PTS lines: error fires on the **sum**, not per-line; multi-line summation correct.
- [ ] **GAP-4** Reduce qty / remove one of several PTS lines to drop under balance → error clears without full removal.

## Out of scope / waived
- AC8 (configurability / extension point) — no black-box surface; dev-design only.

## Notes for executors
- Read creds from `.env` at runtime (`LOYALTY_NOBAL_USER_EMAIL/_PASSWORD`, `LOYALTY_VIP_USER_*`); never hardcode.
- Firefox `/cart` payment dropdown can time out on stability (CLS=0, not a bug) — complete real checkout on **chrome/edge**, use firefox for observe/boundary only.
- Loyalty insufficient-balance is **server-side at Place Order**, not a cart-load banner — asserting a cart banner = false FAIL.
- Evidence policy: `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md` (failures + final state only).
