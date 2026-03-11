# Universal OMS MCP Server - Test Prompts (Real QA Data)

Copy and paste these prompts into Claude Desktop to test each MCP tool.
Data fetched from **https://vcst-qa.govirto.com** on **2026-03-03** via REST API.

## Test Data Reference

### Available Orders

- **66d5a176-5bbf-49d3-b328-f6fc883a14a0** / TEST-ACTION-001:
  - Status=New
  - Customer=Elena Mutykova (2afc394a-c1e2-41ad-bd3a-c0e27705a12d)
  - Product=Brother MFC-L6700DW Wireless Monochrome Laser Printer (SKU: 564698896, qty: 3, $539)
  - Total=$1,632 USD
  - Shipping: 789 Broadway, New York, NY 10002
  - Billing: 123 Main St, New York, NY 10001
  - Shipments: SH260303-00001 (UPS), SH260303-00002 (UPS)
  - Payment: PI260303-00001 (DefaultManualPaymentMethod, status: New)

- **924c19b2-81f1-4568-ad97-c5e224e1d26a** / TEST-ACTION-002:
  - Status=Cancelled
  - Customer=Elena Mutykova (2afc394a-c1e2-41ad-bd3a-c0e27705a12d)
  - Product=Canon Imageclass WiFi MF232W (SKU: 566903892, qty: 1, $189)
  - Total=$199 USD
  - Shipping: 456 Oak Ave, Los Angeles, CA 90210

- **5c42fb4e-07f8-46ae-861e-00ea05bba9aa** / CO260225-00004:
  - Status=Processing
  - Customer=Elena Mutykova (2afc394a-c1e2-41ad-bd3a-c0e27705a12d)
  - Product=Krusovice 20x5cl Bottle (SKU: 150701-1, qty: 1, $121)
  - Total=$420 USD
  - Shipment: SH260225-00004 (FixedRate, status: New)

- **ab256b56-210e-4187-91ff-79764b32ca02** / CO251202-00010:
  - Status=Completed
  - Customer=Noni Burgadze (c5abcb3e-11ce-4962-aaa0-b55e6b326377)
  - Products: Gray Panther Print Hat, Off-Road Bike, Yellow California Beach Pullover Hoodie, and more (7 items)
  - Total=$1,459.26 USD
  - Shipment: SH251202-00012 (FixedRate)

### Available Customers

- **120d0d0f-f619-4e3d-b2e5-bdcbae1e2ecc**: Noni Burgadze (crefroubroicrammu-2450@yopmail.com, Approved)
- **cee67275-ab62-4769-8887-53d15c9b33eb**: Mila Muller (milamuller2024@yahoo.com, Approved)
- **3c0305ee-f94e-4229-8fdc-c071fc24d8d3**: Smoke Tester (smoke.tester.26022700@mailtest.com, Approved)
- **2afc394a-c1e2-41ad-bd3a-c0e27705a12d**: Elena Mutykova (primary test user, no email on contact)

### Available Products/SKUs

- **47e4aaef9c9e4326924d4a4080f461a5** / 564698896: Brother MFC-L6700DW Wireless Monochrome Laser Printer, $539
- **08c33cfc9f664426a52fac8882da2df0** / 566903892: Canon Imageclass WiFi MF232W Monochrome Laser Printer/Scanner/Copier, $189
- **6ee23bd045a549d785d9abc7e2a61b02** / 552223579: HP LaserJet Pro MFP M127fn Multifunction Laser Printer, $315
- **cefca8cf-1296-4940-977a-362a4346a532** / 150701-1: Krusovice 20x5cl Bottle, $121

### Test Addresses (International)

| # | Name | Address | City | State/Province | Zip/Postal | Country |
|---|------|---------|------|----------------|------------|---------|
| 1 | US Address | 350 Fifth Avenue | New York | NY | 10118 | United States of America |
| 2 | UK Address | 221B Baker Street | London | — | NW1 6XE | United Kingdom |
| 3 | Germany Address | Friedrichstraße 43-45 | Berlin | Berlin | 10117 | Germany |
| 4 | Canada Address | 100 Queen Street West | Toronto | ON | M5H 2N2 | Canada |
| 5 | Australia Address | 1 Macquarie Street | Sydney | NSW | 2000 | Australia |
| 6 | US Address (CA) | 1600 Amphitheatre Parkway | Mountain View | CA | 94043 | United States of America |

### Warehouse Locations

| ID | Name | Address |
|----|------|---------|
| vendor-fulfillment | Los Angeles Branch | 1232 Wilshire Blvd, Los Angeles, CA 90234 |
| 142ba5568ae4454aad553ece41b9c3b5 | Chicago Branch | 5400 N. Lakewood Ave, Chicago, IL 60640 |
| tulsa-branch | Tennessee Branch | 420 Bridge St, Franklin, TN 37064 |
| c20d27cdb09c4c7abd5d78a71510ab83 | New York Branch | 790 7th Ave, New York, NY 10019 |

### Inventory Levels

| Product | SKU | Warehouse | In Stock | Reserved |
|---------|-----|-----------|----------|----------|
| Brother MFC-L6700DW | 564698896 | Chicago Branch | 9,999,955 | 0 |
| Brother MFC-L6700DW | 564698896 | Tennessee Branch | 10,000,000 | 0 |
| Brother MFC-L6700DW | 564698896 | New York Branch | 10,000,000 | 0 |
| Brother MFC-L6700DW | 564698896 | Los Angeles Branch | 10,000,000 | 0 |
| Canon Imageclass | 566903892 | Chicago Branch | 1 | 0 |
| Canon Imageclass | 566903892 | New York Branch | 1 | 0 |
| Canon Imageclass | 566903892 | Tennessee Branch | 1 | 0 |
| Canon Imageclass | 566903892 | Los Angeles Branch | 1 | 0 |
| HP LaserJet Pro | 552223579 | Chicago Branch | 44 | 0 |
| HP LaserJet Pro | 552223579 | Los Angeles Branch | 0 | 0 |

---

## Query Tools Test Prompts

### 1. Get Order Tool

```
Get me the details for order TEST-ACTION-001
```

Expected: Returns order details — ID 66d5a176-5bbf-49d3-b328-f6fc883a14a0, status=New, customer=Elena Mutykova, 3x Brother MFC-L6700DW, total=$1,632

```
Show me order 66d5a176-5bbf-49d3-b328-f6fc883a14a0
```

Expected: Returns same order TEST-ACTION-001 details by UUID

```
What's the status of order CO260225-00004?
```

Expected: Returns "Processing"

```
Can you retrieve order CO251202-00010 and show me all details?
```

Expected: Returns full Completed order details — customer Noni Burgadze, 7 items including Gray Panther Print Hat and Off-Road Bike, total=$1,459.26

### 2. Get Customer Tool

```
Get customer information for 120d0d0f-f619-4e3d-b2e5-bdcbae1e2ecc
```

Expected: Returns Noni Burgadze (crefroubroicrammu-2450@yopmail.com, Approved)

```
Show me the details for customer milamuller2024@yahoo.com
```

Expected: Returns Mila Muller customer details (ID: cee67275-ab62-4769-8887-53d15c9b33eb, Approved)

```
Find customer cee67275-ab62-4769-8887-53d15c9b33eb
```

Expected: Returns Mila Muller details

```
What information do you have on customer nonexistent-user@fake-domain.test
```

Expected: Returns no customer found

### 3. Get Product Tool

```
Show me product details for SKU 566903892
```

Expected: Returns Canon Imageclass WiFi MF232W, product ID 08c33cfc9f664426a52fac8882da2df0, $189

```
Get information about product 08c33cfc9f664426a52fac8882da2df0
```

Expected: Returns Canon Imageclass WiFi MF232W details

```
What are the details for product 6ee23bd045a549d785d9abc7e2a61b02?
```

Expected: Returns HP LaserJet Pro MFP M127fn, SKU 552223579, $315

```
Find product 47e4aaef9c9e4326924d4a4080f461a5 and show me all its attributes
```

Expected: Returns Brother MFC-L6700DW, SKU 564698896, $539, all attributes

### 4. Get Inventory Tool

```
Check inventory for SKU 566903892 at warehouse vendor-fulfillment
```

Expected: Returns 1 unit in stock, 0 reserved at Los Angeles Branch

```
What's the available stock for 564698896 in location vendor-fulfillment?
```

Expected: Returns 10,000,000 units in stock at Los Angeles Branch

```
Show me inventory levels for 552223579 across all warehouses
```

Expected: Returns Chicago Branch: 44 in stock, Los Angeles Branch: 0 in stock (only 2 warehouses carry this product)

```
Get inventory status for 566903892 at 142ba5568ae4454aad553ece41b9c3b5
```

Expected: Returns 1 unit in stock at Chicago Branch

### 5. Get Shipment Tool

```
Get shipment details for order TEST-ACTION-001
```

Expected: Returns 2 shipments — SH260303-00001 (UPS) and SH260303-00002 (UPS)

```
Show me the shipment information for order CO260225-00004
```

Expected: Returns shipment SH260225-00004 (FixedRate, status: New)

```
Check if TEST-ACTION-001 has been shipped
```

Expected: Returns shipment status — shipments exist but status is null (not yet shipped)

```
Find shipment tracking for order CO251202-00010
```

Expected: Returns shipment SH251202-00012 (FixedRate) for the Completed order

### 6. Get Buyer Tool

```
Get buyer information for order TEST-ACTION-001
```

Expected: Returns Elena Mutykova (customer ID: 2afc394a-c1e2-41ad-bd3a-c0e27705a12d)

```
Who is the buyer for order CO251202-00010?
```

Expected: Returns Noni Burgadze (customer ID: c5abcb3e-11ce-4962-aaa0-b55e6b326377)

```
Show me the buyer details for order CO260225-00004
```

Expected: Returns Elena Mutykova buyer details

```
Find the customer who placed order TEST-ACTION-002
```

Expected: Returns Elena Mutykova (despite order being Cancelled)

---

## Action Tools Test Prompts

### 7. Capture Order Tool

```
Create a new order for customer 120d0d0f-f619-4e3d-b2e5-bdcbae1e2ecc with 2 units of 47e4aaef9c9e4326924d4a4080f461a5 shipping to 221B Baker Street, London, NW1 6XE, United Kingdom
```

Expected: Creates new order for Noni Burgadze with 2x Brother MFC-L6700DW ($539 each), shipping to UK address

```
Capture an order for milamuller2024@yahoo.com with 1 566903892 and 2 552223579 items shipping to Friedrichstraße 43-45, Berlin, 10117, Germany
```

Expected: Creates new order for Mila Muller with 1x Canon Imageclass ($189) and 2x HP LaserJet Pro ($315 each), shipping to Germany address

```
Place an order for customer Smoke Tester with product 08c33cfc9f664426a52fac8882da2df0, quantity 1, shipping to 100 Queen Street West, Toronto, ON M5H 2N2, Canada
```

Expected: Creates order for Smoke Tester (3c0305ee-f94e-4229-8fdc-c071fc24d8d3) with 1x Canon Imageclass, shipping to Canada address

### 8. Cancel Order Tool

```
Cancel order TEST-ACTION-001 due to customer request
```

Expected: Cancels order TEST-ACTION-001 (currently status=New, should be cancellable)

```
Please cancel the most recently created order - the customer changed their mind
```

Expected: Cancels the latest order

```
Cancel order 924c19b2-81f1-4568-ad97-c5e224e1d26a because of inventory issues
```

Expected: Should handle gracefully — this order (TEST-ACTION-002) is already Cancelled

### 9. Update Order Tool

```
Update order TEST-ACTION-001 to change the quantity of 564698896 to 5 units
```

Expected: Updates Brother MFC-L6700DW quantity from 3 to 5 on TEST-ACTION-001

```
Modify order TEST-ACTION-001 to ship to 5400 N. Lakewood Ave, Chicago, IL 60640 instead
```

Expected: Updates shipping address to Chicago Branch address

```
Update order CO260225-00004 with express shipping
```

Expected: Updates shipping method on the Processing order

### 10. Return Order Tool

```
Process a return for order CO251202-00010 - customer says the hat doesn't fit
```

Expected: Initiates return on the Completed order (Noni Burgadze, Gray Panther Print Hat)

```
Create a return for order TEST-ACTION-001 with reason "wrong product received"
```

Expected: Initiates return with reason

```
Return order CO260225-00004 because the bottle is broken
```

Expected: Initiates return on the Processing order (Krusovice 20x5cl Bottle)

### 11. Exchange Order Tool

```
Exchange order CO251202-00010 - customer wants product 08c33cfc9f664426a52fac8882da2df0 instead of the Gray Panther Print Hat
```

Expected: Processes exchange — swap Gray Panther Print Hat (TVI-93853269) for Canon Imageclass (566903892)

```
Process an exchange for order TEST-ACTION-001 - swap the Brother printer for the HP printer 6ee23bd045a549d785d9abc7e2a61b02
```

Expected: Exchanges Brother MFC-L6700DW for HP LaserJet Pro

```
Exchange the items in order CO260225-00004 for product 47e4aaef9c9e4326924d4a4080f461a5
```

Expected: Exchanges Krusovice bottle for Brother MFC-L6700DW printer

### 12. Ship Order Tool

```
Mark order TEST-ACTION-001 as shipped with tracking number TRK-QA-2026030301
```

Expected: Marks order as shipped, associates tracking number with shipment SH260303-00001

```
Ship order CO260225-00004 via FedEx with tracking FDX-QA-2026030301
```

Expected: Ships order CO260225-00004 with FedEx tracking

```
Process shipment for TEST-ACTION-001 using UPS tracking 1Z-QA-TEST-2026030301
```

Expected: Processes second shipment (SH260303-00002) with UPS tracking

---

## Management Tools Test Prompts

### 13. Hold Order Tool

```
Put order TEST-ACTION-001 on hold - waiting for payment verification
```

Expected: Places the New order on hold

```
Hold order CO260225-00004 due to address verification needed
```

Expected: Places the Processing order on hold

```
Place a hold on TEST-ACTION-001 for customer service review
```

Expected: Places hold with CS review reason

```
Release the hold on order TEST-ACTION-001
```

Expected: Removes hold, order returns to previous status

### 14. Split Order Tool

```
Split order TEST-ACTION-001 so that 1 Brother printer ships immediately and the other 2 ship later
```

Expected: Splits 3x Brother MFC-L6700DW into shipment of 1 + shipment of 2

```
I need to split order CO251202-00010 into two separate shipments
```

Expected: Splits the 7-item Completed order into two shipments

```
Divide order TEST-ACTION-001 - send 2 printers to New York and 1 to Chicago
```

Expected: Splits by destination address

### 15. Reserve Inventory Tool

```
Reserve 5 units of 564698896 from warehouse vendor-fulfillment
```

Expected: Reserves 5 units of Brother MFC-L6700DW at Los Angeles Branch (10M available)

```
Hold 10 units of 552223579 inventory at location 142ba5568ae4454aad553ece41b9c3b5 for a special customer
```

Expected: Reserves 10 of 44 available HP LaserJet Pro units at Chicago Branch

```
Reserve 3 units of 566903892 from warehouse c20d27cdb09c4c7abd5d78a71510ab83
```

Expected: Reserves 3 units — but only 1 available at New York Branch! Should handle over-reservation

```
Release the reservation on 2 units of 564698896 at vendor-fulfillment
```

Expected: Releases reservation, restores available stock at Los Angeles Branch

---

## Complex Workflow Test Prompts

### Multi-Tool Operations

```
Get order TEST-ACTION-001, then check inventory for Brother MFC-L6700DW (564698896) at all warehouses, and finally ship it with tracking QA-MULTI-001
```

Expected: Chains Get Order + Get Inventory + Ship Order — retrieves order, shows 10M+ units across 4 warehouses, ships order

```
Find customer 120d0d0f-f619-4e3d-b2e5-bdcbae1e2ecc, show me their details, and then check product availability for SKU 566903892
```

Expected: Chains Get Customer (Noni Burgadze) + Get Product (Canon Imageclass, $189) + Get Inventory (1 unit per warehouse)

```
Create a new order for milamuller2024@yahoo.com with 2 units of 564698896, then put it on hold for payment verification
```

Expected: Chains Capture Order (Mila Muller, 2x Brother MFC-L6700DW) + Hold Order

### Error Handling Tests

```
Get order INVALID-QA-ORDER-999
```

Expected: Returns clear error — order not found

```
Cancel an order that doesn't exist: FAKE-ORDER-2026-99999
```

Expected: Returns error — order not found, cannot cancel

```
Check inventory for a non-existent SKU: FAKE-SKU-QA-001
```

Expected: Returns error or empty result — SKU not found

```
Get customer information for nonexistent-user@fake-domain.test
```

Expected: Returns no customer found

### Business Logic Tests

```
Cancel order CO251202-00010 (note: it's already Completed — should fail or require special handling)
```

Expected: Returns error — cannot cancel a Completed order

```
Cancel order 924c19b2-81f1-4568-ad97-c5e224e1d26a (note: it's already Cancelled — should be idempotent or error)
```

Expected: Handles gracefully — order TEST-ACTION-002 is already Cancelled

```
Ship order TEST-ACTION-001 twice with different tracking numbers TRK-FIRST and TRK-SECOND
```

Expected: Should handle duplicate shipment appropriately (has 2 shipments: SH260303-00001, SH260303-00002)

```
Reserve 100 units of 566903892 from vendor-fulfillment (only 1 unit available!)
```

Expected: Returns error — insufficient inventory (only 1 Canon Imageclass in stock at Los Angeles Branch)

---

## Notes for Testing

1. All data verified against https://vcst-qa.govirto.com on 2026-03-03
2. Store ID: `B2B-store` / `b2b-store` (case varies in QA data)
3. Currency: USD for all orders
4. Order numbering: QA orders use `CO{YYMMDD}-{NNNNN}` pattern; adapter-created orders use `TEST-ACTION-{NNN}`
5. Shipment numbering: `SH{YYMMDD}-{NNNNN}`, Payment numbering: `PI{YYMMDD}-{NNNNN}`
6. QA has 7,344 total orders (3,043 New, 1,941 Processing, 137 Completed, 29 Cancelled)
7. QA has 376 contacts, 155 organizations
8. Canon Imageclass (566903892) has very low stock (1 per warehouse) — good for testing inventory edge cases
9. Brother MFC-L6700DW (564698896) has massive stock (10M per warehouse) — good for bulk operations
10. HP LaserJet Pro (552223579) only stocked at 2 of 4 warehouses — good for testing warehouse-specific queries

## Expected Responses

- Successful queries should return detailed JSON objects with all fields
- Failed operations should return clear error messages with reasons
- The adapter connects to Virto Commerce QA REST API endpoints:
  - Orders: `POST /api/order/customerOrders/search`
  - Members: `POST /api/members/search`
  - Products: `GET /api/catalog/products/{id}`
  - Inventory: `GET /api/inventory/products/{id}`
- Auth: OAuth2 password grant to `/connect/token` (no client_id required)

## Troubleshooting

If a tool doesn't work as expected:
1. Check that the order/customer/product ID exists in the QA data above
2. Verify the status allows the operation (e.g., can't cancel a Completed order)
3. Check inventory levels — Canon Imageclass has only 1 unit per warehouse
4. Look for validation errors in the response
5. Confirm MCP server is connected to the correct QA environment (vcst-qa.govirto.com)
