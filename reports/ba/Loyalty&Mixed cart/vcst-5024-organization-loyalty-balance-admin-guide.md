# Managing Organization Loyalty Balances

The **Loyalty** module can pool points at the organization level instead of tracking them per shopper.
When a store's calculation mode is set to **Organization**, every member of an organization earns into,
and can spend from, one shared balance.

## Switch a store to organization-level points

1. Go to **Stores** and open your store.
2. Click the **Settings** tile. (Not the **Loyalty settings** tile — see the note below.)
3. In the settings tree, expand **Loyalty** and select **Missions**.
4. Set **Points calculation mode** to **Organization**, then click **OK**.
5. Click **Save** on the store blade.

![Points calculation mode set to Organization](../tickets/Sprint26-18/VCST-5024/screenshots/vcst-5024-admin-calc-mode-setting.png)

| Setting | What it does | Values |
|---|---|---|
| Points calculation mode | Whether loyalty points belong to each shopper individually, or to the organization the shopper belongs to | **Customer** (default) or **Organization** |

> **The setting is not in the Loyalty settings widget.**
> The store's **Loyalty settings** widget carries only *Enable Loyalty*, *Loyalty Mode* and
> *Loyalty Currency*. **Points calculation mode** is not there — it lives in the generic **Settings**
> tile under **Loyalty → Missions**. An operator who looks only at the loyalty widget will not find it.

![Loyalty settings widget, which does not carry the calculation mode](../tickets/Sprint26-18/VCST-5024/screenshots/vcst-5024-admin-loyalty-settings.png)

## Reading balances in the back office

There is **no organization-level balance view in the back office**. The Loyalty module registers a
single balance widget (`customerLoyaltyWidget` → container `customerDetail1`), and that container is
the **contact** detail blade, not the company record — so an organization's pooled total cannot be
read from the company blade.

Treat the contact record's loyalty widget as unreliable while a store is in Organization mode: it can
display `0` for a member who has in fact earned points into the shared pool. To read a company's
pooled total today, query it through the xAPI (see the developer guide) rather than the back office.

---
*VCST-5024 verdict: NOT REACHED — the 5b gate REJECTED on re-verification (its single fix round); the
run stopped and handed to a human · Verified on localhost · Not documented: reading an organization's
pooled balance from the back office, because no such view exists in the shipped module; and the
contact-record loyalty widget returning 0 for a member who has earned into the pool, which is tracked
as an open defect rather than documented here · Evidence:
`reports/tickets/Sprint26-18/VCST-5024/`*
