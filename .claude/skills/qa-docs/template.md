# The ticket document — template

The one document `/qa-docs` writes per ticket, as the Markdown file
`reports/ba/<Domain>/<ticket>-<slug>-guide.md`. The Jira comment is NOT this text: it is its wiki-markup
rendering, `npm run tracker:wiki -- <guide.md> {RUN_DIR}/documentation.wiki.txt` (headings → `h2.`/`h3.`,
image lines → `!<file>|width=700!`, admonitions → `{info}`/`{tip}`/`{warning}`; `SKILL.md` step 6). Rules
for what may go into each placeholder: [`rules.md`](rules.md). Media lines: [`media.md`](media.md).

```markdown
## Documentation — {TICKET}: {feature}

### What's new
{whats_new}
Shipped in: {shipped_in}
{breaking}

### How to set it up
{setup}

### How it works
{scenarios}
{video_line}

Not documented: {not_documented}
Verified on {env} · run {run_id} · verdict {verdict} · captured {capture_date} · versions {versions_source}
```

| Placeholder | What goes there |
|---|---|
| `{feature}` | the change in the reader's words, ≤12 words |
| `{whats_new}` | 2–4 sentences: what changed and what someone can now do that they could not before. Every "you can now…" maps to a `PASS` row |
| `{shipped_in}` | `component@version` pairs, probed only ([`rules.md`](rules.md) §Shipped in); `UNKNOWN` is legal |
| `{breaking}` | `⚠ Breaking: …` with its source, or nothing at all ([`rules.md`](rules.md) §Truth guardrail) |
| `{setup}` | what must be switched on and where: store settings, roles and permissions, modules, and — when the feature is configured through it — the REST/GraphQL operation. Each item names where it is in the UI. `Nothing to set up.` is valid |
| `{scenarios}` | one `#### {scenario}` per user-visible flow: numbered UI-literal steps, a cropped screenshot after each meaningful step, then the scenario's walkthrough GIF |
| `{video_line}` | before the person attaches the film: `Video: {film-name}.mp4 — being exported, will be attached to this ticket.` After `/qa-docs <TICKET> --video`: `Video: {film-name}.mp4 (attached to this ticket).` No film: the line is left out |
| `{not_documented}` | each condition left out — `UNCOVERED`, a `PASS WITH NOTES` note, or `changed since the run` — with its reason; otherwise `None` |
| `{verdict}` | the run's verdict, verbatim (`PASS` or `PASS WITH NOTES`; with notes, the `Not documented` line names them) |
| `{versions_source}` | `run` (the test run probed them) or `capture` (read from `/api/platform/modules` before the capture walk) |
