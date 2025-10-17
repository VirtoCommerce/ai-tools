# Test Plan: VCST-2585 - Inventory Module Migration Regression Testing

## Document Information

| Field | Value |
|-------|-------|
| **Jira Ticket** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Feature Name** | Migrate Inventory to Generic CRUD and Search |
| **Module** | vc-module-inventory |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |
| **Test Plan Version** | 1.0 |
| **Date Created** | October 15, 2025 |
| **Test Environment** | VirtoCommerce Platform Admin |
| **Base URL** | https://vcst-qa.govirto.com/ |

## 1. Introduction

### 1.1 Purpose
This test plan outlines the regression testing strategy for the Inventory module migration from legacy implementation to Generic CRUD and Search services. The migration affects critical inventory management functionality across the VirtoCommerce platform.

### 1.2 Feature Overview
The Inventory module has been refactored to use Generic CRUD and Search patterns. The following services have been converted:

**Services Converted to Generic:**
- `IInventoryService`, `InventoryServiceImpl`
- `IInventorySearchService`, `InventorySearchService`
- `IProductInventorySearchService`, `ProductInventorySearchService`

**Affected Functionality:**
- Backup and restore operations
- Product indexing with inventory data
- CRUD operations for InventoryInfo objects (Create, Read, Update, Delete)
- Inventory search and filtering capabilities

### 1.3 Related Issues
- **Parent Task**: [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) - Migrate Inventory to Generic CRUD and Search
- **Related Bug**: [VCST-2576](https://virtocommerce.atlassian.net/browse/VCST-2576) - Export to CSV: Internal error
- **GitHub PR**: #155

## 2. Scope

### 2.1 In Scope
The following areas are included in this regression test plan:

1. **CRUD Operations** (Priority 1)
   - Create new inventory records
   - Read/view inventory details
   - Update existing inventory information
   - Delete inventory records

2. **Search Functionality** (Priority 1)
   - Search inventory by product SKU
   - Search by fulfillment center
   - Advanced search with multiple filters
   - Search result pagination and sorting

3. **Backup and Restore** (Priority 1)
   - Inventory data backup functionality
   - Inventory data restore functionality
   - Data integrity verification

4. **Product Indexing** (Priority 1)
   - Products indexing with inventory data
   - Inventory data synchronization in search index

5. **Export Functionality** (Priority 2)
   - CSV export for inventory records
   - Export with filters applied

6. **Bulk Operations** (Priority 2)
   - Bulk inventory updates
   - Bulk inventory deletion
   - Import inventory data

7. **Stock Management** (Priority 2)
   - Stock level updates
   - In-stock/out-of-stock status changes
   - Reserved quantity management

8. **Validation Rules** (Priority 3)
   - Required field validation
   - Data type validation
   - Business rule validation

### 2.2 Out of Scope
- Performance testing and load testing
- API-level testing (focus on UI-based testing)
- Third-party integrations with inventory systems
- Custom inventory module extensions
- Database schema migration testing

### 2.3 Test Types
- **Regression Testing**: Verify existing functionality still works after migration
- **Functional Testing**: Validate CRUD and search operations
- **Integration Testing**: Test inventory data flow with products and fulfillment centers
- **Data Integrity Testing**: Ensure data consistency across operations

## 3. Test Objectives

1. Verify all CRUD operations function correctly after migration to generic services
2. Validate search functionality returns accurate results with proper filtering
3. Ensure backup and restore operations maintain data integrity
4. Confirm product indexing includes correct inventory information
5. Validate CSV export functionality (related to VCST-2576 fix)
6. Verify bulk operations handle multiple records efficiently
7. Ensure stock level management functions as expected
8. Validate all validation rules are properly enforced

## 4. Test Environment

### 4.1 Application Under Test
- **Application**: VirtoCommerce Platform Admin
- **Environment**: QA/Staging
- **URL**: https://vcst-qa.govirto.com/
- **Module Version**: VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip

### 4.2 Test Credentials
- **Username**: admin
- **Password**: Password3

### 4.3 Test Data Requirements
- Multiple products with varying SKUs
- Multiple fulfillment centers
- Existing inventory records across different states
- Test products for creating new inventory records
- Backup files for restore testing
- CSV files for import testing

### 4.4 Prerequisites
- VirtoCommerce Platform is deployed and accessible
- Inventory module version 3.812.0-pr-155-41aa is installed
- Test user has admin permissions
- Test data is prepared and available
- Database backup exists before testing begins

## 5. Test Strategy

### 5.1 Test Approach
- **Manual Testing**: Primary testing method for UI validation
- **Exploratory Testing**: Additional testing for edge cases
- **Data-Driven Testing**: Use multiple data sets for comprehensive coverage
- **Regression Testing**: Verify no existing functionality is broken

### 5.2 Test Execution Priority
1. **Priority 1 (Critical)**: CRUD operations, Search, Backup/Restore, Product Indexing
2. **Priority 2 (High)**: CSV Export, Bulk Operations, Stock Management
3. **Priority 3 (Medium)**: Validation Rules, Edge Cases

### 5.3 Test Data Management
- Use dedicated test products and fulfillment centers
- Create isolated test data to avoid conflicts
- Clean up test data after execution (when appropriate)
- Maintain data traceability for debugging

## 6. Entry and Exit Criteria

### 6.1 Entry Criteria
- ✓ Feature development is complete (PR #155)
- ✓ Inventory module 3.812.0-pr-155-41aa is deployed to QA environment
- ✓ Test environment is accessible and stable
- ✓ Test data is prepared
- ✓ Test cases are reviewed and approved
- ✓ Admin credentials are verified

### 6.2 Exit Criteria
- All Priority 1 test cases are executed
- All Priority 2 test cases are executed (minimum 80%)
- No critical or high-severity defects remain open
- All test cases have pass rate ≥ 90%
- Data integrity is verified across all operations
- Test execution report is completed
- Sign-off from Product Owner and QA Lead

## 7. Test Deliverables

1. **Test Plan** (this document)
2. **Test Cases** (14 individual test case documents)
   - TC-001 through TC-014
3. **Test Data Documentation** (`test-data.md`)
4. **Test Execution Report** (`TEST-EXECUTION-REPORT.md`)
5. **Test Summary** (`TEST-SUMMARY.md`)
6. **Defect Reports** (Jira tickets for any bugs found)
7. **Screenshots and Evidence** (captured during execution)

## 8. Test Cases Overview

| Test Case ID | Test Case Name | Priority | Type | Status |
|--------------|----------------|----------|------|--------|
| TC-001 | Create New Inventory Record | P1 | Functional | Not Started |
| TC-002 | View/Read Inventory Details | P1 | Functional | Not Started |
| TC-003 | Update Inventory Information | P1 | Functional | Not Started |
| TC-004 | Delete Inventory Record | P1 | Functional | Not Started |
| TC-005 | Search Inventory by Product SKU | P1 | Functional | Not Started |
| TC-006 | Search Inventory by Fulfillment Center | P1 | Functional | Not Started |
| TC-007 | Advanced Inventory Search with Filters | P1 | Functional | Not Started |
| TC-008 | Inventory Backup Functionality | P1 | Integration | Not Started |
| TC-009 | Inventory Restore Functionality | P1 | Integration | Not Started |
| TC-010 | Product Indexing with Inventory Data | P1 | Integration | Not Started |
| TC-011 | CSV Export for Inventory | P2 | Functional | Not Started |
| TC-012 | Bulk Inventory Operations | P2 | Functional | Not Started |
| TC-013 | Inventory Stock Level Updates | P2 | Functional | Not Started |
| TC-014 | Inventory Validation Rules | P3 | Functional | Not Started |

## 9. Test Case Details

### 9.1 CRUD Operations (TC-001 to TC-004)
These test cases verify the basic Create, Read, Update, Delete operations for inventory records using the new generic CRUD services.

**Focus Areas:**
- IInventoryService implementation
- Data persistence and retrieval
- UI responsiveness and error handling

### 9.2 Search Functionality (TC-005 to TC-007)
These test cases validate the search capabilities using the new generic search services.

**Focus Areas:**
- IInventorySearchService implementation
- IProductInventorySearchService implementation
- Filter accuracy and performance

### 9.3 Backup and Restore (TC-008 to TC-009)
These test cases ensure data integrity during backup and restore operations with the migrated services.

**Focus Areas:**
- Data export completeness
- Restore accuracy
- No data corruption

### 9.4 Product Indexing (TC-010)
This test case verifies that product indexing correctly includes inventory information after the migration.

**Focus Areas:**
- Index synchronization
- Search result accuracy
- Data freshness

### 9.5 Export and Bulk Operations (TC-011 to TC-012)
These test cases validate export functionality (related to VCST-2576 fix) and bulk operations.

**Focus Areas:**
- CSV export correctness
- Bulk update efficiency
- Error handling

### 9.6 Stock Management and Validation (TC-013 to TC-014)
These test cases verify stock level management and validation rules enforcement.

**Focus Areas:**
- Stock level accuracy
- Validation rule enforcement
- Business logic integrity

## 10. Assumptions and Dependencies

### 10.1 Assumptions
- Test environment mirrors production configuration
- Generic CRUD and Search services are properly configured
- Database migrations have been applied successfully
- All dependent modules are at compatible versions
- Test data represents realistic inventory scenarios

### 10.2 Dependencies
- **Development Team**: PR #155 must be merged and deployed
- **DevOps Team**: Environment must be stable and accessible
- **Product Team**: Test data requirements confirmed
- **Related Issues**: VCST-2576 fix is included in this release

## 11. Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Test environment instability | High | Medium | Have backup environment ready; coordinate with DevOps |
| Data migration issues | Critical | Low | Verify database state before testing; have rollback plan |
| Generic service compatibility | High | Medium | Test CRUD operations first; validate service integration |
| Backup/restore failures | Critical | Low | Create manual backup before testing; verify restore process |
| CSV export regression | Medium | Low | Reference VCST-2576 fix; test with large datasets |
| Product indexing delays | Medium | Medium | Allow sufficient time for index refresh; verify sync status |
| Test data corruption | High | Low | Use isolated test data; clean up after each test cycle |

## 12. Test Schedule

| Activity | Duration | Start Date | End Date | Dependencies |
|----------|----------|------------|----------|--------------|
| Test Plan Review | 0.5 day | Oct 15 | Oct 15 | Test plan completion |
| Test Environment Setup | 0.5 day | Oct 15 | Oct 15 | Module deployment |
| Test Data Preparation | 0.5 day | Oct 15 | Oct 16 | Environment ready |
| P1 Test Execution (TC-001 to TC-010) | 2 days | Oct 16 | Oct 17 | Test data ready |
| P2 Test Execution (TC-011 to TC-013) | 1 day | Oct 18 | Oct 18 | P1 tests complete |
| P3 Test Execution (TC-014) | 0.5 day | Oct 18 | Oct 18 | P2 tests complete |
| Defect Retesting | 1 day | Oct 21 | Oct 21 | Bug fixes deployed |
| Test Report & Sign-off | 0.5 day | Oct 21 | Oct 21 | All testing complete |

**Total Estimated Duration**: 5-6 days

## 13. Roles and Responsibilities

| Role | Name | Responsibilities |
|------|------|------------------|
| Developer | Artem Dudarev | Feature development, bug fixes, technical support |
| Product Owner | Oleg Zhuk | Feature requirements, acceptance criteria, sign-off |
| Test Lead | Elena Mutykova | Test planning, coordination, reporting |
| QA Engineer | TBD | Test execution, defect reporting, verification |
| DevOps Engineer | TBD | Environment setup, deployment support |

## 14. Defect Management

### 14.1 Defect Severity Levels
- **Critical**: System crash, data loss, security breach, complete feature failure
- **High**: Major functionality broken, significant impact, workaround difficult
- **Medium**: Minor functionality issue, moderate impact, workaround available
- **Low**: Cosmetic issue, minimal impact, no functionality loss

### 14.2 Defect Priority Levels
- **P1**: Must fix before release (Critical/High severity)
- **P2**: Should fix before release (Medium severity)
- **P3**: Nice to fix (Low severity, can defer to next release)

### 14.3 Defect Reporting Process
1. Reproduce the defect consistently
2. Document with clear steps, expected vs actual results
3. Attach screenshots/videos and log files
4. Create Jira ticket with appropriate severity and priority
5. Link to VCST-2585 parent ticket
6. Tag relevant team members
7. Track defect through resolution and verification

### 14.4 Defect Lifecycle
1. **New**: Defect reported
2. **Open**: Defect confirmed and assigned
3. **In Progress**: Developer working on fix
4. **Ready for Test**: Fix deployed to test environment
5. **Retest**: QA verifying the fix
6. **Closed**: Fix verified and accepted
7. **Reopened**: Issue persists or regression found

## 15. Communication Plan

### 15.1 Daily Updates
- Test execution progress
- Pass/fail counts
- Blocking issues
- Risk updates

### 15.2 Escalation Path
1. **Level 1**: QA Engineer → Test Lead
2. **Level 2**: Test Lead → Development Lead
3. **Level 3**: Development Lead → Product Owner

### 15.3 Reporting Frequency
- **Daily**: Progress updates in standup
- **End of Day**: Email summary to stakeholders
- **Weekly**: Formal status report
- **Final**: Test completion report and sign-off

## 16. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Test Lead | Elena Mutykova | | |
| Product Owner | Oleg Zhuk | | |
| Development Lead | Artem Dudarev | | |
| QA Manager | TBD | | |

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-15 | Test Team | Initial test plan creation for VCST-2585 |

---

## References

- [VCST-2585 - Jira Ticket](https://virtocommerce.atlassian.net/browse/VCST-2585)
- [VCST-2576 - Related Bug](https://virtocommerce.atlassian.net/browse/VCST-2576)
- [GitHub PR #155](https://github.com/VirtoCommerce/vc-module-inventory/pull/155)
- VirtoCommerce Platform Documentation
- Generic CRUD and Search Services Documentation

