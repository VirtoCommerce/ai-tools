## Documentation — VCST-6963: AI agents build custom section types the storefront shows without a release

### What's new
An AI agent can now design a new section type through Site Builder's MCP tools: its HTML template, its CSS and its settings. You can place that type on any page from the designer's **Custom sections** group and preview it before anything is published. After the theme and the page are approved, buyers see it on the storefront with no release or storefront rebuild. One type serves many pages, each with its own settings. Unsafe templates and CSS are refused when the agent saves them.
Shipped in: VirtoCommerce.SiteBuilder@3.1003.0-pr-5-1129 · vc-theme-b2b-vue@2.63.0-pr-2698-faeb-faeba500 (holds vc-frontend#2690) · VirtoCommerce.MCP@3.1001.0 · Platform@3.1100.0

### How to set it up
- **Storefront:** a theme with Site Builder switched on. With it off, the storefront loads no custom-section code at all.
- **The agent's user:** a role with `builder:access`, `builder:read` on the store, `builder:create`, `builder:update` and **`builder:theme`**. Without `builder:theme` the section-type tools are hidden and refused.
- **The approver:** a second user with `mcp:approve`, `builder:read` on the store and `builder:publish`. A publication waits for this person in **Settings › Monitoring & Tools › Agent approvals**.

!!! warning "Platform file-extension whitelist"
    Site Builder saves theme drafts as `.json-draft` files. If **Settings › Platform › Security › File extensions whitelist** lists any extension, add `.json-draft`, or every theme draft save fails.

### How it works

#### 1. The agent creates a section type
1. Ask the agent for a new block, for example "a band with our roastery numbers that count up when the visitor scrolls to it".
2. The agent reads the **section kit** (allowed elements, kit tags, behaviors, CSS rules) and calls `create_section_type` as a dry run. The dry run lists errors, warnings and changes, and saves nothing.
3. The agent saves the type. It exists as a theme draft until the theme is published.
4. The agent places it on a page with `edit_page_draft`, with that page's own settings.

!!! note "What is refused"
    A `<script>`, an `on…` attribute, CSS `position: fixed`, an unknown binding or an image from outside the asset library is refused. The answer names the file and the rule, and nothing is saved. Size caps: 64 KB template, 64 KB CSS, 256 KB for all types of a theme.

#### 2. Review it in the designer before publishing
1. In Site Builder, open the page and click **Add section**. The agent's type is under **Custom sections**.
   ![Add section: Custom sections group with Roastery in numbers](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-02-picker-custom-sections.png)
2. The preview shows the draft type on the page. **Publish theme (1)** shows that one theme change is waiting.
   ![Designer preview of the draft type, Publish theme (1)](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-01-draft-type-in-preview.png)
3. Click the section in the tree. Its settings open on the right; change **Heading** and the preview updates at once.
   ![Settings panel: Heading changed, preview updated](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-03-settings-update-preview.png)

#### 3. Publish with approval, see it live
1. The agent asks to publish the theme, then the page. Each request waits as **Pending** in **Agent approvals**, with a now → after table.
   ![Agent approvals: Publish theme pending, what will change](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-04-approval-pending.png)
2. The approver clicks **Approve**, then **Confirm**. The status becomes **Applied**.
   ![Publish theme applied](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-05-approval-applied.png)
3. Open the page on the storefront. The section is live and the numbers count up when it scrolls into view. No storefront release was made.
   ![Storefront: Our roastery in numbers](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-06-storefront-live.png)

![Walkthrough: picker, draft preview, settings, approval, live page](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-gif-custom-section-journey.gif)

!!! tip "Changing a live type"
    `change_section_type` edits the draft; the storefront keeps the old version until the theme is published again. Publish readiness warns `section-type-changed` meanwhile. Pages that leave a setting empty get the type's default.
Video: VCST-6963-custom-section-types.mp4 (attached to this ticket).
Presentation: [the animated walkthrough](https://claude.ai/artifact/Xves2iaKTxhqHsQCwCqKNY?sk=b2Gr1O62owfQx5JjK7585w)

Not documented: a buyer's own prices in a `vc-products` tag (checked through the API only) · the de-DE type name in the designer picker (not checked) · the regression suites 123/124 (not run: storefront user not configured on the stand) · two open defects to fix in this ticket (publish dry run lists no draft pages; designer REST paths without the theme folder) · discarding a never-published type removes it after a generic confirmation (PO question)
Verified on vcst_dev · run qa-test VCST-6963 round 1 · verdict PASS WITH NOTES · captured 2026-11-26 · versions run

Sources: vc-module-site-builder#5 docs/contracts/custom-sections.md and README at PR head 1129a2da (https://github.com/VirtoCommerce/vc-module-site-builder/pull/5) · vc-frontend#2690 client-app/shared/static-content/custom-sections/guide.md · no published docs page yet (new feature) · kb KB-E388859B, KB-F9FA689C, KB-32BF9D08, KB-EE07BAC6
