# Test Cases for VCST-3998: [Support] Download files from assets improvements

## User Story Details
- **Jira Key**: VCST-3998
- **Summary**: [Support] Download files from assets improvements
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/24/2025

## Description
Client: Notionsmarketing.
Client's noticed some inconsistencies in the Assets module when downloading files.
For example, when downloading a CSV file using the steps below, the download works as expected.
However, when downloading a .txt file, it opens in a new browser tab. This isn't a major inconvenience for smaller files, but some of these text files contain catalog import data that can be very large. In such cases, opening them in a new tab can cause the browser to freeze while trying to render all the content.
Question: Is the download button intended to always trigger a direct download, regardless of file type, or is opening certain files in a new tab the expected behavior?

---

## Test Cases

### Test Case 1: Verify CSV file direct download from Assets module
**Objective**: Verify that CSV files trigger a direct download when using the download button in Assets module, without opening in a new browser tab

**Preconditions**:
- User is logged into Virto Commerce Platform Manager (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- User has access to Assets module (https://docs.virtocommerce.org/platform/user-guide/assets/)
- At least one CSV file is uploaded to the Assets module
- Browser download settings are set to default (not blocking downloads)

**Test Steps**:
1. Navigate to Assets module from the main navigation menu
2. Locate a CSV file in the assets list (e.g., catalog_products.csv)
3. Select the CSV file by clicking on it
4. Click the "Download" button from the toolbar or context menu
5. Observe browser behavior and check the Downloads folder

**Expected Results**:
- CSV file should immediately start downloading to the browser's default download location
- No new browser tab should be opened
- File should be downloaded completely without corruption
- Browser should display download progress indicator
- Downloaded file should be accessible and openable with appropriate applications

**Test Data**: 
- Sample CSV file: catalog_products.csv (minimum 10 rows of product data)
- File size: ~50KB

**Priority**: High

---

### Test Case 2: Verify TXT file direct download without opening in browser tab
**Objective**: Verify that TXT files trigger a direct download when using the download button in Assets module, instead of opening in a new browser tab

**Preconditions**:
- User is logged into Virto Commerce Platform Manager (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- User has access to Assets module (https://docs.virtocommerce.org/platform/user-guide/assets/)
- At least one TXT file is uploaded to the Assets module
- Browser is configured with standard settings (not forcing TXT files to open in browser)

**Test Steps**:
1. Navigate to Assets module from the main navigation menu
2. Locate a TXT file in the assets list (e.g., import_data.txt)
3. Select the TXT file by clicking on it
4. Click the "Download" button from the toolbar
5. Monitor browser behavior for new tabs opening
6. Check browser's download folder for the downloaded file
7. Verify browser tab count remains unchanged

**Expected Results**:
- TXT file should initiate a direct download to the browser's default download location
- No new browser tab should be opened displaying the text content
- File download should complete successfully
- Browser should not attempt to render the text file content
- Downloaded file should match the original file (verify file hash if possible)

**Test Data**: 
- Sample TXT file: import_data.txt (small file ~5KB)
- Content: Plain text with catalog import data

**Priority**: High

---

### Test Case 3: Verify large TXT file download performance and browser stability
**Objective**: Verify that large TXT files (containing extensive catalog import data) download directly without causing browser freezing or performance degradation

**Preconditions**:
- User is logged into Virto Commerce Platform Manager (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- User has access to Assets module (https://docs.virtocommerce.org/platform/user-guide/assets/)
- Large TXT file (>5MB) containing catalog import data is uploaded to Assets module
- Browser memory usage monitoring tool is available (e.g., Task Manager, Activity Monitor)

**Test Steps**:
1. Note current browser memory usage before starting the test
2. Navigate to Assets module
3. Locate the large TXT file (e.g., large_catalog_import.txt with >100,000 lines)
4. Select the large TXT file
5. Click the "Download" button
6. Monitor browser responsiveness during download
7. Monitor browser memory usage during the download process
8. Wait for download completion
9. Verify file integrity after download

**Expected Results**:
- Large TXT file should start downloading immediately without opening in a new tab
- Browser should remain responsive throughout the download process
- Browser memory usage should not spike significantly
- No browser freeze or "Page Unresponsive" warnings should occur
- Download should progress normally with visible progress indicator
- Downloaded file should be complete and match original file size
- File should be immediately accessible after download completion

**Test Data**: 
- Large TXT file: large_catalog_import.txt
- File size: 5MB - 50MB
- Content: Catalog import data with 100,000+ lines

**Priority**: High

---

### Test Case 4: Verify consistent download behavior across multiple file types
**Objective**: Verify that the download functionality works consistently across various file types commonly used in Assets module, all triggering direct downloads

**Preconditions**:
- User is logged into Virto Commerce Platform Manager (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- User has access to Assets module (https://docs.virtocommerce.org/platform/user-guide/assets/)
- Multiple file types are uploaded to Assets: CSV, TXT, PDF, JSON, XML, XLSX, ZIP
- Browser is set to standard download settings

**Test Steps**:
1. Navigate to Assets module
2. For each file type (CSV, TXT, PDF, JSON, XML, XLSX, ZIP):
   - a. Locate and select the file
   - b. Click the "Download" button
   - c. Observe browser behavior (check for new tabs)
   - d. Verify file downloads to default location
   - e. Note any inconsistencies in behavior
3. Compare download behavior across all file types
4. Document any file types that open in browser vs. download

**Expected Results**:
- All file types should trigger direct downloads consistently
- No file type should open in a new browser tab
- Download button behavior should be uniform across all file types
- All files should download completely and be accessible
- No file corruption should occur
- Download progress should be visible for each file type
- Content-Disposition header should be set to "attachment" for all file types

**Test Data**: 
- sample.csv (50KB)
- sample.txt (10KB)
- sample.pdf (200KB)
- sample.json (15KB)
- sample.xml (20KB)
- sample.xlsx (100KB)
- sample.zip (500KB)

**Priority**: High

---

### Test Case 5: Verify download functionality across different browsers
**Objective**: Verify that file download behavior is consistent across major browsers (Chrome, Firefox, Edge, Safari) and all files download directly without opening in new tabs

**Preconditions**:
- User has access to Virto Commerce Platform Manager in multiple browsers: Chrome, Firefox, Edge, and Safari (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- User has access to Assets module (https://docs.virtocommerce.org/platform/user-guide/assets/)
- Same test files (CSV, TXT, PDF) are available in Assets module
- All browsers are updated to latest stable versions
- Default browser download settings are maintained

**Test Steps**:
1. In Google Chrome:
   - a. Login to Platform Manager and navigate to Assets
   - b. Download a TXT file and verify behavior
   - c. Download a CSV file and verify behavior
   - d. Document the behavior
2. Repeat Step 1 in Mozilla Firefox
3. Repeat Step 1 in Microsoft Edge
4. Repeat Step 1 in Safari (if applicable)
5. Compare behavior across all browsers
6. Document any browser-specific inconsistencies

**Expected Results**:
- All browsers should handle file downloads consistently
- TXT files should download directly in all browsers without opening in new tabs
- CSV files should download directly in all browsers
- No browser should display different behavior for the same file type
- Download functionality should work without requiring browser-specific code
- HTTP response headers should force download behavior uniformly across browsers
- All downloaded files should be complete and uncorrupted across all browsers

**Test Data**: 
- test_file.txt (25KB with catalog data)
- test_file.csv (50KB)
- test_file.pdf (100KB)

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Additional Testing Notes:
- **Browser Compatibility**: Test across Chrome (latest), Firefox (latest), Edge (latest), and Safari (latest)
- **File Size Boundaries**: Test with files ranging from 1KB to 100MB
- **Network Conditions**: Consider testing under slow network conditions to ensure download initiation is handled properly
- **Concurrent Downloads**: Test downloading multiple files simultaneously from Assets module
- **Special Characters**: Test files with special characters in filenames
- **Permissions**: Verify proper error handling when user lacks download permissions

---

## Notes
- The core issue relates to Content-Disposition headers not being consistently set to "attachment" for all file types
- Browser default behavior for text-based files (TXT, CSV, JSON, XML) is to render them if Content-Type is set without proper Content-Disposition header
- Solution should implement forced download by setting appropriate HTTP headers for all file types
- Testing should verify the fix doesn't break existing functionality for image files or other media types
- Related documentation: https://docs.virtocommerce.org/platform/user-guide/assets/
- Performance testing is critical for large files to ensure the solution doesn't impact user experience