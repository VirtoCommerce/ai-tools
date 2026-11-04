# Jira Bug fields — what `/qa-bug` fills, how it finds them, and Need hotfixes

Read by `/qa-bug` Step 5 on the **Jira** path (`tracker.kind = jira`). The Azure Boards
path has its own discovered contract (`skills/qa-fix-routing/bug-contract.mjs`); a Jira collector for
that contract is still a follow-up, so on Jira the fields are **discovered live, per create**, as below.

## 0. One work folder per `/qa-bug` run — Jira and Azure alike

Before the first file is written, create one folder for THIS invocation and keep every scratch file of the run in it:
`$WORK = <session temp dir>/qa-bug/<slug>-<UTC yyyyMMddTHHmmssZ>-<4 random hex>/` (`mkdir -p`; the suffix keeps two
calls in the same second apart). Every payload — `fields.json`, `issue.json`, `link.json`, `get.json`, `desc.html`,
`sysinfo.html`, ADF and readback dumps — is `$WORK/<name>`, passed to the bridge as an **absolute** path. Once the
ticket exists, write its key to `$WORK/KEY`.

**Never a fixed-name file in the shared temp-dir root.** All subagents of one session share that dir, so two parallel
`/qa-bug` runs overwrite each other's `fields.json` and one bug's fields can be sent to the other's issue — observed
2026-10-28 when VCST-6594 and VCST-6595 were filed in parallel (caught by a re-read, not by a gate).

## 1. Discover the Bug's fields — never transcribe an id

A Jira project's Bug type carries its own custom fields, and their ids differ per site. **No field id is
written into this plugin.** The order is fixed: read the metadata (this §) → create the issue → `jira update` the
rich-text fields (below) → attach and embed the screenshots (§3) → verify from `renderedFields`. An image needs an
issue key, so nothing is embedded before the create. Read the Bug type's field metadata once:

- Atlassian MCP `getJiraIssueTypeMetaWithFields` (project = `tracker.projectKey`, the Bug issue type,
  `requiredFieldsOnly: false`), or `node "$VC_RUN" jira request --method GET --path /rest/api/3/issue/createmeta/{projectKey}/issuetypes/{issueTypeId}`.
- Match each slot below by the field's **display name** (case-insensitive) and keep its `fieldId`,
  `schema` and `allowedValues`. A slot whose field the project does not have stays in the Description as
  a section — nothing is dropped; the Description is the context plus one section per such slot.

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

A rich-text field takes **ADF** on the v3 API, not Markdown. Recognise it by its `schema`, not its type name:
createmeta reports it as `type: "string"` (VCST's Steps to reproduce does), with `custom` ending in `:textarea`
or `system` = `description` / `environment`. The MCP's Markdown→ADF conversion covers the Description only.
Create with the MCP `createJiraIssue`, then set the other fields
with one `node "$VC_RUN" jira update --key <KEY> --fields-file "$WORK/fields.json"` carrying ADF for every
rich-text field, shaped as above (`orderedList` / `bulletList`, `strong` and `code` marks). Create through
`jira request --method POST --path /rest/api/3/issue --body-file "$WORK/issue.json"` **only when the Atlassian MCP is not
connected**: the origin-label hook (`tracker-ops.md` §2a) checks the MCP create, never a bridge POST, so the bridge
body carries the labels itself. Either way, read `labels` back after the create and add a missing one with `jira update`.

**Every payload lives in this run's `$WORK`** (§0) — never a bare `fields.json` in a shared folder. **Before each write to an existing issue** (update, attach, link, re-send), check that `--key` equals
`$WORK/KEY` and that the payload's summary or lead sentence is this bug's; a mismatch ⇒ STOP, send nothing, and report
it. Read back (`get`) into `$WORK` too, and judge the readback of `$WORK/KEY` only.

## 2. Links

- `--link <KEY>[:<type>]` (repeatable) — a Relates link by default to the ticket the caller names
  (a release run passes its release ticket, `/qa-test` the ticket under test). The link type is one of the
  site's own (`jira request --method GET --path /rest/api/3/issueLinkType`), created with
  `jira request --method POST --path /rest/api/3/issueLink`; never a Parent link, which is an epic in most projects.
- Every related ticket the duplicate search (§5) found but judged **not** a duplicate is linked
  Relates too, and the Description names why it differs in one clause.

## 3. Screenshots go into the field they prove

The image that shows the defect goes **inside Actual result**; an image of the correct behaviour (the
same screen at another width, or on the previous release) goes inside **Expected result**; a step whose
input is not obvious may carry its own image inside **Steps to reproduce**. The Description carries none,
unless the project has no such field — then the image goes with that slot's section in the Description.

Mechanism — the field is `description` or the custom rich-text field; one image is attached, then embedded. A filename
in the body is not evidence anyone opens. Every step runs through the bridge (`node "$VC_RUN" jira …`, host = the
profile's `tracker.baseUrl`; the token stays in vc-secrets), and **step 2 is the trap**:

1. **Upload** — the Atlassian MCP has **no attachment tool**; `node "$VC_RUN" jira attach --key <KEY> --file a.png [--file b.png]` (a multipart `POST …/issue/{key}/attachments` with the mandatory `X-Atlassian-Token: no-check` header) → `[{id, filename}]`.
2. **Resolve the Media Services ID.** ADF `media.attrs.id` is a **Media Services UUID**, **NOT the numeric Jira attachment id** — passing the attachment id fails the whole request with `400 ATTACHMENT_VALIDATION_ERROR`. The UUID is absent from the attachment metadata; it lives in the content endpoint's `303` redirect (`Location: https://api.media.atlassian.com/file/<UUID>/binary?token=…`) — `node "$VC_RUN" jira media-id --attachment <attachmentId>` → `{ uuid }` reads it for you.
3. **PUT the field as ADF.** `width`/`height` are **required** or the image won't display — read them from the PNG IHDR (`buf.readUInt32BE(16)` / `(20)`), never guess. `collection` is the empty string (verified against a Jira-authored node). Safest pattern: `node "$VC_RUN" jira get --key <KEY> --fields <fieldId>` (already ADF), push the nodes onto `<fieldId>.content`, write `{"<fieldId>": …}` to a file and `node "$VC_RUN" jira update --key <KEY> --fields-file fields.json` (a `PUT …/issue/{key}` with `{fields}`) — that keeps the field's text instead of re-authoring it. `<fieldId>` is the Actual / Expected / Steps field (§1), or `description` when the project has none.
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

Only when **both** hold: the Bug type has a `Need hotfixes` field (§1), and the tracker is VirtoCommerce's own
Jira — decided exactly as for the VC-internal origin labels (`tracker-ops.md` §2a, *VC's own Jira*). `projectType:
platform` alone does not qualify: a customer running stock VC on their own Jira has it too, and has no VC stable
bundles. Otherwise skip this section, and write no Need-hotfixes line.

1. **Which bundles.** List `bundles/` in `VirtoCommerce/vc-modules`, keep the folders named `v<number>`, and take the
   **two highest by that number** — the listing is in text order (`v16` before `v2`), so never the last two
   entries; and never a version number written into a prompt: when a new bundle is cut, the pair moves.
2. **Which version.** Read each bundle's `package.json` and take the pinned version of the repo that
   owns the defect (the Fix Routing block's repo; `vc-frontend` for the theme).
3. **Is the defect there.** Open the defect's code anchor (`root-cause.md` / the Fix Routing block names
   the file and lines) at each pinned tag. The defective code present in **either** bundle ⇒ the flag is
   set, **whatever the priority** — the decision to actually hotfix stays with the product owner.
   Different code with the same visible defect (e.g. a value not masked at all in the older bundle)
   counts as present.
4. **Already fixed on that line** — the owning repo has a tag on the pinned version's `major.minor` line newer
   than the pinned one, and the anchor is fixed at it ⇒ no hotfix; the bundle needs that patch picked up. Say so in Environment instead of setting the flag.
5. **No code anchor** ⇒ leave the flag unset and write `Need hotfixes: undetermined — no code anchor`.
6. **Never confirm it on a stand.** The decision is the code at the bundle's pinned tag; a stand can
   drift from its bundle in either direction.

**Setting it.** The field is a checkbox/select: set the option **by its `id` from `allowedValues`**, not
by its text — option values can carry whitespace (VC's reads `" true"`, so `{"value":"true"}` is a 400).
Append one line to Environment:
`Need hotfixes: the defect is in the code of the two latest stable bundles (vA, vB) — <repo> <verA> / <verB>: <anchor>.`
(or `… only in vB …`, or the reason it was not set).

## 5. Duplicate search — before the operator is asked

- **Where.** `tracker.projectKey`, plus the project of each `--link` ticket (VC files product bugs in several
  projects, and the caller's ticket names the one that matters). Nothing else is guessed.
- **How.** `issuetype = Bug AND text ~ "<2–4 distinctive terms>" ORDER BY updated DESC` — the terms are the
  verbatim error message or the endpoint / GraphQL operation plus one UI noun, not the summary. Read at most the
  first 10 hits. Done issues stay in: a fixed bug that is back is a regression to link, not a new defect.
- **A real duplicate** (same symptom, same path, still open) ⇒ do not file and do not write to it yet. Report its
  key and ask via `AskUserQuestion`: **"Add the evidence to <KEY>"** / **"File a new bug anyway"** / **"Neither"**.
  `--confirmed` never answers this question: it covers creating this one bug, not a comment on someone else's
  ticket. A comment, when chosen, follows `tracker-ops.md` §0 (one comment per ticket per run).
- **Related but different** (same area, another symptom, or the same symptom on a path that was fixed) ⇒ file,
  link it Relates (§2), and say in one clause of the Description how it differs.
