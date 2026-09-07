# Exploratory Session: Cart gift-merge compounding × mapper-rewrite seam — NOT RUN

**Date:** 2026-09-07 · **Duration:** 0 (pre-flight only) · **Session type:** NOT RUN — `NOT_DEPLOYED`
**Charter:** EXP-02 from `sprint-26-17-summary.json` §5.3 — anchor VCST-5801 / GAP-02, signal C2, money, I=5
**Intended lane/owner:** `playwright-chrome` / qa-frontend-expert · **Intended box:** 30 min

## Why it was not run

The charter's mission is *"Confirm or refute that repeated sign-out→guest→sign-in cycles compound the gift-to-paid overcharge **after the fix**, and whether the AutoMapper rewrite reintroduces or masks it."* That requires **both** x-cart changes present together. Neither QA environment has that combination:

| Change | Ships in | vcst-qa | vcptcore-qa |
|---|---|---|---|
| x-cart **#139** — VCST-5801 gift-merge fix (`MergeLineItemsFromCartAsync` iterates non-gift items only) | `XCart 3.1034.0` | ✗ pins `3.1031.0` | ✗ runs `3.1031.0-pr-138` |
| x-cart **#138** — VCST-5661 AutoMapper removal | `XCart 3.1033.0` | ✗ pins `3.1031.0` | ✓ `pr-138` |

**The VCST-5801 money fix is deployed on no QA environment.** It merged to `dev` on 2026-09-02 and was released in `XCart 3.1034.0`; `vcst-qa`'s deploy manifest pins `3.1031.0` (tagged 2026-08-14, i.e. 19 days older than the merge) and `vcptcore-qa` carries the **mapper rewrite without the gift fix** — it was pinned as `XCart_3.1031.0-pr-139` on 2026-09-01 and that pin was replaced by the `pr-138` artifact.

Running the charter anyway would have reproduced the **known, already-filed pre-fix overcharge** and invited reading it as *"the fix does not work"* — the `NOT_DEPLOYED` → `FAIL` misclassification the release-ledger reader contract exists to prevent (*"a capability the live probe does not carry is `NOT_DEPLOYED`, never a `FAIL` and never a bug"*). So the correct outcome is a stated skip, not a session.

## Consequences worth acting on

- **VCST-5801 has never been verified live anywhere.** The fix is merged and released upstream but sits on no QA env, so the sprint's one money-path defect is unverified. GAP-02 stays open and cannot be closed by testing as currently deployed.
- **The compounding question the fixer explicitly left unresolved remains unresolved** — `gifts[]` still offers the gift after the merge, so repeated cycles *may* compound. Neither confirmed nor refuted.
- **The §5.1 regression scope for this ticket is equally affected**: suites `029`, `030`, `050b1`–`050b5` are listed against VCST-5801, and on `vcst-qa` they exercise pre-fix code.

## Capture-back — the mission is not lost

The charter survives as **EXP-01a** in `SBTM-sprint-26-17-automapper-wave3-2026-09-07.md` §Charter-from-Gap, which also inherits EXP-01's unreached candidate 1 (the x-cart `cart()` vs `/api/carts/{id}` money/discount/gift field diff). Two hard briefing conditions travel with it:

1. **Unblock first.** Either deploy `XCart ≥ 3.1034.0` to a QA env (`/qa-deploy-pr`, or a manifest pin on the `vcst-qa` branch), or run knowingly against `pr-138`-without-`#139` and treat every gift finding as pre-existing.
2. On any env lacking **#139**, a gift-into-paid-line anomaly on a merged cart **is VCST-5801** and must not be re-filed.

Fixture note: the gift promotion the charter needs exists — `P10 "Auto Gift (no coupon)"` on `B2B-store` with reward `RWD-009` (`test-data/promotions/promotions.csv`, `rewards.csv`). Per the plan's own §5.2 note the fixture must carry **divergent** prices between the gift line and the same product as a paid line, or a merged paid line is indistinguishable from a correct gift line and the case is unfalsifiable.

**Writes performed:** none. No tracker item filed, no oracle edited, no CSV written, no browser lane occupied.
