# Manage Organization Membership Status and Invites

A contact can now hold a **different status in every organization** they belong to, instead of a single status for the whole account. This lets you invite, approve, or block a customer's access to one company without touching their standing anywhere else. The feature lives in the **Customer** module; you view and edit it from **Contacts**, and the recognized status values are configured under **Settings → Customer → Statuses**.

!!! note
    Requires the preinstalled **Customer** module (3.1021.0+) and **Profile Experience API** module (3.1015.0+), and storefront theme 2.55.0+ for the customer-facing invite flow described in the companion [Company Members guide](./ba-customer-doc-VCST-5281-member-status-invites-2026-08-07.md).

## Overview

| Task | Where | Effect |
|------|-------|--------|
| View every organization a contact belongs to, and their status in each | Contacts → contact → **Organization memberships** widget | Read-only overview |
| Set or change a contact's status **in one organization** | Contacts → contact → Organization memberships → membership row | Affects that organization only |
| View or change the contact's **account-wide** status | Contacts → contact → **Status** field | Affects every organization with no per-org override |
| Revoke a pending invitation | Membership row → set **Invite status** to `Deleted` | Frees the invite to be resent later |
| Configure which status values exist | Settings → Customer → Statuses → **Organization membership statuses** | Governs the values offered above |

---

## Two status fields — don't confuse them

There are **two independent status fields**, with different vocabularies:

| Field | Where | Options | Scope |
|-------|-------|---------|-------|
| **Status** | Contact record (top level) | `Deleted`, `New`, `Locked`, `Invited`, `Rejected`, `Approved` (6) | Account-wide default |
| **Invite status** | Each organization membership record | `Inherit from member`, `Approved`, `Invited`, `Rejected`, `Deleted` (5) | That one organization only |

For each organization, the platform resolves access in this order: **if the membership has its own Invite status set, that value governs access to that organization — it overrides everything else.** If the membership is left at **Inherit from member**, the platform falls back to the contact's account-wide **Status**. If neither is set, the contact is treated as **Approved**. Wherever the resulting value is `Invited`, `Rejected`, or `Deleted`, sign-in and access to that organization are blocked; `Approved` is not.

![Contact global Status field showing all six options](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-admin-contact-global-status-dropdown-6-options.png)
*The contact's account-wide **Status** field — six options, a larger vocabulary than the four membership values below it.*

!!! warning "Upgrading from a single-status contact"
    A pre-existing contact whose **account-wide** Status is `Invited`, `Rejected`, or `Deleted`, and who has **no per-organization override**, now loses access to **every** organization they belong to — not just the one they were originally blocked from. A `NULL` or unrecognized account-wide status is treated as `Approved` and is unaffected. Audit any contact in this state before rolling the upgrade to production.

---

## View a contact's organization memberships

1. Click **Contacts** in the main menu and open the **Companies and contacts** grid.
2. Click the required contact row.
3. Click the **Organization memberships** widget (its badge shows the live count).
   ![Organization memberships widget grid: Organization, Roles, Invite status columns](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-admin-org-memberships-widget-grid.png)
   *The **Invite status** column shows the raw stored value (e.g. `Approved`) — not a storefront-mapped label.*

## Set or change a membership's status

To change a contact's access to one specific organization:

1. From the Organization memberships grid, click the membership row.
2. In the membership blade, open the **Invite status** field.
   | Field | Description | Example |
   |-------|-------------|---------|
   | Organization | Read-only — the organization this membership belongs to | *BuildRight Inc.* in our example |
   | Roles | Editable — roles this member holds in this organization only | *Purchasing agent* |
   | Invite status | The per-organization override (see table below) | `Approved` |
   | Locked state | Read-only display of the independent Lock toggle | `Unlocked` |
   ![Invite status select showing all five options including Inherit from member](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-admin-membership-invite-status-dropdown-5-options.png)
3. Select a value:

   | Value | Meaning | Example |
   |-------|---------|---------|
   | Inherit from member | No override — falls back to the contact's account-wide Status | Default for a membership no one has touched |
   | Approved | Full access to this organization | Most active memberships |
   | Invited | Blocks access; pending acceptance | A freshly created invite |
   | Rejected | Blocks access; can be re-invited | An application an operator declined |
   | Deleted | Blocks access; can be re-invited | Written automatically when an invite is revoked |
4. Click **Save** in the toolbar.

!!! note "Lock is separate from status"
    The **Lock / Unlock** toolbar button and the **Locked state** line are an independent block, applied on top of the status check — a locked membership denies access even when Invite status is `Approved`. Use it to suspend one member's access to one organization without changing their recorded status.

!!! tip "Sending the invitation itself"
    Operators don't normally create the invite here — an organization maintainer sends it from the storefront's **Invite members** dialog (see the [Company Members guide](./ba-customer-doc-VCST-5281-member-status-invites-2026-08-07.md)). This blade is where you review or override the resulting membership afterward.

### Revoke a pending invitation

1. Open the affected membership row (as above).
2. Set **Invite status** to **Deleted**.
3. Click **Save**.

This is the same action a maintainer's **Revoke invite** button performs on the storefront. Because `Rejected` and `Deleted` are the only two re-invitable values, a fresh invite through **Invite members** afterward reuses this same membership row rather than creating a duplicate — there is no separate "Re-invite" action.

!!! warning "Known issue — an invite to a second organization can lock the invitee out entirely"
    Inviting an already-active, healthy member into an **additional** organization can pin their next sign-in to the newly-invited (blocked) organization, landing them on `/403` with no organization switcher and no route to `/account/dashboard` — so they cannot even accept the invite that caused the lockout. **Workaround:** if a customer reports being locked out immediately after being invited elsewhere, open the new membership here and set **Invite status** to `Deleted` (revoke it). This restores their sign-in immediately. Confirmed open at the time of writing; see the linked defect reports for reproduction detail.

---

## Notification templates for invites

Three notification types were added for this feature, all listed under **Notifications → Notification list**:

| Notification | Sent to | When |
|---|---|---|
| Customer invitation email notification | The invited person | Invited as a brand-new customer (no existing account) |
| Organization invitation email notification (new user) | The invited person | Invited to join an organization for the first time |
| Organization invitation email notification (existing user) | The invited person | Invited to join another organization using their existing account |

The pre-existing invite notification now appears as **`Unregistered notification`** with the subtext *"Original notification type: CustomerInvitationNotification"* — it is orphaned, not deleted, and will not fire again.

!!! note
    Two similarly-named types — **Signup invite notification (customer)** and **Signup invite notification (with organization)** — are unrelated to this feature. Do not confuse them with the three above.

![Notification list showing the three new invite types plus the orphaned Unregistered notification](../../tickets/Sprint26-15/VCST-5281/screenshots/DOC-admin-notification-list-invite-types-live.png)

To review or customize a template, select the notification, then open its **Templates** card:

![Templates blade with Language, Created, Modified columns and per-language rows](../../tickets/Sprint26-15/VCST-5281/screenshots/T7-templates-list.png)
*A `default`/`Predefined` template plus any per-language override (e.g. `en-US`) — templates are edited per store and per language.*

!!! warning "Upgrading — template customizations don't carry over"
    Any store-level template customization authored against the retired notification type stays attached to the now-orphaned `Unregistered notification` and is never sent again. The three new types start on their predefined, English-only templates until someone re-authors them per store and language.

---

## Configure allowed membership status values

The dictionary of values the **Invite status** picker offers lives under **Settings → Customer → Statuses**:

1. Click **Settings** in the main menu, open **All Settings**, and locate the **Customer → Statuses** group.
2. Click the **edit (pencil)** icon next to **Organization membership statuses**.
   ![Settings blade: Organization membership statuses dictionary](../../tickets/Sprint26-15/VCST-5281/screenshots/T1-T2-settings-org-membership-statuses-en.png)
   *The dictionary lists exactly `Approved`, `Deleted`, `Invited`, `Rejected` — the `Inherit from member` option on the membership blade is a sentinel, not a stored dictionary value.*
3. This is a reference dictionary the platform ships with; changes here affect what the membership picker offers everywhere in Admin.

---

## Troubleshooting

- **A contact lost access to all their organizations after the upgrade** — their account-wide Status was `Invited`/`Rejected`/`Deleted` with no per-membership override; set the affected membership's Invite status to `Approved` if they should retain access to that organization.
- **A customer says they're locked out of everything right after being invited elsewhere** — see the known-issue warning above; revoke the new invite (set its Invite status to `Deleted`) to restore sign-in.
- **A template edit isn't showing on the new invite emails** — the customization is still attached to the retired `Unregistered notification` type; re-author it against the correct new type and language.
- **The status dropdown offers fewer values than expected** — check the Organization membership statuses dictionary under Settings.

********
<div style="display: flex; justify-content: space-between;">
<a href="https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts">← Manage Contacts</a>
<a href="https://docs.virtocommerce.org/platform/user-guide/notifications/notification-templates">Notification Templates →</a>
</div>

---

*Sources: VirtoCommerce Platform User Guide — [Manage Contacts](https://docs.virtocommerce.org/platform/user-guide/contacts/managing-contacts), [Notification Templates](https://docs.virtocommerce.org/platform/user-guide/notifications/notification-templates); companion [Company Members guide](./ba-customer-doc-VCST-5281-member-status-invites-2026-08-07.md). Feature VCST-5281 as shipped in vc-module-customer 3.1021.0 (`ModuleConstants.cs:42-56`, `OrganizationMembership.cs:26-34`, `InviteCustomerService.cs:196-211,350`, `CustomerInviteNewUserEmailNotification.cs:5`, `OrganizationInviteNewUserEmailNotification.cs:5`, `OrganizationInviteExistingUserEmailNotification.cs:5`) and vc-module-profile-experience-api 3.1015.0. Screenshots captured on vcst-qa @ Platform 3.1058.0, 2026-08-07. Known issue: `reports/bugs/open/BUG-invite-to-second-org-locks-out-entire-storefront-VCST-5281.md`, `reports/bugs/open/BUG-multiorg-no-self-recovery-when-pinned-org-blocked-VCST-5281.md`.*
