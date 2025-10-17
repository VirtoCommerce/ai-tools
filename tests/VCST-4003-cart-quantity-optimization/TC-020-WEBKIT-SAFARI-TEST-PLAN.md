# TC-020: WebKit/Safari Browser Testing Plan
## VCST-4003 - Complete Test Suite for Safari

**Browser**: WebKit (Safari)  
**Purpose**: Cross-browser compatibility validation  
**Test Date**: October 15, 2025  
**Environment**: https://vcst-qa-storefront.govirto.com  
**Version**: 2.33.0-pr-1992-29d7-29d7165b  

---

## 🎯 Testing Objective

Execute **ALL 20 test cases** (TC-001 through TC-020) on WebKit/Safari browser to validate cross-browser compatibility and ensure the VCST-4003 optimized cart quantity updates work identically across browsers.

---

## 📋 Complete Test Suite for WebKit

### Functional Tests (TC-001 to TC-008)

#### ✅ TC-001: Immediate UI Feedback
**Test**: Click + button, verify UI updates < 50ms
**Expected**: Instant quantity update, cart badge updates immediately
**WebKit Focus**: Check Safari rendering performance

#### ✅ TC-002: Debounce Batching (1-Second Delay)
**Test**: 5 rapid clicks, verify batching
**Expected**: Single mutation after ~1s, all changes included
**WebKit Focus**: Safari JavaScript timer accuracy

#### ✅ TC-003: Request Queuing
**Test**: Rapid changes while mutation pending
**Expected**: Sequential processing, no overlaps
**WebKit Focus**: Safari async operation handling

#### ✅ TC-004: Quantity Increase Operations
**Test**: Single and multiple increases
**Expected**: All increments captured, cart synced
**WebKit Focus**: Safari DOM updates

#### ✅ TC-005: Quantity Decrease Operations
**Test**: Single and multiple decreases
**Expected**: All decrements captured, cart synced
**WebKit Focus**: Button state management in Safari

#### ✅ TC-006: Remove Item (Quantity = 0)
**Test**: Decrease to 0, verify removal
**Expected**: Item removed from cart, "in Cart" indicator gone
**WebKit Focus**: Safari cart synchronization

#### ✅ TC-007: Cart Icon Synchronization
**Test**: Monitor badge updates with each action
**Expected**: Badge updates immediately, accurate count
**WebKit Focus**: Safari header re-rendering

#### ✅ TC-008: GraphQL Mutation Validation
**Test**: Inspect mutations in Safari DevTools
**Expected**: All 200 OK, lightweight responses
**WebKit Focus**: Safari Network tab, GraphQL debugging

---

### UX & Navigation Tests (TC-009 to TC-011)

#### ✅ TC-009: Browser Navigation Warning
**Test**: Add items, try to close tab/navigate away
**Expected**: Dialog: "Some operations are still in progress..."
**WebKit Focus**: Safari `beforeunload` event handling ⚠️
**Note**: Safari has stricter security - message may be generic

#### ✅ TC-010: Multiple Rapid Changes
**Test**: 10+ rapid clicks
**Expected**: All captured, UI responsive, final state correct
**WebKit Focus**: Safari performance under rapid input

#### ✅ TC-011: UI Loading States
**Test**: Observe loading indicators during mutations
**Expected**: Subtle indicators, non-blocking
**WebKit Focus**: Safari CSS animations, transitions

---

### Performance Tests (TC-012 to TC-014)

#### ✅ TC-012: Response Time Measurement
**Test**: Measure UI update, debounce delay, mutation response
**Expected**: <50ms UI, ~1000ms debounce, <1s mutation
**WebKit Focus**: Safari Web Inspector Performance timeline

#### ✅ TC-013: Network Optimization
**Test**: Analyze payload size, response size
**Expected**: Request <1KB, Response <5KB
**WebKit Focus**: Safari Network tab, payload inspection

#### ✅ TC-014: Concurrent Users Load Test
**Test**: Multiple Safari windows with same user
**Expected**: No conflicts, data consistent
**WebKit Focus**: Safari multi-window behavior

---

### Edge Cases (TC-015 to TC-019)

#### ✅ TC-015: Network Failure
**Test**: Use Safari DevTools → Disable network
**Expected**: Clear error messages, retry available
**WebKit Focus**: Safari offline mode handling

#### ✅ TC-016: Invalid Quantity Input
**Test**: Type negative numbers, text, special chars
**Expected**: Rejected/validated appropriately
**WebKit Focus**: Safari form validation, number input

#### ✅ TC-017: Session Expiry
**Test**: Delete cookies, trigger cart update
**Expected**: Session expiry message, redirect to login
**WebKit Focus**: Safari cookie/session management

#### ✅ TC-018: Concurrent Cart Updates
**Test**: Two Safari windows, simultaneous updates
**Expected**: Conflict resolution, data integrity
**WebKit Focus**: Safari IndexedDB/localStorage sync

#### ✅ TC-019: Maximum Quantity Limits
**Test**: Type 99999, verify stock limit warning
**Expected**: "Order from 1 to XXX items" message
**WebKit Focus**: Safari number input constraints

---

### Cross-Browser Specific (TC-020)

#### ✅ TC-020: WebKit/Safari Compatibility
**Test**: All above tests in Safari
**Expected**: Same behavior as Chromium
**WebKit Focus**: Document any Safari-specific differences

---

## 🔧 WebKit/Safari Setup Instructions

### Prerequisites

**For macOS**:
1. Safari (latest version - pre-installed)
2. Enable Developer menu:
   - Safari → Preferences → Advanced
   - Check "Show Develop menu in menu bar"

**For Windows** (WebKit via Playwright):
```bash
# Install Playwright WebKit
npx playwright install webkit

# Run tests
npx playwright test --project=webkit
```

---

## 📝 Safari-Specific Testing Notes

### Known Safari Differences

1. **beforeunload Event**:
   - Safari may show generic message instead of custom text
   - Dialog still appears, but message is browser-controlled
   - ✅ Functionality same, message may differ

2. **Number Input**:
   - Safari has different number input behavior
   - May handle decimals/negatives differently
   - Test validation carefully

3. **Autofill**:
   - Safari has aggressive autofill
   - May interfere with quantity fields
   - Disable if needed for testing

4. **Private Browsing**:
   - Test in regular and Private mode
   - localStorage/cookies behave differently

5. **Intelligent Tracking Prevention (ITP)**:
   - Safari blocks third-party cookies
   - May affect analytics tracking
   - Core functionality should work

---

## 🧪 WebKit Test Execution Checklist

### Environment Setup
- [ ] Safari browser open
- [ ] Developer tools enabled
- [ ] Network tab accessible
- [ ] Console tab open
- [ ] Logged in as USER2

### Pre-Test
- [ ] Clear cache and cookies
- [ ] Navigate to: https://vcst-qa-storefront.govirto.com
- [ ] Login with USER2 credentials
- [ ] Navigate to Accessories category
- [ ] Verify version: 2.33.0-pr-1992-29d7-29d7165b

### Functional Tests (8 tests)
- [ ] TC-001: Immediate UI Feedback
- [ ] TC-002: Debounce Batching
- [ ] TC-003: Request Queuing
- [ ] TC-004: Quantity Increase
- [ ] TC-005: Quantity Decrease
- [ ] TC-006: Remove Item (Qty=0)
- [ ] TC-007: Cart Icon Sync
- [ ] TC-008: GraphQL Mutation

### UX Tests (3 tests)
- [ ] TC-009: Navigation Warning
- [ ] TC-010: Multiple Rapid Changes
- [ ] TC-011: UI Loading States

### Performance Tests (3 tests)
- [ ] TC-012: Response Time
- [ ] TC-013: Network Optimization
- [ ] TC-014: Concurrent Users

### Edge Cases (5 tests)
- [ ] TC-015: Network Failure
- [ ] TC-016: Invalid Input
- [ ] TC-017: Session Expiry
- [ ] TC-018: Concurrent Updates
- [ ] TC-019: Max Quantity Limits

### Cross-Browser (1 test)
- [ ] TC-020: Compare with Chromium results

---

## 📊 WebKit Testing Results Template

### Browser Information
```
Browser: Safari
Version: ___________
OS: macOS ___________
Resolution: 1920x1080
```

### Test Results

| Test ID | Test Case | Chromium | WebKit | Match? | Notes |
|---------|-----------|----------|--------|--------|-------|
| TC-001 | Immediate UI Feedback | PASS | _____ | _____ | _____ |
| TC-002 | Debounce Batching | PASS | _____ | _____ | _____ |
| TC-003 | Request Queuing | PASS | _____ | _____ | _____ |
| TC-004 | Quantity Increase | PASS | _____ | _____ | _____ |
| TC-005 | Quantity Decrease | PASS | _____ | _____ | _____ |
| TC-006 | Remove Item (Qty=0) | PASS | _____ | _____ | _____ |
| TC-007 | Cart Icon Sync | PASS | _____ | _____ | _____ |
| TC-008 | GraphQL Mutation | PASS | _____ | _____ | _____ |
| TC-009 | Navigation Warning | PASS | _____ | _____ | _____ |
| TC-010 | Multiple Rapid Changes | PASS | _____ | _____ | _____ |
| TC-011 | UI Loading States | PENDING | _____ | _____ | _____ |
| TC-012 | Response Time | PENDING | _____ | _____ | _____ |
| TC-013 | Network Optimization | PENDING | _____ | _____ | _____ |
| TC-014 | Concurrent Users | PENDING | _____ | _____ | _____ |
| TC-015 | Network Failure | PENDING | _____ | _____ | _____ |
| TC-016 | Invalid Input | PASS | _____ | _____ | _____ |
| TC-017 | Session Expiry | PENDING | _____ | _____ | _____ |
| TC-018 | Concurrent Updates | PENDING | _____ | _____ | _____ |
| TC-019 | Max Quantity Limits | PASS | _____ | _____ | _____ |
| TC-020 | Cross-Browser | N/A | _____ | _____ | _____ |

---

## 🎯 Safari-Specific Test Scenarios

### Scenario 1: Safari Standard Mode
- Test all 20 cases in regular Safari
- Document any differences vs Chromium

### Scenario 2: Safari Private Browsing
- Test core functional cases (TC-001 to TC-008)
- Verify localStorage/cookies work

### Scenario 3: Safari with ITP (Intelligent Tracking Prevention)
- Test with strict tracking prevention
- Verify functionality not affected

### Scenario 4: Safari on iOS (Mobile)
- Test on iPhone/iPad Safari
- Touch interactions
- Mobile viewport

---

## 🔍 What to Look For in Safari

### JavaScript Compatibility
- [ ] ES6+ features work
- [ ] Async/await functions
- [ ] Promise handling
- [ ] Arrow functions

### CSS Compatibility
- [ ] Flexbox layout
- [ ] CSS Grid
- [ ] CSS Variables
- [ ] Animations/Transitions

### Web APIs
- [ ] Fetch API
- [ ] WebSocket
- [ ] LocalStorage
- [ ] SessionStorage
- [ ] BeforeUnload event

### Performance
- [ ] UI rendering speed
- [ ] JavaScript execution
- [ ] Network requests
- [ ] Memory usage

---

## 📝 Safari DevTools Guide

### Opening DevTools
1. **Enable**: Safari → Preferences → Advanced → "Show Develop menu"
2. **Open**: Develop → Show Web Inspector (⌘⌥I)

### Network Tab
1. Click **Network** tab
2. Filter by: **XHR** or **Fetch**
3. Look for GraphQL requests
4. Inspect payloads and responses

### Console Tab
1. Watch for errors/warnings
2. Check WebSocket messages
3. Verify no GraphQL errors

### Performance Timeline
1. **Elements** → **Timelines**
2. Record during cart operations
3. Analyze JavaScript execution
4. Check for layout shifts

---

## 🚀 Quick Start for Safari Testing

### Step 1: Environment Setup (5 min)
```
1. Open Safari
2. Navigate to: https://vcst-qa-storefront.govirto.com
3. Open Web Inspector (⌘⌥I)
4. Go to Network tab
```

### Step 2: Login (2 min)
```
1. Click "Sign in"
2. Email: ricreyacrouyi-3425@yopmail.com
3. Password: Password1
4. Verify login successful
```

### Step 3: Navigate to Test Page (1 min)
```
1. Click "All products"
2. Click "Accessories"
3. Verify page loads with products
```

### Step 4: Execute Tests (2-3 hours)
```
Follow each test case TC-001 through TC-020
Document results in comparison table
Note any Safari-specific behaviors
```

---

## 📊 Expected Results

### Baseline from Chromium Testing

**Tests Executed**: 12/20  
**Pass Rate**: 100% (12/12)  
**Defects**: 0  
**Console Errors**: 0  

### WebKit Target

**Goal**: Same or better results  
**Expected Differences**: Minor UI rendering variations acceptable  
**Critical**: All functional tests must PASS  
**Acceptable**: Slight performance variations (<20%)  

---

## 🎯 Success Criteria for WebKit

### Must Pass (Critical)
- ✅ All functional tests (TC-001 to TC-008)
- ✅ TC-009: Navigation warning
- ✅ TC-010: Rapid changes handling
- ✅ Core functionality identical to Chromium

### Should Pass (Important)
- ✅ Edge case tests (TC-016, TC-019)
- ✅ Input validation
- ✅ Boundary limits

### Nice to Have (Optional)
- Performance tests (TC-012, TC-013, TC-014)
- Advanced edge cases (TC-015, TC-017, TC-018)

---

## 📁 Test Execution Workflow

### Phase 1: Core Functional (30 min)
Execute TC-001 through TC-008 in Safari
Document any differences from Chromium
**Priority**: HIGH

### Phase 2: UX & Navigation (20 min)
Execute TC-009 through TC-011
Test Safari-specific beforeunload behavior
**Priority**: HIGH

### Phase 3: Edge Cases (30 min)
Execute TC-016 and TC-019 (already tested in Chromium)
Add TC-015, TC-017, TC-018 if time permits
**Priority**: MEDIUM

### Phase 4: Performance (30 min)
Execute TC-012, TC-013, TC-014
Use Safari Web Inspector
**Priority**: MEDIUM

### Phase 5: Comparison & Report (30 min)
Compare results with Chromium
Document differences
Create final cross-browser report
**Priority**: HIGH

---

## 🔧 Safari-Specific Test Adjustments

### TC-009: Navigation Warning
**Safari Behavior**: May show generic browser message instead of custom text  
**Expected**: Dialog appears, but message is: "Do you really want to leave this page?"  
**Validation**: Confirm dialog appears (message content secondary)

### TC-015: Network Failure
**Safari Method**: 
- Develop → Disable Caches
- Develop → Network → Disable Network (not available in Safari)
- Alternative: Turn off Wi-Fi manually

### TC-016: Invalid Input
**Safari Note**: Safari may handle number inputs differently  
**Test**: Verify negative numbers, text, special chars rejected

---

## 📱 Additional Safari Testing

### Safari on macOS (Desktop)
- **Version**: Latest stable
- **Resolution**: 1920x1080, 1366x768
- **OS**: macOS 12+ (Monterey, Ventura, Sonoma)

### Safari on iOS (Mobile)
- **Devices**: iPhone 12+, iPad Pro
- **iOS**: 15+
- **Orientation**: Portrait and Landscape
- **Touch**: Tap interactions, gestures

---

## 📈 Performance Benchmarks for Safari

| Metric | Chromium | Safari Target | Acceptable Range |
|--------|----------|---------------|------------------|
| UI Update | <50ms | <50ms | <100ms |
| Debounce | 1000ms ±50ms | 1000ms ±50ms | 1000ms ±100ms |
| GraphQL Response | <1000ms | <1000ms | <1500ms |
| Rapid Changes | Smooth | Smooth | Acceptable lag <200ms |

---

## 🎓 WebKit Testing Best Practices

### 1. Clear State Between Tests
```
- Clear cache: Develop → Empty Caches
- Clear cookies: Preferences → Privacy → Manage Website Data
- Reload: ⌘R
```

### 2. Use Safari Web Inspector Effectively
```
- Network: Monitor GraphQL requests
- Console: Check for errors
- Timelines: Measure performance
- Storage: Inspect cookies/localStorage
```

### 3. Test Safari-Specific Features
```
- Reader Mode (should not affect)
- Content Blockers (may affect analytics)
- Autofill (may interfere with inputs)
```

### 4. Compare with Chromium Results
```
- Side-by-side testing
- Document differences
- Classify severity (critical/minor/cosmetic)
```

---

## 📋 Safari Testing Checklist

### Pre-Test Setup
- [ ] Safari version documented
- [ ] macOS version documented
- [ ] Screen resolution noted
- [ ] Web Inspector enabled
- [ ] Network tab ready

### During Testing
- [ ] Screenshot each test result
- [ ] Note any console errors
- [ ] Record performance metrics
- [ ] Document user experience differences

### Post-Test
- [ ] Compare with Chromium results
- [ ] List all differences found
- [ ] Classify differences (critical/minor)
- [ ] Create summary report

---

## 🎯 Deliverables

After WebKit testing, create:

1. **WEBKIT-TEST-RESULTS.md** - Detailed results for all 20 tests
2. **CROSS-BROWSER-COMPARISON.md** - Chromium vs WebKit comparison
3. **TC-020-RESULTS.md** - Cross-browser compatibility summary
4. **Screenshots/** - Evidence from Safari testing

---

## 💡 Quick Reference: Chromium Results

For comparison, here are the Chromium test results:

✅ **Executed**: 12/20  
✅ **Passed**: 12/12 (100%)  
❌ **Failed**: 0  
🔧 **Defects**: 0  

**Key Tests Passed**:
- TC-001 through TC-008: All functional ✅
- TC-009: Navigation warning ✅
- TC-010: Rapid changes ✅
- TC-016: Invalid input ✅
- TC-019: Max limits ✅

---

## ⏱️ Estimated Time

| Phase | Duration | Priority |
|-------|----------|----------|
| Setup | 10 min | Required |
| Core Functional (TC-001 to TC-008) | 30 min | HIGH |
| UX & Navigation (TC-009 to TC-011) | 20 min | HIGH |
| Edge Cases (TC-016, TC-019) | 20 min | MEDIUM |
| Performance (TC-012 to TC-014) | 30 min | MEDIUM |
| Remaining Edge Cases | 30 min | LOW |
| Documentation & Comparison | 30 min | HIGH |
| **Total** | **2.5-3 hours** | |

---

## 🚀 Getting Started

### Immediate Next Steps

1. **Open Safari** on macOS (or install Playwright WebKit)
2. **Navigate** to: https://vcst-qa-storefront.govirto.com
3. **Login** with USER2 (ricreyacrouyi-3425@yopmail.com / Password1)
4. **Open Web Inspector** (⌘⌥I)
5. **Start with TC-001** and work through systematically

### Quick Test (10 min)
If short on time, execute just the critical tests:
- TC-001: Immediate UI Feedback
- TC-006: Remove Item (Qty=0)
- TC-007: Cart Icon Sync
- TC-009: Navigation Warning
- TC-016: Invalid Input

This will validate core functionality works in Safari.

---

## 📞 Support

**Test Plan**: See main test-plan.md  
**Test Cases**: Individual TC-00X files  
**Chromium Results**: ALL-TESTS-FINAL-SUMMARY.md  
**Questions**: Contact QA Team

---

## ✅ Approval

Once WebKit testing is complete:

- [ ] All critical tests pass in Safari
- [ ] No major differences from Chromium
- [ ] Performance acceptable (within 20% of Chromium)
- [ ] Cross-browser report created

**Sign-off**: WebKit/Safari compatibility validated ✅

---

**This plan ensures comprehensive WebKit/Safari testing for VCST-4003. Execute systematically and document all findings for complete cross-browser coverage!**

