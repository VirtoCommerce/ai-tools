## Documentation — VCST-6571: Site Builder: one designer for pages, theme and templates

### What's new
Site Builder replaces the Page Builder editor with a new designer. Every entry point opens it: the
Content page list, the store's **Site Builder** widget and the Admin Shell. In one place you build pages,
edit the store's header, footer, brand and colors, and make product, category and page templates.
Template rules decide which template a product or category page uses. **Publish theme** puts the whole
theme live at once and refuses colors that fail WCAG AA contrast.
Shipped in: VirtoCommerce.SiteBuilder@3.1000.0-pr-1-644f · VirtoCommerce.XCMS@3.1011.0 ·
VirtoCommerce.Xapi@3.1033.0-pr-79-4dfa · platform@3.1099.0 · theme@2.63.0-pr-2676-f03c-f03c41eb (Site Builder flag on)

### How to set it up
- **Modules and storefront.** The stand runs the Site Builder module instead of Page Builder, and a
  storefront build with Site Builder turned on. With a storefront that lacks it, the designer says
  *This storefront does not support the new Site Builder designer.*
- **Store URL.** The designer preview loads the storefront from the store's **Store URL**, so it must be
  the storefront address (**Stores** → your store → **URLs**).
- **Permissions.** Give editors a role with the `builder:*` permissions. Without `builder:theme` the theme
  can't be saved, without `builder:templates` templates and rules can't be saved, and without
  `builder:publish` nothing can be published. Pick **Store selected scope** to limit a role to one
  store: other stores then answer 403.
- **GitHub is optional.** Without the GitHub App, save and publish work; the toolbar shows
  **Enable history**, and History says it needs setup instead of failing.
- **Preview as a customer.** List the customers in the store's `PreviewUserIds` setting. The designer
  then offers to preview as one of them.

!!! note
    If the store or the buyer's organization has white-labeling, the logo and colors it sets win on
    the storefront. The Theme tab marks those fields: *Set by white-labeling for this visitor: a change
    here doesn't show.*

### How it works
The example is a fastener distributor, Northfield Supply, running a spring sale.

#### Build and publish a page
1. Open **Stores**, select your store and click the **Site Builder** widget.

   ![Site Builder widget](../../../test-results/chrome/docs/VCST-6571/c01-site-builder-widget.png)
2. The page list opens, with **Draft**, **Pending**, **Active**, **Archived** and **All Pages**. Click
   **Add** to create a page: it starts as a draft and is not on the storefront.

   ![Store pages](../../../test-results/chrome/docs/VCST-6571/c02-page-list.png)
3. Open the page and click **Edit in designer**. On the **Sections** tab, click **Add section** and pick
   one, such as **Image**, **Features**, **Products carousel** or **Call to Action with Image**.

   ![Designer, Sections tab](../../../test-results/chrome/docs/VCST-6571/c03-designer.png)
   ![Add section](../../../test-results/chrome/docs/VCST-6571/c04-add-section.png)
4. Drag, copy and **Paste**, hide or remove sections; the preview follows each change. Click a title in
   the preview to type over it; **Undo** brings the old text back. The page's main section can't be
   removed or hidden.
5. Use the switches above the preview for light and dark mode and for desktop, tablet and mobile.

   ![Preview: mobile, dark](../../../test-results/chrome/docs/VCST-6571/c05-preview-mobile-dark.png)
6. Click **Save**, then **Publish**. The page is live at its permalink; **Unpublish** takes it off again.

   ![The page on the storefront](../../../test-results/chrome/docs/VCST-6571/c06-storefront-page.png)

![Build and publish a page](../../../test-results/chrome/docs/VCST-6571/build-a-page.gif)

!!! warning "Two pages on one permalink"
    If another page is already published for everyone at the same permalink and language, a dialog
    names it. **Yes** publishes your page and unpublishes the other one; **Cancel** changes nothing.
    If the other page has an unpublished draft, you get an error and nothing is published.

!!! tip "Safe content"
    A link to `javascript:` or a `data:` URL is refused on save. A `<script>` in rich text is removed.
    `mailto:` and `tel:` links, anchors and images keep working.

#### Set the brand, colors and announcement bar
1. Open the **Theme** tab. Under **Brand**, pick the **Logo**, the **Logo on dark backgrounds** and the
   **Favicon**: click **Select**, or paste a URL.

   ![Theme tab, Brand](../../../test-results/chrome/docs/VCST-6571/c07-theme-brand.png)
2. Under **Colors**, in **Generate from colors**, enter a **Primary color** and, if you want, a **Second
   color (optional)**, then click **Generate**. It builds the light and dark palettes with readable text;
   **Undo** brings the previous palettes back.

   ![Generate from colors](../../../test-results/chrome/docs/VCST-6571/c08-generate-colors.png)
3. On the **Sections** tab, under **HEADER**, click **Add section** → **Announcement bar**, then
   **Add block** → **Announcement**, and type the text and an optional link. The bar takes palette colors
   only.

   ![Announcement bar in the preview](../../../test-results/chrome/docs/VCST-6571/c09-announcement.png)
4. Click **Save**, then **Publish theme**. Header, footer, brand, palette, templates and rules go live
   together. Publishing a page does not publish theme changes.

![Set the brand, colors and announcement bar](../../../test-results/chrome/docs/VCST-6571/brand-and-colors.gif)

!!! warning "Low contrast is refused"
    If you set a color by hand that is hard to read, the panel lists the failing pair, for example
    *Body text on Body bg 1.11:1, needs 4.5:1*. **Publish theme** then refuses with "The theme couldn't
    be published", and the storefront keeps the previous theme.

A store menu changed in the Content module shows on the storefront without publishing the theme again.

#### Give products their own template
1. Open the page switcher next to **Pages**. Under **PRODUCT TEMPLATES**, click **Create template (copy of
   default)**. The same works for category and page templates.

   ![Page switcher](../../../test-results/chrome/docs/VCST-6571/c10-switcher.png)
2. Name the template after the products it's for, here **Fasteners**, and click **Create**. The copy
   starts with the same sections as **Default**: Product (properties, description, assets, variations),
   Related products, Recommended products and Customer reviews. Add what these products need — here a
   **Text** section, "Buying for a job site?" — and click **Save**.

   ![New template](../../../test-results/chrome/docs/VCST-6571/c11-new-template.png)
3. Click **Template rules** and add a rule: click a suggestion, such as **Products in Carriage Bolts**,
   or **Add rule**. A product rule offers category, product type and property; a category rule offers
   category; a page rule offers page path, language, kind of page and page setting. **The first rule that
   matches wins**: drag rules to change the order, and use a rule's switch to turn it off.

   ![Template rules](../../../test-results/chrome/docs/VCST-6571/c12-template-rules.png)
4. Click **Save**, then **Publish theme**. Products the rule matches now use your template. A product with
   variations keeps its variations list and add to cart, and shows the new section.

   ![Variations on the Fasteners template](../../../test-results/chrome/docs/VCST-6571/c13-pdp-variations.png)
   ![The section the template adds](../../../test-results/chrome/docs/VCST-6571/c14-pdp-template-text.png)

![Give products their own template](../../../test-results/chrome/docs/VCST-6571/product-template-rule.gif)

Video: [Site Builder film, 74 s](https://claude.ai/artifact/GcpV6toFGUSH2qxJYWGdJJ) · [short version, 30 s (MP4)](https://virtocommerce.atlassian.net/secure/attachment/87725/VCST-6571-site-builder.mp4) (attached to this ticket).

Not documented: installing Site Builder and moving from Page Builder (not tested) · History versions,
restore, one version per save and every GitHub flow (no GitHub organization on vcst) · a store with
`GitContentEnabled` on and no GitHub (not verified) · the AI assistant (its panel offers no sign-in on vcst) ·
organization-level white-labeling markers (no such organization) · product and page pickers in section
fields (the theme declares none). The screenshots show a demo store (Northfield Supply) set up for this
guide on the tested build and removed afterwards; its announcement bar and generated colors were not saved.
Verified on vcst · run VCST-6571 rounds 1–2 (2026-11-19 – 2026-11-21) · verdict PASS (round 2 re-test; round 1 FAIL, F-1 and F-2 fixed) · captured 2026-11-24 · versions run

Sources: VCST-6571 test plan (comment 113220) and fix notes (comment 113283) ·
[theme-snapshot.md, Conditions](https://github.com/VirtoCommerce/vc-module-site-builder/blob/feat/VCST-6571-site-builder-r1/docs/contracts/theme-snapshot.md#conditions) ·
VirtoOZ has no Site Builder page yet (closest: https://docs.virtocommerce.org/platform/user-guide/page-builder/overview) ·
kb KB-1EE973A2, KB-7D908FAE, KB-9FDDB07C
