# Dynamic property: a stored value is keyed by NAME, so renaming the property orphans it and the next ordinary save deletes it

## Status: CONFIRMED — data loss reproduced

**Env:** vcst-qa @ Platform `3.1061.0`
**Severity:** P2 (data loss, silent, no error surfaced — but requires an admin rename to trigger)

## Summary

A dynamic-property **value** row is matched by `PropertyName`, not by `PropertyId`. Renaming the property definition therefore orphans every previously-saved value: the Admin widget renders empty (it merges against fresh metadata carrying the *new* name and misses), and the **next ordinary save of that entity permanently deletes the orphaned row**. No error is shown at any point.

This is platform-level (`vc-platform` dynamic-properties), not Inventory-specific — the fulfillment center below is just the surface it was found on.

## Steps to Reproduce

Against any entity implementing `IHasDynamicProperties` (a fulfillment center used here):

```
1. PUT /api/inventory/fulfillmentcenters
   dynamicProperties: [{ name: "<PROP>", valueType: "ShortText",
                         values: [{ value: "PROBE-VALUE-42" }] }]

2. GET /api/inventory/fulfillmentcenters/{id}
   → value present

3. PUT the same entity again, with the property carrying a DIFFERENT name
   (this is the post-rename state: metadata holds the new name,
    the stored row still holds the old one)

4. GET /api/inventory/fulfillmentcenters/{id}
```

## Actual Result

Step 2 → `name="<PROP>"  id=(empty)  values=["PROBE-VALUE-42"]`
Step 4 → `dynProps now on FFC: 0` — **the value is gone.**

Both saves returned `200`. Nothing warned that a stored value was being discarded.

Note step 1 persisted successfully with an **empty `PropertyId`** and **no property definition in existence** — direct evidence that the value row is keyed by name alone.

## Expected Result

A rename is a metadata change. Existing values must survive it — matched by `PropertyId`, which is stable — and remain visible under the new display name. If a value genuinely cannot be carried across, the save must fail loudly rather than silently discarding it.

## Root Cause Analysis

Three anchors in `vc-platform`:

1. **`DynamicPropertyObjectValueEntity`** stores both `PropertyId` **and** a denormalised `PropertyName`.
2. **`DynamicPropertyService.SaveDynamicPropertiesAsync`** patches only the *definition* entity — it never cascades a new name onto existing value rows.
3. **`FulfillmentCenterEntity.ToModel`** groups by `PropertyId ?? PropertyName` but sets `property.Name = x.FirstOrDefault()?.PropertyName` — returning the **stale stored name**. The Admin widget merges against fresh metadata carrying the *new* name, matches **by name** (as `DynamicPropertyAccessor` does throughout, via `Name.Equals(..., OrdinalIgnoreCase)`), misses, and renders empty.

The deletion is the fourth step: **`GetEqualityComponents()` keys on `PropertyName`, not `Id`** (with an explicit comment saying so). On the next save the orphaned row is a non-match, and `Patch` removes it.

The id-preferring `GroupBy` in (3) shows id-keying was the intent — the rename path simply never cascades, and the equality comparer never got the same treatment.

## Severity rationale

P2 rather than P1: it is silent and unrecoverable, but needs a deliberate admin rename to trigger, and the loss is confined to that property's values. Raise to P1 if a rename is a routine operation in any customer workflow, or if the same shape is confirmed on a high-volume entity (see Scope).

## Scope — likely platform-wide, not yet fully measured

The `ToModel` shape in (3) is reportedly copy-pasted across modules. Only the fulfillment-center surface was exercised here. **Before fixing, confirm the blast radius** across other `IHasDynamicProperties` entities (Product, Order, Member, Store) — the equality comparer in (4) is shared, so the deletion half almost certainly is too.

## Fix Routing

**Repo:** `VirtoCommerce/vc-platform`
**Anchor:** `GetEqualityComponents()` on the dynamic-property value entity — key on `PropertyId` where present, falling back to `PropertyName` only for legacy rows that have no id. A cascade of the new name onto existing value rows in `SaveDynamicPropertiesAsync` would fix the *display* half; without the comparer change the **deletion** remains.

## Related — found while reproducing, same session

`POST /api/platform/dynamic/properties` with a malformed body returns **500** `"Cannot pass a null model to Validate/ValidateAsync. The root model must be non-null."` — another instance of the validation-failure-as-500 class in `BUG-platform-rest-validation-failures-leak-raw-sql-errors.md`, on an endpoint that draft does not list.

## Evidence / cleanup

Reproduced via REST on a disposable `AGENT-TEST-` fulfillment center that held **zero** dynamic properties beforehand — no pre-existing data was affected. The probe property definition was never created (the 500 above), which is itself part of the evidence: the value persisted without one.
