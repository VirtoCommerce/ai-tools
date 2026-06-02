# TestRail CSV Import Instructions

## File Information
**CSV File:** `VCST-4499-TestRail-Import.csv`
**Created:** 2026-01-29
**Ticket:** VCST-4499 - [BOPIS] The map jumps when searching or clearing
**Pull Request:** #2138

---

## CSV Contents Summary

### Test Cases Included

#### **Functional Test Cases (15)**
1. **TC-001** - Basic Map Stability (Primary Bug Fix) - P0 Critical
2. **TC-002** - Desktop View - Location Selection Flow - P0 Critical
3. **TC-003** - Mobile View - List/Map Toggle - P0 Critical
4. **TC-004** - Search Functionality - P1 High
5. **TC-005** - Filter Operations - P1 High
6. **TC-006** - Map Interaction & Info Windows - P1 High
7. **TC-007** - Pickup Location Card Component - P1 High
8. **TC-008** - Scroll Behavior & Modal Controls - P2 Medium
9. **TC-009** - Responsive Breakpoint Testing - P1 High
10. **TC-010** - Localization Testing - P2 Medium
11. **TC-011** - Performance Testing - P2 Medium
12. **TC-012** - Error Handling & Edge Cases - P2 Medium
13. **TC-013** - Browser Compatibility - P1 High
14. **TC-014** - Accessibility Testing - P2 Medium
15. **TC-015** - Integration Testing - P1 High

#### **Regression Test Cases (6)**
1. **REG-001** - Standard Delivery Flow - P1 High
2. **REG-002** - Cart Operations - P1 High
3. **REG-003** - Other Modals/Dialogs - P2 Medium
4. **REG-004** - Checkout Flow - P1 High
5. **REG-005** - Payment Processing - P1 High
6. **REG-006** - Order History - P2 Medium

**Total Test Cases:** 21

---

## CSV Column Structure

The CSV file contains the following columns compatible with TestRail:

| Column | Description | Required |
|--------|-------------|----------|
| Section | Test suite/section name for organization | Yes |
| Title | Test case title | Yes |
| Type | Test type (Functional, Regression, etc.) | No |
| Priority | Test priority (Critical, High, Medium, Low) | No |
| Estimate | Estimated time to execute | No |
| References | Related tickets/PRs (VCST-4499, PR-2138) | No |
| Preconditions | Setup required before test execution | No |
| Steps | Test execution steps | Yes |
| Expected Result | Expected outcome of the test | Yes |

---

## How to Import into TestRail

### Option 1: Web Interface Import

1. **Log in to TestRail**
   - Navigate to your TestRail instance
   - Go to the appropriate project (e.g., VirtoStart)

2. **Navigate to Test Cases Section**
   - Click on "Test Cases" in the left sidebar
   - Select the suite where you want to import

3. **Import CSV**
   - Click on the "..." menu (or similar options menu)
   - Select "Import" → "CSV Import"
   - Choose `VCST-4499-TestRail-Import.csv`

4. **Map Columns**
   - TestRail will show a column mapping screen
   - Verify columns are mapped correctly:
     - Section → Section
     - Title → Title
     - Type → Type
     - Priority → Priority
     - Estimate → Estimate
     - References → References
     - Preconditions → Preconditions
     - Steps → Steps
     - Expected Result → Expected Result

5. **Configure Import Settings**
   - Choose "Create new sections" if sections don't exist
   - Select "Update existing test cases" if re-importing
   - Choose appropriate delimiter (comma)
   - Verify preview looks correct

6. **Complete Import**
   - Click "Import" button
   - Wait for import to complete
   - Verify test cases created in TestRail

### Option 2: TestRail API Import

If you need to automate the import:

```bash
# Example using TestRail API (requires API key)
curl -H "Content-Type: application/json" \
     -u "email:apikey" \
     -X POST \
     https://your-domain.testrail.io/index.php?/api/v2/add_cases/{section_id} \
     -d @testcases.json
```

---

## Sections Created

The import will create/use the following sections:

1. **VCST-4499 BOPIS Map Modal**
   - Contains all 15 functional test cases
   - Focus on BOPIS pickup location modal functionality

2. **VCST-4499 Regression**
   - Contains all 6 regression test cases
   - Validates no impact on existing functionality

---

## Priority Breakdown

| Priority | Count | Test Cases |
|----------|-------|------------|
| Critical (P0) | 3 | TC-001, TC-002, TC-003 |
| High (P1) | 11 | TC-004, TC-005, TC-006, TC-007, TC-009, TC-013, TC-015, REG-001, REG-002, REG-004, REG-005 |
| Medium (P2) | 7 | TC-008, TC-010, TC-011, TC-012, TC-014, REG-003, REG-006 |

---

## Test Execution Estimates

| Priority | Test Cases | Total Time |
|----------|------------|------------|
| Critical | 3 | 37 minutes |
| High | 11 | 115 minutes |
| Medium | 7 | 106 minutes |
| **Total** | **21** | **258 minutes (~4.3 hours)** |

**Note:** Estimates are for single environment/browser. Multiply for cross-browser/device testing.

---

## Creating a Test Run in TestRail

After importing, create a test run:

1. **Create Test Run**
   - Go to "Test Runs & Results"
   - Click "Add Test Run"
   - Name: "VCST-4499 PR #2138 - BOPIS Map Modal Validation"
   - Select imported test cases

2. **Assign Testers**
   - Assign appropriate QA team members
   - Set milestone (if applicable)
   - Set start/end dates

3. **Execute Tests**
   - Testers mark tests as Passed/Failed/Blocked
   - Add comments and attachments for failures
   - Link defects to failed tests

4. **Track Progress**
   - Monitor test run progress in dashboard
   - Generate reports as needed

---

## Custom Fields (Optional)

If your TestRail instance has custom fields, you may want to add:

- **Component:** BOPIS, Cart, Checkout
- **Browser:** Chrome, Firefox, Safari, Edge
- **Device:** Desktop, Mobile (iOS), Mobile (Android)
- **Environment:** Test, Staging, Production
- **Test Data:** Required test data or links

You can add these after import by editing test cases.

---

## Test Case Maintenance

After importing:

1. **Review Test Cases**
   - Verify all steps clear and accurate
   - Update any environment-specific details
   - Add screenshots or attachments if helpful

2. **Link Requirements**
   - Link test cases to VCST-4499 in TestRail
   - Link to VCST-4518 (related design ticket)
   - Link to PR #2138 in GitHub

3. **Configure Test Suites**
   - Organize into appropriate test suites
   - Create test plans if needed
   - Set up automated test associations (if applicable)

4. **Update as Needed**
   - Update test cases if requirements change
   - Add new test cases for edge cases discovered
   - Remove obsolete tests

---

## Troubleshooting Import Issues

### Common Issues

**Issue:** Columns not mapping correctly
**Solution:** Ensure CSV has exact column names as expected by TestRail

**Issue:** Special characters causing problems
**Solution:** Ensure CSV is UTF-8 encoded, check for unescaped quotes

**Issue:** Steps too long
**Solution:** TestRail has field length limits; split into multiple steps if needed

**Issue:** Sections not created
**Solution:** Enable "Create new sections" in import settings

**Issue:** Duplicate test cases
**Solution:** Check for existing tests with same title; use update mode

### Validation Checklist

Before importing:
- [ ] CSV file opens correctly in spreadsheet software
- [ ] All columns present and labeled correctly
- [ ] No empty required fields
- [ ] Quotes properly escaped
- [ ] File encoding is UTF-8
- [ ] Section names match desired structure

After importing:
- [ ] All 21 test cases imported
- [ ] Sections created correctly
- [ ] Test steps readable and formatted
- [ ] Expected results clear
- [ ] Priorities set correctly
- [ ] References linked properly

---

## Next Steps

1. ✅ **Import CSV** into TestRail
2. ⬜ **Review imported test cases** for accuracy
3. ⬜ **Create test run** for PR #2138 validation
4. ⬜ **Assign testers** to test run
5. ⬜ **Execute tests** and record results
6. ⬜ **Report defects** if any found
7. ⬜ **Generate test report** for stakeholders
8. ⬜ **Update test cases** based on execution feedback

---

## Additional Resources

- **TestRail Import Documentation:** https://www.gurock.com/testrail/docs/user-guide/howto/import
- **CSV Format Reference:** https://www.gurock.com/testrail/docs/user-guide/howto/import/csv
- **API Documentation:** https://www.gurock.com/testrail/docs/api

---

## Contact

For questions about these test cases or import process:
- **Test Plan Document:** `VCST-4499-PR2138-Analysis-And-TestPlan.md`
- **Jira Ticket:** https://virtocommerce.atlassian.net/browse/VCST-4499
- **GitHub PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2138

---

**Document Version:** 1.0
**Last Updated:** 2026-01-29
