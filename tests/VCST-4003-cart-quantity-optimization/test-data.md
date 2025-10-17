# Test Data Specifications: VCST-4003

## Overview

This document specifies the test data requirements for testing VCST-4003: Optimized Cart Quantity Updates on Category Page.

---

## Test Users

### Primary Test User

| Field | Value |
|-------|-------|
| **Email** | `test_user@example.com` |
| **Password** | `[Test Password]` |
| **User Type** | Registered Customer |
| **Permissions** | Standard customer access |
| **Cart** | Pre-populated with test products |

### Additional Test Users

| User Type | Email | Purpose |
|-----------|-------|---------|
| Guest User | N/A (guest session) | Guest checkout testing |
| VIP User | `vip_user@example.com` | Special limits testing (if applicable) |
| Wholesale User | `wholesale_user@example.com` | Different quantity limits (if applicable) |
| New User | `new_user@example.com` | First-time cart usage |

---

## Test Products

### Product A: Standard Product (No Limits)

| Field | Value |
|-------|-------|
| **Product ID** | `product-a-001` |
| **Product Name** | Standard Widget |
| **SKU** | STD-WIDGET-001 |
| **Price** | $19.99 |
| **Stock** | 9999 (high stock) |
| **Max Quantity** | 9999 (system default) |
| **Min Quantity** | 1 |
| **Category** | Electronics |

**Purpose**: Testing standard cart operations without quantity restrictions

---

### Product B: Limited Quantity Product

| Field | Value |
|-------|-------|
| **Product ID** | `product-b-002` |
| **Product Name** | Premium Gadget |
| **SKU** | PREM-GADGET-002 |
| **Price** | $49.99 |
| **Stock** | 100 |
| **Max Quantity** | 10 (per order limit) |
| **Min Quantity** | 1 |
| **Category** | Electronics |

**Purpose**: Testing maximum quantity limits enforcement

---

### Product C: Low Stock Product

| Field | Value |
|-------|-------|
| **Product ID** | `product-c-003` |
| **Product Name** | Rare Item |
| **SKU** | RARE-ITEM-003 |
| **Price** | $99.99 |
| **Stock** | 3 (low stock) |
| **Max Quantity** | 3 (limited by stock) |
| **Min Quantity** | 1 |
| **Category** | Collectibles |

**Purpose**: Testing stock availability constraints

---

### Product D: Bulk Product (Minimum Order Quantity)

| Field | Value |
|-------|-------|
| **Product ID** | `product-d-004` |
| **Product Name** | Wholesale Parts |
| **SKU** | BULK-PARTS-004 |
| **Price** | $5.99 |
| **Stock** | 5000 |
| **Max Quantity** | 500 |
| **Min Quantity** | 5 (MOQ) |
| **Category** | Parts & Supplies |

**Purpose**: Testing minimum order quantity enforcement

---

### Product E: High-Value Product

| Field | Value |
|-------|-------|
| **Product ID** | `product-e-005` |
| **Product Name** | Luxury Item |
| **SKU** | LUX-ITEM-005 |
| **Price** | $999.99 |
| **Stock** | 50 |
| **Max Quantity** | 5 (restricted) |
| **Min Quantity** | 1 |
| **Category** | Luxury |

**Purpose**: Testing high-value product handling

---

## Pre-populated Cart Scenarios

### Scenario 1: Empty Cart

**Description**: User has no items in cart  
**Use Cases**: TC-004 (adding first item), TC-007 (icon starts at 0)

---

### Scenario 2: Single Product Cart

**Cart Contents**:
- Product A: Quantity 1

**Use Cases**: TC-001, TC-004, TC-005, TC-006

---

### Scenario 3: Multiple Products Cart

**Cart Contents**:
- Product A: Quantity 2
- Product B: Quantity 3
- Product C: Quantity 1

**Total Items**: 6  
**Use Cases**: TC-002, TC-003, TC-007, TC-010

---

### Scenario 4: Near-Limit Cart

**Cart Contents**:
- Product B: Quantity 9 (max is 10)
- Product C: Quantity 3 (max is 3, at limit)

**Use Cases**: TC-019 (boundary testing)

---

### Scenario 5: Large Cart

**Cart Contents**:
- Product A: Quantity 50
- Product B: Quantity 10
- Product D: Quantity 100
- Product E: Quantity 5
- Plus 5 more products with varying quantities

**Total Items**: ~200  
**Use Cases**: TC-010 (multiple rapid changes), TC-014 (performance testing)

---

## Test Environment Data

### Software Versions

**Frontend**:
- **Repository**: [vc-frontend](https://github.com/VirtoCommerce/vc-frontend/pull/1992)
- **Pull Request**: #1992
- **Theme**: vc-theme-b2b-vue 2.33.0-pr-1992-29d7-29d7165b
- **Package**: [vc-theme-b2b-vue-2.33.0-pr-1992-29d7-29d7165b.zip](https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-2.33.0-pr-1992-29d7-29d7165b.zip)

**Backend Modules**:
- **VirtoCommerce.Cart**: 3.837.0-pr-178-8871
- **VirtoCommerce.XCart**: 3.945.0-pr-85-b869
- **VirtoCommerce.Customer**: 3.841.0-pr-281-3ad0

### Environment URLs

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `https://dev.example.com` | Initial development testing |
| Staging | `https://staging.example.com` | Full test cycle execution |
| Pre-Production | `https://preprod.example.com` | Final validation before release |
| Production | `https://www.example.com` | Post-release smoke testing |

### GraphQL Endpoints

| Environment | GraphQL URL |
|-------------|-------------|
| Staging | `https://staging.example.com/graphql` |
| Pre-Prod | `https://preprod.example.com/graphql` |

---

## Test Scenarios Data

### Network Conditions

| Scenario | Throttle Setting | Use Case |
|----------|------------------|----------|
| Fast Network | No throttle | Baseline testing |
| Good 4G | 4G (4Mbps, 20ms) | Typical mobile |
| Slow 3G | Slow 3G (400Kbps, 400ms) | Poor mobile connection |
| Offline | Offline mode | TC-015 (network failure) |

### Session Configurations

| Scenario | Session Timeout | Use Case |
|----------|-----------------|----------|
| Normal | 30 minutes | Standard testing |
| Short | 5 minutes | TC-017 (session expiry testing) |
| Long | 4 hours | Endurance testing |

---

## Browser and Device Matrix

### Desktop Browsers

| Browser | Version | OS | Resolution |
|---------|---------|----|-----------| 
| Chrome | Latest stable | Windows 10 | 1920x1080 |
| Firefox | Latest stable | Windows 10 | 1920x1080 |
| Safari | Latest stable | macOS 12+ | 1920x1080 |
| Edge | Latest stable | Windows 10 | 1920x1080 |

### Mobile Devices

| Device | OS | Browser | Resolution |
|--------|----|---------| -----------|
| iPhone SE | iOS 15+ | Safari | 375x667 |
| iPhone 12 | iOS 15+ | Safari | 390x844 |
| Samsung Galaxy S21 | Android 11+ | Chrome | 360x800 |
| iPad | iOS 15+ | Safari | 768x1024 |

---

## Performance Test Data

### Load Testing Users

| User Count | Scenario | Purpose |
|------------|----------|---------|
| 10 | Light load | Baseline |
| 50 | Normal load | Expected typical usage |
| 100 | Peak load | High traffic periods |
| 200+ | Stress test | Find breaking point |

### Load Test Duration

| Test Type | Duration | Purpose |
|-----------|----------|---------|
| Smoke Test | 2 minutes | Quick validation |
| Normal Load | 10 minutes | Standard load test |
| Peak Load | 10 minutes | Peak traffic simulation |
| Stress Test | 5-10 minutes | Breaking point |
| Endurance | 1-2 hours | Memory leak detection |

---

## Quantity Test Values

### Valid Quantities

| Value | Purpose |
|-------|---------|
| 1 | Minimum valid quantity |
| 2, 3, 5 | Small quantities |
| 10, 20, 50 | Medium quantities |
| 100, 500 | Large quantities |
| 9999 | System maximum |

### Invalid Quantities

| Value | Expected Behavior | Test Case |
|-------|-------------------|-----------|
| -1, -5 | Rejected | TC-016 |
| 0 | Remove item | TC-006 |
| 5.5, 10.7 | Rounded or rejected | TC-016 |
| "abc", "xyz" | Validation error | TC-016 |
| 99999999 | Capped or rejected | TC-016, TC-019 |
| NULL, undefined | Validation error | TC-016 |
| `<script>` | Sanitized (XSS prevention) | TC-016 |

---

## GraphQL Mutation Test Payloads

### Single Product Update

```json
{
  "query": "mutation updateCartQuantity($cartId: String!, $items: [CartQuantityInput!]!) { ... }",
  "variables": {
    "cartId": "test-cart-123",
    "items": [
      {
        "productId": "product-a-001",
        "quantity": 3
      }
    ]
  }
}
```

### Multiple Products Update (Batched)

```json
{
  "query": "mutation updateCartQuantity($cartId: String!, $items: [CartQuantityInput!]!) { ... }",
  "variables": {
    "cartId": "test-cart-123",
    "items": [
      { "productId": "product-a-001", "quantity": 5 },
      { "productId": "product-b-002", "quantity": 2 },
      { "productId": "product-c-003", "quantity": 1 }
    ]
  }
}
```

### Product Removal (Quantity = 0)

```json
{
  "variables": {
    "cartId": "test-cart-123",
    "items": [
      { "productId": "product-a-001", "quantity": 0 }
    ]
  }
}
```

---

## Expected Response Formats

### Success Response (Lightweight)

```json
{
  "data": {
    "updateCartQuantity": {
      "cartId": "test-cart-123",
      "lineItems": [
        { "productId": "product-a-001", "quantity": 3 }
      ]
    }
  }
}
```

### Error Response

```json
{
  "errors": [
    {
      "message": "Product not found",
      "path": ["updateCartQuantity"],
      "extensions": {
        "code": "PRODUCT_NOT_FOUND"
      }
    }
  ]
}
```

---

## Test Data Cleanup

### After Each Test
- Clear browser cache and cookies
- Reset cart to known state
- Clear localStorage/sessionStorage

### After Test Cycle
- Remove test user accounts (if temporary)
- Reset product stock levels
- Clear test orders
- Clean up test data from database

---

## Data Security Considerations

### Sensitive Data Handling

| Data Type | Handling |
|-----------|----------|
| User passwords | Use test passwords, never production |
| Payment info | Never use real payment details |
| Personal info | Use fictional data only |
| Production data | Never use in test environment |

### Test Data Isolation

- Test data should be clearly marked
- Separate test database from production
- Test user emails should be obviously test accounts (e.g., `test_*@example.com`)

---

## Test Data Maintenance

### Responsibilities

| Task | Responsible | Frequency |
|------|-------------|-----------|
| Create test products | QA Lead | Before test cycle |
| Maintain test users | QA Team | Weekly |
| Reset test data | QA Team | After each major test cycle |
| Validate data integrity | QA Lead | Before each test cycle |

### Data Refresh Schedule

| Environment | Refresh Frequency | Notes |
|-------------|-------------------|-------|
| Development | Daily | Automated refresh |
| Staging | Weekly | Manual refresh with latest production data (sanitized) |
| Pre-Production | Before each release | Production-like data |

---

## Notes

- All test data should be non-production and clearly identifiable
- Product IDs, SKUs, and other identifiers should follow test naming conventions
- Test users should have obvious test account names
- Ensure test data doesn't interfere with analytics or monitoring
- Document any special test data configurations for specific test cases
- Maintain a test data repository for reusability across test cycles

---

## Related Documents

- [Test Plan](test-plan.md)
- [Test Cases](TC-001-immediate-ui-feedback.md) through [TC-020](TC-020-cross-browser-compatibility.md)
- [Test Execution Report](TEST-EXECUTION-REPORT.md)

