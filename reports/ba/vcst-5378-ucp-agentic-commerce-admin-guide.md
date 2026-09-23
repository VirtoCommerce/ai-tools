# Configure UCP Agentic Commerce (MCP) Access

UCP (Universal Commerce Protocol) lets an external AI shopping agent connect to your store over
MCP, shop the catalog, and — if you choose to allow it — check out as one of your signed-in
buyers. As the Platform administrator, you control which agent clients may authenticate, and
where the MCP endpoint and OAuth login are exposed.

!!! warning "This build is still moving"
    The environment this guide was verified against runs open, unmerged PR-head builds of the
    Platform, the UCP module and the storefront — not a released version. Tool behavior has
    already changed twice during this ticket's own testing (an argument became required; a new
    tool was added). Re-run the **Verify your setup** section below after every deploy.

## Overview

Enabling UCP for a store involves three separate configuration surfaces:

1. **Platform authorization** — declaring the MCP endpoint as an OAuth-protected resource.
2. **An OAuth client** — the credential an agent (e.g. Claude Desktop) authenticates with.
3. **Store/module settings** — which store an untagged call resolves to, and the handoff's
   validity window.

## 1. Configure Platform authorization

> **Configuration reference — not verified by the VCST-5378 run.** This is a Platform
> configuration change (appsettings / environment config), not an Admin SPA blade — the module
> ships no dedicated settings screen for it on this build.

Add the MCP endpoint as a protected resource and point the OAuth login at the storefront's
handoff page:

```json
{
  "Authorization": {
    "Resources": ["{{FRONT_URL}}/ucp/mcp"],
    "OAuthLoginPath": "/oauth/authorize"
  }
}
```

If `Resources` already lists other addresses, add this one to the list rather than replacing it.
**Restart the Platform** after saving — the setting is read at startup.

!!! note
    Confirmed live this run: `GET {{FRONT_URL}}/.well-known/ucp` and `get_store_capabilities`
    report the **same** authorization server from both the Platform and the storefront host, and
    it names `{{FRONT_URL}}/oauth/authorize` — so this configuration is the one actually in effect
    on the verified build.

## 2. Register an OAuth client for the agent

> **Configuration reference — not verified by the VCST-5378 run.** As of this build the OAuth
> Applications form does not expose every field a UCP client needs, so registration is done from
> an authenticated Manager session's browser console rather than the form.

1. Sign in to the Platform Manager as an administrator, on the same Platform instance that serves
   the storefront you configured above.
2. Open the browser's developer tools (F12) → **Console**, and run:
   ```javascript
   (async () => {
     const api = angular.element(document.body).injector().get("platformWebApp.oauthapps");
     const app = await api.new().$promise;
     app.displayName = "<a descriptive name for this agent client>";
     app.clientType = "public";
     app.clientSecret = null;
     app.consentType = "systematic";
     app.redirectUris = ["<the callback URL your MCP client listens on>"];
     app.permissions = ["rsrc:{{FRONT_URL}}/ucp/mcp"];
     const saved = await api.save({}, app).$promise;
     console.log("CLIENT_ID:", saved.clientId);
     console.log("CLIENT_TYPE:", saved.clientType);
     console.log("REDIRECT_URIS:", saved.redirectUris);
     console.log("PERMISSIONS:", saved.permissions);
   })().catch(console.error);
   ```
3. In the console output, verify:
   - `CLIENT_TYPE` is `public` (no client secret is issued or needed).
   - `REDIRECT_URIS` contains exactly the callback URL your agent client uses.
   - `PERMISSIONS` contains `rsrc:{{FRONT_URL}}/ucp/mcp`. If this permission is missing after
     saving, the Platform build does not yet preserve it and needs updating.
4. Record the printed `CLIENT_ID` — hand it to whoever configures the agent client (§4). Never
   record a `client_secret`; a public client has none.

!!! note
    The **result** of this registration is confirmed live: a token issued for this permission
    resolves `organization_id` from the token alone, and a forged `organization_id` argument in a
    tool call is ignored.

## 3. Store and module settings

- **Default store.** Every MCP call on this build must resolve to a store. When the configuration
  key `UCP:DefaultStoreId` is not set, an agent call with no explicit `store_id` argument is
  rejected: `400 missing_store_id` — `"store_id or context.store_id is required when
  UCP:DefaultStoreId is not configured."` Observed live on the verified environment, where the key
  is unset. Setting the key so
  agents can omit `store_id` is *configuration reference — not verified by the VCST-5378 run*.
- **Handoff validity window (TTL).** A minted handoff link is only redeemable for a limited time
  — observed at 15 minutes on this build. Where this value is configured was not
  exercised by this run — verify the current window on your own environment rather than assuming
  15 minutes.

## 4. Wire the MCP client

> **Configuration reference — not verified by the VCST-5378 run.** The interactive
> authorization-code flow through an actual MCP client was not exercised by the verification;
> tokens were obtained directly against `/connect/token` instead.

For a client that supports `mcp-remote` (e.g. Claude Desktop):

1. Create two local files the client will read at startup:
   - `client-info.json`: `{ "client_id": "<CLIENT_ID from §2>", "token_endpoint_auth_method": "none" }`
   - `client-metadata.json`: `{ "scope": "openid profile offline_access", "token_endpoint_auth_method": "none" }`
2. Add an entry to the client's MCP server configuration:
   ```json
   {
     "mcpServers": {
        "ucp-qa": {
        "command": "npx",
        "args": [
          "-y",
          "mcp-remote",
          "{{FRONT_URL}}/ucp/mcp",
          "8766",
          "--host",
          "localhost",
          "--transport",
          "http-only",
          "--static-oauth-client-info",
          "@C:\\ucp-qa\\client-info.json",
          "--static-oauth-client-metadata",
          "@C:\\ucp-qa\\client-metadata.json",
          "--resource",
          "{{FRONT_URL}}/ucp/mcp",
          "--authorize-param",
          "prompt=login",
          "--auth-timeout",
          "600"
        ],
        "env": {
          "MCP_REMOTE_CONFIG_DIR": "C:\\ucp-qa\\"
        }
      }
     }
   }
   ```
3. Fully restart the client. Sign-in opens a browser at your storefront's authorization page; the
   buyer signs in, consents, and the client redirects back to the configured callback.

## Verify your setup

1. Request the discovery manifest from **both** hosts:
   ```
   GET {{BACK_URL}}/.well-known/ucp
   GET {{FRONT_URL}}/.well-known/ucp
   ```
   Both must report the **same** MCP service endpoint.
2. Against that endpoint, call `tools/list` and confirm it returns the tool count your build
   currently advertises (18 on the verified build — re-check, this has already changed once).
3. Confirm `get_store_capabilities.auth.authorization_server` matches the `/oauth/authorize` route
   you configured in §1.

!!! success
    If all three checks agree, an agent can discover your store and — once a buyer authorizes a
    registered client — shop, check out and hand off as that buyer.

## Known limitations

- **An agent-supplied shipping address overwrites the buyer's existing saved cart address**
  instead of being scoped to the order snapshot. If a buyer reports their saved address changed
  after an agent checkout, this is the known cause — a product decision is pending, it is not
  yet configurable away.
- **No tool revokes a minted handoff.** `logout_buyer` ends the agent's OAuth session but a
  handoff link minted before the call remains fully redeemable until it expires or is used.
- **A raw handoff session token has been observed leaving the browser in cleartext to
  third-party analytics** and retained in platform telemetry — filed as VCST-6053 (High), open.
  This is a known issue, not documented behavior; do not treat the token as safe for logging or
  forwarding.

---
*Sources: VCST-5378 verification on the QA environment. VirtoOZ carries no UCP page — every claim above is observed live or a labelled configuration reference.*

<div style="display: flex; justify-content: space-between;">
<span></span>
<a href="vcst-5378-ucp-agentic-commerce-developer-guide.md">UCP Developer Guide →</a>
</div>
