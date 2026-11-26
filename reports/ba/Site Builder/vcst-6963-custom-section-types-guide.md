## Documentation — VCST-6963: Build new storefront blocks by asking an AI agent

### What's new
Site Builder works over MCP, the protocol AI agents use to work in other systems, so Claude, ChatGPT or any MCP agent can now build a brand-new section type from a plain description: its HTML template, its CSS and its settings. You check it in the designer's **Custom sections** group and preview it before anything is published. After the Site Builder theme and the page are approved, buyers see it on the storefront with no storefront build or deploy. One type serves many pages, each with its own texts. Blocks follow the store's palette, adapt to phone, tablet and desktop, and follow the store's dark theme. Unsafe templates and CSS are refused when the agent saves them.
Shipped in: VirtoCommerce.SiteBuilder@3.1003.0-pr-5-01b3 · vc-theme-b2b-vue@2.63.0-pr-2698-faeb-faeba500 (holds vc-frontend#2690) · VirtoCommerce.MCP@3.1001.0 · VirtoCommerce.BackgroundJobs@3.1055.0 · Platform@3.1100.0
Release: VirtoCommerce.SiteBuilder 3.1003.0 contains this change (vc-module-site-builder#5 merged).

### How to set it up
- **Storefront:** a theme with Site Builder switched on. With it off, the storefront loads no custom-section code at all.
- **The person whose agent builds blocks:** a role with `builder:access`, `builder:read` on the store, `builder:create`, `builder:update` and **`builder:theme`**. Without `builder:theme` the section-type tools are hidden and refused.
- **The approver:** a second user with `mcp:approve`, `builder:read` on the store and `builder:publish`. A publication waits for this person in **Settings › Monitoring & Tools › Agent approvals**.
- **Connecting the agent and the endpoint:** as for the Site Builder agent tools (VCST-6842).

!!! warning "Platform file-extension whitelist"
    Site Builder saves theme drafts as `.json-draft` files. If **Settings › Platform › Security › File extensions whitelist** lists any extension, add `.json-draft`, or every theme draft save fails.

### How it works

#### What you can ask

| You ask | The agent uses | What you get |
|---|---|---|
| *Make a volume pricing block: price tiers that rise like stairs* | `create_section_type` | A dry run with the settings, template and CSS, then the type saved as a draft |
| *Move the badge under the text on phones* | `change_section_type` | The type changed; every page that places it changes with it |
| *Put all nine on the For business buyers page* | `edit_page_draft` | The blocks placed on the page draft, each with its own texts |
| *Is it ready to publish?* | `get_publish_readiness` | What the publication would put live and what blocks it |
| *Publish it* | `publish_theme`, `publish_page` | Requests that wait in **Agent approvals** |

The toolset has 32 tools. The full list, with the permission each needs: [Site Builder README §Tools](https://github.com/VirtoCommerce/vc-module-site-builder/blob/3.1003.0/README.md#tools).

#### 1. The agent creates a section type
1. Ask the agent for a block, for example: *"Create a "Volume pricing" section: four price tiers that rise like stairs when visitors scroll to it, with a badge for the biggest saving."*
2. The agent reads the **section kit** (allowed elements, kit tags, behaviors such as count-up, countdown, marquee, pointer and scroll progress, CSS rules, palette tokens) and calls `create_section_type` as a dry run. The dry run lists errors, warnings and changes, and saves nothing.
3. After your yes the agent saves the type. It exists as a Site Builder theme draft until the theme is published.
4. The agent places it on a page with `edit_page_draft`, with that page's own texts.

!!! note "What is refused"
    A `<script>`, an `on…` attribute, CSS `position: fixed`, an unknown binding or an image from outside the asset library is refused. The answer names the file and the rule, and nothing is saved. Size caps: 64 KB template, 64 KB CSS, 256 KB for all types of a theme.

#### 2. Check it in the designer before publishing
1. In Site Builder, open the page and click **Add section**. The agent's types are under **Custom sections**.
   ![Add section: the Custom sections group lists the agent's nine types](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-v2-01-picker.png)
2. The page tree marks each new type **Not published**, **Publish theme (9)** shows the waiting theme changes, and the preview renders the draft types.
   ![Designer: nine custom sections marked Not published, Publish theme (9), the tilt hero in the preview](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-v2-02-designer-draft.png)

#### 3. Publish with approval, see it live
1. The agent asks to publish the Site Builder theme, then the page. Each request waits as **Pending** in **Agent approvals** until a second person approves it.
2. Open the page on the storefront. The blocks are live; no storefront build or deploy was made.
   ![Storefront: the tilt hero and the cutoff board, live](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-v2-03-live-hero.png)
   ![Storefront: the volume pricing block, bars grown on scroll](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-v2-04-live-volume.png)
3. On a phone the blocks stack into one column, and with the store's dark theme they take its dark palette.
   ![The same page on a phone, light and dark theme](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-v2-05-mobile-light-dark.png)

![Walkthrough: picker, designer draft, live page](../../tickets/Sprint26-20/VCST-6963/vcst_dev/screenshots/docs-v2-gif-journey.gif)

!!! tip "Changing a live type"
    `change_section_type` edits the draft; the storefront keeps the old version until the theme is published again. Publish readiness warns `section-type-changed` meanwhile. Pages that leave a setting empty get the type's default.

!!! note "Security"
    **Protected.** The agent works with your rights, shows every change as a dry run first, and a second person approves every publication; every call is in the Agent audit log. **The agent cannot** run scripts on the storefront, use images from outside your asset library, or pin anything over the page.

Video: VCST-6963-custom-section-types-v2.mp4 (attached to this ticket).

Not documented: a buyer's own prices in a `vc-products` tag (checked through the API only) · the 13 Low findings of round 3, filed as VCST-7046 · discarding a never-published type removes it after a confirmation (PO decision) · the film's chat window is an illustration; its replies come from the real calls of the capture · the nine example blocks and their figures are demo data made for the capture on vcst_dev and deleted after it · the frames come from SiteBuilder 3.1003.0-pr-5-01b3, the build round 3 tested
Verified on vcst_dev · run qa-test VCST-6963 round 3 · verdict PASS WITH NOTES · captured 2026-11-26 · versions capture

Sources: vc-module-site-builder README at tag 3.1003.0 (https://github.com/VirtoCommerce/vc-module-site-builder/blob/3.1003.0/README.md, §AI agents (MCP), §Tools) and docs/contracts/custom-sections.md · vc-frontend#2690 client-app/shared/static-content/custom-sections/guide.md · the section kit resource `site-builder://stores/{store_id}/section-kit` as the stand served it · no published docs page yet (new feature) · kb KB-E388859B, KB-F9FA689C, KB-32BF9D08, KB-EE07BAC6, KB-B1984561
