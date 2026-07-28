# Make Sales Reps visible to company members

When a company member opens **My Sales Reps** in the storefront, they see the contact details of the
Sales Representatives who support **their** organization. This guide covers the back-office side of that
outcome: the four conditions a rep must meet to appear for a given customer, and how to troubleshoot a rep
who is missing. For the general mechanics of creating and editing reps, see
[Manage Sales Representatives](./ba-VCST-5293-sales-rep-admin-guide-2026-07-20.md).

!!! note
    Requires the preinstalled **Sales Rep** module ([vc-module-sales-rep](https://github.com/VirtoCommerce/vc-module-sales-rep)),
    reached from the **Sales Reps** item in the platform main menu. The organizations a rep can serve must
    already exist in **Contacts**.

## What a company member sees

A member's **My Sales Reps** list is the set of reps returned by the `customerSalesReps` query for that
member's organization. A rep appears **only** when **all four** of the following hold — if any one fails,
the rep is silently omitted from that customer's list.

| # | Condition | Where you set it |
|---|-----------|------------------|
| 1 | The rep **serves the member's organization** | The rep's **Organizations served as Sales Rep** field |
| 2 | The rep's **account is not blocked** | The rep's **Block / Unblock** toolbar action |
| 3 | The rep's **membership in that organization is not locked** | The organization membership in **Contacts** |
| 4 | The **store** the member shops has the Sales Rep feature enabled | **Stores → {store} → Settings → Sales Rep → General** |

## 1. Assign the organization the rep serves

To make a rep visible to a company's members, add that company to the rep's served organizations:

1. Click **Sales Reps** in the main menu, then click the rep's row to open their blade.
2. In **Organizations served as Sales Rep**, pick the organization from the dropdown. Served orgs are
   shown as removable chips — a rep can serve several at once.
   ![Sales Rep edit blade — Account (email, role) and the Organizations-served chip field](screenshots/salesrep-admin/salesrep-edit-blade.png)
   *The **Organizations served as Sales Rep** field is a multi-select of chips; each org the rep serves is one chip. The **Organizations** count in the list blade reflects how many they serve.*
3. Click **Save**.

!!! warning "The rep must also be a member of the organization"
    A served-organization assignment only takes full effect when the organization is also listed in the
    rep's **Member of company(ies)** on their Contact record (in **Contacts**). A rep with a global
    `sales-rep:access` role but **zero** organizations serves nobody — the list-blade **Organizations**
    column shows `0`.

## 2. Keep the rep's account active (not blocked)

A **blocked** rep is excluded from every company member's list, even for organizations they serve.

- Open the rep's blade. If the toolbar shows **Unblock**, the account is currently **blocked** (hidden
  from members); if it shows **Block**, the account is active.
  ![A blocked rep's blade — toolbar shows "Unblock"](screenshots/salesrep-admin/account-widget.png)
  *This rep is blocked (toolbar action is **Unblock**), so they will not appear in any member's My Sales Reps list until unblocked.*

!!! warning "The list-blade **Blocked** column label reads backwards"
    In the **Sales Reps** list, the **Blocked** column's status icon is labelled **"Active"** when the rep
    **is blocked** and **"Inactive"** when they are **not** — the label describes the *Blocked flag*, not
    account health. Confirm a rep's true state from the **Block / Unblock** toolbar button on their blade,
    not from this column's tooltip.

  ![Sales Reps list — Name, Email, Organizations count, Blocked column](screenshots/salesrep-admin/salesrep-list.png)
  *The **Organizations** count and **Blocked** column are your first check when a rep is missing for a customer.*

## 3. Do not lock the rep's membership in that organization

Separately from an account block, a rep's **membership in a single organization** can be **locked**. A
per-org lock removes the rep from **that** organization's members' lists while leaving them visible to the
other organizations they serve. Membership locking is a **Contacts** action on the organization membership
— it is **not** exposed as a per-org control in the Sales Reps blade (the served-orgs field there is a flat
chip list with no lock affordance).

## 4. Enable the Sales Rep feature on the store

Even a correctly assigned, active rep will not surface in the storefront if the member's store has the
feature turned off.

1. Click **Stores** and open the store the members shop (e.g. *B2B-store*).
2. Open the **Settings** widget, then navigate to **Sales Rep → General** in the settings tree.
3. Confirm **Sales Rep Enabled** is on.
   ![Store Settings — Sales Rep > General > Sales Rep Enabled toggle](screenshots/salesrep-admin/store-salesrep-enabled.png)
4. Click **OK**, then **Save** on the store.

!!! note
    This toggle gates the **storefront UI** for that store only — it does not change any rep's permissions.
    Reps stay fully manageable in the Sales Reps app whether it is on or off.

## Troubleshooting — "a rep isn't showing up for a customer"

Work down the four conditions in order:

1. **Served org?** Open the rep's blade → is the customer's organization a chip in **Organizations served
   as Sales Rep**, and is the **Organizations** count > 0? If not, assign it (§1).
2. **Blocked?** Does the toolbar show **Unblock**? If so, the account is blocked — unblock it (§2). Ignore
   the list column's tooltip wording.
3. **Membership locked?** In **Contacts**, open that organization's membership for the rep — is it locked?
   Unlock it (§3).
4. **Store enabled?** Is **Sales Rep Enabled** on for the member's store (§4)?

If all four pass and the rep still does not appear, confirm the rep's **contact is indexed** (a brand-new
rep may not be keyword-findable until the member search index updates) and that the member's account
resolves to the expected organization.

---
*Sources: JIRA [VCST-4907](https://virtocommerce.atlassian.net/browse/VCST-4907) "[BE] [Organization member] My Sales Reps Contact Information" (Epic VCST-5142 *Sales Rep Hub*); companion [Manage Sales Representatives](./ba-VCST-5293-sales-rep-admin-guide-2026-07-20.md) (VCST-5293); visibility rules cross-checked against the live-verified `customerSalesReps` contract in `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` (SR-GQL-003/007/008); screenshots captured live on `vcptcore-qa` (`{{BACK_URL}}` = https://vcptcore-qa.govirto.com/), 2026-07-21.*
