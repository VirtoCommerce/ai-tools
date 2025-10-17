# Inventory Regression Test Execution Plan
## Based on vc-inventory.csv Test Cases

### Document Information
- **Source**: vc-inventory.csv (84 test cases from TestRail)
- **Target**: VirtoCommerce Inventory Module Regression Testing
- **Environment**: https://vcst-qa.govirto.com/
- **Module**: VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip
- **Execution Date**: January 2025

## Executive Summary

This execution plan maps the 84 test cases from the vc-inventory.csv file to the existing VCST-2585 regression test framework. The CSV contains comprehensive test cases covering:

- **Inventory Section Management** (10 test cases)
- **Dynamic Properties for Fulfillment Centers** (5 test cases)  
- **Inventory Management** (6 test cases)
- **Catalog Product Integration** (2 test cases)
- **Pre Order/Back Order** (6 test cases - NOT IMPLEMENTED)
- **Inventory Access Control** (5 test cases)
- **Fulfillment Center Management** (15 test cases)
- **Settings and Configuration** (4 test cases)

## Test Case Mapping Strategy

### Priority 1: Critical Functionality (Execute First)
These test cases align with the existing VCST-2585 framework and are critical for the Generic CRUD/Search migration:

#### CRUD Operations (Map to TC-001 to TC-004)
- **C239893** - Create Inventory → TC-001
- **C239888** - Read Inventory → TC-002  
- **C239894** - Update Inventory → TC-003
- **C239895** - Delete Inventory → TC-004

#### Search Operations (Map to TC-005 to TC-007)
- **C356992** - Inventory Search → TC-005
- **C200198** - Search FFC in list view → TC-006
- **C356990** - Inventory > View all → TC-007

#### Backup/Restore (Map to TC-008 to TC-009)
- **C241979** - Settings > Inventory > Export/Import → TC-008
- **C273550/273551** - Log inventory changes → TC-009

### Priority 2: Fulfillment Center Management
Execute these test cases to verify FFC integration with Generic services:

#### FFC CRUD Operations
- **C200191** - Add FFC
- **C200192** - Edit FFC > name
- **C200193** - Edit FFC > description  
- **C200194** - Edit FFC > geo location
- **C200195** - Edit FFC > address
- **C200196** - Delete FFC on details blade
- **C200197** - Delete FFC in list view

#### FFC Address Management
- **C200205** - Add address
- **C200207** - Delete address

#### FFC Dynamic Properties
- **C357002** - FFC > Dynamic properties > View
- **C357003** - FFC > Dynamic properties > Add property
- **C357004** - FFC > Dynamic properties > Update property
- **C357005** - FFC > Dynamic properties > Set value
- **C357006** - FFC > Dynamic properties > Delete property

### Priority 3: Inventory Management Integration
Execute these test cases to verify inventory business logic:

#### Stock Management
- **C201537** - Edit "in stock" quantity
- **C201538** - Order product > stock qty decreased
- **C201539** - Order more items than available
- **C201540** - Amount of available items calculation
- **C201541** - In stock = 0, item unavailable
- **C341053** - Add to cart > Update Inventory > Create order

#### Product Integration
- **C199248** - Track Inventory = FALSE
- **C199249** - Track Inventory = TRUE

### Priority 4: Settings and Configuration
Execute these test cases to verify system configuration:

- **C338430** - UI > Tool-tips
- **C241980** - Enable event-based indexation
- **C241981** - Disable event-based indexation
- **C201535** - Set default FFC
- **C201536** - Set available FFC

## Execution Schedule

### Day 1: Critical CRUD and Search (Priority 1)
**Duration**: 6-8 hours
**Test Cases**: 9 critical test cases

1. **Morning Session (4 hours)**
   - C239893 - Create Inventory (TC-001)
   - C239888 - Read Inventory (TC-002)
   - C239894 - Update Inventory (TC-003)
   - C239895 - Delete Inventory (TC-004)

2. **Afternoon Session (4 hours)**
   - C356992 - Inventory Search (TC-005)
   - C200198 - Search FFC (TC-006)
   - C356990 - View all inventory (TC-007)
   - C241979 - Export/Import settings (TC-008)
   - C273550/273551 - Log changes (TC-009)

### Day 2: Fulfillment Center Management (Priority 2)
**Duration**: 6-8 hours
**Test Cases**: 15 FFC test cases

1. **Morning Session (4 hours)**
   - C200191 - Add FFC
   - C200192 - Edit FFC name
   - C200193 - Edit FFC description
   - C200194 - Edit FFC geo location
   - C200195 - Edit FFC address
   - C200205 - Add address
   - C200207 - Delete address

2. **Afternoon Session (4 hours)**
   - C200196 - Delete FFC on details
   - C200197 - Delete FFC in list
   - C357002 - Dynamic properties view
   - C357003 - Add dynamic property
   - C357004 - Update dynamic property
   - C357005 - Set dynamic property value
   - C357006 - Delete dynamic property
   - C327758 - Add FFC with outerId via API
   - C327759 - Update outerId via API

### Day 3: Inventory Management Integration (Priority 3)
**Duration**: 6-8 hours
**Test Cases**: 8 inventory management test cases

1. **Morning Session (4 hours)**
   - C201537 - Edit in stock quantity
   - C201538 - Order product stock decrease
   - C201539 - Order more than available
   - C201540 - Available items calculation

2. **Afternoon Session (4 hours)**
   - C201541 - In stock = 0, unavailable
   - C341053 - Add to cart > Update > Create order
   - C199248 - Track Inventory = FALSE
   - C199249 - Track Inventory = TRUE

### Day 4: Settings and Advanced Features (Priority 4)
**Duration**: 4-6 hours
**Test Cases**: 5 settings test cases

1. **Morning Session (3 hours)**
   - C338430 - UI Tool-tips
   - C241980 - Enable event-based indexation
   - C241981 - Disable event-based indexation

2. **Afternoon Session (3 hours)**
   - C201535 - Set default FFC
   - C201536 - Set available FFC

### Day 5: Reporting and Documentation
**Duration**: 4-6 hours
- Complete test execution report
- Document any defects found
- Prepare sign-off documentation

## Test Data Requirements

### Required Test Data Setup
1. **Products**: Minimum 10 test products with various SKUs
2. **Fulfillment Centers**: Minimum 3 FFCs with different configurations
3. **Inventory Records**: Minimum 20 inventory records across different FFCs
4. **User Permissions**: Admin user with full inventory access
5. **Backup Files**: Pre-existing backup for restore testing

### Test Data from CSV Analysis
Based on the CSV, ensure these specific test scenarios are covered:
- Products with Track Inventory = TRUE/FALSE
- FFCs with different geo locations and addresses
- Inventory records with various stock levels (0, >0, reserved)
- Dynamic properties configured on FFCs
- Products with different availability states

## Risk Assessment

### High Risk Areas
1. **Generic CRUD Migration**: C239893, C239888, C239894, C239895
2. **Search Functionality**: C356992, C200198, C356990
3. **Backup/Restore**: C241979, C273550, C273551

### Medium Risk Areas
1. **FFC Management**: C200191-C200207, C357002-C357006
2. **Stock Calculations**: C201537-C201541, C341053
3. **Product Integration**: C199248, C199249

### Low Risk Areas
1. **UI Elements**: C338430
2. **Settings Configuration**: C241980, C241981, C201535, C201536

## Success Criteria

### Critical Success Criteria (Must Pass)
- All Priority 1 test cases (9 test cases) must pass
- No data corruption during CRUD operations
- Search functionality returns accurate results
- Backup/restore operations complete successfully

### High Success Criteria (Should Pass)
- 90% of Priority 2 test cases (14/15) must pass
- FFC management operations work correctly
- Dynamic properties functionality intact

### Medium Success Criteria (Nice to Pass)
- 80% of Priority 3 test cases (6/8) must pass
- Stock management calculations accurate
- Product integration working

### Low Success Criteria (Can Defer)
- 70% of Priority 4 test cases (3/5) must pass
- Settings and configuration options functional

## Defect Management

### Defect Severity Mapping
- **Critical**: CRUD operations fail, data loss, system crash
- **High**: Search returns incorrect results, FFC operations fail
- **Medium**: UI issues, performance problems, minor functionality gaps
- **Low**: Cosmetic issues, tooltip problems, minor validation issues

### Defect Reporting Process
1. Document defect with clear reproduction steps
2. Capture screenshots and error messages
3. Create Jira ticket linked to VCST-2585
4. Assign appropriate severity and priority
5. Track through resolution and verification

## Environment Setup

### Prerequisites
- Access to https://vcst-qa.govirto.com/
- Admin credentials: admin / Password3
- Inventory module version 3.812.0-pr-155-41aa installed
- Test data prepared and available
- Browser: Chrome (latest version)
- Screenshot capture capability

### Test Environment Verification
Before starting execution, verify:
- [ ] Environment is accessible
- [ ] Admin login works
- [ ] Inventory module is loaded
- [ ] Test data is available
- [ ] Backup functionality is working
- [ ] Export functionality is working

## Reporting Structure

### Daily Reports
- Progress against plan
- Test cases executed
- Pass/fail counts
- Defects found
- Blockers encountered

### Final Report
- Executive summary
- Detailed test results
- Defect summary
- Risk assessment
- Recommendations
- Sign-off section

## Sign-Off Criteria

### Test Execution Complete When:
- [ ] All Priority 1 test cases executed
- [ ] 90% of Priority 2 test cases executed
- [ ] 80% of Priority 3 test cases executed
- [ ] 70% of Priority 4 test cases executed
- [ ] All critical defects resolved
- [ ] Test execution report completed
- [ ] Stakeholder sign-off obtained

### Go/No-Go Decision Criteria:
- **Go**: All Priority 1 pass, <5 critical/high defects
- **No-Go**: Any Priority 1 fail, >5 critical/high defects
- **Conditional Go**: Priority 1 pass, 5-10 high defects with workarounds

---

**Document Version**: 1.0  
**Created**: January 2025  
**Based on**: vc-inventory.csv (84 test cases)  
**Target**: VCST-2585 Inventory Module Regression Testing


