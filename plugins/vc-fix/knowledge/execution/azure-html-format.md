# Azure Boards — HTML Formatting for Bugs & Comments

**Azure-only.** This file governs how `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, and `/qa-defect`
format content they write to **Azure DevOps** work items. It does **not** apply to Jira — Jira
keeps its own wiki/markdown markup, unchanged.

## Why this exists

Azure DevOps stores long-text fields as **HTML**, not Markdown. If you write Markdown into one,
Azure renders it **literally** — the `#`, `**`, and `| table |` characters show up as text, and
newlines collapse into one blob. That is the exact defect this format fixes (raw-Markdown bug
descriptions and unreadable single-paragraph comments).

**Which fields are HTML is DERIVED from the organization's own metadata, not asserted here**
(VCST-5582 E-a). `/project-init`'s tracker scan records each field's real data type in
`project-profile.json` `tracker.fields.<Type>[].type`, and `ado.mjs` reads it:

| Contract `type` | Treated as |
|---|---|
| `html` | HTML — author HTML, Markdown is converted |
| `plainText` / `string` | plain text — sent **verbatim**, never HTML-converted |
| anything else / no contract | fall back to the canonical list below |

This matters because processes differ: on a stock Agile Bug there is no `System.Description` at
all and `Microsoft.VSTS.TCM.ReproSteps` carries the body, while a custom single-line field like
`Custom.Reportedby` is `plainText` and must NOT be wrapped in `<p>`.

> **The body field is resolved per work-item TYPE from the scanned form layout — never assumed
> (VCST-5702).** On the Agile process a Bug's body is `Microsoft.VSTS.TCM.ReproSteps` while a
> User Story / Task use `System.Description`; a field can even exist in the contract yet be **off
> the form**, where anything written is invisible. So the templates below speak in semantic
> **slots** (`body`, `systemInfo`, …); the concrete ref each maps to is read from
> `tracker.formLayout.<Type>` (persisted by `/project-init`). Never hardcode a field ref, and never
> assume which field is or isn't on the form for a given type — read the layout.

**Canonical fallback** — the three refs Azure ships as HTML on the out-of-the-box processes, used
only when no contract was scanned (the "unverified defaults" rung of the fallback ladder):

- `System.Description`
- `Microsoft.VSTS.TCM.ReproSteps`
- `Microsoft.VSTS.TCM.SystemInfo`
- work-item **comments** (`System.History`) — always HTML, not a contract field

So: **when the profile's tracker is Azure (`tracker.kind === "azure"`), author the html-typed
fields as HTML.** `ado.mjs` also carries a safety net — if it detects Markdown reaching an HTML
field it converts it — but authoring HTML directly gives the clean, structured result below. Do
not rely on the net.

## The shape we want (read this first)

The gold-standard bug is **abstract and lean**. The description is one focused story a stranger can
replay; everything machine- or deployment-specific lives in **dedicated fields**, not in the prose.

1. **The four core blocks — Preconditions → Steps → Actual → Expected — are the whole `body` field**
   (the form-visible html control the `body` slot resolves to for this type — see the callout above).
   Optionally lead with a short abstract **Summary** (1–3 sentences); the reference bug has none, so add one
   only when the title + steps don't already make the defect obvious. Nothing else competes with these blocks.
2. **Environment is NOT a description section.** It goes to the Bug form's own fields:
   `Custom.Environment` (picklist) + the **System Info** block (`Microsoft.VSTS.TCM.SystemInfo`). See
   *Environment & metadata → dedicated fields* below.
3. **Everything else** (root-cause analysis, layer validation, module versions, fix routing, console/GraphQL
   evidence) is **secondary** — a short **💡 Technical Details** list *below* the four core blocks, 1–3 items,
   essentials only. If it isn't needed to reproduce or understand the bug, cut it. (Use a `<details>`
   accordion here **only** for a heavy artifact like a GraphQL-mutation dump — never for a couple of lines.)

> **No user-specific data in the Summary or Steps.** The bug must be reproducible by *anyone* who meets
> the Preconditions — so no real emails, account IDs, order numbers, GUIDs, personal names, or session
> tokens in the narrative. Refer to entities by *kind* ("a B2B buyer account", "a cart with 2+ line
> items"); if a concrete value genuinely helps, give it as a parenthetical example in the Preconditions
> only (`e.g., <code>Configuration-351374149</code>`), never woven into the story.

## Formatting rules

- **Section headers:** `<h3 style="margin-bottom:2px;"><span style="font-size:14px;">{emoji}</span> {Title}:</h3>` followed by a list with `style="margin-top:0;"`.
- **All step/result lists:** `<ol style="margin-top:0;">` with `<li>` items (numbered). Use `<ul>` only for unordered notes.
- **UI elements:** bold + quotes — `<b>"Save"</b>`, `<b>"Place Order"</b>`.
- **Data values, URLs, field values, error codes, versions:** `<code>` — `<code>CUSTOM1</code>`, `<code>2.49.7</code>`.
- **User-provided links:** verbatim `<a href="...">…</a>`.
- **Spacing:** `<br/>` between sections.
- **Actual vs Expected:** parallel structure — item 1 actual ↔ item 1 expected. Reference the step, not a hardcoded value ("the color selected in step 2", not the literal name).
- **Preconditions:** only login + static state that can't be set up in a step; max 2–3 items. If it can be done in 1–3 steps, it's a Step.
- **Escaping:** literal `<`, `>`, `&` inside text/code must be `&lt;`, `&gt;`, `&amp;` — otherwise Azure eats them as tags.
- **Technical Details** is a normal `💡`-headed `<ol>` (like the four blocks above), kept to 1–3 items. Only when it must carry a heavy artifact (e.g. a GraphQL-mutation dump) wrap *that* artifact in a collapsed accordion so it doesn't crowd the repro:
  `<details style="border:1px solid #ccc; border-radius:4px; margin:4px 0;"><summary style="padding:8px 12px; cursor:pointer; background:#f5f5f5;">📦 {operationName}</summary><pre style="margin:0; padding:8px 12px; border-top:1px solid #ccc;"><code>{pretty JSON}</code></pre></details>`
- **Tables** (deployed versions, layer validation) — when genuinely load-bearing, a real `<table>`, never a Markdown `| … |` grid:
  ```html
  <table border="1" style="border-collapse:collapse;"><tr><th>Module</th><th>Version</th></tr>
  <tr><td>VirtoCommerce.Xapi</td><td><code>3.1009.0</code></td></tr></table>
  ```

## Screenshots — inline via attachment upload

Azure needs a real attachment URL to render an image inline. Flow:

1. Upload the file and capture its URL:
   ```bash
   node "$pluginRoot/skills/qa-fix-routing/ado.mjs" upload-attachment --file reports/bugs/screenshots/BUG-x.png
   # → { "url": "https://dev.azure.com/<org>/_apis/wit/attachments/<guid>?fileName=BUG-x.png" }
   ```
2. Embed it **inside** the relevant `<li>` — never as a bare list item, never outside the `<ol>`:
   ```html
   <li>{what happened}<br/><img src="{attachment_url}" width="700"></li>
   ```
3. `create-workitem` also links uploaded files in the Attachments tab when you pass
   `--attachments "<url1>,<url2>"` (comma-separated). Inline `<img>` and the tab link are independent —
   inline needs only the URL in the HTML; the tab needs the `--attachments` relation.

## Environment & metadata → dedicated fields, NOT the description

Do **not** write an "Environment:" / "Module Versions:" section into the description field. Azure has
purpose-built fields; put it there so the description stays a clean repro and the metadata is filterable.

**Which fields, on THIS deployment, comes from the discovered contract** — `project-profile.json`
`tracker.fields.<Type>[]`, scanned by `/project-init` (VCST-5582 E). Do not transcribe a field ref
from this file into a skill: `ado.mjs create-workitem` reads the contract, drops any field this
organization does not have, and validates every picklist value against the discovered
`allowedValues` before the POST. These are the STANDARD fields, present on every process:

| Semantic slot | Field | How to set (`ado.mjs create-workitem`) | Value |
|------|-------|------------------------------------------|-------|
| `systemInfo` — build / browser / repro-rate | `Microsoft.VSTS.TCM.SystemInfo` | `--system-info-file sysinfo.html` | see below |
| `severity` | `Microsoft.VSTS.Common.Severity` | `--severity "2 - High"` | `1 - Critical` … `4 - Low` |
| `priority` | `Microsoft.VSTS.Common.Priority` | `--priority 2` | `1`–`4` |
| `assignee` | `System.AssignedTo` | `--assign-self` (owner via `ado.mjs whoami`) | the token/session owner |
| `sprint` | `System.IterationPath` | `--iteration current` (via `ado.mjs current-iteration`) | the team's active sprint |
| parent (a RELATION, not a field) | `System.LinkTypes.Hierarchy-Reverse` | `--parent <id>` | **ask the operator** which work item to link under |

**Custom fields differ per organization** — `environment`, `bugType`, `reportedBy`, `foundIn` and
friends exist only where that process defines them. Read them from the contract and pass them as
`--field "<ref>=<value>"`. One deployment's shape, as an EXAMPLE only (do not copy these refs —
they exist in exactly one process and are rejected or silently blank anywhere else):

| Slot | Example ref on ONE deployment | Example allowed values |
|---|---|---|
| `environment` | a picklist named "Environment" | `QA` \| `UAT` \| `PROD` \| `Dev` \| `Local` |
| `reportedBy` | a field named "Reported by" | `QA team` (always — never an individual name) |
| `bugType` | a picklist named "Type of bug" | `Functional` \| `Regression` \| `Performance` \| `Data` \| `Integration` (UI/visual ⇒ `Functional`) |

A required field the contract reports but no slot maps is **asked once** at the first bug creation
and persisted to `tracker.fieldMap` / `tracker.fieldDefaults` — see `commands/qa-bug.md` Step 5.

> **Tags = area + module only** (`--tags "front; orders"`, `"back; catalog"`). Do **not** repeat what a
> field already carries — the bug type belongs in the `bugType` field, the environment in the
> `environment` field; neither is a tag. Keep them lowercase, no org/deployment names.

**System Info block** (`Microsoft.VSTS.TCM.SystemInfo`) — the platform/build facts, as compact HTML
(this is the reference bug's exact shape; add a `Platform:`/`Theme:` line for a backend/version bug):

```html
<b>Browser:</b> Chromium (Playwright)<br/>
<b>Environment:</b> QA — <code>{FRONT_URL}</code><br/>
<b>App version:</b> <code>2.49.7</code><br/>
<b>Reproduction rate:</b> Consistent
```

## Body template (the `body` slot)

Author the **whole** report into the `body` slot (the four core blocks; an optional Summary on top; a
short Technical Details below). The create path writes it to the form-visible html control the `body`
slot resolves to for this type — do **not** hand-target a concrete field ref.

```html
<!-- OPTIONAL — add only when the title + steps don't already make the defect obvious. No user-specific data. -->
<h3 style="margin-bottom:2px;"><span style="font-size:14px;">📝</span> Summary:</h3>
<p style="margin-top:0;">{1–3 sentences, abstract — what breaks and where}</p>
<br/>

<h3 style="margin-bottom:2px;"><span style="font-size:14px;">📋</span> Preconditions:</h3>
<ol style="margin-top:0;">
<li>User is logged in</li>
<li>{generic state} (e.g., <code>{specific example}</code>)</li>
</ol>
<br/>

<h3 style="margin-bottom:2px;"><span style="font-size:14px;">🔄</span> Steps to Reproduce:</h3>
<ol style="margin-top:0;">
<li>Open <a href="{full_url}"><b>{short_path}</b></a></li>
<li>Click <b>"{button}"</b> → {next action}</li>
<li>{trigger action that causes the bug}</li>
</ol>
<br/>

<h3 style="margin-bottom:2px;"><span style="font-size:14px;">❌</span> Actual Result:</h3>
<ol style="margin-top:0;">
<li>{what happened — concrete values in <code>}<br/><img src="{attachment_url}" width="700"></li>
</ol>
<br/>

<h3 style="margin-bottom:2px;"><span style="font-size:14px;">✅</span> Expected Result:</h3>
<ol style="margin-top:0;">
<li>{what should happen — parallel to Actual #1}</li>
</ol>
<br/>

<!-- OPTIONAL — 1–3 items, essentials only. Omit entirely if there is nothing load-bearing. -->
<h3 style="margin-bottom:2px;"><span style="font-size:14px;">💡</span> Technical Details:</h3>
<ol style="margin-top:0;">
<li>{root cause in one line — e.g. "Frontend layout defect: an extra date-field block renders before the range group"}</li>
<li>{owning layer + suspected repo/file, or a short console/GraphQL line if it matters}</li>
</ol>
```

> **Keep Technical Details minimal.** The VC-specific report content (4-Layer Validation, Module Versions,
> Root Cause Analysis, Fix Routing) is *supporting* material — a couple of lines and, at most, one small
> table, inside the collapsed block. It must never push the repro down the page or restate the Summary.
> Reference, don't inline (the size caps in `.claude/rules/reports.md` still apply). The full markdown bug
> report in `reports/bugs/` remains the detailed record; the work item is the lean, replayable version.

## The `repro` slot

**Author the whole report into the `body` slot; pass `--repro-file` only when the type has a DISTINCT
form-visible `repro` field.** The create path resolves both slots from `tracker.formLayout.<Type>`: when
the body target is the only html control on the form (e.g. an Agile Bug whose body is
`Microsoft.VSTS.TCM.ReproSteps`), a separate `--repro` is **folded into the body** automatically so no
text is lost and no off-form field is written. Do not assume which field is or isn't on the form — that
was the defect: it is derived from the layout, per type.

> **Do NOT force a body/repro onto a specific ref.** The create path REFUSES to POST a body to a field
> that is not on the form and names the html controls that ARE (VCST-5702 ITEM 0). If you must override,
> set `tracker.fieldMap.body` to one of the on-form controls it lists — never to an off-form field.

### Repairing a work item whose body landed off-form

An item filed BEFORE this fix may carry its whole body on an off-form field (e.g. `System.Description`
when the Bug form only surfaces `ReproSteps`/`SystemInfo`) — invisible on the form. To repair it, copy the
html to the form-visible body control and clear the off-form field (this is exactly how work item 8452 was
repaired manually, landing at rev 2):

```bash
# 1. Read the raw off-form html (‑‑json keeps it unstripped).
node ado.mjs get-workitem --id <ID> --json > wi.json
# 2. PATCH: write the html into the form-visible body control, then clear the off-form field.
#    (Confirm the form-visible ref from tracker.formLayout.<Type>.htmlControls.)
node ado.mjs comment --id <ID> --text "Body relocated to the form-visible field (was off-form)."
```

Then re-file via `/qa-bug` on a re-scanned profile (`/project-init`) so future items bind the body
correctly; the manual PATCH above is only for already-filed items.

## Comments (`/qa-fix`, `/qa-verify-fix`, `/qa-defect`)

Comments are HTML too — a Markdown comment collapses into one unreadable paragraph (the `#967`
symptom). Author them as compact HTML:

```html
<b>QA verdict:</b> BLOCKED (deployment gap)<br/>
<b>STR result:</b> 0/3 — still reproduces on <code>2.49.7</code><br/>
<ul>
<li>PR <a href="{pr_url}">#1204</a> is <code>active</code>, not merged into <code>dev</code> — fix not in the deployed build.</li>
<li>Console clean, all GraphQL 200 — consistent with a visual-only defect.</li>
</ul>
<b>Next:</b> merge → deploy to QA → re-run <code>/qa-verify-fix</code>.
```

Rules: `<b>` for labels, `<br/>` for line breaks, `<ul>/<li>` for bullet points, `<code>` for
values/versions/branches, `<a href>` for PR/build links. Keep to the monitoring-summary size
discipline (short, structured, reference links — don't inline logs).

## Passing HTML to `ado.mjs` — always via a file

Write each HTML field to a temp file and pass `--description-file` / `--system-info-file` / `--text-file`.
Never pass long HTML inline on the command line (quoting/em-dash grabli). Pass a `--*-file` path
relative to `VC_FIX_HOME || cwd` (the pre-flight resolves and stats it, and shows the ABSOLUTE path
if it is missing). Per-organization custom fields go via repeatable `--field "<ref>=<value>"`, with
`<ref>` taken from the DISCOVERED contract — never transcribed from another deployment:

```bash
node "$pluginRoot/skills/qa-fix-routing/ado.mjs" create-workitem --type Bug \
  --title "[Orders] Line-item total ignores tier price after quantity bump" \
  --description-file .tmp/desc.html \
  --system-info-file .tmp/sysinfo.html \
  --field "<environment-ref>=QA" --field "<reportedBy-ref>=QA team" --field "<bugType-ref>=Functional" \
  --severity "2 - High" --priority 2 --tags "qa-autofix,orders" \
  --attachments "$SHOT_URL"
```
