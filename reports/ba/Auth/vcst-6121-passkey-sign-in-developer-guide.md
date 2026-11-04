# Passkey sign-in — Developer Guide

Passkeys (WebAuthn) let a user sign in without a password. This guide shows how to register, list, rename and remove passkeys through the storefront xAPI, how to exchange a passkey assertion for tokens at the platform token endpoint, and how the platform behaves around lockout, stores and sessions. All steps were exercised on a test stand with a Chromium WebAuthn virtual authenticator.

## Prerequisites
- A platform with the Passkeys module and a storefront that exposes the passkey xAPI operations. A store whose **Passkey** authentication type is active (the default).
- A browser with WebAuthn (`navigator.credentials`) over HTTPS. Real devices (Windows Hello, Touch ID, Android, FIDO2 keys) were not part of this run.
- Hosts: `{{FRONT_URL}}` for the storefront and `{{BACK_URL}}` for the platform. A passkey is bound to the host it was created on: the relying-party id is the **request host** and the `Origin` header is ignored. A storefront key is not offered at the back office and a storefront assertion is refused at the cookie endpoint.

## Quick Start — register, then sign in
### Step 1: Read the options and create the credential (signed in as the user)
```graphql
query { passkeyCreationOptions }
```
Send it to `{{FRONT_URL}}/graphql` with the user's Bearer token. Pass the returned options to the browser as `publicKey`. User verification is required, so an authenticator that cannot verify the user yields no key.
```js
const options = PublicKeyCredential.parseCreationOptionsFromJSON(JSON.parse(optionsJson));
const credential = await navigator.credentials.create({ publicKey: options });
const credentialJson = JSON.stringify(credential.toJSON());
```

### Step 2: Save it
```graphql
mutation SavePasskey($credential: String!) {
  createPasskey(command: { credential: $credential }) {
    succeeded
    errors { code description }
  }
}
```
Send `{"credential": <credentialJson>}` as variables. A second key from the same authenticator fails with **"This device already has a passkey for your account."**; a different authenticator adds a second key.

### Step 3: Sign in with the key (no token needed to ask)
```graphql
query { passkeyRequestOptions }
```
It is anonymous and usernameless (`allowCredentials` is empty). Run `navigator.credentials.get` with the options, then exchange the assertion:
```bash
curl -X POST "{{BACK_URL}}/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=passkey" \
  --data-urlencode "scope=offline_access" \
  --data-urlencode "storeId={{STORE_ID}}" \
  --data-urlencode "credential=<assertion JSON>"
```
The response carries `access_token` and, with `offline_access`, a refresh token. Every assertion is single use: fetch fresh options for each grant.

## Manage keys (xAPI, signed in)
```graphql
query { signInMethods { kind name canCreateKey canRenameKey canDeleteKey keys { id name } } }
```
```graphql
mutation { renameSignInKey(command: { signInMethodName: "Passkey", keyId: "<key id>", name: "Work laptop" }) { succeeded errors { code } } }
```
```graphql
mutation { deleteSignInKey(command: { signInMethodName: "Passkey", keyId: "<key id>" }) { succeeded errors { code } } }
```
- A blank or whitespace name is stored as null and listed as **Unnamed key**; markup is returned as text and must be escaped by your UI.
- Deleting the only remaining sign-in method returns `last_sign_in_key`: **"The last sign-in key cannot be removed."** The password counts as a method and can itself be deleted.
- A key id that is not the caller's returns `sign_in_key_not_found`; no operation takes a user id.
- Anonymous calls return an authorization error ("Unauthorized: Anonymous access denied"). An impersonated session (login on behalf) can read `signInMethods` but `passkeyCreationOptions`, `createPasskey`, `renameSignInKey` and `deleteSignInKey` answer "Access denied.".

!!! note
    Argument and field names come from the operations the QA suites executed against the stand; confirm variable types, and that the options arrive as a JSON string as assumed in Step 1, with introspection before you ship a client.

## Token endpoint errors
| Request | Status | `error` / code |
|---------|--------|----------------|
| `credential` missing or empty | 400 | `invalid_request` / `missing_parameters` |
| Bogus, replayed, deleted-key or foreign-host assertion; unknown `storeId` | 400 | `invalid_grant` / `login_failed` |
| Account temporarily locked | 400 | `user_is_temporary_locked_out` |
| Account locked by an administrator | 400 | `user_is_locked_out` |
| `storeId` of a store the user cannot sign in to | 400 | `user_cannot_login_in_store` |
| Grant name in another case | 400 | `unsupported_grant_type` |

Malformed input never produces a 500 and never a token.

## Other doors and behaviour
- **Cookie sign-in (back office):** `POST {{BACK_URL}}/api/platform/security/sign-in` with a JSON body carrying the passkey grant answers 204 on success; bad bodies answer 400, `GET` answers 405, a wrong content type 415.
- **REST (back-office users):** `GET {{BACK_URL}}/api/platform/security/currentuser/sign-in-methods`; delete a key with `DELETE .../currentuser/sign-in-methods/Passkey/keys/{id}`. Allowed for Managers; a Customer gets 403. Anonymous is 401 JSON, not a redirect. `POST {{BACK_URL}}/api/passkeys/creation-options` is also 403 for a Customer.
- **Stores:** the active schemes are in `store.settings.authenticationTypes`. A store with Passkey off shows no button on a freshly loaded page.
- **Lockout:** passkey sign-in honours it. A passkey success does **not** reset `accessFailedCount` (by design).
- **MFA and OTP stores:** a passkey grant returns tokens with no second factor.
- **Organizations:** a credential grant falls back to a usable organization when the last-used one is locked; a user without one gets a token with none.
- **Sign-in log:** rows carry Type `Passkey`. `POST {{BACK_URL}}/api/platform/security/sign-in-log/search` with `"signInTypes": ["Passkey"]` filters them.
- **Global switch:** `Passkey:Enabled` in the application configuration (restart required). Not exercised on the stand.
- **Sessions:** the REST key delete ends the user's other sessions and refresh tokens but keeps the caller's own cookie session. The xAPI delete does not end other sessions (VCST-6594, open).

## Conclusion
Register with `passkeyCreationOptions` and `createPasskey`, sign in with `passkeyRequestOptions` and `grant_type=passkey`, and manage keys through `signInMethods`, `renameSignInKey` and `deleteSignInKey`. For the user-facing steps see the customer and administrator guides for VCST-6121; for one-time-code sign-in see the VCST-5748 OTP guide.

Sources: VCST-6121 test run (suites 114 and 115, checklist items 1, 6-9, 11-13, 16-22, 26-29, 33, 34, 38, 39, 41, 43). VirtoOZ has no passkey page yet.

Not documented: store switch not enforced on an already-open page (VCST-6598, open); storefront key delete does not end other sessions (VCST-6594, open); sign-in log blade Type filter for Passkey (BLOCKED, not observed); impersonated change-password not refused (Low, pre-existing); real-device verification (Windows Hello, Touch ID, Face ID, Android, FIDO2 key) not done, only a Chromium virtual authenticator; browsers without WebAuthn and the global switch off not verified; username-first sign-in does not exist. Run verdict: PASS WITH NOTES.
