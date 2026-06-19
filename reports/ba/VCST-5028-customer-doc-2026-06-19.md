# Managing Your Company Members and Roles

### Introduction

As an **Organization Maintainer**, you control who belongs to your organization and what they can do. From the **Company members** page you can invite new members, change each person's role within your organization, and block or unblock access — all without affecting that person's membership in any other organization they belong to.

![Company members page showing the full member list with Name, Role, Email, and status columns](../../reports/bugs/screenshots/VCST-5028/01-members-list.png)
*The Company members page lists every member of your organization with their current role and status.*

---

### Prerequisites

- You must be signed in to an account that has the **Organization Maintainer** role in this organization.
- To reach this page: go to **Account → Company members** in the account sidebar, or navigate directly to `/company/members`.

---

### Path 1 — Invite a new member

Use this path to add someone who is not yet part of your organization.

1. On the **Company members** page, click **Invite members**.
2. In the invitation form, fill in the new member's email address and select the role they should have in your organization.
3. Click **SEND**.

The recipient receives an email invitation. They appear in the member list as **Invited** until they accept.

!!! note "Inviting someone who is already in another organization"
    Sending an invitation adds the person to *this* organization only. Their membership and role in any other organization are not changed.

---

### Path 2 — Change a member's role in your organization

Roles control what a member can do — for example, whether they can place orders or invite other members. Use this path to promote or change a member.

1. On the **Company members** page, find the member whose role you want to change.
2. Click the **Actions** button (the icon at the right of the member's row).

   ![Actions dropdown open for a member showing Edit role, Block user, and Delete options](../../reports/bugs/screenshots/VCST-5028/02-actions-menu-open.png)
   *The Actions menu shows the available actions for that member in this organization.*

3. Click **Edit role** from the dropdown.
4. In the **Change role** dialog, select the new role:

   ![Change role dialog with three role options: Organization employee, Purchasing agent, Organization maintainer](../../reports/bugs/screenshots/VCST-5028/03-change-role-dialog.png)
   *Select one of the available roles for this member within your organization.*

   | Role | What the member can do |
   |------|------------------------|
   | **Organization employee** | Basic access — browse catalog and place orders |
   | **Purchasing agent** | Can view and manage orders for the organization |
   | **Organization maintainer** | Full company access — can invite members, change roles, and block access |

5. Select the role you want and click **Save**.

The member's role updates immediately for this organization. Their role and permissions in any other organization they belong to are not affected.

!!! note "Role changes take effect right away"
    The member's access changes as soon as you click **Save**. They do not need to sign out and back in — the next action they take uses the new role.

---

### Path 3 — Block a member from your organization

Use this path to remove a member's access to your organization without deleting their account.

1. On the **Company members** page, find the member you want to block.
2. Click the **Actions** button at the right of their row.
3. Click **Block user** from the dropdown.
4. Confirm the action when prompted.

The member's status changes to **Blocked** in the list. They lose access to your organization immediately. Any active session they have in your organization ends.

!!! warning "Blocking ends this organization's active sessions immediately"
    Once you block a member, they cannot enter your organization. If they try to switch to it, they will see: "Your access to organization '…' has been blocked. Please contact your organization administrator."

!!! note "Blocking is for this organization only"
    Blocking a member here does **not** disable their account globally. They can still sign in and access any other organization they belong to. Only their access to *your* organization is removed.

---

### Path 4 — Unblock a member

Use this path to restore a member's access after blocking them.

1. On the **Company members** page, find the member with **Blocked** status.
2. Click the **Actions** button at the right of their row.
3. Click **Unblock user** from the dropdown.
4. Confirm the action when prompted.

The member's status returns to **Active**. They can immediately sign in to your organization again.

---

### Path 5 — Filter and search your member list

If your organization has many members, use the search and filter tools to find the person you need.

1. To search by name, role, or email, type in the **Search by name, role or email** field and press **Enter** or click the search icon.
2. To filter by status or role, click **Filters** and select the criteria you want.

The list updates immediately to show matching members.

---

### Switching between your organizations

If you belong to more than one organization, use the organization switcher in the header to move between them. Each organization's members, roles, and settings are managed separately.

!!! note "Blocked organizations do not appear in your switcher"
    If you are blocked from an organization, it no longer appears as an option in the switcher. You cannot access it until a Maintainer of that organization unblocks you.

---

### Troubleshooting

- **I do not see the "Invite members" button.** — You may not have the Organization Maintainer role in this organization. Check your role in the **Active** column of the member list or ask your administrator.
- **A member shows as "Invited" but has not joined.** — They may not have received the invitation email. Ask them to check their spam folder, or use the Actions menu to resend or delete the invitation and send a new one.
- **I blocked a member but they say they can still access the store.** — Blocking removes access to *this* organization only. If they are shopping under a different organization, that is expected. Confirm they are using your organization's context.
- **The "Save" button is greyed out in the Change role dialog.** — Select a different role first. The Save button activates only when you choose a role that is different from the member's current one.
- **I cannot change the role of the Store Administrator row.** — The store administrator account is a system-level account and its role cannot be changed from the storefront.

---

*Sources: [Virto Commerce Storefront User Guide — Company Members](https://docs.virtocommerce.org/storefront/user-guide/account/company-members) · `reports/ba/VCST-5028-developer-doc-2026-06-19.md`*
