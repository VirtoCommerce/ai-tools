# Manage Organization-Scoped Roles

Organization-scoped roles let you grant access to **every employee of a company at once**, instead of assigning the same role to each member by hand. A member's effective permissions are the **combination (union)** of three sources, re-evaluated each time they sign in:

- **Global roles** — assigned to the user account itself (Security module).
- **Organization roles** — assigned to a whole organization; **inherited by all its employees**.
- **Membership roles** — assigned to one person within one organization.

This lives in the **Customer** module. You manage organization and membership roles from **Contacts**, and you control which roles are offered in the pickers from **Settings → Customer → Roles**.

!!! note
    Requires the preinstalled **Customer** and **Profile Experience API** modules at the VCST-5239 versions or later.

## Overview

| Task | Where | Who inherits it |
|------|-------|-----------------|
| Assign an **organization-level** role | Contacts → open the organization → **Roles** field | Every current and future employee of that organization |
| Assign a **membership** role | Contacts → open the contact → **Organization memberships** → **Roles** | Only that one member, in that one organization |
| Restrict which roles the pickers offer | Settings → Customer → Roles → the two whitelists | — (governs the dropdowns above) |

---

## Assign a role to a whole organization

To grant a role to every employee of a company:

1. Click **Contacts** in the main menu and open the required **organization**.
2. In the organization blade, locate the **Roles** field.
3. Click into the field, select a role from the dropdown, and click **Add**.
   ![Organization blade Roles field with the role dropdown open](../../tests/Sprint-current/VCST-5239/screenshots/REVERIFY-orglevel-dropdown-OPEN.png)
   *The **Roles** field on the organization record. Only roles allowed by the Organization roles whitelist appear in the dropdown.*
4. Click **Save** in the toolbar.

Every employee of that organization now inherits the role's permissions — no per-member action is needed. Removing the role's chip and saving revokes it from all of them at once.

| Field | Description | Example |
|-------|-------------|---------|
| Roles | One or more roles inherited by all employees of the organization | *Purchasing agent*, *Store manager* |

!!! warning "Employees must sign in again"
    Effective permissions are recalculated at sign-in. An employee with an open storefront session keeps their previous permissions until they sign out and sign in again. The change is applied on the server immediately — only the active session is stale.

---

## Assign a role to a single member

To give one person a role within one organization only:

1. Click **Contacts** in the main menu and open the required **contact**.
2. Click the **Organization memberships** widget.
3. Select the membership (the organization row).
4. In the membership blade, add the role to the **Roles** field and click **Save**.
   ![Contact blade, Organization memberships widget, and the per-membership Roles field](../../tests/Sprint-current/VCST-5239/screenshots/AC1-member-dual-panel.png)
   *Global roles live on the account; membership roles are set per organization in the **Roles** field of the membership blade.*

The member's effective access is the union of this membership role, any organization-level roles they inherit, and their global roles.

---

## Restrict which roles can be assigned

Two whitelists limit the roles offered in the pickers above, so an operator cannot assign a role that your organization has excluded. Both live under **Settings → Customer → Roles**:

- **Organization roles whitelist** — the roles selectable in an organization's **Roles** field.
- **Membership roles whitelist** — the roles selectable in a member's **Roles** field.

To edit a whitelist:

1. Click **Settings** in the main menu, then open the **Customer** section and select **Roles** (or scroll to the **Customer → Roles** group under **All Settings**).
2. Click the **edit (pencil)** icon next to **Organization roles whitelist** or **Membership roles whitelist**.
3. In the editor blade, click **Add** to add a role, or tick a row and click **Delete** to remove one.
   ![Settings blade Customer Roles group with the Organization roles whitelist editor open](../../tests/Sprint-current/VCST-5239/screenshots/AC4-whitelist-settings.png)
   *The two whitelists in **Customer → Roles**, with the Organization roles whitelist editor open on the right.*
4. Click **Save** in the editor toolbar.

The two whitelists are independent — changing one does not affect the other.

!!! tip "Make new whitelist options appear"
    After editing a whitelist, click **Reset cache** in the Settings toolbar and reload the page. The role pickers read the whitelist through the settings cache, so a newly added or removed role appears in the dropdowns only after the cache refreshes.

!!! warning "A whitelist cannot yet be cleared to completely empty"
    Deleting **all** entries from a whitelist and saving currently reports success but does not persist — the entries reappear after reload (known issue VCST-5441). Leave at least one role in each whitelist, or remove entries individually, until the fix ships.

---

## Troubleshooting

- **An employee doesn't have the new organization role** — they must sign out and sign in again; permissions refresh at sign-in.
- **A role I expected isn't in the dropdown** — it is not in the relevant whitelist, or the whitelist cache hasn't refreshed. Add it to the whitelist, then **Reset cache** and reload.
- **The whitelist won't save as empty** — this is the known VCST-5441 limitation; keep at least one entry.

********
<div style="display: flex; justify-content: space-between;">
<a href="https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts">← Manage Contacts</a>
<a href="https://docs.virtocommerce.org/platform/user-guide/security/roles-and-permissions">Roles and Permissions →</a>
</div>

---

*Sources: VirtoCommerce Platform User Guide — [Manage Contacts](https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts), [Roles and Permissions](https://docs.virtocommerce.org/platform/user-guide/security/roles-and-permissions); feature VCST-5239 as shipped in vc-module-customer PR #304 and vc-module-profile-experience-api PR #137. Screenshots captured on vcst-qa @ Platform 3.1043.0 / Customer 3.1014.0-alpha.1002-vcst-5239, 2026-07-07…09. Known limitation: VCST-5441.*
