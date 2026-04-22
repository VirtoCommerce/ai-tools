# Conditional Sections — Storefront Behavior Reference

This document describes what customers see and experience when a configurable product uses conditional sections. It is intended for support agents, merchandisers, and QA reviewers who need to understand the storefront rules without reading code or admin configuration screens.

A conditional section is a configuration section that is tied to another section. It stays hidden until the customer makes a selection in the parent section. When the parent selection is removed, the conditional section disappears again and any values it held are cleared.

## Customer-visible behaviors

1. **Initial page load — dependent sections are hidden.**
   The product page shows only sections that have no dependency or whose dependency is already satisfied. A section that depends on an unfilled parent is not present in the page at all — it is not hidden by CSS, it is fully absent from the rendered output. This means keyboard navigation and screen readers are not affected by invisible conditional sections.

2. **Selecting a value in a parent section — dependent section appears.**
   As soon as the customer picks any value (other than "None") in the parent section, the dependent section renders directly on the page. No page reload occurs. The section appears in the position defined by the product's configuration display order.

3. **Deselecting or clearing a parent value — dependent section disappears.**
   If the customer changes their choice in the parent section to "None", or clears a text entry that served as the parent value, the dependent section is removed from the page immediately. Any value the customer had already entered in the dependent section is cleared automatically. The price total updates at the same moment to exclude any option price that was associated with the now-hidden section.

4. **Transitive chains — cascading hide and show.**
   Dependencies can chain: Section A is the parent of Section B, and Section B is the parent of Section C. If the customer clears their selection in Section A, both Section B and Section C disappear together. If the customer then selects a value in Section A, Section B reappears, but Section C remains hidden until the customer also makes a selection in Section B.

5. **Required but currently hidden sections — they do not block Add to Cart.**
   A section that is marked as required in the product configuration does not enforce that requirement while it is hidden. The customer can add the product to the cart even if a required dependent section has never been shown. Validation only applies to sections that are currently visible on the page.

6. **Adding to cart — hidden sections are excluded from the cart item.**
   When the customer clicks "Add to Cart" or "Update cart", only the values from sections that are currently visible are included in the cart line item. Options from hidden sections do not appear in the cart components list and do not contribute to the line item price. This applies whether the customer is adding for the first time or reconfiguring an existing cart item.

## Pricing and validation rules

- The displayed product price at all times reflects only the options from currently visible sections. Option prices from hidden sections are not counted.
- When a dependent section is hidden after the customer had selected a priced option in it, the price drops immediately to exclude that option.
- When the customer re-selects the parent value and the dependent section reappears, the section defaults to its unselected state ("None" or empty). The previously selected value is not restored. The customer must choose again.
- Validation errors (such as "This section is required") are cleared when a section becomes hidden. If the section reappears, validation starts fresh from the unselected state.

## Known limitations

**Page refresh resets configuration to defaults.** If a customer refreshes the product page mid-configuration, the page reloads with the default preselections (typically "None" for optional sections, or the first available option for required sections). Any in-progress selections are not preserved. This is the same behavior as standard configurable products without conditional sections.

**Circular dependencies make all affected sections invisible.** If the product configuration contains a circular dependency between sections (for example, Section A depends on Section B, and Section B depends on Section A), all sections involved in the cycle become hidden and customers cannot interact with them or add the product to the cart. This is a configuration error that must be corrected in the admin panel. If customers report that a configurable product is showing no sections or very few sections unexpectedly, ask the category manager to review the "Active when section has value" settings for circular references.
