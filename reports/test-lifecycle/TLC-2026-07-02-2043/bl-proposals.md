# Business Logic Proposals — TLC-2026-07-02-2043 (White Labeling)

> **STATUS 2026-07-02: PROMOTED + CORRECTED.** All six entries were approved and are now formal in
> `business-logic.md` **Domain 19 (BL-WL-001..006)**; `BL-B2B-006` was reconciled to point at them.
> **BL-WL-003 was corrected after promotion:** the store **master switch** `WhiteLabeling.WhiteLabelingEnabled`
> (store-level public setting, storefront-enforced in `useWhiteLabeling.ts`) IS real and DOES suppress org
> branding when OFF — the "OPEN DISCREPANCY" note below was resolved as a **two-layer** model (master switch
> vs per-record `IsEnabled`). See `business-logic.md` for the authoritative text; the draft below is historical.

These were **drafts**. The authoritative promoted text now lives in `.claude/agents/knowledge/oracles/business-logic.md`.
Per `feedback_business_logic_promotion`, each entry needs explicit per-entry approval before promotion.
`BL-WL-001..004` are already used *by convention* across suites 067/070/071 but are not yet formal.

**Sources checked:** VirtoOZ `PlatformUserGuide` (White Labeling module) + `PlatformBackendSourceCode`
(`vc-module-white-labeling` — `GetWhiteLabelingSettingsQueryHandler.cs`, `ExpWhiteLabelingSetting.cs`,
`en.WhiteLabeling.json`). `mainMenuLinks` is NOT yet in the public docs (newer than the doc set) —
grounded here on source + the live-verified vcst-qa response.

---

## New Invariants Proposed

### PROPOSED-BL-WL-001: Branding is org-context, post-auth; empty config → platform defaults `[P2-ux]`
- **Rule:** White Labeling branding resolves from the logged-in user's organization context after authentication. If no *enabled* WL setting exists for either the org or the store, the query returns null and the storefront shows platform/theme defaults (no crash, no partial branding).
- **Verify:** `whiteLabelingSettings(organizationId, storeId)` for an org/store with no enabled settings → null/empty; storefront renders default logo/theme.
- **Violation signal:** Error, blank header, or stale branding when no WL config exists.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** PlatformUserGuide White Labeling overview ("Resolve branding based on the organization context after user authentication"); handler `Handle()` → `return null` when `OrganizationSetting == null && StoreSetting == null`.
- **Triggered by:** WL-012, WL-013, WL-036–039

### PROPOSED-BL-WL-002: Per-field org-over-store merge (NOT whole-object override) `[P1-data]`
- **Rule:** Org and store settings are merged **field by field**. For each of `logoUrl`, `secondaryLogoUrl`, `faviconUrl`, `themePresetName`, `footerLinkListName`, `mainMenuLinkListName`, the org value is used when non-empty, otherwise the store value is used. It is NOT a whole-object override — an org that sets only a logo still inherits the store's theme/footer/menu.
- **Verify:** Configure org with logo only + store with theme+footer; query → response has org logo AND store theme + store footer.
- **Violation signal:** Setting one org field blanks out other (store-provided) fields; or org fields ignored entirely.
- **Agents:** qa-backend-expert
- **Source:** `GetCombinedWhiteLabelingSetting()` — per-field ternaries `!IsNullOrEmpty(org.X) ? org.X : store.X` and `organizationFlags.HasLogo/HasFavicon` picks.
- **Triggered by:** WL-011, WL-021 · **⚠ corrects** the local `white-labeling.md` wording "org-level settings override store-level" which reads as whole-object.

### PROPOSED-BL-WL-003: Each level independently gated by its own Enabled flag `[P1-data]`
- **Rule:** Only settings with `IsEnabled = true` participate in the merge (the search filters `IsEnabled = true`). A disabled level is excluded from resolution. Store `Enabled = OFF` removes the *store-level* contribution; store settings with `Enabled = ON` contribute.
- **Verify:** Toggle store WL Enabled OFF → store-level branding drops from the merged result.
- **Violation signal:** Disabled-level branding still applied; enabled-level branding missing.
- **Agents:** qa-backend-expert
- **Source:** `GetWhiteLabelingSettingAsync()` → `searchCriteria.IsEnabled = true`.
- **Triggered by:** WL-012, WL-013, WL-014
- **⚠ OPEN DISCREPANCY (needs decision):** The handler searches org and store settings *independently*, both filtered by `IsEnabled`. So **store `Enabled=OFF` does NOT disable an org whose own WL is enabled** — the org settings still resolve. This contradicts the local `white-labeling.md` claim *"store-level OFF = master switch disables all WL including org overrides"* and the current WL-012/WL-014 expected results. Either (a) there is a higher storefront gate not in this handler, or (b) the knowledge file + WL-012/014 are wrong. **Recommend a live test before promoting the "master switch" wording.**

### PROPOSED-BL-WL-004: Link lists resolve by name; missing → empty array, no error; footer legacy fallback `[P2-ux]`
- **Rule:** `mainMenuLinks` resolves the link list named in `MainMenuLinkListName`; `footerLinks` resolves `FooterLinkListName`. A NULL/empty/non-existent name yields an **empty array** with HTTP 200 and no `errors[]`. Footer (only) additionally falls back to a `footer-{organizationName}` list when `FooterLinkListName` is empty (backward compat); main menu has **no** such fallback. Querying without `mainMenuLinks` in the selection set stays valid (optional field).
- **Verify:** org with NULL MainMenuLinkListName → `mainMenuLinks: []`, no error; org with empty FooterLinkListName but a `footer-<orgname>` list → footer resolves.
- **Violation signal:** Error/500 on missing list; main-menu resolving a `main-menu-{org}` fallback that doesn't exist in code.
- **Agents:** qa-backend-expert
- **Source:** `AddMainMenuLinksAsync()` / `AddFooterLinksAsync()` (footer `footer-{organization.Name}` branch); `ExpWhiteLabelingSetting` lists default to `[]`.
- **Triggered by:** WL-010, WL-019, WL-020, WL-022, WL-040

---

## Additional candidates discovered in source (optional — not yet used by any suite)

### PROPOSED-BL-WL-005: A WL setting binds to exactly one of Store XOR Organization `[P2-ux]`
- **Rule:** A WhiteLabeling setting must reference exactly one of Store or Organization — not both, not neither. Admin blade rejects "Both Store and Organization set" and "Store or Organization must be set", and blocks duplicates.
- **Source:** `en.WhiteLabeling.json` errors: `store-and-organization-set`, `store-or-organization-must-be-set`, `duplicate-store-or-organization`.

### PROPOSED-BL-WL-006: Distinct allowed upload types for logo vs favicon `[P2-ux]`
- **Rule:** **Logo** accepts **PNG / GIF / SVG**. **Favicon** accepts **PNG / JPG / WEBP**. Other extensions are rejected with a filetype-error dialog.
- **Source:** `en.WhiteLabeling.json` — logo hint "Select a PNG, GIF, or SVG image" + filter "Only PNG, GIF or SVG files are allowed"; favicon hint "Select a PNG, JPG, or WEBP image" + filter "Only PNG, JPG, or WEBP files are allowed".
- **⚠ corrects suite 067:** WL-003 currently claims logo allows **"PNG/SVG/JPG"** — WRONG. Logo allows GIF, not JPG. JPG is a *favicon* type. WL-003 → PNG/GIF/SVG; WL-005 (favicon) → PNG/JPG/WEBP; WL-004 (rejected ext) should use a genuinely-disallowed extension per the correct set.

---

## Source-verified corrections to apply to suite 067 (beyond the Phase-4 fix)
1. **WL-003 / WL-005 upload extensions** — clear-cut, apply now (see BL-WL-006).
2. **WL-012 / WL-014 master-switch semantics** — needs the live decision in BL-WL-003 before rewording expected results.
