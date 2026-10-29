# [Medium] Page Builder API returns 500 with a database error for a permalink longer than 2048 characters

**Env:** localhost (start-local, PostgreSQL) · Platform 3.1089.0 · PageBuilderModule 3.1036.0-pr-178-e4ff
**Provenance:** PRE-EXISTING (the column width comes from the 2025 migrations; the new rule in PR #178 has no length bound) · Related: VCST-6443

## Summary
`POST /api/page-builder-pages/create-group-page`, `POST /api/page-builder-pages/grouped` and `PUT /api/page-builder-pages/grouped` return an unhandled 500 that exposes the Postgres error when the permalink is longer than 2048 characters. Nothing is stored. The admin shell caps the input at 1024 characters, so API callers and the AI create-page tool are the ones who hit it.

## Steps to reproduce
1. `POST /api/page-builder-pages/create-group-page` with `{storeId: "B2B-store", name: "AGENT-TEST len", cultureName: "en-US", content: "{\"settings\":{},\"content\":[]}", permalink: "/" + "b" × 2048}` (2049 characters).
2. Repeat with POST grouped, and with PUT grouped on an existing page.

## Expected vs actual
- **Expected:** a 4xx with a message, like the other permalink rejections (400 text/plain). Never a 5xx (ECL-7.2).
- **Actual:** 500 `application/json` `{"message":"22001: value too long for type character varying(2048)","stackTrace":null}` on all three endpoints. A 2048-character permalink returns 200. The platform log shows `DbUpdateException → Npgsql.PostgresException 22001` from `GroupedPageService.SaveChangesInternalAsync` (GroupedPageService.cs:111/116).

## Root cause
`GroupedPageBuilderPageEntity.Permalink` is declared `[StringLength(2048)]`. `PageBuilderPermalink.IsValid` checks characters and segments only, so an over-long value passes validation and fails in the database.

**Fix:** add a length bound (2048 or less) to `PageBuilderPermalink.IsValid` and return the standard 400. Optionally align the shell's 1024 cap with it.

Refs: checklist CL-26 · evidence `../investigation/CL-26/` · KB-0BA0AD5F
