# Wishlist sharing scopes — Developer Guide

Wishlist sharing in X-Cart is an **additive registry of scopes**. A module adds its own scope by
registering an `ICartSharingScopePolicy`; it no longer subclasses and re-registers `ICartSharingService`.
Several modules can contribute scopes side by side, and two modules claiming the same scope stop the
platform at startup instead of one silently losing. By the end of this guide you will know how a scope
is registered, what it controls, and how `wishlists(scope: ...)` narrows its results.

## Prerequisites

- **VirtoCommerce.XCart** with the sharing registry (`ICartSharingScopePolicy` in `VirtoCommerce.XCart.Core`).
- Your module references **`VirtoCommerce.XCart.Core`** only — a policy implements a `.Core` contract, so no
  `.Data` reference and no GraphQL type override are needed.
- Basic knowledge of Virto Commerce module development (`IModule.Initialize`, DI registration).

## Quick Start

### Step 1: Derive a policy from `CartSharingScopePolicyBase`

Override `Scope`, `IsAuthorized` (fail closed), `ApplyAsync` (any authorization for *setting* the scope
belongs here) and, if your scope should narrow list searches, `ConfigureSearchCriteria`.

### Step 2: Register it in your module's `Initialize`

```csharp
serviceCollection.AddTransient<ICartSharingScopePolicy, MyCartSharingScopePolicy>();
```

That is the whole integration. The scope value appears in the `/graphql` `WishlistScopeType` enum on the
next start, and the wishlist mutations and `wishlists(scope: ...)` accept it. Sales Rep's `Customer` scope is
registered exactly this way.

!!! warning
    Registration order is the enum's value order — nothing else. Two policies with the same `Scope` throw at
    startup, naming both types.

## What a policy controls

| Member | Controls | Default (base class) |
|--------|----------|----------------------|
| `Scope` | the stored setting scope and the GraphQL enum value | — (required) |
| `Description` | the enum value's schema description | `"<Scope> scope"` |
| `CanApply` | `false` = can be read but never set; writes are refused | `true` |
| `GetAccess` | `Read` or `Write` for the caller | owner `Write`, others `Read` |
| `IsAuthorized` | whether the caller may read the list | — (required) |
| `ApplyAsync` | writes the scope onto the list | no-op |
| `EnsureSetting` | how the setting row is written | one effective setting per list |
| `ConfigureSearchCriteria` | how `wishlists(scope: ...)` narrows | no narrowing |

!!! warning
    `EnsureSetting`'s signature differs between the two open X-Cart PRs: `(cart, sharingKey, access, sharedWithId)`
    in vc-module-x-cart#140, `(cart, sharingKey)` plus `ResolveTargetsAsync` and multi-target `Targets` in
    vc-module-x-cart#141. Build against the X-Cart version you ship with.

## API behaviour you can rely on

Scope names are matched **case-insensitively** (`"organization"` = `"Organization"`). A scope that is not
registered, or whose `CanApply` is `false` (built-in `AnyoneAuthorized`, `User`), is refused with HTTP 200 and
`errors[]` (code `INVALID_OPERATION`), and nothing is written.

`wishlists(scope:)` narrows through the scope's policy. Built-in behaviour: `Private` → lists without an
organization; `Organization` → the caller's organization lists; any other built-in or unknown value → no
narrowing (own + organization lists). Narrowing filters by **owner/organization, not by sharing scope**, so
Sales Rep's `Customer` returns the same set as `Private` — the rep's Customer **and** Private lists:

```graphql
query { wishlists(storeId: "B2B-store", first: 100, scope: "Customer") {
  totalCount items { name sharingSetting { scope access isOwner } } } }
```

```json
{ "wishlists": { "totalCount": 3, "items": [
  { "name": "AGENT-TEST-5919-9", "sharingSetting": { "scope": "Private",  "access": "Write", "isOwner": true } },
  { "name": "AGENT-TEST-5919-7", "sharingSetting": { "scope": "Private",  "access": "Write", "isOwner": true } },
  { "name": "AGENT-TEST-5919-6", "sharingSetting": { "scope": "Customer", "access": "Write", "isOwner": true } } ] } }
```

Send the request to `{{BACK_URL}}/graphql` with a bearer token for the signed-in user.

!!! tip
    To list only one sharing scope, filter `items` by `sharingSetting.scope` on the client — the `scope`
    argument does not do it.

## Next steps

Read access is resolved only from a list's **persisted** sharing settings: a list with no setting is
readable by its owner alone, never inferred as shared with an organization. Design your `IsAuthorized` the
same way. Source and a full example policy: the X-Cart README, section *Extensibility: adding a wishlist
sharing scope*.

---
*VCST-5919 · verified on vcptcore-qa (XCart 3.1038.0-pr-141, SalesRep 3.1012.0-pr-21) · verdict PASS WITH NOTES ·
Not documented: the duplicate-scope startup failure and the C# registration mechanics are verified by the PR
unit tests only, not on a stand · Audiences derived from layer `api`*
