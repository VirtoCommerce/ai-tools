---
description: "Evaluate a design: dual Storybook + Storefront BL-UI audit for components; storefront audit for pages/flows. Reports pass/fail per invariant with evidence."
argument-hint: "component | page path or URL | flow name [--storefront-only]"
disable-model-invocation: true
---

# /qa-design — Design & UX Evaluation

Run a layout-stability + design-system audit against a component, page, or flow. For **components**, evaluates **both Storybook (isolated)** and **Storefront (real integration)** by default — the two surfaces catch different bug classes (isolation-only bugs vs integration-only bugs). For **pages and flows**, evaluates the Storefront only (Storybook hosts components, not pages). Resolves scope from the critical-UI matrix when possible; falls back to selector discovery + heuristic invariant resolution for off-matrix targets. Delegates execution to `ui-ux-expert` — this command is the orchestration shell, the methodology lives in the [`/qa-design` skill](../skills/testing/qa-design/SKILL.md).

## Usage
```
/qa-design VcTable                       # Component → dual eval (Storybook + Storefront)
/qa-design VcTable --storefront-only     # Component → storefront only (skip Storybook)
/qa-design /cart                         # Page → storefront only (Storybook N/A for pages)
/qa-design checkout flow                 # Flow → storefront only across stops
/qa-design VcDatePicker                  # Off-matrix component → dual eval w/ story discovery
```

---

## Pipeline: Parse → Resolve scope → Resolve Storybook story → Dispatch → Report → Ask

### Step 1 — Parse parameter

Classify the argument:
- **Component name** — matches an entry (case-insensitive) in [critical-ui-scope.md](../agents/knowledge/critical-ui-scope.md) Component Inventory (VcButton, VcProductCard, VcLineItem, VcTable, VcDialog, Popover, VcSidebar, BOPIS Modal) → in-matrix component.
- **Component name** not in the inventory (e.g., `VcDatePicker`, `VcAlert`, `VcInput`, `VcSelect`) → off-matrix component (go to Step 2 Case B).
- **Page** — starts with `/` or is a full URL. Match against the 9 entries in Page Inventory (`/`, `/catalog`, PDP, `/cart`, `/account/orders`, `/account/lists`, `/company/members`, `/company/info`, Configurable PDP) → in-matrix page. Anything else → off-matrix page.
- **Flow name** — keyword match (`checkout`, `purchase`, `onboarding`, `sign-up`, `b2b-invite`) → resolves to an ordered list of pages.

**Flags:**
- `--storefront-only` — skip the Storybook phase for component targets. No-op for page/flow targets (already storefront-only).

Resolve current sprint: check `tests/Sprint-current` → otherwise list `tests/` and pick the latest `SprintXX-XX`. This becomes `{SPRINT}` for the output path.

---

### Step 2 — Resolve audit scope

**Case A — Target IS in the matrix:**
- Read the relevant matrix in [critical-ui-scope.md](../agents/knowledge/critical-ui-scope.md) (components matrix for component, pages matrix for page).
- Collect BL-UI-NNN columns whose cell is NOT `n/a` (e.g., VcTable → BL-UI-002 / 003 / 004 / 005; skip 001 and 006).
- Selector + render-location come straight from the matrix row.

**Case B — Target is OFF-matrix (component):**

Produce a real audit, not a generic "audit all six" fallback.

1. **Resolve selector + render-location:**
   - Check [storefront-selectors.md](../agents/knowledge/storefront-selectors.md) for the component name. Many vc-frontend components are documented there even if not in the critical matrix.
   - If not found → use GitHub MCP `search_code` against `VirtoCommerce/vc-frontend` for the component file (e.g., `VcDatePicker.vue`, `VcAlert.vue`). Extract `data-test-id` / root class from the template. Then `search_code` for usages of `<VcDatePicker` to find which pages render it.
   - If still ambiguous → ask: "I couldn't find a confirmed render location for `{Component}`. Provide a page URL where it's visible, or say `discover` and I'll have ui-ux-expert explore the storefront to find it."
   - On `discover` → dispatch `ui-ux-expert` with a discovery charter (visit `/sign-up`, `/cart`, `/checkout`, account pages); capture the first page that renders the component plus the verified selector.

2. **Resolve applicable invariants heuristically** — derived from component characteristics:

   | Invariant | Applicability rule |
   |-----------|--------------------|
   | BL-UI-001 CLS | Skipped — page-level metric, not a single-component concern. |
   | BL-UI-002 spacing-grid | ON by default (almost every component has padding/margin/gap). |
   | BL-UI-003 state-shift | ON if component has `:hover`, `v-if`, `transition`, or open/active/expanded state in its source. |
   | BL-UI-004 overflow | ON if component renders variable-length content (slots, string props, lists, images). |
   | BL-UI-005 alignment | ON if ≥ 2 horizontally-arranged children with similar role (button row, label/input pair). |
   | BL-UI-006 touch targets | ON if any interactive element (`button`, `input`, `<a>`, `@click`, `role="button"`). Mandatory if present. |

   Uncertain cases → run the union of definitely-applicable invariants and report which were skipped + why. User can re-run with `--all` for full coverage.

3. **Warn + offer to promote** — print: "`{Component}` is off-matrix. Audited with heuristic invariant scope: [list]." After audit, if findings exist or the component appears in audit history ≥ 3 times, suggest: "Consider adding to [critical-ui-scope.md](../agents/knowledge/critical-ui-scope.md) so it's regression-protected." Never auto-edit the matrix.

**Case C — Off-matrix page:** Apply default page-level invariants (BL-UI-001 CLS + 002 spacing-anchor + 004 overflow + 006 touch). Print "off-matrix page" warning + promote-suggestion.

**Case D — Flow target:** Union of all pages in the flow (each resolved via Case A or C).

---

### Step 2.5 — Resolve Storybook story (component targets only)

Skip this step if:
- Target is a page or flow (Storybook hosts components, not pages).
- User passed `--storefront-only`.

Otherwise, discover the Storybook URL using **convention first, GitHub fallback**:

1. **Convention** — try `{STORYBOOK_URL}/?path=/story/{atomic-level}-{component-kebab}--default`. Atomic Design levels in vc-frontend Storybook: `atoms`, `molecules`, `organisms`, `templates`. Component name is kebab-cased (`VcTable` → `vc-table`). Example: `https://storybook.example.com/?path=/story/organisms-vc-table--default`. Send a HEAD request — if the iframe loads, use it.

2. **GitHub fallback** — if convention 404s, use GitHub MCP `search_code` against `VirtoCommerce/vc-frontend` for `{Component}.stories.ts` (e.g., `VcDatePicker.stories.ts`). Read the file to extract:
   - The `title` field (e.g., `'Atoms/VcDatePicker'`) → maps to `?path=/story/atoms-vc-date-picker--{first-story-name}`.
   - The first exported story name (defaults to `Default` or `Primary`).
   - Construct the URL accordingly.

3. **Skip Storybook phase** — if neither convention nor GitHub finds a story:
   - Print: "No Storybook story found for `{Component}`. Running storefront-only."
   - Suggest at audit end: "Consider adding a Storybook story for `{Component}` so it can be audited in isolation."

`STORYBOOK_URL` comes from env (`config.js` / `.env`); never hardcode.

---

### Step 3 — Dispatch ui-ux-expert

Use the **Agent tool** with `subagent_type: ui-ux-expert`. Browser: `Chrome DevTools MCP` (per [.claude/rules/agents.md](../rules/agents.md)). For component targets without `--storefront-only`, the agent runs **two phases in sequence**; for page/flow targets (or with `--storefront-only`), only Phase B runs.

**Phase A — Storybook audit (component targets, Storybook story resolved in Step 2.5):**

- Navigate to the Storybook story URL.
- Wait for the story iframe to render (story `#story` element painted, no skeletons).
- Run the same invariant audits as Phase B but scoped to the story's rendered DOM (typically `#root` or the `[data-test-id]` of the component within the iframe).
- Output: `tests/{SPRINT}/qa-design/{target-slug}-{YYYY-MM-DD}/storybook/` — screenshots only for FAIL.
- Methodology reuse: [`/qa-storybook` skill](../skills/testing/qa-storybook/SKILL.md) — same responsive-breakpoint and isolation patterns.

**Phase B — Storefront audit (always runs):**

For **component targets**, Phase B uses an **explorer approach** — components render in multiple contexts (cart, catalog, account, modal, etc.), and a component can pass on one page while failing on another. Single-location auditing misses page-specific layout bugs (e.g., parent overrides, real-data overflow, sticky-header conflicts). The explorer flow enumerates 2-3 representative contexts and audits the component in each.

For **page or flow targets**, the page IS the context — skip the explorer enumeration and audit the page directly (the viewport sweep + invariant audits ARE the exploration at that level).

**Component explorer flow (Phase B for components):**

1. **Find where the component is used across the storefront** — produce a confirmed candidate list, then pick up to 3 contexts.

   **Step 1.1 — Source-code grep (authoritative)** via GitHub MCP `search_code` against `VirtoCommerce/vc-frontend`:

   ```
   search_code(query="<{Component} repo:VirtoCommerce/vc-frontend", per_page=30)
   search_code(query="{Component} repo:VirtoCommerce/vc-frontend extension:vue", per_page=30)
   ```

   The first query catches `<VcTable …>` PascalCase usage. The second catches kebab-case usage `<vc-table …>` and dynamic mounts. Combine results, dedupe by file path.

   **Step 1.2 — Map file path → storefront URL** for each match:

   | File-path pattern | Storefront URL |
   |-------------------|----------------|
   | `client-app/pages/{page}.vue` or `pages/{page}/*.vue` | `/{page}` (top-level route) |
   | `client-app/pages/account/{view}.vue` | `/account/{view}` |
   | `client-app/pages/company/{view}.vue` | `/company/{view}` |
   | `client-app/shared/cart/*.vue` | rendered on `/cart` (and possibly in mini-cart dropdown — note: needs probe) |
   | `client-app/shared/checkout/*.vue` | rendered on `/cart` (single-page checkout) |
   | `client-app/shared/catalog/*.vue` | rendered on `/catalog`, PDP, and category pages |
   | `client-app/shared/layout/header*.vue` | rendered on **every** page (header / nav slot) |
   | `client-app/shared/layout/footer*.vue` | rendered on **every** page (footer slot) |
   | `client-app/shared/modal/*.vue` | conditional — triggered by an action (e.g., select-address, ship-to popover) — needs probe |

   When a match is in a shared partial, also read the partial via GitHub MCP `get_file_contents` and trace which page imports/embeds it (`search_code` for the partial's filename in `.vue` files) to find the final mount point.

   **Step 1.3 — Cross-check against the curated map** — read [critical-ui-scope.md](../agents/knowledge/critical-ui-scope.md) Render-Location Map. For in-matrix components, the curated locations are high-confidence; treat them as candidates first, then add any GitHub-discovered locations the curated map missed (and surface the gap in the report).

   **Step 1.4 — Live probe to confirm rendering** — for each candidate URL, before audit:
   - Navigate via ui-ux-expert (real-user click-through, per [`feedback_real_user_interaction`](../../../memory/feedback_real_user_interaction.md) — NOT direct deep-linking unless that IS the natural entry).
   - Run `document.querySelectorAll('{selector}').length > 0` (selector from [storefront-selectors.md](../agents/knowledge/storefront-selectors.md) or matrix row).
   - Keep candidates where the component actually mounts; drop candidates where it doesn't (some usages are conditional on auth state, cart contents, feature flags, B2B vs B2C store, etc.).
   - For conditional mounts, capture the precondition in the report (e.g., "VcLineItem renders on /cart only when cart has ≥ 1 item — precondition: `[PRE:RESET_CART]` + add SKU before audit").

   **Step 1.5 — Pick the 3 contexts** for audit, ordered by priority:
   1. **Primary context** — the matrix-row path for in-matrix components (always first), or the discovered path for off-matrix components.
   2. **Adjacent context** — a confirmed-rendering URL from Steps 1.1–1.4 that's distinct from the primary (different page type if possible: e.g., for `VcButton`, primary `/cart` (CTA), adjacent `/catalog` (filter/sort buttons)).
   3. **Contrast context** (optional, 3rd slot) — a context that pressures a *different* invariant:
      - Component on a page with long content → stresses BL-UI-004 overflow.
      - Component on a page with sticky parent → stresses BL-UI-003 state-shift.
      - Component inside a modal → stresses BL-UI-006 touch targets at 375 px.
      - Skip if no such context exists or if the first two already cover all in-scope invariants.

2. **Bound the enumeration** — audit **at most 3 contexts**. If the candidate list is longer:
   - Prefer contexts that exercise different invariants (don't pick three pages that all exercise the same one).
   - Prefer high-traffic / revenue-critical pages (`/cart`, `/catalog`, PDP) over edge pages.
   - Log skipped candidates in the report under "Not audited — out of budget" so the user can re-run for them later.

3. **Audit each context** — for each enumerated URL:
   - Navigate via real-user interaction (click nav, follow links — NOT direct deep-link unless that IS the natural entry path per [`feedback_real_user_interaction`](../../../memory/feedback_real_user_interaction.md)).
   - Wait for the component to mount + paint (no skeletons, no FOUC).
   - Run the resolved invariant audits at 375 / 768 / 1280.
   - Capture rect snapshot + computed-style sample per invariant; screenshot only on FAIL.

4. **Cross-context analysis** — after all contexts are audited, compute per-invariant outcome across contexts:
   - **Stable PASS** — invariant passes in every context. No issue.
   - **Stable FAIL** — invariant fails in every context. Component-level bug; fix at the component.
   - **Context-specific FAIL** — invariant fails in only some contexts. Integration bug; the *failing context* is where to fix (parent layout, page-level CSS, real data overflow).
   - This classification is the unique value of the explorer approach — it tells the user WHERE to fix, not just WHAT.

- Output: `tests/{SPRINT}/qa-design/{target-slug}-{YYYY-MM-DD}/storefront/{context-slug}/` per context — screenshots only for FAIL.

**Page or flow target (Phase B simplified):**

- Navigate to the resolved URL via real-user interaction.
- For each viewport (375 / 768 / 1280), run the invariant audits on the live page.
- Output: `tests/{SPRINT}/qa-design/{target-slug}-{YYYY-MM-DD}/storefront/` — screenshots only for FAIL.

**Both phases share:**

- Resolved BL-UI invariant list from Step 2.
- Reference paths the agent must consult:
  - [business-logic.md § Domain 15](../agents/knowledge/business-logic.md) — BL-UI invariant definitions.
  - [measure-layout.ts](../../scripts/lib/measure-layout.ts) — `LAYOUT_SNIPPETS`, `spacingAuditSnippet`, `alignmentAuditSnippet`, `rectSnapshotSnippet`, classifiers.
  - [storefront-selectors.md](../agents/knowledge/storefront-selectors.md) — verified DOM selectors.
  - [/qa-design skill](../skills/testing/qa-design/SKILL.md) — methodology (live-token extraction, audit order, Findings → Filings tree).
- Audit at three viewports: 375 / 768 / 1280 (skip a viewport only if the target is verifiably desktop-only).
- Evidence capture per [evidence-capture-policy.md](../skills/qa-methodology/qa-evidence/evidence-capture-policy.md) — screenshots for FAIL states only.

---

### Step 4 — Consolidate report

Receive agent results, write `tests/{SPRINT}/qa-design/{target-slug}-{YYYY-MM-DD}/report.md`.

**Component targets (dual eval)** — two result columns highlight isolation-only vs integration-only failures:

```markdown
# /qa-design — {Component}

**Date:** YYYY-MM-DD
**Target type:** Component
**Target:** {name}
**Matrix scope:** {covering test IDs from critical-ui-scope.md, or "off-matrix — heuristic scope"}
**Storybook story:** {URL or "not found — storefront-only"}
**Storefront URL:** {URL}
**Viewports:** 375 / 768 / 1280

## Invariant Results

| Invariant | Storybook | Storefront | Diagnosis |
|-----------|-----------|------------|-----------|
| BL-UI-002 spacing-grid | PASS | FAIL | Integration-only — passes in isolation, fails in real page |
| BL-UI-003 state-shift  | FAIL | FAIL | Component-level bug |
| BL-UI-006 touch targets | PASS | PASS | OK |

## Findings
- [BL-UI-NNN] short description — phase, computed-style snippet, screenshot path
```

**Diagnosis legend:**
- Storybook PASS + Storefront FAIL → **integration-only bug** (component fine alone, broken in real page context — e.g., parent overrides, real data overflows).
- Storybook FAIL + Storefront FAIL → **component-level bug** (broken at the base; fix at the component, not the page).
- Storybook FAIL + Storefront PASS → **rare** — likely bad story props or stale baseline; verify the story.
- Storybook PASS + Storefront PASS → OK.

**Page or flow targets (storefront only)** — single column:

```markdown
| Invariant | Result | Evidence |
|-----------|--------|----------|
| BL-UI-001 CLS | PASS / FAIL | path |
| ...           | ...        | ...  |
```

**Off-Matrix Note (if applicable):** "{Target} is not in critical-ui-scope.md. Consider promoting it." Same applies when a Storybook story is missing for an off-matrix component.

---

### Step 5 — Findings → Filings (ask user)

Apply the decision tree in [SKILL.md § Findings → Filings](../skills/testing/qa-design/SKILL.md):

- 0 failures → done; print summary.
- N failures → list them; ask: "File these via `/qa-bug`? (y/n)"
  - Yes → dispatch `/qa-bug` per failure (or one rollup bug for systemic drift per the decision tree).
  - No → report written, no JIRA call.

Never auto-file. Explicit `y` required.

---

## Rules

- Delegate execution to `ui-ux-expert` via the **Agent tool**; this command does not run measurements directly.
- **Default mode is dual eval** for component targets (Storybook + Storefront). Use `--storefront-only` to skip the Storybook phase. Page and flow targets always run storefront-only — Storybook hosts components, not pages.
- Storybook story discovery uses convention (`{STORYBOOK_URL}/?path=/story/{atomic}-{component-kebab}--default`) first, then GitHub MCP `search_code` for `{Component}.stories.ts` fallback. If neither resolves, skip the Storybook phase with a note — never fail the audit.
- Cite the BL-UI / WCAG / ECL ID for every finding — findings without citations decay into subjective debate.
- Audit at 375 / 768 / 1280 viewports unless the target is verifiably desktop-only.
- Never hardcode design tokens — read live `:root` custom properties (per [SKILL.md "Read live tokens, never hardcode"](../skills/testing/qa-design/SKILL.md)).
- `STORYBOOK_URL` and `FRONT_URL` come from env / `config.js` — never hardcode URLs.
- Ask before filing bugs (explicit user yes required).
- Off-matrix targets get audited but trigger a warning + "Consider adding to critical-ui-scope.md" suggestion. Never auto-edit the matrix.
- Browser: ui-ux-expert uses `Chrome DevTools MCP`. Max 3 concurrent browser agents (per [agents.md](../rules/agents.md)). Phase A and Phase B run sequentially within the same agent dispatch; they do not need two browser slots.
- Output path follows [output-paths.md](../skills/qa-methodology/qa-evidence/output-paths.md): `tests/{SPRINT}/qa-design/{target-slug}-{YYYY-MM-DD}/{storybook|storefront}/`.
