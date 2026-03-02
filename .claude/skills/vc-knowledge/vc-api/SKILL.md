---
description: "[VC Knowledge] xAPI & REST API reference: queries, mutations, authentication, common operations."
argument-hint: "xCart | xCatalog | xOrder | REST endpoint"
---

# /vc-api — API & xAPI Explorer

Explore Virto Commerce Platform REST API and GraphQL xAPI. Provides query references, mutation examples, authentication patterns, and common operation templates.

## Usage
```
/vc-api xCart                        # xCart queries and mutations reference
/vc-api xCatalog                     # xCatalog product/category queries
/vc-api xOrder                       # xOrder queries and mutations
/vc-api REST catalog                 # REST catalog endpoints
/vc-api auth                         # Authentication token flow
```

## Supporting Files

- **xapi-query-ref.md** — Quick reference for all GraphQL xAPI modules (xCart, xCatalog, xOrder, xCMS, xProfile) with example queries, mutations, variables, and common patterns. Includes REST API authentication and CRUD templates.

## Execution

1. **Identify the API scope:**
   - xAPI module name (xCart, xCatalog, xOrder, xCMS, xProfile)
   - REST endpoint or resource type
   - Specific operation (query, mutation, CRUD)

2. **Provide reference from supporting file:**
   - Read `xapi-query-ref.md` for the relevant section
   - Include example queries/mutations with variables
   - Show authentication requirements

3. **Supplement with Context7:**
   - Query `/virtocommerce/vc-docs` for latest API documentation
   - The xAPI was revamped July 2024 — always check for current module structure:
     - `vc-module-x-cart` (was part of ExperienceApi)
     - `vc-module-x-catalog` (was part of ExperienceApi)
     - `vc-module-x-order` (was part of ExperienceApi)
     - `vc-module-x-cms` (new)
     - `vc-module-x-profile` (was part of ExperienceApi)

4. **Output:**
   - Ready-to-use query/mutation examples
   - Required variables and authentication headers
   - Common patterns (pagination, filtering, error handling)
   - Links to relevant VC documentation sections

## xAPI Modules Quick Reference

| Module | Purpose | Key Operations |
|--------|---------|----------------|
| **xCart** | Shopping cart operations | addItem, removeItem, updateQuantity, addCoupon, clearCart |
| **xCatalog** | Product and category queries | products, product, categories, searchProducts |
| **xOrder** | Order management | createOrderFromCart, orders, order, changeOrderStatus |
| **xCMS** | Content management | pages, menus, contentItems |
| **xProfile** | User profiles and orgs | me, organization, contacts, updateProfile |

## REST API Sections

| Section | Base Path | Auth |
|---------|-----------|------|
| Authentication | `/connect/token` | None (returns JWT) |
| Catalog | `/api/catalog/` | Bearer token |
| Orders | `/api/order/` | Bearer token |
| Customers | `/api/contacts/`, `/api/members/` | Bearer token |
| Platform | `/api/platform/` | Bearer token |
| Search | `/api/search/` | Bearer token |

## Rules
- Always use environment variables (`BACK_URL`, `ADMIN`, `ADMIN_PASSWORD`) — never hardcode
- GraphQL xAPI runs on `{BACK_URL}/graphql` with the same auth token
- Check for partial errors in GraphQL (200 status with `errors` array)
- REST pagination uses `skip` and `take` parameters
