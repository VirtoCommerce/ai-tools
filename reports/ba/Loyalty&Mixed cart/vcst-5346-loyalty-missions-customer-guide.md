# View and Track Your Loyalty Missions

### Introduction

If your store runs loyalty missions, you can earn extra points by completing goals — spending a set
amount, placing a number of orders, or buying specific products — on top of any points you already earn
from ordinary shopping.

![Missions & challenges page showing mission cards](../../reports/tickets/Sprint26-17/VCST-5346/screenshots/missions-default-desktop.png)
*Each open mission is shown as its own card with its name, description, reward, and how many days are left.*

### Prerequisites

- You are **signed in** to your account.
- Your store offers loyalty missions. If you don't see **Missions & challenges** in your account menu,
  it isn't enabled for your account — contact your store administrator.

### View your missions

1. Sign in to your account. The **Missions & challenges** link appears in your account navigation right
   away — you don't need to reload the page.
2. Click **Missions & challenges**.
3. Each mission card shows its name, its description, the points it rewards, and the days remaining. A
   mission ending soon carries a days-left badge.
4. Only missions that are currently open to you are listed — a mission that hasn't started yet or has
   already expired won't appear here.

!!! note "I opened a link to Missions & challenges before signing in — what happens?"
    You're taken to sign in first. Once you sign in, you're brought straight back to the mission you
    were trying to open, not just to your account dashboard.

### Check what you need to do to complete a mission

The card shows how much you've done so far, but not the full goal — open the mission to see the target.

1. Click a mission's card to open its details.
2. What you see depends on the mission's goal:
   - **Spend a set amount** — the target amount and the points you'll earn for reaching it.

     ![Order-value mission detail showing the spend target and points reward](../../reports/tickets/Sprint26-17/VCST-5346/screenshots/modal-ordervalue-desktop.png)
     *Opening the mission shows the spend target — the card itself shows only what you've spent so far.*

   - **Place a number of orders** — the number of separate orders you need to place.
   - **Buy specific products** — every qualifying product is listed, with a counter showing how many
     you've already bought (for example, "2 of 3"). That counter always matches the progress shown on
     the card you opened it from.

     ![Featured-product mission detail listing each qualifying product](../../reports/tickets/Sprint26-17/VCST-5346/screenshots/modal-sku-desktop.png)
     *Every qualifying product is listed with its own price, along with how many you still need.*

### Featured-product prices follow your currency

If your store offers more than one currency, each product's price in the mission detail always matches
that product's own price on its product page, in whichever currency you currently have selected.

### Troubleshooting

- **I don't see "Missions & challenges" in my account menu** — it isn't enabled for your account or your
  store. Contact your store administrator.
- **A mission I saw before is no longer listed** — once a mission's window closes, it stops being listed.
- **The mission card doesn't show my target amount** — that's expected today; open the mission to see
  the full target alongside your progress.

See also: [Manage Loyalty Missions](Loyalty&Mixed%20cart/missions-admin-guide-2026-09-02.md) (admin guide — creating and configuring missions in the back office).

---

*VCST-5346 verdict FAIL · verified on vcst-qa · Audiences derived from layer `storefront` ·
Evidence: `reports/tickets/Sprint26-17/VCST-5346/`*

*Not documented — every condition this run did not verify (§10.4):
goal target on the mission card — FAIL (VCST-5825, Cancelled; PO ruling pending) ·
non-English mission text — FAIL (raw i18n keys render as labels) ·
mission attribution in points history — FAIL (BL-LOY-015, attributed to VCST-5319) ·
screen-reader names for mission controls — FAIL (VCST-5826, open) ·
new-mission / completion notifications — UNCOVERED, not implemented at either layer ·
per-SKU required quantity in the mission detail (3.a) and 375 px truncation (G12) — UNCOVERED, no
covering case ·
single-currency goal/progress on one card (2.j), modal subtotal currency label (3.e), empty state (G7)
and partial-payload rendering (G5) — BLOCKED.*
