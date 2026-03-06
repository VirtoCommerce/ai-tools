---
description: "[Testing] REST API & GraphQL xAPI: authentication, CRUD, error handling, pagination, search."
argument-hint: "endpoint | module name | graphql | full"
---

# /qa-api — API & GraphQL Testing

Test Virto Commerce Platform REST APIs and GraphQL xAPI endpoints. Covers authentication, CRUD operations, error handling, pagination, and search.

## Usage
```
/qa-api auth                         # Test authentication endpoints
/qa-api catalog                      # Test catalog API endpoints
/qa-api graphql cart                  # Test xCart GraphQL queries/mutations
/qa-api full                         # Full API test suite (Suite 14 + 15)
/qa-api POST /api/orders             # Test a specific endpoint
```

## Supporting Files

- **test-cases-api-graphql.md** — Complete REST API test cases (Suite 14, 25 tests) and GraphQL xAPI test cases (Suite 15): authentication, CRUD operations, catalog, orders, customers, inventory, search, error handling, pagination, permissions

## Execution

1. **Identify test scope:**
   - Specific endpoint → test that endpoint with all methods and edge cases
   - Module name → test all endpoints for that module
   - `graphql` → test GraphQL xAPI queries and mutations
   - `full` → run both Suite 14 (REST) and Suite 15 (GraphQL)

2. **Delegate to qa-backend-expert** via Task tool (`subagent_type: qa-backend-expert`):
   - Pass endpoint scope, `BACK_URL` from environment, admin credentials
   - Agent reads `test-cases-api-graphql.md` for test patterns
   - Agent uses Postman MCP or direct HTTP calls via Playwright

3. **REST API Testing (Suite 14):**
   - **Authentication:** Token endpoint, JWT validation, refresh, invalid creds
   - **CRUD Operations:** Create, read, update, delete for each resource
   - **Error Handling:** 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)
   - **Pagination:** Proper skip/take, total count, boundary conditions
   - **Search:** Query parameters, filters, sorting

4. **GraphQL xAPI Testing (Suite 15):**
   - **Queries:** xCatalog (products, categories), xCart, xOrder, xCMS
   - **Mutations:** addItem, removeItem, updateQuantity, createOrder
   - **Error handling:** Partial errors (200 with errors array), validation errors
   - **Performance:** Query complexity, n+1 detection

5. **Output:**
   - API test report: pass/fail per endpoint with response codes
   - Performance metrics (response times)
   - Errors captured with full request/response bodies
   - Save to `reports/` per output path conventions

## Rules
- Always test both happy path and error cases for every endpoint
- Verify response schema, not just status code
- Test with both admin and regular user tokens for permission checks
- GraphQL: always check for partial errors (status 200 but `errors` array present)
- Never hardcode credentials — use environment variables from `config.js`
