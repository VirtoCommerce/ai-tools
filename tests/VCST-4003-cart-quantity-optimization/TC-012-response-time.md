# TC-012: Response Time Measurement

## Test Case Information

**Test Case ID**: TC-012  
**Test Case Title**: Measure and Verify Response Time Performance  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: Performance  
**Estimated Time**: 20 minutes

---

## Description

Measure the response times for cart quantity updates at various stages (UI update, mutation request, mutation response) and verify they meet performance benchmarks. The goal is to ensure a fast, responsive user experience.

**Performance Targets**:
- **UI Update (Optimistic)**: <50ms after user action
- **Mutation Sent**: ~1000ms after last user action (debounce)
- **Mutation Response**: <1000ms from request sent
- **Total Time**: <2s from user action to server confirmation

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User is on a category page with products
3. Products are in cart
4. Browser DevTools Performance tab available
5. Stable network connection for baseline testing

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**: 5 products in cart with various quantities
- **Iterations**: 10 measurements per metric for statistical accuracy

---

## Test Steps

### Step 1: Measure UI Update Time (Optimistic Update)
1. Open DevTools → Performance tab
2. Click "Record"
3. Click + button to increase quantity
4. Stop recording after ~2 seconds
5. Analyze timeline:
   - Mark time of user click
   - Mark time of UI update (DOM change)
   - Calculate difference

**Expected Result**:
- Time from click to UI update: **<50ms**
- Ideally: 10-30ms
- No delays or lag

**Repeat 10 times and calculate average**

---

### Step 2: Measure Debounce Delay Accuracy
1. Use DevTools Performance or Console timestamps
2. Record exact time of user action: `const t1 = performance.now()`
3. Make quantity change
4. Record exact time mutation is sent (check Network tab timestamp)
5. Calculate delay: `mutationTime - userActionTime`

**Expected Result**:
- Delay: **~1000ms ±50ms**
- Consistent across multiple tests
- Configurable (if setting is adjustable)

**Repeat 10 times and calculate average**

---

### Step 3: Measure GraphQL Mutation Response Time
1. Clear Network tab
2. Make quantity change
3. Wait for mutation to be sent
4. In Network tab, click on the mutation request
5. In "Timing" tab, note:
   - Waiting (TTFB): Time to first byte
   - Content Download: Response download time
   - Total: Total request time

**Expected Result**:
- **TTFB: <500ms**
- **Total request time: <1000ms**
- Lightweight response downloads quickly

**Test on various network conditions**:
- Fast Wi-Fi
- Good 4G
- Slow 3G (for comparison)

---

### Step 4: Measure End-to-End Time
1. Record time of user action
2. Make quantity change
3. Wait for mutation to complete
4. Calculate total time:
   - From user click to server response received

**Expected Result**:
- **Total time: <2000ms**
- Breakdown:
  - UI update: immediate
  - Debounce wait: ~1000ms
  - Server response: <1000ms
- User perceives it as fast (due to optimistic update)

---

### Step 5: Measure Performance Under Load
1. Make 10 rapid quantity changes (multiple products)
2. Measure time for all mutations to complete
3. Check for performance degradation

**Expected Result**:
- Batching reduces network overhead
- Mutations processed efficiently
- No significant slowdown with multiple changes

---

### Step 6: Compare Single vs. Batch Update
**Test A: 5 Separate Updates (old behavior)**
1. Make 5 changes with long pauses (each triggers separate mutation)
2. Measure total time for all 5 mutations

**Test B: 5 Batched Updates (new behavior)**
1. Make 5 changes rapidly (batched into 1-2 mutations)
2. Measure total time

**Expected Result**:
- Batched approach is faster
- Fewer network round trips
- Performance improvement measurable

---

### Step 7: Measure with Network Throttling
1. Enable network throttling:
   - Fast 3G (1.6 Mbps, 150ms latency)
   - Slow 3G (400 Kbps, 400ms latency)
2. Measure mutation response times

**Expected Result**:
- UI still updates immediately (optimistic)
- Mutation takes longer on slow network, but acceptable
- User experience still good due to optimistic updates
- Response times:
  - Fast 3G: <2s
  - Slow 3G: <5s

---

### Step 8: CPU Performance - Check for UI Jank
1. Open DevTools → Performance tab
2. Enable "Screenshots" and "Web Vitals"
3. Record during quantity changes
4. Check for:
   - Long tasks (>50ms)
   - Frame drops
   - Jank or stuttering

**Expected Result**:
- No long tasks blocking UI
- Smooth 60fps performance
- No jank or stuttering
- Good Core Web Vitals

---

### Step 9: Memory Performance
1. Open DevTools → Memory tab
2. Take heap snapshot before test
3. Make 50+ quantity changes
4. Take heap snapshot after
5. Compare memory usage

**Expected Result**:
- No memory leaks
- Memory released after mutations complete
- Stable memory usage over time
- No growing heap

---

### Step 10: Measure First Input Delay (FID)
1. Load category page
2. Immediately try to change quantity
3. Measure time from click to first response

**Expected Result**:
- **FID <100ms**
- Page is interactive immediately
- No delay in responding to user input

---

### Step 11: Lighthouse Performance Audit
1. Run Lighthouse audit on category page
2. Check Performance score
3. Review "Time to Interactive" and "Total Blocking Time"

**Expected Result**:
- Performance score: >90
- Time to Interactive: <3.8s
- Total Blocking Time: <200ms
- Cart functionality doesn't degrade performance

---

### Step 12: Server-Side Performance (if accessible)
1. Check server logs or monitoring dashboard
2. Measure server-side processing time for mutation
3. Identify any bottlenecks

**Expected Result**:
- Server processes mutation quickly (<200ms)
- Database queries optimized
- No N+1 queries or inefficiencies
- Scalable under load

---

## Performance Benchmarks

| Metric | Target | Good | Acceptable | Poor |
|--------|--------|------|-----------|------|
| UI Update (Optimistic) | <50ms | <30ms | <100ms | >100ms |
| Debounce Delay | 1000ms ±50ms | 950-1050ms | 900-1100ms | <900 or >1100ms |
| GraphQL Response (Fast Network) | <500ms | <300ms | <1000ms | >1000ms |
| End-to-End Time | <2s | <1.5s | <3s | >3s |
| Batch vs Single | 50% faster | 70% faster | 30% faster | <20% |

---

## Expected Results Summary

✅ **Fast UI Updates**: Optimistic updates <50ms  
✅ **Accurate Debounce**: ~1000ms delay, consistent  
✅ **Quick Server Response**: Mutation completes <1s  
✅ **Short End-to-End**: Total time <2s  
✅ **Batching Benefit**: Faster than sequential updates  
✅ **Good on Slow Networks**: Acceptable even on 3G  
✅ **No Jank**: Smooth 60fps, no UI blocking  
✅ **No Memory Leaks**: Stable memory usage

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Measurements:
```
[To be filled during test execution]

UI Update Time (avg of 10): ___ ms
Debounce Delay (avg of 10): ___ ms
GraphQL Response Time (avg of 10): ___ ms
End-to-End Time (avg of 10): ___ ms

Network Throttling Results:
  Fast 3G: ___ ms
  Slow 3G: ___ ms

Performance Comparison:
  5 separate mutations: ___ ms
  5 batched mutations: ___ ms
  Improvement: ___ %

Lighthouse Score: ___
Memory leak detected: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- UI updates <100ms (target <50ms)
- Debounce delay 900-1100ms
- GraphQL response <1000ms
- End-to-end <3s (target <2s)
- Batching shows performance improvement
- No jank or UI blocking
- No memory leaks
- Acceptable on slow networks

**Fail**: 
- UI updates >100ms
- Debounce inconsistent or incorrect
- GraphQL response >2s on normal network
- End-to-end >5s
- Batching doesn't improve performance
- Significant jank or frame drops
- Memory leaks detected
- Unusable on slow networks

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

- Use multiple tools for measurement (DevTools, Lighthouse, WebPageTest)
- Test on various devices (desktop, mobile)
- Test at different times of day (server load varies)
- Compare with old implementation if available
- Document environment details (CPU, network, server load)
- Statistical significance: Use median and percentile values (P50, P95, P99)

---

## Tools & Resources

- **Browser DevTools**: Performance tab, Network tab
- **Lighthouse**: Automated performance audit
- **WebPageTest**: External performance testing
- **performance.now()**: High-resolution timestamps
- **Chrome User Experience Report**: Real-world data
- **Server Monitoring**: New Relic, DataDog, or similar

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Performance timeline showing UI update
2. Network tab with timing breakdown
3. Lighthouse performance report
4. Memory profiler results
5. Comparison chart (old vs new)

