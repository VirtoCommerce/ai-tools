# Login On Behalf for Company Employees — Storefront User Guide

> **Audience:** Company Maintainers and Organisation Employees who help colleagues from inside the storefront (e.g., when a teammate is on sick leave or vacation), and the administrators who grant them access.
> **Story:** [VCST-4906](https://virtocommerce.atlassian.net/browse/VCST-4906) — Login On Behalf for Company Employee · Epic [VCST-4903](https://virtocommerce.atlassian.net/browse/VCST-4903)
> **Companion guide:** Need the Support / back-office variant (Admin SPA → Customers → Account → "Login on behalf" button)? See [`loginonbehalf-user-guide.md`](./loginonbehalf-user-guide.md). The two flows complement each other — they share the same audit model, banner, and revert behaviour, but the entry points and audience differ.

---

## 1. What "Login on behalf" does for a company employee

Login on behalf lets you — an authorised member of an organisation — open the storefront as one of your **colleagues in the same organisation** so you can keep their work moving while they're away. You can browse their catalog, complete carts, place orders, and use their company account features. You never see or enter their password.

Two pieces of glass keep the session safe and auditable:

- A **banner** at the top of every page identifies you as the operator and the colleague you're acting as.
- Every order you create is **assigned to your colleague's account** but records **you as the Creator** — so there is always a paper trail.

When you're done, you click **"Back to {your name}"** in the account menu (mobile: in the main menu) and your own session is restored instantly — no re-sign-in.

---

## 2. Before you start

- **Permission.** Your role must include the **Login on behalf** permission (back-office code: `platform:security:loginOnBehalf`; storefront equivalent: `StorefrontPermissions.CanImpersonate`). If you do not see the new action in the Actions menu on `/company/members`, ask your admin to update your role (see Section 3).
- **Scope.** This feature is scoped to **My Organization** only. You can only act on behalf of company members who share an organisation with you. Cross-organisation impersonation is not offered from this surface.
- **Eligible targets.** Only members who already have a security (login) account are valid targets. Members shown in the table but who have never signed in (no security account) cannot be impersonated from this screen.
- **You must be signed in to the storefront** as your own operator account first. The action is exposed on the **Company → Members** page only.

---

## 3. Granting the permission (Admin / Team Lead)

Permissions live on **Roles**, not on individual user accounts. To give a Company Maintainer or Employee access:

1. In the Admin SPA, go to **Security → Roles**.
2. Open the Role that's assigned to the operator you want to authorise (or create one — e.g., "Org Maintainer with login-on-behalf").
3. In the Role's permission list, add **Login on behalf** (key: `platform:security:loginOnBehalf`).
4. **Save** the role.
5. Make sure the user account is assigned to that role.

The change takes effect on the operator's **next** action — no sign-out required. Removing the permission from the role removes the action for everyone in that role, effective on their next attempt.

---

## 4. Starting a "Login on behalf" session (Operator)

1. Sign in to the storefront with your own account.
2. Open **Company → Members** (URL: `/company/members`).
3. Find the member you want to act on behalf of. They must be in the **same organisation** as you and have a security account.
4. Click the **Actions** button at the end of their row. The dropdown shows the actions your role allows (e.g., **Edit role**, **Block user**, **Delete**, and the new **Login on behalf**).
5. Click **Login on behalf**.

### What the confirmation modal looks like

A modal opens with:

- **Title:** *Login on behalf*
- **Body:** *"You are logging in on behalf of {colleague email}. The session will be audited."*
- Two buttons: **Cancel** and **OK** (the spec wording is "Continue" — see Known Issues §10.1).

### What each button does

- **OK / Continue** — Briefly shows a *"Switching to customer view…"* loader, then reloads the storefront into your colleague's session. The session-active banner appears at the top of the page (see Section 5). On fast connections the loader flashes by so quickly you may not see it — the **banner** is your confirmation that the switch succeeded.
- **Cancel** — Closes the modal. You stay on `/company/members` with your own session unchanged. No token is requested, no audit trail created. Pressing the browser **Back** button or **Escape** while the modal is open does not close it — use the Cancel button explicitly.

If the network request to switch sessions fails (e.g., server is unreachable), you'll see a red alert reading **"Verification succeeded, but switching to the customer account failed. Please try again."** Click OK in the modal again to retry. Your own session is preserved — no need to sign in again.

---

## 5. Working as your colleague during a session

- The **banner** at the top of every storefront page confirms the active impersonation: `{your name} logged in as {colleague's name + organisation}`. It persists across catalog, cart, checkout, account, and orders pages — and across browser tabs (see §6).
- You can **browse the catalog**, **add items to the cart**, **proceed through checkout**, **place orders**, and **manage account settings** — wherever your colleague's own role allows it. You inherit their permissions during the session, not your own.
- **Order Creator attribution.** Orders you place are saved against the colleague's account, but the **Creator** field on each order is your name. This is the audit record: the colleague's order history shows the order, and the back-office shows you as the originator.
- **Mobile.** The banner and revert action are also available in the mobile main menu. Tap the hamburger icon to see the impersonation status and the **Back to {your name}** action.

---

## 6. Cross-tab behaviour

If you start an impersonation in one browser tab while other tabs are open:

- **Other open tabs reload automatically** and switch to the colleague's session. Their URLs may change to the home page (`/`); URL state is not preserved across the tab broadcast. The banner appears on every reloaded tab.
- **Reverting in any tab** propagates back the same way: other tabs reload and restore your own session.
- **Logging out in any tab** signs you out everywhere — including other open tabs.

This is intentional so that the banner and the active identity are consistent across every tab you have open. **Recommendation:** close any unrelated tabs before starting an impersonation so you don't lose unsaved work elsewhere.

---

## 7. Ending a session

You have two ways to end an impersonation:

### 7a. Revert — restore your own session (recommended)

1. Open the **account menu** in the top-right of the storefront header (or, on mobile, the **main menu** hamburger).
2. Click **Back to {your name}** (e.g., *"Back to John Mitchell"*) — the entry is personalised to your operator name.

The page transitions back to your own session in place. The banner disappears, your operator identity is restored, and you stay on the storefront — no re-sign-in is required. This is the cleanest end to a session and the one you should use by default.

### 7b. Logout — clear everything

Open the account menu and click **Logout**. This ends both the impersonation **and** your operator session. You'll be returned to the public storefront and will need to sign in again before starting another session.

---

## 8. Audit and accountability

- **The banner is non-dismissable.** It is present on every page of the storefront for the duration of the session. You cannot hide it.
- **Orders carry your name as Creator.** This is your audit trail in the back office. Even though the order appears in the colleague's order history, the Creator field on the order record identifies you.
- **Permission management is role-based.** Removing the "Login on behalf" permission from a role immediately prevents all members of that role from starting new sessions. Active sessions are not affected — they continue until the operator reverts or the token expires (~30 minutes). Periodically review which roles carry this permission.
- **Use the revert action ("Back to …") rather than Logout when you're switching between two colleagues.** Reverting keeps your own session alive; Logout forces a fresh sign-in.

---

## 9. Internationalisation

The new strings introduced in PR #2280 are fully translated for all supported locales (verified end-to-end in German, `de-DE`). For example, in German:

| Element | English | German |
|---|---|---|
| Actions menu item | Login on behalf | Im Namen anmelden |
| Modal title | Login on behalf | Im Namen anmelden |
| Modal body | "You are logging in on behalf of {email}. The session will be audited." | "Sie melden sich im Namen von {email} an. Die Sitzung wird protokolliert." |
| Revert action | Back to {operator name} | Zurück zu {operator name} |

The banner connector text ("logged in as") is rendered in English in non-English locales — this is a pre-existing, repository-wide string and not specific to this story. The product team is aware.

---

## 10. Known issues in the current build

These are visible behaviours in the build under test (`vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2`) that you should know about. None are release-blocking from the user's point of view, but you'll see them on screen.

1. **Modal confirm button is labelled "OK" instead of "Continue".** The acceptance criteria specified "Continue"; the live build renders "OK". The behaviour is identical — clicking OK starts the impersonation. Cosmetic only.
2. **The revert action is personalised: "Back to {your name}".** The original spec said *"Revert back to own account"*; the live build personalises the label. We consider the personalised form clearer (it tells you whose session you'll return to) and recommend keeping it.
3. **The "Switching to customer view…" loader may be too fast to read.** On a fast connection it flashes by in well under a second. The banner is your real confirmation that the impersonation succeeded.
4. **Other tabs navigate to the home page after a cross-tab broadcast.** If you had another tab open on `/catalog` and start an impersonation in Tab A, Tab B will reload and land on `/` — not back on `/catalog`. URL state on other tabs is not preserved.
5. **Multiple row Actions dropdowns can be open at the same time.** Clicking Actions on a second row does not close the first row's dropdown. Always click directly on the row you intend — and if anything looks off, close the dropdowns and reopen them on the row you want. (Mouse users will see the correct target in the modal regardless; this caution is for keyboard users.)
6. **Accessibility — known shortcomings in this build:** the row Actions trigger is not yet keyboard-focusable (missing `tabindex`); the modal's OK/Close buttons have no visible focus ring; the session banner is not announced to screen readers. Keyboard- and screen-reader-only users will have difficulty using this flow until these are fixed. Mouse users are not affected. Fixes are being tracked separately.
7. **Stale-token safety — current build limitation.** When you click **Back to {your name}**, your colleague's session token is dropped from your browser but is not revoked on the server until it naturally expires (~30 minutes later). For everyday use this is invisible; it matters only if your browser is compromised by an extension or you allow someone untrusted to access your device. As a precaution: do not share your device while an impersonation is or was recently active, and avoid running untrusted browser extensions on the storefront. A server-side fix is planned.
8. **"Login on behalf" does not appear for members without a security account.** This is intentional — there is no account to sign in as. If you don't see the action on a member's row, confirm the member has been invited and has signed in at least once. The action will appear once their account is active.
9. **Locked / not-yet-confirmed colleagues.** Attempting to impersonate a colleague whose account is locked or whose email is not yet confirmed will fail with a server-side error. Your own session is preserved. Ask your admin to unlock the account or to send a fresh invite, then try again.

---

## 11. Troubleshooting / FAQ

**I don't see "Login on behalf" in the Actions menu for any member.**
Your role probably doesn't include the permission. Ask your admin to add **Login on behalf** to your role (see Section 3).

**I see "Login on behalf" on most rows but not on one specific colleague.**
That colleague doesn't have a security account yet (they've been invited but have never signed in), or their account is locked/blocked. Use the back-office (Admin SPA) to resend the invite or unlock the account.

**The modal closed but nothing happened — am I still myself?**
Check the banner at the top of the page. If there is no `{your name} logged in as ...` banner, the session did not switch and you're still yourself. Try the action again. If the "Switching…" loader is still visible after a few seconds, wait — the server may be slow.

**I clicked OK and got an error: "Verification succeeded, but switching to the customer account failed."**
The network or server hiccuped during the switch. Your own session is intact. Close the error, click **Actions → Login on behalf** again, and confirm. If the error keeps happening, capture the time and a screenshot and report it to your admin.

**I placed orders for my colleague — where do they show up?**
The orders appear in the colleague's order history and in the back-office Orders module. In the back-office, the **Creator** field on each order is your name — that is the audit record.

**Can I jump from one colleague to another without going back to myself?**
The cleanest flow is: **Back to {your name}** to restore your own session, then start a new "Login on behalf" on the next colleague. This makes the audit trail crisp and avoids the cross-tab broadcast surprising you on a tab you forgot was open.

**What happens to my own cart during an impersonation?**
Your operator cart is parked while you act on behalf of your colleague — you'll see *their* cart on `/cart`. When you click **Back to {your name}**, your own cart is restored.

**Does this work on mobile?**
Yes. The Actions dropdown, the modal, the banner, and the **Back to {your name}** action are all present in the mobile main menu (375 px and above tested). Touch targets are full-width list items.

**Does the impersonation work across multiple browser tabs?**
Yes — see Section 6. Starting, reverting, and logging out all propagate across tabs.

**Can I log in on behalf of someone in a different organisation?**
Not from this screen. The Company → Members page only lists members of your own organisation. Cross-organisation flows are limited to back-office Support staff using the Admin SPA path (see the [companion guide](./loginonbehalf-user-guide.md)).

**Where do I report a bug or issue with the feature?**
File a Jira ticket under the **VirtoStart** project, linked to epic VCST-4903. Include: the colleague you tried to act on behalf of (don't include their password — you never see it anyway), the screen on which the issue occurred, a screenshot, and the time. Your admin or the product team will pick it up.

---

## 12. Reference — what changed in this story

For completeness — internal/QA-facing details. End users can skip this section.

| Area | What VCST-4906 added | Notes |
|---|---|---|
| Entry point | New **Login on behalf** action in `MembersDropdownMenu` on `/company/members` | Gated by `StorefrontPermissions.CanImpersonate` AND the target having a security account |
| Confirmation modal | New modal with target email + Cancel/OK | Label says "OK" in build under test (spec said "Continue") |
| Revert flow | New **Back to {operator}** action in desktop top header + mobile main menu | Personalised label |
| Loader overlay | `VcLoaderOverlay` extended with slot content for "Switching…" / "Reverting…" | Sub-second on fast networks |
| Cross-tab broadcast | `TabsType.OTHERS` — other tabs reload, current tab navigates | Other tabs may lose URL state and land on `/` |
| i18n | 13 locales updated with new strings | German verified end-to-end |
| Permission key | `platform:security:loginOnBehalf` (back-office) ≡ `StorefrontPermissions.CanImpersonate` (storefront) | Same gate, different surface names |

**Source artefacts:** [PR #2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) · build `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` · platform `3.1026.0` · evidence in `tests/Sprint-current/VCST-4906/`.

---

*Document version: 1.0*
*Date: 2026-05-14 · Sprint 26-09*
*Companion guide for the back-office Support flow: [`loginonbehalf-user-guide.md`](./loginonbehalf-user-guide.md)*
*Storefront entry: `/company/members` → row Actions → **Login on behalf***
*Audit signal: order `Creator` field carries the operator's name; banner visible on every page during the session*
