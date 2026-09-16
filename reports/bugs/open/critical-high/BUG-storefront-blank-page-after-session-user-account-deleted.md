# Storefront renders a permanently blank page when a live session's user account is deleted

## Status: CONFIRMED

**Env:** vcst-qa @ Platform `3.1053.0-pr-3093-e27a-vcst-5618-e27ac905` (unrelated to the VCST-5618 fix)

## Summary

If an admin deletes a user account while that user has an active storefront session, the orphaned session causes the storefront's `pageContext` GraphQL resolver to throw a server-side `NullReferenceException` — surfaced to the client as `200 OK` with `errors[]: NULL_REFERENCE`. The storefront SPA has no fallback for this: instead of clearing the dead session and redirecting to sign-in, it renders a **completely blank page** (empty accessibility tree) on both `/account/dashboard` and the home page. Confirmed to be specific to the stale-session condition, not a general storefront outage — a fresh, cookie-less visit to the same storefront renders normally.

## Steps to Reproduce

1. As a test user, sign in to the storefront and establish an active session (note the session cookie).
2. As admin, delete that user's account via Security > Users.
3. In the test user's still-open browser session, navigate to `/account/dashboard` or the home page.

## Actual Result

- Page renders completely blank — no header, no footer, no content, empty accessibility tree.
- Network: `POST /graphql` (`GetPageContext`) → `200 OK` with `errors[]` containing a `NULL_REFERENCE`.
- Console: `ApolloError: Error trying to resolve field 'pageContext'.`
- Server-side (confirmed via Application Insights): `System.NullReferenceException at VirtoCommerce.XFrontend.Data.Queries.PageContextQueryHandler`, "Error trying to resolve field 'pageContext'" — a genuine unhandled server exception, not a client-side artifact.
- `POST /connect/token` with the deleted user's credentials correctly returns `400` (cannot re-authenticate) — the account deletion itself works correctly at the auth layer.

## Expected Result

The stale/orphaned session should be detected and cleared, redirecting the user to the sign-in page (or showing a clear error) — never a silent blank page.

## Root Cause Analysis

The `pageContext` GraphQL query accepts an optional `userId` argument (per `graphql-schema.md`). The orphaned session replays the **deleted user's real `userId`** into this query; the resolver has no null-guard for a `userId` that no longer resolves to an existing member record, so it throws.

**Confirmed NOT a general outage** — a fully fresh, cookie-less load of the same storefront home page renders completely normally (header, nav, product carousel, footer all present), and its own `GetPageContext` call (with `userId: ""`) returns clean `data` with no `errors[]`. The discriminating factor is specifically a `userId` that no longer resolves to a member, not the query in general.

This is arguably two separate but related defects:
1. **Server-side**: `PageContextQueryHandler` needs a null-guard for a nonexistent `userId` (return null/empty context instead of throwing).
2. **Client-side**: the storefront SPA has no error boundary/fallback for a `pageContext` resolution failure — it should detect the invalid session and redirect to sign-in rather than rendering nothing.

## Severity

**P1** — a real, reproducible defect with a poor user-facing outcome (a fully-blank page, no error, no recovery path), but scoped to the narrow condition of an active session outliving its own account deletion — not affecting normal traffic (confirmed via the fresh-context control check).

## Additional triggers — the condition is NOT narrow (added 2026-09-11, during the VCST-5472 `/qa-test` run on vcptcore-qa)

The same client-side defect (#2 in the RCA above — no error boundary for a `pageContext` failure) was hit **twice more on vcptcore-qa, from two causes unrelated to account deletion**. The server-side null-guard (#1) is specific to the deleted-user case; the client-side blank render is the general one, and it is the one that keeps recurring.

**Trigger B — `contact: null` on a live account.** `MULTI_ORG_USER_EMAIL` authenticates at the API layer but carries `passwordExpired: true` with `contact: null`. The bootstrap query cannot resolve `contact.firstName`/`lastName`, and the storefront then renders a blank page **on every route for the rest of the session** (verified: zero-node accessibility tree; the Admin SPA on another domain was unaffected in parallel). Evidence: `reports/regression/REG-2026-09-11-VCST5472/traces/SMK-020-FAIL-trace.json`. This one poisoned the browser session and ended suite 042 early at SMK-020 (12 later cases never ran).

**Trigger C — a backend module one minor version behind the deployed theme, which breaks the query for EVERYONE.** The theme requested `Organization.isLockedForCurrentUser` (present on `vc-frontend@dev` via `core/api/graphql/fragments/organizationFields.graphql`); the stand ran `ProfileExperienceApiModule 3.1017.0`, where that field does not exist. GraphQL **validation** rejected the whole `GetPageContext` document → `POST /graphql` → **HTTP 400** → Apollo threw → blank page. Fixed by bumping the module to 3.1018.0 (vc-deploy-dev#6516), but the point stands: this variant is **not session-scoped and not account-scoped** — every visitor, signed-in or anonymous, got a blank page at HTTP 200.

**Why this matters for severity.** The original assessment scoped this to "an active session outliving its own account deletion — not affecting normal traffic". Trigger C falsifies that scoping: **any** field-level drift between the deployed theme and the backend takes the entire storefront down, silently, with a 200 status code and no banner (the compat-banner code never runs, because the app dies before it). The client-side half of this defect is therefore better read as **P0-class blast radius with a P1-likelihood trigger**, and an error boundary around the bootstrap query would have converted all three incidents from "total outage" into "degraded page with a message".

A further consequence worth noting: because the page returns **HTTP 200 with an empty `#app`**, every cheap health check passes — a `curl` of `/`, a status-code probe, even a `{ __typename }` GraphQL smoke test. Only loading the real bootstrap operation reveals it.

## Screenshots

![Blank storefront after account deletion](../screenshots/PLAT-069-blank-storefront-after-account-delete.png)

## Duplicate Check

No `vc-bug-catalog` entry matches (no orphaned-session / blank-render pattern under VC-AUTH-*, VC-UI-*, or VC-API-*) — novel pattern.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1/3 — Storefront + xAPI (two owners)
- **Suggested repo:** ambiguous — the resolver crash is `vc-module-x-frontend` (`PageContextQueryHandler`); the missing client-side fallback is `vc-frontend`. Note `vc-module-x-frontend` may not be on the `/qa-fix` allowlist (`fix-repos.json`) — human routing required regardless.
- **repoKind:** module (xAPI) + frontend
- **Ownership hint:** platform
- **Component / module:** `VirtoCommerce.XFrontend.Data.Queries.PageContextQueryHandler` (resolver); storefront SPA session/error handling (client fallback)
- **RCA anchor:** `PageContextQueryHandler` (exact file:line not confirmed — needs source lookup in `vc-module-x-frontend`)
- **Routing confidence:** LOW — two-repo fix, needs human split/triage

## Incidental (found during live verification, unrelated — not filed as its own report)

Two catalog product images on the storefront home page reference a dead domain (`starmarket-platform.demo.govirto.com`), producing `net::ERR_NAME_NOT_RESOLVED` console errors — stale CMS asset references pointing at a decommissioned demo host. Low severity, worth a separate low-priority ticket if picked up.
