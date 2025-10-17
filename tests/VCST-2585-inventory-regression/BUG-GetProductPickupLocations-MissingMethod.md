# 🐛 CRITICAL BUG: GetProductPickupLocations - MissingMethodException (Module Version Mismatch)

**Bug ID:** TBD  
**Priority:** 🔴 P0 - Critical  
**Severity:** High - Blocker  
**Status:** Open  
**Reported Date:** 2025-10-15  
**Environment:** QA  
**Query Name:** `GetProductPickupLocations`  
**Error Type:** Module Version Incompatibility

---

## 📋 SUMMARY

The GraphQL query `productPickupLocations` fails with `System.MissingMethodException` due to a **module version mismatch** between `VirtoCommerce.XPickup` and `VirtoCommerce.InventoryModule`. The XPickup module is attempting to call a method `set_ProductIds()` on `ProductInventorySearchCriteria` that doesn't exist in the currently deployed version of the Inventory module, indicating incompatible module versions are deployed together.

**Root Cause:** API breaking change or incompatible module versions deployed.

---

## ❌ ERROR DETAILS

### **GraphQL Error Response:**
```json
{
  "errors": [
    {
      "message": "Error trying to resolve field 'productPickupLocations'.",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": ["productPickupLocations"],
      "extensions": {
        "code": "MISSING_METHOD",
        "codes": ["MISSING_METHOD"],
        "details": "GraphQL.Execution.UnhandledError: Error trying to resolve field 'productPickupLocations'.
 ---> System.MissingMethodException: Method not found: 'Void VirtoCommerce.InventoryModule.Core.Model.Search.ProductInventorySearchCriteria.set_ProductIds(System.Collections.Generic.IList`1<System.String>)'.
   at VirtoCommerce.XPickup.Data.Services.ProductPickupLocationService.SearchProductInventoriesAsync(IList`1 productIds)
   at VirtoCommerce.XPickup.Data.Services.ProductPickupLocationService.SearchPickupLocationsAsync(SingleProductPickupLocationSearchCriteria searchCriteria) 
      in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Services/ProductPickupLocationService.cs:line 65
   at VirtoCommerce.XPickup.Data.Queries.GetProductPickupLocationsQueryHandler.Handle(SearchProductPickupLocationsQuery request, CancellationToken cancellationToken) 
      in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Queries/GetProductPickupLocationsQueryHandler.cs:line 33"
      }
    }
  ],
  "data": {
    "productPickupLocations": null
  }
}
```

---

## 🔧 ROOT CAUSE ANALYSIS

### **Exception Type:** 
`System.MissingMethodException`

### **Missing Method:**
```csharp
Method: set_ProductIds(System.Collections.Generic.IList<System.String>)
Class: VirtoCommerce.InventoryModule.Core.Model.Search.ProductInventorySearchCriteria
Property Setter: ProductIds
```

### **Error Location:**
- **Module:** `VirtoCommerce.XPickup.Data`
- **Service:** `ProductPickupLocationService`
- **Method:** `SearchProductInventoriesAsync(IList<string> productIds)`
- **File:** `ProductPickupLocationService.cs`
- **Line:** 65

### **Call Chain:**
```
1. GraphQL Query: productPickupLocations
   ↓
2. GetProductPickupLocationsQueryHandler.Handle() [Line 33]
   ↓
3. ProductPickupLocationService.SearchPickupLocationsAsync() [Line 65]
   ↓
4. ProductPickupLocationService.SearchProductInventoriesAsync()
   ↓
5. Attempts to set: ProductInventorySearchCriteria.ProductIds
   ↓
6. ❌ FAILS: Method not found - set_ProductIds()
```

---

## 🎯 ROOT CAUSE

### **Primary Cause: Module Version Incompatibility**

The deployed versions of the following modules are incompatible:

| Module | Issue |
|--------|-------|
| **VirtoCommerce.XPickup** | Expecting NEW API signature |
| **VirtoCommerce.InventoryModule.Core** | Providing OLD API signature |

### **What Changed:**

**XPickup Module Expects (NEW):**
```csharp
public class ProductInventorySearchCriteria
{
    // Property with setter
    public IList<string> ProductIds { get; set; }
}

// Usage in XPickup:
criteria.ProductIds = productIds; // Calls set_ProductIds()
```

**Inventory Module Provides (OLD):**
```csharp
public class ProductInventorySearchCriteria
{
    // Possible old implementations:
    // Option 1: Read-only property
    public IList<string> ProductIds { get; }
    
    // Option 2: Different property name
    public IList<string> ProductId { get; set; }
    
    // Option 3: Different type
    public string[] ProductIds { get; set; }
    
    // Option 4: Constructor-only
    public ProductInventorySearchCriteria(IList<string> productIds)
}
```

### **API Breaking Change:**

One of these scenarios occurred:
1. **Inventory module was downgraded** - Older version doesn't have `ProductIds` setter
2. **XPickup module was upgraded** - Newer version expects API that doesn't exist yet
3. **API signature changed** - Property type or access modifiers changed
4. **Missing dependency update** - Package references are out of sync

---

## 🔍 AFFECTED FUNCTIONALITY

### **Broken Features:**
- ❌ Pickup location search
- ❌ Store availability display
- ❌ "Buy Online, Pick up In Store" (BOPIS)
- ❌ Fulfillment center information
- ❌ Product availability by location
- ❌ Inventory queries by product

### **Impact:**
- 🔴 **Critical**: Pickup functionality completely broken
- 🔴 **High**: BOPIS feature unavailable
- 🟡 **Medium**: Users cannot see store availability
- 🟢 **Low**: Product page still renders

---

## 🔄 STEPS TO REPRODUCE

1. **Navigate to product page:**
   ```
   https://vcst-qa-storefront.govirto.com/alcoholic-drinks/distilled/absolut-blue-vodka-bottle-100l
   ```

2. **Open Browser DevTools**
   - Console tab
   - Network tab → Filter "graphql"

3. **Trigger pickup locations query** (if UI exists)
   - Or execute manually via GraphQL

4. **Observe the error:**
   - GraphQL error code: `MISSING_METHOD`
   - Data returned: null
   - MissingMethodException in details

**Test Product:**
- **Product ID:** `476b0f12-26f7-4813-aab2-df675ffb0746`
- **SKU:** `LJO-92804653`
- **Store:** B2B-store

---

## ✅ EXPECTED BEHAVIOR

1. `productPickupLocations` query executes successfully
2. Returns list of pickup locations with inventory data
3. Each location shows available quantity
4. No exceptions or errors
5. BOPIS functionality works correctly

---

## 🔨 IMMEDIATE FIX REQUIRED

### **Option 1: Update Module Versions (RECOMMENDED)**

**Check and align module versions:**

```bash
# Check current versions
dotnet list package --include-transitive | grep VirtoCommerce

# Required compatible versions:
VirtoCommerce.XPickup: [Check compatible version]
VirtoCommerce.InventoryModule.Core: [Check compatible version]
```

**Update to compatible versions:**
```xml
<PackageReference Include="VirtoCommerce.InventoryModule.Core" Version="X.Y.Z" />
<PackageReference Include="VirtoCommerce.XPickup" Version="A.B.C" />
```

### **Option 2: Temporary Workaround in XPickup**

**File:** `ProductPickupLocationService.cs` (Line ~65)

**Current Code:**
```csharp
var criteria = new ProductInventorySearchCriteria
{
    ProductIds = productIds // This fails
};
```

**Workaround (if property is read-only):**
```csharp
// Option A: Use constructor if available
var criteria = new ProductInventorySearchCriteria(productIds);

// Option B: Use reflection as temporary fix (NOT RECOMMENDED for production)
var criteria = new ProductInventorySearchCriteria();
var productIdsProperty = criteria.GetType().GetProperty("ProductIds");
productIdsProperty?.SetValue(criteria, productIds);

// Option C: Use method if available
var criteria = new ProductInventorySearchCriteria();
criteria.SetProductIds(productIds);
```

### **Option 3: Rollback Incompatible Module**

If one module was recently updated, rollback to previous compatible version:

```bash
# Rollback XPickup module
# OR
# Rollback Inventory module

# Ensure versions are compatible per compatibility matrix
```

---

## 📊 MODULE VERSION INFORMATION NEEDED

### **Please provide current versions:**

```
VirtoCommerce.XPickup: [VERSION]
VirtoCommerce.XPickup.Data: [VERSION]
VirtoCommerce.InventoryModule: [VERSION]
VirtoCommerce.InventoryModule.Core: [VERSION]
VirtoCommerce.InventoryModule.Data: [VERSION]
VirtoCommerce.Platform.Core: [VERSION]
```

### **Check Module Compatibility Matrix:**
- Refer to Virto Commerce documentation
- Check release notes for breaking changes
- Verify dependency versions in project files

---

## 🎯 RESOLUTION STEPS

### **Step 1: Identify Version Mismatch**
```bash
# On server/deployment
cd [application-directory]

# Check module versions
grep -r "VirtoCommerce.XPickup" *.csproj
grep -r "VirtoCommerce.InventoryModule" *.csproj

# Check DLL versions
ls -la Modules/VirtoCommerce.XPickup*/
ls -la Modules/VirtoCommerce.Inventory*/
```

### **Step 2: Review Recent Changes**
- Check deployment history
- Review recent module updates
- Check if any module was upgraded/downgraded recently

### **Step 3: Update to Compatible Versions**
- Consult Virto Commerce compatibility matrix
- Update both modules to compatible versions
- Test in dev environment first

### **Step 4: Verify Fix**
```graphql
query TestPickupLocations {
  productPickupLocations(
    storeId: "B2B-store"
    productId: "476b0f12-26f7-4813-aab2-df675ffb0746"
  ) {
    items {
      fulfillmentCenterId
      fulfillmentCenterName
      quantity
    }
  }
}
```

### **Step 5: Regression Testing**
- Test all pickup-related features
- Verify BOPIS functionality
- Check inventory queries
- Test product availability display

---

## 📎 TECHNICAL DETAILS

### **Affected Files:**

**XPickup Module:**
- `VirtoCommerce.XPickup.Data/Services/ProductPickupLocationService.cs:65`
- `VirtoCommerce.XPickup.Data/Queries/GetProductPickupLocationsQueryHandler.cs:33`

**Inventory Module:**
- `VirtoCommerce.InventoryModule.Core/Model/Search/ProductInventorySearchCriteria.cs`

### **GraphQL Schema:**
```graphql
type Query {
  productPickupLocations(
    storeId: String!
    productId: String!
    cultureName: String
  ): ProductPickupLocationConnection
}

type ProductPickupLocationConnection {
  items: [ProductPickupLocation]
  totalCount: Int
}

type ProductPickupLocation {
  fulfillmentCenterId: String
  fulfillmentCenterName: String
  quantity: Int
  isAvailable: Boolean
}
```

---

## 🔬 DIAGNOSTIC QUERIES

### **Check Module Versions via GraphQL:**
```graphql
query GetModuleInfo {
  modules {
    id
    version
    title
  }
}
```

### **Alternative Inventory Query:**
```graphql
query CheckInventoryDirectly {
  product(storeId: "B2B-store", id: "476b0f12-26f7-4813-aab2-df675ffb0746") {
    id
    availabilityData {
      inventories {
        fulfillmentCenterId
        fulfillmentCenterName
        inStockQuantity
      }
    }
  }
}
```

---

## 🎯 ACCEPTANCE CRITERIA

### **Fix is Complete When:**

- [ ] Module versions are aligned and compatible
- [ ] `productPickupLocations` query executes without errors
- [ ] Returns pickup location data successfully
- [ ] No `MISSING_METHOD` errors in logs
- [ ] BOPIS functionality restored
- [ ] All inventory-related queries work
- [ ] Unit tests pass for XPickup module
- [ ] Integration tests pass
- [ ] Compatibility verified in dev environment
- [ ] QA regression testing completed
- [ ] Module version matrix updated
- [ ] Documentation updated with compatible versions
- [ ] Release notes updated

---

## 📊 ENVIRONMENT DETAILS

### **Frontend:**
- **Version:** `2.33.0-pr-1992-29d7-29d7165b`
- **Platform:** Virto Commerce Storefront
- **URL:** https://vcst-qa-storefront.govirto.com
- **Environment:** QA

### **Backend Modules (Versions Needed):**
- **VirtoCommerce.XPickup:** [UNKNOWN - NEED VERSION]
- **VirtoCommerce.XPickup.Data:** [UNKNOWN - NEED VERSION]
- **VirtoCommerce.InventoryModule:** [UNKNOWN - NEED VERSION]
- **VirtoCommerce.InventoryModule.Core:** [UNKNOWN - NEED VERSION]
- **VirtoCommerce.Platform.Core:** [UNKNOWN - NEED VERSION]

### **Browser:**
- **Browser:** Chrome 141.0.7390.66
- **OS:** Windows 10 (Build 26200)

---

## 🚨 URGENCY JUSTIFICATION

### **Why This is P0-Critical:**

1. **Complete Feature Failure**
   - Entire pickup/BOPIS feature is broken
   - No workaround available for users

2. **Module Incompatibility**
   - Indicates deployment/versioning issue
   - May affect other modules/features

3. **Easy to Diagnose**
   - Clear error message
   - Known issue type (version mismatch)

4. **Quick Fix Possible**
   - Update module versions
   - No code changes needed (likely)

5. **Risk of Other Issues**
   - If modules are mismatched, other features may also be broken
   - Needs immediate investigation

---

## 📝 ACTION ITEMS

### **For DevOps:**
- [ ] Check deployed module versions
- [ ] Review recent deployments
- [ ] Verify module compatibility matrix
- [ ] Update to compatible versions

### **For Backend Team:**
- [ ] Review breaking changes in Inventory module
- [ ] Check XPickup module dependencies
- [ ] Update package references
- [ ] Add compatibility tests

### **For QA Team:**
- [ ] Verify fix in dev environment
- [ ] Test all pickup-related features
- [ ] Regression test inventory queries
- [ ] Document compatible module versions

---

## 🔗 RELATED DOCUMENTATION

- Virto Commerce Module Compatibility Matrix
- InventoryModule Release Notes
- XPickup Module Release Notes
- Breaking Changes Documentation
- Deployment History

---

## 📋 LABELS FOR JIRA

`bug`, `critical`, `p0`, `module-version-mismatch`, `breaking-change`, `graphql`, `xpickup`, `inventory`, `missing-method`, `deployment`, `backend`, `QA`

---

**Reporter:** QA Automation / Chrome DevTools MCP  
**Last Updated:** 2025-10-15  
**Bug Report Version:** 1.0  
**Status:** 🔴 CRITICAL - REQUIRES IMMEDIATE DEVOPS/BACKEND INVESTIGATION

---

## 💡 KEY TAKEAWAY

**This is NOT a code bug - this is a MODULE VERSION INCOMPATIBILITY issue.**

The code in XPickup module is correct, but it's expecting a newer version of the Inventory module API that isn't deployed. This typically happens when:
- Modules are updated independently
- Incompatible versions are deployed together
- Breaking changes aren't properly communicated
- Deployment order is incorrect

**Fix:** Align module versions according to compatibility matrix.

