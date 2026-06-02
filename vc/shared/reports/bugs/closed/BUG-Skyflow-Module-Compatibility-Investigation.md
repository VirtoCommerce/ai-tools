# Skyflow Module v10 Compatibility Investigation

**Date:** 2026-02-23
**Investigator:** qa-backend-expert (Claude Opus 4.6)
**Environment:** QA (https://vcst-qa.govirto.com)
**Platform Version:** 3.1005.0
**Severity:** CRITICAL (P0) -- Blocks all Skyflow payment processing

---

## 1. Executive Summary

The `authorizePayment` GraphQL mutation returns `NOT_IMPLEMENTED` when used with the Skyflow payment method on the QA environment. Root cause analysis reveals a **cross-module compatibility break** between the v9-era Skyflow module (3.901.0) and the v10-era target payment methods (AuthorizeNet 3.1000.0) running on the v10 Payment module base class (3.1000.0).

**Root Cause:** Skyflow's `PostProcessPayment` calls the sync `PostProcessPayment()` on its target payment method (AuthorizeNet). In v10, AuthorizeNet only overrides the async methods and does NOT override the sync `PostProcessPayment`. The v10 base class default for the sync method throws `NotImplementedException`.

**Impact:** ALL Skyflow-proxied payments are broken. No workaround exists without code changes.

---

## 2. Module Version Compatibility Matrix

### Modules Deployed on QA (2026-02-23)

| Module | Installed Version | Platform Req | Compiled Against Payment | Era | Status |
|--------|-------------------|-------------|--------------------------|-----|--------|
| **VirtoCommerce.Platform** | **3.1005.0** | - | - | **v10** | Runtime |
| **VirtoCommerce.Payment** | **3.1000.0** | 3.1002.0 | - | **v10** | Runtime base class |
| **VirtoCommerce.Orders** | **3.1000.0** | 3.1002.0 | - | **v10** | OK |
| **VirtoCommerce.Xapi** | **3.1003.0** | 3.1000.0 | - | **v10** | OK |
| **VirtoCommerce.XOrder** | **3.1000.0** | 3.1002.0 | Payment 3.1000.0 | **v10** | OK |
| **VirtoCommerce.XCart** | **3.1000.0** | 3.1002.0 | Payment 3.1000.0 | **v10** | OK |
| **VirtoCommerce.Skyflow** | **3.901.0** | 3.841.0 | **Payment 3.800.0** | **v9** | INCOMPATIBLE |
| **VirtoCommerce.AuthorizeNetPayment** | **3.1000.0** | 3.1002.0 | Payment 3.1000.0 | **v10** | OK (standalone) |
| **VirtoCommerce.CyberSourcePayment** | **3.803.0** | 3.917.0 | Payment (v10-compatible) | **v10** | OK |
| **VirtoCommerce.Datatrans** | **3.800.0** | 3.904.0 | Payment (v10-compatible) | **v10** | OK |
| **VirtoCommerce.NativePaymentMethods** | **3.802.0** | 3.825.0 | - | v9 | OK |

### Version Naming Convention
- **v9 era:** 3.800.x - 3.9xx.x (compiled against PaymentModule.Core 3.800.0)
- **v10 era:** 3.1000.0+ (compiled against PaymentModule.Core 3.1000.0+)

### Skyflow Release History (GitHub: VirtoCommerce/vc-module-skyflow)
| Version | Date | Notes |
|---------|------|-------|
| 3.800.0 | Initial | First release |
| 3.801.0 | - | |
| 3.900.0 | - | |
| 3.901.0 | Feb 2025 | **Latest release (deployed on QA)** |
| 3.902.0 | - | Dev branch HEAD (unreleased) |
| **3.1000.0+** | **DOES NOT EXIST** | **No v10 release** |

---

## 3. PaymentMethod Base Class: v9 vs v10 Breaking Changes

### v9 PaymentMethod (3.806.0) -- What Skyflow Was Compiled Against

```csharp
public abstract class PaymentMethod : Entity, IHasSettings, ...
{
    // ALL methods are ABSTRACT -- subclasses MUST override them
    public abstract ProcessPaymentRequestResult ProcessPayment(ProcessPaymentRequest request);
    public abstract PostProcessPaymentRequestResult PostProcessPayment(PostProcessPaymentRequest request);
    public abstract VoidPaymentRequestResult VoidProcessPayment(VoidPaymentRequest request);
    public abstract CapturePaymentRequestResult CaptureProcessPayment(CapturePaymentRequest context);
    public abstract RefundPaymentRequestResult RefundProcessPayment(RefundPaymentRequest context);
    public abstract ValidatePostProcessRequestResult ValidatePostProcessRequest(NameValueCollection queryString);

    // NO async methods exist
    // NO AllowCartPayment property
    // NO ISupportCaptureFlow/ISupportRefundFlow interfaces
}
```

### v10 PaymentMethod (3.1000.0+) -- What Runs at Runtime on QA

```csharp
public abstract class PaymentMethod : Entity, IHasSettings, ...
{
    // NEW: Property for cart-level payment support
    public virtual bool AllowCartPayment => false;

    // NEW: Localized name
    public LocalizedString LocalizedName { get; set; }

    // SYNC methods now VIRTUAL (not abstract) with OBSOLETE warning
    // Default implementation: throw NotImplementedException
    [Obsolete("Use ProcessPaymentAsync instead.")]
    public virtual ProcessPaymentRequestResult ProcessPayment(ProcessPaymentRequest request)
    { throw new NotImplementedException(); }

    [Obsolete("Use PostProcessPaymentAsync instead.")]
    public virtual PostProcessPaymentRequestResult PostProcessPayment(PostProcessPaymentRequest request)
    { throw new NotImplementedException(); }

    [Obsolete("Use VoidProcessPaymentAsync instead.")]
    public virtual VoidPaymentRequestResult VoidProcessPayment(VoidPaymentRequest request)
    { throw new NotImplementedException(); }

    [Obsolete("Use CaptureProcessPaymentAsync instead.")]
    public virtual CapturePaymentRequestResult CaptureProcessPayment(CapturePaymentRequest context)
    { throw new NotImplementedException(); }

    [Obsolete("Use RefundProcessPaymentAsync instead.")]
    public virtual RefundPaymentRequestResult RefundProcessPayment(RefundPaymentRequest context)
    { throw new NotImplementedException(); }

    [Obsolete("Use ValidatePostProcessRequestAsync instead.")]
    public virtual ValidatePostProcessRequestResult ValidatePostProcessRequest(NameValueCollection queryString)
    { throw new NotImplementedException(); }

    // NEW: ASYNC methods delegate to sync by default (backward compat bridge)
    public virtual Task<PostProcessPaymentRequestResult> PostProcessPaymentAsync(
        PostProcessPaymentRequest request, CancellationToken cancellationToken = default)
    { return Task.FromResult(PostProcessPayment(request)); }  // <-- calls sync version

    // ... similar async wrappers for all other methods
}
```

### Key Breaking Change Summary

| Aspect | v9 | v10 | Impact on Skyflow |
|--------|----|----|-------------------|
| Sync methods | `abstract` | `virtual` + `[Obsolete]` (throws NotImplementedException) | Skyflow overrides them -- CLR still resolves correctly |
| Async methods | Do not exist | New `virtual` methods, delegate to sync by default | Skyflow does not override -- uses base class delegation to sync |
| `ISupportCaptureFlow` | Does not exist | Marker interface for capture support | Skyflow does not implement |
| `ISupportRefundFlow` | Does not exist | Marker interface for refund support | Skyflow does not implement |
| `AllowCartPayment` | Does not exist | Default `false` | Skyflow inherits `false` |

---

## 4. Exact Code Path to NOT_IMPLEMENTED Error

### Step-by-Step Execution Trace

```
STEP 1: GraphQL Mutation
========================
mutation {
  authorizePayment(command: {
    orderId: "...",
    paymentId: "...",
    parameters: [{ key: "skyflow_id", value: "..." }, ...]
  }) { ... }
}

STEP 2: XOrder Module -- AuthorizePaymentCommandHandler
========================================================
File: VirtoCommerce.XOrder / AuthorizePaymentCommandHandler.cs
Module: VirtoCommerce.XOrder v3.1000.0

public async Task<AuthorizePaymentResult> Handle(
    AuthorizePaymentCommand request, CancellationToken cancellationToken)
{
    var paymentInfo = await GetPaymentInfo(request);
    // paymentInfo.Payment.PaymentMethod = SkyflowPaymentMethod instance

    // 2a. Validate
    var validateResult = await paymentInfo.Payment.PaymentMethod
        .ValidatePostProcessRequestAsync(parameters, cancellationToken);
    // --> v10 base PostProcessPaymentAsync calls sync ValidatePostProcessRequest
    // --> Skyflow overrides sync version, returns {IsSuccess: true}
    // --> OK

    // 2b. Post-process (authorize payment)
    var result = await paymentInfo.Payment.PaymentMethod
        .PostProcessPaymentAsync(postProcessPaymentRequest, cancellationToken);
    // --> CONTINUES TO STEP 3...
}

STEP 3: v10 PaymentMethod Base Class -- Async-to-Sync Bridge
=============================================================
File: VirtoCommerce.PaymentModule.Core / PaymentMethod.cs (v10, runtime)
Module: VirtoCommerce.Payment v3.1000.0

// Skyflow does NOT override PostProcessPaymentAsync (it only overrides sync)
// So the v10 base class version executes:
public virtual Task<PostProcessPaymentRequestResult> PostProcessPaymentAsync(
    PostProcessPaymentRequest request, CancellationToken cancellationToken = default)
{
    return Task.FromResult(PostProcessPayment(request));
    // --> Calls sync PostProcessPayment
    // --> Skyflow DOES override this -- CONTINUES TO STEP 4...
}

STEP 4: Skyflow -- Sync PostProcessPayment
==========================================
File: VirtoCommerce.Skyflow.Data / Providers / SkyflowPaymentMethod.cs (v3.901.0)
Module: VirtoCommerce.Skyflow v3.901.0

public override PostProcessPaymentRequestResult PostProcessPayment(
    PostProcessPaymentRequest request)
{
    return PostProcessPaymentAsync(request).GetAwaiter().GetResult();
    // NOTE: This calls Skyflow's PRIVATE async method, NOT the base class async
}

// Private async helper
private async Task<PostProcessPaymentRequestResult> PostProcessPaymentAsync(
    PostProcessPaymentRequest request)
{
    var paymentMethod = await GetTargetPaymentMethod(request);
    // paymentMethod = AuthorizeNet v3.1000.0 instance

    // ... sets up Skyflow proxy parameters ...

    var result = paymentMethod.PostProcessPayment(request);
    //           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //           THIS IS THE FATAL CALL
    //           CONTINUES TO STEP 5...

    return result;
}

STEP 5: AuthorizeNet v10 -- Sync PostProcessPayment NOT Overridden
===================================================================
File: VirtoCommerce.AuthorizeNetPayment.Data / Providers / AuthorizeNetPaymentMethod.cs
Module: VirtoCommerce.AuthorizeNetPayment v3.1000.0

// AuthorizeNet v10 ONLY overrides async methods:
public override async Task<PostProcessPaymentRequestResult> PostProcessPaymentAsync(
    PostProcessPaymentRequest request, CancellationToken cancellationToken = default)
{ /* actual implementation */ }

// It does NOT override sync PostProcessPayment
// So the v10 BASE CLASS default executes:
[Obsolete]
public virtual PostProcessPaymentRequestResult PostProcessPayment(
    PostProcessPaymentRequest request)
{
    throw new NotImplementedException();  // <-- THIS IS THE ERROR
    // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    // ROOT CAUSE: AuthorizeNet v10 doesn't provide sync override
    // Skyflow calls sync method, gets NotImplementedException
}
```

### Execution Flow Diagram

```
authorizePayment mutation
  |
  v
AuthorizePaymentCommandHandler.Handle()
  |
  v
SkyflowPaymentMethod.PostProcessPaymentAsync()   <-- v10 base class (inherited)
  |  (delegates to sync)
  v
SkyflowPaymentMethod.PostProcessPayment()        <-- Skyflow override (v9 compiled)
  |  (calls private async helper)
  v
SkyflowPaymentMethod.PostProcessPaymentAsync()   <-- Private method
  |  (gets target = AuthorizeNet)
  |  (sets up Skyflow proxy params)
  |  (calls sync on target)
  v
AuthorizeNetPaymentMethod.PostProcessPayment()    <-- NOT overridden in v10!
  |  (falls to base class default)
  v
PaymentMethod.PostProcessPayment() [v10 base]
  |
  v
throw new NotImplementedException()               <-- CRASH
```

---

## 5. Why Other Payment Modules Are NOT Affected

### AuthorizeNet (v3.1000.0) -- Standalone Usage Works

When called directly (not through Skyflow), the XOrder handler calls `PostProcessPaymentAsync` (async). AuthorizeNet overrides the async version directly, so the base class sync fallback is never hit.

```
authorizePayment -> AuthorizePaymentCommandHandler
  -> AuthorizeNetPaymentMethod.PostProcessPaymentAsync()  <-- Direct async override, WORKS
```

### CyberSource (v3.803.0) -- Already v10-Compatible

CyberSource implements BOTH the v10 pattern:
- Extends `PaymentMethod`, implements `ISupportCaptureFlow, ISupportRefundFlow`
- Overrides ALL async methods: `ProcessPaymentAsync`, `PostProcessPaymentAsync`, etc.
- Does NOT throw NotImplementedException
- Has NO dependency on Skyflow proxy

```csharp
// CyberSourcePaymentMethod.cs (3.803.0)
class CyberSourcePaymentMethod(...) : PaymentMethod(...), ISupportCaptureFlow, ISupportRefundFlow
{
    public override async Task<ProcessPaymentRequestResult> ProcessPaymentAsync(...) { /* impl */ }
    public override async Task<PostProcessPaymentRequestResult> PostProcessPaymentAsync(...) { /* impl */ }
    public override async Task<CapturePaymentRequestResult> CaptureProcessPaymentAsync(...) { /* impl */ }
    public override async Task<RefundPaymentRequestResult> RefundProcessPaymentAsync(...) { /* impl */ }
    public override async Task<VoidPaymentRequestResult> VoidProcessPaymentAsync(...) { /* impl */ }
}
```

### Datatrans (v3.800.0) -- Hybrid Pattern

Datatrans uses an interesting hybrid approach:
- Overrides BOTH sync and protected async methods
- Sync methods delegate to protected async methods via `.GetAwaiter().GetResult()`
- Implements `ISupportCaptureFlow, ISupportRefundFlow`

```csharp
// DatatransPaymentMethod.cs (3.800.0)
class DatatransPaymentMethod(...) : PaymentMethod(...), ISupportCaptureFlow, ISupportRefundFlow
{
    // Sync overrides (delegate to protected async)
    public override PostProcessPaymentRequestResult PostProcessPayment(...)
    { return PostProcessPaymentAsync(request).GetAwaiter().GetResult(); }

    // Protected async (actual implementation)
    protected virtual async Task<PostProcessPaymentRequestResult> PostProcessPaymentAsync(...)
    { /* actual Datatrans API calls */ }
}
```

Datatrans works in v10 because:
1. Direct call path: v10 base `PostProcessPaymentAsync` -> sync `PostProcessPayment` (overridden) -> protected async impl -> works
2. It does NOT delegate to another payment method (no Skyflow-like proxy pattern)

### NativePaymentMethods (v3.802.0) -- Simple Passthrough

Native payment methods use a dynamic type system. They do not have complex payment processing logic and do not proxy through other payment methods.

---

## 6. Missing Interfaces and Handlers in Skyflow 3.901.0

| Required for v10 | Skyflow Has It? | Impact |
|---|---|---|
| Override `PostProcessPaymentAsync(request, cancellationToken)` | NO -- uses base class delegation to sync | Indirect: works for Skyflow itself, fails when calling target v10 method |
| Override `ProcessPaymentAsync(request, cancellationToken)` | NO | Same pattern -- would fail if target only has async |
| Override `ValidatePostProcessRequestAsync(queryString, cancellationToken)` | NO -- uses base class delegation to sync | Works because Skyflow's sync override is self-contained |
| Override `CaptureProcessPaymentAsync(request, cancellationToken)` | NO | Skyflow's sync override is self-contained (returns success), works |
| Override `RefundProcessPaymentAsync(request, cancellationToken)` | NO | Skyflow's sync override is self-contained (returns success), works |
| Override `VoidProcessPaymentAsync(request, cancellationToken)` | NO | Skyflow's sync `VoidProcessPayment` throws `NotImplementedException` directly |
| Implement `ISupportCaptureFlow` | NO | May affect UI/admin capture button visibility |
| Implement `ISupportRefundFlow` | NO | May affect UI/admin refund button visibility |
| Override `AllowCartPayment` property | NO (inherits `false`) | Cart-level payment initialization blocked |

---

## 7. GraphQL Schema Verification (Live QA)

### Endpoint: `POST https://vcst-qa.govirto.com/graphql`

The `authorizePayment` mutation IS present in the live schema:

```graphql
mutation authorizePayment(command: InputAuthorizePaymentType!): AuthorizePaymentResult
```

**InputAuthorizePaymentType fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `orderId` | String | No | Order Id |
| `paymentId` | String | Yes (NON_NULL) | Payment Id |
| `parameters` | [InputKeyValueType] | No | Input parameters |

### Skyflow-Related Mutations in Schema

The `deleteSkyflowCard` mutation is also present, confirming the Skyflow XApi module is loaded and contributing to the GraphQL schema:

```
deleteSkyflowCard(command: InputDeleteSkyflowCardCommandType!): Boolean
```

### All Payment/Order Mutations Available on QA

| Mutation | Description | Works with Skyflow? |
|----------|-------------|---------------------|
| `addOrUpdateCartPayment` | Set payment on cart | Limited (AllowCartPayment=false) |
| `clearPayments` | Clear cart payments | N/A |
| `initializeCartPayment` | Init cart-level payment | BLOCKED (AllowCartPayment=false) |
| `createOrderFromCart` | Create order from cart | OK (uses ProcessPayment) |
| `initializePayment` | Init order-level payment | Needs investigation |
| `authorizePayment` | Authorize order payment | BROKEN (NotImplementedException) |
| `addOrUpdateOrderPayment` | Update order payment | OK |

---

## 8. Admin Panel Module Status

### Module Details from `GET /api/platform/diagnostics/systeminfo`

**Skyflow Module:**
```
Module: VirtoCommerce.Skyflow
Version: 3.901.0
PlatformVersion: 3.841.0 (minimum required)
IsInstalled: true
ValidationErrors: [] (EMPTY -- no warnings!)
Dependencies:
  - VirtoCommerce.Payment >= 3.800.0
  - VirtoCommerce.Xapi >= 3.904.0
```

**Important:** The platform reports NO validation errors for Skyflow despite the incompatibility. This is because the module dependency system checks minimum version requirements (`>= 3.800.0`), and Payment 3.1000.0 satisfies `>= 3.800.0`. The incompatibility is at the **source code/API contract level**, not the manifest dependency level.

---

## 9. Recommended Fixes

### Option A: Update Skyflow Module to v10 (Recommended)

Create Skyflow 3.1000.0 with these changes:

1. **Override async methods instead of (or in addition to) sync methods:**
```csharp
public class SkyflowPaymentMethod : PaymentMethod, ISupportCaptureFlow, ISupportRefundFlow
{
    // Override the v10 async method directly
    public override async Task<PostProcessPaymentRequestResult> PostProcessPaymentAsync(
        PostProcessPaymentRequest request, CancellationToken cancellationToken = default)
    {
        var paymentMethod = await GetTargetPaymentMethod(request);
        // ... Skyflow proxy setup ...

        // Call the ASYNC version on the target payment method
        var result = await paymentMethod.PostProcessPaymentAsync(request, cancellationToken);
        return result;
    }

    // Keep sync override for backward compat
    public override PostProcessPaymentRequestResult PostProcessPayment(
        PostProcessPaymentRequest request)
    {
        return PostProcessPaymentAsync(request).GetAwaiter().GetResult();
    }
}
```

2. **Implement marker interfaces:** `ISupportCaptureFlow`, `ISupportRefundFlow`
3. **Update NuGet references:** `VirtoCommerce.PaymentModule.Core 3.1000.0`
4. **Update `module.manifest`:** Depend on `VirtoCommerce.Payment 3.1000.0`
5. **Override `AllowCartPayment`** if cart-level payment is needed
6. **Fix `VoidProcessPayment`:** Either implement or override async version

### Option B: Interim Hotfix for Skyflow (Quick Fix)

Change the ONE line in `PostProcessPaymentAsync` that calls the target method:

```diff
- var result = paymentMethod.PostProcessPayment(request);
+ var result = await paymentMethod.PostProcessPaymentAsync(request);
```

This requires:
- Adding `VirtoCommerce.PaymentModule.Core 3.1000.0` as a NuGet reference (for the async method signature)
- Releasing as 3.902.0 or 3.901.1

### Option C: Downgrade AuthorizeNet to v9 (NOT Recommended)

Downgrading AuthorizeNet to a v9 version (pre-3.1000.0) would restore sync method overrides, but this would break other v10 functionality and is counterproductive.

---

## 10. Risk Assessment for Other Payment Methods

### Will Skyflow Break with CyberSource or Datatrans as Target?

If Skyflow's `TargetPaymentMethod` setting is changed to CyberSource or Datatrans:

| Target Payment Method | Has Sync Override? | Will Skyflow Break? |
|---|---|---|
| **AuthorizeNet 3.1000.0** | NO (async only) | **YES -- NotImplementedException** |
| **CyberSource 3.803.0** | NO (async only) | **YES -- NotImplementedException** |
| **Datatrans 3.800.0** | YES (sync delegates to async) | **NO -- Would work** |
| **NativePaymentMethods 3.802.0** | Depends on implementation | Unknown |

CyberSource v3.803.0, despite being a pre-v10 version number, follows the v10 async-only pattern. This means Skyflow would also fail if configured to use CyberSource as its target payment method.

Only Datatrans v3.800.0 still provides sync overrides that Skyflow can call successfully, because Datatrans uses the hybrid pattern where sync methods delegate to protected async methods.

---

## 11. Affected Payment Flows

### Skyflow Checkout Flow (BROKEN)

```
Storefront                      Backend (QA)
    |                               |
    |-- initializePayment --------->|  Step 1: OK (uses ProcessPayment sync)
    |<-- Skyflow token/params ------|
    |                               |
    |-- [User enters card via       |
    |    Skyflow vault iframe] ---->|  Step 2: Skyflow-hosted (no backend)
    |                               |
    |-- authorizePayment ---------->|  Step 3: BROKEN
    |<-- NotImplementedException ---|
    |                               |
    |-- [Payment fails] ----------->|  Step 4: User sees error
```

### Direct AuthorizeNet Flow (WORKS)

```
Storefront                      Backend (QA)
    |                               |
    |-- authorizePayment ---------->|  Uses PostProcessPaymentAsync directly
    |<-- Success -------------------|  AuthorizeNet v10 async override works
```

---

## 12. Conclusion

### Root Cause (One Sentence)

Skyflow 3.901.0 (v9) calls the sync `PostProcessPayment()` method on its target payment method (AuthorizeNet), but AuthorizeNet 3.1000.0 (v10) only overrides the async version, causing the v10 base class to throw `NotImplementedException`.

### Classification

| Attribute | Value |
|-----------|-------|
| **Type** | Module Compatibility Break |
| **Severity** | Critical (P0) |
| **Root Cause** | v9 module calling sync API on v10 module that only implements async API |
| **Workaround** | None (code change required) |
| **Fix Required** | Skyflow module must be updated to call async methods on target payment methods |
| **v10 Release Exists** | NO -- Skyflow has no 3.1000.0+ release |
| **Blocking** | All Skyflow-proxied payments (authorizePayment mutation) |
| **Not Blocking** | Direct AuthorizeNet/CyberSource/Datatrans payments (no Skyflow proxy) |

### Action Items

1. **[DEV - Urgent]** Update `vc-module-skyflow` to v10 compatibility (see Section 9, Option A)
2. **[DEV - Urgent]** At minimum, apply hotfix to call async `PostProcessPaymentAsync` on target (Section 9, Option B)
3. **[QA]** After fix: Test `authorizePayment` with Skyflow -> AuthorizeNet target
4. **[QA]** After fix: Test `authorizePayment` with Skyflow -> CyberSource target
5. **[QA]** Test capture/refund flows with Skyflow (ISupportCaptureFlow/ISupportRefundFlow)
6. **[QA]** Test VoidProcessPayment (currently throws NotImplementedException in Skyflow itself)
7. **[PLATFORM]** Consider adding runtime compatibility warnings when v9 modules call sync methods on v10 modules

---

## Appendix A: Source Files Analyzed

| File | Repository | Version/Tag | Purpose |
|------|-----------|-------------|---------|
| `SkyflowPaymentMethod.cs` | vc-module-skyflow | 3.901.0 | Skyflow payment provider implementation |
| `AuthorizeNetPaymentMethod.cs` | vc-module-authorize-net | 3.1000.0 | AuthorizeNet v10 implementation |
| `PaymentMethod.cs` | vc-module-payment | 3.806.0 (v9) | Base class -- v9 abstract methods |
| `PaymentMethod.cs` | vc-module-payment | dev (v10) | Base class -- v10 virtual+async methods |
| `AuthorizePaymentCommandHandler.cs` | vc-module-x-order | dev | GraphQL mutation handler |
| `PaymentCommandHandlerBase.cs` | vc-module-x-order | dev | Base handler for payment commands |
| `CyberSourcePaymentMethod.cs` | vc-module-cyber-source | 3.803.0 | CyberSource implementation (for comparison) |
| `DatatransPaymentMethod.cs` | vc-module-datatrans | 3.800.0 | Datatrans implementation (for comparison) |
| `VirtoCommerce.Skyflow.Core.csproj` | vc-module-skyflow | 3.901.0 | NuGet dependency versions |
| `module.manifest` (Skyflow) | vc-module-skyflow | 3.901.0 | Module dependencies declaration |
| `module.manifest` (AuthorizeNet) | vc-module-authorize-net | dev | Module dependencies declaration |

## Appendix B: GraphQL Schema on QA

GraphQL endpoint: `POST https://vcst-qa.govirto.com/graphql`

Total mutations: 123
Payment-related mutations: 14

Key payment mutations confirmed present:
- `authorizePayment` (orderId, paymentId, parameters)
- `initializePayment` (orderId, paymentId, parameters)
- `initializeCartPayment` (cartId)
- `createOrderFromCart` (cartId)
- `addOrUpdateCartPayment` (cartId, paymentId, paymentMethodCode, ...)
- `addOrUpdateOrderPayment` (orderId, payment)
- `deleteSkyflowCard` (Skyflow-specific, confirms module loaded)

## Appendix C: NuGet Package References (Skyflow 3.901.0)

```xml
<!-- VirtoCommerce.Skyflow.Core.csproj at tag 3.901.0 -->
<PackageReference Include="VirtoCommerce.OrdersModule.Core" Version="3.800.0" />
<PackageReference Include="VirtoCommerce.PaymentModule.Core" Version="3.800.0" />
<PackageReference Include="VirtoCommerce.Platform.Core" Version="3.841.0" />
```

These v9-era NuGet references mean Skyflow was compiled against:
- `PaymentMethod` with abstract sync methods (no async methods exist in 3.800.0)
- `PaymentIn`, `CustomerOrder` models from v9
- No awareness of `ISupportCaptureFlow`, `ISupportRefundFlow`, `AllowCartPayment`
