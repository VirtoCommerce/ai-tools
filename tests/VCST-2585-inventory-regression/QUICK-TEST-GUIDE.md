# Quick Test Execution Guide - VCST-2585

## 🚀 Quick Start for Manual Testers

**Environment:** https://vcst-qa.govirto.com/  
**Credentials:** admin / Password3  
**Browser Window:** Already open and logged in

## ✅ Tests Completed (2/14)

- ✅ **TC-002:** Read Inventory - PASSED
- ✅ **TC-003:** Update Inventory - PASSED

## ⏳ Remaining Tests (12/14)

### 🔴 Priority 1 - MUST COMPLETE (8 tests)

#### TC-001: Create New Inventory (~30 min)
**Path:** Catalog → Products → Find product without inventory in specific FC → Fulfillment Centers → Add
1. Find product with missing inventory in a FC
2. Click "Managing fulfillment centers" button
3. Select empty FC, enter quantity
4. Save and verify

#### TC-004: Delete Inventory (~30 min)  
**Path:** Catalog → Products → Product with test inventory → Fulfillment Centers → Delete
1. Use test product or product with low-value inventory
2. Click delete/trash icon on FC row
3. Confirm deletion dialog
4. Verify record removed from grid

#### TC-005: Search by SKU (~45 min)
**Path:** Catalog → Products → Search
1. Search for SKU: 16993868
2. Verify results show correct product
3. Search for SKU: 16785001
4. Search for non-existent SKU
5. Verify "no results" handling

#### TC-006: Search by Fulfillment Center (~45 min)
**Path:** Catalog → Products → Product → Fulfillment Centers → Filter
1. Apply FC filter (e.g., "New York Branch")
2. Verify only that FC's inventory shows
3. Change to different FC filter
4. Verify results update
5. Clear filter, verify all FCs show

#### TC-007: Advanced Search (~60 min)
**Path:** Catalog module with multiple filters
1. Combine SKU + FC filters
2. Test FC + Stock Level filters
3. Test 3+ filter combinations
4. Verify accurate filtering
5. Test filter clear functionality

#### TC-008: Backup Functionality (~60 min)
**Path:** More → Backup and restore → Backup
1. Navigate to Backup section
2. Select Inventory module
3. Start backup
4. Wait for completion
5. Verify backup file created
6. **Save backup file for TC-009**

#### TC-009: Restore Functionality (~60 min)
**Path:** More → Backup and restore → Restore
1. Use backup file from TC-008
2. Optionally modify some inventory first
3. Start restore
4. Wait for completion
5. Verify data restored correctly
6. Check test records match backup

#### TC-010: Product Indexing (~60 min)
**Path:** More → Search index → Products
1. Navigate to Search Index
2. Trigger product reindex
3. Wait for completion
4. Search for test product on storefront
5. Verify inventory status shows correctly
6. Verify stock levels reflected in search

### 🟡 Priority 2 - SHOULD COMPLETE (3 tests)

#### TC-011: CSV Export - **CRITICAL for VCST-2576** (~45 min)
**Path:** Catalog → Products → Fulfillment Centers → Export (or Generic Export)
1. Navigate to inventory list (50+ records)
2. Click Export or Export to CSV
3. **Verify NO "expression services limit" error** ← VCST-2576
4. Download CSV file
5. Open and verify contents
6. Verify all records exported
7. Test filtered export

**Why Critical:** This verifies the fix for VCST-2576 bug

#### TC-012: Bulk Operations (~90 min)
**Path:** Catalog → Products → Fulfillment Centers → Bulk Actions
1. **Bulk Update:** Select 10+ inventory records, update stock
2. **Bulk Delete:** Create test records, select multiple, delete
3. **Bulk Import:** Prepare CSV, import 20-30 records
4. Verify all operations complete successfully

#### TC-013: Stock Level Updates (~60 min)
**Path:** Catalog → Product → Fulfillment Centers → Edit
1. Test increasing stock (100 → 150)
2. Test decreasing stock (150 → 50)
3. Test setting to zero (Out of Stock)
4. Test restocking (0 → 75)
5. Test Reserved quantity updates
6. Verify status calculations

### 🟢 Priority 3 - NICE TO COMPLETE (1 test)

#### TC-014: Validation Rules (~60 min)
**Path:** Catalog → Product → Fulfillment Centers → Create/Edit
1. Test empty required fields
2. Test non-numeric values (abc)
3. Test negative values (-50)
4. Test decimal values (50.75)
5. Test very large values
6. Test duplicate records
7. Document validation behavior

## 📍 Quick Navigation Paths

### To Access Inventory:
1. **By Product:** Catalog → [Catalog Name] → [Category] → [Product] → Fulfillment Centers
2. **Global View:** Inventory menu (shows FCs list)

### To Test Backup/Restore:
1. Click **More** in left menu
2. Scroll to **Configuration** section
3. Click **Backup and restore**

### To Test Indexing:
1. Click **More** in left menu  
2. Under **Browse**, click **Search index**
3. Find **Products** index
4. Click **Rebuild**

### To Test CSV Export:
1. Navigate to inventory view (product level)
2. Look for **Export** button in toolbar
3. OR: More → Generic export

## 🎯 Critical Test Priorities

**If time is limited, test these first:**

1. **TC-011 (CSV Export)** ← Verifies VCST-2576 bug fix
2. **TC-008 (Backup)** ← Affected area from ticket
3. **TC-010 (Indexing)** ← Affected area from ticket
4. **TC-005 (Search by SKU)** ← Tests IInventorySearchService

## 📊 Test Data Quick Reference

**Product Tested:**
- SKU: 16993868 (Beats by Dre Powerbeats 2)
- Updated inventory: New York Branch = 250 units

**Other Products Available:**
- SKU: 16785001 (Beats by Dre Solo 2)
- SKU: JJU-90514434 (Beats by Dre Solo 2)
- SKU: 17070626 (Beats by Dre Studio Red)

**Fulfillment Centers (15 total):**
- New York Branch (has inventory: 250)
- Los Angeles Branch (has inventory: 15)
- Others (0 or not configured)

## 📝 Documentation Checklist

For each test:
- [ ] Take screenshots (before, during, after)
- [ ] Document actual results in test case file
- [ ] Mark status: Pass/Fail/Blocked
- [ ] Note any issues or observations
- [ ] Save evidence in `evidence/` folder

## ⚠️ Important Notes

**Test Data Safety:**
- ✅ Use "New York Branch" inventory (already modified to 250)
- ⚠️ For delete tests, create specific test records
- ⚠️ Do NOT delete production inventory data
- ⚠️ Document all changes made

**VCST-2576 Verification:**
- **Original Bug:** "Export to CSV: Internal error: An expression services limit has been reached"
- **Expected Result:** CSV export with 50+ records completes WITHOUT error
- **Test Case:** TC-011
- **Priority:** HIGH - This bug fix must be verified

## 🎬 Current Browser Session

**Session is active at:** https://vcst-qa.govirto.com/#!/workspace/Inventory

**Current View:** Fulfillment Centers list

**Ready for:** Continue testing from this point

## 📞 Contact for Issues

**Test Lead:** Elena Mutykova  
**Developer:** Artem Dudarev  
**Product Owner:** Oleg Zhuk

**Jira Ticket:** [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585)

---

## ⏱️ Time Estimates

**Remaining Time:** ~10-12 hours

- P1 tests (8 remaining): ~7.5 hours
- P2 tests (3): ~3 hours
- P3 tests (1): ~1 hour
- Reporting: ~1 hour

**Can be completed in:** 2-3 work days

---

**Last Updated:** October 16, 2025  
**Tests Passed:** 2/2 (100% so far)  
**Critical Issues:** 0

