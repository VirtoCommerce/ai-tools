# [Medium] Site Builder "Preview as" a customer: the storefront header stays signed out ("Sign in · Sign up now")

**Env:** vcst-dev @ Platform 3.1100.0 · SiteBuilder `3.1002.0-pr-4-b4af` · theme `2.63.0-pr-2698-ade1-ade18a83` (vc-frontend `dev` @ 93da99a + `site_builder_enabled: true`) · 2026-11-25
**Found in:** /qa-test VCST-6950 (fix verification) · **Related:** VCST-6950
**Jira:** VCST-7011

## Summary
With "Preview as" a customer in the Site Builder designer, the preview frame uses the customer's token for every
request (`GetMe` returns the customer, her organization's white-labeling loads), but the header's account area keeps
showing "Sign in · Sign up now". An editor checking what a signed-in customer sees gets a signed-out header.

## Steps to reproduce
1. B2B-store setting `SiteBuilder.Store.PreviewUserIds` lists a customer account (e.g. `@td(ORG_USER)`).
2. Open Site Builder (`{BACK_URL}/apps/site-builder-shell/?storeId=B2B-store`) → a draft page → **Edit in designer**.
3. Desktop width. Pick the customer in the user picker ("Anonymous visitor" → customer).
4. Look at the preview header.

## Expected vs Actual
- **Expected:** the header renders as for the signed-in customer (account menu with the customer / organization, no "Sign in").
- **Actual:** "Sign in · Sign up now", the same as for the anonymous visitor.

## Evidence
- Screenshot: `reports/tickets/Sprint26-20/VCST-6950/screenshots/VCST-6950-designer-preview-as-org-user.jpg`
  (picker = customer, header = "Sign in · Sign up now").
- Preview frame network after `auth {code, userId}` (same build): `POST /connect/token` 200 →
  `GetMe` (Bearer = preview token) = the customer → `WhiteLabelingSettings` 200. No `authRenew`, so the exchange succeeded.

## Root cause (hypothesis, from source)
`client-app/plugins/builder-preview/builder-preview.plugin.ts` `applyAuth` swaps `previewToken`, sets
`globals.userId` / `organizationId`, reloads branding and remounts the blocks, but does not refetch the current user
the header reads (`useUser`), which was loaded as anonymous at app start. Likely the same on the released Page Builder
path (`auth {token}`), so probably not introduced by VCST-6950 — not verified.
