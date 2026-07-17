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

## Formatting rules

- **Section headers:** `<h3 style="margin-bottom:2px;"><span style="font-size:14px;">{emoji}</span> {Title}:</h3>` followed by a list with `style="margin-top:0;"`.
- **All step/result lists:** `<ol style="margin-top:0;">` with `<li>` items (numbered). Use `<ul>` only for unordered notes.
- **UI elements:** bold + quotes — `<b>"Save"</b>`, `<b>"Place Order"</b>`.
- **Data values, URLs, field values, error codes, versions:** `<code>` — `<code>CUSTOM1</code>`, `<code>2.49.7</code>`.
- **User-provided links:** verbatim `<a href="...">…</a>`.
- **Spacing:** `<br/>` between sections.
- **Tables** (e.g. deployed versions, layer validation): real `<table>` — never a Markdown `| … |` grid.
  ```html
  <table border="1" style="border-collapse:collapse;"><tr><th>Module</th><th>Version</th></tr>
  <tr><td>VirtoCommerce.Xapi</td><td><code>3.1009.0</code></td></tr></table>
  ```
- **Escaping:** literal `<`, `>`, `&` inside text/code must be `&lt;`, `&gt;`, `&amp;` — otherwise Azure eats them as tags.
- **Actual vs Expected:** parallel structure — item 1 actual ↔ item 1 expected.

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

## Description template (`System.Description`)

```html
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

<h3 style="margin-bottom:2px;"><span style="font-size:14px;">💡</span> Note:</h3>
<ol style="margin-top:0;">
<li>{root-cause context / layer validation / deployed versions table if useful}</li>
</ol>
```

> The VC-specific report content (4-Layer Validation, Module Versions, Root Cause Analysis, Fix Routing)
> maps naturally onto this skeleton: layer/version tables become `<table>`, RCA + Fix Routing become a
> `💡 Note` section. Keep it concise — the size caps in `.claude/rules/reports.md` still apply.

## ReproSteps (`Microsoft.VSTS.TCM.ReproSteps`)

Optional. When the deployment surfaces a distinct **Repro Steps** field on the Bug form (LEO does),
put the 🔄 Steps + ❌ Actual + ✅ Expected blocks there and keep Description to Preconditions + Note —
otherwise put everything in Description. Same HTML rules either way.

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

Write the HTML to a temp file and pass `--description-file` / `--repro-file` / `--text-file`.
Never pass long HTML inline on the command line (quoting/em-dash grabli). Example:

```bash
node "$pluginRoot/skills/qa-fix-routing/ado.mjs" create-workitem --type Bug \
  --title "[Orders] …" --description-file .tmp/desc.html --repro-file .tmp/repro.html \
  --severity "2 - High" --priority 2 --tags "qa-autofix,orders" \
  --attachments "$SHOT_URL"
```
