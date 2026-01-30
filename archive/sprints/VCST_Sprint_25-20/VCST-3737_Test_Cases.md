# Test Cases for VCST-3737: Simplify Developer Experience with Dynamic Properties

## User Story Details
- **Jira Key**: VCST-3737
- **Summary**: Simplify Developer Experience with Dynamic Properties
- **Priority**: Medium
- **Status**: Done
- **Created**: 8/7/2025

## Description
C# developer working with Virto Commerce entities that support dynamic properties
I want to
work with dynamic properties in a strongly-typed, developer-friendly way using IntelliSense, validations, and compile-time safety
So that
I can reduce runtime errors, simplify development, and gain better tooling support across REST, GraphQL, and UI platforms.

---

## Test Cases

### Test Case 1: Verify IntelliSense Support for Strongly-Typed Dynamic Properties in C#
**Objective**: Validate that developers can access dynamic properties through IntelliSense with proper type hints and autocomplete functionality when working with Virto Commerce entities in Visual Studio/VS Code.

**Preconditions**:
- Virto Commerce platform is installed and configured (https://docs.virtocommerce.org/platform/developer-guide/getting-started/)
- Development environment with .NET SDK is set up
- A catalog product entity with dynamic properties is created (https://docs.virtocommerce.org/products/catalog/)
- At least 3 dynamic properties of different types (string, integer, boolean) are defined for the product entity

**Test Steps**:
1. Open Visual Studio or VS Code with Virto Commerce solution
2. Create a new C# class that retrieves a product entity with dynamic properties
3. Type the product entity variable name followed by a dot (e.g., `product.`)
4. Observe the IntelliSense dropdown menu for available dynamic properties
5. Select a dynamic property from IntelliSense suggestions
6. Verify the property type is displayed correctly in IntelliSense tooltip
7. Attempt to assign a value of incorrect type to the property and observe compile-time error

**Expected Results**:
- IntelliSense displays all defined dynamic properties in the autocomplete dropdown
- Each property shows its correct data type (string, int, bool, etc.) in the tooltip
- Property names are displayed with proper naming conventions (PascalCase/camelCase)
- Compile-time error is generated when attempting to assign incorrect type
- No runtime casting or reflection code is required to access dynamic properties

**Test Data**: 
- Product ID: TEST-PROD-001
- Dynamic properties: "WarrantyPeriod" (int), "IsFragile" (bool), "Manufacturer" (string)

**Priority**: High

---

### Test Case 2: Validate Compile-Time Type Safety and Validation for Dynamic Properties
**Objective**: Ensure that strongly-typed dynamic properties enforce type safety at compile-time, preventing type mismatch errors before runtime.

**Preconditions**:
- Virto Commerce platform development environment is configured (https://docs.virtocommerce.org/platform/developer-guide/getting-started/)
- Custom module with dynamic properties is created
- Dynamic properties schema is defined with validation rules (required fields, value ranges, string length)

**Test Steps**:
1. Create a new C# class to work with an entity containing dynamic properties
2. Attempt to assign a string value to an integer-type dynamic property
3. Verify compiler generates an error before build completion
4. Attempt to assign null to a required dynamic property
5. Verify compiler/validator generates appropriate warning or error
6. Assign a valid value matching the property type and build the solution
7. Create unit tests to verify validation rules are enforced at compile-time
8. Run the unit tests and verify all pass successfully

**Expected Results**:
- Compiler error is generated when assigning incompatible types (e.g., string to int)
- Null assignment to required properties generates compile-time error or warning
- Valid assignments compile successfully without errors
- Validation attributes (Required, Range, StringLength) are enforced at compile-time
- IDE shows red squiggly underlines for type mismatches before compilation
- Unit tests confirm type safety is maintained

**Test Data**: 
- Dynamic property "Price" (decimal, required, range: 0.01-10000)
- Dynamic property "Description" (string, max length: 500)
- Invalid test values: Price = "abc", Price = null, Description = 600-character string

**Priority**: High

---

### Test Case 3: Verify Dynamic Properties Integration with REST API Endpoints
**Objective**: Validate that strongly-typed dynamic properties are correctly serialized/deserialized through REST API calls with proper type preservation.

**Preconditions**:
- Virto Commerce platform is running (https://docs.virtocommerce.org/platform/developer-guide/getting-started/)
- REST API access is configured with valid authentication tokens
- A product with dynamic properties exists in the catalog (https://docs.virtocommerce.org/products/catalog/)
- Postman or similar API testing tool is available

**Test Steps**:
1. Make a GET request to retrieve a product entity: `GET /api/catalog/products/{id}`
2. Verify the response JSON includes dynamic properties with correct types
3. Modify a dynamic property value in the response JSON maintaining correct type
4. Make a PUT request to update the product: `PUT /api/catalog/products`
5. Verify the update is successful (HTTP 200/204 response)
6. Make another GET request to retrieve the updated product
7. Verify the dynamic property value was updated correctly with type preserved
8. Attempt to send a PUT request with incorrect type for a dynamic property (e.g., string instead of integer)
9. Verify the API returns validation error (HTTP 400) with descriptive message

**Expected Results**:
- GET response includes all dynamic properties with correct JSON types (number, boolean, string)
- Dynamic properties are clearly distinguishable from standard properties in response
- PUT request with valid typed values successfully updates the entity
- PUT request with type mismatches returns HTTP 400 with validation error details
- Error message clearly indicates which property has type mismatch
- No data corruption occurs with type conversions

**Test Data**: 
```json
{
  "id": "TEST-PROD-001",
  "name": "Test Product",
  "dynamicProperties": {
    "warrantyYears": 2,
    "isEcoFriendly": true,
    "certificationNumber": "CERT-12345"
  }
}
```

**Priority**: High

---

### Test Case 4: Validate GraphQL Query Support for Strongly-Typed Dynamic Properties
**Objective**: Ensure that dynamic properties can be queried through GraphQL with proper type definitions and schema introspection support.

**Preconditions**:
- Virto Commerce platform with GraphQL support is configured
- GraphQL endpoint is accessible (typically `/graphql`)
- GraphQL Playground or GraphiQL interface is available for testing
- Product catalog with dynamic properties is set up (https://docs.virtocommerce.org/products/catalog/)

**Test Steps**:
1. Open GraphQL Playground/GraphiQL interface
2. Run schema introspection query to examine available types and fields
3. Verify dynamic properties appear in the schema with correct type definitions
4. Execute a GraphQL query to retrieve a product with specific dynamic properties:
   ```graphql
   query {
     product(id: "TEST-PROD-001") {
       id
       name
       dynamicProperties {
         warrantyYears
         isEcoFriendly
         certificationNumber
       }
     }
   }
   ```
5. Verify the response returns dynamic properties with correct types
6. Test GraphQL autocomplete by typing partial property names and observing suggestions
7. Attempt a mutation to update a dynamic property with incorrect type
8. Verify the GraphQL server returns a type validation error

**Expected Results**:
- Schema introspection shows dynamic properties with correct GraphQL types (Int, Boolean, String)
- Dynamic properties are available in GraphQL autocomplete/IntelliSense
- Query successfully retrieves dynamic property values with type preservation
- Response JSON maintains proper typing (numbers as numbers, booleans as booleans)
- Mutations with type mismatches are rejected with clear error messages
- GraphQL schema documentation includes dynamic property descriptions

**Test Data**: 
- Product ID: TEST-PROD-001
- Expected GraphQL types: warrantyYears: Int!, isEcoFriendly: Boolean, certificationNumber: String

**Priority**: Medium

---

### Test Case 5: Edge Case - Handle Dynamic Properties with Null/Empty Values and Optional Fields
**Objective**: Verify the system correctly handles edge cases including null values, empty strings, optional dynamic properties, and missing properties without causing runtime errors.

**Preconditions**:
- Virto Commerce development environment is configured (https://docs.virtocommerce.org/platform/developer-guide/getting-started/)
- Test entities with both required and optional dynamic properties exist
- Mix of properties with and without default values are defined

**Test Steps**:
1. Create an entity with optional dynamic properties and leave some unset (null)
2. Access the optional properties in C# code and verify no NullReferenceException occurs
3. Use null-conditional operators (`?.`) or null-coalescing operators (`??`) with dynamic properties
4. Save the entity through REST API without providing values for optional properties
5. Retrieve the entity and verify optional properties return appropriate default values or null
6. Attempt to set a required dynamic property to null and verify validation prevents it
7. Test with empty string values for string-type dynamic properties
8. Verify proper handling of boundary values (empty collections, zero for numeric types)
9. Query the entity via GraphQL requesting optional fields that may be null

**Expected Results**:
- Accessing null optional properties does not throw runtime exceptions
- Null-conditional and null-coalescing operators work correctly with dynamic properties
- Optional properties can be omitted from API requests without causing errors
- Required properties enforce non-null constraints with clear validation messages
- Empty strings are handled distinctly from null values
- Default values are applied appropriately when properties are not set
- GraphQL returns null for optional fields without errors
- Type safety is maintained even with null/optional scenarios

**Test Data**: 
- Entity with required property: "ProductCode" (string, required)
- Entity with optional properties: "SecondaryCategory" (string, optional), "DiscountPercentage" (decimal?, optional)
- Test scenarios: null, empty string, missing from request, default values

**Priority**: High

---

## Edge Cases and Negative Tests

### Already covered in Test Case 5 above, with additional negative scenarios:

**Additional Negative Test Scenarios**:

1. **Type Coercion Attacks**: Attempt to send malformed JSON/GraphQL with type coercion attempts (e.g., "true" as string for boolean)
   - Expected: Strict type validation rejects the request

2. **Property Name Case Sensitivity**: Test with different casing variations (camelCase, PascalCase, snake_case)
   - Expected: Consistent behavior based on platform conventions

3. **Extremely Large Values**: Test with values exceeding normal bounds (very long strings, Int64 maximum values)
   - Expected: Appropriate validation errors or successful handling within defined limits

4. **Special Characters in String Properties**: Test with Unicode, emojis, SQL injection attempts, XSS payloads
   - Expected: Proper sanitization and safe storage/retrieval

5. **Concurrent Updates**: Simulate simultaneous updates to same dynamic property from multiple sources
   - Expected: Proper concurrency handling with optimistic locking or last-write-wins

---

## Notes
- All test cases assume the developer is using the latest stable version of Virto Commerce platform
- Integration tests should be performed across different .NET versions supported by the platform
- Performance testing should be conducted separately to ensure strongly-typed dynamic properties don't introduce significant overhead
- Documentation references: https://docs.virtocommerce.org/platform/developer-guide/
- Related user stories should cover UI implementation for dynamic properties management
- Consider creating automated unit tests and integration tests for continuous validation of these scenarios
- Verify behavior consistency across different entity types (Products, Categories, Customers, Orders) that support dynamic properties