# Feature documentation — the tracker comment that publishes the guide

Fill-in shape for the ONE comment that documents a tested ticket for the people who asked for it.
Two forms below; pick one by the rule in §Which form. Written in Virto's own documentation voice —
second person, present tense, the exact control in **bold**, real screenshots.

**This file is the SHAPE. The rules are cited, never restated:**

| What | Where |
|---|---|
| Which audiences a ticket earns, and the layer→audience map | [`../../knowledge/ba/virto-doc-style.md`](../../knowledge/ba/virto-doc-style.md) §10.1 · §9.1 |
| The guides on disk (`reports/ba/…-guide.md`), amend-never-fork | [`../../knowledge/ba/virto-doc-style.md`](../../knowledge/ba/virto-doc-style.md) §10.3 |
| Refusals — when a ticket earns no documentation at all | [`../../knowledge/ba/virto-doc-style.md`](../../knowledge/ba/virto-doc-style.md) §10.4 |
| House conventions — admonitions, step procedures, screenshots, voice | [`../../knowledge/ba/virto-doc-style.md`](../../knowledge/ba/virto-doc-style.md) §2 |
| One comment per ticket per run | [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0 |
| Screenshots: attach, then wiki markup — **the whole body becomes wiki** | [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §5c |
| Publishing a deliverable means the deliverable **in full**, never a summary + a repo path | [`../../knowledge/execution/tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §5d |
| Size — target 30–80, cap 120, split per audience rather than abridge | [`../../knowledge/execution/reports-policy.md`](../../knowledge/execution/reports-policy.md) §2 |

```bash
npm run tracker:comment -- --ticket VCST-XXXX --body-file doc.md \
  --attach reports/tickets/{SPRINT}/VCST-XXXX/screenshots/setup-1.png \
  --attach reports/tickets/{SPRINT}/VCST-XXXX/screenshots/storefront.png
```

---

## Which form

| Form | Use it when |
|---|---|
| **A — Setup-shaped** | The feature is something an operator turns on or configures, and its point is what happens on the storefront afterwards. This is the common case and the default. |
| **B — Audience-shaped** | The ticket moved more than one surface and genuinely earned more than one audience (§10.1) — e.g. an admin setting *plus* a changed GraphQL contract integrators call. |

When in doubt, use A. Form B costs a reader three headings to find the one that is theirs; it earns that
cost only when there really are three different readers.

---

## Form A — Setup-shaped: what it is → how to set it up → what your customers will see

The three questions an operator actually asks, in the order they ask them.

```markdown
## {Feature name, as the product calls it}

{One or two sentences: what this lets you do, and why you would. Say it in the operator's words —
no ticket key, no "we implemented", no module class names.}

### How to set it up

1. Click **{Module}** in the main menu, then open **{blade or page}**.
2. In the **{Blade name}** blade, fill in the following:

   | Field | What it does | Example |
   |---|---|---|
   | **{Field}** | {one clause} | `{value}` |

   !setup-1.png|width=700!
   _{Caption naming what the screenshot shows.}_

3. Click **Save** in the toolbar. {Confirmation sentence in the product's own words.}

!!! note "{The question this step makes an operator ask}"
    {Plain answer, one or two sentences.}

### What your customers will see

{A short paragraph in the shopper's words: where the effect shows up, what changes for them, and what
they can now do that they could not before. Present tense, second person, no admin vocabulary.}

!storefront.png|width=700!
_{Caption.}_

{Optional, only when it is genuinely different: what a shopper sees when the feature is NOT configured,
so the operator can tell the two states apart.}

---
*{TICKET} · verified on {env} · Not documented: {each omitted condition with its reason, or **none**} ·
Evidence: `reports/tickets/{SPRINT}/{TICKET}/`*
```

**Two things in Form A are mandatory, not stylistic.**

- **The "What your customers will see" section**, with its screenshot. A setup guide that stops at
  **Save** documents a form, not a feature — and the operator cannot tell whether they configured it
  correctly without knowing what correct looks like downstream.
- **The `Not documented` line**, which reads `none` when there is nothing to report. An omitted line is
  indistinguishable from a run where everything passed, which is the one thing it must never be mistaken
  for.

---

## Form B — Audience-shaped: one section per reader

The heading wording is fixed, and so is the order, so that a reader scanning several tickets finds the
same labels in the same places. Include only the sections the ticket earned — an absent audience is an
absent heading, never an empty one.

```markdown
## Documentation — {TICKET}

{One or two sentences: what a person can now do that they could not before, in their words.}

### For shoppers

{The shopper's happy path as numbered steps, each naming the exact control in **bold**, ending in the
success message quoted verbatim. A screenshot where the state changes. Zero jargon, no ids.}

### For administrators

{Where it lives — `Click **{Module}** in the main menu → {blade}` — then the field or setting **delta**
as a table (Field · What it does · Example). The delta only, never the whole field list.}

### For developers

{The changed operation named, ONE runnable request and its real response, `{{BACK_URL}}` for hosts,
every field name schema-validated. Redact secrets; on a client project, embed nothing client-specific —
describe the changed field in prose instead.}

---
*{TICKET} · verified on {env} · Not documented: {… or **none**} ·
Evidence: `reports/tickets/{SPRINT}/{TICKET}/` · Audiences derived from layer `{layer}`*
```

---

## Writing rules that apply to both forms

1. **Every instruction maps to a step someone actually executed and that PASSED.** No roadmap, no "will
   also support", no step nobody ran. A guide that overclaims walks a real person through something that
   does not work — worse than a release note that overclaims, which is merely a wrong record.
2. **A non-PASS verdict scopes the guide; it does not refuse it.** Write the paths that passed, omit the
   ones that failed, name every omission in `Not documented`, and print the real verdict. Never present a
   failing path as working, and never write the defect up here — its home is its own ticket.
3. **Sentences, not labels.** The same rule as the QA-result comment: this is documentation, and the
   reader is a person deciding whether to turn something on.
4. **Screenshots are real and inline.** Captured from the run, attached to the issue, referenced as
   `!name.png|width=700!`. A Markdown image reference or a repo path renders as nothing, silently, at
   `200 OK` — see §5c. A step whose point is visual and whose image is missing is not delivered.
5. **No version literals.** A how-to does not quote a build number; that is the release note's job.
6. **Redact and contain before posting.** Secrets are scrubbed regardless of destination; on a client
   project so is every client host, path, identifier and datum — including inside a screenshot. Crop or
   refuse rather than ship a frame carrying a real customer record.
