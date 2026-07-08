# Virto Commerce Documentation Style Guide

Canonical style reference for **BA documentation deliverables**. Every doc the BA team publishes to
`reports/ba/` must match one of the four audience styles below. The styles are reverse-engineered from
the live Virto Commerce documentation properties and **must be re-grounded against VirtoOZ MCP per run**
(don't trust this snapshot blindly — terminology and structure drift).

> **How to use this file.** `ba-doc-writer` reads it before generating any document. Pick the audience,
> follow that audience's skeleton, voice, and signature elements verbatim. When in doubt about wording,
> query the matching VirtoOZ tool and mirror the published phrasing.

---

## 0. Who reads these docs

**Virto's customers and partners are B2B enterprise organizations** that license the platform and run
their own B2B storefronts and portals on it. That shapes the audiences:

- A **customer organization** has two reader roles: the **operators/admins** who run the store
  (back-office) and their **end buyers** who shop the storefront. Both are documented, in different styles
  (Admin §4 and Customer §3 below).
- **Sales** docs target the buying committee at such enterprises (procurement, digital/e-commerce leads,
  IT decision makers) — write to an enterprise B2B buyer, not a consumer. Reflect B2B realities:
  multi-account management, contract pricing, organization-specific catalogs, RFQ, impersonation, scale.
- **Developer** docs serve integrators at the customer or their systems integrator (SI) partner.

When a doc is for a *named* customer or partner, keep the platform terminology generic and parameterized —
never hardcode that customer's catalog IDs, store names, or URLs (use `{{VAR}}` / `@td()`).

## 1. The four audiences

| Audience | What they want | Source-of-truth property | VirtoOZ tool to ground against |
|----------|----------------|--------------------------|-------------------------------|
| **Customer** (shopper / end user) | "How do I do this in the storefront?" | `docs.virtocommerce.org/storefront/user-guide` | `StorefrontUserGuide` |
| **Admin** (back-office operator) | "How do I configure/operate this in the Admin?" | `docs.virtocommerce.org/platform/user-guide` | `PlatformUserGuide` |
| **Developer** (integrator / extender) | "How do I install, call the API, extend it?" | `docs.virtocommerce.org/platform/developer-guide` + `/storefront/developer-guide` | `PlatformDeveloperGuide`, `StorefrontDeveloperGuide`, `*SourceCode` |
| **Sales** (rep / pre-sales / decision maker) | "Why does this matter to the buyer? What's the business outcome?" | `virtocommerce.com/features`, `/portal`, `/marketplace`, `/industry` | `VirtoCommerce` (general/marketing tool) |

**Audience ≠ document.** One feature can produce up to four docs — a Customer how-to, an Admin setup
guide, a Developer API reference, and a Sales one-pager — each in its own style. The `audience` input
selects which. `all` produces every applicable one.

---

## 2. House conventions (apply to Customer / Admin / Developer docs)

Virto's docs site is **MkDocs Material**. The BA team writes Markdown that renders cleanly there.

### Admonitions — use these exact blocks, not bold paragraphs

```markdown
!!! note
    Background or clarification the reader can skip without breaking the flow.

!!! tip
    A shortcut or efficiency win ("Add a **CategoryPath** field to set the product's category").

!!! warning
    Irreversible or risky action ("`Disallow: /` blocks all crawling — replace before go-live").

!!! success
    Confirmation of a correct end state, or a "you've now achieved X" callout.

!!! example
    A worked, concrete walkthrough.
```

Admonitions may carry a title: `!!! note "Why do I enter the CVV every time?"`.

### Step procedures — numbered, imperative, UI-literal

- Number every step. Sub-steps are nested numbered lists.
- Name the exact control in **bold**: `Click **Catalog** in the main menu.`
- Reference the blade/panel the reader lands on: `In the next blade, select the required catalog.`
- Use **"in our example"** to thread one concrete walkthrough through a procedure
  (e.g. *"**New-price-list** in our example"*). Resolve example values via `@td(ALIAS.field)` — never
  hardcode a GUID/SKU/price (see §7).

### Screenshots — real, captured, per meaningful step

- Capture with the browser MCP (`playwright-firefox` storefront, `playwright-edge` admin). **Never** ship
  `[screenshot placeholder]`.
- Place the image immediately after the step it illustrates, with an italic caption.
- Budget per `.claude/rules/reports.md` §5 — illustrate state changes and final/confirmation states, not
  every navigation click.

### Cross-links and navigation

- Link related guides inline ("Readmore" pattern): `See [Managing product variations](…).`
- Cross-link companion BA docs instead of duplicating (the API reference links the developer-quickstart,
  not re-renders it).

### Voice

- Second person, present tense, active voice: "You fill in the card details and place your order."
- Short sentences (≤ 20 words for Customer; a little longer is fine for Developer).
- Define a term once, then use it consistently with Virto's vocabulary (catalog, price list, fulfillment
  center, dynamic property, blade, facet, store, organization). Confirm the term against VirtoOZ.

---

## 3. Customer doc skeleton (StorefrontUserGuide style)

Audience: shoppers. **Zero technical jargon. No API calls, no GUIDs.** Describe only what the customer
sees and clicks.

```markdown
# {Task the shopper wants to accomplish}

### Introduction
{1–2 sentences: what this lets you do and the one-step value.}

![{what the screenshot shows}](../../../{path}/screenshots/{name}.png)
*{Caption tying the image to the intro.}*

### Prerequisites
- {State the cart/account/address preconditions in shopper language.}

### {Path 1 — primary happy path}
1. {Imperative step naming the exact button/field in **bold**.}
2. ...
   ![{step state}]({path})
   *{caption}*
8. On success you will see: **"{exact success message}"**.

!!! note "{anticipated shopper question}"
    {Plain-language answer.}

### {Path 2 — alternative / edge path}
...

### Troubleshooting
- **{Symptom the shopper might hit}** — {what to do.}
```

Signature: friendly intro, explicit prerequisites, one path per real user journey, success message quoted
verbatim, `!!! note` boxes answering the questions a shopper actually asks.

---

## 4. Admin doc skeleton (PlatformUserGuide style)

Audience: back-office operators. More technical than Customer, still task-first. This is the **most
procedure-heavy** style — mirror the "Manage Products" / "Manage Properties" pages.

```markdown
# {Manage X}

{1–2 sentence definition of the entity and where it lives in the platform.}

## Overview / Key features
{Optional: a diagram or bulleted list of what this module/area lets you manage, each item linking to its
sub-guide.}

## {Add / Configure X}
To {goal}:
1. Click **{Module}** in the main menu.
2. In the next blade, {action}.
   ![{blade}]({path})
3. In the **{Blade name}** blade, fill in the following fields:
   | Field | Description | Example |
   |-------|-------------|---------|
   | ... | ... | ... |
4. Click **{Save/Create}** in the toolbar.

{Confirmation sentence: "The product has been added to the selected category."}

!!! tip
    {Operational shortcut — bulk action, import path, etc.}

!!! note
    {Module dependency or precondition, e.g. "Requires the preinstalled X module."}

#### {Sub-task — value-type table, bulk action, etc.}
...

********
<div style="display: flex; justify-content: space-between;">
<a href="{prev}">← {Prev topic}</a>
<a href="{next}">{Next topic} →</a>
</div>
```

Signature: definition lead-in, field tables with an Example column, value-type/option tables, bulk-action
sub-sections, module-dependency `!!! note`s, prev/next footer nav.

---

## 5. Developer doc skeleton (PlatformDeveloperGuide style)

Audience: integrators and extenders. Get them to a working call fast.

```markdown
# {Feature} — Developer Guide

{One paragraph: what this is and what you'll be able to do by the end.}

## Prerequisites
- **{Tool}**: {version}. {Install link/command.}
- {Knowledge assumptions — "Basic knowledge of Vue 3 Composition API".}

## Quick Start
### Step 1: {action}
```bash
{runnable command}
```
### Step 2: {action}
```{lang}
{runnable code — full, no `{...}` gaps}
```
Your {result} is now available at `{url}`.

## {Options / Configuration}
| Option | Description | Default |
|--------|-------------|---------|
| ... | ... | ... |

## {API reference}
{For REST/GraphQL: follow the scenario-led structure in ba-api-specialist's `api_docs_markdown` rules —
common setup once, shared types once, then numbered runnable scenarios with "what happens server-side".}

## {Project structure / extension points}
```text
{directory tree, annotated}
```

## Conclusion / Next steps
{1 paragraph recap + links to deeper guides.}
```

Signature: overview → versioned **Prerequisites** → **Quick Start** numbered steps → every code block
runnable (`bash` / `env` / `text` / `graphql`) → options tables → annotated directory trees →
`!!! tip` / `!!! warning` / `!!! success` callouts → Conclusion with next steps. **Schema-validate every
type/field name** against `graphql-schema.md` and use `{{BACK_URL}}` for hosts (see §7).

---

## 6. Sales doc skeleton (virtocommerce.com marketing style) — NEW AUDIENCE

Audience: sales reps, pre-sales, and buyer-side decision makers. **This is NOT a how-to.** It sells the
outcome. Lead with the buyer's pain, name the Virto capability that removes it, state the business result.
Never include step-by-step instructions, GUIDs, code, or admin blade names.

```markdown
# {Benefit-led headline — "B2B Ecommerce That Scales with Your Sales Team"}

{1 short paragraph: the buyer's world and what Virto delivers out of the box.}

## {Capability 1 — named as a benefit}
{Pain → capability → outcome, 3–5 sentences.}
With Virto, you can:
- {Concrete capability stated as a customer win}
- ...

## {Capability 2}
...

## Use Cases
- {A vendor/distributor/rep scenario in one sentence — concrete, relatable.}
- ...

## Strategic Benefits
- **{Benefit}:** {one line.}
- **Scalable account coverage:** ...
- **Consistency & compliance:** ...
- **Sales agility:** ...

## {Optional: Case study teaser}
{One sentence + "Read the case study →".}

---
*Want to see this in action? [Book a demo](https://virtocommerce.com).*
```

Signature: benefit headline, pain→capability→outcome rhythm, **"With Virto, you can:"** bullet clusters,
**Use Cases** section, **Strategic Benefits** bullets, feature groupings (Enhance Efficiency / Improve
Transparency / Increase Revenue when listing many features), a case-study teaser, and a closing
**Book a demo / Book a Meeting** CTA. Confident, outcome-oriented voice — but **never invent metrics,
customer names, or claims**: only state benefits the feature actually delivers (verify against the
`VirtoCommerce` VirtoOZ tool), and keep it grounded in what was observed in the system analysis.

> **Truth guardrail for Sales docs.** Marketing voice ≠ marketing fiction. Every capability claimed must
> map to a real, observed feature (from `ba-system-analyzer` output or a verified live flow). Do not
> promise a roadmap item, an unverified integration, or a performance number you didn't measure. A Sales
> doc that oversells is a defect.

---

## 7. Cross-cutting rules (all audiences)

1. **No hardcoded env-dependent values.** Resolve via `{{VAR}}` (URLs/creds), `@td(ALIAS.field)` (named
   entities), or pull from the `test-data/graphql/` fixtures. Hosts are `{{BACK_URL}}` / `{{FRONT_URL}}`.
   See `.claude/rules/test-data.md`. (Sales docs rarely need values; if they do, use generic language.)
2. **Ground terminology in VirtoOZ, not memory.** Before publishing, query the matching tool and mirror
   the published phrasing for any platform concept.
3. **Cite sources.** End reference/dev/admin docs with a `Sources:` line linking the VirtoOZ doc pages or
   GitHub `file:line` used. Sales docs cite the `virtocommerce.com` feature page.
4. **Real screenshots, never placeholders** (Customer/Admin docs).
5. **Respect `.claude/rules/reports.md`** — size caps, screenshot budgets, the four allowed report
   categories. Docs live in `reports/ba/`.
6. **Schema-validate developer examples** against `graphql-schema.md` / live introspection before publish.

---

## 8. Worked references already in the repo

| Style | Exemplar file | Why it's the gold standard |
|-------|---------------|----------------------------|
| Developer / ops reference | `reports/ba/ba-prerender-io-doc-2026-06-05.md` | Sourced links, runnable curl recipes, admonition-style warnings, known-limitations section |
| Customer how-to | `reports/ba/ba-report-2026-06-05.md` §1 | Intro → Prerequisites → numbered paths → quoted success message → `!!! note` boxes, real screenshots |
| API reference (developer) | `reports/ba/pr-114-api-docs.md` | Scenario-led, common-setup-once, "what happens server-side" per mutation (see `ba-api-specialist` rules) |

When unsure how a style should read, open the exemplar before drafting.
