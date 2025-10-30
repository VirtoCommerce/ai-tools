# Test Cases for VCST-3652: [News] [Backend] Search Indexing

## User Story Details
- **Jira Key**: VCST-3652
- **Summary**: [News] [Backend] Search Indexing
- **Priority**: High
- **Status**: To Do
- **Created**: 7/22/2025

## Description
As a User, I want the news items to be indexed (initially by title) so that I can quickly search and find relevant articles.

---

## Test Cases

### Test Case 1: Basic Title Search Functionality
**Objective**: Verify that news articles can be found using exact title search

**Preconditions**:
- Search index is empty
- Multiple news articles exist in the database
- Indexing service is running

**Test Steps**:
1. Add a news article with title "Breaking News: Tech Innovation"
2. Wait for indexing to complete
3. Perform exact title search "Breaking News: Tech Innovation"

**Expected Results**:
- Search returns exactly one article
- Returned article matches the indexed title exactly

**Test Data**: Article title = "Breaking News: Tech Innovation"

**Priority**: High

---

### Test Case 2: Partial Title Search
**Objective**: Verify that articles can be found using partial title matches

**Preconditions**:
- Search index contains multiple articles
- Indexing service is running

**Test Steps**:
1. Add multiple articles with similar titles:
   - "Technology News 2025"
   - "Technology Review"
   - "Science News"
2. Search for partial term "Technology"

**Expected Results**:
- Search returns two articles
- Results include "Technology News 2025" and "Technology Review"
- Results are returned within acceptable response time (<2 seconds)

**Test Data**: Multiple articles with varying titles

**Priority**: High

---

### Test Case 3: Case Insensitive Search
**Objective**: Verify search functionality works regardless of letter case

**Preconditions**:
- Article with title "Climate Change Report" exists in index

**Test Steps**:
1. Perform search with "CLIMATE CHANGE REPORT"
2. Perform search with "climate change report"
3. Perform search with "Climate Change Report"

**Expected Results**:
- All three searches return the same article
- Search results are consistent regardless of case

**Test Data**: Various case combinations of "Climate Change Report"

**Priority**: Medium

---

### Test Case 4: Special Characters Handling
**Objective**: Verify proper handling of special characters in search

**Preconditions**:
- Articles with special characters exist in index

**Test Steps**:
1. Index article with title "COVID-19: Global Update"
2. Search for "COVID-19"
3. Search for "COVID 19"
4. Search for "COVID19"

**Expected Results**:
- Search handles special characters appropriately
- Relevant article is found despite different hyphenation
- No system errors occur

**Test Data**: Titles with special characters

**Priority**: Medium

---

### Test Case 5: Empty and Whitespace Search
**Objective**: Verify system behavior with empty or whitespace-only searches

**Preconditions**:
- Search index contains articles

**Test Steps**:
1. Perform search with empty string
2. Perform search with only spaces
3. Perform search with multiple spaces between words

**Expected Results**:
- Empty search returns appropriate error message
- Whitespace-only search returns appropriate error message
- Multiple spaces are handled correctly

**Test Data**: "", "   ", "  multiple   spaces  "

**Priority**: Medium

---

### Test Case 6: Large Result Set Handling
**Objective**: Verify system performance with large number of search results

**Preconditions**:
- Index contains >1000 articles with similar titles

**Test Steps**:
1. Index 1000+ articles containing the word "News"
2. Perform search for "News"
3. Check response time and pagination

**Expected Results**:
- Results are paginated appropriately
- Response time remains under 3 seconds
- Results are ordered by relevance

**Test Data**: Large dataset of articles

**Priority**: High

---

### Test Case 7: Index Update Verification
**Objective**: Verify that index updates when articles are modified

**Preconditions**:
- Existing article in index

**Test Steps**:
1. Search for existing article
2. Modify article title
3. Wait for reindexing
4. Search for both old and new titles

**Expected Results**:
- Updated title is searchable
- Old title no longer returns results
- Index update occurs within specified timeframe

**Test Data**: Original and modified article titles

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 8: Invalid Character Handling
**Objective**: Verify system behavior with invalid search characters

**Preconditions**:
- Search index exists

**Test Steps**:
1. Perform search with SQL injection characters
2. Perform search with HTML tags
3. Perform search with extremely long string (>1000 characters)

**Expected Results**:
- System sanitizes input appropriately
- No security vulnerabilities exposed
- Appropriate error messages displayed
- System remains stable

**Test Data**: SQL injection strings, HTML tags, very long strings

**Priority**: High

---

## Notes
- All search operations should complete within 3 seconds
- Index updates should occur within 1 minute of content changes
- Error messages should be user-friendly and informative
- Related stories: Any API integration stories should be tested in conjunction
- Consider load testing for concurrent searches