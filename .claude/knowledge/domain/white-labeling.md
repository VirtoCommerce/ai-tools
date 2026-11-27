---
domain_slug: wl
applicability: reference
applicability_rationale: "White Labeling is a module feature (VirtoCommerce.WhiteLabeling) with a storefront contract; what a customer brands, and with which theme presets, differs per deployment."
rationale: |
  What the White Labeling feature IS - actors, the value chain from a back-office record to a rendered
  logo / favicon / theme / menu / footer, the surface inventory per layer (AngularJS admin, Admin Shell,
  storefront, REST + xAPI), where the layers DISAGREE, and the shape of existing QA coverage. Rev 1 replaces the
  un-slugged "Agent Reference" that sat at this path (no domain_slug, so no slug-keyed consumer could find it);
  its claims are carried forward with verdicts in section 6 and every wrong one is marked DRIFT, not dropped.
  Built after the WX window (REG-2026-11-26-1702-WXM) showed that none of the four FWL cases was live as
  written: the cases describe a product (Settings > Jobs, Customer > Organizations, .ico favicons, one "Enabled"
  master switch) that the build does not have. Breadth first: UNVERIFIED cells are listed in section 5 with
  what each needs.
generated: 2026-11-27
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - .claude/knowledge/domain/white-labeling.md as it stood before rev 1 ("White Labeling - Agent Reference", 195 lines, no domain_slug) - prior art, verdicts in section 6
  - live enumeration on vcst (playwright-chrome; back office in BOTH admin UIs, storefront as a guest and as one org buyer, REST swagger), 2026-11-27. Deployed per the brief and re-read live where marked - Platform 3.1101.0 (admin nav), theme 2.63.0 (storefront footer "Ver. 2.63.0"), VirtoCommerce.WhiteLabeling 3.1008.0, ImageTools 3.1010.0, AdminShell 3.1101.0, xapi 3.1033.0
  - VirtoCommerce/vc-module-white-labeling at tag 3.1008.0 (README, module.manifest, ModuleConstants, WhiteLabelingController, WhiteLabelingSettingValidator, GetWhiteLabelingSettingsQueryHandler + Builder, WhiteLabelingSettingsType, ChangeOrganizationLogoCommandHandler, Scripts/module.js, Web/vue/src/modules/**), read through the GitHub MCP, 2026-11-27 (docs/ holds only media)
  - vc-frontend local checkout a6ee5ce36 (commit "2.63.0", 2026-11-12; theme storefront reports 2.63.0) - useWhiteLabeling.ts, useNavigations.ts, useThemeContext.ts, App.vue, vc-header / mobile-header / bottom-header / secure-layout / vc-footer, pages/company/info.vue, useBrandProfile.ts. The deployed hash may differ from the checkout
  - VirtoOZ PlatformUserGuide, StorefrontUserGuide, PlatformDeveloperGuide, StorefrontDeveloperGuide, FrontendSourceCode, fetched first-hand 2026-11-27
  - .claude/knowledge/api/graphql-schema.md (live introspection header date 2026-11-19; queries/mutations lists complete, type sections a curated allowlist - WhiteLabelingSettingsType is NOT in it, so field names below come from the module source and the storefront's own live query)
  - .claude/knowledge/oracles/bl/wl.yaml (BL-WL-001..006, orientation only)
  - config/test-suites.json + regression/suites/Backend/whitelabeling/067-whitelabeling-admin.csv, regression/suites/Frontend/whitelabeling/070-whitelabeling-storefront.csv, 071-whitelabeling-branding.csv (parsed 2026-11-27)
  - regression/releases/sprint-26-23/waves/WX/report.md (WXE/WXM runs, 2026-11-26)
  - test-data/white-labeling/ (organizations.csv, users.csv, link-lists.csv, assets/) + test-data/aliases.json / aliases.vcst.json WL_* entries
  - kb entries listed in section 7's header (observed by other sessions; cited, never counted as this pass's observation)
  - PRIOR ART BA: none. reports/ba/ has no White Labeling folder and reports/ba/test-models/ holds no WL model. Run folders mentioning it (reports/tickets/Sprint26-23/VCST-6237, VCST-6571, VCST-6572 summary.json) only touch it as a side effect (org-switch, Site Builder theme)
excludes: >-
  (1) vc-shell AUTH-PAGE branding (admin sign-in logo / background) - a separate mechanism, one-line existence note in
  section 2e, not enumerated. (2) The Site Builder theme/palette interplay with store white labeling (VCST-6571/6572, alias SB_WL_ORG_BUYER) -
  a later pass. (3) ImageTools thumbnail task internals - only the favicon link of the chain is mapped. (4) Custom-domain activation -
  documented, not found in this module's source, listed as G4. Each is a later pass, not a decision that it does not matter.
---

# White Labeling - domain map

> Refresh with `/qa-domain-map wl`. This file answers **what the feature is and where its surfaces are**. It does
> **not** carry behavioural rules - those are `BL-*` (`npm run bl:extract -- --domain wl`) - and it can **never
> ground an assertion as `{DOC}`**. Pointer index plus surface inventory.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source THIS pass (the basis is named: *live 2026-11-27* / *source module@3.1008.0* / *source vc-frontend checkout*) · `DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented or expected, does not exist · `UNVERIFIED` = not established by this pass and **not** to be treated as true (a `kb` id after it means another session observed it, not this one).

## §1 - Purpose and value chain

**Purpose (a published statement exists, `PlatformUserGuide`):** "The **White Labeling** module enables organizations to enhance the enterprise user experience by customizing branding elements such as logos, favicons, colors, and footer links based on the logged-in organization context." - https://docs.virtocommerce.org/platform/user-guide/white-labeling/overview. Verdict: purpose statement `CONFIRMED` present. The same guide does not say what *colors* are in the data model (there is no colour field - D13) and the `StorefrontUserGuide` query returned no white-labeling page, only the Company-info logo block (https://docs.virtocommerce.org/storefront/user-guide/account/company-info) - `UNVERIFIED` that none exists, one query was made. Chain below is **reconstructed from source + live and is the first written statement of it**, to be cited against rather than treated as authority.

| # | Link, in the customer's words | Mechanism | Verdict |
|---|---|---|---|
| 1 | A record is authored for ONE store or ONE organization | `WhiteLabelingSetting` row: `isEnabled`, `storeId` XOR `organizationId`, `logoUrl`, `secondaryLogoUrl`, `faviconUrl`, `themePresetName`, `mainMenuLinkListName`, `footerLinkListName`, `userId` (no UI, unused by the resolver). Created by: AngularJS blade Save, Admin Shell blade Save, REST `POST /api/white-labeling`, and xAPI `changeOrganizationLogo` (creates an org record with `IsEnabled = true` when none is *enabled*). No other path. | `CONFIRMED` (source module@3.1008.0; swagger live 2026-11-27) |
| 2 | An image is uploaded | Back office writes the file to the content folder `/customization` (favicon: `/customization/favicons`) and stores its URL; the storefront Company-logo picker uploads to FileUpload scope `organization-logos` and the mutation stores `/api/files/<id>`. The Shell also shows a free-text URL box under each image. | `CONFIRMED` (source: Shell `details.vue`, `ChangeOrganizationLogoCommandHandler`); upload itself not performed (read-only) |
| 3 | Favicon sizes are generated (ASYNC hop) | `favicons[]` in xAPI is computed from `faviconUrl` with a hard-coded list `16x16, 32x32, 96x96, 128x128, 196x196` the moment `faviconUrl` is non-empty; the files `<name>_<size>.<ext>` exist only if an ImageTools thumbnail task on the favicons folder generated them (a job / event, not the request). In the window before they exist - and for ever when the job is off - xAPI advertises hrefs that 404 and the storefront requests only those hrefs. | `CONFIRMED` (source: handler `_faviconsSizes`, `AddFaviconsAsync`; live: storefront query never requests `faviconUrl`, 2026-11-27) · the 404 outcome `UNVERIFIED` (KB-D4EEDC37, observed 2026-11-26 by another session) |
| 4 | The store master switch decides whether any of it is fetched | store setting `WhiteLabeling.WhiteLabelingEnabled` (Boolean, default `true`, `IsPublic`, registered for type `Store`): when false the storefront's `useWhiteLabeling` returns early and applies nothing, org branding included. The per-record `isEnabled` is a different, lower switch (link 5). | `CONFIRMED` (source vc-frontend checkout + module@3.1008.0) · live toggle effect `UNVERIFIED` (KB-6C0AA08A, 2026-11-26) |
| 5 | The merged branding is resolved for this visitor | storefront `GetPageContext(domain, userId, [organizationId])` -> `pageContext.whiteLabelingSettings` -> handler: enabled org record + enabled store record, merged per field, org value wins when non-empty; `null` when neither exists. A guest has no `organizationId`, so a guest gets the STORE record. Link lists are resolved by name through the content `GetMenu`; an empty/unknown name -> `[]`. | `CONFIRMED` (live: request body captured as guest; source handler) |
| 6 | The surfaces render | header logo (desktop, mobile, bottom header, secure-layout), footer secondary logo + link-list columns, main menu (non-empty `mainMenuLinks` REPLACES the catalog menu), favicon `<link>`s, theme preset, JSON-LD brand logo. Org buyer self-service: Company info -> Company logo -> `changeOrganizationLogo`. | `CONFIRMED` (source vc-frontend checkout); guest header logo + footer columns `CONFIRMED` (live 2026-11-27) |
| 7 | The effect is reversed or taken away | **Asymmetric.** No REST DELETE and no xAPI delete (swagger lists 5 operations). Per image: sub-blade **Clear** (toolbar `CONFIRMED` live; "nulls the URL, then Save" `UNVERIFIED` here - KB-6102AC5A and the orchestrator's source read of 2026-11-27). Per record: only the `isEnabled` toggle removes its contribution. Storefront delete-logo sends `logoUrl: ""` -> handler sets `LogoUrl = null`; the uploaded file is NOT deleted (`DeleteLogoUrlFile` is a no-op). Deleting an organization leaves its record behind (KB-52D2F554). | `CONFIRMED` (swagger live; source handler) · org-delete orphan `UNVERIFIED` (KB-52D2F554, and two orphan org records are known from `regression/releases/sprint-26-23/waves/WX/report.md`) |

**The async hop is link 3 only** (thumbnail generation). Everything else is read-through on each page-context call; whether the result is cached is `UNVERIFIED` (FWL-067 asks, nobody has answered).

**Variants - two rows when they share a link but not a code path:**

| Variant | Differs how | Verdict |
|---|---|---|
| Store record vs organization record | store applies to every visitor of the store (guests included); org applies only to signed-in members in that org context | `CONFIRMED` (live: guest sees store logo; source) |
| Logo vs secondary logo vs favicon | logo = header, secondary = footer, favicon = master URL + derived `favicons[]`; each has its own `IsOrganization*Uploaded` flag in the answer | `CONFIRMED` (source) |
| Main menu vs footer list | footer alone has the legacy org fallback `footer-{organization.Name}` in the module and a storefront fallback to a list named `footer-links`; main menu has neither at module level (storefront falls back to the catalog menu) | `CONFIRMED` (source module + vc-frontend) |
| Back-office write vs storefront write | back office writes any field through the REST/blade validator (store XOR org, no duplicates, binding immutable); the storefront mutation writes only `logoUrl` and does NOT run that validator (see D12) | `CONFIRMED` (source) |

**Sibling path with a guard the other lacks (defect hypothesis, source-only, NOT observed):** REST create runs `WhiteLabelingSettingValidator` (`duplicate-store-or-organization`); `changeOrganizationLogo` looks its record up with `IsEnabled = true` and creates a fresh one when it finds none, never calling the validator. For an organization whose record exists but is **disabled** that reads as a second record for the same organization. Needs a mutation - see G5.

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| Platform administrator (`WhiteLabeling:read/create/update`) | author store and org records in either admin UI, via REST; set the global/store settings | `CONFIRMED` (live as admin; swagger security scopes). `WhiteLabeling:delete` is registered by the module and no endpoint uses it |
| Guest | sees the STORE record's branding (logo, menu, footer, preset) when the store has an enabled record and the master switch is on | `CONFIRMED` (live 2026-11-27, B2B-store) |
| Organization member | sees the merged org + store branding in that org context | `UNVERIFIED` by this pass (KB-A23A4A41, multiple sessions, last 2026-11-26) - only an org WITHOUT a record was walked live here |
| Organization maintainer / editor | Company info -> Company logo block (upload / delete own org logo) | `CONFIRMED` block present for the signed-in test buyer (live 2026-11-27, read only); which role holds the permission `UNVERIFIED` (G2) |
| Multi-org user | active organization decides the branding; switch re-resolves | `UNVERIFIED` (KB-A23A4A41, 2026-11-19) |
| Vendor / plain contact | no White labeling widget on the blade | `CONFIRMED` (live: vendor "Amstel" blade, no widget; source: widget registered on `storeDetail` + `organizationDetail2` only) |

## §2 - Surface inventory

### 2a - Back office, AngularJS admin (`BACK_URL`, classic workspace)

| Surface | Address and what it holds | Verdict |
|---|---|---|
| Store entry | Stores -> `<store>` blade -> widget **White labeling** (in the widget grid, after "Page Builder", before "Loyalty settings") | `CONFIRMED` live 2026-11-27 |
| Organization entry | Contacts -> row three-dots menu -> **Manage** -> organization blade -> widget **White labeling**. Not under "Customer > Organizations" and not under "Members" | `CONFIRMED` live 2026-11-27 |
| Blade fields | **Enabled** toggle · **Logo** widget · **Favicon** widget · **Theme preset name** (select + pencil that opens the global dictionary editor) · **Main menu link list** (text) · **Footer link list** (text, placeholder "Enter footer link list name...") | `CONFIRMED` live |
| Blade toolbar | **Save only** (disabled until a change), for store and organization alike. The organization blade BEHIND it has Save + Reset for the *contact* - not for white labeling | `CONFIRMED` live |
| Logo sub-blade ("White labeling logo") | toolbar **Save, Reset, Clear**; two drop zones - "Choose logo" and "Choose secondary logo", each hint "Select a PNG, GIF, or SVG image"; preview. Secondary logo exists at STORE level too | `CONFIRMED` live |
| Favicon sub-blade ("White labeling favicon") | toolbar **Save, Reset, Clear** (Clear greyed while empty); hint "Select a PNG, JPG, or WEBP image"; deployed script accepts `jpeg` as well | `CONFIRMED` live (hint, toolbar) · `jpeg` `UNVERIFIED` here (KB-6102AC5A) |
| Default of a record that does not exist | store "Test Store - Full" and organization "(parentheses) Lone Star Outfitters" open with **Enabled OFF** and every field empty; B2B-store and organization `"Quoted" Double Quotes` open ON with data (store: logo + preset Mercury + `catalog-menu` + `footer-links`; org: logo + favicon + Purple Pink, no menus) | `CONFIRMED` live. Whether Lone Star has NO record or a DISABLED one is indistinguishable here (G3) |
| Hidden / absent | no Home-dashboard tile (module registers no dashboard widget; none among the Home tiles seen); no per-user branding field (`userId` exists in the model, no control); no secondary-logo or favicon URL text box (upload only) | `CONFIRMED` (live tiles; source `module.js`) |
| NOT manageable from here | deleting a record · per-user records · the store master switch (it is a store *setting*: Stores -> store -> Settings widget -> "White Labeling > General", documented in `PlatformUserGuide` settings) · link-list contents (Content module) · thumbnail generation (Settings > Thumbnail, ImageTools) · the theme preset FILES (theme build) · custom domain | `CONFIRMED` (live absence + source); master-switch path `UNVERIFIED` live here |

### 2b - Back office, Admin Shell (`ADMIN_SHELL_URL`, `/apps/admin-shell/`)

| Surface | Address and what it holds | Verdict |
|---|---|---|
| Store entry | Stores -> `B2B-store` -> toolbar chevron **More widgets** -> **White labeling** (opens a second blade; NOT in the primary widget strip, which shows Settings, SEO, Dynamic properties, Authentication, Notifications) | `CONFIRMED` live 2026-11-27 |
| One blade, no sub-blades | card **General**: Enabled switch, **Theme preset** (select with clear x), **Main menu link list**, **Footer link list** · card **Logos** (titled "Images" in source): **Logo**, **Secondary logo** (inline, side by side), **Favicon**, each an upload zone WITH a free-text URL box under it | `CONFIRMED` live (and source `pages/details.vue`) |
| Toolbar | **Save**, **Reset** (reverts unsaved edits). No Clear. A cleared text field is saved as `null` | `CONFIRMED` live (toolbar) · null-on-save `CONFIRMED` source |
| Accepted types | Logo / secondary: `.png,.gif,.svg`; favicon: `.png,.jpg,.jpeg,.webp` (the `accept` attribute) | `CONFIRMED` source (`details.vue`); a rejected pick not exercised |
| Organization entry | source registers the same widget for blade `CustomerOrganizationDetails`; the organization detail blade was **not located** live (clicking an organization row opens its members, not its detail) | source `CONFIRMED` · live `UNVERIFIED` (G1) |
| Hidden / absent | no top-level menu entry (global search for "white labeling" returns only two SETTINGS: "White labeling enabled" and "Theme preset name", group WhiteLabeling > General); no dashboard widget (the Home dashboard's 11 widgets include none); no edit pencil for the preset dictionary on the blade | `CONFIRMED` live |
| NOT manageable from here | same list as 2a, plus **Clear** as a distinct action | `CONFIRMED` |

### 2c - Storefront (`FRONT_URL`, vc-frontend theme 2.63.0)

| Surface | What it does | Verdict |
|---|---|---|
| Header logo (desktop `vc-header`, `bottom-header`, `mobile-header`) and the sign-in layout's `secure-layout` logo | `logoUrl` from the resolved record, else theme `logo_image` | `CONFIRMED` source · guest header logo = store logo `CONFIRMED` live |
| Mobile main-menu drawer logo | not the same source as the header bar | `UNVERIFIED` (KB-999E69A4, 2026-11-26) |
| Footer | secondary logo (else theme `logo_inverted_image`) + link-list columns: white-labeling `footerLinks` when non-empty, else the store `footer-links` list. A top-level entry renders as a **non-clickable section header**, only children are links | `CONFIRMED` live (columns on B2B-store: "Account details", "About us", ... each with child links) · non-clickable header `UNVERIFIED` here (KB-E7DF9B84) |
| Main menu | non-empty white-labeling `mainMenuLinks` replaces the catalog menu; else the `CatalogMenuLinkListName` list; else category menu | `CONFIRMED` source (`useNavigations.ts`); guest sees `catalog-menu` entries `CONFIRMED` live |
| Favicon | `favicons[]` hrefs only (`faviconUrl` is not requested); an empty list -> the default `index.html` favicon; the PWA manifest is not updated | `CONFIRMED` source (`App.vue`) + live (the page-context query selects `favicons` and not `faviconUrl`) |
| Theme preset | `themePresetName` -> lower-cased, spaces to `-` -> preset file; unresolvable name -> the bundled `settings_data.json` `current` preset (NOT the store's preset); a thrown "Missing preset" if neither resolves | `CONFIRMED` source (`useThemeContext.ts`, `presetNameToFileName`) |
| Company info -> **Company logo** | block for a logged-in org buyer: "The files available for upload are in JPG, PNG formats. Each file should not exceed 4.8MB. Maximum 1 files allowed." Upload then Save -> `changeOrganizationLogo`; Delete is enabled only when `isOrganizationLogoUploaded` | `CONFIRMED` live (block + text, read only, as an organization buyer) · button gating `CONFIRMED` source |
| JSON-LD organization markup | brand logo = white-labeling logo unless it is the buyer's own organization logo | `CONFIRMED` source (`useBrandProfile.ts`); not observed |
| Request | `GetPageContext(userId, organizationId, domain, storeId, permalink, cultureName)` -> `whiteLabelingSettings { logoUrl secondaryLogoUrl themePresetName isOrganizationLogoUploaded favicons mainMenuLinks footerLinks }`. As a guest the live call carried `domain` and `userId: ""` only | `CONFIRMED` live 2026-11-27 |
| NOT manageable from here | everything except the organization logo: no theme, menu, footer, favicon, enable toggle or store logo control exists in the storefront; no way to see which record is in effect | `CONFIRMED` (live walk of Company info; source) |

### 2d - API / contract

| Surface | Address and shape | Verdict |
|---|---|---|
| REST | `GET /api/white-labeling/{id}` · `GET /api/white-labeling/organization/{organizationId}` · `GET /api/white-labeling/store/{storeId}` · `POST /api/white-labeling` (id forced null, runs the validator, 400 with failures) · `PUT /api/white-labeling` (204, validator). Scopes `WhiteLabeling:read` / `create` / `update`. Model: `isEnabled, userId, organizationId, logoUrl, secondaryLogoUrl, faviconUrl, footerLinkListName, mainMenuLinkListName, themePresetName, storeId` + audit fields. **No DELETE, no colour fields, no search endpoint** | `CONFIRMED` live (swagger `/docs/VirtoCommerce.WhiteLabeling/swagger.json`, 2026-11-27) + source |
| REST validation | exactly one of store / organization; binding cannot change on update; a new record cannot duplicate an existing store/org binding. **Nothing validates `logoUrl` / `faviconUrl` / `themePresetName` / link-list names** (a bad URL renders the image-less placeholder) | `CONFIRMED` source (validator) |
| xAPI query | `whiteLabelingSettings(organizationId, userId, storeId, domain, cultureName)` - **all five optional** in the live schema; `domain` resolves a STORE only; `userId` is accepted and unused by the resolver. Returns `userId organizationId storeId logoUrl secondaryLogoUrl faviconUrl themePresetName footerLinks mainMenuLinks favicons` + three `IsOrganization*Uploaded` booleans (the storefront selects `isOrganizationLogoUploaded`). `null` when no enabled org AND no enabled store record | `CONFIRMED` (schema header 2026-11-19 for the args; source for fields; live query for the one used field) |
| xAPI pageContext | `pageContext.whiteLabelingSettings` returns the same type in the same call as user/store/slug info | `CONFIRMED` live |
| xAPI mutation | `changeOrganizationLogo(command: InputChangeOrganizationLogoCommandType { organizationId, logoUrl })` -> `{ isSuccess, errorMessage }`; `logoUrl` must start `/api/files/`; empty clears. The only xAPI write | `CONFIRMED` (schema lists it; source) |
| Settings | `WhiteLabeling.WhiteLabelingEnabled` (store level, public, default true); `WhiteLabeling.ThemePresetNames` (platform-GLOBAL dictionary, default and only shipped value `Default`) | `CONFIRMED` source · live values `UNVERIFIED` here (KB-7EF291B3) |
| NOT manageable from here | delete a record · set theme/menu/footer/favicon via xAPI · list records · per-user branding | `CONFIRMED` (swagger, schema) |

### 2e - Other mechanisms (one-line existence notes)

| Item | Note | Verdict |
|---|---|---|
| vc-shell auth-page branding | the admin sign-in page takes logo/background by a separate route; not org-aware, not this module (carried from prior art) | `UNVERIFIED` (G10) |
| Thumbnail settings | Settings > Thumbnail > General holds "Enable image processing job" and its cron expression (found by the Shell's settings search); there is no "Settings > Jobs" | `CONFIRMED` live (names exist; the setting VALUES were not read) |
| Fixtures | `test-data/white-labeling/organizations.csv` (WL-ORG-A..D + footer-only), `users.csv`, `link-lists.csv`, `assets/`; seeded by `npm run seed:white-labeling`. Alias `WL_ELECTRONICS.id` is the CSV key `WL-ORG-A`, NOT a GUID (the GUID is `WL_ELECTRONICS_PLATFORM_ID.id`); `.logo` / `.favicon` are relative `/cms-content/...` URLs that the WX run found 404 on the storefront host | `CONFIRMED` (files read) · 404 `UNVERIFIED` here (WX report) |

## §3 - Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | **Two things both called "Enabled".** The blade toggle is the per-RECORD `isEnabled` (drops only that record's contribution; an enabled org record still resolves when the store record is off); the master switch is the store SETTING `WhiteLabeling.WhiteLabelingEnabled`, surfaced elsewhere (Settings) as "White labeling enabled". A case that says "store Enabled = OFF" is ambiguous (FWL-009). The old reference called the blade toggle "the master switch". | `CONFIRMED` source + live (the two controls exist in different places) · effect of each `UNVERIFIED` here (KB-A23A4A41, KB-6C0AA08A) |
| D2 | **Favicon: xAPI advertises, storefront ignores.** xAPI returns `faviconUrl` and five `favicons[]` hrefs whether or not those files exist; the storefront selects only `favicons`, never `faviconUrl`. So a record with a favicon and no generated thumbnails gives a tab with the default favicon. | `CONFIRMED` source + live (query selection); the 404 outcome `UNVERIFIED` (KB-D4EEDC37) |
| D3 | **Favicon sizes: module vs case.** The handler's sizes are 16/32/96/128/196; FWL-001 expects 16/32/180/192/512. The module registers no thumbnail task, so which sizes exist depends on a task configured elsewhere. | `CONFIRMED` source · case side from the WX report |
| D4 | **Admin Shell vs AngularJS: same record, different tool.** Shell: one blade, Save + Reset, secondary logo inline, URL boxes, widget under "More widgets", no preset-dictionary pencil, no Clear. AngularJS: Save-only blade, Logo/Favicon sub-blades with Save/Reset/Clear, secondary logo one level down, widget in the grid, pencil edits the global dictionary. | `CONFIRMED` live both |
| D5 | **A record that does not exist: OFF from the back office, ON from the storefront.** Both admin UIs open an absent record with Enabled OFF (first Save persists OFF); `changeOrganizationLogo` creates the record with `IsEnabled = true`. | `CONFIRMED` live (both blades) + source (handler) |
| D6 | **Wrong `organizationId` is silent.** An unknown id returns the STORE's branding, HTTP 200, no errors - not `null`. A fixture key (`WL-ORG-A`) passed in place of the GUID reads as store branding. | `CONFIRMED` source (org record null, store record returned) · live `UNVERIFIED` (KB-F98BB191, 2026-11-27 by another session) |
| D7 | **Logo vocabularies disagree for one field.** Admin Logo widget: PNG, GIF, SVG (not JPG). Storefront Company logo: JPG, PNG (not GIF/SVG), 4.8 MB. Both write `logoUrl`. The module README's example scope lists only `.png`, 10 MB. | `CONFIRMED` live (both hint texts) · README `CONFIRMED` source |
| D8 | **Guide, live and suites on "after sign-in".** Overview: branding "based on the logged-in organization context". Customizing: "Store-level white labeling, enabled via the **Stores** module, applies the brand elements to every visitor of that store." Live: a guest sees the store record's logo, menu and footer. (Docs agree with live; the SUITES do not - FWL-066 "anonymous users see default branding" on a store that has its own.) | `CONFIRMED` live (guest) |
| D9 | **Custom domain.** Guide: "If a custom domain is assigned to the organization, its branding activates on the first visit to that domain, before sign-in." Module 3.1008.0: `domain` only resolves a STORE; no organization is ever resolved from it; no `domain` field on the record. | `MISSING` in this module's source · mechanism elsewhere `UNVERIFIED` (G4) |
| D10 | **Footer fallback, three places.** Guide: "An empty **Footer link list** falls back to a link list named **footer-links**." Module: an empty name on an ORG record falls back to `footer-{organization.Name}`; `footer-links` is the storefront's own fallback. Main menu: guide says "An empty **Main menu link list** falls back to the store's **Top level catalog linked list** setting, then to the menu generated automatically from catalog categories" - matches `useNavigations.ts`. | `CONFIRMED` source (module + vc-frontend); guide's footer sentence true only of the storefront half |
| D11 | **Preset names: three sets that do not match.** Guide `managing-themes` lists purple-pink, black-gold, watermelon, **ocean, peach**, coffee, red. vc-frontend checkout bundles black-gold, coffee, default, mercury, paprika, purple-pink, red, watermelon (no ocean, no peach; `paprika` is in no list). The module's dictionary ships `Default` only; the others are rows someone typed (KB-7EF291B3: `Default, Mercury, red, Watermelon, Coffee, black-gold, Purple Pink`). Nothing validates a stored name. | `CONFIRMED` source (checkout folder, module constants) · docs list quoted from the fetched guide · live dictionary `UNVERIFIED` here |
| D12 | **Two writers, two validators.** REST/blade enforce store-XOR-org, immutable binding, no duplicates; `changeOrganizationLogo` bypasses the validator and only finds an *enabled* record. See §1, hypothesis. | `CONFIRMED` source · outcome `UNVERIFIED` (G5) |
| D13 | **"Colors" in the guides, no colour in the model.** Overview and Customizing say organizations get their own "colors"; the record has `themePresetName` and nothing else; the old reference's REST `primaryColor` / `secondaryColor` do not exist (swagger). The developer guide's `WhiteLabelingSettingsType` Fields table lists `userId, organizationId, storeId, logoUrl, secondaryLogoUrl, faviconUrl, themePresetName, footerLinks, favicons` - **no `mainMenuLinks`, no `IsOrganization*Uploaded`** - while the live query selects both. | `CONFIRMED` swagger + fetched table + live query |
| D14 | **Dashboard widget.** Case WL-001 ("Locate the White Labeling widget on the dashboard") has no counterpart in either UI. | `MISSING` (live: Angular Home tiles, Shell Home 11 widgets; source `module.js`) |
| D15 | **An unresolvable org preset falls back to the bundled default, not to the store's.** The storefront renders the bundled `current` preset. Where the store's preset IS the default (Mercury), the two are indistinguishable - an earlier observation of "falls back to the store's palette" (BMW-Group, KB-A23A4A41 2026-11-19) is consistent with BOTH readings. | `CONFIRMED` source · observation ambiguity `CONFIRMED` by reading |
| D16 | **Delete-logo wording.** Storefront guide: "Deleting the newly uploaded logo restores the default logo". Handler: delete sets the org `logoUrl` to null, so the STORE logo (when the store has one) takes over, the theme default only when neither does. | `CONFIRMED` source · live `UNVERIFIED` |

## §4 - Coverage shape

**Basis:** `config/test-suites.json` (`testCount`, `requiresModules`, `envRiskGate`) and the three CSVs parsed with a CSV reader on 2026-11-27 (`Automation_Status`, `Section`, `Title`); `npm run regression:plan -- whitelabeling` for the group; `grep` over `regression/suites/**` for the zero-coverage rows. Nothing was re-reviewed case by case.

| Suite | Cases | Status split | Notes |
|---|---|---|---|
| 067 Whitelabeling Admin (Backend) | **40** (manifest says 40) | 33 `Manual`, 7 `Deprecated` | the 7 (WL-029..035) are **deliberate**: moved to 070/071 as FWL-021... · `requiresModules: [whitelabeling]`, `envRiskGate: staging` |
| 070 Whitelabeling Storefront | **51** (manifest 51) | 48 `Manual`, 3 `Draft` (FWL-001/003/009) | 22 of 51 on cross-cutting dimensions (Accessibility 6, Performance 6, Responsive Mobile 5, Cross-Browser 3, Cross-Browser Mobile 2) |
| 071 Whitelabeling Branding | **18** (manifest 18) | 16 `Manual`, 1 `Draft` (FWL-004), 1 `Automated` (FWL-069, a build-time design check with no white-labeling content) | |
| **Whole feature** | **109** across 3 suites | 97 `Manual`, 4 `Draft`, 7 `Deprecated`, 1 `Automated` (not WL) | the `whitelabeling` selection (`tag: whitelabeling`) resolves to exactly these 3 suites / 109 cases, 76 min |

**Existing coverage elsewhere that genuinely belongs** (all `Automated`): `BSM-060` and `BSM-061` in 078d (admin smoke: the White labeling blade opens; the org override section) · `XFE-GQL-057` in 050e (pageContext organization-scoped white labeling) · `B2C-ORG-011` in 006 is `Manual` (org switch updates branding). Text mentions of white labeling also sit in 027-customer-orgs-invites (16), 123-site-builder (12), 027b (9), 050f (4), 008 (3), 032 (3), 048c (1) - an **unfiltered grep count that includes false positives** (e.g. the alias `WL_GA4_SELECT_ITEM` in 043 is not this feature); it is not a count of relevant cases.

**What has actually run:** WXE skipped FWL-001/003/004/009 (`Manual`); WXM flipped them to `Draft` and ran them live on 2026-11-26: FWL-001 BLOCKED (stale credential for the fixture account), FWL-003 FAIL, FWL-009 FAIL, FWL-004 FAIL at step 18 - all four *test defects or a pending product decision*, none promoted. Rewrite is routed to `/qa-test-lifecycle` per the WX report. Executability: 067 is the only suite with `requiresModules`; 070/071 declare none, so a stand without the module would still plan them (consequence `UNVERIFIED`).

**Zero / near-zero coverage - hole or deliberate:**

| Area | Count | Verdict |
|---|---|---|
| REST `/api/white-labeling/*` (any of the 5 operations) | **0** suites mention the path | **hole** |
| Admin Shell white-labeling blade | **0** | **hole** (the Shell is the newer admin) |
| Storefront Company logo / `changeOrganizationLogo` | **0** suites mention either; FWL-061..064 target the admin widget, not this path | **hole** |
| Per-image Clear / Reset (sub-blade) | WL-006/007 name Reset/Clear "branding" at settings level, which does not exist at that level | **hole** + stale case |
| Custom domain | **0** | hole, but the mechanism itself is unlocated (G4) |
| Permissions `WhiteLabeling:*` | **0** | hole |
| `WhiteLabeling.WhiteLabelingEnabled` master switch | WL-012/013 (`Manual`), FWL-009 (`Draft`, FAIL, ambiguous step 3) | covered on paper, **never passed live** |
| Disabled-record / unknown-id resolution (D5, D6) | WL-014 only for the store-record side | partial |
| Favicons chain | FWL-001/003/004/WL-005/015 | covered on paper, **blocked or failing for a product-decision reason** (D2/D3) |

**Over-covered relative to risk:** 22 cross-cutting rows (a11y / perf / responsive / cross-browser) against **0** rows on the only write path a buyer has (Company logo) and **0** on the REST contract. 
**Case-vs-build conflicts seen while counting (route to `/qa-review-tests`, not fixed here):** FWL-061 expects a JPEG logo accepted by the admin widget (Logo widget is PNG/GIF/SVG, D7); FWL-062 expects GIF rejected (accepted); FWL-064 expects ICO favicon accepted (PNG/JPG/WEBP only); FWL-066 "anonymous users see default branding" (D8); WL-001 (D14); WL-006/007 (above). Fixtures named by the cases (`Org Without Branding`, `Branded Org`, `Company1`, link lists `org-footer-links` / `org-main-menu`) do not exist (WX report).

## §5 - Open gaps

| # | Gap | State |
|---|---|---|
| G1 | Admin Shell organization White-labeling blade not opened live (source targets `CustomerOrganizationDetails`) | **OPEN** - needs the Shell's organization detail route (row click opens members; try the row's actions menu); read-only |
| G2 | Which role may use Company logo / `changeOrganizationLogo`, and what `OrganizationLogoAuthorizationHandler` checks | **OPEN** - needs that handler read at source plus a maintainer-vs-employee sign-in on an org that is not `AGENT-TEST-*` |
| G3 | Absent record vs disabled record is indistinguishable in both blades | **OPEN** - needs `GET /api/white-labeling/organization/{id}` with an admin token (read-only; not done because the lane has no sanctioned token path and `evaluate` is blocked) |
| G4 | Custom-domain activation: documented, not in this module; where it lives and its effect on `whiteLabelingSettings` | **OPEN** - needs a source search of Customer / Xapi modules and a live domain binding (a mutation) |
| G5 | `changeOrganizationLogo` duplicate-record hypothesis | **OPEN** - needs the mutation, run as a maintainer of a disposable organization whose record is `isEnabled=false`, then the org-keyed GET; and the DB constraint read |
| G6 | xAPI link-list order (descending priority, KB-3239DE5F) and the unknown-id answer when the store has NO enabled record | **OPEN** - needs a read-only xAPI call with a token |
| G7 | Old claim "missing `storeId` -> HTTP 200 + `errors[]`": source suggests the store is resolved from `domain` and otherwise an org-only search | **OPEN** - needs one xAPI read without `storeId` and `domain` |
| G8 | Favicon chain end to end: value of `ImageTools.Thumbnails.EnableImageProcessJob`, the task on `/customization/favicons`, files actually produced | **OPEN** - needs the Thumbnail > General values read, then (mutation) the job enabled and a favicon saved on a disposable org |
| G9 | Org switch dynamics (stale links, FOUC), cache behaviour (FWL-067), mobile drawer logo | **OPEN** - needs a multi-org account (fixture `WL_USER_MULTI` was not tried; the WX report calls its sibling stale) and throttling |
| G10 | vc-shell auth-page branding mechanism | **OPEN** - needs a signed-out lane on the admin sign-in page |
| G11 | DB column / migration facts from VCST-4637 (PR #21, `MainMenuLinkListName varchar(256)`) | **OPEN** - needs `Data` migrations read at tag 3.1008.0 (not read this pass) |
| G12 | Admin Shell: how an image is cleared, whether the preset dictionary is editable (Settings group WhiteLabeling > General) | **OPEN** - needs interaction without Save |
| G13 | Roles holding `WhiteLabeling:create/read/update/delete`; why `delete` is registered with no endpoint | **OPEN** - needs Security > Roles read |
| G14 | Whether `GetPageContext` / xAPI results are cached and when a Save reaches the storefront | **OPEN** - needs a Save on a disposable store record and a timed re-read |

## §6 - Prior-art verdicts (the pre-rev-1 "White Labeling - Agent Reference")

| Claim | Verdict |
|---|---|
| "Per-org and per-store branding customization applied after sign-in" | **DRIFT (partial)** - org branding applies after sign-in; store branding applies to guests too (live) |
| Two enable layers: store master switch (setting) + record `IsEnabled` | `CONFIRMED` (source; live effect KB-6C0AA08A) |
| Records merged per field, org-preferred; no user-level override | `CONFIRMED` (source) |
| `logoUrl` Store/Org, header logo | `CONFIRMED` |
| `secondaryLogoUrl` is **Org** only | **DRIFT** - store blades have a secondary logo too (live, both UIs; model has no restriction) |
| `faviconUrl` "single favicon URL (legacy)" | **DRIFT** - the guide calls it the "master favicon", it drives `favicons[]` |
| `favicons[]` "requires the thumbnail job"; "Settings -> Jobs" | **DRIFT** - the array is emitted whenever `faviconUrl` is set (5 fixed sizes); only the FILES need the job; there is no Settings > Jobs (it is Settings > Thumbnail > General) |
| `themePresetName` "case-sensitive: `Coffee` != `coffee`" (Known Gotchas) | **DRIFT** - the storefront lower-cases and hyphenates the name; the old file contradicted itself (its own preset note said `Purple Pink` == `purple-pink`) |
| Presets such as `safco` | `UNVERIFIED` - not in the module dictionary, not in the bundle |
| Store admin: "Toggle Enabled - this is the master switch" | **DRIFT** - per-record toggle; master switch is a setting |
| "Members -> Organizations -> select org -> White Labeling blade" | **DRIFT** - Contacts -> row menu -> Manage -> widget |
| Footer / main menu lists "from Marketing -> Link Lists"; also "Content > Store > Link Lists" | **DRIFT** - the guide says the Content module; both older paths in one file contradicted each other; live not walked |
| "Org Enabled OFF -> falls back to store-level branding" | `CONFIRMED` (source) |
| Query "organizationId + storeId required; userId + cultureName optional" | **DRIFT** - all five args are optional, and `domain` exists |
| "Invalid `organizationId` -> returns `null` fields" | **DRIFT** - returns the store's branding (null only when no enabled record at all) |
| "Missing `storeId` -> HTTP 200 with `errors[]`" | `UNVERIFIED` (G7; source points the other way) |
| `changeOrganizationLogo` shape, `/api/files/<id>` | `CONFIRMED` (source, schema) |
| `pageContext.whiteLabelingSettings` replaces "4 separate queries", 200-400 ms | shape `CONFIRMED` live; count and timing `UNVERIFIED` |
| REST `GET /api/whitelabeling/settings`, `POST /api/whitelabeling/logo`, `primaryColor` / `secondaryColor` | **DRIFT** - the real REST is `/api/white-labeling...`, 5 operations, no colours; the old endpoints are **MISSING** |
| DB table `WhiteLabelingSettings`, `MainMenuLinkListName varchar(256)`, PR #21 | `UNVERIFIED` (G11) |
| Suites 067 = WL-001..040, 070, 071 | `CONFIRMED` (counts re-derived, section 4) |
| "FWL-009: Store-level WL = OFF -> master switch disables everything" | **DRIFT** as phrased - ambiguous across D1 |
| "Theme preset list is store-managed" (Related Modules) | **DRIFT** - a platform-global dictionary (the old file's own seed note said so) |
| "Logo/favicon URLs are file IDs from `/api/files`" | **DRIFT** - back-office uploads are content-folder URLs under `/customization`; only the storefront mutation uses `/api/files/<id>` |
| "Cache purge may be needed; FOUC; logo caching" | `UNVERIFIED` (G9, G14) |
| Seed notes (theme-preset dictionary seeded additively by `ensureThemePresetNames()` in `scripts/lib/seed-common.mjs`; `stores.csv` preset applied by a GET-merge-PUT because **PUT replaces the record**; generated list `scripts/lib/theme-presets.generated.json`; logic `scripts/seed-data/store/theme-preset-specs.mjs`) | `UNVERIFIED` this pass (files exist; behaviour not re-run) - kept because they are the only record of why the seeder is shaped so |

**Resolves from the old file's own open items:** the master-switch ambiguity (D1) and the null-on-unknown-org claim (D6). **Still open:** everything in section 5.

## §7 - Amendments

*(none - rev 1.)* Observed-behaviour entries relied on, by id, none of them observed by this pass unless the claim above says "live 2026-11-27": KB-6102AC5A (re-observed: hints and Logo/Favicon toolbars), KB-E3A57C54 (disputed by another session; the top-level Save-only part re-observed), KB-3BFAF6CC, KB-F98BB191, KB-28A6F067 (re-observed in part: Lone Star opens OFF), KB-A23A4A41, KB-6C0AA08A, KB-D4EEDC37, KB-7EF291B3, KB-52D2F554, KB-E7DF9B84, KB-999E69A4, KB-5BC4EC37 (re-observed: Company-logo block text), KB-3239DE5F, KB-1C18DC2F (source re-read). Captured by this pass: KB-595C7FF0 (Admin Shell blade, observed), KB-753BEB16 (GetPageContext selection and guest branding, observed), KB-FC2150C5 (`changeOrganizationLogo` record lookup, source, suspected defect).

| Date | By | What moved |
|---|---|---|
| 2026-11-27 | QA lead (stated in chat, not observed) | The header Organizations switcher is meant to be visible only to users who belong to more than one organization (UNVERIFIED, SPEC); the multi-organization account WL_USER_MULTI is the only one that should show it. Also: VCST-6288 is Done and its fix (vc-frontend#2612) is in theme 2.63.0. |
