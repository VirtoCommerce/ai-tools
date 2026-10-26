# Jira Bug fields — what `/qa-bug` fills, how it finds them, and Need hotfixes

Read by `/qa-bug` Step 5 on the **Jira** path (`tracker.kind = jira`, or no profile). The Azure Boards
path has its own discovered contract (`skills/qa-fix-routing/bug-contract.mjs`); a Jira collector for
that contract is still a follow-up, so on Jira the fields are **discovered live, per create**, as below.

## 1. Discover the Bug's fields — never transcribe an id

A Jira project's Bug type carries its own custom fields, and their ids differ per site. **No field id is
written into this plugin.** Before the create, read the Bug type's field metadata once:

- Atlassian MCP `getJiraIssueTypeMetaWithFields` (project = `tracker.projectKey`, the Bug issue type,
  `requiredFieldsOnly: false`), or `node "$VC_RUN" jira request --method GET --path /rest/api/3/issue/createmeta/{projectKey}/issuetypes/{issueTypeId}`.
- Match each slot below by the field's **display name** (case-insensitive) and keep its `fieldId`,
  `schema` and `allowedValues`. A slot whose field the project does not have stays in the Description as
  a section — nothing is dropped.

| Slot | Field name to match | Value |
|---|---|---|
| Summary | `Summary` | What is broken and where, one line |
| Description | `Description` | **Context only**: the defect in 1–3 sentences, where it was found (release / wave / case or ticket), related tickets. Not the steps |
| Steps | `Steps to reproduce` | Numbered steps from the evidence package |
| Expected | `Expected result` | The expected behaviour and its source (docs, BL, previous release) |
| Actual | `Actual result` | What was observed, with the numbers |
| Environment | `Environment` | Stand, Platform, theme, the owning module's version, browser; plus the Need-hotfixes line (§4) |
| Error message | `Error message` | The verbatim error, when there is one (HTTP body message, exception text) |
| Components type | `Components type` | The layer the fix lands in, from `allowedValues` (e.g. Platform / Theme / Both) |
| Platform / Theme components | `Platform components`, `Theme components` | The owning module or storefront area, **only a value from `allowedValues`**; no match ⇒ leave empty |
| Priority | `Priority` | From the severity (Step 5 mapping) |
| Labels | `Labels` | Origin labels (`tracker-ops.md` §2a) and, when eligible, the auto-fix pair |
| Need hotfixes | `Need hotfixes` | §4 |

**Never filled by `/qa-bug`:** Assignee, Sprint, QA engineer, Fix versions, Parent, and any field the
site fills itself after a release (VC's `Theme release`). They belong to whoever triages or ships the bug.

**Structure every rich-text field — never a wall of text.** One fact per list item:

| Field | Shape |
|---|---|
| Description | 1–2 lead sentences, then a list: **Found in:** …, **New in <release>:** yes/no |
| Steps to reproduce | `orderedList`, one action per step; UI names in bold (**Run** → **Regenerate**) |
| Expected result | `bulletList`, one expectation per item |
| Actual result | `bulletList` of what was observed, then a bold **Cause** line with its own list (when known), then the screenshot |
| Environment | `bulletList`: **Stand:**, **Versions:**, **Settings:**, **Surface:**, **Screenshot:** (when it is from another build); then the **Need hotfixes:** line |

Bold (`strong` mark) the label or the key value — the message the user sees, the wrong number. Put
endpoints, field names, settings, file names with lines and literal values in `code` marks. Verify with
`jira get --key <KEY> --fields <ids> --expand renderedFields`: each field has its `<li>`, `<b>`/`<strong>`
and `<code>`; a field rendered as bare `<p>` blocks is re-sent. Measured on VCST-6500: the same text sent
as paragraphs came back from the reader as unreadable.

A rich-text field (`schema.type = "doc"` on the v3 API) takes **ADF**, not Markdown — the MCP's
Markdown→ADF conversion covers the Description only. Create with the MCP, then set the other fields
with one `node "$VC_RUN" jira update --key <KEY> --fields-file fields.json` carrying ADF for every
rich-text field, shaped as above (`orderedList` / `bulletList`, `strong` and `code` marks); or create everything at once
with `jira request --method POST --path /rest/api/3/issue --body-file issue.json`.

## 2. Links

- `--link <KEY>[:<type>]` (repeatable) — a Relates link by default to the ticket the caller names
  (`/qa-run` passes the release ticket, `/qa-test` the ticket under test). The link type is one of the
  site's own (`jira request --method GET --path /rest/api/3/issueLinkType`), created with
  `jira request --method POST --path /rest/api/3/issueLink`; never a Parent link, which is an epic in most projects.
- Every related ticket the duplicate search (Step 5) found but judged **not** a duplicate is linked
  Relates too, and the Description names why it differs in one clause.

## 3. Screenshots go into the field they prove

The image that shows the defect goes **inside Actual result**; an image of the correct behaviour (the
same screen at another width, or on the previous release) goes inside **Expected result**; a step whose
input is not obvious may carry its own image inside **Steps to reproduce**. The Description carries none.

Mechanism — the field is `description` or the custom rich-text field; one image is attached, then embedded. A filename
in the body is not evidence anyone opens. Every step runs through the bridge (`node "$VC_RUN" jira …`, host = the
profile's `tracker.baseUrl`; the token stays in vc-secrets), and **step 2 is the trap**:

1. **Upload** — the Atlassian MCP has **no attachment tool**; `node "$VC_RUN" jira attach --key <KEY> --file a.png [--file b.png]` (a multipart `POST …/issue/{key}/attachments` with the mandatory `X-Atlassian-Token: no-check` header) → `[{id, filename}]`.
2. **Resolve the Media Services ID.** ADF `media.attrs.id` is a **Media Services UUID**, **NOT the numeric Jira attachment id** — passing the attachment id fails the whole request with `400 ATTACHMENT_VALIDATION_ERROR`. The UUID is absent from the attachment metadata; it lives in the content endpoint's `303` redirect (`Location: https://api.media.atlassian.com/file/<UUID>/binary?token=…`) — `node "$VC_RUN" jira media-id --attachment <attachmentId>` → `{ uuid }` reads it for you.
3. **PUT the field as ADF.** `width`/`height` are **required** or the image won't display — read them from the PNG IHDR (`buf.readUInt32BE(16)` / `(20)`), never guess. `collection` is the empty string (verified against a Jira-authored node). Safest pattern: `node "$VC_RUN" jira get --key <KEY> --fields description` (already ADF), push the nodes onto `description.content`, write `{"description": …}` to a file and `node "$VC_RUN" jira update --key <KEY> --fields-file fields.json` (a `PUT …/issue/{key}` with `{fields}`) — that preserves the MD-converted body instead of hand-authoring the whole doc.
   ```js
   { type: 'mediaSingle', attrs: { width, widthType: 'pixel', layout: 'align-start' },
     content: [{ type: 'media', attrs: { type: 'file', id: '<UUID>', alt: '<filename>',
                                         collection: '', width, height } }] }
   ```
4. **Verify it renders** — persisted ≠ rendered. Read back `node "$VC_RUN" jira get --key <KEY> --fields <fieldId> --expand renderedFields` and assert the HTML contains `<img src="…/rest/api/3/attachment/content/{attachmentId}" …>`. No `<img>` ⇒ the node is wrong; don't claim success.

**Do not bother trying** (each fails): markdown `![alt](file.png)` → silently dropped (MD→ADF can't resolve a filename to an attachment); wiki `!file.png!` → renders literally (VCST-5212 class); `attrs.id` = attachment id → `400`. Embed the 1–3 images that show the defect (`.claude/rules/reports.md` §5); attach-only is fine for supporting shots.

A field that persisted the node but renders no `<img>` is not delivered; fall back to the inline-image comment
(`tracker-ops.md` §2, the wiki carve-out) and say so in the result.

## 4. Need hotfixes — decided by code, against the two latest stable bundles

Only on VirtoCommerce's own tracker (a native-platform profile, `projectType: platform`, or no profile). A client project
has no stable bundles of its own: skip this section there.

1. **Which bundles.** List `bundles/` in `VirtoCommerce/vc-modules` and take the **two highest `vN`
   folders** — never a version number written into a prompt; when a new bundle is cut, the pair moves.
2. **Which version.** Read each bundle's `package.json` and take the pinned version of the repo that
   owns the defect (the Fix Routing block's repo; `vc-frontend` for the theme).
3. **Is the defect there.** Open the defect's code anchor (`root-cause.md` / the Fix Routing block names
   the file and lines) at each pinned tag. The defective code present in **either** bundle ⇒ the flag is
   set, **whatever the priority** — the decision to actually hotfix stays with the product owner.
   Different code with the same visible defect (e.g. a value not masked at all in the older bundle)
   counts as present.
4. **Already fixed on that line** (a newer same-line patch contains the fix — `/qa-bundle-check`) ⇒ no
   hotfix; the bundle needs that patch picked up. Say so in Environment instead of setting the flag.
5. **No code anchor** ⇒ leave the flag unset and write `Need hotfixes: undetermined — no code anchor`.
6. **Never confirm it on a stand.** The decision is the code at the bundle's pinned tag; a stand can
   drift from its bundle in either direction.

**Setting it.** The field is a checkbox/select: set the option **by its `id` from `allowedValues`**, not
by its text — option values can carry whitespace (VC's reads `" true"`, so `{"value":"true"}` is a 400).
Append one line to Environment:
`Need hotfixes: the defect is in the code of the two latest stable bundles (vA, vB) — <repo> <verA> / <verB>: <anchor>.`
(or `… only in vB …`, or the reason it was not set).
