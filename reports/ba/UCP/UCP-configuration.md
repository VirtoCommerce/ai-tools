You need to register an OAuth client in the QA Platform once, then specify its client_id in Claude Desktop. This option does not require a client_secret.

**Clarification to the previous answer:** the current OAuth applications form doesn't let you fill in all the required fields, so the registration below is done through the API from an open Manager session.

### 1. For the QA administrator: check the Platform settings

The configuration of the Platform serving vcst-qa-storefront.govirto.com must contain:

```json
{
  "Authorization": {
    "Resources": [
      "{{FRONT_URL}}/ucp/mcp"
    ],
    "OAuthLoginPath": "/oauth/authorize"
  }
}
```

If Resources already contains other addresses, add the MCP address to the existing ones. Restart the Platform after changing the configuration.

The Platform and storefront changes for OAuth via /oauth/authorize must also be deployed. These requirements are described in the [module README (line 231)](C:/Source/vc-modules/vc-module-u-c-p/README.md:231).

### 2. Create an OAuth client on QA

Open the QA Platform Manager as an administrator. It must be the admin panel of the Platform connected to that storefront; its address can't be determined from the screenshot.

Open F12 → Console and run:

```javascript
(async () => {
  const api = angular.element(document.body)
    .injector()
    .get("platformWebApp.oauthapps");
  const app = await api.new().$promise;
  app.displayName = "Claude Desktop QA";
  app.clientType = "public";
  app.clientSecret = null;
  app.consentType = "systematic";
  app.redirectUris = [
    "http://localhost:8766/oauth/callback"
  ];
  app.permissions = [
    "rsrc:{{FRONT_URL}}/ucp/mcp"
  ];
  const saved = await api.save({}, app).$promise;
  console.log("CLIENT_ID:", saved.clientId);
  console.log("CLIENT_TYPE:", saved.clientType);
  console.log("REDIRECT_URIS:", saved.redirectUris);
  console.log("PERMISSIONS:", saved.permissions);
})().catch(console.error);
```

The code creates the application through the Manager API using the current administrator session.

In the output, verify that:
- CLIENT_TYPE is `public`;
- REDIRECT_URIS contains `http://localhost:8766/oauth/callback`;
- PERMISSIONS contains `rsrc:{{FRONT_URL}}/ucp/mcp`.

Copy the printed CLIENT_ID — this is the value you need. If the `rsrc:...` permission is missing after saving, the Platform on QA needs to be updated: the tested version of the controller preserves this permission.

### 3. Create two files on the computer running Claude

Create the folder `C:\ucp-qa`.

File `C:\ucp-qa\client-info.json`:

```json
{
  "client_id": "INSERT_CLIENT_ID_FROM_STEP_2",
  "token_endpoint_auth_method": "none"
}
```

File `C:\ucp-qa\client-metadata.json`:

```json
{
  "scope": "openid profile offline_access",
  "token_endpoint_auth_method": "none"
}
```

In the first file, replace the placeholder text with the real ID, keeping the quotes.

### 4. Configure Claude Desktop

Fully close Claude, including the tray icon.

Press Win+R and paste:

```
%APPDATA%\Claude
```

Make a backup copy of `claude_desktop_config.json`, then open the original file.

In the `mcpServers` object, replace the current entry for this QA UCP connection with the following. If there are no other connections, the whole file will look like this:

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
        "MCP_REMOTE_CONFIG_DIR": "C:\\ucp-qa\\auth"
      }
    }
  }
}
```

Keep any other connections in `mcpServers`. Replace the old entry for this same UCP so Claude doesn't keep connecting through it.

The `--static-oauth-client-info` parameter passes the pre-registered client and removes the need for dynamic registration. The `@path` format is supported per the mcp-remote documentation.

### 5. Launch and verify sign-in

Launch Claude Desktop, open a new chat, and type:

> Call link_buyer_identity to connect my buyer account.

Expected result:
1. A browser opens with the QA storefront authorization page.
2. Sign in as the buyer you want to use in Claude.
3. Confirm access if prompted.
4. The browser redirects to `http://localhost:8766/oauth/callback`.
5. Authorization completes; then repeat the original request in Claude.

`localhost:8766` is the address of the handler on the user's computer; do not replace it with the QA address.

### 6. If an error occurs

| Error | What to check |
|---|---|
| `does not support dynamic client registration` | Claude is using the new entry; the path to client-info.json is correct; the app was fully restarted. |
| `invalid_client` | The client_id is registered in the QA Platform specifically, and its type is public. |
| redirect_uri error | The registration specifies exactly `http://localhost:8766/oauth/callback`. |
| `invalid_target` | The MCP address is added to `Authorization:Resources`, and the client has the corresponding `rsrc:...` permission saved. |
| 404 on `/oauth/authorize` | The OAuth continuation page isn't deployed on the storefront, or the route is misconfigured. |
| Port 8766 is in use | Close any other mcp-remote instance using that port. |