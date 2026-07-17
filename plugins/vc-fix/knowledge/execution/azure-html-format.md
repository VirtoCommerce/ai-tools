# Azure Boards — HTML Formatting for Bugs & Comments

**Azure-only.** This file governs how `/qa-bug`, `/qa-fix`, `/qa-verify-fix`, and `/qa-defect`
format content they write to **Azure DevOps** work items. It does **not** apply to Jira — Jira
keeps its own wiki/markdown markup, unchanged.

## Why this exists

Azure DevOps stores these fields as **HTML**, not Markdown:

- `System.Description`
- `Microsoft.VSTS.TCM.ReproSteps`
- `Microsoft.VSTS.TCM.SystemInfo`
- work-item **comments** (`System.History`)

If you write Markdown into them, Azure renders it **literally** — the `#`, `**`, and `| table |`
characters show up as text, and newlines collapse into one blob. That is the exact defect this
format fixes (raw-Markdown bug descriptions and unreadable single-paragraph comments).

So: **when the profile's tracker is Azure (`tracker.kind === "azure"`), author these fields as HTML.**
`ado.mjs` also carries a safety net — if it detects Markdown reaching an Azure HTML field it converts
it — but authoring HTML directly gives the clean, structured result below. Do not rely on the net.

## The shape we want (read this first)

The gold-standard bug is **abstract and lean**. The description is one focused story a stranger can
replay; everything machine- or deployment-specific lives in **dedicated fields**, not in the prose.

1. **The four core blocks — Preconditions → Steps → Actual → Expected — are the whole `System.Description`.**
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

Do **not** write an "Environment:" / "Module Versions:" section into `System.Description`. Azure has
purpose-built fields; put it there so the description stays a clean repro and the metadata is filterable.

| What | Field | How to set (`ado.mjs create-workitem`) | Value |
|------|-------|------------------------------------------|-------|
| Environment | `Custom.Environment` (picklist) | `--field "Custom.Environment=QA"` | `QA` \| `UAT` \| `PROD` \| `Dev` \| `Local` |
| Reported by | `Custom.Reportedby` (picklist) | `--field "Custom.Reportedby=QA team"` | `QA team` (always — never an individual name) |
| Type of bug | `Custom.Typeofbug` (picklist) | `--field "Custom.Typeofbug=Functional"` | `Functional` \| `Regression` \| `Performance` \| `Data` \| `Integration` (UI/visual ⇒ `Functional`) |
| Build / browser / repro-rate | `Microsoft.VSTS.TCM.SystemInfo` (HTML) | `--system-info-file sysinfo.html` | see below |
| Severity | `Microsoft.VSTS.Common.Severity` | `--severity "2 - High"` | `1 - Critical` … `4 - Low` |
| Priority | `Microsoft.VSTS.Common.Priority` | `--priority 2` | `1`–`4` |

| Assignee | `System.AssignedTo` | `--assign-self` (owner via `ado.mjs whoami`) | the token/session owner |
| Sprint | `System.IterationPath` | `--iteration current` (via `ado.mjs current-iteration`) | the team's active sprint |
| Parent | `System.LinkTypes.Hierarchy-Reverse` | `--parent <id>` | **ask the operator** which work item to link under |

> The `Custom.*` fields above are the **LEO** bug template's. They are the deployment's *custom* fields —
> discover a different deployment's from its Bug form (or `ado.mjs list-types`) and omit any it doesn't
> have. Severity/Priority/AssignedTo/IterationPath are standard VSTS fields present everywhere. `--assign-self`
> assigns to the creator; `--iteration current` files into the active sprint; `--parent` is **asked**, not assumed.

> **Tags = area + module only** (`--tags "front; orders"`, `"back; catalog"`). Do **not** repeat what a
> field already carries — the bug type (`Regression`) belongs in `Custom.Typeofbug`, the environment in
> `Custom.Environment`; neither is a tag. Keep them lowercase, no org/deployment names.

**System Info block** (`Microsoft.VSTS.TCM.SystemInfo`) — the platform/build facts, as compact HTML
(this is the reference bug's exact shape; add a `Platform:`/`Theme:` line for a backend/version bug):

```html
<b>Browser:</b> Chromium (Playwright)<br/>
<b>Environment:</b> QA — <code>{FRONT_URL}</code><br/>
<b>App version:</b> <code>2.49.7</code><br/>
<b>Reproduction rate:</b> Consistent
```

## Description template (`System.Description`)

Author the **whole** report here (the four core blocks; an optional Summary on top; a short Technical
Details below). Leave `Microsoft.VSTS.TCM.ReproSteps` **empty** — see *ReproSteps* below.

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

## ReproSteps (`Microsoft.VSTS.TCM.ReproSteps`)

**Leave it empty by default.** On the LEO Bug form the visible "Repro Steps" area is backed by
`System.Description` (where the template above lands), and `Microsoft.VSTS.TCM.ReproSteps` is **not shown**
— content written there is invisible to reviewers. So put the full report in `System.Description` and pass
**no** `--repro-file`. Only target `ReproSteps` (via `--repro-file`) if you have positively confirmed the
deployment's Bug form surfaces that specific field; otherwise you split the report into a field nobody sees.

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
Never pass long HTML inline on the command line (quoting/em-dash grabli). Environment/metadata picklists
go via repeatable `--field "Ref=value"`. Example (LEO):

```bash
node "$pluginRoot/skills/qa-fix-routing/ado.mjs" create-workitem --type Bug \
  --title "[Orders] Line-item total ignores tier price after quantity bump" \
  --description-file .tmp/desc.html \
  --system-info-file .tmp/sysinfo.html \
  --field "Custom.Environment=QA" --field "Custom.Reportedby=QA team" --field "Custom.Typeofbug=Functional" \
  --severity "2 - High" --priority 2 --tags "qa-autofix,orders" \
  --attachments "$SHOT_URL"
```
