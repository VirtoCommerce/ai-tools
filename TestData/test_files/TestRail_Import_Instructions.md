# TestRail Import Instructions - Brand Page Test Cases

## Overview
This document contains instructions for importing brand page test cases into TestRail using the provided CSV and XML files.

## Files Created
1. **`brands_test_cases.csv`** - CSV format for TestRail import
2. **`brands_test_cases.xml`** - XML format for TestRail import

## Test Case Coverage

### Total Test Cases: 12

### Test Case Breakdown by Section:
- **Brands Page (8 test cases)**: Main brand directory functionality
- **Brand Page (4 test cases)**: Individual brand page functionality

### Test Case Priority Distribution:
- **High Priority (5 cases)**: Core functionality tests
- **Medium Priority (7 cases)**: Supporting functionality and edge cases

### Test Types:
- **Functional (9 cases)**: Core feature testing
- **Performance (1 case)**: Search performance testing  
- **Technical (1 case)**: URL and SEO structure testing
- **UI/UX (1 case)**: Mobile responsiveness testing

## Detailed Test Cases

### Brands Page Test Cases:
1. **TC_BRAND_001**: Verify Brands Page Load and Structure
2. **TC_BRAND_002**: Test Brand Search with Full Brand Name
3. **TC_BRAND_003**: Test Brand Search with Partial Name (Substring)
4. **TC_BRAND_004**: Test Search Reset Functionality
5. **TC_BRAND_005**: Verify Alphabetical Navigation System
6. **TC_BRAND_009**: Verify Brand Directory Completeness
7. **TC_BRAND_010**: Test Brand Search Performance and Responsiveness
8. **TC_BRAND_012**: Test Brand Page Mobile Responsiveness

### Brand Page Test Cases:
1. **TC_BRAND_006**: Test Individual Brand Page Navigation
2. **TC_BRAND_007**: Verify Brand Page Catalog Functionality
3. **TC_BRAND_008**: Test Brand Page URL and SEO Structure
4. **TC_BRAND_011**: Verify Brand Page Integration with Main Navigation

## TestRail Import Instructions

### Method 1: CSV Import

1. **Access TestRail Admin Panel**
   - Login to your TestRail instance as administrator
   - Navigate to Administration > Import

2. **Select CSV Import**
   - Choose "CSV" as import format
   - Upload the `brands_test_cases.csv` file

3. **Map CSV Columns**
   - Map CSV columns to TestRail fields:
     - ID → Custom Field (if using custom IDs)
     - Title → Title
     - Section → Section
     - Priority → Priority
     - Type → Type
     - Estimate → Estimate
     - References → References
     - Preconditions → Preconditions
     - Steps → Steps
     - Expected Results → Expected Result

4. **Import Configuration**
   - Select target project and test suite
   - Choose "Create new sections" if sections don't exist
   - Review mapping and execute import

### Method 2: XML Import

1. **Access TestRail Admin Panel**
   - Login to your TestRail instance as administrator
   - Navigate to Administration > Import

2. **Select XML Import**
   - Choose "XML" as import format
   - Upload the `brands_test_cases.xml` file

3. **XML Import Settings**
   - Select target project and test suite
   - Configure section mapping
   - Review field mappings

4. **Execute Import**
   - Validate XML structure
   - Execute import process
   - Review import results

## Field Mapping Details

### Standard TestRail Fields:
- **Title**: Test case name
- **Section**: Organizational hierarchy (Brands Page / Brand Page)
- **Priority**: High / Medium / Low
- **Type**: Functional / Performance / Technical / UI/UX
- **Estimate**: Time estimate for execution (2m-5m)
- **References**: External references (currently empty)
- **Preconditions**: Setup requirements before test execution
- **Steps**: Numbered test execution steps
- **Expected Result**: Expected outcomes for each test case

### Custom Fields (if applicable):
- **ID**: Custom test case identifier (TC_BRAND_001, etc.)

## Post-Import Verification

### Checklist:
1. ✅ Verify all 12 test cases imported successfully
2. ✅ Check section hierarchy (Brands Page / Brand Page)
3. ✅ Validate priority assignments
4. ✅ Confirm test type classifications
5. ✅ Review time estimates
6. ✅ Verify preconditions are properly set
7. ✅ Check step formatting and numbering
8. ✅ Validate expected results formatting

### Test Case Organization:
```
Project: VIRTO_START Demo Store
├── Suite: Brand Functionality
    ├── Section: Brands Page (8 test cases)
    │   ├── TC_BRAND_001: Page Load and Structure
    │   ├── TC_BRAND_002: Full Brand Name Search
    │   ├── TC_BRAND_003: Partial Brand Search
    │   ├── TC_BRAND_004: Search Reset
    │   ├── TC_BRAND_005: Alphabetical Navigation
    │   ├── TC_BRAND_009: Directory Completeness
    │   ├── TC_BRAND_010: Search Performance
    │   └── TC_BRAND_012: Mobile Responsiveness
    └── Section: Brand Page (4 test cases)
        ├── TC_BRAND_006: Brand Page Navigation
        ├── TC_BRAND_007: Brand Catalog Functionality
        ├── TC_BRAND_008: URL and SEO Structure
        └── TC_BRAND_011: Main Navigation Integration
```

## Execution Environment

### Prerequisites:
- **Platform**: VIRTO_START Demo Store
- **URL**: https://virtostart-demo-store.govirto.com/
- **User Account**: TestAndrew TestCook (Cypress-Corporate Kft.)
- **Browser**: Chrome/Firefox/Safari (cross-browser testing recommended)
- **Access**: Logged in user with appropriate permissions

### Test Data Requirements:
- Active user session
- Access to brand directory
- Multiple brands available (Apple, Microsoft, Samsung, etc.)
- Network connectivity for performance testing

## Troubleshooting Import Issues

### Common Issues and Solutions:

1. **CSV Format Issues**
   - Ensure UTF-8 encoding
   - Check for special characters in text fields
   - Verify comma escaping in multi-line fields

2. **XML Structure Issues**
   - Validate XML against TestRail schema
   - Check for properly escaped special characters
   - Ensure all required tags are present

3. **Field Mapping Issues**
   - Verify custom fields exist in TestRail
   - Check field type compatibility
   - Confirm section names match existing structure

4. **Permission Issues**
   - Ensure user has import permissions
   - Verify project and suite access rights
   - Check administrative privileges

## Contact Information

For questions or issues with test case import:
- Review TestRail documentation for import procedures
- Check TestRail community forums for troubleshooting
- Contact your TestRail administrator for assistance

---

**Generated**: January 7, 2025  
**Test Environment**: VIRTO_START Demo Store  
**Total Test Cases**: 12  
**Coverage**: Complete brand page functionality 