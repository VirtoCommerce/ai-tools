# Enable the Sales Rep Hub for a Sales Rep

The **Sales Reps** module lets you turn a storefront account into a sales representative who can view and act on a portfolio of customer organizations, including a **My customers** view added to their storefront sidebar. This guide covers granting the role, assigning served organizations, and turning the feature on for a store.

## Overview
Enabling the hub for one rep takes two parts, both covered below:

- **Assign the rep** — grant the Sales Rep role and link the rep to the organizations they serve, from the **Sales Reps** blade.
- **Turn on the hub for the store** — flip the **Sales Rep Enabled** store setting so the storefront renders the hub at all.

## Add or edit a Sales Rep
To grant a user the Sales Rep role and link them to the customers they serve:

1. Click **Sales Reps** in the main menu.
2. In the **Sales Reps** blade, click an existing rep row (or **Add** to create one).
   ![Sales Reps list blade with Name, Email, Organizations, and Blocked columns](screenshots/salesrep-my-customers/05-admin-sales-reps-list.png)
   *The **Organizations** column is a running count of how many customers each rep currently serves.*
3. In the rep's blade, fill in the following fields:

   | Field | Description | Example |
   |-------|-------------|---------|
   | Email (login) | The rep's storefront sign-in email. | `agent-test-sr-primary@example.com` |
   | Password | Sets or resets the rep's storefront password. Leave blank to keep the current one. | *(leave blank)* |
   | Sales Rep role | Grants `sales-rep:access`, applied both globally and per served organization. | Sales Representative |
   | Organizations served as Sales Rep | The customer organizations this rep is responsible for. Add as many as needed — each appears in the rep's storefront **My customers** table. | AGENT-TEST-Org-AcmeCorp-20260310 |

   ![Rep detail blade showing the Sales Rep role field and the Organizations served as Sales Rep multi-select](screenshots/salesrep-my-customers/07-admin-rep-role-and-served-orgs.png)
   *The role field grants access; the Served organizations field decides which customers show up in the rep's own My customers view.*
4. Click **Save** in the toolbar.

The rep can now sign in to the storefront and sees a **Sales Rep hub** section in their account sidebar, with **My customers** listing every organization you added.

!!! tip
    Use **Search by name or email** in the **Sales Reps** list to find a rep quickly once your team grows, and check the **Not assigned Sales Reps** / **Not assigned Organizations** shortcuts on the module dashboard to spot reps or customers that still need linking.

#### Block a rep's access
Click **Block** in the rep's blade (or use the **Blocked Sales Reps** list) to revoke sales-rep access without deleting the account. A blocked rep keeps their ordinary storefront login but loses the Sales Rep hub and served-organization access.

## Turn on the Sales Rep hub for a store
The hub only renders in the storefront when the store-level setting is on:

1. Click **Stores** in the main menu.
2. In the next blade, select the required store (**B2B-store** in our example).
3. Click the **Settings** widget.
4. In the settings tree, expand **Sales Rep → General** and turn on **Sales Rep Enabled**.
   ![Store Settings blade with the Sales Rep General category selected and the Sales Rep Enabled toggle](screenshots/salesrep-my-customers/08-admin-store-setting-sales-rep-enabled.png)
   *With this setting off, the Sales Rep hub never appears in the storefront sidebar for that store — even for a fully assigned rep.*
5. Click **OK**, then **Save** in the store toolbar.

!!! note
    Requires the **Sales Reps** module installed on your deployment. Without it, neither the **Sales Reps** item in the main menu nor the **Sales Rep → General** settings node exist — the store behaves as if the feature doesn't exist.

!!! note
    A rep only sees customers you've explicitly added under **Organizations served as Sales Rep**. Membership in an organization on the customer side doesn't automatically make a rep responsible for it — the assignment happens on the rep's own blade.

********
<div style="display: flex; justify-content: space-between;">
<a href="https://docs.virtocommerce.org/platform/user-guide/store/overview">← Stores overview</a>
<a href="https://docs.virtocommerce.org/platform/user-guide/store/settings">Store settings →</a>
</div>

Sources: [Store module overview](https://docs.virtocommerce.org/platform/user-guide/store/overview) · [Store Settings](https://docs.virtocommerce.org/platform/user-guide/store/settings) (PlatformUserGuide — the Sales Reps blade itself is not yet published there).
