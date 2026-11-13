# Project facts — what differs per project, and where each value comes from

The visual lane runs on any Virto Commerce project: the **platform** project (vc-frontend itself) and a
**client** project, usually a fork of the storefront theme with its own presets, components, routes and data.
The method in this skill is the same on both; only the facts below differ. Every file in this skill that needs
one of them cites this table rather than naming vc-frontend's value, so a fork never silently inherits it.

## Project type

Read `projectType` from the project's `project-profile.json` (vc-init writes it; a brief may state it):
`platform` or `client`. **No profile and no statement in the brief ⇒ `client`** — the safe side, because the
two steps it gates (the public `kb`, the plugin-shipped matrix) would otherwise leak a customer's routes or
suggest editing a file the client cannot change.

## The facts

| Fact | Platform (vc-frontend) | Client fork | Not found ⇒ |
|---|---|---|---|
| **Storefront repo** — where usages, components and stories are searched | `VirtoCommerce/vc-frontend` | the `repos.client[]` entry with `kind: "frontend"` in `project-profile.json` | upstream `VirtoCommerce/vc-frontend`, and say the fork was not searched |
| **Code host** for that search | GitHub — GitHub MCP `search_code` | the entry's `host`: `github` as on the left; `azure-repos` ⇒ grep a local checkout of the repo | the source step did not run — say so, then fall back to the live probe |
| **Source layout** (file path → route) | `client-app/pages/…`, `client-app/shared/…` ([`explorer-flow.md`](explorer-flow.md) Step 1.2) | the same when the fork keeps it; otherwise map from the fork's router | live probe only |
| **Component names** | the `Vc*` UI kit (`VcButton`, `VcTable`, …) | the fork's own; a renamed or replaced component is off-matrix | treat the target as off-matrix |
| **Storybook** | `STORYBOOK_URL` from the env | the fork's own `STORYBOOK_URL` | no Storybook phase — say so, run the storefront |
| **Story list** | `{STORYBOOK_URL}/index.json` (Storybook 7+), then the title convention in [`scope-resolution.md`](scope-resolution.md) §Step 2.5 | same | storefront only |
| **Gated theme presets** | Coffee and Red | [`a11y-audit.md`](a11y-audit.md) §Theme scope — the brief's, else Coffee and Red if the fork still ships them, else its default theme | the default theme, named in the report |
| **Design tokens** | read live from `:root` | read live from `:root` | — never a hand-listed value |
| **Measurement scales** (`SPACING_GRID`, `UI_KIT_BUTTON_SIZES_PX`, viewport sweep) | `<plugin>/lib/design/measure-layout.mjs`, generated from vc-frontend | the same file — **still vc-frontend's**: a finding that depends on one is **WARN, not FAIL**, until checked against the fork's own config (`tailwind.config`, its theme) | — |
| **Critical-UI matrix, selectors, config flags** | `<plugin>/knowledge/critical-ui-scope.md`, `storefront-selectors.md`, `storefront-config-flags.md` | hints only: the brief's target is the scope; an off-matrix note stays in the report, never a "promote it" suggestion (the matrix ships with the plugin) | heuristic scope ([`scope-resolution.md`](scope-resolution.md) §Step 2) |
| **Personas and their accounts** | derived from the ticket — archetype + segments ([`personas.md`](personas.md) §1–§2); accounts are the stand's `<KEY>_LOGIN` keys carrying those segments, checked live | the same derivation over the fork's ACs, diff and settings; the fork's own keys | `NOT RUN — no <persona> account` — add one with `/project-init --add-user` |
| **Test data in examples** (an unavailable product, an org) | the vcst examples in this skill | never reused — find one live on the stand | state the precondition you could not reach |
| **Observed-behaviour base (`kb`)** | read and write (the agent's §3 Procedure) | **never** — return `kb: not read (client install)` | — |
| **Tracker** for a filed bug | as `project-profile.json` names it, through `/vc-fix:qa-bug` | same | — |
