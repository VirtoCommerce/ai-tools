---
domain_slug: page-builder
applicability: universal
rationale: |
  What the Page Builder / CMS-authoring domain IS and where its surfaces are — the native
  drag-and-drop page composer (VirtoCommerce.PageBuilderModule), its Shared Components slice
  (shipped as PR-159, now tested end-to-end via VCST-4933), the adjacent VirtoCommerce.Pages
  delivery index, and the VirtoCommerce.BuilderIO external-SaaS integration that publishes into
  the same index. Rev 1 was a FULL 1c-map pass on vcptcore-qa. Rev 2 is an ENVIRONMENT-SWITCH
  refresh onto vcst-qa (the default env), re-enumerating every count rev1 took on vcptcore-qa,
  triangulating 11 freshly-fetched published-doc quotes against live, and folding in the
  VCST-4933 Shared Components test run (28 scenarios, 4 bugs filed, full seeder infrastructure)
  that landed between rev1 and this refresh.
  NOTE (carried from rev1, still true): `config/test-suites.json` tags these suites
  `"domain": "content-cms"`, not `page-builder` — there is no `bl:extract` domain token for either
  spelling (confirmed again this pass: grepping `business-logic.md` for domain codes shows AUTH,
  BOPIS, CART, CAT, CHK, CR, CROSS, GQL, IMPEX, LOY, NOTIF, ORD, PAY, PLAT, PRICE, PROFILE, SEO,
  SHIP, SR, SRCH, STORE, UI, WL — no CMS). This map is filed at `page-builder.md` /
  `domain_slug: page-builder`; a consumer matching by `config/test-suites.json`'s `domain` field
  should also try `content-cms`.
generated: 2026-09-23
rev: 2
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/Page Builder (CMS)/ (4 prior-art docs: the 2 from rev1, unchanged, plus NEW
    shared-components-guide.md (148 ln) and shared-components-customer-guide.md (107 ln),
    both dated 2026-09-17, verdicts in §6)
  - reports/ba/test-models/VCST-4933-2026-09-17.md (277 ln) — full value-chain/fault-model for
    Shared Components; sourced its L1-L10 sub-chain, variants and reverse-edge findings
  - vc/shared/archive/sprints/Sprint26-18/VCST-4933/{findings.md,summary.json} — the actual
    /qa-test run this ticket produced (2026-09-17, vcptcore-qa, verdict PASS_WITH_NOTES),
    recovered from the sprint archive (its live path reports/tickets/Sprint26-19/VCST-4933/
    no longer exists — archived by a later, unrelated commit)
  - live enumeration on vcst-qa (Admin: Content>Pages widget, page-builder-shell app, Shared
    Components tab, Security>Roles) + vcst-qa-storefront (a Shared-Component page render),
    playwright-edge, 2026-09-23
  - GET /api/platform/modules + settings (context-free admin token) on vcst, 2026-09-23 —
    supplied by the orchestrator brief, cross-checked against what the live UI showed
  - config/test-suites.json + regression/suites/Backend/page-builder/** + 050f-graphql-xcms.csv
    (re-counted by grep this pass: 50/58/70/19 = 197, UNCHANGED from rev1)
  - test-data/aliases.vcst.json + scripts/seed-data/cms/seed-pagebuilder-shared-components.mjs +
    shared-components-specs.mjs (committed 2026-09-21) — confirms the fixture family is
    provisioned on vcst, not only vcptcore
  - docs/repo-findings-backlog.md + docs/repo-findings-action-plan.md — B-53, the orphan-CSV
    incident: an untracked Shared Components suite CSV that is no longer on disk (see §5 G1)
  - VirtoOZ, 11 verbatim quotes across PlatformUserGuide + PlatformDeveloperGuide +
    StorefrontUserGuide, fetched by the orchestrator 2026-09-23, triangulated against live by me
    this pass (§3 D6/D8/D9)
excludes: |
  BuilderIO settings blade and Stores>Page Builder widget were NOT independently re-clicked this
  pass (relying on rev1's live confirmation + doc quote 4 + the brief's settings dump) — treat
  those two rows as carried-unverified, not re-confirmed. Export/import (platform BackupRestore
  500s for any module manifest, per VCST-4933 findings §G4) still unexercised. Load/concurrency
  behaviour beyond the VCST-4933 findings' 11-round probe is out of scope.
---

# Page Builder (CMS authoring) — domain map

> Refresh with `/qa-domain-map page-builder`. This file answers **what the feature is and where
> its surfaces are**. It does **not** carry behavioural rules — those are `BL-*` in
> `oracles/business-logic.md`, and for this domain there are **none yet** (§4/§5 G7) — and it can
> **never ground an assertion as `{DOC}`**.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass ·
`DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does not exist ·
`UNVERIFIED` = not established, and **not** to be treated as true.

> ## ⚠ ENVIRONMENT + BUILD VOLATILITY — read before citing any count
> This refresh runs on **vcst-qa** (`TEST_ENV=vcst` default), not rev1's vcptcore-qa. **Every count
> rev1 took (page-status tallies, permission inventory, Shared-Component objects) is a DIFFERENT
> environment's number and is not comparable** — both are recorded, neither supersedes the other.
> Separately: the **Platform itself is running a PR build on vcst right now**
> (`3.1072.0-pr-3108-b6ef`, live in the Admin header 2026-09-23 — an unrelated UCP-domain PR), and
> the **storefront theme is `2.59.0-pr-2467-1951-195127f5`** (also the UCP PR). Only
> `VirtoCommerce.PageBuilderModule` itself is on a clean release, **3.1026.0** (per
> `GET /api/platform/modules`, supplied by the orchestrator brief) — so Page Builder's own behaviour
> is reproducible from a released build, but the platform/storefront it runs inside of is not a
> stable baseline this week. Re-read this box's "3.1072.0-pr-3108" / "2.59.0-pr-2467" values after
> that PR merges or reverts.

---

## Changed since rev 1

| # | Claim in rev1 | rev1 said | rev2 finds |
|---|---|---|---|
| 1 | Environment | vcptcore-qa, all counts | **vcst-qa** — Draft 30 / Pending 1 / Active 37 / Archived 96 / All 99+ (was 22/0/47/41 on vcptcore-qa — different env, both recorded, not diffed) |
| 2 | Back-office entry point | "a standalone Vue micro-frontend" (`/apps/page-builder-shell/`) described as *the* entry; direct-nav footgun noted as possible DRIFT | **THREE entry points exist, confirmed live**, converging on the same Designer SPA — see new §2/D6. The Content→Pages widget is the doc-canonical one (quote 1), not the shell |
| 3 | G1 (Shared Components coverage) | "zero regression coverage anywhere... no seeder exists" | **Fixture layer is now fully built and live on vcst** (seeder, drift-guard, 17 aliases, 7 provisioned permission roles, 4+3 live Shared Components on B2B-store). **Suite-authoring is STILL zero** — `new_cases_authored: 0` in the VCST-4933 run's own `summary.json`, and an untracked, unregistered suite CSV for it (B-53) is no longer on disk and was never committed. G1 is **narrowed, not closed** — see §5 |
| 4 | G2 (RESTRICTED_CMS_ADMIN vs Shared Components perms) | "UNVERIFIED whether the fixture's role also carries the newer grants" | **CLOSED, live-confirmed 2026-09-23**: the role holds exactly `{builder:access, builder:read}` — **zero** `builder:shared-components:*` grants of any kind |
| 5 | G5 (published docs) | "NOT REACHED this pass... VirtoOZ/Context7 both unavailable" | **11 verbatim quotes fetched and triangulated this pass.** Closes the base-feature doc gap; a NEW, narrower gap opens for Shared Components specifically (no guide mentions it at all — expected lag, not a defect) |
| 6 | §1 Purpose | `UNDECLARED` — no doc could be queried | **Still formally `UNDECLARED` as a single sentence** (no guide states one), but now directly quotable and far better grounded — see §1 |
| 7 | §4 suite counts | 50/58/70/19 = 197 | **UNCHANGED**, re-counted by grep and cross-checked against `config/test-suites.json testCount` this pass — exact match |
| 8 | AC3 (create-from-selection, VCST-4933) | not assessed (predates the run) | The VCST-4933 run's OWN AC3 verification was **BLOCKED mid-run** by a clipboard-permission bug (now filed as **VCST-6011**/High) and never re-run to completion — treat "a Shared Component can be created via the Designer UI" as **UNVERIFIED at the UI layer**, even though the REST-level create path is thoroughly verified |
| 9 | Prior-art item PP-06 (404 despite Published) | "STALE, not re-checked" | still not re-checked this pass either — carried forward unverified |
| 10 | D3 (never-published page → dead Designer preview) and D4 (store-scoped 403 for non-Administrators) | `CONFIRMED` — per rev 1's brief, not observed by rev 1 itself | **Downgraded to carried `UNVERIFIED`** — neither was observed live by either rev; D4 now has a documented mechanism (`shared-components-guide.md`, VCST-4933 BSC-3), D3 has none |
| 11 | Back office / API surface tables (page detail blade, status badges, settings, 20-entry permission list, base REST table) | `CONFIRMED` on vcptcore-qa 2026-09-16 | **Carried unchanged and NOT re-checked on vcst** — kept verbatim in §2 so no reader loses them; each is marked carried |
| 12 | `PageBuilderModule` version | `3.1025.0-pr-159-7361` (PR build, vcptcore-qa) | **`3.1026.0` release** on vcst — PR-159 (Shared Components) shipped |

---

## §1 — Purpose and value chain

**Purpose: still `UNDECLARED` as a single authored sentence** — no guide states one directly, and
that remains a finding, not a blank. But it is now directly quotable rather than reconstructed
from nothing: VirtoOZ `PlatformUserGuide` (queried by the orchestrator, triangulated by me this
pass) — *"The Page Builder module allows you to create ecommerce pages from blocks and edit them
using a visual editor. Unlike the Content module, which only supports creating and editing pages
using Markdown and HTML, the Page Builder module provides a more intuitive, visual approach."*
(docs.virtocommerce.org/platform/user-guide/page-builder/overview). This is a documented
**capability statement**, not a value-chain purpose sentence, so `UNDECLARED` stands for the
chain-shaped question ("why does this domain exist, end to end") while the capability question
now has a citable answer.

**The domain is still three cooperating, separately-versioned modules** (rev1's table), with
versions re-confirmed for vcst-qa via the orchestrator's `GET /api/platform/modules`:
`VirtoCommerce.Pages` 3.1008.0 · `VirtoCommerce.PageBuilderModule` **3.1026.0** (a clean release,
not a PR build — DRIFT from rev1's `3.1025.0-pr-159-7361`, i.e. PR #159 has since shipped) ·
`VirtoCommerce.BuilderIO` 3.1005.0 (unchanged).

| # | Link, in the customer's words | Mechanism | Verdict |
|---|---|---|---|
| 1 | A page comes into existence | `POST /api/page-builder-pages/grouped` (Admin `Add`) · Load Content (JSON) · Builder.io webhook | CONFIRMED (rev1, not re-observed via mutation this pass — read-only brief) |
| 2 | It gets identity + content | Name · Language · Permalink · a content tree authored in the Template Builder Designer | CONFIRMED live 2026-09-23 — reached via **two independent routes** this pass (see D6) |
| 2a | **(Shared Components sub-chain, VCST-4933 — inserted between L2 and L6)** | Content manager selects adjacent top-level sections in the Designer, saves as a Shared Component; the sections collapse into ONE `componentRef` placement; the component appears in the Shared Blocks Library and the Shared Components workspace; inserted elsewhere as either a LINKED instance or an INDEPENDENT copy; usage becomes authoritative only on page SAVE | CONFIRMED at the REST/data layer (VCST-4933 run: AC1/AC2/AC4/AC6/AC7 all PASS). **UNVERIFIED at the Designer UI layer** — the run's own AC3 (create-from-selection through the actual UI) was blocked mid-verification by VCST-6011 (clipboard-gated actions menu) and never re-run to completion |
| 3 | Content can be built from REUSABLE pieces | See 2a. Live-confirmed this pass: a consumer page (`/agent-test-sc-consumer-a`) renders its own TOP section, the 3 shared-trio sections inline, and its own BOTTOM section, in document order, with no visible seam | CONFIRMED live 2026-09-23 (storefront render, see §2 Storefront) |
| 4 | It is scheduled + gated | Scheduling (Start/End) · Personalization (Visibility, User groups, Organization) | CONFIRMED (rev1, not re-observed this pass) |
| 5 | It is promoted through a status lifecycle | Draft → Published (Active), Pending = scheduled-not-live, Archived. **`.page-draft` / `.page` file-extension mechanic, CONFIRMED live 2026-09-23** via the Content>Pages widget: a Published page (`homepage.page`) opened for editing resolves to `homepage.page-draft` in the Designer URL — a live, independent confirmation of the doc's own claim (quote 2) | CONFIRMED |
| 6 | It is indexed for delivery | Publish writes into the `VirtoCommerce.Pages` index, shared with Builder.io's webhook | CONFIRMED (rev1) |
| 7 | The storefront resolves and renders it | `slugInfo(permalink,storeId,cultureName)→entityInfo.id` then `pageDocument(id){content}`; for a Shared-Component page the delivered tree is fully EXPANDED, zero `componentRef` | **RE-CONFIRMED live on vcst 2026-09-23** (rev1 confirmed this on vcptcore-qa only) — same mechanism, independent environment, same result |
| 8 | It can be duplicated / exported / reused | Clone · Save/Load content | CONFIRMED (rev1); export/import still broken platform-wide (VCST-4933 findings §G4: `POST /api/platform/export` 500s for ANY module manifest — a BackupRestore defect, not page-builder-specific) |
| 9 | It is retired | Archive is the only UI soft-delete for pages. **For a Shared Component specifically**: delete is refused while `usageCount>0`, confirmed **live on vcst 2026-09-23** with the exact guard message *"Remove this component from all 3 pages before deleting it."* An UNUSED component (usage=0) deletes successfully — confirmed at the REST layer by the VCST-4933 run (204, then 404 on repeat) | CONFIRMED |
| 9a | **Reverse edges — two are ABSENT IN PRODUCT, confirmed this run, not hypothesized** | (a) Editing a Shared Component's original has **no un-propagate, no version history, no cross-page undo** — every linked page changes with no rollback. (b) **Detach has no re-attach** — the only way back is deleting the detached sections and re-inserting the component | CONFIRMED — VCST-4933 findings, explicit reverse-edge check, both absent by design inspection, not by a failed search |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Category Manager / CMS admin (`builder:*`) | Everything above | CONFIRMED live |
| **`AGENT-TEST-Restricted-CMS-Viewer`** (rev1's `RESTRICTED_CMS_ADMIN`) | Read-only base Page Builder (`builder:access`, `builder:read`) | **CONFIRMED live 2026-09-23 — G2 CLOSED.** Security→Roles shows the Assigned-permissions table holds **exactly two rows**: `builder:access`, `builder:read`. **Zero** `builder:shared-components:*` grants of any kind (not even `:read`) |
| The 7 VCST-4933 permission-partition roles (`AGENT-TEST-PB-SC-sc-{all,read,nocreate,noupdate,nodelete,noread,nostore}`) | Each holds a distinct subset of the 4 `builder:shared-components:*` verbs, layered on a common base-permission floor | CONFIRMED live 2026-09-23 — all 7 roles exist in Security→Roles with self-documenting descriptions naming their VCST-4933 scenario numbers |
| Storefront visitor | Read-only via GraphQL | CONFIRMED live (re-observed on vcst) |
| Builder.io author | Authors outside this platform's auth; publishes via webhook | UNVERIFIED — unchanged from rev1, out of reach by construction |

---

## §2 — Surface inventory

### Back office (Admin SPA + embedded Vue/Angular shells)

**Three entry points, confirmed live 2026-09-23, all converging on the same Designer:**

1. **Content module → per-store "Pages" widget** (main nav → More → Browse → Content → a store
   tile's "Pages" widget). Opens a **flat file-manager grid** — Pic/Name/Size/Modified columns,
   entries literally named `homepage.page`, `contacts.en-US.page`, each tagged `Published` — with
   toolbar Refresh/New folder/Add/Upload/Delete/Move. Selecting a row opens a **page-properties
   blade** (Relative path, File name, Language, Permalink) with actions **Save / Reset / Preview
   page / Design / Unpublish / Search index**. Clicking **Design** navigates to
   `/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/index.html?storeId=<store>#/pages?type=pages&path=/<name>.page-draft&previewId=<b64>`
   — this is **the doc-canonical route** (quote 1: *"accessed through the Content module
   interface"*) and was NOT the route rev1 described as primary.
2. **Standalone VC Shell app**, `{{BACK_URL}}/apps/page-builder-shell/?storeId=<store>` — unchanged
   from rev1: hash routes `#/page-builder-draft|-pending|-active|-archived|-shared-components`,
   `#/page-builder` (All), `#/page-builder-assets`. **Live counts, vcst-qa, 2026-09-23:** Draft 30 ·
   Pending 1 · Active 37 · Archived 96 · All 99+ (a different environment from rev1's
   vcptcore-qa 22/0/47/41 — not comparable). Grid columns confirmed unchanged: Name, Language,
   Permalink, Modified, Modified by, Status, + a hidden-by-default Show/Hide Columns control
   (contents still not enumerated — UNVERIFIED).
3. **Stores → Page Builder widget** (doc quote 4) — carried from rev1 as CONFIRMED-live-2026-03-25,
   **not independently re-clicked this pass** — carried-unverified.

All three lead to the same underlying `.page`/`.page-draft` file store and the same Designer SPA —
this is new information this pass (see D6).

**Shared Components tab** (via entry 2), `CONFIRMED` live vcst-qa 2026-09-23:
- **7 live rows on B2B-store**, not 3 as rev1 saw on vcptcore-qa: `AGENT-TEST-SC-Multi-Trio`
  (usage 3), `AGENT-TEST-SC-Single` (1), `AGENT-TEST-SC-Unused-Deletable` (0),
  `AGENT-TEST-SC-Used-Undeletable` (1) — all 4 from the VCST-4933 seeder, modified "1 day ago"
  (2026-09-21/22) — **plus 3 pre-existing, NON-`AGENT-TEST`-prefixed rows**: `empty text block`
  (0), `only 1 element - login` (3), `only one element - Image` (3), modified "about 1 month ago"
  (2026-08-24). **New finding**: these three lack the `AGENT-TEST-` convention (`.claude/rules/test-data.md`
  §Four data layers: *"`AGENT-TEST-` prefix so teardown sweeps them"*), so no teardown script will
  ever remove them — durable, un-swept test residue, low severity but real.
- Detail panel (opened on the Multi-Trio row): Store `B2B-store`, Modified `Sep 21, 2026, 4:23 PM`,
  Modified by `admin`, **"Used on (3 pages)"** listing `AGENT-TEST-SC-Consumer-A` (Published),
  `AGENT-TEST-SC-Consumer-B` (Published), `AGENT-TEST-SC-Consumer-Draft` (Draft) — exact page
  names, permalinks and statuses, confirming D1 on vcst too. **Delete disabled**, message
  *"Remove this component from all 3 pages before deleting it."* — identical wording to rev1's
  vcptcore-qa observation, confirming the guard is environment-independent product behaviour, not
  an artifact of one deployment.
- **REST contract, sourced from `shared-components-guide.md` (itself grounded in the VCST-4933
  live run, so carried here as CONFIRMED via that ticket's evidence chain, not re-verified
  independently by me this pass):** route `/api/page-builder-shared-components`
  (`SharedComponent`/`SharedComponents` in code — the ticket's own artifacts used the OLDER name
  `LinkedComponent`, a naming split settled by the deployed route, see D7). Placement marker is a
  **top-level, exactly-3-key** object `{id, type:"componentRef", componentRef}`; matched on
  `type=="componentRef"` AND key-count==3 — any other shape (extra/missing field, wrong `type`,
  `type:"ComponentRef"` case variant) is accepted as an ordinary block and silently does NOT
  create a reference (VCST-4933 finding §E: `204`, usage NOT incremented). Deterministic `400`
  on: dangling component id, duplicate/colliding placement id, nested marker, self-reference,
  cross-store reference, `PUT` attempting to move `storeId`. Permissions:
  `builder:shared-components:{read,create,update,delete}`, each gating its own verb, PLUS the
  undocumented `/{id}/content` sub-resource gated identically, PLUS saving page content containing
  a `componentRef` additionally requires `shared-components:read` even though the page-save route
  itself only declares `builder:update`. **Store scoping precedes all of it** — a non-Administrator
  403s on every store-scoped route unless `user.StoreId` matches, and this must be distinguished
  from a real gating defect by probing an unrelated route the token demonstrably holds rights for
  first (VCST-4933's BSC-3 control, scenario #26).
- **Known bugs on this surface** (all filed, all still open at this pass): **VCST-6009** (Medium,
  silent lost update — no `ETag`/`rowVersion` anywhere, two concurrent saves both `204`, one
  author's work vanishes with no signal) · **VCST-6010** (Medium, `POST .../shared-components`
  accepts a non-existent `storeId` → `201`, an unreachable orphan — inconsistent with the two
  sibling store-guards in the same controller, which are both correct) · **VCST-6011** (High, the
  Designer's whole actions menu — including the ONLY entry point to "Save selected as Shared
  Component" — silently renders empty unless the browser grants `clipboard-read`; **permanently
  broken on Firefox**, which does not implement `readText()` for web content at all) · **VCST-6012**
  (High, a11y — section tree unreachable by Tab, icon-only controls with no accessible name, an
  `aria-prohibited-attr` on the Shared badge, `"(undefined)"` in tree titles — pre-existing, the new
  Shared-placement row inherits it).
- **Status badges** (carried from rev 1, not re-checked on vcst): Draft, Published, Personalized,
  "Has draft with changes", Scheduled.
- **Page detail blade** (carried from rev 1 / March 2026 report, not re-opened on vcst): Basic info
  (Name, Language, Permalink + clickable storefront URL) · Scheduling (Start/End date, collapsed) ·
  Personalization (Visibility toggle, User groups, Organization, collapsed) · toolbar: Save, Preview,
  Open Designer, Save content, Load content (Draft tab only), Clone, Publish/Archive.
- **Template Builder Designer** — separate SPA at
  `/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/index.html`; every content
  edit, from any of the three entry points, opens it. `CONFIRMED` live on vcst 2026-09-23.
- **Assets Library tab** (`#/page-builder-assets`) — shared asset browser for page sections and Shared
  Components; doc quote 3 describes "the name of the page(s) where the image is used" with copy URL /
  replace / delete. Not re-audited this pass — carried `UNVERIFIED` on vcst.
- **Settings, in the MAIN Admin SPA (not the shell):** Settings → BuilderIO (Enable toggle, Public API
  Key — plaintext, no format validation, prior report PP-08) · Store Settings → VirtoPages toggle ·
  Store → Settings → Page Builder (`StorePreviewPath="/designer-preview"`, `StoreUrl=null`,
  `PreviewUserIds=""` on vcst per the settings API). Blades carried from rev 1, values `CONFIRMED` via
  the settings API 2026-09-23. With `PreviewUserIds` empty, doc quote 5 says the preview-as-user icon
  should be absent — `UNVERIFIED` live.
- **Permissions inventory** — carried from rev 1 (`GET /api/platform/security/permissions`,
  vcptcore-qa 2026-09-16, 20 entries), **not re-pulled on vcst**:
  - `VirtoCommerce.Pages`: `Pages:create/read/update/delete`
  - `VirtoCommerce.BuilderIO`: `builderio:access/read/update/delete`
  - `VirtoCommerce.PageBuilderModule`: `builder:access`, `builder:create`, `builder:read`,
    `builder:update`, `builder:delete`, `builder:publish`, `builder:theme`, `builder:templates`,
    `builder:shared-components:read/create/update/delete`
  - `UNVERIFIED` (carried): what UI, if any, is gated by `Pages:*` directly.
- **Not manageable from the back office:** Builder.io webhook configuration (done in Builder.io
  itself) · a hard delete of a page (only Archive is reachable in the UI) · re-attaching a detached
  Shared Component (§1 link 9a) · version history / rollback of a Shared Component edit (§1 link 9a) ·
  the hidden-by-default grid columns (existence noted, contents `UNVERIFIED`, G6).

### Storefront (customer-facing)

- **Entry:** `{{FRONT_URL}}/<permalink>`, resolved via `slugInfo`→`pageDocument`. **RE-CONFIRMED
  live on vcst-qa-storefront 2026-09-23**, independent of rev1's vcptcore-qa observation: navigated
  to `/agent-test-sc-consumer-a` as an anonymous visitor and the page rendered its own TOP section,
  the shared trio's THREE sections inline in document order, then its own BOTTOM section — a real
  customer sees one seamless page with no indication any block is shared. No `componentRef`,
  `SharedComponent`, or Page Builder API traffic is visible in this render (matches the documented
  "storefront never calls the component API" contract).
- **Not manageable from here** — unchanged from rev1: a visitor only ever reads.
- **StorefrontUserGuide, queried by the orchestrator 2026-09-23**: **no page describes Page Builder
  pages from the buyer side at all** — the closest results were product/brand/homepage-layout pages,
  none of which is this feature. This **settles** rev1's "storefront docs not reached" gap: they
  were reached, and the finding is that none exists (see D9) — a genuine absence, not a miss.

### API / contract layer

- **REST (base PageBuilderModule)** — carried verbatim from rev 1 (`PageBuilderPageController.cs`,
  `dev` branch, read 2026-09-16), **not re-read at source this pass**:

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

  rev 1's `POST …/search` live result (`totalCount:107` on vcptcore-qa, vs Draft+Active+Archived=110,
  unreconciled) is carried; not re-run on vcst.
- **Not manageable from the storefront xAPI:** every authoring operation — xCMS/Pages GraphQL is
  read-only (`slugInfo`, `pageDocument(s)`, `page(s)`, `menu(s)`).
- **REST (Shared Components)** — see the Back-office section above; this is the surface with the
  most new, concrete grounding this pass.
- **GraphQL (xCMS)** — unchanged: `slugInfo`, `pageDocument`, `pages`, `page(id)`, `pageDocuments`,
  `pageContext`, `menu`/`menus`, all under suite `050f` (19 cases, re-counted this pass, unchanged).
  `pageDocument` takes **`id` only** — passing `storeId`/`cultureName` is a schema error (this
  specific contract detail is new this pass, sourced from `shared-components-guide.md`).

---

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | Shared Components list endpoint returns real `usageCount` with an empty `usagePages` (by design, `includePages:false`); only the per-item detail call populates the actual page list | **RE-CONFIRMED live on vcst 2026-09-23** (rev1 confirmed on vcptcore-qa) — env-independent |
| D2 | Compact 3-key authoring marker vs. fully-expanded delivered content (zero `componentRef`, synthetic `lc<hex>sectionN` ids) — a storefront consumer can never tell a block came from a shared component | **RE-CONFIRMED live on vcst 2026-09-23** via the `/agent-test-sc-consumer-a` render — env-independent |
| D3 | A never-published page has a silently-dead Designer preview channel | Carried UNVERIFIED — not re-observed this pass either |
| D4 | Non-Administrator 403s on every store-scoped route unless `user.StoreId` matches | Carried UNVERIFIED as a live 403 test, but now has a **documented mechanism** behind it (`shared-components-guide.md`'s "store scoping precedes all of it" contract note + the VCST-4933 BSC-3 control scenario) — stronger source, still not independently re-triggered by me this pass |
| D5 | `059/060/060b` filed under `Backend/page-builder/` despite asserting almost entirely against Admin-SPA/Designer UI — consistent with this repo's own `Backend/`=admin-owned convention | CONFIRMED, unchanged |
| D6 | **Three back-office entry points exist for the same page content** (Content>Pages widget, standalone VC Shell app, Stores>Page Builder widget), and they present genuinely different SHAPES of the same underlying data: the Content>Pages widget is a flat file-manager grid with NO status tabs and NO Shared Components view; the VC Shell app has the Draft/Pending/Active/Archived/Shared-Components tab structure rev1 described as *the* interface. Both, when you ask to edit content, hand off to the identical Designer SPA. **rev1 treated the shell as the primary/only entry — it is one of (at least) three, and the doc-canonical one is the Content widget** | CONFIRMED live 2026-09-23, this pass's own discovery — supersedes rev1's framing |
| D7 | **Naming split**: the ticket's own Q&A thread and delivery comment call the feature `LinkedComponent`; the deployed route and persistence model are `SharedComponent`. `shared-components-guide.md` names this explicitly as "directly implicated in a prior false bug report" (VCST-4933 findings, disposition of prior-finding #4: a "false" bug about wrong rejection-message wording traced to someone testing against the wrong vocabulary) | Source-only (doc, itself grounded in the VCST-4933 live run) — not independently re-verified by me this pass, but load-bearing enough to carry as a numbered row: **the deployed name is the one to test against, not the ticket's** |
| D8 | **No published guide mentions Shared Components at all** — expected, since the feature is newer than the docs' last sync, and NOT a defect (this is the "divergence the docs declare-by-omission" shape the domain-map gate asks to distinguish from a real contradiction) | CONFIRMED (orchestrator's fetch across PlatformUserGuide/PlatformDeveloperGuide/StorefrontUserGuide returned zero Shared-Component hits) |
| D9 | **StorefrontUserGuide has no page describing Page Builder pages from the buyer side at all** (rev1 flagged this as NOT-REACHED; this pass reached it and the answer is "genuinely absent") | CONFIRMED — settles rev1's G5 for the storefront axis specifically |

---

## §4 — Coverage shape

**Basis: grep-counted this pass against `regression/suites/Backend/page-builder/**` +
`Backend/graphql/050f-graphql-xcms.csv`, cross-checked 1:1 against `config/test-suites.json`
`testCount` — exact match, zero drift from rev1.**

| Suite | Cases (manifest, re-verified) | Feature-relevant | Notes |
|---|---|---|---|
| `059-page-builder.csv` | 50 | 50 | Unchanged |
| `060-page-builder-design-content.csv` | 58 | 58 | Unchanged |
| `060b-page-builder-fields-assets.csv` | 70 | 70 | File **grew** (783 lines vs rev1-era smaller size) due to VCST-5704 page-anchor cases (`CMS-159`–`CMS-168`, 10 cases) landing between rev1 and this pass — but the **total case count is unchanged at 70**, so this was likely already counted in rev1's 70 (VCST-5704 shipped 2026-08 per git log `4ed1014a`, before rev1's 2026-09-17 generation date) |
| `050f-graphql-xcms.csv` | 19 | 19 | Unchanged |
| **Total** | **197** | **197** | Unchanged from rev1 |

- **G1 status, precisely re-stated this pass**: grepping all four suite files for
  `componentref|shared component|sharedcomponent` (case-insensitive) still returns **zero genuine
  hits** — the handful of "shared" matches in 059/060b are false positives (unrelated prose:
  "shared PAGE-4 fixture", "backward compatible... shared keys"). **The fixture/seeder layer is now
  fully built and live** (§2), and a full 28-scenario test DESIGN exists (VCST-4933 test model), and
  a live exploratory+scripted run against it produced 4 confirmed bugs — but **none of that reached
  a committed regression-suite row**. The VCST-4933 run's own `summary.json` states this directly:
  `"new_cases_authored": 0`, with `regression.c1.skipped_reason` explaining that Artifact A's
  corpus-triage step found no existing 059/060/060b row asserting any Shared-Components observable,
  so there was nothing to repair or extend. **This is a hole, not a deliberate exclusion, and it is
  now a MORE surprising hole than in rev1** — because the test design, fixtures and even bug reports
  all exist; only the suite rows themselves don't.
- **A related, concrete incident, new this pass**: `docs/repo-findings-backlog.md` (B-53, merged
  2026-09-16 per the action plan) records that a suite CSV,
  an untracked `059b-page-builder-shared-components.csv` in the page-builder suites folder, existed
  **transiently on disk**, unregistered in `config/test-suites.json`, blocking `suites:lint` for
  every author repo-wide. It is now **gone** — not on disk (`ls` of the page-builder suites dir
  shows only 059/060/060b), not in git history (`git log --diff-filter=D` on that exact path returns
  nothing — it was never committed), and not recoverable from any agent worktree (searched all
  three present under `.claude/worktrees/`). **Whether it was deleted deliberately (B-53's own fix
  offered "register it … or delete it") or lost is not established** — either way, no Shared
  Components suite rows survive. Whoever picks up G1 next should treat this as a warning to register the
  suite in the manifest in the SAME commit that creates the file, not after.
- **Builder.io coverage**: unchanged from rev1 — zero dedicated suite coverage, small known hole.
- **Storefront rendering of CMS pages**: unchanged from rev1 — no dedicated `Frontend/` suite; only
  the 9+3=12 cross-layer "Storefront Verification" cases inside the Backend admin suites, plus
  `050f`'s GraphQL-level coverage. Not resolved here, still a human call.

---

## §5 — Open gaps

| # | Gap | State |
|---|---|---|
| G1 | Shared Components has a complete DATA/fixture layer (seeder, 17 aliases, 7 permission roles, live on vcst) and a complete TEST DESIGN (28-scenario VCST-4933 model) but **zero regression-suite rows** | **OPEN, narrowed.** Needs: (a) author suite rows from the existing test model's 28 scenarios — the data and design work is DONE, only authoring-into-CSV remains; (b) register the new suite file in `config/test-suites.json` in the SAME commit it's created, per the B-53 incident above; (c) separately, re-run VCST-4933's own blocked AC3 UI verification now that VCST-6011's clipboard-permission config fix (`playwright-chrome` gained `clipboard-read`/`clipboard-write`, per the commit that landed the fixtures) should unblock it |
| G2 | `RESTRICTED_CMS_ADMIN`/`AGENT-TEST-Restricted-CMS-Viewer` role's Shared-Components grants | **CLOSED this pass** — live-confirmed 2026-09-23: the role holds `{builder:access, builder:read}` and **zero** `builder:shared-components:*` grants |
| G3 | BuilderIO-authored vs PageBuilderModule-authored pages colliding on one permalink | **OPEN**, unchanged — needs a cross-module test using both authoring paths |
| G4 | Whether archiving a page a Shared Component still targets silently changes that component's `usageCount` (asymmetric reverse-edge) | **OPEN**, unchanged — needs a live archive-then-reopen-detail check. Note: VCST-4933's confirmed reverse-edge findings (9a above) are about EDIT-propagation and DETACH, not archive — this specific asymmetry is still untested |
| G5 | Published-guide cross-reference | **Substantially CLOSED this pass** — 11 verbatim quotes fetched, triangulated against live (D6, D8, D9). Remaining narrow gap: BuilderIO's own settings blade and the Stores>Page Builder widget entry were not independently re-clicked this pass (excludes:, above) |
| G6 *(new)* | The VC Shell's hidden-by-default grid columns (Show/Hide Columns control, present on both the page list and the file-manager grid) — existence confirmed twice now (rev1 + this pass), contents never enumerated | **OPEN** — needs a live click-through, read-only, no mutation required |
| G7 *(new, restated from a standing fact)* | No `BL-CMS-*` invariant family exists; `bl:extract`/`domain:check` DOMAIN-005 fails for this domain for the same reason. The VCST-4933 test model proposed 4 candidates (`BL-CMS-001` zero componentRef in delivered content, `BL-CMS-002` usage count = saved pages incl. originating, `BL-CMS-003` delete-blocked-while-used, `BL-CMS-004` copy/detach never re-tracks) but none has been promoted | **OPEN** — re-confirmed this pass by grepping `business-logic.md`'s domain codes (still none for CMS). Candidates are ready for `/qa-review-oracles` triangulation, not yet run |
| G8 *(new)* | 3 Shared Components on B2B-store (`empty text block`, `only 1 element - login`, `only one element - Image`) lack the `AGENT-TEST-` prefix and so will never be swept by any teardown script | **OPEN, low severity** — needs either a manual cleanup or a one-off teardown naming them explicitly by id |

---

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `ba-pagebuilder-ui-analysis-2026-03-25.md`: "Active pages `/new-components`, `/lena-test`, `/test-page-123` return 404 despite Published status" (PP-06) | **STALE, carried from rev 1** — superseded by the 2026-07 canonical `qa-*` page reconcile (`test-data/aliases.json` `changelog_1_5_35`–`1_5_38`); not re-tested on either env |
| `ba-pagebuilder-ui-analysis-2026-03-25.md`: "PageBuilder Shell requires direct-URL access; no main-sidebar entry" (PP-10) | **Partly superseded** — the shell still has no sidebar entry of its own, but D6 shows two other documented entry points (Content → Pages widget, Stores → Page Builder widget) reach the same Designer |
| `ba-pagebuilder-ui-analysis-2026-03-25.md`: 4-SPA architecture diagram (Admin SPA, Shell, Designer, Builder.io) | **CONFIRMED, carried and extended** — the 3-module back end (`Pages` / `PageBuilderModule` / `BuilderIO`) sits under it; doc quote 9's `window.postMessage()` Admin↔Frontend preview link is consistent with it |
| `ba-report-VCST-4872-...md` §8: "059/060 have zero coverage for save/load/clone" | **Resolved, carried** — 059's "Content Portability" section (17 cases) covers it; that report's open questions (file-size validation, permalink uniqueness on clone, versioning headers) remain uninvestigated |
| `ba-report-VCST-4872-...md`: no Shared Components concept at report time (2026-04-14) | **Confirmed, carried** — the reason G1 exists |
| `shared-components-guide.md` / `shared-components-customer-guide.md` (2026-09-17): the full UI/API contract for Shared Components | **CONFIRMED and heavily used as source this pass** — cross-checked against my own live observations (D1/D2/delete-guard wording/detail-panel population) with zero discrepancy found |
| VCST-4933 test model (2026-09-17): 28-scenario fault model, 4 candidate BL-CMS invariants, reverse-edge findings | **CONFIRMED as the design**, but its own execution (`findings.md`/`summary.json`) shows AC3 was NEVER completed (blocked by VCST-6011) — so the model's scenarios #1/#2 (create-from-selection) are DESIGNED but not fully EXECUTED. Treat the model as authoritative for WHAT to test, not as proof that everything in it PASSED |
| VCST-4933 findings.md: "AC7 expansion + API isolation: PASS, all three clauses" | **CONFIRMED, independently, on a different environment** — this pass's own live storefront render on vcst reproduces the same expansion behaviour vcptcore-qa showed |
| VCST-4933 findings.md §D: "5 findings below the severity floor, not filed" (VC Shell bare-URL dead end, 403-vs-404 discrimination, stale modifiedDate echo, inconsistent refusal bodies, plural-copy inconsistency, etc.) | Carried as-is — not re-investigated, still valid low-severity notes for whoever picks up polish work |

This map resolves rev1's G2 (CLOSED) and substantially resolves G5 (published docs). It leaves G1,
G3, G4 open and adds G6/G7/G8 as newly-surfaced, narrower gaps.

---

## §7 — Amendments

*(none yet — this is a full refresh, not an amendment. The next `/qa-test` run that touches this
domain should append rows here rather than re-running `/qa-domain-map`.)*
