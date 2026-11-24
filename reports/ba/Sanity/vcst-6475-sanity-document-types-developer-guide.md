# Sanity webhook: signed notifications and multi-source indexing

How an integrator connects Sanity to Virto Pages through the signed webhook, and how fetched documents are enriched.

## Prerequisites

- Pages and Sanity modules installed; a store with Sanity settings (see the admin guide).
- A Sanity project with a webhook you can edit in Sanity Manage.
- Platform configuration access for `Sanity:WebhookSecrets`.

## Quick start

1. In Sanity Manage open your project, then **API** and **Webhooks**, and create a webhook:

| Setting | Value |
|---|---|
| URL | `{{BACK_URL}}/api/pages/sanity?cultureName=en-US` |
| Secret | a strong random value, the same one as in `Sanity:WebhookSecrets` |
| Trigger on | Create, Update, Delete |
| HTTP method | POST |
| Projection | see step 3 |

2. Set the secret on the platform: `Sanity__WebhookSecrets__0=<secret>`.
3. Recommended projection:

```groq
{
  _id,
  storeId,
  "_operation": delta::operation(),
  "_projectId": sanity::projectId(),
  "_dataset": sanity::dataset()
}
```

4. Save a document in Studio. In the Sanity attempt log a `200` means the delivery was accepted.

## What the endpoint does

`POST /api/pages/sanity?cultureName={cultureName}`

- The payload is a **notification**. The module reads which document changed and refetches it from Sanity, so the indexed title and content always come from Sanity, never from the payload.
- One webhook serves every store. The store follows the project and dataset configured in **Sanity.Projects**, or the document's own `storeId`.
- A project that is not configured, or a document type not listed for the dataset, indexes nothing (the response is `200` and a warning is logged).
- `?cultureName=` is applied to the indexed document.
- `delete` removes the page from the index. Include `storeId` in the projection so the delete event carries the store.

## Signature and responses

Sanity sends `sanity-webhook-signature: t=<unix ms>,v1=<signature>`, an HMAC-SHA256 of `<t>.<raw body>`.

| Condition | Response |
|---|---|
| No signature header, malformed header, or no matching secret | `401` |
| No secret configured in `Sanity:WebhookSecrets` | `401` |
| Timestamp more than `Sanity:WebhookToleranceSeconds` (300 by default) from now, in either direction | `401` |
| Body changed after signing | `401` |
| Body larger than `Sanity:WebhookMaxBodySize` (10 MB by default) | `401` |
| Old URL with `?api_key=&storeId=` and no signature | `401` |
| A `sanity-document-id`, `sanity-operation` or `sanity-dataset` header differs from the signed body | `400` |
| Document id that is not a valid Sanity id (letters, digits, `_`, `-`, `.`) | `400`, before any GROQ query |

Several secrets are accepted at once, which allows rotation without downtime.

## Signed body wins over headers

The signature covers the body only. With the recommended projection `_id`, `_operation`, `_projectId` and `_dataset` are inside the signed body, so the `sanity-*` headers are not trusted. A header is used only for a value the body does not carry, so an empty projection `{}` still works from the headers, without this protection.

## Enrichment of indexed content

Index rebuild and webhook push fetch the document from Sanity and enrich it the same way.

Internal link, as stored in Sanity:

```json
{ "internalLink": { "_type": "reference", "_ref": "page-about" } }
```

Indexed:

```json
{ "internalLink": { "_type": "reference", "_ref": "page-about", "slug": "about-us" } }
```

The slug is `coalesce(permalink.current, seo.slug.current, slug.current)`. Nested references are resolved; references to documents without a slug are left as they are. Asset references (`image-...`, `file-...`) get a `url` pointing to the Sanity CDN, for example `logo.asset.url`.

Drafts (`_id` starting with `drafts.`) are indexed with `Status = Draft`.

## Configuration keys

| Key | Default |
|---|---|
| `Sanity:WebhookSecrets` | `[]` |
| `Sanity:WebhookToleranceSeconds` | `300` |
| `Sanity:WebhookMaxBodySize` | `10485760` |
| `Sanity:Secrets` (named tokens for `${name}`) | `{}` |

Environment variables use `__`, for example `Sanity__Secrets__projectAToken`. Keep real values out of `appsettings.json`.

## Reading the result

The storefront resolves a published Sanity page through the xAPI `slugInfo` and `pageDocument` queries and returns the published version, not the draft.

## Notes

!!! note
    A full index rebuild started within about 10 minutes of the previous one can reuse a cached change list and skip documents of a newly configured type or source (VCST-6586). Webhook pushes are not affected.

## Upgrading

See the admin guide, "Upgrading an existing API-key webhook". Extension-code changes (custom `ISanityContentProvider` / `ISanityConverter` implementations) were not exercised by the test run and are described only in the module README.
