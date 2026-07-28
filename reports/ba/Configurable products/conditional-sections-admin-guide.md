# Conditional Sections in Product Configurations

Conditional sections let you show or hide a configuration section based on whether the customer has selected a value in another section. Use this feature when a product add-on, service, or accessory only makes sense after the customer commits to a particular primary choice.

**Example:** A ski product has a "Ski Bindings" section and an "Installation Services" section. Installation only applies once the customer picks a binding, so you set "Installation Services" to depend on "Ski Bindings". Customers see only "Ski Bindings" when they first open the product page. After they choose a binding, "Installation Services" appears automatically.

## When to use conditional sections

- An accessory only fits certain configurations — for example, a carrying case that applies only after a specific model is selected.
- A warranty or protection plan should appear only after the customer picks the main item it covers.
- An upgrade option (such as premium installation) is irrelevant unless a base component is first chosen.
- A text customization field (engraving, monogram) should appear only after the customer selects the item to be engraved.

## Set up a conditional section

Before you begin, make sure the product already has a configuration with at least two sections. You need an existing section to serve as the parent.

1. In the Admin Panel, open **Catalog** and navigate to the product.
2. Click the **Configuration** widget in the right panel to open the configuration blade.
3. In the sections list, click the section you want to make conditional — this is the section that should appear only after the customer picks a value in another section.
4. The section editor blade opens. Locate the **Active when section has value** field.
5. Click the field to open the dropdown. The list shows all other sections in the same configuration. Select the section that must have a value before this section becomes visible.

   To remove an existing dependency, click the **X** button next to the current value. The field reverts to **Always active**, meaning the section is always visible.

6. Click **Save** on the section editor blade, then click **Save** on the product configuration blade to commit the change to the database.

   > **Note:** The section editor Save updates the in-memory state. The dependency is only persisted when you also save the parent configuration blade. Always save both.

7. Open the storefront product page and verify that the dependent section is hidden on first load and appears after you select a value in the parent section. The admin panel does not provide a preview — storefront verification is the only way to confirm the behaviour.

### Multiple sections depending on the same parent

You can set more than one section to depend on the same parent. For example, both "Frame Color" and "Wheel Set" can depend on "Frame Type". Each dependent section appears independently once "Frame Type" has a value. Configure each section separately by repeating steps 3–6 for each.

### Dependency chains

Dependencies can be chained. If "Tire Type" depends on "Wheel Set", and "Wheel Set" depends on "Frame Type", then "Tire Type" is hidden until both "Frame Type" and "Wheel Set" have selected values. There is no limit to the chain length. Each section in the chain points only to its direct parent — you do not need to configure transitive links manually.

## How it looks to customers

On the storefront, customers see only the sections that are currently active based on their selections.

- When the product page first loads, only sections with no dependency (or whose dependency is already met) are shown.
- When the customer makes a selection in a parent section, any sections that depend on it appear immediately below, without a page reload.
- If the customer clears their choice in a parent section — by selecting "None" or removing the value — the dependent section disappears and any value they had entered in it is cleared. The product price adjusts at the same time.
- If a section depends on a parent whose own parent has been cleared, both the intermediate section and its child section disappear together (transitive cascade).
- A hidden section marked as required does not block the customer from adding the product to the cart. Validation only applies to sections that are currently visible.
- Only the values from visible sections are included in the cart. Options from hidden sections do not appear in the cart line item and do not affect the price.

## Tips and gotchas

**Each section can depend on at most one other section.** If you need more complex logic — for example, a section that should appear only when two specific choices are both made — that is not currently supported. Structure your configuration so that one parent section is the gating condition.

**Dependencies must stay within the same product configuration.** You cannot set a section to depend on a section from a different product or a different product's configuration.

**Deleting a parent section clears its dependants automatically.** If you delete a section that other sections depend on, the system removes their dependency reference and those sections become "Always active". They will be visible to customers from that point forward. Verify the storefront after any section deletion.

**Avoid circular dependencies.** The admin panel does not prevent you from creating a circular dependency (for example, Section A depends on Section B, and Section B depends on Section A). If a circular dependency is created, all sections in the cycle become hidden on the storefront and customers cannot interact with them. If you notice that sections are unexpectedly invisible, check the "Active when section has value" settings for circular references and clear them.

**No admin preview.** After saving a conditional dependency, always open the storefront product page to confirm the behaviour. Test the full show-and-hide cycle: verify the dependent section is hidden on load, appears after a parent selection, and disappears again when the parent is cleared.

**Section display order is independent of dependency direction.** A dependent section can appear above its parent in the sections list if the display order is configured that way. For clarity, arrange sections so that parent sections appear before the sections that depend on them.

## Related

- [Manage Product Configurations](https://github.com/virtocommerce/vc-docs/blob/main/platform/user-guide/docs/catalog/managing-product-configurations.md) — add sections, add options, and configure section types (Product, Variation, Text, File).
