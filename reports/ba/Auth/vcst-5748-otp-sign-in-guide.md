<!-- VCST-5748 OTP sign-in guide — the tracker comment body (Jira wiki markup), amended 2026-10-01 -->
h2. Documentation — VCST-5748

Customers can now sign in to the storefront with a one-time code sent to their email, without entering a password. Store administrators turn this on per store.

h3. For shoppers
# Click *Sign in*. The sign-in page opens with the code form: _"We'll email you a code. No password needed."_
# Enter your *Email* and click *Continue*.
# Open the email *Your sign-in code* and copy the 6-digit code.
# Enter or paste the code. Sign-in starts automatically after the sixth digit.
# You are signed in and return to the page you came from.

!doc-shopper-otp-request.png|width=700!
!r3-fe-01-check-your-email.png|width=700!

* Didn't get the email? Click *Resend code*, or *Use a different email* to start again.
* A wrong or expired code shows _"That code didn't work."_ — request a new code and try again.
* Prefer a password? Click *Sign in with a password instead*.
* After 5 failed attempts (codes or passwords) the account is temporarily locked; wait and try again.

h4. If your last company is no longer available (VCST-6132)
If you belong to more than one company, the storefront remembers the one you used last. When you sign in with a code and that company is no longer usable for you (you were removed from it, your access to it is locked, or your membership is invited, rejected or deleted), you are signed in to another company you can use, the same as with a password.
# Sign in with a code as above.
# Check the company name at the top right of the header: it shows the company you are working in.
# To work in a different company, click your name in the header and pick it under *Organizations*.

!4a-ui-01-A-locked-otp-lands-B.png|width=700!
_Signed in by code after the last-used company was locked: the header shows the other company._

!4a-ui-07-switcher-A-disabled-padlock.png|width=700!
_A locked company stays in the list, greyed out with a padlock, and cannot be selected._

* A locked company shows greyed out with a padlock; hover it to read _"This organization is locked. Contact your administrator for access."_
* A company you were removed from, or where you are invited, rejected or deleted, is not listed.
* Locked in every company: you are signed in with no company selected, and the company pages are not available. Ask your administrator.
* Invited, rejected or deleted in every company: sign-in is refused with a message about your organization.
* If your administrator restores access, your next code sign-in goes back to that company, because the storefront still remembers it.
* Choosing a blocked company in the header is refused.

h3. For administrators
*Install:* module *VirtoCommerce.OTP* (depends on Customer, Notifications, Store) on a Platform version that includes custom grant type handlers, plus a storefront theme with the OTP form.

*Turn on:* click *Stores* in the main menu → select the store → *Settings* widget → *OTP Sign-In → General*.

!doc-admin-otp-setting.png|width=700!

||Setting||What it does||Example||
|Enable OTP sign-in|Shows the code form on the storefront Sign in page (it becomes the default form) and allows code sign-in for this store. Off: password form only; codes already sent are refused.|On|
|Linked stores (store blade, *Links*)|Customers of linked stores can also sign in to this store by code — same rule as password sign-in.|New-super|

*Make sure that:*
* *The storefront host routes {{/api/otp}} to the platform.* On Virto Cloud add the route to the environment's ingress routes ({{infra/environments.yml}} → {{routes}} → {{- path: /api/otp}} / {{route: platform}}). Without it the *Continue* button fails (HTTP 405).
* *Email delivery works.* The code is sent by the notification *OtpSignInEmailNotification* (Store → *Notification*); its sent messages are visible in *Notification log*.
* *Lockout is enabled for the accounts* — accounts without lockout protection cannot use code sign-in. Attempts and lockout time come from the platform identity lockout options ({{IdentityOptions:Lockout}}).
* {{PasswordLogin:DetailedErrors}} — when *true*, the form tells the customer that an email has no account; keep it *false* in production — then the form never reveals whether an account exists or is locked.
* Sign-ins by code appear in *Security → Sign-in log* with the type *OTP*.

h3. For developers
*1. Request a code* — anonymous:
{code}
POST {{BACK_URL}}/api/otp/request
Content-Type: application/json

{ "storeId": "B2B-store", "email": "buyer@example.com" }

200 → { "succeeded": true, "error": null, "maskedEmail": "b•••r@example.com" }
{code}
Errors come back as {{error.code}}: {{store_not_found}}, {{otp_disabled}}, {{user_cannot_login_in_store}}; with {{DetailedErrors}} also {{user_not_found}}, {{lockout_disabled}}.

*2. Exchange the code for tokens* — custom grant {{otp_email}}:
{code}
POST {{BACK_URL}}/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=otp_email&scope=offline_access&storeId=B2B-store&email=buyer@example.com&code=123456

200 → { "access_token": "…", "refresh_token": "…", "expires_in": 1800, … }
400 → { "error": "invalid_grant", "code": "invalid_code", "errorDescription": "The code is invalid or has expired." }
{code}
Other codes: {{missing_parameter}}, {{otp_disabled}}, {{user_is_temporary_locked_out}} (with {{lockoutSecondsRemaining}}), {{user_cannot_login_in_store}}. Optional {{organization_id}} selects the organization, as for the password grant.

*Extending:* the platform exposes {{IGrantTypeHandler}} / {{GrantTypeHandlerBase}}; a module registers its own grant with {{services.AddGrantTypeHandler<THandler>("grant_type")}} — the base class runs the standard sign-in pipeline, events and sign-in log.

----
_VCST-5748 · verified on vcptcore-qa1 · verdict: PASS WITH NOTES · Not documented: homepage login section (not present on the tested store); code sending to a blocked account (fix pending) · Audiences derived from layer: platform + module + storefront_

_Amended for VCST-6132 (blocked last-used organization): developer details in [vcst-6132-otp-organization-fallback-developer-guide.md]; admin effects in the Organization membership status guide (VCST-5281)._
