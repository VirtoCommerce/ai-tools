# Organization Search Functionality - Test Plan

**Date:** January 12, 2026  
**Feature:** Organization Selector Search  
**Location:** Account Menu > Organizations dropdown  
**API:** `GetOrganizations` GraphQL query with `searchPhrase` parameter  

---

## Test Categories Overview

| Category | Test Cases | Priority |
|----------|------------|----------|
| Special Characters | 20 | High |
| Unicode/International | 7 | Medium |
| Case Sensitivity | 4 | High |
| Partial Matching | 5 | High |
| Whitespace Handling | 4 | Medium |
| Empty/Null Input | 2 | High |
| Long Input | 3 | Medium |
| Numbers | 3 | Medium |
| No Results | 2 | High |
| Security (SQL Injection) | 3 | Critical |
| Security (XSS) | 3 | Critical |
| Lucene/Query Syntax | 12 | High |
| Regex Patterns | 5 | Medium |
| Boundary Cases | 2 | Medium |
| Performance | 2 | Low |
| Other | 13 | Various |

**Total: 90 test cases**

---

## 1. Special Characters Testing (HIGH PRIORITY)

Test how the search handles special characters that may have meaning in query parsers.

### Known Bug
| ID | Search Term | Expected | Actual | Status |
|----|-------------|----------|--------|--------|
| OS001 | `[e2e]` | Filter to "[e2e]" orgs | Returns ALL | ❌ BUG |

### Test Data

```
[e2e]           → Should find orgs with literal brackets
]test[          → Reversed brackets
(parentheses)   → Parentheses in name
Company & Sons  → Ampersand
Test #123       → Hash/pound sign
50% Off Store   → Percent sign (URL sensitive)
C++ Corp        → Plus signs (query syntax)
Test*           → Asterisk (wildcard in search)
Test?           → Question mark (single char wildcard)
"Quoted"        → Double quotes (phrase query)
'Single'        → Single quotes
Test/Slash      → Forward slash
Test\Backslash  → Backslash (escape char)
Test:Colon      → Colon (Lucene field separator)
Test@Email      → At sign
Test^Caret      → Caret (Lucene boost)
Test~Tilde      → Tilde (Lucene fuzzy)
Test!Exclaim    → Exclamation (NOT operator)
Test-Dash       → Dash/hyphen
Test_Underscore → Underscore
```

---

## 2. Unicode/International Characters (MEDIUM PRIORITY)

Test support for non-ASCII characters used in international organization names.

### Test Data

```
Müller GmbH        → German umlaut (ü)
Société Française  → French accents (é, ç)
日本会社            → Japanese (Kanji)
Компания           → Russian (Cyrillic)
شركة عربية         → Arabic (RTL)
Firma Øresund      → Nordic (Ø)
Café Express       → Accented lowercase
```

---

## 3. Case Sensitivity (HIGH PRIORITY)

Test if search is case-insensitive as expected.

### Test Data

| Search | Target Org | Expected |
|--------|------------|----------|
| `ACME` | ACME Store | ✅ Found |
| `acme` | ACME Store | ✅ Found |
| `AcMe` | ACME Store | ✅ Found |
| `aCME` | ACME Store | ✅ Found |

---

## 4. Partial Matching (HIGH PRIORITY)

Test different partial match scenarios.

### Test Data

| Search | Type | Example Matches |
|--------|------|-----------------|
| `AC` | Prefix | ACME Store |
| `A` | Single char | Aurora Market, ACME Store |
| `CME` | Middle | ACME Store |
| `Store` | Suffix | ACME Store, ACME Store 2 |
| `ME St` | Cross-word | ACME Store |

---

## 5. Whitespace Handling (MEDIUM PRIORITY)

Test edge cases with whitespace.

### Test Data

```
"ACME  Store"   → Double spaces between words
" ACME"         → Leading whitespace
"ACME "         → Trailing whitespace
"   "           → Only whitespace (should show all)
```

---

## 6. Security Testing (CRITICAL PRIORITY)

### SQL Injection Tests

```
'; DROP TABLE organizations;--
1 OR 1=1
UNION SELECT * FROM users
' OR '1'='1
1; DELETE FROM organizations
```

**Expected:** All queries should be safely escaped and NOT affect the database.

### XSS Tests

```
<script>alert('xss')</script>
<img src=x onerror=alert('xss')>
javascript:alert('xss')
<svg onload=alert('xss')>
{{constructor.constructor('alert(1)')()}}
```

**Expected:** All input should be sanitized and NOT execute scripts.

---

## 7. Lucene/Elasticsearch Query Syntax (HIGH PRIORITY)

If the backend uses Lucene/Elasticsearch, these syntax elements may cause issues:

### Test Data

| Search | Lucene Meaning | Expected Behavior |
|--------|----------------|-------------------|
| `name:ACME` | Field query | Search literally |
| `ACME AND Store` | AND operator | Search literally |
| `ACME OR Store` | OR operator | Search literally or match |
| `NOT ACME` | NOT operator | Search literally |
| `ACME TO BMW` | Range query | Search literally |
| `+ACME -BMW` | Required/excluded | Search literally |
| `ACME^2` | Boost | Search literally |
| `ACM*` | Wildcard | Search literally or expand |
| `ACM?` | Single wildcard | Search literally or expand |
| `ACME~` | Fuzzy | Search literally or fuzzy |
| `ACME~0.8` | Fuzzy distance | Search literally |
| `"ACME Store"` | Phrase | Exact phrase match |

---

## 8. Boundary Testing (MEDIUM PRIORITY)

### Test Data

```
A               → Single character (may have minimum)
AA              → Two characters
(50 chars)      → Moderate length
(500 chars)     → Very long input
(empty)         → Empty string
```

---

## 9. Numbers Testing (MEDIUM PRIORITY)

### Test Data

```
123             → Numeric only
Store 2         → Number suffix (common pattern)
2nd Floor Inc   → Ordinal numbers
#1 Company      → Hash with number
```

---

## 10. No Results Scenarios (HIGH PRIORITY)

### Test Data

```
XYZNONEXISTENT      → Random string with no matches
!@#$%^&*            → Special characters only
ThisOrgDoesNotExist → Long non-matching string
```

**Expected:** Graceful handling with "No organizations found" message.

---

## Test Execution Priority

### Phase 1: Critical Security Tests (Before Release)
- SQL Injection (OS051-OS053)
- XSS (OS054-OS056)

### Phase 2: High Priority Functional Tests
- Special Characters - Brackets (OS001-OS002) - **KNOWN BUG**
- Lucene Syntax (OS057-OS068)
- Case Sensitivity (OS028-OS031)
- Partial Matching (OS032-OS036)
- Empty/No Results (OS041-OS042, OS049-OS050)

### Phase 3: Medium Priority Tests
- Remaining Special Characters (OS003-OS020)
- Unicode (OS021-OS027)
- Whitespace (OS037-OS040)
- Numbers (OS046-OS048)
- Long Input (OS043-OS045)
- Regex Patterns (OS069-OS073)

### Phase 4: Low Priority Tests
- Performance (OS076-OS077)
- Emoji (OS087-OS088)
- Mixed Scripts (OS089-OS090)

---

## Test Environment

- **URL:** https://vcst-qa-storefront.govirto.com
- **Test User:** mutykovaelena@gmail.com (31 organizations)
- **Browser:** Chrome with DevTools

---

## Automation Recommendations

1. Create parameterized test suite using CSV data file
2. Use Playwright/Cypress for UI testing
3. Direct API testing for GraphQL `GetOrganizations` query
4. Include network response validation
5. Add visual regression for dropdown UI

---

## Related Files

- Test Data: `Regression/Organization_Search_Test_Data.csv`
- Bug Report: `Reports/Organization_Search_Brackets_Bug_Report.md`
- Test Report: `Reports/Organization_Switching_Test_Report_2026-01-12.md`
- Jira Issue: [VCST-4513](https://virtocommerce.atlassian.net/browse/VCST-4513)


