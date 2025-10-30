# Test Cases for VCST-3386: Explain mode for Seo Module

## User Story Details
- **Jira Key**: VCST-3386
- **Summary**: Explain mode for Seo Module
- **Priority**: Medium
- **Status**: Done
- **Created**: 6/2/2025

## Description
As an eCommerce Administrator, I want to enable Explain mode for SEO slug resolving, so that I can understand the reason of the response.

---

## Test Cases

### Test Case 1: Enable Explain Mode and Verify Response for Valid SEO Slug
**Objective**: Verify that when Explain mode is enabled for the SEO module, the API response includes explanatory information about how the SEO slug was resolved.

**Preconditions**:
- Virto Commerce platform is installed and running (https://docs.virtocommerce.org/platform/admin-guide/installation/)
- SEO module is installed and configured (https://docs.virtocommerce.org/modules/seo/)
- Administrator has access to platform API
- At least one product/category with a valid SEO slug exists in the system (e.g., "electronics-laptop")

**Test Steps**:
1. Navigate to the API endpoint for SEO slug resolution (typically `/api/seo/slugs/resolve`)
2. Enable Explain mode by adding the query parameter `?explain=true` to the API request
3. Send a GET request with a valid SEO slug: `/api/seo/slugs/resolve/electronics-laptop?explain=true`
4. Review the response body structure
5. Verify that the response contains explanation fields describing the resolution process

**Expected Results**:
- API returns HTTP 200 status code
- Response includes the resolved entity (product/category)
- Response contains additional "explain" or "debug" section with details such as:
  - Slug matching logic used
  - Database queries executed
  - Resolution path taken
  - Timestamp of resolution
- Explanation data clearly describes why this particular entity was returned

**Test Data**: 
- Valid SEO slug: "electronics-laptop"
- Entity type: Product
- Store: Default store

**Priority**: High

---

### Test Case 2: Explain Mode Disabled - Verify Standard Response
**Objective**: Verify that when Explain mode is disabled (default behavior), the API returns only the standard response without explanatory information.

**Preconditions**:
- Virto Commerce platform is installed and running
- SEO module is installed and configured (https://docs.virtocommerce.org/modules/seo/)
- At least one product/category with a valid SEO slug exists in the system

**Test Steps**:
1. Navigate to the API endpoint for SEO slug resolution
2. Send a GET request WITHOUT the explain parameter: `/api/seo/slugs/resolve/electronics-laptop`
3. Alternatively, explicitly set explain mode to false: `/api/seo/slugs/resolve/electronics-laptop?explain=false`
4. Review the response body structure
5. Compare response size and fields with Explain mode enabled response

**Expected Results**:
- API returns HTTP 200 status code
- Response includes only the resolved entity data (product/category information)
- Response does NOT contain explanation or debug sections
- Response is more compact compared to Explain mode enabled
- Standard SEO information is returned (slug, entity ID, entity type)

**Test Data**: 
- Valid SEO slug: "electronics-laptop"
- Explain parameter: false or not provided

**Priority**: High

---

### Test Case 3: Explain Mode with Invalid/Non-existent SEO Slug
**Objective**: Verify that Explain mode provides detailed information when attempting to resolve a non-existent or invalid SEO slug.

**Preconditions**:
- Virto Commerce platform is installed and running
- SEO module is installed and configured (https://docs.virtocommerce.org/modules/seo/)
- Administrator has access to platform API

**Test Steps**:
1. Enable Explain mode by adding `?explain=true` to the API request
2. Send a GET request with a non-existent SEO slug: `/api/seo/slugs/resolve/nonexistent-slug-12345?explain=true`
3. Review the response status code
4. Examine the response body for explanation details
5. Verify that the explanation describes why the slug could not be resolved

**Expected Results**:
- API returns HTTP 404 status code or appropriate error response
- Response includes explanation section detailing:
  - Search attempts made
  - Database queries executed
  - Reason for failure (slug not found in database)
  - Potential suggestions or related slugs (if available)
- Error message is clear and actionable for administrators

**Test Data**: 
- Invalid SEO slug: "nonexistent-slug-12345"
- Explain parameter: true

**Priority**: Medium

---

### Test Case 4: Explain Mode with Multiple Conflicting SEO Slugs
**Objective**: Verify that Explain mode provides resolution details when multiple entities might match the same slug pattern or when slug conflicts exist.

**Preconditions**:
- Virto Commerce platform is installed and running
- SEO module is installed and configured (https://docs.virtocommerce.org/modules/seo/)
- Multiple entities (e.g., products from different stores/languages) with similar or duplicate SEO slugs exist in the system
- Administrator has access to platform API

**Test Steps**:
1. Create or identify multiple entities with duplicate/similar SEO slugs in different contexts (e.g., different stores or languages)
2. Enable Explain mode: `?explain=true`
3. Send a GET request with the conflicting slug: `/api/seo/slugs/resolve/summer-sale?explain=true`
4. Include additional context parameters like store ID or language code if available
5. Review the explanation section for conflict resolution logic

**Expected Results**:
- API returns HTTP 200 status code with the resolved entity
- Explanation section includes:
  - List of all potential matching entities found
  - Prioritization logic applied (store preference, language preference, active status)
  - Reason why the specific entity was selected
  - Details about other candidates that were considered but not selected
- Clear indication of conflict resolution strategy used

**Test Data**: 
- Conflicting SEO slug: "summer-sale"
- Multiple stores/languages: Store A, Store B
- Explain parameter: true

**Priority**: Medium

---

### Test Case 5: Explain Mode Performance and Security Validation
**Objective**: Verify that Explain mode is appropriately secured for administrator use only and does not significantly impact performance.

**Preconditions**:
- Virto Commerce platform is installed and running
- SEO module is installed and configured (https://docs.virtocommerce.org/modules/seo/)
- Multiple user roles configured: Administrator, Customer, Anonymous
- Performance monitoring tools available

**Test Steps**:
1. **Security Testing:**
   - Attempt to access Explain mode endpoint as an anonymous user
   - Attempt to access Explain mode endpoint as a regular customer user
   - Access Explain mode endpoint as an administrator
   - Review access control configurations in platform settings (https://docs.virtocommerce.org/platform/admin-guide/security/)
2. **Performance Testing:**
   - Measure response time for standard request without Explain mode
   - Measure response time for request with Explain mode enabled
   - Compare response times across 10-20 requests
   - Monitor server resource utilization during Explain mode requests

**Expected Results**:
- **Security:**
  - Anonymous users receive HTTP 401 Unauthorized or similar appropriate response
  - Customer users without admin privileges receive HTTP 403 Forbidden
  - Only administrators can successfully use Explain mode
  - Security configuration prevents information disclosure to non-privileged users
- **Performance:**
  - Response time with Explain mode is within acceptable limits (e.g., < 2x standard response time)
  - No memory leaks or excessive resource consumption
  - Server remains stable under Explain mode usage
  - Explanation data generation does not block other requests

**Test Data**: 
- User roles: Anonymous, Customer, Administrator
- Performance baseline: Standard slug resolution time
- Sample slug: "electronics-laptop"

**Priority**: High

---

## Edge Cases and Negative Tests

All edge cases and negative scenarios have been incorporated into Test Cases 3, 4, and 5 above, specifically covering:
- Non-existent SEO slugs (Test Case 3)
- Conflicting SEO slug resolution (Test Case 4)
- Security and unauthorized access (Test Case 5)

---

## Notes
- **Documentation Reference**: SEO Module documentation available at https://docs.virtocommerce.org/modules/seo/
- **API Documentation**: Verify API endpoint specifications in the platform's Swagger/OpenAPI documentation
- **Dependencies**: This feature depends on the core SEO module functionality being operational
- **Logging**: Verify that Explain mode activity is appropriately logged for audit purposes
- **Configuration**: Check if Explain mode can be globally enabled/disabled via platform settings or configuration files
- **Backward Compatibility**: Ensure that enabling/disabling Explain mode does not break existing API integrations
- **Response Format**: Confirm whether explanation data follows a consistent schema across different entity types (products, categories, etc.)