# BUG: `changeOrganizationLogo` creates a second white-labeling record for an organization whose record is disabled — [Medium]

## Status: CONFIRMED
**Found by:** agent — testing VCST-7033
**Tracker:** VCST-7056 · **Env:** vcst-qa @ Platform 3.1101.0, WhiteLabeling 3.1008.0, FileExperienceApi 3.1010.0 · **Date:** 2026-11-27

## Summary
The storefront mutation `changeOrganizationLogo` looks up the organization's record with `IsEnabled = true`. If the organization's record exists but is disabled, the lookup misses and the mutation creates a new enabled record for the same organization, without `WhiteLabelingSettingValidator` (REST controller only). Two records then exist for one organization, and the organization is silently re-enabled with only a logo.

## Steps to Reproduce
1. Admin: create an organization and an Organization maintainer on B2B-store.
2. `POST /api/white-labeling` (organization id, `isEnabled: false`, `logoUrl`); `GET /api/white-labeling/organization/<id>` returns one record.
3. As the maintainer: `POST /api/files/organization-logos` (PNG), then `changeOrganizationLogo` with `logoUrl = /api/files/<id>`.
4. Read `GET /api/white-labeling/organization/<id>` and xAPI `whiteLabelingSettings`; repeat the mutation once.

## Expected vs Actual
- **Expected:** one record per organization (BL-WL-005, same binding rules as `POST /api/white-labeling`, which answers `duplicate-store-or-organization`).
- **Actual:** `isSuccess: true`; R1 (disabled, unchanged) and R2 (new, enabled, only `logoUrl`) both exist; xAPI returns R2 with `isOrganizationLogoUploaded: true`; `GET .../organization/<id>` returns R2 only because it is newest (it ignores `isEnabled`); a second call updates R2 in place.

## Root Cause Analysis
`ChangeOrganizationLogoCommandHandler.cs` L40-44 (create with `IsEnabled = true`) and L75-78 (search with `IsEnabled = true`), same at 3.1005.1 (stable bundle v16). The validator is injected only into `WhiteLabelingController`; no unique index on `OrganizationId`. The handler is unchanged since 2025-03-03 (VCST-2774), so this is not new behaviour. Product question: update the disabled record, refuse, or keep creating — undecided.

## Evidence
API-only; no screenshot. Probe of 2026-11-27 (KB-FC2150C5, KB-F1605A45). Left on vcst: two disabled orphan records `fccfbcbf-b827-4d0b-86a3-795487d9e277`, `c92743ad-c504-46ff-9ddd-a63ddb5f9bcf` (no REST delete).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-white-labeling
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** White Labeling, ExperienceApi (`ChangeOrganizationLogoCommandHandler`)
- **RCA anchor:** `ChangeOrganizationLogoCommandHandler.GetWhiteLabelingSettingAsync` / `searchCriteria.IsEnabled = true`
- **Routing confidence:** MEDIUM — the expected behaviour for a disabled record is a product decision, so no auto-fix labels were applied
