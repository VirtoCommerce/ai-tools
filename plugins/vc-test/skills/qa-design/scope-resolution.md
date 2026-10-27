# /qa-design — Resolving the audit scope off the matrix, and the Storybook story

A supporting file of [`SKILL.md`](SKILL.md): its Step 2 Cases B–D and its Step 2.5, moved here verbatim. Read it when the target is off the matrix, a flow, or a component with a Storybook phase; Case A and every other step stay in `SKILL.md`.

## Step 2 — Cases B–D

**Case B — Target is OFF-matrix (component):**

Produce a real audit, not a generic "audit all six" fallback.

1. **Resolve selector + render-location:**
   - Check [storefront-selectors.md](../../knowledge/storefront-selectors.md) for the component name. Many vc-frontend components are documented there even if not in the critical matrix.
   - If not found → use GitHub MCP `search_code` against `VirtoCommerce/vc-frontend` for the component file (e.g., `VcDatePicker.vue`, `VcAlert.vue`). Extract `data-test-id` / root class from the template. Then `search_code` for usages of `<VcDatePicker` to find which pages render it.
   - If still ambiguous → ask: "I couldn't find a confirmed render location for `{Component}`. Provide a page URL where it's visible, or say `discover` and I'll have ui-ux-expert explore the storefront to find it."
   - On `discover` → dispatch `vc-test:ui-ux-expert` with a discovery charter (visit `/sign-up`, `/cart`, `/checkout`, account pages); capture the first page that renders the component plus the verified selector.

2. **Resolve applicable invariants heuristically** — derived from component characteristics:

 | Invariant | Applicability rule |
 |---|---|
 | BL-UI-001 CLS | Skipped — page-level metric, not a single-component concern. |
 | BL-UI-002 spacing-grid | ON by default (almost every component has padding/margin/gap). |
 | BL-UI-003 state-shift | ON if component has `:hover`, `v-if`, `transition`, or open/active/expanded state in its source. |
 | BL-UI-004 overflow | ON if component renders variable-length content (slots, string props, lists, images). |
 | BL-UI-005 alignment | ON if ≥ 2 horizontally-arranged children with similar role (button row, label/input pair). |
 | BL-UI-006 touch targets | ON if any interactive element (`button`, `input`, `<a>`, `@click`, `role="button"`). Mandatory if present. |

   Uncertain cases → run the union of definitely-applicable invariants and report which were skipped + why. User can re-run with `--all` for full coverage.

3. **Warn + offer to promote** — print: "`{Component}` is off-matrix. Audited with heuristic invariant scope: [list]." After audit, if findings exist or the component appears in audit history ≥ 3 times, suggest: "Consider adding to [critical-ui-scope.md](../../knowledge/critical-ui-scope.md) so it's regression-protected." Never auto-edit the matrix.

**Case C — Off-matrix page:** Apply default page-level invariants (BL-UI-001 CLS + 002 spacing-anchor + 004 overflow + 006 touch). Print "off-matrix page" warning + promote-suggestion.

**Case D — Flow target:** Union of all pages in the flow (each resolved via Case A or C).

---

### Step 2.5 — Resolve Storybook story (component targets only)

Skip this step if:
- Target is a page or flow (Storybook hosts components, not pages).
- User passed `--storefront-only`.

Otherwise, discover the Storybook URL using **convention first, GitHub fallback**:

1. **Convention** — try `{STORYBOOK_URL}/?path=/story/{atomic-level}-{component-kebab}--default`. Atomic Design levels in vc-frontend Storybook: `atoms`, `molecules`, `organisms`, `templates`. Component name is kebab-cased (`VcTable` → `vc-table`). Example: `https://storybook.example.com/?path=/story/organisms-vc-table--default`. Send a HEAD request — if the iframe loads, use it.

2. **GitHub fallback** — if convention 404s, use GitHub MCP `search_code` against `VirtoCommerce/vc-frontend` for `{Component}.stories.ts` (e.g., `VcDatePicker.stories.ts`). Read the file to extract:
   - The `title` field (e.g., `'Atoms/VcDatePicker'`) → maps to `?path=/story/atoms-vc-date-picker--{first-story-name}`.
   - The first exported story name (defaults to `Default` or `Primary`).
   - Construct the URL accordingly.

3. **Skip Storybook phase** — if neither convention nor GitHub finds a story:
   - Print: "No Storybook story found for `{Component}`. Running storefront-only."
   - Suggest at audit end: "Consider adding a Storybook story for `{Component}` so it can be audited in isolation."

`STORYBOOK_URL` comes from env (`config.js` / `.env`); never hardcode.
