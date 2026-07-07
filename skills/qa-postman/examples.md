# Postman MCP — Quick-Copy Examples

Copy-paste-ready collection and environment payloads. Replace `WORKSPACE_ID_HERE` with your workspace ID (default `8bd7a5b3-73e5-4414-a9c9-d59018b44079` for VirtoPlatform — see [mcp-tools.md](mcp-tools.md)) and substitute env values before calling.

---

## Example A — Auth-Only Collection (Minimal)

Use this as a starting point for any new collection.

```json
{
  "workspace": "WORKSPACE_ID_HERE",
  "collection": {
    "info": {
      "name": "VC API — Auth Test",
      "description": "Verifies OAuth2 token acquisition and basic auth flows",
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "auth": {
      "type": "bearer",
      "bearer": [{ "key": "token", "value": "{{authToken}}", "type": "string" }]
    },
    "item": [
      {
        "name": "Get Admin Token",
        "request": {
          "auth": { "type": "noauth" },
          "method": "POST",
          "url": "{{baseUrl}}/connect/token",
          "header": [{ "key": "Content-Type", "value": "application/x-www-form-urlencoded" }],
          "body": {
            "mode": "urlencoded",
            "urlencoded": [
              { "key": "grant_type", "value": "password" },
              { "key": "username", "value": "{{admin}}" },
              { "key": "password", "value": "{{adminPassword}}" },
              { "key": "scope", "value": "openid offline_access" }
            ]
          }
        },
        "event": [{
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "var data = pm.response.json();",
              "pm.test('Token received', () => pm.expect(data.access_token).to.be.a('string'));",
              "pm.environment.set('authToken', data.access_token);"
            ]
          }
        }]
      },
      {
        "name": "Verify Token — Get Store",
        "request": {
          "method": "GET",
          "url": "{{baseUrl}}/api/stores/{{storeId}}"
        },
        "event": [{
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('Store accessible with token: 200', () => pm.response.to.have.status(200));",
              "var data = pm.response.json();",
              "pm.test('Store ID matches', () => pm.expect(data.id).to.eql(pm.environment.get('storeId')));"
            ]
          }
        }]
      },
      {
        "name": "Invalid Credentials — Expect 400",
        "request": {
          "auth": { "type": "noauth" },
          "method": "POST",
          "url": "{{baseUrl}}/connect/token",
          "header": [{ "key": "Content-Type", "value": "application/x-www-form-urlencoded" }],
          "body": {
            "mode": "urlencoded",
            "urlencoded": [
              { "key": "grant_type", "value": "password" },
              { "key": "username", "value": "nonexistent@example.com" },
              { "key": "password", "value": "wrongpassword" },
              { "key": "scope", "value": "openid offline_access" }
            ]
          }
        },
        "event": [{
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "pm.test('Invalid creds rejected: 400', () => pm.response.to.have.status(400));"
            ]
          }
        }]
      }
    ]
  }
}
```

---

## Example B — CRUD Workflow with Chaining

```json
{
  "workspace": "WORKSPACE_ID_HERE",
  "collection": {
    "info": {
      "name": "VC API — Catalog CRUD",
      "description": "Create, Read, Update, Delete a catalog with request chaining",
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "auth": {
      "type": "bearer",
      "bearer": [{ "key": "token", "value": "{{authToken}}", "type": "string" }]
    },
    "variable": [
      { "key": "catalogId", "value": "", "description": "Created catalog ID" }
    ],
    "item": [
      {
        "name": "00-Auth",
        "item": [{
          "name": "Get Token",
          "request": {
            "auth": { "type": "noauth" },
            "method": "POST",
            "url": "{{baseUrl}}/connect/token",
            "header": [{ "key": "Content-Type", "value": "application/x-www-form-urlencoded" }],
            "body": {
              "mode": "urlencoded",
              "urlencoded": [
                { "key": "grant_type", "value": "password" },
                { "key": "username", "value": "{{admin}}" },
                { "key": "password", "value": "{{adminPassword}}" },
                { "key": "scope", "value": "openid offline_access" }
              ]
            }
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Auth OK', () => pm.response.to.have.status(200));",
            "pm.environment.set('authToken', pm.response.json().access_token);"
          ]}}]
        }]
      },
      {
        "name": "01-Create",
        "item": [{
          "name": "Create Catalog",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/api/catalog/catalogs",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\"name\": \"AGENT-TEST-Catalog\", \"languages\": [{\"languageCode\": \"en-US\", \"isDefault\": true}], \"isVirtual\": false}",
              "options": { "raw": { "language": "json" } }
            }
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Created', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));",
            "pm.collectionVariables.set('catalogId', pm.response.json().id);"
          ]}}]
        }]
      },
      {
        "name": "02-Read",
        "item": [{
          "name": "Get Catalog",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/catalog/catalogs/{{catalogId}}"
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Found', () => pm.response.to.have.status(200));",
            "pm.test('Name matches', () => pm.expect(pm.response.json().name).to.include('AGENT-TEST'));"
          ]}}]
        }]
      },
      {
        "name": "03-Update",
        "item": [{
          "name": "Update Catalog Name",
          "request": {
            "method": "PUT",
            "url": "{{baseUrl}}/api/catalog/catalogs",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\"id\": \"{{catalogId}}\", \"name\": \"AGENT-TEST-Catalog-Updated\", \"languages\": [{\"languageCode\": \"en-US\", \"isDefault\": true}], \"isVirtual\": false}",
              "options": { "raw": { "language": "json" } }
            }
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Updated', () => pm.response.to.have.status(200));"
          ]}}]
        }]
      },
      {
        "name": "04-Delete",
        "item": [{
          "name": "Delete Catalog",
          "request": {
            "method": "DELETE",
            "url": "{{baseUrl}}/api/catalog/catalogs/{{catalogId}}"
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Deleted', () => pm.expect(pm.response.code).to.be.oneOf([200, 204]));"
          ]}}]
        },
        {
          "name": "Verify Deleted",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/api/catalog/catalogs/{{catalogId}}"
          },
          "event": [{ "listen": "test", "script": { "type": "text/javascript", "exec": [
            "pm.test('Gone: 404', () => pm.response.to.have.status(404));"
          ]}}]
        }]
      }
    ]
  }
}
```

---

## Example C — Environment Creation (QA)

```json
{
  "workspace": "WORKSPACE_ID_HERE",
  "environment": {
    "name": "VC QA Environment",
    "values": [
      { "key": "baseUrl",       "value": "VALUE_FROM_BACK_URL",       "type": "default", "enabled": true },
      { "key": "frontUrl",      "value": "VALUE_FROM_FRONT_URL",      "type": "default", "enabled": true },
      { "key": "storeId",       "value": "VALUE_FROM_STORE_ID",       "type": "default", "enabled": true },
      { "key": "admin",         "value": "VALUE_FROM_ADMIN",          "type": "default", "enabled": true },
      { "key": "adminPassword", "value": "VALUE_FROM_ADMIN_PASSWORD", "type": "secret",  "enabled": true },
      { "key": "userEmail",     "value": "VALUE_FROM_USER_EMAIL",     "type": "default", "enabled": true },
      { "key": "userPassword",  "value": "VALUE_FROM_USER_PASSWORD",  "type": "secret",  "enabled": true },
      { "key": "cultureName",   "value": "en-US",                     "type": "default", "enabled": true },
      { "key": "currencyCode",  "value": "USD",                       "type": "default", "enabled": true },
      { "key": "authToken",     "value": "",                          "type": "secret",  "enabled": true }
    ]
  }
}
```

Replace `VALUE_FROM_*` with actual values read from `.env` at execution time.
