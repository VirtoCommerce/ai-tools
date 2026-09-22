# Concurrent page save silently discards one author's work (no concurrency token anywhere)

- **Severity:** Medium
- **Provenance:** IN-SCOPE (VCST-4933, Page Builder — Shared Components)
- **Environment:** vcptcore-qa · `VirtoCommerce.PageBuilderModule 3.1025.0-pr-159-7361` (PR #159) · storefront `2.58.0-pr-2410-3aa8` (PR #2410) · store `B2B-store`
- **Found:** 2026-09-17, `/qa-test VCST-4933` Track 7 (AC8)

## Summary

Two content managers editing the same Page Builder page concurrently both receive `204`, and one
author's work is silently gone — no conflict, no warning, and **no way for the client to detect that
it happened**. The product exposes no concurrency signal of any kind, so this cannot be mitigated by
the UI either.

## Steps to reproduce

1. Obtain two independent sessions (two tokens is sufficient — this is server-side).
2. Both read the same page's authoring content:
   `GET /api/page-builder-pages/grouped/{groupId}/content?draft=true`
3. Session A saves a modified copy: `POST /api/page-builder-pages/grouped/{groupId}/content`
4. Session B saves ITS copy (derived from the pre-A read) to the same endpoint.
5. Re-read the content.

## Expected

Session B is told its copy is stale — a `409`/`412`, or any signal the client can act on. Last-writer-
wins may be an acceptable product decision, but it must be *detectable*, and today it is not.

## Actual

Both saves return `204`. The content is exactly Session B's version. Session A's work is gone with no
record that a conflict occurred.

## Why it cannot be worked around

The absence is complete, and was checked rather than assumed:

- `GET /api/page-builder-shared-components/{id}` returns **no `ETag` and no `Last-Modified`** — the
  full response header set was enumerated.
- `PageBuilderSharedComponentUpdateModel` carries only `storeId` and `name` — **no `rowVersion`, no
  `modifiedDate`**.
- The page-content save takes an **untyped body with no version parameter**.

So no client — the Designer included — can implement optimistic concurrency on top of this API.

## What is NOT wrong (checked, so this report is not mistaken for a broader failure)

AC8's *atomicity* claim **holds**, and was verified hard before this was filed:

- 11 concurrent rounds, escalating to **6 simultaneous writers**: `contentWinners == contentRefs ==
  indexRefs` on every round — **0 torn states**. One whole version always wins; no mixed version was
  ever committed.
- 6 rounds of the sharpest race, `DELETE(component)` vs `page-save(linking that component)`: every
  round landed on one of the two legal outcomes (delete wins → save rejected 400 as a dangling ref, or
  save wins → delete refused 409). **0 dangling references.**

**This is therefore a distinct defect from AC8, not an AC8 failure.** AC8 says content, component
content, usage references and asset references "remain atomic under concurrent save/delete" — they do.
Losing an author's work while remaining atomic is a different problem, graded on its consequence
rather than on whether an acceptance criterion happened to name it.

## Impact

Two content managers on one page is an ordinary CMS scenario, not a corner case. The loss is
irreversible (there is no version history — see the companion finding that editing a Shared Component
original has no un-propagate path) and invisible to both parties: the author who lost the work has no
signal, and the author who overwrote it has no idea they did.

## Suggested fix

Either (a) add a version token (`ETag` / `rowVersion`) to the content GET and require it on save,
returning `412`/`409` on mismatch; or (b) if last-writer-wins is the intended product behaviour, state
it explicitly in AC8 and surface a "this page changed while you were editing" warning in the Designer.

## Note on ownership

Plausibly owned by sub-task **VCST-5184 "Shared Components. Production ready"**, which is still `To do`.
Flagged rather than assumed — the parent Story is in `Ready for test`, so the split is a team decision.

## Evidence

Reproduction scripts (token-driven, re-runnable): `track7.mjs`, `track7b.mjs` from the run's scratchpad.
Run record: `reports/tickets/Sprint26-19/VCST-4933/findings.md` §C F1.
