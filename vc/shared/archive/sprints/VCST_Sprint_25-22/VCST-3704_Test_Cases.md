# Test Cases for VCST-3704: [Support] Sort products by localized name in GraphQL when cultureName is specified

## User Story Details
[As provided in the prompt]

---

## Test Cases

### Test Case 1: Basic Sorting with Single Culture
**Objective**: Verify products are sorted correctly by localized name when a single culture is specified

**Preconditions**:
- 3 products exist in the system with the following names:
  - Product 1: Default: "Banana", en-US: "Apple"
  - Product 2: Default: "Apple", en-US: "Cherry"
  - Product 3: Default: "Cherry", en-US: "Banana"

**Test Steps**:
1. Execute GraphQL query with cultureName: "en-US" and sort: "name:asc"
2. Verify the order of returned products

**Expected Results**:
- Products should be returned in order: Product 1 (Apple), Product 3 (Banana), Product 2 (Cherry)
- Sort should be based on localized names, not default names

**Test Data**: 
```graphql
query {
  products(
    cultureName: "en-US",
    sort: "name:asc"
  ) {
    results {
      code
      name
    }
  }
}
```

**Priority**: High

---

### Test Case 2: Descending Sort Order
**Objective**: Verify correct sorting in descending order using localized names

**Preconditions**:
- Same products as Test Case 1

**Test Steps**:
1. Execute GraphQL query with cultureName: "en-US" and sort: "name:desc"
2. Verify the order of returned products

**Expected Results**:
- Products should be returned in reverse alphabetical order based on localized names
- Order should be: Cherry, Banana, Apple

**Priority**: High

---

### Test Case 3: Multiple Culture Support
**Objective**: Verify sorting works correctly when switching between different cultures

**Preconditions**:
- Products exist with names in multiple cultures:
  - Product 1: Default: "X", en-US: "C", es-ES: "B"
  - Product 2: Default: "Y", en-US: "A", es-ES: "C"
  - Product 3: Default: "Z", en-US: "B", es-ES: "A"

**Test Steps**:
1. Execute query with cultureName: "en-US"
2. Verify order
3. Execute query with cultureName: "es-ES"
4. Verify order

**Expected Results**:
- en-US order should be: A, B, C
- es-ES order should be: A, B, C
- Different sorting order for each culture based on localized names

**Priority**: High

---

### Test Case 4: Missing Localized Names
**Objective**: Verify behavior when some products lack localized names

**Preconditions**:
- Products with mixed localization:
  - Product 1: Default: "Alpha", en-US: "Charlie"
  - Product 2: Default: "Beta", en-US: null
  - Product 3: Default: "Charlie", en-US: "Alpha"

**Test Steps**:
1. Execute query with cultureName: "en-US"
2. Verify handling of null/missing localizations

**Expected Results**:
- Products with missing localizations should fall back to default name
- Proper sorting mixing localized and default names

**Priority**: Medium

---

### Test Case 5: Special Characters and Unicode
**Objective**: Verify correct sorting with special characters and Unicode names

**Preconditions**:
- Products with special characters:
  - Product 1: Default: "Regular", en-US: "Café"
  - Product 2: Default: "Special", en-US: "Äpple"
  - Product 3: Default: "Unicode", en-US: "Zürich"

**Test Steps**:
1. Execute sorting query with cultureName: "en-US"
2. Verify handling of diacritics and special characters

**Expected Results**:
- Correct collation based on locale
- Proper handling of special characters and diacritics

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: Invalid Culture Name
**Objective**: Verify system behavior with invalid culture name

**Preconditions**:
- Standard product set exists

**Test Steps**:
1. Execute query with invalid cultureName: "xx-XX"
2. Execute query with empty cultureName: ""

**Expected Results**:
- Graceful error handling
- Fallback to default names
- Clear error message

**Priority**: Low

### Test Case 7: Large Dataset Performance
**Objective**: Verify sorting performance with large number of products

**Preconditions**:
- 1000+ products with localized names

**Test Steps**:
1. Execute sorting query on large dataset
2. Measure response time
3. Verify correct sorting

**Expected Results**:
- Response time within acceptable limits
- Correct sorting maintained with large datasets
- No timeout errors

**Priority**: Medium

---

## Notes
- Consider testing with different database collations
- Verify caching behavior if implemented
- Test impact on existing queries without cultureName parameter
- Consider performance impact of sorting on large datasets