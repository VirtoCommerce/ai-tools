# VCST-3865: Pickup Filters Test Cases



**Section:** Cart > Pickup Location

---

## Test Case 1: Pickup Point Modal Opens

**Title:** Verify Pickup Point Modal Opens

**Description:** User selects "Pickup" in Shipping Details; modal for pickup location selection should appear.

**Preconditions:** Cart page loaded.

**Steps:**
1. Navigate to cart page.
2. Select "Pickup" under Shipping Details.

**Expected Result:**
Pickup point modal overlays the page and is visible.

---

## Test Case 2: Country Filter Functionality

**Title:** Verify Country Filter

**Description:** Filter pickup points by country selection.

**Preconditions:** Pickup point modal open.

**Steps:**
1. Click on Country dropdown.
2. Select a country (e.g., United States of America).

**Expected Result:**
List updates to show only pickup points from the selected country.

---

## Test Case 3: State/Province Filter Functionality

**Title:** Verify State/Province Filter

**Description:** Filter pickup points by state/province.

**Preconditions:** Filters reset. Search bar cleared.

**Steps:**
1. Click State/Province dropdown.
2. Select a State/Province.

**Expected Result:**
List updates to show only pickup points from selected state/province.

---

## Test Case 4: City Filter Functionality

**Title:** Verify City Filter

**Description:** Filter pickup points by city.

**Preconditions:** Filters reset. Search bar cleared.

**Steps:**
1. Click City dropdown.
2. Select a city.

**Expected Result:**
List updates to show only pickup points from selected city.

---

Test Case 5: Search Filter Functionality

***Title:** Search Filter Functionality

**Preconditions:** Pickup point modal open.

**Steps:**

Click on Search field
Enter search terms one at a time, after each search term clear the filed by clicking the cross and click on magnify button:

| Search Input         | Expected Match(s)              |
| -------------------- | ------------------------------ |
| MoMA                 | MoMA PS1-Main_2; Transfer_2    |
| Little Island        | Little Island - Transfer_2 FFC |
| Pier 55              | Little Island - Transfer_2 FFC |
| pickup90@example.com | Little Island - Transfer_2 FFC |
| pickup79@example.com | MoMA PS1-Main_2; Transfer_2    |
| 10090                | Little Island - Transfer_2 FFC |
| 10079                | MoMA PS1-Main_2; Transfer_2    |
| FFC                  | Little Island - Transfer_2 FFC |
| PS3                  | None                           |
| Tesco                | None                           |

**Expected Result:**

Inputs like MoMA, pickup79@example.com, 10079 return only “MoMA PS1-Main_2; Transfer_2”.

Inputs like Little Island, Pier 55, pickup90@example.com, 10090, FFC return only “Little Island - Transfer_2 FFC”.

Negative tests (PS3, Central Park) return no results.



---

## Test Case 6: Select Pickup Point

**Title:** Select and Set Pickup Point

**Description:** Ensure a pickup point can be selected.

**Preconditions:** Pickup points displayed.

**Steps:**
1. Click on a pickup point.

**Expected Result:**
Pickup location is highlighted and set in cart details.

---

## Test Case 7: Handle Map/API Errors

**Title:** Map/API Error Notification

**Description:** Proper error message shown when Google Maps API fails.

**Preconditions:** Pickup point modal open.

**Steps:**
1. Induce map error or observe default failure.

**Expected Result:**
Error dialog displays; user can dismiss and continue.

---

## Test Case 8: Clear All Filters

**Title:** Clear All Filters

**Description:** Test clearing filters returns to default pickup point list.

**Preconditions:** Filters applied.

**Steps:**
1. Clear Country, State/Province, City, and Search filters.

**Expected Result:**
Full pickup point list is restored.


