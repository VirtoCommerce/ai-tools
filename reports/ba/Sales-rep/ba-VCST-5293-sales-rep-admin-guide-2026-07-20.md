# Manage Sales Representatives

A **Sales Rep** is a Contact + login account that holds the **`sales-rep:access`** permission — either
globally or for one or more organizations — letting them act on behalf of B2B customers in the storefront.
You manage Sales Reps from the **Sales Reps** app, reachable from the platform main menu.

!!! note
    Requires the preinstalled **Sales Rep** module ([vc-module-sales-rep](https://github.com/VirtoCommerce/vc-module-sales-rep)). Managing reps requires `customer:read`/`create`/`update`/`delete` (member side) and `platform:security:create`/`update`/`delete` (login side); the app is visible to anyone with `customer:read`, but the **Add**/**Save**/**Block** actions need the security permissions too. Organizations a rep serves must already exist in **Contacts**.

## Overview

- View every Sales Rep and how many organizations each one serves
- Add a rep and choose which organization(s) they serve
- Re-point a rep's role, or add/remove served organizations, from the same blade
- Block, unblock, or delete a rep's account
- Restrict which roles the **Sales Rep role** picker offers
- Turn the Sales Reps app on or off per store

## View and find Sales Reps

1. Click **Sales Reps** in the main menu. The dashboard opens with quick links to **Sales Reps**, **Blocked Sales Reps**, **Not assigned Sales Reps**, **Organizations**, and **Not assigned Organizations**.
   ![Sales Reps dashboard with quick-link tiles](vcst-5293-sales-rep-admin/screenshots/01-dashboard.png)
   *The dashboard is the app's landing page — each tile opens a pre-filtered list.*
2. Click the **Sales Reps** tile (or link) to open the full list.
   ![Sales Reps list with Name, Email, Organizations, and Blocked columns](vcst-5293-sales-rep-admin/screenshots/02-reps-list.png)
   *The **Organizations** column counts the orgs the rep is currently serving — `0` means a rep with a global `sales-rep:access` role but no organizations assigned yet.*
3. Type in **Search by name or email** to filter the list.
   ![Reps list filtered by keyword "Priya"](vcst-5293-sales-rep-admin/screenshots/03-search-keyword.png)

!!! note
    The list is the **union of two sources, deduplicated by user**: reps who hold `sales-rep:access` through a global account role, and reps who hold it through a per-organization membership role. A rep can appear once even if they serve several organizations.

## Add a Sales Rep

To add a new Sales Rep:

1. Click **Add** in the **Sales Reps** toolbar.
2. In the **New Sales Rep** blade, fill in the following fields:

   | Field | Description | Example |
   |-------|-------------|---------|
   | Email (login) | Required. The account's sign-in email; kept as the first entry of the rep's email list. | `@td(SR_REP_PRIMARY.email)` |
   | Password | Optional here — leave blank to have the platform generate one, or set it explicitly. | — |
   | Store | Required. The storefront the rep's account is scoped to. | *B2B-store* |
   | Sales Rep role | Required. Only roles that grant `sales-rep:access` are listed. | *Sales Representative* |
   | Organizations served as Sales Rep | The organizations this rep acts as a Sales Rep for. | `@td(ORG_ACME.name)` |
   | First name / Last name | The rep's profile name. | *Jordan* / *Diaz* |

   ![New Sales Rep blade filled in, Store dropdown open showing available stores](vcst-5293-sales-rep-admin/screenshots/07-add-blade-filled-store-dropdown.png)
   *The **Sales Rep role** field defaults to whichever eligible role sorts first; pick the one you intend.*
3. Click **Save** in the toolbar.

The rep is created and appears in the **Sales Reps** list.

!!! note
    The role you select here is applied **both** as the rep's global account role **and** as the role on every membership for the organizations you select — changing it later re-points every assignment at once, including on other memberships that previously granted access through a different role.

## Edit a Sales Rep

1. Click **Sales Reps** in the main menu, then click a row in the list to open that rep's blade.
   ![Existing rep's detail blade: Account, Served organizations, and Profile sections](vcst-5293-sales-rep-admin/screenshots/04-rep-detail-blade.png)
   *Toolbar actions: **Save**, **Reset**, and **Block**.*
2. To change the rep's role, open the **Sales Rep role** dropdown — it lists only roles that grant `sales-rep:access`.
   ![Sales Rep role dropdown open, listing only sales-rep:access roles](vcst-5293-sales-rep-admin/screenshots/05-role-dropdown-open.png)
3. To add or remove served organizations, use the **Organizations served as Sales Rep** field (chips with a remove ×).
4. To add a secondary contact email, type into **Additional emails** and press Enter; the login email always stays first.
5. Click **Save**.

!!! warning "Employees must be members of the organization too"
    A per-organization membership role only takes effect if the organization is also listed in the rep's **Member of company(ies)** (set on the Contact record in **Contacts**). Save order matters: member/organizations first, then the account, then memberships.

## Permissions

| Action | Required permission(s) |
|--------|------------------------|
| Being detected as a Sales Rep | `sales-rep:access` (via a global or membership role — not a fixed role name) |
| See the Sales Reps app | `customer:read` |
| Add / edit a rep's profile or served organizations | `customer:read`, `customer:create`/`update` |
| Add / edit a rep's login account, block/unblock | `platform:security:create`/`update` |
| Delete a rep | `customer:delete` **and** `platform:security:delete` |

## Enable Sales Rep per store

The app itself is global, but each store can turn the feature on or off for its shoppers.

1. Click **Stores** in the main menu and open the required store.
2. Click the **Settings** widget, then navigate to **Sales Rep → General** in the settings tree.
3. Toggle **Sales Rep Enabled**.
   ![Settings blade, Sales Rep > General group, Sales Rep Enabled toggle](vcst-5293-sales-rep-admin/screenshots/08-store-settings-salesrep-enabled.png)
4. Click **OK**, then **Save** on the store.

!!! note
    This setting only gates the storefront **UI** for that store — it does not remove `sales-rep:access` from any account. A rep stays manageable in this app either way.

## Delete a Sales Rep

Select the rep's row (or open their blade) and click **Delete**.

!!! warning
    Deleting a Sales Rep removes **both** the Contact member **and** its login account (and all roles/memberships) — there is no way to keep one without the other. This cannot be undone.

---

*Sources: JIRA [VCST-5293](https://virtocommerce.atlassian.net) "[BE] Sales Rep Role - VC-Shell App" (Epic VCST-5142); [VirtoCommerce/vc-module-sales-rep](https://github.com/VirtoCommerce/vc-module-sales-rep); screenshots captured live on `vcptcore-qa` (`{{BACK_URL}}` = https://vcptcore-qa.govirto.com/) @ Platform 3.1045.0, 2026-07-20.*
