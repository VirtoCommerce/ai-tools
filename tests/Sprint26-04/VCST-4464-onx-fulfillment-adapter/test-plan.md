# Test Plan: Commerce Operations Foundation Protocol (onX) - Fulfilment Adapter (VCST-4464)

## 1. TEST PLAN IDENTIFIER
- **ID:** TP_VCST_4464
- **Version:** 1.0
- **Date:** 2026-03-03
- **Author:** qa-lead-orchestrator
- **JIRA:** VCST-4464 - Commerce Operation Foundation Protocol (onX) - Fulfilment Adapter - Create Order Flow

## 2. INTRODUCTION

### 2.1 Purpose
This test plan describes the testing approach for the Universal OMS MCP Server Fulfilment Adapter, which implements the `IFulfillmentAdapter` interface as an NPM package to connect the MCP Reference Server with the Virto Commerce platform API. Testing validates that AI agents and MCP-aware clients can securely perform commerce operations (orders, products, inventory) using MCP's standardized onX interface.

### 2.2 Scope

**Testing Scope (from Oleg Zhuk comment):** Query and Create Order

**In Scope:**
- Query Tools: Get Order, Get Customer, Get Product, Get Inventory, Get Shipment, Get Buyer
- Action Tools: Capture (Create) Order, Cancel Order, Update Order, Return Order, Exchange Order, Ship Order
- Management Tools: Hold Order, Split Order, Reserve Inventory
- Complex multi-tool workflow operations
- Error handling and validation (invalid IDs, non-existent resources)
- Business logic enforcement (status-dependent operations)
- Mock adapter test data verification

**Out of Scope:**
- MCP Reference Server infrastructure (external standard)
- Virto Commerce platform API internals (backend, tested separately)
- MCP protocol transport layer
- Production deployment and performance under load

### 2.3 References
- **JIRA:** https://virtocommerce.atlassian.net/browse/VCST-4464
- **Commerce Operations Foundation:** https://commerceopsfoundation.org/
- **MCP Reference Server Docs:** https://github.com/commerce-operations-foundation/mcp-reference-server/blob/develop/docs/README.md
- **MCP Reference Server FAQ:** https://github.com/commerce-operations-foundation/mcp-reference-server/blob/develop/docs/resources/faq.md

## 3. TEST DATA

### 3.1 Mock Adapter Data (from JIRA comment)

The mock adapter ships with pre-populated test data that references real Virto Commerce QA catalog items.

**Mock Orders** (exist only in mock adapter, NOT in QA platform):

| Order ID (UUID) | Order Number | Status | Customer | Products |
|-----------------|-------------|--------|----------|----------|
| `95bee1c2-f6b6-4eef-b9fd-df260b980d71` | CO220518-00001 | new | b2b admin | Brother MFC-L6700DW |
| `9eebb423-619b-4fcb-a52e-82e367ae37cc` | CO220715-00001 | processing | b2b admin | Epson XP-820 + XP-830 |

**Mock Customers** (mock adapter only):

| Customer ID (UUID) | Name | Email | Tags |
|-------------------|------|-------|------|
| `cb0a5340-f9fb-4f49-bd62-9d03518868ff` | b2b admin | b2badmin@test.com | VIP, Wholesaler |
| `fa90d0b3-4bf5-4fc8-8c7c-787cafc4c678` | Alla Volkova | allagrvolkova@mail.ru | — |

### 3.2 Real QA Data (verified 2026-03-03 from https://vcst-qa.govirto.com)

**Orders created by adapter testing** (verified in QA):

| Order Number | Order ID | Status | Customer | Total | Products |
|-------------|----------|--------|----------|-------|----------|
| TEST-ACTION-001 | `66d5a176-5bbf-49d3-b328-f6fc883a14a0` | New | Elena Mutykova | $1,632 USD | Brother MFC-L6700DW (SKU:564698896, qty:3, $539) |
| TEST-ACTION-002 | `924c19b2-81f1-4568-ad97-c5e224e1d26a` | Cancelled | Elena Mutykova | $199 USD | Canon Imageclass WiFi MF232W (SKU:566903892, qty:1, $189) |

**Orders by status** (for business logic testing):

| Status | Example Order | Order ID | Customer | Total |
|--------|--------------|----------|----------|-------|
| New | CO260228-00004 | `2031dddf-40e4-4b48-ab4f-61eaef27cfd8` | Elena Mutykova | $91,366.70 |
| Processing | CO260225-00004 | `5c42fb4e-07f8-46ae-861e-00ea05bba9aa` | Elena Mutykova | $420.00 |
| Completed | CO251202-00010 | `ab256b56-210e-4187-91ff-79764b32ca02` | Noni Burgadze | $1,459.26 |
| Cancelled | TEST-ACTION-002 | `924c19b2-81f1-4568-ad97-c5e224e1d26a` | Elena Mutykova | $199.00 |

**QA Platform statistics:** 7,344 total orders | 3,043 New | 1,941 Processing | 137 Completed | 29 Cancelled

**Customers** (verified in QA):

| Customer ID | Name | Email | Status |
|------------|------|-------|--------|
| `ef67c13e-e7a9-4beb-94d8-3f329a46c031` | Elena Mutykova | *(primary test user)* | Approved |
| `2afc394a-c1e2-41ad-bd3a-c0e27705a12d` | Elena Mutykova | *(used in TEST-ACTION orders)* | Approved |
| `cee67275-ab62-4769-8887-53d15c9b33eb` | Mila Muller | milamuller2024@yahoo.com | Approved |
| `3c0305ee-f94e-4229-8fdc-c071fc24d8d3` | Smoke Tester | smoke.tester.26022700@mailtest.com | Approved |
| `120d0d0f-f619-4e3d-b2e5-bdcbae1e2ecc` | Noni Burgadze | crefroubroicrammu-2450@yopmail.com | Approved |

**QA Platform statistics:** 376 total contacts

### 3.3 Products/SKUs (shared between mock adapter and QA catalog)

All three products are confirmed active in QA catalog (`catalogId: 5aa50aaea01544529a6b6d576a668439`):

| Product ID | SKU | QA Name | Price |
|-----------|-----|---------|-------|
| `47e4aaef9c9e4326924d4a4080f461a5` | 564698896 | Huge In stock!!! Do not add to cart! LOAD TEST Brother MFC-L6700DW Wireless Monochrome All-in-One Laser Printer | $539 |
| `08c33cfc9f664426a52fac8882da2df0` | 566903892 | TEST Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier | $189 |
| `6ee23bd045a549d785d9abc7e2a61b02` | 552223579 | HP LaserJet Pro MFP M127fn Multifunction Laser Printer, Copy/Fax/Print/Scan | $315 |

### 3.4 Fulfillment Centers / Warehouses (from QA)

| Center ID | Name | Address | City | State |
|----------|------|---------|------|-------|
| `vendor-fulfillment` | Los Angeles Branch | 1232 Wilshire Blvd | Los Angeles | CA 90234 |
| `142ba5568ae4454aad553ece41b9c3b5` | Chicago Branch | 5400 N. Lakewood Ave | Chicago | IL 60640 |
| `tulsa-branch` | Tennessee Branch | 420 Bridge St | Franklin | TN 37064 |
| `c20d27cdb09c4c7abd5d78a71510ab83` | New York Branch | 790 7th Ave | New York | NY 10019 |

**Inventory levels** (for Brother MFC-L6700DW, SKU 564698896):

| Warehouse | In Stock | Reserved |
|-----------|----------|----------|
| Chicago Branch | 9,999,955 | 0 |
| Tennessee Branch | 10,000,000 | 0 |
| New York Branch | 10,000,000 | 0 |
| Los Angeles Branch (vendor-fulfillment) | 10,000,000 | 0 |

### 3.5 Mock Adapter Notes
- Mock adapter orders (CO220518-00001, CO220715-00001) do NOT exist in QA platform — they are mock-only
- Mock adapter customer IDs (cb0a5340..., fa90d0b3...) do NOT match real QA customer IDs
- Product IDs are shared: mock adapter references real QA catalog products
- `vendor-fulfillment` warehouse ID maps to "Los Angeles Branch" in QA
- Realistic delays: 50-200ms (simulated network latency)
- 1% error rate configured for error handling validation
- Data persists during session, resets on server restart

## 4. TEST APPROACH

### 4.1 Testing Method
Tests are executed via **natural language prompts** sent to Claude Desktop connected to the Universal OMS MCP Server. Each prompt triggers one or more MCP tools. Verification is done by inspecting the returned JSON responses.

### 4.2 Tool Categories

| Category | Tools | Priority |
|----------|-------|----------|
| **Query Tools** (read-only) | Get Order, Get Customer, Get Product, Get Inventory, Get Shipment, Get Buyer | P0 |
| **Action Tools** (state-changing) | Capture Order, Cancel Order, Update Order, Return Order, Exchange Order, Ship Order | P0 |
| **Management Tools** | Hold Order, Split Order, Reserve Inventory | P1 |
| **Complex Workflows** | Multi-tool operations, chained queries | P1 |
| **Error Handling** | Invalid IDs, non-existent resources, validation | P1 |
| **Business Logic** | Status guards, duplicate operations, capacity limits | P2 |

## 5. PASS/FAIL CRITERIA

- **Pass:** MCP tool returns correct, complete JSON response matching expected data
- **Fail:** Tool returns incorrect data, errors unexpectedly, or violates business logic
- **Blocked:** MCP server not connected, mock adapter not running, or environment issue

## 6. DELIVERABLES
- `test-plan.md` — This document
- `test-cases.md` — Detailed test cases with prompts, expected results, and actual results
- `test-execution-report.md` — Test execution results and verdict
