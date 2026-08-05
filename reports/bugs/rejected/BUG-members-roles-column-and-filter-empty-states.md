# BUG — Two empty-state defects on /company/members: blank Roles cell, and search copy used for a filter · Low

**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257 · ProfileExperienceApi 3.1015.0-pr-141-d7d8 · Theme 2.55.0-pr-2399-845a
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 008 (B2C-MBR-032, B2C-MBR-025) · triaged `REAL_BUG`
**BL:** BL-B2B-005 · ECL-2.3
**Status**: Rejected

Two independent Low-severity presentation defects on the same page. Filed together because both are one-line
copy/marker fixes in the same component; split if they are routed separately.

---

## 1. Roles cell renders completely blank for a zero-roles member (B2C-MBR-032)

**Steps**

1. Pick an org whose org-level roles array is empty — verified `GET {BACK_URL}/api/organizations/{buildRightId}` → `roles: []`.
2. Create a contact + account in it with an **empty** membership roles array and **no** global account role.
   Verified all three tiers `[]`: membership `roles=[]`, account `roles=[]`, org-level `[]`.
3. Sign in as a member of that org, open `/company/members`, find the row.

**Expected:** a deliberate empty-state marker — an em-dash or `No roles`.
**Actual:** the Roles cell is completely blank — zero characters, no marker — while every other row shows role text.
Confirmed in the accessibility tree (cell node has no text child) **and** visually.

![Blank Roles cell for a zero-roles member](../../regression/REG-2026-07-30-1040/screenshots/B2C-MBR-032-zero-roles-row.png)

Mitigating: it does **not** render literal `undefined`/`null`, the row renders otherwise correctly, and there is no
console error — so the degradation is graceful, only the marker is missing.

---

## 2. Zero-match Role filter shows the generic empty-SEARCH state (B2C-MBR-025)

**Steps**

1. Open `/company/members` and leave the search box **empty**.
2. FILTERS → tick a Role no member holds (e.g. `Store administrator`) → Apply.

**Expected:** copy reflecting a zero-match role **filter**, with a filter-oriented CTA.
**Actual:** the generic empty-**search** state: heading "There are no results found" with a primary CTA labelled
**"RESET SEARCH"**, despite no search term being entered.

![Zero-match role filter shows empty-search copy](../../regression/REG-2026-07-30-1040/screenshots/B2C-MBR-025-role-facet-zero-match-empty-state.png)

Mitigating: the CTA **works** — clicking it clears the role filter chip and restores all 12 rows. So this is a
copy/labelling defect, not a dead end.

---

## Impact

Cosmetic in both cases. A blank cell is ambiguous to an operator (loading? no roles? render bug?), and the
"RESET SEARCH" wording misattributes an empty result to a search the user never performed.

## Not a duplicate

Neither appears in `reports/bugs/` nor in the 13-item `bugs_pending_confirmation` list in
`reports/tickets/Sprint26-15/VCST-5281/summary.json`. (That list's a11y item — *"status conveyed by icon/colour
only"* — concerns the Active column, not the Roles column.)

## Fix Routing

- **Layer:** L1 storefront (Vue) · **Repo:** `vc-frontend` (`members.vue` + the members empty-state component)
- **Suggested fix:** (1) render an em-dash / `No roles` when the merged role set is empty; (2) branch the
  empty-state copy + CTA on whether `roleIds`/`statuses` filters are active vs a `searchPhrase`.
- Do NOT auto-merge — human review required.
