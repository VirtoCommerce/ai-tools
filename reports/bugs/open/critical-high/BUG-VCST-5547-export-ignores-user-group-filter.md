# Export from "Show customers" ignores the user-group filter and offers the entire customer database

- **Severity:** Critical
- **Provenance:** IN-SCOPE — introduced by VCST-5547 (vc-module-customer PR #315)
- **Environment:** vcptcore-qa · Platform `3.1070.0-pr-3115-26ab` · Core `3.1008.0-pr-257-7785` · Customer `3.1024.0-pr-315-7c45`
- **Found by:** `/qa-test VCST-5547` Step 4a · evidence `reports/tickets/Sprint26-18/VCST-5547/screenshots/06-B3-export-dialog-lux.png`

## Steps to reproduce

1. Admin → Marketing → Promotions → open any promotion → **Promotion conditions**
2. Add a **"User group is …"** condition and select a group with exactly one member
   (on this env: `LUX` → 1 Contact, "Benny Buns")
3. Click the new **"Show customers"** link. The blade opens showing **1 row**, count badge **1**
4. Select **no** rows. Click **Export** in that blade's toolbar

## Expected

The export is scoped to what the blade is filtered to — **1 record**. (Or, if group-scoped export is not
supported, Export is not offered on this blade at all.)

## Actual

The confirmation dialog reads:

> **Export contacts** — "All **4677** contacts & **391** organizations will be exported to a CSV file"

**5 068 records offered from a list showing 1.** The dialog was cancelled; the export was not completed.

No guard rail intercepts this: `CustomerExportImport.Export.LimitOfLines` is **10 000** on this
environment, and 5 068 is under it, so the "too many records" warning never fires.

## Why it happens

Two independent gaps, both introduced by the new blade:

1. **`Export` is not covered by the new read-only gate.** PR #315 gates seven toolbar commands behind
   `if (!blade.readOnlyList)` inside `member-list.js`. `Import` and `Export` are not in that array — they
   are injected from another module at render time via
   `toolbarService.register(..., 'virtoCommerce.customerModule.memberListController')`
   (`vc-module-customer-export-import/src/.../Scripts/module.js`, lines 35 and 147), so they never see
   `blade.readOnlyList`.
2. **The export request cannot carry a group filter.** `ExportDataRequest`
   (`vc-module-customer-export-import/src/.../Core/Models/ExportDataRequest.cs`) exposes only
   `Keyword`, `ObjectIds` and `OrganizationId` — there is **no `Groups` field**. With no rows selected the
   handler sends `{ keyword: undefined, objectIds: [], organizationId: null }`, which resolves to every
   member.

`groups` is the **first blade-level filter that Export does not honour** — it honoured `keyword`, the only
previous one — which is what makes this in-scope rather than pre-existing.

## Impact

A marketing user reviewing who qualifies for a discount is one click from exporting the full customer
database as CSV. The failure is success-shaped: no error, no warning, and the count is only visible to
someone who reads the dialog carefully.

## Suggested fix (for the implementers to judge)

Either suppress `Import`/`Export` when `blade.readOnlyList` is set — which requires the gate to move into
the shared `toolbarService.resolve()` path rather than the local array — or add `Groups` to
`ExportDataRequest` and pass the blade's groups through. The first is the smaller change and closes the
`Import` hole at the same time.

## Related

Same root gate gap: `BUG-VCST-5547-readonly-mode-escapable.md` (High).
