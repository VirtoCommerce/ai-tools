# Bug Report: City Filter Not Filtering Pickup Locations

**Date:** January 12, 2026  
**Reporter:** QA Agent  
**Environment:** QA  
**URL:** https://vcst-qa-storefront.govirto.com  
**Browser:** Chrome with DevTools  
**Theme Version:** 2.39.0-pr-2135-0b1f-0b1f1d9e  

---

## Bug Summary

The City filter in the Pick Points modal does not properly filter the pickup locations. When a city is selected, all locations from all cities remain visible instead of showing only locations in the selected city.

---

## Severity

**High** - This is a functional bug that prevents users from effectively using the city filter to find pickup locations in their desired city.

---

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Log in as a registered user
3. Add a product to the cart
4. Go to Cart page
5. Select "Pickup" as the delivery option
6. Click on the pickup address to open the "Pick Points" modal
7. Click on the "CITY" filter dropdown
8. Select "Toronto" (or any other city with 1 pickup point)
9. Observe the pickup locations list

---

## Expected Behavior

- Only pickup locations in the selected city should be displayed
- For "Toronto" filter: Only "Toronto Investment and Trade Centre" should appear (1 result)

---

## Actual Behavior

- The filter chip shows the selected city ("Toronto")
- The CITY button shows badge "1" indicating filter is applied
- **BUG:** ALL pickup locations from ALL cities are still displayed:
  - New York, USA (multiple locations)
  - Ontario, Canada
  - Sidney, Australia
  - San Felipe, Mexico
  - Bristol, UK
  - Kuantan, Malaysia
  - Chicago, USA
  - Shanghai, China
  - Billund, Denmark
  - And many more...

---

## Screenshot Evidence

See: `Reports/City_Filter_Bug_Screenshot.png`

---

## Additional Notes

- The Country filter appears to work correctly (filters results by country)
- The State/Province filter also appears to work correctly
- The City filter is the only filter with this bug
- Reset filters button works and clears the filter chips
- The search functionality works correctly when a pickup point is selected

---

## Suggested Fix

The City filter's onChange handler or the API call needs to be reviewed to ensure it properly filters the pickup locations based on the selected city value.

---

## Related Test Case

- Test ID: Pickup Locations Filters TC3 (City Filter)
- Status: **FAILED**

