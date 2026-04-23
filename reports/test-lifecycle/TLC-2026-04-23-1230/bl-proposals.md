# Business Logic Proposals — TLC-2026-04-23-1230

> **These are drafts. They are NOT applied to `.claude/agents/knowledge/business-logic.md`.**
> Review, edit as needed, assign final `BL-*` IDs, and commit manually.

---

## New Invariants Proposed

### PROPOSED-BL-CHK-014: Facet labels must be human-readable `[P1-data]`

- **Rule:** In any address/location selection popup with faceted filtering, facet option labels MUST display human-readable values (e.g., city name `"New York"`, country name `"United States"`, region name `"California"`). They MUST NOT display raw code fields (postal codes, region IDs, ISO country codes) as the visible label. The underlying `term` value in the GraphQL `term_facets.terms[].term` response MAY be a code, but the `label` field served to the UI MUST be the human-readable form.
- **Verify:**
  - [UI] Open facet dropdown → each option label is a word (not purely numeric, not a 2-letter uppercase code).
  - [API] `term_facets.terms[].label` value for the City facet maps to the `city` field of the address record, NOT to `postalCode`.
  - [API] GraphQL schema confirms `term_facets` returns `{ name, terms: [{ term, label, count }] }` and the backend resolver populates `label` from the correct display field.
- **Violation signal:** City facet options show "10001", "90210" (5-digit numbers) instead of "New York", "Beverly Hills". Country facet shows "US", "CA" instead of "United States", "Canada".
- **Agents:** qa-frontend-expert (UI), qa-backend-expert (GraphQL + resolver)
- **Source:** VCST-4710 Defect #2 — live build `2.48.0-pr-2219-d5f9-d5f99481` shows City facet options as `"10001 (1)"` instead of `"New York (1)"`. BA report `ba-report-VCST-4710-2026-04-23.md` §2.
- **Triggered by case(s):** `VCST-4710-SF-006` (storefront, Critical)

---

### PROPOSED-BL-CHK-015: Declared ARIA-sort implies sort must be wired `[P0-revenue]`

- **Rule:** When a column-header element declares `aria-sort` (any value: `"none"`, `"ascending"`, `"descending"`), the element MUST be interactive: `role="button"` or `<button>` nesting, `cursor: pointer` on hover, a click handler that toggles the sort, and `aria-sort` state that transitions in response to user input. Declaring `aria-sort="none"` on a non-interactive header misleads assistive technology (screen readers announce the column as sortable but the user cannot actuate it) and fails WCAG 4.1.2 (Name, Role, Value).
- **Verify:**
  - [UI] Hover the column header → `cursor: pointer` (not `auto`).
  - [UI] Click the header → list re-sorts AND `aria-sort` transitions `none → ascending → descending → ascending`.
  - [A11y] Screen reader announces the column as "sortable, not sorted" initially and "sorted ascending/descending" after interaction.
  - [DOM] Either `role="button"` is on the `<th>` or a `<button>` element wraps the header content; `tabindex` is `0` or native-focusable; an event listener is attached.
- **Violation signal:** `<th>` has `aria-sort="none"`, `cursor: auto`, `role: null`, `tabindex: null`, no click handler. Clicking does nothing. Screen reader announces "column sortable" but sort never activates.
- **Agents:** qa-frontend-expert, ui-ux-expert (a11y)
- **Source:** VCST-4710 Defect #1 — Phase 5 environment verification on `2.48.0-pr-2219-d5f9-d5f99481` confirmed all 4 `<th>` in the shipping address popup have `aria-sort="none"` but no interactivity. BA report `ba-report-VCST-4710-2026-04-23.md` §2.
- **Triggered by case(s):** `VCST-4710-SF-008` (storefront, Critical)

---

## Stale BL-* Flagged

None — no existing BL-* rules contradicted by the VCST-4710 change inventory. Address-related invariants in `business-logic.md` (if any) focus on address validation/storage, not popup UX.

---

## Application Notes

If approving these proposals:
1. Assign final IDs by reading `business-logic.md` for the next available `BL-CHK-NNN` sequence.
2. Replace `PROPOSED-` prefix with final ID in the new entries.
3. Update the `Triggered by case(s)` entries with real test-case IDs once the VCST-4710 CSVs are promoted into regression suites (currently under `tests/Sprint-current/VCST-4710/test-cases/`).
4. Re-run `/qa-review-tests suite 011 --verify` after applying so cases SF-006 and SF-008 gain their `Business_Rule` mapping and G6 gate flips from WARN to PASS.
