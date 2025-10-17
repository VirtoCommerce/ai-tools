# VCST-2585: Inventory Module Regression Testing

## Overview

This directory contains comprehensive regression testing documentation for the VirtoCommerce Inventory module migration to Generic CRUD and Search services.

**Jira Ticket:** [VCST-2585 - Migrate Inventory to Generic CRUD and Search](https://virtocommerce.atlassian.net/browse/VCST-2585)

**Module Version:** VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip

**GitHub PR:** #155

## What Changed?

The following services were migrated from legacy implementation to Generic CRUD and Search:

- `IInventoryService`, `InventoryServiceImpl`
- `IInventorySearchService`, `InventorySearchService`
- `IProductInventorySearchService`, `ProductInventorySearchService`

### Affected Functionality

- **Backup / restore** - Inventory data backup and restore operations
- **Products indexing** - Product search index with inventory data
- **CRUD Operations** - Creating, reading, updating, and deleting inventory records
- **Search Operations** - Searching and filtering inventory by various criteria

### Related Bug Fix

**VCST-2576:** Export to CSV: Internal error: An expression services limit has been reached
- This bug is expected to be fixed as part of the Generic services migration
- TC-011 specifically tests this bug fix

## Test Documentation Structure

```
tests/VCST-2585-inventory-regression/
├── README.md                           ← You are here
├── test-plan.md                        ← Comprehensive test plan
├── test-data.md                        ← Test data specification
├── TC-001-create-inventory.md          ← Create operation test
├── TC-002-read-inventory.md            ← Read operation test
├── TC-003-update-inventory.md          ← Update operation test
├── TC-004-delete-inventory.md          ← Delete operation test
├── TC-005-search-by-sku.md             ← Search by SKU test
├── TC-006-search-by-fulfillment-center.md  ← Search by FC test
├── TC-007-advanced-search.md           ← Advanced search test
├── TC-008-backup-functionality.md      ← Backup test
├── TC-009-restore-functionality.md     ← Restore test
├── TC-010-product-indexing.md          ← Product indexing test
├── TC-011-csv-export.md                ← CSV export test (VCST-2576)
├── TC-012-bulk-operations.md           ← Bulk operations test
├── TC-013-stock-level-updates.md       ← Stock management test
├── TC-014-validation-rules.md          ← Validation test
├── TEST-EXECUTION-REPORT.md            ← Detailed execution report
└── TEST-SUMMARY.md                     ← Executive summary
```

## Quick Start

### Prerequisites

1. **Access to Test Environment**
   - URL: https://vcst-qa.govirto.com/
   - Username: admin
   - Password: Password3

2. **Test Data Setup**
   - Follow instructions in `test-data.md` to set up test data
   - Verify all required products and fulfillment centers exist

3. **Time Required**
   - Full test execution: 5-6 days
   - Priority 1 tests only: 2-3 days
   - Priority 1 & 2 tests: 3-4 days

### Execution Order

**Recommended execution sequence:**

1. **Setup Phase** (Day 0)
   - Review `test-plan.md`
   - Set up test data per `test-data.md`
   - Verify environment access

2. **CRUD Operations** (Day 1)
   - TC-001: Create Inventory
   - TC-002: Read Inventory
   - TC-003: Update Inventory
   - TC-004: Delete Inventory

3. **Search Functionality** (Day 2)
   - TC-005: Search by SKU
   - TC-006: Search by Fulfillment Center
   - TC-007: Advanced Search with Filters

4. **Integration Testing** (Day 3)
   - TC-008: Backup Functionality
   - TC-009: Restore Functionality
   - TC-010: Product Indexing

5. **Export and Bulk Operations** (Day 4)
   - TC-011: CSV Export (VCST-2576 verification)
   - TC-012: Bulk Operations
   - TC-013: Stock Level Updates

6. **Validation** (Day 5)
   - TC-014: Validation Rules

7. **Reporting** (Day 5-6)
   - Complete `TEST-EXECUTION-REPORT.md`
   - Complete `TEST-SUMMARY.md`
   - Prepare for sign-off

## Test Case Summary

| ID | Name | Priority | Type | Duration |
|----|------|----------|------|----------|
| TC-001 | Create New Inventory Record | P1 | CRUD | ~30 min |
| TC-002 | View/Read Inventory Details | P1 | CRUD | ~30 min |
| TC-003 | Update Inventory Information | P1 | CRUD | ~30 min |
| TC-004 | Delete Inventory Record | P1 | CRUD | ~30 min |
| TC-005 | Search Inventory by Product SKU | P1 | Search | ~45 min |
| TC-006 | Search Inventory by Fulfillment Center | P1 | Search | ~45 min |
| TC-007 | Advanced Inventory Search with Filters | P1 | Search | ~60 min |
| TC-008 | Inventory Backup Functionality | P1 | Integration | ~60 min |
| TC-009 | Inventory Restore Functionality | P1 | Integration | ~60 min |
| TC-010 | Product Indexing with Inventory Data | P1 | Integration | ~60 min |
| TC-011 | CSV Export for Inventory | P2 | Export | ~45 min |
| TC-012 | Bulk Inventory Operations | P2 | Bulk | ~90 min |
| TC-013 | Inventory Stock Level Updates | P2 | Stock Mgmt | ~60 min |
| TC-014 | Inventory Validation Rules | P3 | Validation | ~60 min |

**Total:** 14 test cases, ~12 hours estimated execution time

## Priority Levels

- **P1 - Critical (10 tests):** Must pass for production deployment
- **P2 - High (3 tests):** Should pass, minor issues can be accepted with workarounds
- **P3 - Medium (1 test):** Nice to pass, can be deferred if time-constrained

## Key Test Objectives

### 1. Verify Generic CRUD Migration ✓
- Ensure IInventoryService CRUD operations work correctly
- Validate data integrity after migration
- Confirm no regression in existing functionality

### 2. Verify Generic Search Migration ✓
- Ensure IInventorySearchService returns accurate results
- Validate filtering and sorting functionality
- Confirm search performance is acceptable

### 3. Verify Affected Areas ✓
- Backup and restore operations
- Product indexing with inventory data
- Getting, searching, saving, and deleting InventoryInfo objects

### 4. Verify Bug Fix (VCST-2576) ✓
- CSV export with 50+ records completes without errors
- No "expression services limit" error occurs

## Exit Criteria

Testing is complete when:

- ✓ All P1 test cases are executed
- ✓ All P2 test cases are executed (minimum 80%)
- ✓ No critical or high-severity defects remain open
- ✓ Pass rate is ≥ 90%
- ✓ VCST-2576 bug fix is verified
- ✓ Migration to Generic services is confirmed working
- ✓ Test execution report is completed
- ✓ Test summary is completed and signed off

## How to Use This Documentation

### For Test Executors

1. Start with `test-plan.md` for full context
2. Review `test-data.md` and set up test data
3. Execute test cases in recommended order
4. Document results in each test case file
5. Take screenshots and save as evidence
6. Fill in `TEST-EXECUTION-REPORT.md` as you go
7. Complete `TEST-SUMMARY.md` at the end

### For Test Reviewers

1. Review `TEST-SUMMARY.md` for quick overview
2. Check `TEST-EXECUTION-REPORT.md` for detailed results
3. Review individual test case files for specific details
4. Verify evidence (screenshots, logs) is attached
5. Sign off on report

### For Developers

1. Review failed test cases
2. Check detailed steps and expected vs actual results
3. Review screenshots and logs for debugging
4. Fix issues and notify test team for retest
5. Update comments in test case files with fix details

### For Product Owners

1. Review `TEST-SUMMARY.md` for go/no-go decision
2. Review defects and their impact
3. Review risks and recommendations
4. Make deployment decision
5. Sign off on test summary

## Environment Information

**Test Environment:**
- **URL:** https://vcst-qa.govirto.com/
- **Credentials:** admin / Password3
- **Module Version:** VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip

**Test Data:**
- See `test-data.md` for complete test data specification
- Minimum 50 inventory records required
- Multiple fulfillment centers configured
- Various product SKUs available

## Common Test Scenarios

### Scenario 1: Quick Smoke Test (Critical Path)
Execute these tests for a quick verification:
1. TC-001 (Create)
2. TC-002 (Read)
3. TC-005 (Search by SKU)
4. TC-011 (CSV Export - VCST-2576)

**Duration:** ~2 hours

### Scenario 2: CRUD Verification Only
Execute CRUD tests to verify Generic CRUD migration:
1. TC-001 (Create)
2. TC-002 (Read)
3. TC-003 (Update)
4. TC-004 (Delete)

**Duration:** ~2 hours

### Scenario 3: Search Verification Only
Execute search tests to verify Generic Search migration:
1. TC-005 (Search by SKU)
2. TC-006 (Search by FC)
3. TC-007 (Advanced Search)

**Duration:** ~2.5 hours

### Scenario 4: Full Regression
Execute all 14 test cases for complete regression testing.

**Duration:** ~12 hours (spread over 5-6 days)

## Troubleshooting

### Issue: Cannot access test environment
- Verify URL: https://vcst-qa.govirto.com/
- Verify credentials: admin / Password3
- Check with DevOps if environment is down
- Verify VPN connection (if required)

### Issue: Test data is missing
- Review `test-data.md` setup instructions
- Create missing products and inventory records
- Verify fulfillment centers exist
- Contact test lead if setup script is available

### Issue: Test case is blocked
- Document blocker in test case file
- Mark status as "Blocked"
- Note blocking issue in TEST-EXECUTION-REPORT
- Escalate to development team
- Move to next test case

### Issue: Unexpected test failure
- Review expected vs actual results
- Take screenshots of the failure
- Check browser console for errors
- Check server logs (if accessible)
- Create defect in Jira
- Link defect to test case
- Continue with next test case

## Reporting

### During Execution
- Update each test case file with results
- Take screenshots and save as evidence
- Document any defects immediately
- Update TEST-EXECUTION-REPORT regularly

### After Execution
- Complete all test case files
- Complete TEST-EXECUTION-REPORT
- Complete TEST-SUMMARY
- Prepare evidence package
- Submit for review

### Sign-Off
- Test Lead signs off on execution
- Development Lead reviews and signs off
- Product Owner makes go/no-go decision
- Final sign-off on TEST-SUMMARY

## Contact Information

**Test Team:**
- Test Lead: Elena Mutykova (elena.mutykova@virtoworks.com)
- QA Engineer: TBD

**Development Team:**
- Developer: Artem Dudarev (artem@virtoworks.com)
- Development Lead: TBD

**Product Team:**
- Product Owner: Oleg Zhuk (oleg@virtoworks.com)

## Related Resources

- [VCST-2585 Jira Ticket](https://virtocommerce.atlassian.net/browse/VCST-2585)
- [VCST-2576 Jira Ticket](https://virtocommerce.atlassian.net/browse/VCST-2576) (Related Bug)
- [GitHub PR #155](https://github.com/VirtoCommerce/vc-module-inventory/pull/155)
- VirtoCommerce Platform Documentation
- Generic CRUD and Search Services Documentation

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-15 | Test Team | Initial test documentation created |

---

**Document Status:** ✓ Complete and Ready for Execution

**Last Updated:** October 15, 2025

**Total Test Cases:** 14

**Estimated Effort:** 12 hours execution + 2 hours reporting = 14 hours total

