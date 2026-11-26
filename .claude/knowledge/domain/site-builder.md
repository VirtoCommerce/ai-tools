---
domain_slug: sb
applicability: universal
rationale: |
  What the Site Builder domain IS and where its surfaces are: the VirtoCommerce.SiteBuilder module (Beta),
  which REPLACES Page Builder (vc-module-pagebuilder) — a visual designer for a store's pages, catalog
  templates and theme, a live storefront preview, a versioned theme publication, optional GitHub version
  history, and an MCP toolset that lets an AI agent do the same work behind a second person's approval.
  Built because three tickets (VCST-6571 designer/theme/templates, VCST-6842 MCP toolset, VCST-6963 custom
  section types) were tested and documented one slice at a time and each used the STALE Page Builder map
  (page-builder.md rev2, which says in its own words that the Site Builder snapshot path is MISSING).
  Rev 1 is a BREADTH-FIRST first enumeration of vcst_dev: complete over surfaces, deliberately shallow
  per surface, read-only on the environment; a cell not seen is UNVERIFIED with the mutation or the
  missing fixture named. Site Builder is a SEPARATE domain from Page Builder (see §0); this map does not
  merge them and no row here is a Page Builder rule.
generated: 2026-11-26
rev: 1
stale_after_days: 30
expires_after_days: 90
sources:
  - reports/ba/Site Builder/ — 3 documentation deliverables (vcst-6571-site-builder-guide.md 134 ln, vcst-6842-site-builder-mcp-agent-guide.md 95 ln, vcst-6963-custom-section-types-guide.md 52 ln = 281 ln), read in the VCST-6963-docs and VCST-6842-guide worktrees; verdicts in §6
  - reports/tickets/Sprint26-20/VCST-6963/vcst_dev/ (test-strategy, test-model.md 139 ln, round-1/, exploratory/ x3, design-report-r1..r3, verdict.md, triage-report.md, summary.json); VCST-6842/vcst_dev/ (testing-checklist.md, summary.json — no test-model or strategy file exists for 6842); VCST-6571/vcst_dev/ holds docs-evidence/ only (no checklist, model or verdict survived)
  - reports/bugs/open/medium/BUG-SiteBuilder-MCP-PublishApproval-Diff-Status-Only.md (VCST-7019), BUG-SiteBuilder-PreviewAs-Header-Stays-Signed-Out.md (untracked draft, not re-read)
  - live enumeration on vcst_dev, 2026-11-26 (back office: Admin Shell Sites, designer, History widget, Shared Components, Assets Library, Agent approvals / audit log / tools / connected agents, platform Settings, Modules, Security > Roles; storefront: /designer-preview, a published page; REST: the platform Swagger document; MCP: the protected-resource metadata), playwright-firefox, read-only, administrator account only
  - module source VirtoCommerce.SiteBuilder @ 76b50bf (= released 3.1003.0 behaviourally): README.md, docs/ (contracts/custom-sections, theme-snapshot, history-api, preview-protocol; version-history, sites-on-github, multilanguage-pages, ai-assistant), src/ (Web/Controllers/Api x12, MCP/Tools x23 files, MCP/Resources, MCP/Prompts, MCP/Jobs, Xapi/Schemas, Core/ModuleConstants)
  - kb (observed-behaviour base): KB-B45B0A24, KB-6754D819, KB-4FEABEDD, KB-15CD2C50, KB-9D5D0005, KB-77B3269C, KB-EE07BAC6, KB-D9B2A54F, KB-717756D0, KB-16DDB3C3 and others cited inline; captured KB-E5D52607, KB-9A9DA56B, KB-972383DA
  - config/test-suites.json (entries 123, 123b, 123c, 124, 059*, 060*) + regression/suites/Backend/site-builder/123-site-builder.csv, 123b-site-builder-pages.csv and regression/suites/Backend/page-builder/124-site-builder-mcp.csv (rows and Automation_Status parsed this pass)
  - .claude/knowledge/oracles/bl/site-builder.yaml (BL-SB-001..006, orientation only)
  - published docs: Context7 /virtocommerce/vc-docs (the VirtoOZ connector is not exposed to this agent); NO Site Builder page exists — see §1 and §6
excludes: |
  Not walked this pass (each gets a §2 existence line): the Classic Manager entry points (the classic shell
  rendered blank on load), the Multilanguage Page blade, the Builder.io / Contentful / Sanity CMS modules
  and the Banners / Blogs / Menus / News Content-module screens (adjacent, not Site Builder), Virto OZ
  AI assistant (global setting empty, so disabled on this stand), platform Export/Import of Site Builder
  data, white-labeling configuration itself. Every mutating path is UNVERIFIED with the mutation named.
  The three Site Builder test accounts were NOT signed in as (the lane started before their passwords
  were added; see G1) — account contrasts below are role-definition reads (live) plus prior runs (carried).
---

# Site Builder — domain map

> Refresh with `/qa-domain-map sb --refresh`. This file answers **what the feature is and where its
> surfaces are**. It does **not** carry behavioural rules — those are `BL-*`
> (`npm run bl:extract -- --domain sb`, BL-SB-001..006) — and it can **never ground an assertion as
> `{DOC}`**. Pointer index plus surface inventory.

**Every claim carries a verdict.** `CONFIRMED·live` = observed on vcst_dev this pass · `CONFIRMED·source`
= read in the module source/contract this pass · `CARRIED` = observed live by a cited earlier run on the
same stand and NOT re-seen here (cite given; weaker than re-confirmed, stronger than a guess) · `DRIFT` =
prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

> ## ENVIRONMENT + BUILD — read before citing any count
> **Stand:** vcst_dev, preflight READY 2026-11-26. **Platform 3.1100.0** · **VirtoCommerce.SiteBuilder
> 3.1003.0-pr-5-01b3** (`CONFIRMED·live`, Modules list; the released 3.1003.0 differs by a behaviour-neutral
> refactor, so source below was read at the released code, `76b50bf`) · **VirtoCommerce.MCP 3.1001.0** ·
> Background Jobs, Virto Pages, CMS Experience API (XCMS), Builder.io 3.1006.0, Contentful 3.1001.0 and Sanity
> 3.1004.0 are installed; **Page Builder is NOT installed** (`CONFIRMED·live` — absent from the 88 modules; the
> Site Builder manifest declares it incompatible, `CONFIRMED·source`). Storefront theme
> `vc-theme-b2b-vue-2.63.0-pr-2698-faeb-faeba500` (Site Builder flag on, per the brief; the flag file itself
> was not read — `UNVERIFIED`, but the designer renders the storefront preview, which needs it).
> **Volatility:** a regression run on another lane was writing to this stand while this map was built
> (the designer's Version history showed saves by the Site Builder author account minutes earlier; the
> page list and "Publish theme (1)" change under you). Every count of pages, versions, pending drafts or
> approvals below is a snapshot, not a baseline. The storefront also shows, on every page and inside the
> designer preview, a red toast "The frontend application expects newer versions of the Platform … VirtoCommerce.Notifications 3.1018.2 ≥ 3.1018.0"
> (`CONFIRMED·live`; stand-wide, known as VCST-6963 X43, not Site Builder's) — it overlays the preview and can intercept clicks.

---

## §0 — Relationship to Page Builder, and what prior art was read

**Site Builder replaces Page Builder; the two are separate domains.** README: "It replaces Page Builder
(vc-module-pagebuilder). The two cannot be installed together, and Site Builder uses Page Builder's database
as it is, so existing pages stay after the switch." (`CONFIRMED·source`; the manifest's `incompatibilities`
entry for `VirtoCommerce.PageBuilderModule` agrees, and live the page list still holds pages last modified
"10 months ago" — Carousel, Carousel 2, New components — `CONFIRMED·live`.)

| Shared with Page Builder | Not shared |
|---|---|
| Database tables, page statuses (Draft / Published / Archived), `ContentProviders.SiteBuilder = "PageBuilder"` (provider name kept as a public contract), the `builder:*` permission names (roles survive the switch), the Pages index, the Content module for file pages | The designer (a Vue app `site-builder-shell`, preview protocol 2), the theme snapshot + publication, custom sections, version history through GitHub, the MCP toolset, settings under `SiteBuilder.*` (a first-start background job copies `StoreUrl`, `StorePreviewPath`, `OzAgentUrl`, per-store `PreviewUserIds` / `GitContentEnabled` / `GitContentRepository` and the GitHub App connection) |

`page-builder.md` (rev 2, 2026-09-23) maps the LEGACY surface and records Site Builder's snapshot path as
MISSING; its chain L1–L9 is the legacy chain. Nothing there is superseded by this file except the
statement that nothing documents Site Builder. **On a stand with Site Builder the Page Builder suites
(059*, 060*) cannot run** (§4).

**Prior art read, by path:** the three guides under `reports/ba/Site Builder/` (281 lines; the 6571 and
6963 guides live in the VCST-6963-docs worktree, the 6842 guide in VCST-6842-guide); the VCST-6963
`test-model.md` (139 ln; chain L1–L9 of the *custom-section* slice only), `verdict.md`, `triage-report.md`,
`summary.json`; the VCST-6842 `testing-checklist.md` and `summary.json`; the VCST-6571 run folder holds
`docs-evidence/` only. **Prior art by domain — this is the first domain map for Site Builder**; the three
guides and the one test model each cover one slice and none states the domain's chain, actors or reverse
edges as a whole. `.claude/knowledge/domain/` has no mind map for it.

---

## §1 — Purpose and value chain

**Purpose (module README, a human source; `CONFIRMED·source`): "Site Builder lets a merchandiser build the
storefront's pages, catalog templates and theme in a visual designer, next to a live preview of the real
storefront."** **Published guides: `UNDECLARED`** — Context7 `/virtocommerce/vc-docs` was queried for "Site
Builder", `site_builder_enabled`, "theme snapshot", `designer-preview`, "custom sections" and
`vc-module-site-builder`; no page names the module (the nearest hits are Page Builder pages, quoted in §3
D1/D2/D12/D18). The VirtoOZ connector is not exposed to this agent, so the published-guide check is
Context7 only — `UNVERIFIED` against `PlatformUserGuide` / `StorefrontUserGuide` / `PlatformDeveloperGuide`
as separate guides (G16). The chain below is therefore **the first written statement**, reconstructed from
source + live, to be cited against rather than treated as authority.

| # | Link, in the customer's words | Mechanism | Verdict |
|---|---|---|---|
| L1 | An editor opens a store's site and starts a page (or an agent does) | Admin Shell Sites → store → **New page**; or MCP `create_page`; or REST `POST /api/site-builder-pages/create-group-page` (JSON `content` array, one transaction incl. reference indexes). Entity: a *grouped page* (status Draft/Published/Archived, permalink, culture, visibility, user groups, organization, start/end dates) — Landing or Multilanguage type | `CONFIRMED·live` (New page, page list, page details) · `CONFIRMED·source` |
| L2 | They compose it from sections and see the real storefront render it | Designer (Sections / Theme / Shared tabs) + iframe preview of `{StoreUrl or store URL}{StorePreviewPath}` over preview protocol 2 (`connect → loaded → draft/render → resolved`); content validated server-side against the **schema catalog** the storefront uploaded (`PUT /api/site-builder/catalog`, stored by hash) | `CONFIRMED·live` (designer + preview of a page) · handshake `CARRIED` (KB-EE07BAC6) |
| L3 | Save keeps it as a DRAFT only they see | `designer/save` writes the page document and any theme files as drafts (`{file}-draft`) in ONE request, all or nothing, one version; page content saves need the version (`ETag`/`If-Match`; stale → 412, missing → 428) | `CONFIRMED·source` · `CARRIED` (6571 run) |
| L4 | Theme (header, footer, brand, palettes, templates, template rules, custom section types) is edited in the same designer | Theme files in the store's theme folder, allow-listed (BL-SB-001); drafts until **Publish theme** | `CONFIRMED·source` · tab `CONFIRMED·live` |
| L5 | A second person (agent flow) or the author (designer flow) **publishes** | Page: `grouped/publishing/{id}` (`builder:publish`) or MCP `publish_page` → **pending change** → approver in **Agent approvals** (`mcp:approve` + `builder:read` store + `builder:publish`; `AllowSelfApproval` off). Theme: `theme/publish` / MCP `publish_theme` (approval too) writes `snapshots/{n}/{culture}.json` per store language, flips `snapshots/current.json`, deletes drafts, under a per-store lock | `CONFIRMED·source` · approval flow `CARRIED` (KB-9D5D0005, 6842 run) · self-approval setting `CONFIRMED·live` (Off) |
| L6 | The storefront shows it with no release | Pages: Pages-module index + xAPI `slugInfo` / `pageDocument` (no cache). Theme: anonymous xAPI **`themeSnapshot(storeId, cultureName, …)`** (cached; a publication clears the cache on every instance); custom sections ride inside the snapshot JSON and are rendered by vc-frontend's custom-section renderer only when the flag is on | page route `CONFIRMED·live` (a published page served its **published** headline while the designer held a different draft) · snapshot `CONFIRMED·source`, `CARRIED` (VCST-6963 contract refresh) |
| L7 | Customers see viewer-specific data in a custom section | `vc-products` kit tag prices per viewer; `visibility` / user groups / organization / dates gate a page | `CARRIED` (VCST-6963 R14b: 57.25/5.40 vs 9.99/9.99) · page gating `UNVERIFIED` (needs a mutation: set audience, view as buyer) |
| L8 | History: every save is a version; any version is previewable and restorable | `GitHubSiteHistory` over the store's own repo `{Org}/site-{storeId}`; one commit per Save / publication / restore / discard; best effort (a GitHub outage loses the version, never the save) | `CONFIRMED·live` (panel, commits listed by author/time, per-site On/Off) · restore `UNVERIFIED` (mutates a draft) |
| L9 | Reverse: take it off / put it back | `unpublish_page`, `archive` (REST `builder:delete`; **not** an agent tool), `discard_draft` (confirmation), `restore_version` (confirmation, then draft), delete empty multilanguage page. **A published theme cannot be un-published**: publications are append-only; the way back is restore-from-history then publish a NEW number | `CONFIRMED·source` · theme append-only `CARRIED` (KB-15CD2C50) |

### The async hop, named
1. **Approval**: `publish_page`, `publish_theme`, `change_page_settings`, `convert_page_to_multilanguage`,
   `link/unlink_page_language`, `reset_language_overrides`, `change_shared_component` (content change) return
   `pending_approval` + `change_id`, expire after `MCP.Approval.PendingChangeLifetimeHours` (72 live,
   `CONFIRMED·live`); until approved the page stays Draft and the storefront shows the old content. The
   approval table's "What will change" shows only `status Draft → Published` for `publish_page`
   (VCST-7019, open) — the approver cannot see the content going live (D6).
2. **Background jobs**: `set_translations` and `update_sections_bulk` (needs Background Jobs; followed with
   `get_job_status`, Queued → Succeeded). The pages a bulk job touches are fixed when it is queued.
3. **Theme cache**: the snapshot is cached by the platform and cleared on publication; pages are not cached.
4. **Shared-component propagation** and the first-start **migrations** are jobs too (§2.6).
5. **History commit** is written after the save, outside the lock — the save can succeed while the version
   is lost.

### Variants (two variants sharing a link but not a code path are two rows)
| Variant | Code path that differs | Verdict |
|---|---|---|
| **Page kind**: Landing (database) · Multilanguage (+ language versions inheriting, with overrides) · **file page** (Content module, `Pages/{store}/`, git flow with work branches) | different services (`IGroupedPageService`, `MultilanguagePage*`, `FilePages`), different history (database pages: `database-pages/{id}.json` on base branch; file pages: work branch `designer/<user>/<page>` merged on publish) | `CONFIRMED·source`; file pages `UNVERIFIED` live |
| **Publication flow**: history on (App-created repo) · history off (platform storage) · store-assigned repo / shared `Repository` (git flow, no history of database pages or theme files, platform writes no live pages) | `GitContentEnabled`, `GitContentRepository`, `AllowedRepositories` | on/off `CONFIRMED·live` (B2B-store, Electronics on; b2c, Clothing off); assigned-repo `UNVERIFIED` |
| **Theme file kind**: template · template rules · header/footer group · custom section type · brand · light/dark palette · theme settings | each needs `builder:templates` or `builder:theme`; allow-list refuses everything else with 400 | `CONFIRMED·source` · `CARRIED` (VCST-6963 B1–B4) |
| **Door** (same effect, different route): designer REST · legacy `POST /api/site-builder/save` · `discard-draft` · history restore · MCP `restore_version`/`discard_draft` | each must apply the same allow-list + permission; wording differs on the agent doors (VCST-7046 X57/X58) | `CARRIED` |
| **Actor path**: designer user · MCP agent (as the user) | agent adds dry run, version token, approval, confirmation, audit | `CONFIRMED·source` |
| **Entry shell**: Admin Shell (Vue) · Classic Manager (Angular blade still shipped, `site-builder.js`, `blades/pages/edit-page`) | both open the same Vue designer | Admin Shell `CONFIRMED·live`; Classic `CARRIED` (KB-B45B0A24, vcst_qa) |

### Reverse edges, or their absence
| Forward effect | What reverses it | Verdict |
|---|---|---|
| Publish page | `unpublish_page` / **Unpublish** (toolbar button: rendered greyed on an Active page that has draft changes — reason not established — and absent on a draft page of a history-off site); in git flow the requester's draft branch is un-shipped | button `CONFIRMED·live`, enablement rule `UNVERIFIED` · `CONFIRMED·source` |
| Publish theme (header, footer, rules, palettes, templates, custom types) | **No reversal.** Append-only: only restore-from-history (needs history ON) then publish a new number; with history OFF the old state is re-typed into drafts. Templates, once created, cannot be deleted from the designer; header/footer groups, once written, stay in the snapshot | `CARRIED` (KB-15CD2C50) · history-off sites `CONFIRMED·live` (b2c, Clothing: panel says Off) |
| Create a custom section type | Discarding the draft of a type **never published removes the type for good** (its only copy); removing a published type = delete the file + publish theme → pages render without it | `CONFIRMED·source` · `CARRIED` (VCST-6963 S4) |
| Agent change to a published page | approval-bound to reviewed versions: if the draft changed after the dry run, approving publishes nothing | `CARRIED` (6842 3.4) |
| Archive a page | none in the UI listed on a draft detail (Archive button present); un-archive not found in the live toolbar | `UNVERIFIED` (needs an archived page's detail; mutation-free but not opened) |
| Shared component content change | propagates to every placement at once (a job); **no delete tool** for agents; REST `DELETE` exists, UI has none | `CONFIRMED·source` · `CONFIRMED·live` (Admin Shell blade is read-only) |
| Section removed by hand | Undo/Redo, Discard all changes, restore version | `CONFIRMED·live` (buttons) |

### The guard the sibling path has and this one does not
Defect hypotheses with a citation, from diffing paths that do the same class of work:
- **Page save vs theme save on missing types**: a template's save checks the custom types it places
  (theme drafts, publication the live theme); a *page's* save does not check them, and nothing refuses to
  publish such a page (by decision X12, BL-SB-002) — and the **name-pattern** guard is absent on that
  path: a section whose `custom-` type name breaks `^custom-[a-z0-9]+(?:-[a-z0-9]+)*$` is treated as not
  custom, gets no warning, no badge, `ready: true` (VCST-7046 X48, `CARRIED`).
- **Designer doors vs agent doors on the allow-list**: the REST doors refuse a non-builder theme path with
  400 naming the path; `restore_version` asks for confirmation *before* refusing and `discard_draft` checks
  Drafts before the allow-list (VCST-7046 X57/X58, `CARRIED`).
- **Page publish dry-run vs theme publish dry-run on custom types**: `publish_theme` dry run lists in
  `placed_sections.pages` only pages whose PUBLISHED version places the type (KB-E388859B).
- **Admin Shell Shared Components blade vs REST/MCP**: the blade lists only; REST and MCP create/update
  (D10).
- **Preview-as in the picker vs the code endpoint**: README says an administrator or manager listed in
  `PreviewUserIds` is refused by the code endpoint, yet the picker offers `admin` (D7).

### Actors
| Actor | Can do | Verdict |
|---|---|---|
| **Administrator** (`ADMIN`) | everything: all 14 `builder:*` permissions, all 30 Site Builder agent tools, approvals, platform settings | tool list `CONFIRMED·live` (Agent tools: all 30 present, switches on) |
| **Content author** (account `SB_AUTHOR`, role "AGENT-TEST Site Builder author (B2B-store only)") | role definition read live: `builder:access, create, update, publish, templates, theme, shared-components:create, shared-components:update`, plus `builder:read` and `builder:shared-components:read` scoped to **B2B-store only**; NOT granted: `builder:delete`, `builder:promote`, `builder:preview-as`, `builder:shared-components:delete`, `platform:asset:read` (so no `search_assets`) | role `CONFIRMED·live`; resulting tool count (derived: 29 of 30) `UNVERIFIED` — not signed in; 6842 recorded 27 at 3.1002 `CARRIED` |
| **Approver** (`SB_APPROVER`, role "AGENT-TEST MCP approver") | `mcp:approve` + `builder:read` (store) + `builder:publish`; approving needs all three, not `mcp:approve` alone (KB-E07C2FFE) | role exists `CONFIRMED·live`; permissions `CARRIED`, role not opened |
| **No-builder back office** (`SB_NOBUILDER`, role "AGENT-TEST Back office without Site Builder") — **the negative case** | no Site Builder tool and no Site Builder UI; 6842 recorded 0 Site Builder tools | role exists `CONFIRMED·live`; behaviour `CARRIED` (6842 1.2); sign-in `UNVERIFIED` (G1) |
| **Preview-as customer** (a user id in `SiteBuilder.Store.PreviewUserIds`) | the designer previews as them via a 60-second preview code (`grant_type` `site_builder_preview`); only customers allowed | picker `CONFIRMED·live`; code endpoint `UNVERIFIED` (writes the sign-in log) |
| **Storefront visitor** (anonymous / buyer) | reads published content and the theme snapshot anonymously; sees nothing of drafts | anonymous page `CONFIRMED·live`; buyer `CARRIED` |
| **Agent client** (OAuth client, e.g. an `AGENT-TEST` MCP client) | works as the signed-in user, only their stores and tools | Connected agents lists three users `CONFIRMED·live` |
| **Platform operator** | installs modules, `MCP:PublicOrigin` + `Authorization:Resources`, Background Jobs, GitHub App, file-extension whitelist (`.json-draft`) | `CONFIRMED·source`; whitelist `UNVERIFIED` |

---

## §2 — Surface inventory, one section per layer

### 2.1 Back office (Admin Shell `/apps/admin-shell/`, + Classic Manager)

**Entry points and addresses (all `CONFIRMED·live` unless stated):**

| Surface | Address / how reached | Guard | Notes |
|---|---|---|---|
| **Sites** list | Marketing › Content › Sites, `#/content` | `builder:*` + store read | 4 stores: B2B-store (storefront URL shown), b2c (`vcst-dev-b2c-store…`), Clothing and Electronics ("No storefront URL yet"); a "History on" widget and "More widgets" (only **Customize**) |
| **GitHub / History setup** | Sites › **History** widget, `#/content/site-builder-github` | `setting:update` for app setup | Org connected, "GitHub App", "New sites: Get history automatically"; buttons **Test connection**, **Manage repository access**, **Set up again**; per-site table with repository link and On/Off |
| **Site blade** | `#/content/site/{storeId}` | per-store `builder:read` | **New page** button; widgets **Settings**, **Assets Library**, **Shared Components**, **History** (+ More widgets › Customize); page list with a filter **All Pages / Draft / Pending / Active / Archived**; rows show name, permalink, status badge, age, a "Page details" button; Multilanguage rows show language chips (12 languages listed on B2B-store) |
| Site **Settings** widget | blade "Settings — B2B-store" | store update | Site name, Storefront URL, Status (Open/Restricted/Closed), Languages, Currencies — these are Store module fields, not Site Builder's (D9, D14) |
| **Assets Library** | `#/content/site-builder-assets/{storeId}` | `platform:asset:read` | Upload, Create folder, search, sort, grid/table, pagination; "0 assets" on B2B-store |
| **Shared Components** | `#/content/site-builder-shared-components/{storeId}` | `builder:shared-components:read` | list only: Name, Used …, Modified …; empty ("No shared components yet … Create a shared component from selected sections in Site Builder Designer") |
| Per-site **Version history** | `#/content/site-builder-git/{storeId}` | `builder:read` | On: repository link, Branch `main`, "Last published change" commit link, **Test connection**, **Turn off history**. Off: Repository + Off, **Enable history** (twice) and the sentence "Enable history to keep this site's pages in …" |
| **Page details** | `#/content/site-builder-page/{groupId}` | `builder:read` | Toolbar **Save, Archive, Edit in designer, Save content, Clone**, More › **Convert to multilanguage**, **Publish**; badges "Published" + "Has draft with changes"; blocks Basic information (Name, Permalink with host prefix, Language), Search engine listing (Page title, Meta description, Meta keywords), Advanced options → **Personalization & Access control** (Visibility switch, User groups, Organization) and **Scheduling** (Start/End date) |
| **Designer** | `#/content/site-builder-designer/{groupId}` (also `/apps/site-builder-shell/?storeId=…&designType=pages&designPath=…` per KB-B45B0A24, `CARRIED`) | `builder:read`; writes per permission | see designer inventory below |
| **Agent approvals** | Settings › Monitoring & Tools, `#/mcp-approvals` | approving a Site Builder publish needs `mcp:approve` + `builder:read` (store) + `builder:publish` (KB-E07C2FFE, `CARRIED`); the page's own guard not read | columns Tool, Requested by, Requested, Expires, Scope, Status; filter; Refresh; empty here: "Nothing waits for your review" (list state vs history of Applied rows `UNVERIFIED` — filter not opened) |
| **Agent audit log** | `#/mcp-audit` | not read | columns Tool, Date, User, Client, Scope, Duration (ms), Outcome (rows loaded slowly; row content not read) |
| **Agent tools** | `#/mcp-tools` | `mcp:manage` per KB-77B3269C (`CARRIED`) | scopes "Virto Commerce Back Office (admin)" and "Virto Commerce UCP (ucp)" each with an on/off switch; 74 tools; columns Tool, Scope, Kind (Read/Write + Approval/Confirmation badge), Description, Enabled |
| **Connected agents** | `#/mcp-agents` | not read | Client, User, Last used, Connected, Active sign-ins, MCP endpoint, **Disconnect**; three Site Builder test users connected through one test client |
| **Security › Roles** | `#/security/roles` | platform | builder permissions grouped under "Site builder"; `builder:read` / `builder:shared-components:read` carry a store scope |
| Platform **Settings** | `#/settings` | `setting:read` | groups **CMS** (General, Migration; "Changed from the default 5") and **MCP** (10); the store-level **CMS \| Site builder** group lives on each store (KB-B45B0A24, `CARRIED`) |
| **Modules** | `#/modules?view=installed` | platform | Site Builder (Beta) 3.1003.0-pr-5-01b3 |
| **Classic Manager** (`/`, Content › store › Pages › Design page; store "Site Builder" widget) | platform root | — | `UNVERIFIED` live — the classic shell rendered blank after load; `CARRIED` (KB-B45B0A24 on vcst_qa 3.1000.0-pr-1-28d0) |
| **Multilanguage Page** blade (Languages table, Publish All, Archive All, Clone, Mark up to date, Reset overrides) | row of a Multilanguage page | `builder:create/update/publish/delete` | `UNVERIFIED` live (not opened, read-only, G9); REST + docs `CONFIRMED·source` |

**Designer inventory (`CONFIRMED·live` on an Active page with a draft, and on a Draft page of a history-off site):**
- **Toolbar:** Save, Undo, Redo, **Publish** (page), **Publish theme (N)** (N = pending theme drafts; "(1)" on B2B-store at the time), **Unpublish** (greyed on the Active page seen; enablement rule `UNVERIFIED`), **Discard all changes**, **Preview** (opens the storefront render), **Version history** — replaced by **Enable history** when the site's history is off — and **Full view**. On a draft page of a history-off site Unpublish and Discard all changes are absent and Publish theme is disabled.
- **Tabs:** Sections (HEADER tree incl. Announcement bar, TEMPLATE: Page settings / Page Header, Sections with per-row Hide, Paste / Select, Add section, FOOTER tree) · **Theme** (Brand: Logo, Logo on dark backgrounds, Favicon each with Select or "paste a URL"; a marker "Set by white-labeling for this visitor: a change here doesn't show." on the favicon; Colors section) · **Shared** (search; "Sections you reuse across pages. Edit one to change it everywhere." — empty).
- **Switch page or template** menu: Pages, **Product templates** (Default, Fasteners — "1 rule(s)", Create template (copy of default)), **Category templates**, **Page templates**, each with Create template (copy of default).
- **Status chip** ("Draft", "Published · draft changes"), **Preview as** (Anonymous visitor + the ids in `PreviewUserIds`; 3 users incl. `admin`, D7), inspector toggle ("Turn off the inspector"), light/dark and desktop/tablet/mobile toggles (icons).
- **Carried from earlier runs, not re-opened:** Add section picker with a **Custom sections** group (KB-7FD37F35), the Template rules panel (suggestions, first match wins, drag reorder, switch), the palette generator (Primary / Second color → Generate, Undo), a "Not found" / "Not published" badge on sections whose custom type is missing or draft-only (BL-SB-002), inline text editing in the preview, the History panel's row actions (the panel itself is `CONFIRMED·live`: rows "Saved · Header", "Restored … · Page", "Discarded unpublished change…", tags **Latest** and **Published**, author and time, "Show older versions", a red **Discard all changes**; the Unpublished / Mine / Bulk-change tags that `version-history.md` describes were not seen — `UNVERIFIED`).

**What is hidden by default / absent:** the SiteBuilder store-level settings (`PreviewUserIds`, `GitContentEnabled`, `GitContentRepository`) are in the store's settings, not in the Site Builder UI; **no `NewSiteBuilder` store setting exists** (KB-B45B0A24); the GitHub App connection setting is hidden by design (`IsHidden`); the migration-flag setting `SettingsCopiedFromPageBuilder` is hidden. A **Pages tab** (README, Admin Shell) does not exist as a tab — the page list is the body of the site blade (D8). No **Delete page**, no **Delete shared component**, no **Promote** button was found in any Admin Shell surface (`CONFIRMED·live` absent; REST has them).

**Not manageable from here (and where it lives):**
| What | Lives |
|---|---|
| Delete a page; delete a non-empty Multilanguage page | REST `DELETE /api/site-builder-pages/grouped/{id}` (`builder:delete`); UI offers **Archive** only; agents cannot delete or archive at all |
| Delete a Shared Component | REST `DELETE /api/site-builder-shared-components/{id}`; no UI, no agent tool |
| Promote a page to the production branch | REST `POST /api/site-builder/git/promote` (`builder:promote`); no UI surface found |
| Create the GitHub App / install it / choose the organization | History widget "Set up again" and `/api/site-builder/git/app/*` (anonymous callbacks that reject a bad state) — mutating, `UNVERIFIED` |
| `PreviewUserIds`, `GitContentEnabled`, `GitContentRepository`, store languages, `DefaultThemeName`, white-labeling | Store settings (Stores) and white-labeling module — not Site Builder surfaces |
| OAuth application for an agent that cannot self-register | Security › OAuth applications (row exists; not opened) |
| Disable one agent tool or a scope | Agent tools switches → `MCP.Tools.Disabled` |
| Upload / overwrite / delete assets by an agent | designer / Assets Library only |

### 2.2 Storefront (vc-frontend theme, Site Builder flag on)

| Surface | Address | Observed | Verdict |
|---|---|---|---|
| **Published page** | `/{permalink}` e.g. `/agent-test-doc-spring-fastener-sale` | served the **published** headline "Built to last. Priced to move." and subtitle while the designer's draft of the same page read "Built to hold. Priced to move."; the browser title and breadcrumb read "Agent test doc spring fastener sale" (permalink-derived), while the page Name is "AGENT-TEST-DOC Spring Fastener Sale" and the SEO "Page title" is empty (D16); first load took > 30 s | `CONFIRMED·live` |
| **Designer preview** | `/designer-preview?ep=<platform origin>&protocol=2` | opened top-level (no framer) it answers the storefront **404** page; framed by the designer it handshakes (loaded → resolved, capabilities, conditions, builtInTemplates) | 404 `CONFIRMED·live`; handshake `CARRIED` (KB-EE07BAC6); a foreign page naming itself in `ep` gets the handshake (KB-D9B2A54F, suspected, not re-tested) |
| **Theme** (header, footer, announcement bar, brand, palettes) | via `themeSnapshot` | the preview and the live page both show the "Spring sale: up to 20% off … through March 31" announcement bar — header content from the draft theme in the preview | `CONFIRMED·live` (visible); source of that bar (published vs draft) `UNVERIFIED` |
| **Template pages** (product / category / page templates by template rules) | PDP, PLP | rule "first match wins", variations kept | `CARRIED` (6571 guide c10–c14) |
| **Custom sections** | inside a page | rendered by vc-frontend#2690's renderer from `customSections` in the snapshot; flag off → no custom-section code loaded | `CARRIED` (VCST-6963 A1, S11) |
| **Theme flag** `site_builder_enabled` | theme `settings_data.json` | not read; storefront works in the designer | `UNVERIFIED` (G10) |
| **Compatibility toast** | every page | VirtoCommerce.Notifications 3.1018.2 ≥ 3.1018.0 | `CONFIRMED·live` (D15) |
| **Frame/embedding headers** (`frame-ancestors`, COEP, CORP) | response headers of `/designer-preview` | not read | `UNVERIFIED` (G11); the designer does render the preview, so the headers do not block it |
| **Preview as a customer** | designer toolbar → code → frame | `site_builder_preview` grant with a 60 s code | `UNVERIFIED` live; open draft BUG-SiteBuilder-PreviewAs-Header-Stays-Signed-Out (untracked report, not re-read) |

**Not manageable from here:** the storefront cannot edit anything; schemas and components are part of the
storefront build (`client-app/plugins/builder-preview/schemas/`, `static-content/components/index.ts`) —
adding a section type there is a release, and **that is exactly what custom sections avoid** (L6).

### 2.3 REST / contract

**Source of truth for the inventory: the platform Swagger document on vcst_dev** (`GET /docs/PlatformUI/swagger.json`,
`CONFIRMED·live`): **80 Site Builder paths, 90 operations**, tag "Site Builder (Beta)"; the source has 91
attributed actions — the one missing from Swagger is the legacy alias `GET ~/api/pagebuilder/search`
(`CONFIRMED·source`, absent live).

| Family | Ops | Verdict | Representative routes (guard) |
|---|---|---|---|
| `/api/site-builder` (designer, theme, git, history, preview, catalog, schemas) | 43 | `CONFIRMED·live` + `·source` | `designer/save` (`builder:update` + per file `builder:templates`/`builder:theme`), `designer/discard`, `designer/theme-file`, `designer/storefront`, `theme/publish` (`builder:publish`), `theme/status`, `theme/palette` + `palette/check` (`builder:theme`), `catalog` GET/PUT, `schemas`, `schemas/{kind}/{key}`, `settings`, `objects`, `template`, `search`, `save` (legacy), `discard-draft`, `git/publish` `git/unpublish` (`builder:publish`), `git/promote` (`builder:promote`), `git/copy` (`builder:create`), `git/restore-version`, `git/history`, `git/preview`, `git/legacy-drafts` (+ `delete` `builder:delete`), `git/site` + `connect` + `disconnect` + `connection`, `git/app/setup|new|created|installed`, `history/status` · `history` · `history/{versionId}` · `history/{versionId}/restore`, `preview-auth/code` |
| `/api/site-builder-pages` | 22 | idem | `search`, `list`, `permalink-usage`, `grouped` (POST create / PUT save / GET), `create-group-page`, `grouped/archive` (`builder:delete`), `grouped/{id}` DELETE (`builder:delete`), `grouped/publishing/{id}` (`builder:publish`), `grouped/{id}/discard`, `grouped/{id}/content` GET (ETag) / POST (`If-Match`), `content-json`, `content/{sourceGroupId}` copy, `publish-status`, `languages`, `user-groups` (`setting:query`), `organizations` (`customer:read`) |
| `/api/site-builder-multilanguage-pages` | 15 | idem | search, CRUD, `{id}/languages`, `link`, `convert`, `mark-up-to-date`, `unlink`, `reset-overrides`, `clone`, `publish-all` (`builder:publish`), `archive-all` (`builder:delete`) |
| `/api/site-builder-shared-components` | 8 | idem | search, GET, POST/PUT/DELETE, `{id}/content` GET/PUT/POST |
| `/api/site-builder-assets` | 2 | idem | `search` (`platform:asset:read`), `references` |

- **Anonymous behaviour:** `site`, `connection`, `app/setup`, `history`, `history/status`, `designer/storefront`, `settings`, `search`, `save`, `theme/publish` → 401; `git/app/new` and `created` → 400 text ("GitHub setup did not finish: This setup link has expired or is not valid…"); `git/app/installed` with a bad state → 302 `/` (KB-6754D819, `CARRIED`).
- **Store scoping:** every route checks the store as well as its permission; `builder:read`, `builder:shared-components:read`, `builder:preview-as` carry `StoreSelectedScope`; an account bound to a store reaches that store only; scoped editor gets 403 on another store (KB-4FEABEDD, `CARRIED`). A scope saved without `storeId` is silently dropped (same entry).
- **Route families NOT in Site Builder:** `/api/pagebuilder/*` (Page Builder's) — absent on this stand.
- **GraphQL xAPI (anonymous):** `themeSnapshot` query (types `ThemeSnapshot` {storeId, cultureName, publication, content, slug}, `ThemeSnapshotSlug`, `ThemeSnapshotSlugPage`) and a preview-page query/handler (`BuilderPageItemType`) — `CONFIRMED·source`; the live schema check is `CARRIED` (VCST-6963: `themeSnapshot(domain, storeId, cultureName, permalink)` present, `customSections` inside the JSON payload, so its shape is {SPEC}, not schema). Pages are read through the Pages/XCMS `slugInfo` + `pageDocument`. The anonymous `builderPage` by group id returns a published page's PENDING DRAFT edit (KB-717756D0, suspected; SB-031 Catches VCST-6942) — `CARRIED`. `.claude/knowledge/api/graphql-schema.md` refresh date not read (`UNVERIFIED`, G17).
- **Contracts:** preview protocol 2 (frame, handshake, `draft`, `render`, inline editing, schemas), theme snapshot (publish steps 1–7, catalog hash, conditions, translatable fields, palette contrast pairs), history API (`IContentHistory`, opaque `versionId`), custom sections (file, template, bindings, kit tags, behaviors, CSS, validation) — `CONFIRMED·source` in the module repo's contracts folder (custom-sections 421, preview-protocol 346, theme-snapshot 596, history-api 196 lines).
- **Not manageable from here:** none of the agent-only prompts/resources are REST; platform export/import ("Settings › Platform › Export/Import, select Site Builder") carries database pages with every version, Multilanguage pages and Shared Components — **not** file pages or theme files (README) — `UNVERIFIED` live (G13).

### 2.4 MCP (`POST /admin/mcp`, scope "admin", MCP module 3.1001.0)

- **Endpoint** `CONFIRMED·live`: `GET /.well-known/oauth-protected-resource/admin/mcp` answers `{"resource":"https://<platform>/admin/mcp","authorization_servers":["https://<platform>/"],"scopes_supported":["openid","profile","offline_access"],"bearer_methods_supported":["header"],"resource_name":"Virto Commerce Back Office"}` — so `Authorization:Resources` and `MCP:PublicOrigin` are set. `tools/list`, `resources/list`, `prompts/list` need an OAuth token and were **not** called (G2).
- **Tools — 30, all present in Agent tools, `CONFIRMED·live` presence; behaviour per family:**

| Family (tools) | Permission (README) | Safeguard | Behaviour verdict |
|---|---|---|---|
| Orientation/search (`get_site_overview`, `search_site_pages`, `search_templates`, `search_assets`, `search_shared_components`, `list_versions`) | `builder:read` (+ `platform:asset:read`, `builder:shared-components:read`) | — | `CARRIED` for overview/search (6842: 2.2, 1.x); `search_assets` visibility `CARRIED` (1.3); `list_versions` `UNVERIFIED` |
| Analysis (`get_preview`, `find_content_gaps`, `get_publish_readiness`) | `builder:read` | — | `get_preview` `CARRIED` (A7 designer); `find_content_gaps` dry only `CARRIED`; readiness `CARRIED` (VCST-6963 A5) |
| Content (`create_page`, `edit_page_draft`) | `builder:create` / `builder:update` | dry run, version token | `CARRIED` (6842 2.1–2.3, 6963 A3/A8) |
| Content gated by approval (`change_page_settings`, `convert_page_to_multilanguage`, `link_page_language`, `unlink_page_language`, `reset_language_overrides`, `publish_page`, `unpublish_page`) | `builder:update`/`create`/`publish` | approval bound to reviewed versions; none with `unpublished_only` for a never-published page | `publish_page` `CARRIED` (KB-9D5D0005); the other six `UNVERIFIED` (real call mutates; a pending change is created) |
| Confirmation (`restore_version`, `discard_draft`) | `builder:update` + the part's permission | confirmation (MRTR), expected versions | `discard_draft` `CARRIED` (6842 7.1, 6963 A9); `restore_version` refusal paths `CARRIED` (B1/B7); a real restore `UNVERIFIED` |
| Bulk (`set_translations`, `update_sections_bulk`) | `builder:update` | background job, dry run | translations real `CARRIED` (6842 4.1–4.2); bulk dry run only `CARRIED`; real bulk `UNVERIFIED` |
| Design (`edit_template`, `edit_template_rules`, `edit_theme_draft`, `create_section_type`, `change_section_type`, `publish_theme`) | `builder:update` + `builder:templates` / `builder:theme`; `builder:publish` | dry run, version token; theme publish = approval + WCAG 2.2 AA gate | section types `CARRIED` (6963 R1/R2/R3); template/theme/rules dry runs only `CARRIED`; real saves + real theme publication `UNVERIFIED` |
| Shared components (`create_shared_component`, `change_shared_component`) | `builder:shared-components:create`/`update` | dry run; approval when content changes | `UNVERIFIED` (no case found; mutates) |

  Counts: **30 present live**; behaviour re-observed this pass **0** (the lane cannot take an OAuth token);
  `CARRIED` for 18 of 30 by the cited runs, `UNVERIFIED` for 12 (the six gated content tools,
  `list_versions`, `restore_version` real, `update_sections_bulk` real, the two shared-component tools,
  `edit_template*`/`edit_theme_draft` real).
- **Resources — 9:** `site-builder://stores/{store_id}/schemas`, `…/schemas/{kind}/{key}`, `…/section-kit`, `…/section-kit/icons`, `…/custom-sections/{type}`, `site-builder://template-rule-conditions`, `…/stores/{store_id}/settings`, `site-builder://user-groups{?skip,take}`, `site-builder://organizations{?keyword,skip,take}` — `CONFIRMED·source`; live listing `UNVERIFIED` (G2). The schemas resource is "not available until the storefront has sent its catalog".
- **Prompts — 8:** `weekly_content_review`, `launch_landing_page`, `translate_site`, `review_template_rules`, `rebrand_site`, `design_custom_section`, `review_theme_release`, `review_site_change` — `CONFIRMED·source`; live `UNVERIFIED`. (The scope's prompts survive switching the scope's tools off, KB-77B3269C, `CARRIED`.)
- **What an agent cannot do (by design, README):** delete/archive pages, delete shared components, promote, upload/overwrite/delete assets, connect GitHub, preview as another user (`loginOnBehalf`), check links to deleted products, publish without a second person — `CONFIRMED·source`; absence of delete/archive/promote tools `CONFIRMED·live` (30-tool list has none) and `CARRIED` (6842 7.2).
- **Operational:** audit (`MCP.Audit.Enabled` On, `LogArguments` On, retention 90 days, cleanup cron `0 3 * * *`), approval lifetime 72 h, `AllowSelfApproval` Off, `Tools.Disabled` empty — `CONFIRMED·live` (platform Settings, MCP group). Tool switch/scope switch semantics `CARRIED` (KB-77B3269C).
- **Not manageable from here:** registering an OAuth client for agents that do not self-register (Security); the `MCP.*` settings and Agent tools (platform pages); the agent's own client config.

### 2.5 Background jobs (Background Jobs module required for the first two)

| Job | Trigger | Verdict |
|---|---|---|
| `UpdateSectionsBulkJob`, `SetTranslationsJob` (`triggerable: false`) | `update_sections_bulk`, `set_translations`; without Background Jobs "they answer that jobs are not available and change nothing" | `CONFIRMED·source`; module installed `CONFIRMED·live`; Queued → Succeeded `CARRIED` (6842 4.2) |
| `SiteBuilderSharedComponentContentPropagationJob` | a shared component's content change | `CONFIRMED·source`; run `UNVERIFIED` |
| `PagesMigrationJob`, `AssetReferenceIndexRebuildJob`, `PageBuilderSettingsCopyJob` | module start (migrations; first-start settings copy) | flags `AssetReferenceIndexMigrated` and `MetadataFromContentMigrated` both **On** live (`CONFIRMED·live`); the copy flag is hidden, `UNVERIFIED` |
| `GitContentRepositoryJob` | repository creation/adoption | `CONFIRMED·source` |
| Theme-cache clear on publication; Pages-index write on publication | inline, not a job | `CONFIRMED·source` |

### 2.6 Settings, configuration and permissions

| Item | Value / default (live where read) | Verdict |
|---|---|---|
| `SiteBuilder.General.StoreUrl` (global) | set to the B2B storefront ("Modified"); beats the store URL for **every** store's preview (KB-16DDB3C3) | `CONFIRMED·live` value |
| `SiteBuilder.General.StorePreviewPath` | `/designer-preview` | `CONFIRMED·live` |
| `SiteBuilder.General.OzAgentUrl` | empty → "Leave empty to disable the AI assistant" | `CONFIRMED·live` (empty) |
| `SiteBuilder.Store.PreviewUserIds` / `GitContentEnabled` / `GitContentRepository` (store-level) | per store | names `CONFIRMED·source`; values `CARRIED` |
| `SiteBuilder.GitHub.AppConnection` | hidden, encrypted with data-protection keys; lost if the keys are not kept (redis or key folder) | `CONFIRMED·source` |
| `VirtoCommerce.PageBuilderModule.Migration.*` (2) + `SiteBuilder.Migration.SettingsCopiedFromPageBuilder` | migration flags keep the Page Builder name prefix | `CONFIRMED·live` (D13) |
| `MCP.*` (10: Approval ×2, Audit ×2, Cleanup ×4, Tools.Disabled, Maximum number of rows) | see 2.4 | `CONFIRMED·live` |
| appsettings: `SiteBuilder:GitContent` (Organization / Repository, `AutoCreateRepositories`, `RepositoryPrefix`, `AllowedRepositories`, `Enabled`), `SiteBuilder:ThemeSnapshot:CustomSectionsMaxSize`, `MCP:PublicOrigin`, `Authorization:Resources`; deprecated `PageBuilder:*` still read with a startup warning | `CONFIRMED·source`; values `UNVERIFIED` (file not readable) except the MCP pair (inferred from the metadata, 2.4) |
| Platform file-extension whitelist must list `.json-draft` if non-empty | `CARRIED` (6963 guide) | `UNVERIFIED` live |
| **Permissions — 14 registered under "Site builder":** `builder:access, create, read, update, delete, publish, promote, preview-as, theme, templates, shared-components:read, :create, :update, :delete`; scopable by store: `read`, `shared-components:read`, `preview-as` | `CONFIRMED·source`; scopes `CARRIED` (KB-4FEABEDD); role editor shows the "Site builder" group and a store scope on `builder:read` `CONFIRMED·live` |

---

## §3 — Where the layers DISAGREE

Numbered; ids are a citation contract — never renumber.

| # | Disagreement | Verdict |
|---|---|---|
| **D1** | **"Pending" means opposite things.** Page Builder user guide (`https://github.com/virtocommerce/vc-docs/blob/main/platform/user-guide/docs/page-builder/manage-pages-via-office.md`): "When your **Draft** page is ready for review, click **Publish** in the toolbar. The page is moved to the **Pending** status." and "When your **Pending** page is ready to go live, click **Publish** in the toolbar. The page is moved to the **Active** status and becomes available on your store website." In Site Builder, `pageLifecycle` says a page is Pending only when it is **Published and its start date is later than now** (scheduled), and one Publish makes it Active. The list filter offers `Pending` live. A customer following the PB guide expects a review step that does not exist. | `CONFIRMED·source` (+ filter `CONFIRMED·live`); a scheduled page seen live `UNVERIFIED` (G8); kb KB-9A9DA56B captured |
| **D2** | **Two Site Builder docs disagree about the Version history button.** the module repo's version-history.md: "Without it a draft overwrites the page and no versions are kept, so the **Version history** button is not shown at all." Live, a history-**off** site's designer toolbar shows **Enable history** where the button would be (and README / the 6571 guide say the same); `version-history.md` also describes the *file-page* git flow (work branches `designer/<user>/<page>`, tags Unpublished / Mine / Bulk change); the database-page panel seen live lists "Saved · Header", "Restored … · Page" with tags Latest and Published, and whether the other tags exist for database pages is `UNVERIFIED`. | `DRIFT` (version-history.md vs build) · `CONFIRMED·live` |
| **D3** | **History is on for TWO stores, not one.** Brief and 6571 guide ("no GitHub organization on vcst") imply none/Electronics only; live Sites › History lists B2B-store **On** and Electronics **On**, b2c and Clothing **Off** (org connected, "New sites: Get history automatically"). Every save on B2B-store is therefore a GitHub commit during regression, and the 123/124 runs create real commits. Also `sites-on-github.md` says "Open **Sites → GitHub** (the GitHub button on the Sites panel)"; the live widget is labelled **History on**. | `CONFIRMED·live`; brief claim `DRIFT` |
| **D4** | **The 6842 guide's toolset count is stale:** it states "The toolset has 28 tools"; Agent tools live holds **30** Site Builder tools (+`create_section_type`, `change_section_type` from VCST-6963; README lists 30). | `DRIFT` (guide) · `CONFIRMED·live` |
| **D5** | **Two guides disagree on the role table.** 6842 guide "Who works with the agent": author = `builder:read, create, update, publish`; designer adds `templates` and `theme` — **no `builder:access`**; the 6963 guide's setup list for the agent's user includes `builder:access`; README "Production setup" omits it too. The live author role holds `builder:access`. Whether MCP needs it is not established. | source/guides `CONFIRMED·source`; requirement `UNVERIFIED` (needs a token for a role without `builder:access`) |
| **D6** | **The approval screen hides what it approves.** The 6842 guide ("A publication waits for a second person") shows the approver a "What will change" table; for `publish_page` it carries only `status Draft → Published`, never the content going live (VCST-7019, open; KB-6AF323AC). The guide records it under "Not documented". SBMCP-009 is held red. | `CARRIED` (live 6842 run); not re-seen (no pending request now) |
| **D7** | **Preview as lists an administrator the code endpoint is documented to refuse.** README: "Only customer accounts can be previewed: an administrator or a manager listed there is refused." The picker on vcst_dev lists Anonymous visitor, two customer-style accounts and `admin`. | picker `CONFIRMED·live`; refusal `UNVERIFIED` (request writes the sign-in log); kb KB-972383DA (suspected) |
| **D8** | **README's Admin Shell path vs the screen.** README: "Admin Shell: **Sites**, a store, the **Pages** tab: **New page** creates a page … The store's **Site Builder** widget opens the store's page list". Live: there is **no Pages tab** — the page list is the body of the site blade under a "Show" filter, **New page** is a toolbar button, and the site widgets are Settings / Assets Library / Shared Components / History (no "Site Builder" widget; that is the Classic Manager's). | `CONFIRMED·live` (no tab, no such widget) |
| **D9** | **Two answers to "what is this site's storefront URL".** The Sites list says "No storefront URL yet" for Clothing and Electronics, while the global `SiteBuilder.General.StoreUrl` is set and — per README precedence ("global setting `SiteBuilder.General.StoreUrl`, or else the store's secure URL, or else its URL") — is what the designer previews for **every** store (KB-16DDB3C3: it also uploads that storefront's schema catalog for the store being designed). | list label + setting `CONFIRMED·live`; effect on Clothing/Electronics previews `CARRIED` (KB), not opened live |
| **D10** | **A capability present in one layer and absent in another.** Shared Components: REST can create/update/delete and MCP can create/change; the Admin Shell blade is a read-only list ("Create a shared component from selected sections in Site Builder Designer"); no layer except REST can delete. Same shape for page delete/archive and promote (REST only). | `CONFIRMED·live` (blade) · `CONFIRMED·source` (REST) |
| **D11** | **Draft vs published read by two paths.** The public page route served the *published* headline; the anonymous GraphQL `builderPage` by group id returns the pending draft edit instead (KB-717756D0, suspected; SB-031 Catches VCST-6942). The designer chip says "Published · draft changes" for the same page. | route `CONFIRMED·live`; GraphQL path `CARRIED`, not re-run |
| **D12** | **Preview embedding requirements: Page Builder docs vs Site Builder README.** Page Builder setup (`https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/Extensibility/cms-integrations/PageBuilder/page-builder-setup.md`): "To allow the Page Builder to display a live preview of your site inside its editor, your storefront must permit itself to be embedded in an iframe. Add the following headers …" `Content-Security-Policy: frame-ancestors 'self' https://localhost:5001;` `Cross-Origin-Resource-Policy: cross-origin` `Cross-Origin-Embedder-Policy: credentialless`. Site Builder README lists only `Content-Security-Policy: frame-ancestors 'self' https://<platform>`. KB-6436CF1C: COEP credentialless on the admin with none on the storefront refuses the PB frame. On vcst_dev the Site Builder preview renders. | docs-vs-docs `CONFIRMED·source`; headers `UNVERIFIED` (G11) |
| **D13** | **Naming split inside one module's settings.** Settings group CMS › Migration keeps `VirtoCommerce.PageBuilderModule.Migration.*` keys while everything else is `SiteBuilder.*`; README warns forced overrides under `VirtoCommerce:Settings:Override` must be renamed by hand. Declared by design (README, `ModuleConstants`). | `CONFIRMED·live` + `CONFIRMED·source`; **by design, not a defect** |
| **D14** | **The site "Settings" widget is the Store module's, not Site Builder's.** It shows Site name, Storefront URL, Status, 12 languages (it-IT, ja-JP, pl-PL, zh-CN, ru-RU, es-ES, pt-BR, fr-FR, de-DE, pt-PT, en-GB, en-US default) and currencies; the brief says B2B-store is "en-US, de-DE". A multilanguage page on B2B-store therefore carries 12 language chips, not 2. | `CONFIRMED·live`; brief `DRIFT` |
| **D15** | **Storefront self-check vs backend.** The storefront toast says the backend is incompatible (Notifications 3.1018.2 vs 3.1018.0) while the designer, publication and preview work. Stand-wide, known (VCST-6963 X43). | `CONFIRMED·live` |
| **D16** | **Page title: three values.** Page Name "AGENT-TEST-DOC Spring Fastener Sale"; SEO "Page title" empty with the Name as placeholder; storefront tab title and breadcrumb "Agent test doc spring fastener sale" — a humanised permalink, not the Name. A merchandiser reading the placeholder expects the Name. | `CONFIRMED·live` |
| **D17** | **Theme publication counts a file the designer does not list.** `theme-snapshot.md`: the designer "neither shows, saves, discards nor restores" the theme's settings_data.json; "Publish theme (N)" counts it and the designer does not list it (VCST-7046 X55). | `CARRIED` (6963 R3), contract `CONFIRMED·source` |
| **D18** | **The only customer-facing guide covers the predecessor, and contradicts the build on access.** Page Builder overview (`https://github.com/virtocommerce/vc-docs/blob/main/platform/user-guide/docs/page-builder/overview.md`): "The **Page Builder** module allows you to create ecommerce pages from blocks and edit them using a visual editor. … it is required to have the [Content module](../content/overview.md#installation) installed first, as the Page Builder module is accessed through the Content module interface." Site Builder is reached through Admin Shell Sites (the Content module's classic blade is only one of two entries). The page `multilanguage-pages.md` (same folder) documents **Publish All / Archive All / Clone**, which exist in Site Builder's REST (`publish-all`, `archive-all`, `clone`), so the Page Builder guide is already read as Site Builder's by anyone with the module. | `CONFIRMED·source` (docs) · access path `CONFIRMED·live`; no Site Builder page exists (`UNDECLARED`) |
| **D19** | **Theme rollback vs history.** `theme-snapshot.md`: "To go back to an earlier theme, the editor restores its version from the history and publishes it." On a history-off site (b2c, Clothing — live) there is no version to restore; the way back is re-typing drafts, then a new publication number (KB-15CD2C50). | `CONFIRMED·live` (Off) · `CARRIED` |
| **D20** | **Agents and the designer disagree on who may preview.** README: the agent "cannot … preview the storefront as another user: it needs `loginOnBehalf`"; the designer can (Preview as). Declared on purpose. | `CONFIRMED·source`; **by design** |

Mid-change call-out: the vc-frontend custom-section renderer (#2690) and SiteBuilder PR #5 are deployed
on vcst_dev as PR builds (`3.1003.0-pr-5-01b3`, theme `pr-2698`); **re-read D5, D6, D11, D17 after PR #5
and VCST-7019 / VCST-7046 land or revert** — they hold the defects behind several rows.

Compared and agreeing: Modules list vs README (Site Builder replaces Page Builder, dependencies present);
Agent tools vs README tool table (30 = 30); MCP protected-resource metadata vs README setup; Swagger vs
source controllers (90 vs 91 less the alias); `AllowSelfApproval` Off vs README production guidance.

---

## §4 — Coverage shape

**Basis:** rows and `Automation_Status` parsed from the three CSVs this pass; suite sizes cross-checked
against `config/test-suites.json` `testCount` (66, 47, 31 — all match). A `Catches:` row is one that names the
open defect it targets.

| Suite | Site-Builder-relevant | Status (Automated / Draft) | Notes |
|---|---|---|---|
| **123** Site Builder — Designer, Theme & Publishing (`regression/suites/Backend/site-builder/`) | **66** of 66 | **23 / 43** | IDs SB-001..049 and SB-097..113 (the file spans 001–113 but holds 66 rows; 050–096 live in 123b) |
| **123b** Site Builder — Pages Management & Lifecycle | **47** of 47 | **0 / 47** | IDs SB-050..096; **not named in the brief** — a third suite the obvious "123/124" pair misses; entirely Draft, never run |
| **124** Site Builder MCP Toolset (`Backend/page-builder/` folder) | **31** of 31 | **17 / 14** | SBMCP-001..031; the manifest note still says "All cases Draft until a run promotes them. Excluded from backend/full until then" while 17 rows are Automated (D-note below) |
| 050f GraphQL xCMS | pages/slug via xAPI, not Site Builder-specific | — | counted nowhere above; `UNVERIFIED` whether any case reads `themeSnapshot` |
| **059, 059b, 059m, 059p, 060, 060b, 060c** (Page Builder) | 0 of 338 for Site Builder | — | `requiresModules: VirtoCommerce.PageBuilderModule` — **cannot run on a Site Builder stand**; `059p` also requires Pages + XCMS |
| 123c Product Comparison | 0 of 2 | — | the `123c` id is **not** a Site Builder suite (adjacent id, domain catalog) — a prefix match `123*` would sweep it in |

**Cases that target a known open defect (`Catches:`), all Draft:** 123: SB-017, 019, 020, 030, 031, 032, 033,
034, 041, 042, 043, 044, 045 (13 rows; VCST-6571 findings B1/F-1/F-2/A11/A12/X4/X10/X19 and VCST-6942;
four are "held for product decision": SB-017, 033, 034, 043) · 124: SBMCP-009 (VCST-7019, KNOWN RED),
019 (X41), 023 (X42), 028 (X57+X58), 029 (X48), 030 (X56) — **6 rows**. **Open VCST-7046 items with no
case:** X46, X47, X49, X50, X52, X53, X55 (designer chips/tree/dialog and REST wording) — 7 of its 13
Low items have nothing to fail. VCST-7037 (price ignores price-list conditions) is outside Site Builder.

**By link of §1:**
| Area | Cases | Basis | Deliberate or hole |
|---|---|---|---|
| Page lifecycle (L1–L3, L9) | 123: SB-001A, 009d, 010d, 044d, 049A; 123b: 050–067 (create, status transitions, lists, configuration) | section names | hole — 123b all Draft |
| Theme publication (L4–L5) | SB-003A, 005A–008A, 022d, 025d, 043d | section "Theme publishing" | the best-covered link (5 Automated) |
| Theme snapshot / storefront render (L6) | SB-004d, 026A, 027A, 028d, **021d (the only "Storefront render" case)**, 103A, 111A | sections | **hole**: one Draft case for "a published page renders"; the public-route-vs-`builderPage` split (D11) has SB-031 only |
| Custom section types (6963) | SB-101A, 102A, 109A, 113d, 103A, 104A, 105A, 106A, 107d, 108d, 110d; SBMCP-017A–027A, 029d, 031d | sections | well covered; 8 Draft |
| History / GitHub (L8) | SB-002d, 035d, 036d, 033d, 034d, 048d | sections | **hole** — all Draft, GitHub fixture gap named in the manifest; now live fixtures exist (B2B-store, Electronics On) |
| Access / scope (permissions) | SB-013d, 014d (123); 123b: 085d, 086d; SBMCP-002A, 003d, 004d, 024A | sections | thin: the **negative contrast is Automated only on the MCP side** (002A) |
| Approvals (L5 async) | SBMCP-008A, 009d (red), 010d, 011A, 012A | sections | covered; the approver's *view* of content (D6) is the red case |
| Bulk / translation jobs | SBMCP-013d (+030d) | section | thin: the two bulk tools have one Draft case |
| Agent audit, Agent tools kill-switch | SBMCP-015d, 016d | sections | thin |
| Connected agents screen | none | — | **zero** (hole) |
| Designer preview security (`ep`, framing, Preview as, preview-auth code) | none | — | **zero** (hole): KB-D9B2A54F is suspected with no case; BUG-…PreviewAs… has no case |
| Shared Components (UI/REST/MCP) | SB-011d; 123b share one | — | near-zero (hole): the two MCP shared-component tools have none |
| Multilanguage pages | 123b via ports; SBMCP-030d | — | covered only as Draft ports of Page Builder 059m |
| Scheduling (Pending, D1) | none found | — | **zero** (hole) |
| Page Builder → Site Builder migration | SB-012d, SB-072d | — | Draft, needs a disposable switch |

**Over-covered relative to risk:** none. The largest corpus on the CMS side (338 Page Builder cases)
exercises a module that cannot coexist with Site Builder — that is *deliberate retirement pending*, not
over-coverage of this domain; a culling decision for `/qa-review-tests` once Page Builder stands are gone.

**Selection-group and executability problems:**
- `config/test-suites.json` tags 123/123b/124 `domain: content-cms`, not a Site Builder token, while the BL
  oracle domain is `sb`; `npm run bl:extract -- --domain sb` finds rules, and **no suite is tagged `sb`** (and
  `domain:content-cms` mixes Page Builder with Site Builder).
- **124 is excluded from `backend` and `full`** ("until a run promotes them") yet 17 of its 31 cases are
  already Automated — either the exclusion or the note is stale; 123 and 123b are in both groups though
  they need a flag-on storefront and a shared-state window for the theme (the manifest says so).
- 124's CSV lives under `Backend/page-builder/`, not `site-builder/` — a folder-based tool will file it with
  the retired module.
- `envRiskGate: staging` on all three; `clickDriven: true` on 123/123b (the Firefox lane's click prerequisite
  applies); theme-touching cases need exclusive use of B2B-store (publications are append-only).
- **Draft share:** 123 65%, 123b 100%, 124 45% — 104 of 144 Site Builder cases have never run.
  Whether `regression:plan` blocks 059*/060* on a Site Builder stand through `requiresModules` is
  `UNVERIFIED` (`npm run regression:plan -- backend` would show it).

---

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | The three Site Builder accounts (`SB_AUTHOR`, `SB_APPROVER`, `SB_NOBUILDER`) were not signed in as: this lane holds password names only for accounts present when it started, and `SB_*_PASSWORD_VCST_DEV` is not among them | **OPEN** — needs the Playwright lane restarted after the names were added (then 1 hour of read-only contrast: tools visible, Sites menu present/absent, 403s); role definitions were read as admin instead |
| G2 | `/admin/mcp` `tools/list` per role, `resources/list`, `prompts/list` not called | **OPEN** — needs an OAuth token for a registered public client (a browser sign-in + PKCE client); the browser lane cannot hold one |
| G3 | Agent approvals / audit-log row behaviour not re-seen (list empty; audit rows still loading) | **OPEN** — needs a pending change (a `publish_page` request: a mutation) or a read of the audit rows once loaded |
| G4 | Classic Manager entry points on vcst_dev | **OPEN** — the classic shell rendered blank; needs the classic route / a patient load |
| G5 | Designer Add-section picker (Custom sections group), Template rules panel, palette generator, History row actions (Continue from this, Preview, Discard all) | **OPEN** — reads are safe; the actions mutate drafts. `CARRIED` meanwhile |
| G6 | History panel actions: Enable/Turn off history, Set up again, Manage repository access, Test connection | **OPEN** — each mutates or calls GitHub; needs a disposable store (SB-027's fixture gap) |
| G7 | GitHub App one-click setup and `git/app/*` callbacks | **OPEN** — creates a GitHub App in an organization |
| G8 | A scheduled (Pending) page, D1 | **OPEN** — needs a page saved with a future start date |
| G9 | Multilanguage Page blade: languages table, Publish All, Mark up to date, Reset overrides, outdated-translation flags | **OPEN** — a safe read of the "AGENT-TEST VCST-6842 multilanguage" row; not done for breadth |
| G10 | Theme `site_builder_enabled` value and the effect of flipping it | **OPEN** — needs theme file access / a theme redeploy (VCST-6963 S11 did it with an end-of-run redeploy) |
| G11 | Storefront response headers (`frame-ancestors`, COEP, CORP) | **OPEN** — read via network inspection on `/designer-preview`; D12 |
| G12 | Anonymous `builderPage` draft leakage (D11, KB-717756D0) on this build | **OPEN** — one GraphQL read |
| G13 | Platform Export/Import of "Site Builder" data (pages with every version, Multilanguage pages, Shared Components) | **OPEN** — export is a platform operation; scope proof needs an import on a throwaway stand |
| G14 | Pages-module index timing ("a page is indexed at once on publication") | **OPEN** — needs a publish |
| G15 | Un-archive / archived page detail, "Archive" outcome | **OPEN** — needs an archived page's blade (read-only) |
| G16 | Published guides checked through Context7 only — VirtoOZ `PlatformUserGuide` / `StorefrontUserGuide` / `PlatformDeveloperGuide` not queried as separate guides | **OPEN** — rerun with the connector; a Site Builder page is expected to be absent either way |
| G17 | `.claude/knowledge/api/graphql-schema.md` refresh date vs `themeSnapshot`'s fields | **OPEN** — read its header; the VCST-6963 run folder holds a fresh cache |
| G18 | Preview for Clothing / Electronics (no store URL, global `StoreUrl` set), D9 | **OPEN** — open a page in each (read-only) |
| G19 | Page gating (`visibility`, user groups, organization, dates) on the storefront | **OPEN** — set an audience on a throwaway page and view as a buyer |
| G20 | File pages (Content storage / git work branches) and a store with an assigned repository | **OPEN** — `GitContentRepository` / `AllowedRepositories` fixture |
| G21 | BUG-SiteBuilder-PreviewAs-Header-Stays-Signed-Out (untracked report) and "Preview as" refusal of `admin` (D7) | **OPEN** — needs the preview-auth code request (sign-in log write) |

---

## §6 — Prior-art verdicts

The three guides and the test model stay the per-ticket detail; **this map supersedes them where they
disagree** — and the guides themselves say they cover one slice.

| Claim | Verdict |
|---|---|
| 6571 guide: "Publishing a page does not publish theme changes" / "Click **Save**, then **Publish theme**. Header, footer, brand, palette, templates and rules go live together." | `CONFIRMED·source` (theme-snapshot.md, "Publishing a page does not publish the theme"); the live designer carries a separate **Publish theme (N)** next to **Publish** |
| 6571 guide setup: "GitHub is optional. Without the GitHub App, save and publish work; the toolbar shows **Enable history**" | `CONFIRMED·live` (b2c designer toolbar) — **supersedes** the module repo's version-history.md (D2) |
| 6571 guide "Not documented: History versions, restore … (no GitHub organization on vcst)" | **DRIFT for vcst_dev**: an organization is connected and two stores have history (D3); history is now testable here |
| 6571 guide: pages states **Draft, Pending, Active, Archived, All Pages** | `CONFIRMED·live` (filter); semantic of Pending differs from Page Builder docs (D1) |
| 6842 guide: "The toolset has 28 tools." | **DRIFT** — 30 (D4) |
| 6842 guide: Approver = `mcp:approve`, `builder:read` for the store, `builder:publish` | `CARRIED` (KB-E07C2FFE); README's production table omits it (D5) |
| 6842 guide: "A second person approves every publication … **Agent approvals**" / "Settings › Monitoring & Tools › Agent approvals" | `CONFIRMED·live` (route, menu location, empty-state text, `AllowSelfApproval` Off, 72 h) |
| 6842 guide: "Marketing › Content › Sites, open the store and click the new page" | `CONFIRMED·live` (Sites list → store blade → page row) |
| 6842 guide "What will change shows only the status change" | `CARRIED` (VCST-7019 open, D6) |
| 6963 guide: "If **Settings › Platform › Security › File extensions whitelist** lists any extension, add `.json-draft`" | `UNVERIFIED` live (G-adjacent: setting not opened); source `CARRIED` |
| 6963 guide: author role = `builder:access, read (store), create, update, builder:theme` | `CONFIRMED·live` for the live author role (which also holds publish, templates, shared-components create/update) |
| 6963 test model: chain L1–L9 (custom-section slice) and "domain map STALE" | **SUPERSEDED** for the domain: the full chain is §1; its L1–L9 is a slice of §1 L2–L6 |
| page-builder.md rev 2: "Site Builder theme-snapshot path MISSING from the map" | `CONFIRMED` true at rev 2; closed by this map |
| BL-SB-001..006 (orientation only) | not re-judged here; BL-SB-002 is `SUSPECT` on VCST-7046 X48 (cited in §1 sibling-guard list) |
| Brief: "GitHub history enabled on Electronics only; Stores B2B-store (en-US, de-DE) …" | **DRIFT** — History on B2B-store and Electronics; B2B-store has 12 languages (D3, D14) |

**Resolves from prior art's open lists:** 6571 "History versions … not tested (no GitHub org)" is now
*testable* (D3); 6842 "tool arguments with a wrong name are ignored without an error" stays `CARRIED` and
unresolved; 6963 "Regression 123/124 not run: storefront user not configured" — the buyer account now
exists (data ledger "kept on purpose: the storefront buyer USER"), `UNVERIFIED` here.

---

## §7 — Amendments

Written by `/qa-test` `5-docs-map`, one row per write-back, **append-only**.

| Date | By | What moved |
|---|---|---|
| — | — | none yet (rev 1) |
