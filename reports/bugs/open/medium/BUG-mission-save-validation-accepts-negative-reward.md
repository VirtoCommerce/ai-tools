# Mission save-validation accepts a **negative reward** — `FixedAmountReward { "amount": -1 }` persists on HTTP 200 — **P2**

## Status: CONFIRMED (live, at the persisted entity)
**Found by:** `/qa-test VCST-5320` → suite `075e` `MSNA-023`
**Archetype:** `BOUNDARY`

**Env:** vcst-qa @ Platform `3.1061.0`, `VirtoCommerce.Loyalty_3.1006.0-pr-14-da8a` (`da8abc6`)

## Summary

The backend accepts and persists a loyalty mission whose reward amount is **negative**. `PUT /api/loyalty-missions` returns **200** and a subsequent `GET` returns the reward tree carrying `FixedAmountReward { "amount": -1 }`. The valid boundary behaves correctly — a reward of **0** saves and is a legitimate zero-reward mission (`MSNA-011`) — so the defect is specifically the absence of a lower bound, not over-strict validation.

## Steps to reproduce

1. Admin → Loyalty → Missions → **Add**.
2. Give the mission a Name, add a condition (`AnyUserGroupCondition`), select Store `B2B-store`, and add a goal.
3. Add a reward and set its amount to **-1**.
4. Save.
5. `GET /api/loyalty-missions/{id}` and read the reward tree.

## Expected vs Actual

| | |
|---|---|
| **Expected** | Save is rejected with a validation error naming the reward field. A mission cannot promise a negative point grant. |
| **Actual** | `PUT` returns **200**. The persisted entity carries `FixedAmountReward { "amount": -1 }`. No validation error is surfaced in the blade or the response. |

Verified at the **persisted entity**, not only at the blade — the blade additionally re-titles to the mission name and disables Save/Reset, which is its documented success signal (`MSNA-004`).

## Impact

A mission configured this way would, on completion, attempt to grant a negative number of points. Given that this platform has **no balance-write API** and **no reversal path** (`BL-LOY-019`), a negative grant that does land is not correctable through any supported route. Low likelihood — it requires an admin to type a negative value — but the failure mode is unrecoverable rather than merely wrong.

## Related, and deliberately filed separately

The same case (`MSNA-023`) also found that **End-before-Start is accepted silently** — a mission persisting with `endDate 2026-08-30` before `startDate 2026-08-31`. That behaviour is **PRE-EXISTING and already documented** by `075d` `MSN-007` ("StartDate after EndDate is accepted silently — no validation at save"), so it is linked rather than re-filed.

## Note for the fix

The ticket's own dev comment records *"Add mission validation on saving on backend (currently none, can even edit a Published mission)"* as **completed**. It is not complete for either field. Whatever validation landed does not cover the reward lower bound or the date-window ordering.

**Refs:** `075e` `MSNA-023` · related `075d` `MSN-007` (pre-existing, linked) · `MSNA-011` (reward = 0 is the valid boundary)
