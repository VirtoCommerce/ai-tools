# TC-014: Concurrent Users Load Testing

## Test Case Information

**Test Case ID**: TC-014  
**Test Case Title**: Verify Performance Under Concurrent User Load  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: Performance / Load Testing  
**Estimated Time**: 30-60 minutes

---

## Description

Verify that the cart quantity update feature performs well under concurrent user load. Test with multiple simultaneous users making cart updates to ensure the system remains stable, responsive, and doesn't degrade under typical and peak load conditions.

---

## Preconditions

1. Access to load testing tools (JMeter, k6, Artillery, or similar)
2. Test environment that can handle load testing
3. Test user accounts created
4. Monitoring tools available (server metrics, APM)
5. Baseline performance metrics captured

---

## Test Data

- **Test Users**: 100+ test user accounts
- **Test Duration**: 10-30 minutes per test
- **Products**: Varied product catalog
- **Scenarios**: Mix of increase, decrease, remove operations

---

## Load Test Scenarios

### Scenario 1: Normal Load
- **Users**: 50 concurrent users
- **Duration**: 10 minutes
- **Think Time**: 5-10 seconds between actions
- **Actions**: Random cart quantity updates

### Scenario 2: Peak Load
- **Users**: 100 concurrent users
- **Duration**: 10 minutes
- **Think Time**: 2-5 seconds between actions
- **Actions**: More frequent cart updates

### Scenario 3: Stress Test
- **Users**: 200+ concurrent users
- **Duration**: 5-10 minutes
- **Think Time**: 1-2 seconds
- **Actions**: Aggressive cart updates

---

## Test Steps

### Step 1: Establish Baseline Performance
1. Measure single-user performance:
   - Response time
   - Throughput
   - Error rate
2. Document baseline metrics

**Expected Result**:
- Single user: <1s response time
- 0% error rate
- Smooth user experience

---

### Step 2: Normal Load Test (50 Users)
1. Configure load test tool:
   - 50 concurrent users
   - Ramp-up: 5 minutes
   - Steady state: 10 minutes
   - Ramp-down: 2 minutes
2. Execute test
3. Monitor metrics:
   - Average response time
   - 95th percentile response time
   - 99th percentile response time
   - Throughput (requests/second)
   - Error rate
   - Server CPU, memory, network

**Expected Result**:
- **Average response time**: <2s
- **95th percentile**: <3s
- **99th percentile**: <5s
- **Error rate**: <1%
- **Server CPU**: <70%
- **Server memory**: Stable, no leaks
- No database connection pool exhaustion

---

### Step 3: Peak Load Test (100 Users)
1. Configure 100 concurrent users
2. Run for 10 minutes
3. Monitor all metrics

**Expected Result**:
- **Average response time**: <3s
- **95th percentile**: <5s
- **99th percentile**: <10s
- **Error rate**: <2%
- **Server CPU**: <80%
- System remains stable

---

### Step 4: Stress Test (200+ Users)
1. Gradually increase load to find breaking point
2. Continue until:
   - Error rate >5%
   - Response time >10s
   - System becomes unstable
3. Document maximum capacity

**Expected Result**:
- System handles >100 concurrent users
- Graceful degradation (no crashes)
- Error messages are clear
- System recovers after load decreases

---

### Step 5: Spike Test
1. Start with 10 users
2. Suddenly spike to 100 users
3. Maintain for 5 minutes
4. Return to 10 users
5. Observe system behavior

**Expected Result**:
- System handles sudden spikes
- No crashes or data corruption
- Response time increases temporarily but recovers
- Auto-scaling (if configured) kicks in

---

### Step 6: Endurance Test (Soak Test)
1. Run 50 concurrent users for extended period (1-2 hours)
2. Monitor for:
   - Memory leaks
   - Performance degradation over time
   - Connection pool issues
   - Database performance

**Expected Result**:
- Performance stable over time
- No memory leaks
- No degradation after extended operation
- All resources properly released

---

### Step 7: Database Performance Under Load
1. During load test, monitor database:
   - Query execution time
   - Connection pool usage
   - Lock contention
   - Index usage
2. Identify slow queries

**Expected Result**:
- Queries remain fast (<100ms)
- Connection pool sufficient
- No lock contention or deadlocks
- Indexes used efficiently

---

### Step 8: GraphQL API Performance
1. Monitor GraphQL endpoint:
   - Request rate (req/s)
   - Response time distribution
   - Error rate
   - Resolver performance
2. Check for bottlenecks

**Expected Result**:
- API handles high request rate
- Resolvers remain fast
- No timeout errors
- Efficient query execution

---

### Step 9: Frontend Performance Under Load
1. (Optional) Use synthetic monitoring
2. Simulate real user browsers making updates
3. Measure frontend metrics:
   - Time to Interactive
   - First Contentful Paint
   - Largest Contentful Paint

**Expected Result**:
- Frontend remains responsive
- Core Web Vitals in "Good" range
- No JavaScript errors
- UI doesn't freeze

---

### Step 10: Cache Performance
1. Monitor cache hit/miss ratio during load
2. Check Redis/caching layer performance (if applicable)

**Expected Result**:
- High cache hit ratio (>80%)
- Cache reduces database load
- Cache remains responsive

---

### Step 11: Network Bandwidth Usage
1. Monitor total network bandwidth
2. Calculate bytes transferred per second

**Expected Result**:
- Bandwidth usage reasonable
- Lightweight responses keep bandwidth low
- No network saturation

---

### Step 12: Error Rate Analysis
1. Collect all errors during load test
2. Categorize by type:
   - 4xx errors (client errors)
   - 5xx errors (server errors)
   - Timeout errors
   - Network errors
3. Investigate root causes

**Expected Result**:
- Error rate <2% under normal/peak load
- Errors are transient, not systemic
- Clear error messages logged
- No data corruption from errors

---

### Step 13: Recovery Test
1. Run high load until system shows stress
2. Stop load test
3. Observe system recovery

**Expected Result**:
- System recovers quickly (<2 minutes)
- All resources released
- Response times return to baseline
- No lingering issues

---

## Load Test Metrics to Capture

### Response Time Metrics
- Minimum
- Maximum
- Average
- Median (50th percentile)
- 90th percentile
- 95th percentile
- 99th percentile

### Throughput Metrics
- Requests per second
- Successful requests per second
- Failed requests per second

### Error Metrics
- Total errors
- Error rate (%)
- Error types and distribution

### Server Metrics
- CPU usage (%)
- Memory usage (MB/GB)
- Disk I/O
- Network I/O
- Thread/process count

### Database Metrics
- Query execution time
- Connections in use
- Connection pool size
- Lock wait time
- Deadlocks

---

## Performance Benchmarks

| Load Level | Concurrent Users | Avg Response Time | 95th Percentile | Error Rate | Server CPU |
|------------|------------------|-------------------|-----------------|------------|------------|
| Light | 10 | <1s | <2s | <0.1% | <30% |
| Normal | 50 | <2s | <3s | <1% | <70% |
| Peak | 100 | <3s | <5s | <2% | <80% |
| Stress | 200+ | <5s | <10s | <5% | <90% |

---

## Expected Results Summary

✅ **Normal Load**: Handles 50+ users smoothly  
✅ **Peak Load**: Supports 100+ users with acceptable performance  
✅ **Stress Test**: Graceful degradation, no crashes  
✅ **Spike Handling**: Handles sudden load increases  
✅ **Endurance**: No degradation over time  
✅ **Low Error Rate**: <2% errors under load  
✅ **Resource Efficiency**: Efficient use of CPU, memory, database  
✅ **Quick Recovery**: System recovers after load decrease

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Tool Used**: ___________  
**Environment**: ___________

### Load Test Results:

**Normal Load (50 users)**:
```
Average Response Time: ___ ms
95th Percentile: ___ ms
99th Percentile: ___ ms
Error Rate: ___ %
Server CPU Peak: ___ %
```

**Peak Load (100 users)**:
```
Average Response Time: ___ ms
95th Percentile: ___ ms
99th Percentile: ___ ms
Error Rate: ___ %
Server CPU Peak: ___ %
```

**Maximum Capacity**:
```
Max Concurrent Users: ___
At what point system degraded: ___
```

**Endurance Test**:
```
Duration: ___ hours
Performance degradation: Yes/No
Memory leak detected: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- Handles 50 concurrent users with <2s avg response time
- Supports 100 users with <3s avg response time
- Error rate <2% under peak load
- No crashes or data corruption
- Graceful degradation under stress
- Quick recovery after load decrease
- No memory leaks during endurance test

**Fail**: 
- Cannot handle 50 users adequately
- High error rate (>5%) under normal load
- System crashes or data corruption
- Severe performance degradation
- No recovery after load decrease
- Memory leaks during endurance test

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

- Coordinate with DevOps for production-like test environment
- Run load tests during off-peak hours to avoid impact
- Consider auto-scaling configuration
- Monitor third-party dependencies (payment gateways, etc.)
- Document infrastructure specifications for reproduction
- Save load test scripts for regression testing

---

## Load Test Script Example (k6)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '5m', target: 50 },  // Ramp up
    { duration: '10m', target: 50 }, // Steady state
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function () {
  // GraphQL mutation
  const payload = JSON.stringify({
    query: `mutation updateCartQuantity($cartId: String!, $items: [CartQuantityInput!]!) {
      updateCartQuantity(cartId: $cartId, items: $items) {
        success
      }
    }`,
    variables: {
      cartId: 'test-cart-id',
      items: [{ productId: 'prod-123', quantity: 3 }]
    }
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post('https://api.example.com/graphql', payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(5); // Think time
}
```

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Load test dashboard showing metrics
2. Response time graph over time
3. Error rate chart
4. Server CPU/memory graphs
5. Database performance metrics
6. Final test report summary

