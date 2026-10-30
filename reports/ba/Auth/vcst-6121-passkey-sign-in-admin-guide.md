# Manage passkey sign-in

Passkey sign-in lets customers and back-office users sign in with a fingerprint, face, screen lock or security key instead of a password. A passkey is bound to the site it was created on, so the storefront and the back office keep separate keys. Back-office users manage their own passkeys in their user profile; each store switches passkeys on or off under its authentication settings.

## Switch passkeys on or off for a store
Passkeys are on by default for every store.

To change it:
1. Click **Stores** in the main menu.
2. In the next blade, select the store.
3. In the next blade, click the **AUTHENTICATION** widget. The **Store authentication types** blade opens.
4. In the **Is active** column, switch **Passkey** off (or on again).
5. Click **Save** in the toolbar.

After you save, a freshly loaded sign-in page for that store shows no **Sign in with Passkey** button and no passkey autofill, and customers no longer see the **Passkeys** section on their **Security** page.

![The store Passkey switch](../tickets/Sprint26-21/VCST-6121/vcptcore/screenshots/docs/admin-store-passkey-switch.gif)
*Stores → the store → AUTHENTICATION → Store authentication types (shown read-only; the capture account could not save).*

!!! warning "Reload before you trust it"
    The switch is read when a page loads. A sign-in page that was already open before you saved can still complete a passkey sign-in; the store switch is not enforced at that point (VCST-6598, open). Do not rely on it as an instant lock-out; lock the user or remove the key instead.

!!! note
    Passkeys can also be switched off for the whole platform with the `Passkey:Enabled` setting in the application configuration, which needs a platform restart. This was not exercised on the test stand.

## Manage your own passkeys in the back office
Both the classic admin and the Admin Shell have the same user-profile entry.

### Classic admin
1. Open your user profile and select **Sign-in methods**.
2. Click the **+** icon next to **Passkeys**, then confirm in the browser prompt.
3. To rename a key click its edit icon, type the name and confirm; to remove it click the delete icon.
4. To sign in next time, click the **Passkey** link on the login page.

### Admin Shell
1. Open **Account** in the left rail → **Profile**, then click **Sign-in methods** in the **User profile** toolbar.
2. Click **+ Add a passkey** and confirm in the browser prompt. The key is listed as **Unnamed key** — **Device only · Created <date>**.
3. Rename a key inline; delete it from the row.
4. At login click **Sign in with a passkey** (it is shown first; if it is missing on the very first load, reload the page).

![Add a passkey and sign in with it in the Admin Shell](../tickets/Sprint26-21/VCST-6121/vcptcore/screenshots/docs/admin-shell-add-passkey-and-sign-in.gif)
*Profile → Sign-in methods → Add a passkey → sign out → Sign in with a passkey.*

| Rule | Classic admin | Admin Shell |
|------|---------------|-------------|
| Rename to empty | Falls back to **Unnamed key** | Falls back to **Unnamed key** |
| Delete the last remaining sign-in method | Refused by the server, shown only as **"400: Bad request"** (reason under View details) | Delete is disabled |
| Delete the password | Allowed; **"Password is not set"** afterwards | Disabled until a passkey exists |
| Set a password again | No old password needed | No old password needed |

!!! tip
    Setting a password again needs no old password, so a user who deleted theirs by mistake can recover without help.

## Who can do what

| Situation | Result |
|-----------|--------|
| A user removes their only passkey but still has a password | Allowed; password sign-in still works |
| A passkey is the only sign-in method left | Delete refused: **"The last sign-in key cannot be removed."** |
| A passkey created on the storefront, used at the back office (or the reverse) | Not offered, sign-in refused |
| An account with passkey-only sign-in | Reachable, because password deletion is allowed (not an intended scenario in the ticket) |
| An operator signed in on behalf of a customer | Can read the customer's keys; add, rename and delete are refused ("Access denied.") |
| Another user's keys | No administrator view and no endpoint; every user manages only their own keys |

## Lockout, MFA and company rules
- **Lockout still applies.** A temporarily locked or administrator-locked account is refused at passkey sign-in with the same codes as at password sign-in.
- **A passkey sign-in does not reset the failed-password counter.** With four wrong passwords on record, a passkey sign-in leaves the count at four and one more wrong password locks the account. This is by design (VCST-6596 was closed as not a bug).
- **Multi-factor stores.** A passkey sign-in needs no code. Password sign-in is still challenged.
- **One-time-code stores.** The **Sign in with Passkey** button is on the code view.
- **Companies.** A passkey sign-in lands in the last-used company; if it is locked, the user lands in another usable company with no error. A customer with no company signs in without one.

!!! note "Sign-in log"
    Successful passkey sign-ins are logged with Type **Passkey**, the user and the store (back-office sign-ins carry no store). Failed attempts are logged as invalid or missing passkey, or locked out, mostly without a user. Filtering by Type in the sign-in log blade was not confirmed (see the tracker comment); the log REST search filters by `Passkey`.

Sources: VirtoOZ PlatformUserGuide, "Enable Authentication Types" (docs.virtocommerce.org/platform/user-guide/azure-ad/enabling-authentication-types) for the store steps; everything else from the VCST-6121 test run (no VirtoOZ page covers passkeys yet).

Not documented: store switch not enforced on an already-open page (VCST-6598, open); storefront key delete does not end other sessions (VCST-6594, open); sign-in log blade Type filter for Passkey (BLOCKED, not observed); impersonated change-password not refused (Low, pre-existing); real-device verification (Windows Hello, Touch ID, Face ID, Android, FIDO2 key) not done, only a Chromium virtual authenticator; browsers without WebAuthn and the global switch off not verified; username-first sign-in does not exist. Run verdict: PASS WITH NOTES.
