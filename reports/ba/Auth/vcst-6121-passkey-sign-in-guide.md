## Documentation — VCST-6121: Sign in with a passkey instead of a password

> REHEARSAL of `/qa-docs` (2026-10-30): the ticket is Done, not Tested, so a real run refuses `not-tested`.
> Written to test the skill; not posted to Jira.

### What's new
Customers can sign in to the storefront with a passkey — their fingerprint, face, device PIN or a hardware
security key — instead of a password. They add a passkey once, on the **Security** page of their account,
and can rename or delete it there. A key added without a name shows the authenticator's name, or
**Unnamed key**.
Shipped in: VirtoCommerce.Passkeys@3.1000.0-pr-1-a25f · VirtoCommerce.Customer@3.1032.0-pr-324-b30b ·
VirtoCommerce.Store@3.1012.0-pr-190-ded5 · VirtoCommerce.XFrontend@3.1008.0-alpha.64-vcst-6121-passkeys ·
platform@3.1091.0-pr-3144-e637 · theme@2.61.0-pr-2601-8058-80583415

### How to set it up
Passkey sign-in is on by default: every store has the **Passkey** authentication type active, and the
storefront shows passkey sign-in only in browsers that support it. Nothing has to be set up to use it.

To switch it off for one store, in the back office:

1. Click **Stores** in the main menu and select the store.
2. Click the **AUTHENTICATION** widget. The **Store authentication types** blade opens.
3. In the **Is active** column, switch **Passkey** off, then click **Save**.

A freshly loaded sign-in page for that store then shows no **Sign in with Passkey** button.

!!! note
    The whole feature has one platform switch, `Passkey:Enabled` in `appsettings.json` (default `true`).
    The module adds no permissions and no settings to the settings UI.

### How it works

#### Add a passkey
1. Sign in as usual, with your email and password.

   ![Sign in with a password](../../../test-results/chrome/docs/VCST-6121/c02-password.png)
2. Open the account menu (your name, top right) and click your name. On the dashboard, in the sidebar
   under **User**, click **Security**.

   ![Security page, no passkeys yet](../../../test-results/chrome/docs/VCST-6121/c04-security-empty.png)
3. In **Passkeys**, click **Add passkey**, then confirm with your fingerprint, face or PIN when your device
   asks. The key appears in the list: **Unnamed key**, **Device only · Created** with the date and time.

   ![The new passkey in the list](../../../test-results/chrome/docs/VCST-6121/c05-key-listed.png)

![Add a passkey](../../../test-results/chrome/docs/VCST-6121/add-passkey.gif)

#### Sign in with a passkey
1. On the sign-in page, click **Sign in with Passkey**. You type no email and no password.

   ![Sign in with Passkey](../../../test-results/chrome/docs/VCST-6121/c01-sign-in.png)
2. Confirm with your fingerprint, face or PIN. You are signed in, and your name appears at the top right.

   ![Signed in](../../../test-results/chrome/docs/VCST-6121/c08-signed-in.png)

![Sign in with a passkey](../../../test-results/chrome/docs/VCST-6121/sign-in-with-passkey.gif)

#### Rename or delete a passkey
1. On **Security**, click **Edit** (the pencil) on the key. In **Rename key**, type a **Name** and click
   **Save**. The list shows the new name.

   ![Rename key](../../../test-results/chrome/docs/VCST-6121/c06-rename.png)
2. Click **Delete** (the bin) on the key. The **Delete key** dialog says *You will no longer be able to sign
   in with this key.* Click **OK**. With no keys left, the list says *You have no passkeys yet.*

   ![No passkeys left](../../../test-results/chrome/docs/VCST-6121/c10-deleted.png)

![Rename or delete a passkey](../../../test-results/chrome/docs/VCST-6121/rename-delete.gif)

Video: VCST-6121-passkey-sign-in.mp4 — being exported, will be attached to this ticket.

Not documented: Admin Shell and back-office passkey sign-in (checklist rows 34, 36 — PASS, not captured in
this rehearsal) · the run's FAIL and BLOCKED rows 25, 30, 32, 35, 38 · a screenshot of the **Delete key** dialog
(it does not appear in a viewport screenshot; its text is quoted above from the page)
Verified on vcptcore · run VCST-6121 vcptcore 2026-10-28 · verdict PASS WITH NOTES · captured 2026-10-30
(theme 2.61.0-pr-2608-86ad-86adb577) · versions run

Sources: vc-module-passkeys README at the deployed commit
(https://github.com/VirtoCommerce/vc-module-passkeys/blob/a25fea03/README.md) · VirtoOZ
StorefrontUserGuide has no passkey page yet · store switch steps observed on vcptcore 2026-10-28
(`reports/ba/Auth/vcst-6121-passkey-sign-in-admin-guide.md`) · testing-checklist rows 1, 4, 7, 8, 13, 24
