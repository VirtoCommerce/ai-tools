---
domain_slug: page-builder
applicability: universal
rationale: |
  What the Page Builder / CMS-authoring domain IS and where its surfaces are — the native
  drag-and-drop page composer (VirtoCommerce.PageBuilderModule), its newest slice (Shared
  Components, shipped as PR-159), the adjacent VirtoCommerce.Pages delivery index and the
  VirtoCommerce.BuilderIO external-SaaS integration that publishes into the same index. Built on
  request as a FULL /qa-test 1c-map style pass, scoped to the whole domain rather than only the
  newest feature, because the existing prior art (two BA docs, six months apart) never established
  the domain as a whole and Shared Components (2026-08/09) has zero regression coverage.
  NOTE: `config/test-suites.json` tags these suites `"domain": "content-cms"`, not `page-builder` —
  there is no `bl:extract` domain token for either spelling (no `BL-CMS-*` invariants exist yet;
  the domain's few invariants are scattered under BL-NOTIF/BL-SEO/BL-UI). This map is filed at
  `page-builder.md` / `domain_slug: page-builder` per the brief that requested it; a consumer
  matching by `config/test-suites.json`'s `domain` field should also try `content-cms`.
generated: 2026-09-17
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/Page Builder (CMS)/ (2 prior-art docs: ba-pagebuilder-ui-analysis-2026-03-25.md, ba-report-VCST-4872-pagebuilder-save-load-clone.md — verdicts in §6)
  - live enumeration on vcptcore-qa (Admin PageBuilder Shell + Shared Components + REST + storefront GraphQL), 2026-09-16/17
  - vc-module-pagebuilder @ dev (module.manifest + PageBuilderPageController.cs, fetched via GitHub web view 2026-09-16 — GitHub MCP and `gh` CLI both unavailable this session; see §NOT REACHED)
  - GET /api/platform/security/permissions on vcptcore-qa, 2026-09-16 (live permission inventory, 20 entries across 3 modules)
  - config/test-suites.json + regression/suites/Backend/page-builder/** + regression/suites/Backend/graphql/050f-graphql-xcms.csv
  - test-data/aliases.json changelog entries `changelog_1_5_34`..`changelog_1_5_38` (seeder history for pagebuilder-pages)
excludes: none deliberately excluded, but VirtoOZ/Context7 published docs and a fully-independent GitHub source read were NOT REACHED this pass (see below) — treat every `{DOC}`-shaped claim as absent, not as checked-and-silent.
---

# Page Builder (CMS authoring) — domain map

> Refresh with `/qa-domain-map page-builder` (note the domain-slug caveat above before relying on
> the command's own `bl:extract --list` validation gate). This file answers **what the feature is
> and where its surfaces are**. It does **not** carry behavioural rules — those are `BL-*` in
> `oracles/business-logic.md` — and it can **never ground an assertion as `{DOC}`**.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

---

## §1 — Purpose and value chain

**Purpose: `UNDECLARED`.** No purpose statement exists in either prior-art doc (both describe *how*
the shell/designer operate, never *why* the domain exists), in a previous domain map (there was
none), or in a published guide — **VirtoOZ MCP requires interactive OAuth and Context7 is likewise
unauthorized in this session, so neither `PlatformUserGuide` nor any CMS-specific guide could be
queried this pass.** This is a genuine `NOT REACHED`, not a checked-and-absent finding — say so
rather than silently treating the domain as undocumented. The chain below is **reconstructed** from
source + live and is the first written statement of it; cite it as a hypothesis to contradict.

**The domain is three cooperating, separately-versioned modules, confirmed live 2026-09-16**
(`GET /api/platform/modules`):

| Module | Version (vcptcore-qa) | Role |
|---|---|---|
| `VirtoCommerce.Pages` | 3.1008.0 | The delivery index ("VirtoPages") the storefront actually queries — a dependency of PageBuilderModule, listed `optional` in its manifest |
| `VirtoCommerce.PageBuilderModule` | 3.1025.0-pr-159-7361 | The native drag-and-drop authoring tool (this ticket's deployed build = PR #159, Shared Components) |
| `VirtoCommerce.BuilderIO` | 3.1005.0 | External SaaS visual-CMS integration; publishes into the **same** `Pages` index via its own webhook |

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | A page comes into existence | `POST /api/page-builder-pages/grouped` (Admin `Add`) · a JSON file (Load Content) · or externally, Builder.io's own editor + `POST /api/pages/builder-io` webhook — a path this platform never sees authoring for |
| 2 | It gets identity + content | Name · Language(culture) · Permalink · a content tree of sections/blocks authored in the **Template Builder Designer** (a *separate* Vue SPA, `/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/index.html`) |
| 3 | Content can be built from REUSABLE pieces | **Shared Components (PR-159, newest slice):** adjacent top-level sections are converted into a store-scoped `PageBuilderSharedComponent`; a page holds a **linked placement** — a top-level item with exactly the three keys `{id, type:"componentRef", componentRef}` — that stays in sync when the original is edited, or an **independent copy** with regenerated ids that forks and diverges |
| 4 | It is scheduled + gated | Scheduling (StartDate/EndDate) · Personalization (Visibility toggle, User groups, Organization) — both collapsed by default in the page blade |
| 5 | It is promoted through a status lifecycle | Draft → Published (Active) → Archived, with Pending as a scheduled-not-yet-live substate. Content + schedule must land in **one** publish call — a documented footgun (test-data changelog `changelog_1_5_37`): a second publish on an already-promoted page drains the just-set content |
| 6 | It is indexed for delivery | Publish writes into the `VirtoCommerce.Pages` index — the **same** index Builder.io's webhook writes into. The storefront never distinguishes which tool authored a given page |
| 7 | The storefront resolves and renders it | `slugInfo(permalink, storeId, cultureName) → entityInfo.id` then `pageDocument(id){content}` — **CONFIRMED live 2026-09-17** on a Shared-Components page (`/agent-test-q5-use1`, vcptcore-qa-storefront): the delivered `content` is a fully **EXPANDED** tree — no `componentRef` anywhere — with the linked placement's three blocks rendered as ids `lc6167706c6163652d75736531section{0,1,2}` (hex-decodes to `agplace-use1section0/1/2`) |
| 8 | It can be duplicated / exported / reused | Clone (metadata copied client-side, content copied server-side via `POST /grouped/{target}/content/{source}`) · Save/Load content (JSON file round-trip) |
| 9 | It is retired | **Archive is the only soft-delete reachable from the shell UI** (no hard-delete control was observed this pass, though `DELETE /grouped/{groupId}` exists at source — `UNVERIFIED` at the UI layer). A Shared Component's retirement is **gated**: Delete is disabled while `usageCount > 0` — **CONFIRMED live**, blade shows "Remove this component from all 3 pages before deleting it." This is a real reverse-edge guard; no equivalent guard was found preventing archival of a page that a Shared Component still targets (the two reverse edges are not symmetric — `UNVERIFIED` whether archiving a *page* silently orphans a linked placement's usage count) |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Category Manager / CMS admin (`builder:*`) | Everything in the chain above | `CONFIRMED` live (exercised as `admin` on vcptcore-qa) |
| Restricted back-office role (`builder:access`+`builder:read`, no `builder:update`) | Expected: Save/Load/Clone hidden or disabled; copy-content endpoint 403s (suite CMS-123/124) | `UNVERIFIED` whether the `RESTRICTED_CMS_ADMIN` fixture's role (seeded per changelog dated before PR-159 landed) also carries the newer `builder:shared-components:*` grants — **G2** |
| Storefront visitor | Read-only via GraphQL; no authoring surface | `CONFIRMED` live |
| Builder.io author | Authors entirely outside this platform's own auth; publishes via webhook into the shared index | `UNVERIFIED` — out of reach from this platform's own surfaces by construction |

---

## §2 — Surface inventory

### Back office (Admin SPA + embedded Vue shells)

- **Entry:** `{{BACK_URL}}/apps/page-builder-shell/?storeId=<store>` — a standalone Vue micro-frontend, hash-routed, session-cookie auth shared with the parent Admin SPA. `CONFIRMED` live 2026-09-16 (direct navigation from an already-authenticated session worked cleanly this pass — the March 2026 report's "direct navigation resets context" caveat did not reproduce; note as possible `DRIFT`, not re-investigated further).
- **Routes (hash):** `#/page-builder-draft`, `#/page-builder-pending`, `#/page-builder-active`, `#/page-builder-archived`, `#/page-builder` (All), `#/page-builder-assets` (Assets Library), `#/page-builder-shared-components` (Shared Components). All seven `CONFIRMED` live.
- **Live counts, vcptcore-qa, 2026-09-16:** Draft 22 · Pending 0 · Active 47 · Archived 41 · All "99+" (badge caps its display). `POST /api/page-builder-pages/search` (`take:100`) reports `totalCount: 107` — close to but not exactly Draft+Active+Archived=110; not reconciled this pass (data point, not asserted as a defect).
- **Grid columns** (Draft tab, `CONFIRMED` live): Name, Language, Permalink, Modified, Modified by, Status — plus a "Show/Hide Columns" control (hidden-by-default columns exist and were not enumerated this pass — `UNVERIFIED` what they are).
- **Status badges observed:** Draft, Published, Personalized, "Has draft with changes", Scheduled (prior report + this pass).
- **Page detail blade** (`CONFIRMED`, March 2026 report, not independently re-opened this pass): Basic info (Name, Language, Permalink + clickable storefront URL) · Scheduling (Start/End date, collapsed) · Personalization (Visibility toggle, User groups, Organization, collapsed) · toolbar: Save, Preview, Open Designer, Save content, Load content (Draft tab only), Clone, Publish/Archive.
- **Template Builder Designer** — a *third*, separate SPA at `/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/index.html`; component palette + canvas. **Not manageable from the shell's own list view** — every content edit requires opening this separate app.
- **Shared Components tab** — `CONFIRMED` live 2026-09-16:
  - List grid: Name, **Used on** (count), Modified, Modified by — 3 rows found on B2B-store (`AGENT-TEST-SC-q5`=3, `AGENT-TEST-SC-vcpt2-trio`=2, `saA1`=1).
  - Detail panel (opened on click): Store, Modified, Modified by, **"Used on (N pages)"** — an actual list of pages with permalink + culture + status (`AGENT-TEST-q5-use1 /agent-test-q5-use1 en-US - Published`, etc.) · **Rename** button · **Delete** button, disabled with usageCount>0 (see §1 link 9).
- **Assets Library tab** — a shared asset browser used both by page-content sections and by Shared Components; not separately re-audited this pass (prior report covered folder nav / upload / delete at REST level via suite 060b).
- **Settings, in the MAIN Admin SPA (not the shell):** Settings → BuilderIO (Enable toggle, Public API Key — plaintext, no format validation, prior report PP-08) · Store Settings → VirtoPages toggle. Both `CONFIRMED` live 2026-03-25 in the prior report; not re-opened this pass.
- **Permissions** — `CONFIRMED` live 2026-09-16 (`GET /api/platform/security/permissions`, 20 entries across 3 `moduleId`s):
  - `VirtoCommerce.Pages`: `Pages:create/read/update/delete`
  - `VirtoCommerce.BuilderIO`: `builderio:access/read/update/delete`
  - `VirtoCommerce.PageBuilderModule`: `builder:access`, `builder:create`, `builder:read`, `builder:update`, `builder:delete`, `builder:publish`, `builder:theme`, `builder:templates`, `builder:shared-components:read/create/update/delete`
  - `UNVERIFIED`: what UI, if any, is gated by `VirtoCommerce.Pages`'s own `Pages:*` group — no route in the shell was observed to require it directly (the shell's own routes gate on `builder:*` only).
- **Not manageable from the shell:** Builder.io webhook configuration (must be done in Builder.io itself, prior report) · a hard delete of a page (only Archive was observed as reachable) · the "hidden by default" grid columns (existence noted, contents `UNVERIFIED`).

### Storefront (customer-facing)

- **Entry:** `{{FRONT_URL}}/<permalink>` — resolved through GraphQL, not a dedicated REST route.
- **Contract:** `slugInfo(permalink, storeId, cultureName) → entityInfo.id`, then `pageDocument(id){content}`. `CONFIRMED` live 2026-09-17 on vcptcore-qa-storefront.
- **Delivered shape:** fully expanded JSON tree (no `componentRef`); a linked Shared-Component placement's blocks carry ids of the form `lc<hex(placementId)>section{N}` — `CONFIRMED` live, decoded (see §1 link 7).
- **Not manageable from here** — a visitor only ever reads; every authoring surface lives in the back office (or in Builder.io, outside this platform).

### API / contract layer

- **REST (`VirtoCommerce.PageBuilderModule`), read at SOURCE** (`PageBuilderPageController.cs`, GitHub `dev` branch, fetched 2026-09-16 — GitHub MCP and the `gh` CLI were both unavailable this session, so this was a web-view fetch, not an authenticated code search; treat exact line numbers as unavailable):

  | Verb | Path | Permission |
  |---|---|---|
  | POST | `/api/page-builder-pages/search` | `Read` |
  | GET | `/api/page-builder-pages/grouped/{groupId}` | `Read` |
  | PUT | `/api/page-builder-pages/grouped` | `Update` |
  | POST | `/api/page-builder-pages/grouped` | `Create` |
  | POST | `/api/page-builder-pages/grouped/archive` | `Delete` |
  | POST | `/api/page-builder-pages/grouped/publishing/{groupId}` | `Publish` |
  | DELETE | `/api/page-builder-pages/grouped/{groupId}` | `Delete` |
  | GET | `/api/page-builder-pages/grouped/publish-status/{groupId}` | `Read` |
  | GET/POST | `/api/page-builder-pages/grouped/{groupId}/content` | `Read`/`Update` |
  | POST | `/api/page-builder-pages/grouped/{targetGroupId}/content/{sourceGroupId}` | `Update` |

  `POST /api/page-builder-pages/search` re-confirmed **live** 2026-09-16 (200, `totalCount:107`, flat `Page` records carrying `id` — no `groupId` field surfaced in this response shape, `UNVERIFIED` whether `id` here equals a `groupId` for ungrouped pages).

- **REST (Shared Components, PR-159)** — path prefix `POST /api/page-builder-shared-components/search`, confirmed **live** 2026-09-16 (200, 3 results, `usageCount` populated, `usagePages:[]` — see D1). The per-item GET the detail blade must be calling was inferred from UI behaviour (the blade populates real page names on click) but was **not independently curled this pass** — `UNVERIFIED` at the raw-REST level, `CONFIRMED` at the UI level.
- **GraphQL (storefront xAPI, xCMS):** `slugInfo`, `pageDocument`, `pages`, `page(id)`, `pageDocuments`, `pageContext`, `menu`/`menus` — all confirmed to be under test by regression suite `050f-graphql-xcms.csv` (19 cases; §4). Whether `.claude/knowledge/api/graphql-schema.md` lists these fields, and its introspection date, was **not checked this pass** — `UNVERIFIED`.

---

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | The Shared Components **list** endpoint (`POST /search`) returns a real `usageCount` but an empty `usagePages` array (by design — `includePages:false`); only opening an item (a separate `GET`) populates the actual list of pages. Same layer, two calls, two shapes — a consumer that only ever calls `/search` will see the right count and an empty detail | `CONFIRMED` live 2026-09-16 |
| D2 | Authoring form vs. delivered form for a linked Shared-Component placement: the admin/authoring representation is **compact** (`{id, type:"componentRef", componentRef}`, 3 keys); the storefront's delivered `pageDocument.content` is **fully expanded**, with no trace of `componentRef` and synthetic ids (`lc<hex>sectionN`). A consumer reading storefront content can never tell a block came from a shared component vs. was authored inline on the page | `CONFIRMED` live 2026-09-17 |
| D3 | A page that was **never published** has a silently-dead Designer preview channel: blank canvas, "Add block" no-ops, Save never enables, and no error is surfaced anywhere | `CONFIRMED` — per the brief's established facts; not independently re-observed this pass |
| D4 | A non-Administrator 403s on every store-scoped Page Builder route unless `user.StoreId` matches the target store | `CONFIRMED` — per the brief's established facts; not independently re-observed this pass |
| D5 | *Not a disagreement, recorded to close the question the brief raised:* suites 059/060/060b are filed under `regression/suites/**Backend**/page-builder/` despite asserting almost entirely against the Admin SPA / Designer UI. This is **consistent with the rest of the repo's own convention** — `Backend/` holds every admin-and-platform-owned suite (`layer:"backend"`, `concern:"admin"`, `clickDriven:true` in the manifest) regardless of whether it is exercised through a browser; `Frontend/` is reserved for the customer storefront. Confirmed by comparing the `Frontend/` and `Backend/` top-level folder listings — the naming is not misleading once the convention is known, but it reads as misleading from outside the repo | `CONFIRMED` — repo-convention comparison, 2026-09-17 |

No published-guide-vs-build disagreement could be checked (§NOT REACHED).

---

## §4 — Coverage shape

**Basis: `config/test-suites.json` (manifest counts) + a grep of `regression/suites/**` for domain keywords, 2026-09-17.**

| Suite | Cases (manifest) | Feature-relevant | Notes |
|---|---|---|---|
| `059-page-builder.csv` | 50 | 50 | Page Management, Content Portability (Save/Load/Clone), Status Filters/Transitions, Dirty-state |
| `060-page-builder-design-content.csv` | 58 | 58 | Designer Core/Sections, Content Blocks, Grid View, Personalization, 9 Storefront Verification cases |
| `060b-page-builder-fields-assets.csv` | 70 | 70 | Field Types, Asset Library (Picker + Admin), Anchors/anchor-linking edge cases, Scheduling, 3 Storefront Verification cases |
| `050f-graphql-xcms.csv` (in `Backend/graphql/`, not `Backend/page-builder/`) | 19 | 19 | `slugInfo`/`pageDocument`/`pages`/`page(id)`/`pageDocuments`/`pageContext`/`menu(s)` + News Articles sort + post-reindex resilience |
| **Total** | **197** | **197** | |

- **Zero of the 197 cases mention "Shared Component" or `componentRef`** (grep across all four files, 0 hits) — the newest slice of the domain (PR-159, deployed on this env) has **no regression coverage anywhere**, and no seeder exists for it either: `test-data/cms/` and `scripts/seed-data/cms/` contain only `pagebuilder-pages*` (page-level) fixtures/specs — nothing named `shared-component`. The 3 live Shared Components on B2B-store (`AGENT-TEST-SC-*`) are **manually-created, ad hoc** objects, not reproducible via a committed seeder. **This is `G1`, and it is a hole, not a deliberate exclusion** — the feature is deployed and live-usable.
- **Builder.io has zero suite coverage anywhere in the corpus.** A grep for "builderio"/"builder.io" across all of `regression/suites/` returns only incidental text matches (a login-redirect assertion in `020-platform-users-roles-settings.csv`, and a mention of "Builder.io content" as an example fixed-width block in the unrelated layout-stability suite `048c-layout-stability.csv`) — neither exercises the BuilderIO module's own settings blade or its webhook path. Given it is a separate installed module with its own permission group and settings UI (§2), this reads as a **hole**, though a small one (2 settings fields).
- **Storefront rendering of CMS pages has no dedicated `Frontend/` suite.** The only customer-facing coverage is the 9+3=12 "Storefront Verification" cases embedded as cross-layer assertions inside the two `Backend/page-builder` design/content suites, plus GraphQL-level coverage in `050f`. Whether this is a gap depends on whether the repo intends CMS-page rendering to be owned by the admin-suite authors (as it currently is) or split out — not resolved here, flagged for a human call.
- **Selection groups:** both suites carry the `"sprint"` tag and `requiresModules: ["cms"]` / `envRiskGate: "staging"`; `050f` carries no `envRiskGate`. Group-membership correctness was not independently audited this pass.

---

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | Shared Components (PR-159) has zero regression coverage and no committed seeder/fixture spec — only 3 manually-created live objects exist on B2B-store | **OPEN** — needs a new seeder module under `scripts/seed-data/cms/` (following the existing `seed-pagebuilder-pages.mjs` pattern, not yet written) + `@td()` aliases, then suite cases (create/rename/delete-guard/link-vs-copy/detach/edit-propagation, plus a GraphQL case asserting the `lc<hex>sectionN` expansion) |
| G2 | `RESTRICTED_CMS_ADMIN` fixture's role predates the `builder:shared-components:*` permission group (PR-159) — unverified whether the restricted role correctly lacks/holds those grants | **OPEN** — needs a live permission-set diff on that role, or a re-seed asserting the grant list |
| G3 | Whether BuilderIO-authored pages and PageBuilderModule-authored pages can collide (same permalink, same `Pages` index) is unexercised by any suite | **OPEN** — needs a cross-module test using both authoring paths against one permalink |
| G4 | Whether archiving a page that a Shared Component still targets silently changes that component's `usageCount` (asymmetric reverse-edge vs. the component-side delete guard) | **OPEN** — needs a live archive-then-reopen-component-detail check |
| G5 | Published-guide cross-reference (VirtoOZ/Context7) — neither MCP was reachable this session (both require interactive OAuth not available here) | **OPEN** — re-run once either doc source is authorized; do not treat the domain as doc-checked-and-silent in the meantime |

---

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `ba-pagebuilder-ui-analysis-2026-03-25.md`: "Active pages `/new-components`, `/lena-test`, `/test-page-123` return 404 despite Published status" (PP-06) | **Superseded, not re-checked.** Test-data changelog entries `changelog_1_5_35`–`1_5_38` (2026-07-21 onward) describe a deliberate reconcile of the canonical `qa-*` pages that this report's specific pages were not part of; those exact permalinks were not re-tested this pass. Treat as **STALE** rather than an open bug — a fresh check against current live pages is needed before re-filing |
| `ba-pagebuilder-ui-analysis-2026-03-25.md`: "PageBuilder Shell requires direct-URL access; no main-sidebar entry" (PP-10) | Not re-verified this pass (out of scope for a domain map, which is read-only and not a UI-defect re-audit) |
| `ba-pagebuilder-ui-analysis-2026-03-25.md`: architecture diagram (4 separate SPAs: Admin SPA, PageBuilder Shell, Template Builder Designer, Builder.io) | **CONFIRMED and extended** — this map adds the 3-module back-end split (`Pages`/`PageBuilderModule`/`BuilderIO`) underneath that 4-SPA front-end picture |
| `ba-report-VCST-4872-...md` §8: "059/060 have zero coverage for save/load/clone" | **Resolved** — 059's current 50 cases include a "Content Portability" section (17 cases); the gap this report flagged has since been filled. Its open questions (file-size validation, permalink-uniqueness-on-clone, versioning headers) were not re-investigated this pass |
| `ba-report-VCST-4872-...md`: no Shared Components concept existed at report time (2026-04-14) | **Confirmed as the reason G1 exists** — Shared Components is a newer feature (PR-159) than this report and was never in scope for it |

This map resolves prior art's open question #2 (permalink uniqueness on clone) partially: not re-tested, still open. It does not resolve any of the others.
