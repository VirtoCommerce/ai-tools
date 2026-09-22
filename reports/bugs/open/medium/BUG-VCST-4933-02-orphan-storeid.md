# Shared Component create accepts a non-existent storeId, producing an unreachable orphan

- **Severity:** Medium
- **Provenance:** IN-SCOPE (VCST-4933, Page Builder — Shared Components)
- **Environment:** vcptcore-qa · `VirtoCommerce.PageBuilderModule 3.1025.0-pr-159-7361` (PR #159) · store `B2B-store`
- **Found:** 2026-09-17, `/qa-test VCST-4933` Track 4

## Summary

`POST /api/page-builder-shared-components` does not validate that `storeId` refers to a real store. It
returns `201 Created` for a fabricated one, and the resulting component is a permanent orphan.

## Steps to reproduce

```
POST /api/page-builder-shared-components
{ "storeId": "NO-SUCH-STORE-XYZ", "name": "AGENT-TEST-QA4-BadStore", "content": { ... } }
```

## Expected

`400`, naming the unknown store — consistent with the two sibling guards in the same controller.

## Actual

`201 Created`. The component persists and is retrievable:

```
POST /api/page-builder-shared-components/search
{ "storeId": "NO-SUCH-STORE-XYZ" }   ->  200, the component is returned
```

## Why this matters — it is an inconsistency, not a missing feature

The same controller already enforces store integrity correctly in **both** other directions, which is
what makes create the odd one out:

| Guard | Behaviour | Status |
|---|---|---|
| Insert a cross-store component into a page | `400 "Shared Component '…' belongs to a different store and cannot be inserted into this page."` | present, correct |
| Move a component to another store (`PUT /{id}` changing `storeId`) | `400 "A Shared Component cannot be moved to another store."` | present, correct |
| **Create with an unknown store** | **`201 Created`** | **missing** |

## Impact

The created record is unreachable through every normal path: invisible in any real store's library,
un-insertable into any page (the cross-store guard rejects it), and not deletable through the UI, which
only ever lists real stores. It is durable, queryable database residue that no product surface can
clean up.

Rated **Medium** rather than High because it is not reachable from the UI — it takes a direct API call
with a fabricated store id — so it is an integrity/hygiene defect rather than a user-facing one. It is
not theoretical: the record was created, queried back, and persisted.

## Suggested fix

Validate `storeId` against the store registry on create, returning `400` as the two sibling guards do.

## Note on ownership

Plausibly owned by sub-task **VCST-5184 "Shared Components. Production ready"**, still `To do`. Flagged,
not assumed.

## Evidence

Reproduction script `track4.mjs` from the run's scratchpad; the created orphan was torn down at the end
of the run. Run record: `reports/tickets/Sprint26-19/VCST-4933/findings.md` §C F2.
