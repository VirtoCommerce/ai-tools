# Understanding and Managing Member Roles

### Introduction
Every person in your company can hold **more than one role** at the same time. On the **Company members** page you can see all the roles each member has, filter the list by role, and change the roles you manage yourself.

![Company members list showing each member's full set of roles in the Roles column](../../tests/Sprint-current/VCST-5239/screenshots/VCST-5239-AC9-members-merged-roles.png)
*The Company members page. The **Roles** column now lists every role a member holds, separated by commas.*

### Prerequisites
- You are signed in with a **corporate (company) account** and have permission to manage members.
- Open **Account → Company members** from your account menu.

---

### How roles work for a member

A member's access comes from **two kinds of roles combined**:

- **Company-wide roles** — assigned to your whole organization by your platform administrator. **Every** member inherits them automatically; you do not add them person by person. In the screenshot above, the role **AGENT-TEST-OrgLevel-5239** appears next to every member because it is a company-wide role.
- **Individual roles** — the roles you assign to one specific member with **Edit role** (see below), such as *Organization maintainer* or *Purchasing agent*.

A member's actual permissions are the **combination of both** — the company-wide roles plus whatever you assign individually. That is why the **Roles** column can show several roles for one person.

!!! note "Why does the same role appear next to everyone?"
    That role was assigned to your entire company by your administrator, so every member inherits it. You cannot remove it from a single person on this page — it is managed for the whole organization.

---

### Filter members by role

When your list is long, you can narrow it to the people who hold a particular role.

1. Click **FILTERS** to the right of the search box.
2. In the **Members filters** panel, under **Role**, tick one or more roles. You can also tick a **Status** (Active, Invited, Blocked).
   ![Members filters panel with role and status checkboxes](../../tests/Sprint-current/VCST-5239/screenshots/VCST-5239-AC9-role-facet-panel.png)
   *Tick the roles you want to see, then apply.*
3. Click **Apply**. The list now shows only members who hold a selected role.
4. To see everyone again, open **FILTERS** and click **Reset**.

!!! tip
    You can also type a role name into the **Search by name, role or email** box for a quick lookup.

---

### Change a member's individual role

1. On the **Company members** page, click the **settings (gear)** icon next to the member's name.
2. Choose **Edit role** from the drop-down menu.
3. Select the role you want to give the member.
4. Click **SAVE**.

On success you will see: **"The role has been successfully modified."** The member's **Roles** column updates to show the new role alongside any company-wide roles they inherit.

!!! warning "The member must sign in again"
    A role change takes effect the **next time the member signs in**. If they are already signed in, ask them to sign out and sign back in — an open session keeps the old permissions until then. This is expected; the change is not broken.

### Invite a new member

1. Click **INVITE MEMBERS** in the top-right corner.
2. Fill in the member's details and role.
3. Click **SEND**. The recipient receives an email invitation.

New members inherit your company-wide roles automatically, in addition to any role you set in the invitation.

---

### Troubleshooting

- **A member's new role isn't working** — they need to sign out and sign in again. Permissions refresh at sign-in.
- **I can't remove a role from one person** — that role is company-wide and inherited by everyone. Only your platform administrator can change it, for the whole organization.
- **The filter shows no members** — no one currently holds the selected role. Open **FILTERS** and click **Reset** to restore the full list.

---

*Sources: VirtoCommerce Storefront User Guide — [Company Members](https://docs.virtocommerce.org/storefront/user-guide/account/company-members); feature VCST-5239 (organization-scoped roles) as shipped in vc-frontend PR #2354, vc-module-customer PR #304, vc-module-profile-experience-api PR #137. Screenshots captured on vcst-qa, 2026-07-07.*
