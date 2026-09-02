# Manage Loyalty Missions

A **loyalty mission** is a goal-driven campaign that watches a customer's orders and awards points automatically once the goal is met. Missions live in the Loyalty module and are managed from the **Loyalty missions** blade in the back office.

## Overview

With loyalty missions, you can:

* Set a goal based on order value, order count, or the purchase of specific SKUs.
* Scope a mission to one store and bound it with a start and end date.
* Offer a mission only to selected customer groups.
* Award a fixed number of points when a customer completes the goal.
* Move a mission through a **Draft → Published → Archived** lifecycle.

!!! note
    **Loyalty missions** and **Loyalty** are two separate items in the main menu. **Loyalty** opens the older **Loyalty programs** list, which is a different feature with its own conditions and rewards. Missions are authored only from **Loyalty missions**.

## Before you begin

1. Click **Stores** in the main menu and open the store the mission will run in.
1. Click the **Loyalty settings** widget and confirm **Enable Loyalty** is on. Note the **Loyalty Currency** value — points are denominated in it.
1. Click **Save** in the toolbar if you changed anything.

!!! note
    There is no separate "Enable Missions" setting. The single **Enable Loyalty** toggle governs both missions and the legacy loyalty program feature, so you cannot switch one on without the other. Likewise, permissions are module-wide (`loyalty:create`, `loyalty:update`, and so on) — an operator who can edit a loyalty program can also edit a mission.

## Add a mission

To create a mission:

1. Click **Loyalty missions** in the main menu.
1. In the next blade, click **Add** in the toolbar.

   ![Loyalty missions list](../media/missions/missions-list-blade.png)

1. In the **New loyalty mission** blade, fill in the following fields:

   | Field | Description | Example |
   |-------|-------------|---------|
   | Status | Read-only. A new mission always starts as `Draft`. | `Draft` |
   | Name | The mission's canonical name. | `Summer VIP Spend Challenge` |
   | Localized names | Per-locale overrides of the name. Click **Show more languages** to expand the list. | `es-ES: Reto de Verano VIP` |
   | Localized descriptions | Per-locale description shown to the customer. | — |
   | Store | The storefront the mission runs in. One store per mission. | `B2B-store` |
   | Start date | When the mission window opens. Leave blank for an open-ended mission. | `Aug 26, 2026 10:59:19 AM` |
   | End date | When the mission window closes. Leave blank for no end. | `Mar 1, 2027 10:59:19 AM` |

1. Add a goal, a condition and a reward as described below.
1. Click **Save** in the toolbar.

The mission is saved as a draft and appears in the **Loyalty missions** list.

!!! tip
    Enter the start and end dates carefully. The blade does not warn you if the end date falls before the start date, and such a mission saves without complaint.

### Set the mission goal

Every mission needs exactly one goal. Click **Add goal** and pick one of three types:

| Goal type | Reads as | What you fill in |
|-----------|----------|------------------|
| Reach target order value | *Reach order total of **500.00** **USD** per mission period* | The amount, and the currency it is measured in |
| Reach target number of orders | *Reach **3** orders per mission period* | The number of orders |
| Purchase target quantity of SKUs | *Purchase **all** of the target SKUs* | The mode — **all** or **any** — then the SKU list |

![Add mission blade with an order-value goal](../media/missions/add-mission-blade-ordervalue-goal.png)

To swap a goal for a different type, delete the existing goal row first, then click **Add goal** again.

!!! note
    **The SKU list is a two-step job.** On an unsaved mission the blade shows *"You can add SKUs after saving the mission."* Save the mission with the goal type and mode chosen, reopen it, then click **select** to pick products from the catalog.

![Add mission blade with a per-SKU goal](../media/missions/add-mission-blade-persku-goal.png)

!!! note
    The phrase **per mission period** is fixed text, not a setting. There is no periodicity control — the "period" is the mission's own start-to-end window, and progress does not reset on a recurring cadence.

### Target an audience

Click **Add condition** to restrict who the mission is offered to. Under **Shopper profile** there are two blocks:

| Condition | Effect |
|-----------|--------|
| Any User Group | No restriction — the mission is offered to every customer in the store. |
| User group is… | Click **Add** and pick one or more customer groups. Repeat to include several groups. |

Conditions are joined under the heading **If any of the following criteria**, so a customer who matches any one row qualifies.

!!! note
    This condition set is deliberately narrower than the one on a loyalty program. Order status, order total and first-order conditions are **not** available on a mission — customer group is the only targeting dimension.

### Add a reward

Click **Add reward** and select **Earn fixed amount of points per order**, then enter the amount — for example, *Get **750.00** fixed points*. Click **Add reward** again to attach more than one reward row to the same mission.

Only fixed point amounts are available. There is no percentage-of-order-value reward on a mission.

## Publish a mission

Open a draft mission and click **Publish** in the toolbar. The toolbar also offers **Save**, **Reset** and **Archive**.

!!! note
    A published or archived mission is read-only, but the blade does not grey its fields out — the goal, condition and reward rows still respond to clicks and their delete icons still appear to work. Avoid editing a published mission; use **Reset** to discard anything you change by accident.

## Track results

To see the points a mission has awarded:

1. Click **Contacts** in the main menu and open the customer.
1. Click the **Loyalty balance** widget to open the **Loyalty operation log**.
1. Click any row to open the mission or program that produced it.

The log grid shows **Operation**, **Amount**, **Balance** and **Created**. It does not name the mission behind a row, and a mission-sourced row is indistinguishable from a program-sourced one at a glance — clicking through is the only way to identify the source.

## Known limitations

* **Order-value goals count the whole order total**, including shipping and tax — a $45 order with $150 shipping and $39 tax advances the goal by 234, not 45.
* **Save validation is incomplete.** A negative reward amount and an end date earlier than the start date are both accepted.
* **Per-customer targeting is not available.** Customer group is the only audience dimension.
* **Cancelling or refunding an order reverses nothing** — mission progress, the completion status and the points already credited all remain.

********
<div style="display: flex; justify-content: space-between;">
<a href="../enable-and-configure-loyalty-programs">← Enabling and configuring loyalty programs</a>
<a href="../loyalty-points-history">Loyalty points history →</a>
</div>

---
*Documented against vcst-qa @ Platform `3.1063.0`, `VirtoCommerce.Loyalty_3.1006.0-pr-14-da8a`, 2026-09-02.*
