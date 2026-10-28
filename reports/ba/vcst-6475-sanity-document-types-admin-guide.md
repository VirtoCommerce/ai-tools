# Sanity: several document types and several sources per store

Configure which Sanity document types a store fetches and indexes into Pages, and combine several Sanity datasets (or projects) in one store. Existing single-project configurations keep working unchanged.

## Prerequisites

- The **Pages** and **Sanity** modules are installed, and the Pages module is enabled for the store.
- A Sanity API token with read access.
- Someone with access to the platform configuration (`appsettings` or environment variables) to define secrets.

## Open the store settings

1. Click **Stores** in the main menu.
2. In the next blade, select your store.
3. Click the **Settings** widget and type **Sanity** in the search bar.

## Settings

| Setting | What it does | Example |
|---|---|---|
| **Sanity.Enabled** | Turns Sanity on for the store | `true` |
| **Sanity.DocumentTypes** | Document types to fetch and index. Separators `,` and `;` and extra spaces are accepted. When empty, the legacy **Sanity.PageType** is used, then `page` | `page, footerNavigation; siteSettings` |
| **Sanity.Projects** | One JSON setting that lists every Sanity source of the store: projects, their datasets, types per dataset, priority | see below |
| **Sanity.ApiToken** | Default token for projects that have no `apiToken` of their own. Accepts a `${name}` secret reference | `${projectAToken}` |
| **Sanity.ProjectId / Sanity.Dataset** | Single-source configuration, used while **Sanity.Projects** is empty | `abc12345` / `production` |

!!! note
    **Sanity.Projects** and **Sanity.ApiToken** are not exposed to the storefront.

## Several datasets or projects

```json
[
  {
    "projectId": "abc12345",
    "apiToken": "${projectAToken}",
    "datasets": [
      { "name": "production", "documentTypes": ["page", "footerNavigation"], "isPriority": true },
      { "name": "marketing", "documentTypes": ["landing", "blog"] }
    ]
  }
]
```

| Field | Required | Behaviour |
|---|---|---|
| `projectId` | yes | An entry without it is skipped |
| `apiToken` | no | Falls back to **Sanity.ApiToken** |
| `datasets[].name` | yes | |
| `datasets[].documentTypes` | no | Only these types are indexed from this dataset. When omitted, the dataset inherits **Sanity.DocumentTypes** |
| `datasets[].isPriority` | no | Queried first; its version wins when the same document id exists in several sources |

- When the same document id exists in several sources, the higher-priority source is indexed and a warning naming the winner and the loser is written to the platform log. Without `isPriority`, the configured order decides.
- Invalid JSON in **Sanity.Projects** falls back to the single-source settings.
- A type that is not listed for a dataset is never indexed from it.

## Keep tokens out of store settings

Define named tokens in the platform configuration and reference them as `${name}`:

```json
{ "Sanity": { "Secrets": { "projectAToken": "<token>" } } }
```

Environment variable form: `Sanity__Secrets__projectAToken`. Names are case-insensitive. An unresolved `${name}` is never sent to Sanity: the project is skipped and a warning names the missing secret.

## Webhook secrets

The webhook endpoint `POST /api/pages/sanity` is authorised by the webhook signature, not by an API key in the URL.

| Key | What it does | Default |
|---|---|---|
| `Sanity:WebhookSecrets` | Accepted secrets. A delivery matching any of them is accepted. Empty means every delivery is rejected | `[]` |
| `Sanity:WebhookToleranceSeconds` | Allowed distance of the signature timestamp from now | `300` |
| `Sanity:WebhookMaxBodySize` | Largest body accepted, in bytes | 10 MB |

To rotate a secret without downtime: add the new secret as a second item (`Sanity__WebhookSecrets__1`), switch the webhook in Sanity Manage to it, then remove the old one.

## Upgrading an existing API-key webhook

After the upgrade the endpoint rejects every delivery until a secret is configured.

1. In Sanity Manage, set a strong random value in the webhook's **Secret** field.
2. Add the same value to `Sanity:WebhookSecrets` (`Sanity__WebhookSecrets__0`) and restart the platform.
3. Remove `api_key` and `storeId` from the webhook URL. Keep `cultureName` if you use it. A URL that still carries the old `api_key` without a signature is rejected with 401.
4. Use the recommended projection (see the developer guide).
5. Make sure every store that should receive the content lists the project and dataset in **Sanity.Projects** (or **Sanity.ProjectId** / **Sanity.Dataset**).
6. Save a document in Sanity Studio and check the attempt log in Sanity Manage and the platform log for `Sanity webhook request rejected`.

## Internal links and assets in indexed content

- An internal link (a reference to another document) gets a `slug` taken from the target's `permalink`, or `seo.slug` if there is no permalink. Links to documents without a slug, and to missing documents, stay untouched.
- Image and file references get a `url` that points to the Sanity CDN, equal to the URL Sanity returned on upload.

## Rebuilding the index after a settings change

!!! note
    Pages caches the change list of a full index rebuild for about 10 minutes, and changing store settings does not clear it. A rebuild started shortly after you add a document type or a source can skip the new documents while the job still reports success. Wait about 10 minutes and rebuild again (tracked as VCST-6586). Page publishes through the webhook are not affected.

## Log messages

Every rejected webhook delivery logs its reason. Warnings are written for an unresolved `${name}`, for a conflict between sources, and for invalid **Sanity.Projects** JSON. Token and secret values are never logged.
