# TC-013: Network Optimization Validation

## Test Case Information

**Test Case ID**: TC-013  
**Test Case Title**: Verify Network Optimization and Lightweight Responses  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: Performance / Integration  
**Estimated Time**: 20 minutes

---

## Description

Verify that the implementation achieves network optimization through batching, lightweight responses, and efficient data transfer. Ensure the GraphQL mutation returns minimal data and doesn't perform heavy operations like pricing recalculations or promotion evaluations.

**Requirements**:
- Lightweight response with minimal data
- No heavy validation, pricing, promotions, or recalculations
- Batching reduces number of network requests
- Efficient payload structure

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. Browser DevTools Network tab is open
3. Products are in cart
4. (Optional) Network monitoring tools like Charles Proxy or Fiddler

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**: 5+ products for testing
- **Baseline**: Old implementation metrics (if available)

---

## Test Steps

### Step 1: Measure Response Payload Size
1. Clear browser cache
2. Open DevTools → Network tab
3. Make a single quantity change
4. Wait for mutation response
5. Click on the mutation request
6. In "Headers" tab, check "Response Headers" → Content-Length
7. In "Response" tab, note the JSON payload size

**Expected Result**:
- Response size: **<5KB** (target <2KB)
- Minimal data returned
- No unnecessary fields

---

### Step 2: Analyze Response Content
1. Inspect the mutation response JSON
2. Document what data is included

**Expected Result**:
Response should contain ONLY:
```json
{
  "data": {
    "updateCartQuantity": {
      "cartId": "abc123",
      "lineItems": [
        { "productId": "p1", "quantity": 3 }
      ]
    }
  }
}
```

OR even simpler:
```json
{
  "data": {
    "updateCartQuantity": {
      "success": true
    }
  }
}
```

**Should NOT include**:
- ❌ Full product details (name, description, images)
- ❌ Calculated pricing (subtotal, tax, discounts)
- ❌ Applied promotions
- ❌ Shipping estimates
- ❌ Product availability/stock info
- ❌ Heavy computed fields

---

### Step 3: Compare Old vs. New Response Size
**If old implementation is available:**
1. Measure old response size
2. Measure new response size
3. Calculate reduction

**Expected Result**:
- New response is **significantly smaller** (50-90% reduction)
- Example:
  - Old: 45KB (full cart object)
  - New: 2KB (minimal response)
  - Reduction: 95%

---

### Step 4: Verify Request Payload Efficiency
1. Inspect mutation request payload
2. Check payload structure

**Expected Result**:
```json
{
  "variables": {
    "cartId": "abc123",
    "items": [
      { "productId": "p1", "quantity": 3 }
    ]
  }
}
```
- Compact and efficient
- Only necessary fields
- No redundant data
- Request size <1KB

---

### Step 5: Test Batching Efficiency
**Scenario A: 5 Separate Mutations (simulate old behavior)**
1. Make 5 quantity changes with pauses (each triggers separate mutation)
2. Measure:
   - Number of requests: 5
   - Total request data sent: 5 × request size
   - Total response data received: 5 × response size
   - Total transfer time

**Scenario B: 5 Batched Changes (new behavior)**
1. Make 5 rapid quantity changes (batched)
2. Measure:
   - Number of requests: 1-2
   - Total request data sent
   - Total response data received
   - Total transfer time

**Expected Result**:
- Batched approach uses **70-90% less data transfer**
- Fewer network round trips
- Faster overall completion time

---

### Step 6: Network Waterfall Analysis
1. Make multiple quantity changes
2. In DevTools Network tab, view waterfall chart
3. Analyze request timing and dependencies

**Expected Result**:
- Batched mutations reduce waterfall height
- Fewer sequential dependencies
- Parallel operations where possible
- Efficient use of network

---

### Step 7: Compression Verification
1. Check response headers for compression
2. Look for: `Content-Encoding: gzip` or `br` (Brotli)
3. Compare compressed vs. uncompressed size

**Expected Result**:
- Responses are compressed (gzip or Brotli)
- Additional size reduction (30-70%)
- Efficient bandwidth usage

---

### Step 8: HTTP/2 or HTTP/3 Usage
1. Check protocol in Network tab (Protocol column)
2. Verify HTTP/2 or HTTP/3 is used

**Expected Result**:
- HTTP/2 or HTTP/3 enabled
- Multiplexing support
- More efficient than HTTP/1.1

---

### Step 9: Verify No Unnecessary Backend Calls
1. (If backend logging is available) Check server logs
2. Or use Network tab to monitor all XHR/Fetch requests
3. Make a quantity change
4. Verify only necessary API calls are made

**Expected Result**:
- **Only** the `updateCartQuantity` mutation is called
- No additional calls to:
  - Pricing API
  - Inventory API
  - Promotion engine
  - Tax calculator
  - Shipping estimator
- Minimal backend resource usage

---

### Step 10: Database Query Efficiency (If Accessible)
1. Enable database query logging (if accessible)
2. Make quantity change
3. Review database queries executed

**Expected Result**:
- Minimal database queries
- Optimized queries (use indexes)
- No N+1 query problems
- Fast query execution (<50ms per query)

---

### Step 11: Cache Utilization
1. Make a quantity change
2. Make the same change again
3. Check if any caching is leveraged

**Expected Result**:
- Static resources cached
- GraphQL responses not cached (dynamic data)
- Efficient cache headers
- Reduced repeat data transfer

---

### Step 12: Mobile Network Performance
1. Use DevTools device emulation or real mobile device
2. Enable mobile network simulation (3G, 4G)
3. Make quantity changes
4. Measure data transfer

**Expected Result**:
- Lightweight responses especially important on mobile
- Total data transfer <10KB for typical cart update
- Acceptable performance even on 3G
- No excessive mobile data usage

---

### Step 13: Compare Total Page Weight
1. Load category page
2. Note total page weight (all resources)
3. Make 10 cart updates
4. Note increase in total data transferred

**Expected Result**:
- Cart updates add minimal data (<20KB total)
- Page remains performant
- No significant bloat from cart operations

---

## Performance Benchmarks

| Metric | Target | Good | Acceptable | Poor |
|--------|--------|------|-----------|------|
| Response Size | <2KB | <1KB | <5KB | >5KB |
| Request Size | <500B | <300B | <1KB | >1KB |
| Data Reduction vs Old | >70% | >85% | >50% | <50% |
| Total Transfer (10 updates) | <20KB | <10KB | <50KB | >50KB |
| Compression Ratio | >60% | >70% | >50% | <50% |

---

## Expected Results Summary

✅ **Lightweight Response**: <5KB, minimal data  
✅ **Efficient Payload**: Compact request structure  
✅ **Batching Benefit**: 70-90% less data transfer  
✅ **No Heavy Operations**: No pricing, promotions, etc. in mutation  
✅ **Compression**: gzip/Brotli enabled  
✅ **Protocol**: HTTP/2 or HTTP/3  
✅ **Minimal Backend Calls**: Only necessary API call  
✅ **Mobile Friendly**: Low data usage on mobile networks

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Measurements:
```
[To be filled during test execution]

Response Size: ___ KB
Request Size: ___ bytes
Compression: Yes/No, Algorithm: ___
Protocol: HTTP/___

Comparison (if old implementation available):
  Old response size: ___ KB
  New response size: ___ KB
  Reduction: ___ %

Batching Efficiency:
  5 separate mutations: ___ KB total transfer
  5 batched mutations: ___ KB total transfer
  Savings: ___ %

Unnecessary fields in response: Yes/No
List any unnecessary fields: ___
```

---

## Pass/Fail Criteria

**Pass**: 
- Response size <5KB (target <2KB)
- Only minimal necessary data in response
- Batching reduces data transfer >50%
- Compression enabled
- HTTP/2 or HTTP/3 used
- No unnecessary backend calls or heavy operations

**Fail**: 
- Response size >10KB
- Response includes heavy/unnecessary data
- Batching doesn't reduce data transfer
- No compression
- HTTP/1.1 only
- Excessive backend calls or heavy operations

---

## Status

- [ ] Not Executed
- [ ] Pass
- [ ] Fail
- [ ] Blocked

---

## Defects

| Defect ID | Description | Severity | Status |
|-----------|-------------|----------|--------|
| | | | |

---

## Notes

- This test validates a core requirement of VCST-4003
- Compare with old implementation to show improvement
- Network optimization is key to performance gains
- Monitor backend resource usage (CPU, memory, database)
- Consider CDN usage for static resources

---

## Tools & Resources

- **Chrome DevTools**: Network tab, Performance tab
- **Charles Proxy**: Detailed network monitoring
- **Fiddler**: HTTP debugging proxy
- **WebPageTest**: External performance testing
- **Backend APM**: New Relic, DataDog, etc.

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Network tab showing response size
2. Response payload JSON (pretty-printed)
3. Comparison chart (old vs new response size)
4. Waterfall diagram (batched vs separate)
5. Server logs showing minimal API calls

