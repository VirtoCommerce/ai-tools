# VCST-5319 — Missions: goal-driven loyalty campaigns you author in Admin

**Module:** `VirtoCommerce.Loyalty` `3.1006.0-pr-14-da8a`

### What changed

You can now build **Missions** in the Loyalty module — campaigns that watch a customer's orders and
award points automatically when a goal is met. Missions are switched on per store by the **Enable
Loyalty** toggle in the store's **Loyalty settings** widget; each mission then carries a goal, an active
window, an audience and a reward.

### What you can now do

Click **Loyalty missions** in the main menu → **Add** in the toolbar. (This is a separate menu item from
**Loyalty**, which opens the older Loyalty *programs* list.)

| Field | What it does | Example |
|---|---|---|
| Goal | Which order fact drives progress | Reach target number of orders |
| Target | The value that completes the mission | `2` orders |
| Start / End date | Bounds the window in which orders count | `2026-09-01` → `2026-09-30` |
| Audience | Customer group the mission is offered to | `VIP` |
| Reward | Points credited once, on completion | `501` |

Progress and the credit are both persisted server-side: after the customer's first order the mission
reads `1 of 2 · InProgress`; after the second it reads `2 of 2 · Completed` and exactly one `Earned`
ledger row of `501 PTS` appears on their balance.

### Known limitations

- **Order-value goals include shipping and tax.** `OrderValueGoal` accrues the order total, not
  merchandise value — a $45 order with $150 shipping and $39 tax advances the goal by `234`.
- **Save validation is incomplete.** A negative reward amount and an End date earlier than the Start
  date are both accepted.
- **Per-customer targeting is not available.** Missions target a customer group; an explicit customer
  list is not supported.
- **There is no mission periodicity.** The blade prints "per mission period" as fixed text with no
  control behind it; the period is the mission's own start-to-end window and never resets.
- **`Public = false` does not hide a mission.** The flag is stored but not enforced on read.
- **Cancelling or refunding an order does not reverse mission progress**, the completion status, or
  the points already credited.

---
*Verified on vcst-qa @ Platform `3.1061.0`, `VirtoCommerce.Loyalty_3.1006.0-pr-14-da8a` (`da8abc6`) ·
Evidence: `reports/tickets/Sprint26-17/VCST-5319/`*
