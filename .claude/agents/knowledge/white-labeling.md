# White Labeling — Agent Reference

Platform knowledge for testing the Virto Commerce White Labeling module.
Includes **VCST-4637** (mainMenuLinks / MainMenuLinkListName — added Sprint 26-04).

## What It Does

Per-org and per-store branding customization applied after sign-in. Settings resolve in priority order:
**user → organization → store default**

When org-level settings exist → they override store-level. When store-level White Labeling is OFF → all custom branding is disabled (master switch).

## Configurable Fields

| Field | Level | Description |
|-------|-------|-------------|
| `logoUrl` | Store / Org | Primary logo (header) |
| `secondaryLogoUrl` | Org | Secondary logo (footer or dark variant) |
| `faviconUrl` | Store / Org | Single favicon URL (legacy) |
| `favicons[]` | Generated | Multi-size array: `rel`, `type`, `sizes`, `href` — requires thumbnail background job |
| `themePresetName` | Store / Org | Color scheme name — e.g., `coffee`, `safco`, `default` — **case-sensitive** |
| `footerLinks[]` | Store / Org | Footer nav linked to a **Link List** by name (`FooterLinkListName`) |
| `mainMenuLinks[]` | Store / Org | **NEW (VCST-4637)** — Header nav linked to a **Link List** by name (`MainMenuLinkListName`) |

Both `footerLinks` and `mainMenuLinks` use the same structure: `title`, `url`, `priority`, `childItems[]`.

## Admin UI Setup

### Store-level (Stores → select store → White Labeling blade)
1. Toggle **Enabled** ON/OFF — this is the master switch; OFF disables all WL including org overrides
2. Upload **Logo** and **Favicon** via widgets → **Save**
3. Edit **Theme preset name** → Add → paste name → select → **Save**
4. **Footer link list** — enter name of a Link List from Marketing → Link Lists
5. **Main menu link list** — **NEW (VCST-4637)** — enter name of a Link List

### Org-level (Members → Organizations → select org → White Labeling blade)
1. Toggle org **Enabled** ON/OFF — org-level toggle; OFF falls back to store-level branding
2. Same logo / favicon / theme fields as store level
3. **Footer link list** — link list name; overrides store footer when set
4. **Main menu link list** — **NEW (VCST-4637)** — link list name; overrides store main menu when set
   - Field label: "Main menu link list", placeholder: "Enter link list name..."

### Link Lists (Content > Store > Link Lists)
- Create a link list with parent items (title, url, priority)
- Add child items under parents → rendered as dropdown menu in storefront
- Reference the exact link list name in org or store White Labeling settings

## GraphQL xAPI

### Query — read settings
```graphql
{
  whiteLabelingSettings(
    organizationId: "f081c52234754c9c8229aa42d6a19220"
    storeId: "Electronics"
    cultureName: "en-US"
  ) {
    userId organizationId
    logoUrl secondaryLogoUrl
    faviconUrl
    favicons { rel type sizes href }
    themePresetName
    footerLinks {
      title url priority
      childItems { title url priority }
    }
    mainMenuLinks {
      title url priority
      childItems { title url priority }
    }
  }
}
```
- `organizationId` + `storeId` required; `userId` + `cultureName` optional
- `mainMenuLinks` is an optional field — omitting it maintains backward compatibility
- Invalid `organizationId` → returns `null` fields (HTTP 200, no error) — storefront falls back to store defaults
- Missing `storeId` → HTTP 200 with `errors[]`, not a 400

### Mutation — change organization logo
```graphql
mutation($command: InputChangeOrganizationLogoCommandType!) {
  changeOrganizationLogo(command: $command) {
    isSuccess
    errorMessage
  }
}
# Variables: { "command": { "organizationId": "...", "logoUrl": "/api/files/<id>" } }
```

### pageContext query (xFrontend — performance optimization)
Single query that returns all branding in one call instead of 4 separate queries:
```graphql
{
  pageContext {
    whiteLabelingSettings {
      logoUrl faviconUrl themePresetName
      footerLinks { title url priority childItems { title url priority } }
      mainMenuLinks { title url priority childItems { title url priority } }
    }
    store { ... }
    user { ... }
  }
}
```
Expected response time: ~200–400ms.

## REST API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/whitelabeling/settings?organizationId=` | GET | Read settings (logo, favicon, `primaryColor`, `secondaryColor`, footerLinks) |
| `POST /api/whitelabeling/logo?organizationId=` | POST multipart | Upload new logo file |

REST exposes `primaryColor` and `secondaryColor` hex fields not available in xAPI.

## Database (VCST-4637)
- Table: `WhiteLabelingSettings`
- New column: `MainMenuLinkListName varchar(256) NULL`
- Pre-existing column: `FooterLinkListName varchar(256) NULL`
- Migration applied via PR #21

## Regression Suites
- **Suite 067** — Backend: `regression/suites/Backend/whitelabeling/067-whitelabeling-admin.csv` (WL-001–WL-040)
- **Suite 070** — Frontend: `regression/suites/Frontend/whitelabeling/070-whitelabeling-storefront.csv` (FWL storefront)
- **Suite 071** — Frontend: `regression/suites/Frontend/whitelabeling/071-whitelabeling-branding.csv` (FWL branding)

## Critical Test Areas

### Priority / Override Logic
- **FWL-002**: No settings anywhere → platform defaults shown
- **FWL-003**: Store has settings, org has none → store-level branding shown
- **FWL-004**: Both store and org configured → **org overrides store** (logo, favicon, theme, main menu, footer)
- **FWL-009**: Store-level WL = OFF → master switch disables all branding regardless of org settings

### VCST-4637 — mainMenuLinks (new)
- **WL-016**: `MainMenuLinkListName` DB column exists, `varchar(256)`, nullable
- **WL-017/018**: GraphQL returns `mainMenuLinks` with hierarchy and priority order
- **WL-019/020**: NULL / non-existent link list name → empty array, no error
- **WL-021**: Org A vs Org B → no cross-contamination between orgs
- **WL-022**: `footerLinks` still works alongside `mainMenuLinks` (backward compat)
- **WL-024–027**: Admin SPA field — display, enter value, save, persist on refresh, clear
- **WL-029–031**: Storefront renders org main menu; hierarchy + dropdown behavior correct
- **WL-034–035**: Switching org updates main menu AND footer simultaneously
- **WL-036–040**: Existing logo / theme / footer / store-level WL configs unaffected

### Frontend Storefront (FWL — VCST-4637)
- **FWL-021**: 4 parent links in header, priority order, child dropdowns
- **FWL-022**: Hover dropdown — opens/closes, priority order, no flicker
- **FWL-023**: Mobile (375px) hamburger menu contains hierarchical main menu
- **FWL-024**: Navigation — clicking links routes correctly, no 404s
- **FWL-025**: Fallback when `MainMenuLinkListName = NULL` — app doesn't crash, layout intact
- **FWL-026**: GraphQL returns `mainMenuLinks` with correct hierarchy
- **FWL-027**: `pageContext` query includes `mainMenuLinks`
- **FWL-029**: Org switch → main menu updates dynamically (no stale links from previous org)
- **FWL-030**: Org switch → footer links update dynamically
- **FWL-031**: Org switch → theme preset updates dynamically
- **FWL-032**: No FOUC or flash of wrong branding during org switch
- **FWL-034**: Hamburger menu on mobile (375px) shows org main menu with hierarchy
- **FWL-044**: Main menu keyboard navigation — Tab, Enter, Arrow keys, Esc for dropdowns
- **FWL-047**: Screen reader announces parent/child hierarchy (aria-haspopup, aria-expanded)
- **FWL-059/060**: Non-existent link list name → graceful, no crash, no layout break

## Known Gotchas
- **Theme preset case-sensitive**: `Coffee` ≠ `coffee`. Admin stores exact string.
- **FOUC**: CSS custom properties load late → brief flash of wrong theme on first load. Not a bug unless persistent. Test with Slow 3G throttling (FWL-054).
- **Logo caching**: CDN/browser caches old logo. Verify `Cache-Control` headers in HAR (FWL-052).
- **`favicons[]` requires background job**: Multi-size favicon array (`favicons[]`) is only populated after the thumbnail generation job runs (Settings → Jobs). `faviconUrl` is the legacy single-icon fallback.
- **Org context not set**: No `organizationId` in session → xAPI returns store-level settings.
- **Multi-org users**: Active org context determines all branding. Switching org updates everything simultaneously.
- **Backward compat**: Querying without `mainMenuLinks` in the selection set must still work (WL-040, FWL-026).

## Related Modules / Interactions
- **Marketing → Link Lists**: Source for both `footerLinks` and `mainMenuLinks`. Both store and org settings reference link list names.
- **vc-shell auth pages**: Logo/background injected via Vue Router `props` — separate from xAPI white labeling, not org-context-aware.
- **Stores module**: Theme preset list is store-managed; org overrides layer on top.
- **File upload API** (`/api/files`): Logo/favicon URLs are file IDs — test upload end-to-end.
- **Elasticsearch / cache**: WL changes don't require reindex, but may need cache purge to reflect on storefront immediately.

## Sources
- Regression Backend: `regression/suites/Backend/whitelabeling/067-whitelabeling-admin.csv` (WL-001–040)
- Regression Frontend: `regression/suites/Frontend/whitelabeling/070-whitelabeling-storefront.csv`, `071-whitelabeling-branding.csv`
- VCST-4637 / PR #21 — mainMenuLinks / MainMenuLinkListName feature
- [White Labeling xAPI Overview](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/White-labeling/overview.md)
- [whiteLabelingSettings Query](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/White-labeling/queries/whiteLabelingSettings.md)
- [changeOrganizationLogo Mutation](https://github.com/virtocommerce/vc-docs/blob/main/platform/developer-guide/docs/GraphQL-Storefront-API-Reference-xAPI/White-labeling/mutations/ChangeOrganizationLogo.md)
- [Store Branding Guide](https://github.com/virtocommerce/vc-docs/blob/main/platform/deployment-on-cloud/docs/store-branding.md)
