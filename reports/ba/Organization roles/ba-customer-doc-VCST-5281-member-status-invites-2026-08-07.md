# Understanding Your Status and Invitations Across Companies

### Introduction
If you belong to more than one company, your standing can now be **different in each one**. Being new, active, or blocked in one company no longer affects your status anywhere else. This guide covers what the status badges mean, how to filter your member list, and what happens when you invite someone into — or are invited into — another company.

![Company members grid with Name, Roles, Email, and Active columns, including a pending "Invite sent" row](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-customer-company-members-grid.png)
*The **Company members** page. The **Active** column shows each person's status; a row still awaiting registration reads **Invite sent**.*

### Prerequisites
- You're signed in with a corporate account and have permission to manage members.
- Open **Company members** from the **Corporate** group in your account menu (`/company/members`).

---

### Understanding your status in each company

Each member shows one of four statuses in the **Active** column: **Active**, **Invited**, **Inactive**, or **Blocked**. Your administrator sets your status separately for each company you're part of, so you might be Active in one company and Invited in another at the same time.

!!! note "Why does my status look different in different companies?"
    Your administrator manages access one company at a time. Losing access to one company — or being removed from it — does not change your standing in any other company you belong to.

!!! note "What does Inactive mean?"
    A member shows **Inactive** whether they declined an invitation or were removed from the company — the list doesn't distinguish between the two, and removing someone doesn't take their row off the list. It stays, badged Inactive.

---

### Find and filter members

1. Type a name, role, or email into the **Search by name, role or email** box, or click **FILTERS**.
2. In the **Members filters** panel, tick one or more roles under **Role**, and/or a value under **Status**: **Active**, **Invited**, or **Blocked**.
   ![Members filters panel with Role and Status checkboxes](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-customer-filters-panel.png)
   *Only Active, Invited, and Blocked can be filtered on — there's no separate filter for Inactive members.*
3. Click **Apply**. Click **Reset** to clear your filters and see everyone again.

---

### Invite someone to join your company

1. Click **Invite members**.
2. In the **Invite member** dialog, choose a **Role** (defaults to Organization employee), enter one or more email addresses (separate multiple entries with commas, semicolons, or line breaks), and optionally add a **Message**.
   ![Invite member dialog filled with role, email, and message](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-customer-invite-dialog-filled.png)
3. Click **Send**.

The invitee appears in your member list immediately, showing **Invite sent**, until they complete registration.

!!! note "Inviting someone who already shops with another company"
    You can invite a person using an email address they already use elsewhere — their membership of your company is tracked separately from any other company they belong to. If they tell you they can no longer sign in at all right after your invitation arrives, revoke it (see **Manage a pending invitation** below) and ask them to try again; see also **Troubleshooting**.

### Manage a pending invitation

Open the actions menu next to an **Invited** row to **Resend invite** or **Revoke invite**.

![Actions menu on an Invited row showing Resend invite and Revoke invite](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-customer-invited-actions-menu.png)
*These two actions are the only ones available on a pending row. There is no separate way to re-invite someone whose invitation was revoked or declined — send a new invitation to the same address instead.*

---

### Switch between your companies

If you belong to more than one company, open your account menu and look under **Organizations** — every company you belong to is listed, with your current one marked.

![Account menu Organizations section listing accessible companies](../../tickets/Sprint26-15/VCST-5281/screenshots/F9a-03-ORG-SWITCHER-EXISTS-appears-with-2-accessible-orgs.png)
*Select a different company from this list to work in it. Only companies you currently have access to appear here.*

### Accept or decline an invitation to a new company

When someone invites you into their company, go to **Account → Dashboard**. A card titled **Organization invitations** lists each pending invitation with **ACCEPT** and **DECLINE** buttons.

![Organization invitations widget on the account dashboard with Accept/Decline buttons](../../tickets/Sprint26-15/VCST-5281/screenshots/F9a-01-panel-BEFORE-accept-buildright-pending.png)

Accepting adds that company to your list in **Organizations**; declining removes the invitation without affecting any company you already belong to.

---

### Troubleshooting

- **A member's status looks the same everywhere I check** — it isn't; each company tracks it separately. You're looking at that one company's member list.
- **I can't find an Inactive member using the Status filter** — that filter only offers Active, Invited, and Blocked. Search by name instead.
- **I revoked or someone declined an invitation, and they're still listed** — that's expected; they now show **Inactive** rather than being removed from the list.
- **I don't see a "re-invite" button on an inactive member** — send a new invitation from **Invite members** using the same email address instead.
- **I was invited to another company and now I can't sign in anywhere** — contact your company administrator. They can revoke the pending invitation from their side, which restores your access immediately.

---

*See also: the companion [Admin guide to organization membership status and invites](./ba-admin-doc-VCST-5281-org-membership-status-2026-08-07.md) for administrators.*

*Sources: VirtoCommerce Storefront User Guide — [Company Members](https://docs.virtocommerce.org/storefront/user-guide/account/company-members). Feature VCST-5281 as shipped in vc-frontend theme 2.55.0, vc-module-customer 3.1021.0, vc-module-profile-experience-api 3.1015.0. Screenshots captured on vcst-qa, 2026-08-07.*
