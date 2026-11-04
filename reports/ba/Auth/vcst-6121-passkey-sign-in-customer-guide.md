# Sign in with a passkey

### Introduction
A passkey lets you sign in to the store with your fingerprint, face, screen lock or PIN, so you do not have to type a password. You add a passkey once on your **Security** page, then use it on the sign-in page.

*Walkthroughs captured on the test stand with a virtual authenticator; on a real device the browser shows its own fingerprint / face / PIN prompt at the confirm step.*

### Prerequisites
- You have an account and can sign in with your usual email and password.
- Your device has a screen lock, fingerprint or face unlock set up (the browser asks you to use it).
- Your store has passkeys switched on. If you see no **Sign in with Passkey** button on the sign-in page, ask your administrator.

### Add a passkey
1. On the sign-in page click **Sign in with a password instead** (the page opens on the one-time-code view), then sign in with your email and password.
2. Click your name to open your account, then **Security** in the **USER** group. The **Passkeys** section shows **You have no passkeys yet.** if this is your first one.
3. Click **Add passkey**.
4. Confirm with your fingerprint, face, screen lock or PIN when the browser asks.
5. The new key appears in the list as **Unnamed key**, with the label **Device only** and its creation date. It stays in the list after you reload the page.

![Adding a passkey](../tickets/Sprint26-21/VCST-6121/vcptcore/screenshots/docs/shopper-add-passkey.gif)
*Sign in with a password, open Security, click Add passkey.*

![The new key in the list](../tickets/Sprint26-21/VCST-6121/vcptcore/screenshots/docs/shopper-add-passkey-05-key-listed.png)
*The key is listed as Unnamed key — Device only · Created <date, time>.*

!!! note "Why does my key show as 'Unnamed key'?"
    You have not given it a name yet. Rename it (below) so you can tell your keys apart.

!!! note "Can I add the same device twice?"
    No. If you try, you see **"This device already has a passkey for your account."** and the list does not change. A different device or security key can add its own passkey.

### Rename a passkey
1. On your **Security** page, click **Edit** next to the key.
2. Type the new name and confirm.
3. If you leave the name empty, the key goes back to **Unnamed key**. Very long names are shortened in the list.

### Sign in with a passkey
1. Open the sign-in page and click **Sign in with Passkey**.
2. Confirm with your fingerprint, face, screen lock or PIN.
3. You are signed in and return to the page you came from. If you belong to a company, its name shows in the header.

![Signing in with a passkey](../tickets/Sprint26-21/VCST-6121/vcptcore/screenshots/docs/shopper-sign-in-with-passkey.gif)
*Logout → Sign in with Passkey → signed in, no email or password typed.*

**Faster:** click the **Email** field on the sign-in page. Your browser offers your passkey in the list. Choose it and you are signed in.

!!! note "Which company do I land in?"
    You land in the company you used last. If that company is locked or no longer available to you, you are signed in to another company you can use. Pick a different one under your name in the header.

!!! note "Does my store still ask for a code?"
    No. When your store asks for a one-time code at password sign-in, a passkey sign-in does not. If your store offers sign-in by emailed code, the **Sign in with Passkey** button is also on that code screen.

### Remove a passkey
1. On your **Security** page, click **Delete** next to the key.
2. The **Delete key** dialog says "You will no longer be able to sign in with this key." Click **OK**. Only that key is removed; your other keys and your password still work.

!!! warning "You cannot remove your last way to sign in"
    If the passkey is the only sign-in method you have left, you see **"The last sign-in key cannot be removed."** and the key stays. Keep your password, or add another passkey, before you remove this one.

### Good to know
- A passkey belongs to the site where you created it. A key made on the store does not work on the back office, and the other way round.
- A signed-in sales representative acting on your behalf can see your passkeys but cannot add, rename or delete them.
- If your account is locked, a passkey does not unlock it. You see **"Your account has been temporarily locked. Please try again later."** for a temporary lock.
- Signing in with a passkey does not clear earlier wrong-password attempts. Five wrong passwords still lock the account, even if you signed in with a passkey in between.

### Troubleshooting
- **Nothing happens when I click Sign in with Passkey** — this device has no passkey for this site, or you cancelled. Sign in with your password and add a passkey on your **Security** page.
- **"Login attempt failed" appears by itself on the sign-in page** — your device still holds a passkey that was deleted from your account. Sign in with your password; the message goes away once you remove the old key from your device.
- **The "This device already has a passkey" message stays on screen** — close it with its close button; it can cover the account menu.

Not documented: store switch on an already-open page (VCST-6598, open); other sessions after a storefront key delete (VCST-6594, open); real-device checks (not done, only a virtual authenticator); browsers without passkey support (not verified); username-first sign-in does not exist. Run verdict: PASS WITH NOTES.
