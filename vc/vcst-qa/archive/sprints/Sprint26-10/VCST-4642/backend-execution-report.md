# VCST-4642 — Backend Execution Report (Admin SPA + Toggle Behavior)

**Env**: vcst-qa | **Platform** `3.1028.0` | **Xapi** `3.1009.0-pr-66-020b` | **Browser**: playwright-edge
**Auth**: admin / Password1! (.env.local)
**Date**: 2026-05-21

## Results

| Case | Status | Evidence |
|------|--------|----------|
| BE-4 — Admin SPA setting exists, default ON | PASS | `VCST-4642-be4-setting-en.png` |
| BE-5 — Toggle OFF -> version="" + modules drop 79->18; restore reverses | PASS | `evidence-be5-toggle-off-response.json`, `evidence-be5-toggle-on-restored.json` |
| BE-7 — Localization (EN + DE) | PASS | `VCST-4642-be4-setting-en.png`, `VCST-4642-be7-setting-de.png` |

## BE-4 — Setting metadata (AC4, AC6)

- `data-setting-name="XAPI.Security.ReturnModuleVersion"` present in `/#!/workspace/settings`
- Group tree path: `All Settings -> Platform -> Security` (breadcrumb shows "Platform > Security")
- Label (EN): "Return module version"
- Description (EN, via ? icon): "When enabled, module versions and the full list of installed modules are returned in the store response"
- Default value: checkbox `checked = true` (ON) — verified pre-edit
- Control: switch toggle (`label.form-label.__switch` + checkbox)

## BE-5 — Toggle behavior (AC5, BL-CROSS-006, BL-GQL-003)

Saved toggle OFF -> POST `/graphql` `{ store(storeId:"B2B-store"){ settings { modules { moduleId version settings { name } } } } }`:
- HTTP 200, `errors: null`
- `totalModules = 18` (down from 79)
- versionDistribution: **18 x `""` (empty string)**, 0 null, 0 non-empty
- All 18 returned modules have `settingsCount >= 1` (only modules with public settings remain)
- `String!` non-null contract HONORED — version is empty string, never null

Restored toggle ON -> re-queried:
- HTTP 200, `errors: null`
- `totalModules = 79` (full set)
- versionDistribution: **79 x non-empty** (e.g. `Catalog 3.1022.0`, `Xapi` follows pr-66 build, `Pages 3.1005.0`)
- Change reflected immediately on the next request — no >60s cache lag observed

## BE-7 — Localization (AC6)

Switched user profile language English -> Deutsch. Nav and search placeholder localized ("Suchbegriff eingeben...", "Sicherheit"). Setting row rendered:
- DE label: "Modulversion zurueckgeben"
- DE description: "Wenn aktiviert, werden Modulversionen und die vollstaendige Liste der installierten Module in der Shop-Antwort zurueckgegeben"
- No missing-key fallback (no raw `XAPI.Security.ReturnModuleVersion.Title` literal)
- Switched back to English; label restored.

## Bugs found

None. All three cases pass.

## Net assessment — Backend portion

PASS. The platform setting is correctly registered (group, label, description, default), localized (EN + DE verified), and drives the documented GraphQL response gating. The non-null `String!` contract for `ModuleSettingsType.version` is preserved when the setting is OFF (empty string, not null). Combined with the prior schema/data verification (BE-1, BE-2, BE-3, BE-6, BE-8 — `evidence-be2-store-modules-on.json`), the backend portion of VCST-4642 is ready for sign-off.

## Restoration

`XAPI.Security.ReturnModuleVersion` was restored to ON (default) and saved. Post-restore GraphQL probe confirmed 79 modules with populated versions. Frontend `initializeApplication` capability flow is unaffected.
