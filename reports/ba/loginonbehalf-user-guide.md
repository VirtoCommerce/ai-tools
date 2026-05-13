# Login On Behalf — Support Operator Guide

> **Audience:** Support team members who help customers complete tasks (cart, checkout, account changes) on their behalf, and the team leads who grant them access.

---

## 1. What "Login on behalf" does

"Login on behalf" lets a Support team member open the customer-facing storefront and act as a specific customer — browsing their catalog, building their cart, placing orders, and managing their account settings — without knowing the customer's password.

While the session is active, a banner is displayed at the top of every storefront page identifying who the operator is and which customer they are acting as. This ensures the session is visible and auditable at all times. Any order placed during the session is recorded with the Support operator as the **Creator**, so there is always a clear record of who performed the action, even though the order belongs to the customer.

When you are finished helping, you end the session by signing out. The customer's account is unaffected — their data, addresses, and order history remain intact.

---

## 2. Before you start

- **Permission.** Your user account must belong to a Role that includes the **"Login on behalf"** permission. If you do not see the button described in Section 4, ask your team lead to check your Role assignment (see Section 3).
- **Eligible target accounts.** The feature works only on **Customer**-type accounts with a single account record attached. It does not work on Administrator accounts.
- **Browser state.** You must be signed in to the Admin SPA (back office) before you start. The storefront session will open in a **new browser tab**.

---

## 3. Granting the "Login on behalf" permission (Team Lead / Admin)

Permissions in Virto Commerce are managed on **Roles**, not on individual user accounts. To give a Support operator access to this feature:

1. In the Admin SPA, go to **Security** in the left navigation, then open **Roles**.
2. Find the Role assigned to your Support operator (or create a new one if needed).
3. Open the Role and locate the permissions list.
4. Add the permission **"Login on behalf"** (code name: `platform:security:loginOnBehalf`) to the list.
5. **Save** the Role.

The change takes effect on the operator's very next attempt — you do not need to sign them out or restart anything. Removing the permission from the Role blocks all further "Login on behalf" attempts for everyone assigned to that Role, effective immediately on the next attempt.

---

## 4. Starting a "Login on behalf" session (Support Operator)

### 4a. From the Back Office (recommended path)

1. In the Admin SPA, open **Customers** from the left navigation.
2. Find and open the **Contact** record for the customer you need to help.
3. Inside the Contact, open the customer's **Account** (this is the fourth blade that opens to the right).
4. In the Account blade toolbar, locate and click the **"Login on behalf"** button (it has a key icon). The button appears only when the target account is a Customer type.
5. A new browser tab opens with the storefront. Depending on your current sign-in state, you will see one of two flows:

### 4b. From a direct link

If a colleague or automated system sends you a direct URL to `/account/impersonate/{accountId}`, paste it into your browser. You will land on the **Security Verification** page described below — fill in your credentials and continue.

---

### What you will see — Silent flow (you are already signed in to the storefront)

If you are already authenticated on the storefront with your operator credentials AND your Role includes the "Login on behalf" permission, the verification step is skipped. You will briefly see a **"Switching to customer view…"** loader, and then the storefront reloads in the customer's context. Confirm the session has started by checking that the impersonation banner is visible at the top of the page (see Section 5). On fast networks the loader may flash by very quickly — the banner is your confirmation.

### What you will see — Security Verification page (you are not yet signed in to the storefront)

The page displays:

- **Title:** "Security Verification — Confirm your identity to continue"
- **Subtitle:** "You are logging in on behalf of {customer email}. The session will be audited."
- Your **current-account email address** (pre-filled, read-only).
- A **Password** field — enter your own operator password, not the customer's.
- A **"Verify and continue"** button to proceed.
- A **"Cancel"** button to abort.

**On success:** A brief green confirmation message appears and the page reloads, placing you into the customer's storefront session with the impersonation banner visible.

**On wrong password:** An inline alert reads "Login attempt failed. Check your credentials." Re-enter your password and try again. Note that the password field is not automatically cleared after a failed attempt — see Known Issues (Section 8).

**On Cancel:** You are taken to the storefront home page. No session is started.

---

## 5. Working as the customer during a session

- **The banner** at the top of every storefront page confirms who you are acting as: `{your name} logged in as {customer name + organization}`. It persists across catalog, cart, checkout, account, and orders pages.
- **You can:** browse the catalog, add items to the cart, proceed through checkout, place orders, and manage addresses (where the customer is permitted to do so).
- **Order Creator attribution:** Any order you place during the session is assigned to the customer's account, but the **Creator** field on the order is recorded as **you** (the Support operator). This is the audit trail. The customer's order history will show the order; Admin will show you as the Creator.
- **Do not open a second "Login on behalf" link while you are already in a session.** This can switch the customer context silently. Always end the current session before starting a new one (see Known Issues, Section 8).
- **Do not target your own user account.** The feature is designed for Customer accounts only.

---

## 6. Ending a session

1. While in the impersonation session on the storefront, open the **account menu** (your name or account icon, top-right of the storefront header).
2. Click **Logout**.

The customer session ends immediately.

> **Important — current build behavior:** Clicking Logout currently signs you out as the operator as well. After ending a session, you will need to sign back in to the storefront with your own credentials before you can start another session. This is a known limitation tracked in the current build (see Section 8).

---

## 7. Audit and accountability

- **The impersonation banner** is visible to anyone who can see the screen, and is present on every page of the session. It cannot be hidden or dismissed.
- **Orders created during a session** carry your name as the order Creator. This creates an unambiguous audit record — even if the order appears in the customer's history, back-office staff can always see who initiated it.
- **Permission management** is the team lead's responsibility. Because permissions are Role-based, revoking a Role's "Login on behalf" permission immediately prevents all members of that Role from starting new sessions. Review Role assignments periodically to ensure only authorized operators have access.

---

## 8. Known issues in the current build

These are behaviors you should be aware of right now. Fixes are being tracked.

1. **Logging out ends your operator session too.** The account menu only offers "Logout", which signs you out completely. You will need to sign back in as yourself after ending any session.
2. **Do not start a second session while one is active.** Opening a second impersonation link mid-session may silently switch the customer context without re-prompting for credentials. Always end your active session first.
3. **Do not target your own account.** If you navigate to your own impersonate link, the banner will show your name as both the operator and the customer, which is confusing and not the intended use.
4. **The password field is not cleared after a failed attempt.** If "Login attempt failed" appears, clear the field yourself and retype carefully — check Caps Lock.
5. **The "Switching to customer view…" loader may be too fast to read.** On fast connections it disappears in under a second. Check for the impersonation banner as your confirmation that the session is active.
6. **The "Login on behalf" button appears on Administrator accounts.** Clicking it for an Administrator will not produce a working session — Administrator accounts cannot sign in to the storefront. Use this feature on Customer accounts only.

*(See VCST-4905 testing report for the full list of items being tracked.)*

---

## 9. Troubleshooting / FAQ

**I do not see the "Login on behalf" button on the Account page.**
Your Role may not include the "Login on behalf" permission, or the account you have open is not a Customer type (for example, it may be an Administrator). Ask your team lead to verify your Role permissions and confirm the target account type.

**The Security Verification form appears even though I am signed in to the Admin back office.**
Being signed in to the Admin SPA does not automatically sign you in to the storefront — these are separate sessions. Sign in to the storefront once with your operator credentials, then retry the "Login on behalf" link. If you came from the Admin SPA button, the silent flow will take over automatically once you have an active storefront session.

**I clicked "Verify and continue" but got "Login attempt failed. Check your credentials."**
You entered your own operator password incorrectly. Note that the password field is not cleared automatically — retype carefully and check Caps Lock. If you continue to get this error, confirm with your team lead that your Role includes the "Login on behalf" permission.

**I am done helping the customer — what is the cleanest way to end the session?**
Open the account menu (top-right on the storefront) and click **Logout**. In the current build, this signs you out as the operator too, so you will need to sign back in to the storefront afterwards before starting another session.

**Can I jump from one customer to another without signing back in?**
No. End your current session with Logout first, sign back in as your operator account, then start a new "Login on behalf" session for the next customer.

**Where do orders I placed for the customer appear?**
The orders appear in the customer's order history on the storefront and in the Admin Orders module. In Admin, the **Creator** field on each order is set to your name, which is the audit record.

**Why does the storefront open in a new tab?**
So that your Admin SPA session remains open alongside the customer session. You can switch back to the Admin tab at any time.

**Can I log in on behalf of another Support operator or an Administrator?**
No. The feature is intended for Customer accounts only. Attempting it on an Administrator account will not succeed.

---

*Document version: 1.0 (delivered with VCST-4905, Sprint 26-09)*
*Build under test: Platform 3.1026.0 + vc-frontend PR #2279 (vc-theme-b2b-vue 2.49.0-pr-2279-3ce0-3ce07383)*
*Storefront route: `/account/impersonate/{accountId}`*
*Admin SPA entry: Customers → Contact → Account → Toolbar → "Login on behalf"*
