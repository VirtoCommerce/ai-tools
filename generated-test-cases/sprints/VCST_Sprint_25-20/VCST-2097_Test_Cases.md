# Test Cases for VCST-2097: [Configurable products] I want to add my configuration to the shopping list

## User Story Details
- **Jira Key**: VCST-2097
- **Summary**: [Configurable products] I want to add my configuration to the shopping list
- **Priority**: High
- **Status**: To do
- **Created**: 10/22/2024

## Description
As a user I want to add my own configuration to the shopping list so I'm able to save and view it later or share with anyone.
In case no option is selected → the shopping list needs to store with "None"

Currently we can add a configurable product to the wish list without selecting the options in required sections. Then when adding this product from the wish list to the cart, it is added without the necessary configurations, and it leads to incorrect behavior in the cart: 
If the cart already contains this product with any configuration, adding it from the wish list will be merged with the existing product in the cart. 
If the cart does not yet contain this product, adding it from the wish list will create a new product item without options.
It might make sense to prevent adding a product to the cart if the required options in the mandatory section are not selected. Instead, a validation message could be displayed in the "Adding products to cart result" popup.

---

## Test Cases

### Test Case 1: Add Configurable Product with Full Configuration to Shopping List
**Objective**: Verify that a configurable product with all required and optional configurations selected can be successfully added to the shopping list and the configuration is preserved.

**Preconditions**:
- User is logged into the storefront
- A configurable product exists with multiple configuration options (both required and optional sections)
- User has access to shopping list functionality
- Shopping list is empty or exists for the user

**Test Steps**:
1. Navigate to a configurable product detail page (PDP)
2. Select options from all required configuration sections (e.g., Size: Large, Color: Red)
3. Select options from optional configuration sections if available (e.g., Material: Cotton)
4. Click "Add to Shopping List" button
5. Navigate to the Shopping List page
6. Locate the added product in the shopping list
7. Verify the configuration details displayed for the product

**Expected Results**:
- Product is successfully added to the shopping list with a success notification
- Shopping list displays the product with all selected configuration options visible (Size: Large, Color: Red, Material: Cotton)
- Configuration details match exactly what was selected on the PDP
- Product shows as a distinct line item with its specific configuration
- User can view the complete configuration details in the shopping list

**Test Data**: 
- Product: Configurable T-Shirt
- Required options: Size (Small/Medium/Large), Color (Red/Blue/Green)
- Optional options: Material (Cotton/Polyester)

**Priority**: High

---

### Test Case 2: Add Configurable Product to Shopping List Without Selecting Required Options
**Objective**: Verify that when a configurable product is added to shopping list without selecting required options, it is stored with "None" or empty values for unselected options.

**Preconditions**:
- User is logged into the storefront
- A configurable product exists with at least one required configuration section
- User has access to shopping list functionality

**Test Steps**:
1. Navigate to a configurable product detail page (PDP)
2. Do NOT select any options from the required configuration sections
3. Click "Add to Shopping List" button without making any selections
4. Observe if the product is added or if validation occurs
5. Navigate to the Shopping List page
6. Locate the added product and verify configuration display
7. Check if options show as "None" or empty values

**Expected Results**:
- Product is added to shopping list even without required option selection
- Shopping list displays the product with "None" or empty values for unselected options
- Product configuration clearly indicates that no options were selected
- No error message is displayed during addition to shopping list
- The line item is created with incomplete configuration state

**Test Data**: 
- Product: Configurable Laptop
- Required options: RAM (8GB/16GB/32GB), Storage (256GB/512GB/1TB)

**Priority**: High

---

### Test Case 3: Add Product from Shopping List to Cart - Validation for Required Options
**Objective**: Verify that when attempting to add a configurable product from shopping list to cart with missing required options, appropriate validation message is displayed and product is not added to cart.

**Preconditions**:
- User is logged into the storefront
- Shopping list contains a configurable product with "None" or empty values for required options
- Shopping cart is accessible

**Test Steps**:
1. Navigate to Shopping List page
2. Locate the configurable product that has "None" values for required configuration options
3. Click "Add to Cart" button for this product
4. Observe the behavior and any validation messages displayed
5. Check the "Adding products to cart result" popup for error/validation message
6. Navigate to the shopping cart page
7. Verify if the product was added to the cart or not

**Expected Results**:
- System prevents adding the product to cart due to missing required options
- A clear validation message is displayed in the "Adding products to cart result" popup
- Validation message indicates that required configuration options must be selected before adding to cart
- Product is NOT added to the shopping cart
- User is prompted or redirected to configure the product before adding to cart
- Cart remains unchanged without the improperly configured product

**Test Data**: 
- Product in shopping list: Configurable Phone with no configuration selected
- Required options: Storage capacity, Color

**Priority**: High

---

### Test Case 4: Add Configured Product from Shopping List to Cart - Merge Behavior with Existing Cart Item
**Objective**: Verify that when adding a configured product from shopping list to cart, and the cart already contains the same product with identical configuration, the quantity is properly merged.

**Preconditions**:
- User is logged into the storefront
- Shopping list contains a configurable product with complete configuration (e.g., T-Shirt: Size-Large, Color-Blue)
- Shopping cart already contains the same product with identical configuration (Quantity: 1)

**Test Steps**:
1. Navigate to Shopping Cart and verify existing product with configuration (T-Shirt: Size-Large, Color-Blue, Qty: 1)
2. Navigate to Shopping List page
3. Locate the same configurable product with identical configuration (T-Shirt: Size-Large, Color-Blue)
4. Click "Add to Cart" button for this product from shopping list
5. Observe the success message or confirmation
6. Navigate to Shopping Cart page
7. Verify the product quantity and configuration

**Expected Results**:
- Product is successfully added to cart from shopping list
- Success message is displayed in the "Adding products to cart result" popup
- Cart contains only ONE line item for this product with the specific configuration
- Quantity is increased to 2 (merged from existing 1 + new 1)
- Configuration remains unchanged (Size-Large, Color-Blue)
- No duplicate line items are created for the same configuration

**Test Data**: 
- Product: Configurable T-Shirt
- Configuration: Size-Large, Color-Blue
- Initial cart quantity: 1
- Expected final quantity: 2

**Priority**: High

---

### Test Case 5: Add Differently Configured Products from Shopping List to Cart - Separate Line Items
**Objective**: Verify that when adding a configured product from shopping list to cart, and the cart already contains the same product but with different configuration, separate line items are maintained.

**Preconditions**:
- User is logged into the storefront
- Shopping list contains a configurable product with specific configuration (e.g., T-Shirt: Size-Large, Color-Blue)
- Shopping cart already contains the same product but with different configuration (T-Shirt: Size-Medium, Color-Red, Qty: 1)

**Test Steps**:
1. Navigate to Shopping Cart and verify existing product with configuration (T-Shirt: Size-Medium, Color-Red, Qty: 1)
2. Navigate to Shopping List page
3. Locate the configurable product with different configuration (T-Shirt: Size-Large, Color-Blue)
4. Click "Add to Cart" button for this product from shopping list
5. Observe the success message
6. Navigate to Shopping Cart page
7. Verify the number of line items and their configurations
8. Confirm each line item maintains its unique configuration

**Expected Results**:
- Product is successfully added to cart from shopping list
- Success message is displayed confirming addition to cart
- Cart contains TWO separate line items for the same base product
- First line item: T-Shirt, Size-Medium, Color-Red, Qty: 1
- Second line item: T-Shirt, Size-Large, Color-Blue, Qty: 1
- Each line item maintains its distinct configuration
- Configurations are NOT merged or overwritten
- Each line item can be managed (updated/removed) independently

**Test Data**: 
- Product: Configurable T-Shirt
- Cart configuration: Size-Medium, Color-Red, Qty: 1
- Shopping list configuration: Size-Large, Color-Blue
- Expected result: 2 separate line items in cart

**Priority**: High

---

## Edge Cases and Negative Tests

### Edge Case Notes:
The above test cases cover the primary edge cases including:
- Missing required configurations (Test Case 2 & 3)
- Merging behavior with identical configurations (Test Case 4)
- Separation of different configurations (Test Case 5)

### Additional Scenarios to Consider:
- **Partial Configuration**: Product with some but not all required options selected
- **Configuration Changes**: Editing configuration of a product already in shopping list
- **Multiple Shopping Lists**: Same configured product across different shopping lists
- **Guest vs. Registered Users**: Configuration persistence across user types

---

## Notes
- Validation behavior for required options when adding from shopping list to cart is a new requirement per this story
- The "None" value storage mechanism needs clear definition in implementation
- Consider UX implications: Should users be redirected to PDP to configure when adding from shopping list to cart?
- Performance testing may be needed for shopping lists with multiple configured products
- Cross-browser testing recommended for shopping list and cart interaction flows
- Mobile responsiveness should be verified for configuration display in shopping lists

**Dependencies**:
- Shopping list functionality must be enabled and working
- Configurable product types must be properly set up in the catalog
- Cart functionality must support multiple line items with different configurations

**Related Documentation**:
- VirtoCommerce documentation should be referenced for shopping list and cart implementation details as they become available