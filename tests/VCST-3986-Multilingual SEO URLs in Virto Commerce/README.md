# Manual Testing - Multilingual SEO-Friendly URLs

This directory contains comprehensive manual test documentation for validating multilingual SEO-friendly URLs in Virto Commerce.

## 📋 Documents

### 1. [multilingual-seo-urls-test-plan.md](./multilingual-seo-urls-test-plan.md)
The main test plan document containing **45 detailed test cases** covering:
- Routing Tests (5 test cases)
- Language Switching Behavior Tests (4 test cases)
- Local Storage Persistence Tests (4 test cases)
- Error Handling Tests (4 test cases)
- Link Sharing and Preservation Tests (4 test cases)
- Sitemap Tests (4 test cases)
- Static Routing Tests (4 test cases)
- SEO Elements Tests (5 test cases)
- Cross-Page Navigation Tests (5 test cases)
- Browser Compatibility Tests (6 test cases)

### 2. [test-data.md](./test-data.md)
Supporting test data reference document containing:
- Sample URLs for all page types
- Expected translations for UI elements
- Test product and category data
- Error scenario examples
- SEO metadata examples
- Local storage key references

## 🎯 Testing Scope

### Languages Configured
- **Norwegian (no)** - Default language (no URL prefix)
- **German (de)** - URL prefix: `/de/`
- **French (fr)** - URL prefix: `/fr/`
- **Italian (it)** - URL prefix: `/it/`

### Pages Covered
- ✅ Static pages (Contacts, /account/, Cart, etc.)
- ✅ Dynamic pages (Products, Categories)
- ✅ User account pages (Profile, Orders, Lists)
- ✅ Checkout flow
- ✅ Search results

## 🚀 Getting Started

### Prerequisites
Before starting testing:
1. Ensure Virto Commerce storefront has multi-language configuration enabled
2. Verify Norwegian, German, and French languages are configured
3. Confirm test products and categories exist with translations
4. Have browser developer tools knowledge
5. Access to different browsers for compatibility testing

### Quick Start Guide

1. **Review the Test Plan**
   - Open [multilingual-seo-urls-test-plan.md](./multilingual-seo-urls-test-plan.md)
   - Read the Introduction and Test Scope sections
   - Familiarize yourself with test case format

2. **Prepare Test Data**
   - Open [test-data.md](./test-data.md)
   - Replace `https://example.com` with your actual storefront URL
   - Verify test products and categories exist in your environment
   - Document any deviations in Section 9.3

3. **Execute Tests**
   - Follow test cases sequentially or by priority
   - Fill in "Actual Results" for each test case
   - Mark Pass/Fail status
   - Document any issues in the Issues Log

4. **Report Results**
   - Complete the Test Execution Summary (Section 7)
   - Document high-priority issues
   - Provide overall test summary

## 📝 How to Use the Test Plan

### Test Case Format
Each test case includes:
- **Test ID:** Unique identifier (e.g., RT-001, LS-001)
- **Priority:** Critical, High, Medium, Low
- **Objective:** What the test validates
- **Preconditions:** Setup required before testing
- **Test Steps:** Numbered steps to execute
- **Expected Results:** What should happen
- **Actual Results:** _[Fill during execution]_
- **Status:** _[Mark Pass/Fail/Blocked/Not Tested]_
- **Notes:** _[Additional observations]_

### Execution Workflow

```
1. Read Test Case
   ↓
2. Verify Preconditions
   ↓
3. Execute Test Steps
   ↓
4. Compare Actual vs Expected Results
   ↓
5. Mark Pass/Fail Status
   ↓
6. Document Notes/Issues
   ↓
7. Move to Next Test Case
```

## 🔍 Test Categories Explained

### 1. Routing Tests (RT-XXX)
Validates that URLs are structured correctly with proper language prefixes and that pages load with appropriate language content.

**Key Focus:**
- Default language without prefix
- Language-specific prefixes (`/de/`, `/fr/`)
- Product and category routing

### 2. Language Switching Behavior Tests (LS-XXX)
Verifies that the language switcher component updates URLs and content correctly without breaking navigation.

**Key Focus:**
- UI component interaction
- URL updates during language change
- Content translation on switch
- Context preservation (e.g., same product across languages)

### 3. Local Storage Persistence Tests (LP-XXX)
Ensures that language preferences are saved in browser storage and persist across sessions.

**Key Focus:**
- Language preference storage
- Default language on return visit
- Cross-tab synchronization
- Incognito mode behavior

### 4. Error Handling Tests (EH-XXX)
Validates proper handling of invalid language codes and non-existent pages.

**Key Focus:**
- Invalid language codes return 404
- Malformed codes are rejected
- Consistent error handling

### 5. Link Sharing Tests (LS-XXX)
Confirms that language codes are preserved when URLs are copied, shared, or opened in new contexts.

**Key Focus:**
- Culture code preservation
- Social media sharing
- Email links
- Copy-paste functionality

### 6. Sitemap Tests (SM-XXX)
Validates that XML sitemaps include all language versions with proper hreflang annotations.

**Key Focus:**
- All languages in sitemap
- Hreflang annotations
- XML format validity
- Dynamic content inclusion

### 7. Static Routing Tests (SR-XXX)
Ensures that static pages (Cart, Checkout, Account) support multilingual URLs.

**Key Focus:**
- Cart page with language prefix
- Checkout flow with language consistency
- Account pages with localized URLs

### 8. SEO Elements Tests (SEO-XXX)
Verifies that SEO metadata (canonical tags, hreflang tags, Open Graph) is correctly implemented.

**Key Focus:**
- Canonical tags per language
- Hreflang tag implementation
- Meta tag language attributes
- Open Graph tags for social media
- Structured data (JSON-LD)

### 9. Cross-Page Navigation Tests (CN-XXX)
Confirms that language context is maintained during navigation between pages.

**Key Focus:**
- Navigation menu consistency
- Breadcrumb translation
- Search results
- Pagination
- Footer links

### 10. Browser Compatibility Tests (BC-XXX)
Ensures multilingual features work across different browsers and devices.

**Key Focus:**
- Chrome, Firefox, Safari, Edge
- Mobile browsers (iOS, Android)
- Consistent behavior across platforms

## 🎨 Test Execution Tips

### Using Browser Developer Tools

#### Inspecting URLs
1. Open Developer Tools (F12)
2. Navigate to the **Network** tab
3. Filter by **Doc** to see page requests
4. Verify HTTP status codes (200, 404, etc.)

#### Checking Local Storage
1. Open Developer Tools (F12)
2. Go to **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)
3. Expand **Local Storage**
4. Look for language-related keys

#### Viewing Page Source
1. Right-click on page → **View Page Source**
2. Search for:
   - `<link rel="canonical"`
   - `<link rel="alternate" hreflang=`
   - `<html lang=`
   - `<meta property="og:`

#### Console Error Checking
1. Open Developer Tools (F12)
2. Go to **Console** tab
3. Look for JavaScript errors during language switching
4. Clear console before each test for clarity

### Testing Best Practices

✅ **DO:**
- Clear cache and cookies before starting new test sessions
- Test in both logged-in and logged-out states
- Document actual behavior even if it differs from expected
- Take screenshots of issues for bug reports
- Test on different screen sizes (desktop, tablet, mobile)
- Verify both UI and underlying HTML (view source)

❌ **DON'T:**
- Skip preconditions
- Test multiple scenarios simultaneously
- Ignore console errors
- Assume behavior without verification
- Rush through test cases

## 📊 Test Prioritization

If time is limited, execute tests in this priority order:

### Phase 1: Critical (Must Test)
1. **RT-001:** Default Language URL Structure
2. **RT-002:** German Language URL with Prefix
3. **RT-003:** French Language URL with Prefix
4. **LS-001:** Language Switching (Norwegian to German)
5. **EH-001:** Invalid Language Code in URL
6. **LP-001:** Language Preference Saved in Local Storage
7. **SEO-002:** Hreflang Tags Verification
8. **SR-001:** Cart Page with Language Prefix
9. **SR-002:** Checkout Page with Language Prefix

### Phase 2: High Priority
10. **RT-004:** Product Page Routing
11. **RT-005:** Category Page Routing
12. **LS-003:** Language Switching on Product Page
13. **LP-002:** Default Language on Return Visit
14. **LS-001:** Share Link with Language Code
15. **SM-001:** Sitemap Contains All Language Versions
16. **SEO-001:** Canonical Tags Verification
17. **CN-001:** Navigation Menu Language Consistency

### Phase 3: Medium Priority
- Remaining test cases in test plan

### Phase 4: Nice to Have
- Browser compatibility tests on less common browsers
- Edge cases and exploratory testing

## 🐛 Issue Reporting Template

When documenting issues, use this template:

```markdown
**Issue ID:** BUG-XXX
**Test Case:** [Test Case ID and Title]
**Severity:** Critical / High / Medium / Low
**Environment:** [Browser, OS, Storefront Version]

**Description:**
[Clear description of the issue]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Screenshots/Evidence:**
[Attach screenshots, console errors, network logs]

**Additional Notes:**
[Any other relevant information]
```

## 📈 Test Metrics

Track these metrics during test execution:

| Metric | Value | Goal |
|--------|-------|------|
| Total Test Cases | 45 | - |
| Executed | __ | 45 |
| Passed | __ | 100% |
| Failed | __ | 0 |
| Blocked | __ | 0 |
| Pass Rate | __% | >95% |
| Critical Issues | __ | 0 |
| High Issues | __ | <3 |

## 🔗 Useful Tools

### SEO Testing Tools
- [Google Rich Results Test](https://search.google.com/test/rich-results) - Validate structured data
- [XML Sitemap Validator](https://www.xml-sitemaps.com/validate-xml-sitemap.html) - Validate sitemap
- [Hreflang Tag Validator](https://www.aleydasolis.com/english/international-seo-tools/hreflang-tags-generator/) - Check hreflang implementation
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) - Test Open Graph tags

### Browser Extensions
- **SEO Meta in 1 Click** (Chrome/Firefox) - Quick meta tag inspection
- **Hreflang Tag Checker** (Chrome) - Validate hreflang tags
- **Web Developer** (Chrome/Firefox) - Various web development tools

### Online Resources
- [Virto Commerce SEO Features](https://virtocommerce.com/features/centralized-seo)
- [Google International SEO Guide](https://developers.google.com/search/docs/specialty/international)
- [Hreflang Best Practices](https://developers.google.com/search/docs/specialty/international/localized-versions)

## 📞 Support

### Questions or Issues with Testing?
- Check the test plan document for detailed instructions
- Review the test data reference for expected values
- Consult Virto Commerce documentation
- Contact the QA team lead

## 📅 Test Execution Schedule

Recommended timeline for complete test execution:

| Day | Activity | Test Cases | Duration |
|-----|----------|------------|----------|
| **Day 1** | Setup & Routing Tests | RT-001 to RT-005 | 2-3 hours |
| **Day 2** | Language Switching & Storage | LS-001 to LP-004 | 2-3 hours |
| **Day 3** | Error Handling & Link Sharing | EH-001 to LS-004 | 2-3 hours |
| **Day 4** | Sitemap & Static Routing | SM-001 to SR-004 | 2-3 hours |
| **Day 5** | SEO Elements & Navigation | SEO-001 to CN-005 | 3-4 hours |
| **Day 6** | Browser Compatibility | BC-001 to BC-006 | 3-4 hours |
| **Day 7** | Bug fixes verification & Reporting | - | 2-3 hours |

**Total Estimated Effort:** 16-22 hours

## 🎓 Training Resources

### Before Starting Testing
1. Read Virto Commerce multilingual SEO documentation
2. Understand URL routing concepts
3. Familiarize yourself with SEO metadata (canonical, hreflang)
4. Learn basic browser DevTools usage

### Skills Required
- Manual testing fundamentals
- Basic understanding of HTML/URLs
- Browser developer tools proficiency
- SEO concepts (basic level)
- Attention to detail

## ✅ Pre-Test Checklist

Before beginning test execution:

- [ ] All test documents reviewed and understood
- [ ] Test environment is accessible
- [ ] Test data (products, categories) exists with translations
- [ ] Browser developer tools knowledge confirmed
- [ ] Multiple browsers available for compatibility testing
- [ ] Screenshots/recording tool ready
- [ ] Issue tracking system access confirmed
- [ ] Stakeholders notified about test schedule

## 📄 Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | October 14, 2025 | QA Team | Initial release |

---

**Happy Testing! 🚀**

For questions or feedback about this test plan, please contact the QA team.

