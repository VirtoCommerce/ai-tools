## Documentation — VCST-6842: Ask an AI agent for a page — it builds it in Site Builder

### What's new
Site Builder now speaks MCP, the protocol AI agents use to work in other systems: its tools are on the back office's agent endpoint, `/admin/mcp`, so Claude, ChatGPT or any MCP agent can work in Site Builder for you. A marketer or a site designer asks an AI agent in plain words, for example *"Create a landing page for Office print week"*, and the agent builds it in Site Builder as the signed-in user, in that user's stores only. The agent shows every change as a dry run before it makes it, and nothing reaches customers until a second person approves it in **Agent approvals**. Translations of many pages run as background jobs, and every agent call is recorded in the **Agent audit log**.
Shipped in: VirtoCommerce.SiteBuilder@3.1003.0-pr-5-1129 · VirtoCommerce.MCP@3.1001.0 · VirtoCommerce.BackgroundJobs@3.1055.0 · platform@3.1100.0 · vc-frontend theme@2.63.0-pr-2698-faeb-faeba500
Release: VirtoCommerce.SiteBuilder 3.1002.0 contains this change.

### How to set it up
1. Install three modules in **Modules**: **Site Builder**, **MCP** (`VirtoCommerce.MCP`, 3.1001.0 or later) and **Background Jobs**. Background Jobs runs the bulk tools; without the MCP module, Site Builder works as before.
2. Open the endpoint in the platform's `appsettings.json`, then restart the platform:
   ```json
   "Authorization": { "Resources": [ "https://<platform>/admin/mcp" ] },
   "MCP": { "PublicOrigin": "https://<platform>" }
   ```
3. Give each person a role for their work (**Who works with the agent**, below). The agent gets exactly that person's rights.
4. Keep the MCP setting `MCP.Approval.AllowSelfApproval` off, so a second person approves every publication.
5. Connect the agent to `https://<platform>/admin/mcp` and sign in with your back-office account. An agent client that does not register itself needs an OAuth application in **Security › OAuth applications** (a public client with the agent's callback address).

#### Who works with the agent

| Who | What they do with the agent | Permissions |
|---|---|---|
| **Content author** | Landing pages, texts, translations, SEO | `builder:read`, `builder:create`, `builder:update`, `builder:publish` |
| **Site designer** | Page layouts (templates and their rules), header, footer, brand colors | the author's, plus `builder:templates` and `builder:theme` |
| **Approver** — a second person | Approves what goes live | `mcp:approve`, `builder:read` for the store, `builder:publish` |

Limit `builder:read` with **Only for selected stores** when a person works in some stores only: the agent then sees and changes those stores only, and a page of another store is refused even by its id.

!!! note "The designer preview needs a theme with Site Builder"
    The storefront theme must have Site Builder switched on. Without it, the designer says the storefront does not support the new designer.

### How it works

#### What you can ask
Ask in your own words; the agent picks the tool. Every change comes back first as a dry run that saves nothing.

| You ask | The agent uses | What you get |
|---|---|---|
| *Create a landing page for Office print week* | `create_page` | A new page as a **Draft**, with the sections you named |
| *Make the subtitle say the deals end Friday* | `edit_page_draft` | The old and new text, then the saved draft |
| *Translate it into German* | `set_translations` | A background job that fills the German version |
| *Find pages with no SEO description* | `find_content_gaps` | Each page with what is missing and how to fix it |
| *Change the button on every promo page* | `update_sections_bulk` | How many pages and sections match, then one background job |
| *Use the "Tech specs" layout for all printers* | `edit_template_rules` | The page-layout rules before and after |
| *Make our brand color blue, with light and dark palettes* | `edit_theme_draft` | The light and dark palette, with any colors below WCAG AA contrast |
| *Publish it* | `publish_page` | A request that waits in **Agent approvals** |

Layouts and palette change the theme: customers see them only when the theme is published, which a second person approves too.

The toolset has 28 tools. The full list, with the permission each needs: [Site Builder README §Tools](https://github.com/VirtoCommerce/vc-module-site-builder/blob/3.1002.0/README.md#tools).

#### The agent drafts a page, and the designer shows it
1. Ask the agent, for example: *"Create a landing page "Office print week" in B2B-store: a title, a carousel of four printers and a short text on how to order."* The agent first runs `create_page` as a dry run and shows what it will create. After your yes it creates the page as a **Draft**; customers see nothing yet.
2. Go to **Marketing › Content › Sites**, open the store and click the new page. The designer shows the agent's draft.
   ![The designer with the agent's draft: sections Title, Products carousel and Text; the preview shows Office print week](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-01-designer-draft.png)
3. Ask the agent to change a text, for example the subtitle. It reads the page's version, shows the change as a dry run, then saves it with `edit_page_draft`. If someone saved the page in between, the save is refused.
4. Reload the designer. The preview shows the agent's new text.
   ![The designer preview after the agent's edit: the subtitle now reads Ends Friday: volume deals on the printers your team uses every day](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-02-designer-edited.png)

![Walkthrough: the agent's draft, then its edit, in the designer](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-gif-1-agent-edits-draft.gif)

#### A publication waits for a second person
1. Ask the agent to publish the page. It runs `publish_page` as a dry run, then sends the request. The answer is `pending_approval` with a change id, and the page stays a Draft.
2. A second person with `mcp:approve` opens **Settings › Monitoring & Tools › Agent approvals**. The request is listed as **Pending**.
   ![Agent approvals: Publish page, publish_page, requested less than a minute ago, status Pending](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-03-approval-pending.png)
3. They open the request, check who asked and when, and add a **Comment** for the requester and the audit log.
   ![The request: Comment typed; Request block with Tool publish_page, Status Pending, Requested by, Scope admin, Expires](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-04-approval-comment.png)
4. They click **Approve**, then **Confirm** in the dialog *"Approve this change? The tool runs right away as you."*
   ![The Confirmation dialog: Approve this change? The tool runs right away as you.](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-05-approve-confirm.png)
5. The request shows **Applied**, who reviewed it and the comment.
   ![The request after approval: Status Applied, Reviewed by admin, Comment](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-06-approval-applied.png)
6. The page is live on the storefront.
   ![The storefront page Office print week with the agent's subtitle](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-07-storefront-live.png)

![Walkthrough: pending request, comment, confirmation, applied, live page](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-gif-2-publish-approval.gif)

#### The agent translates pages in the background
1. Ask the agent to translate a Multilanguage Page into a language, for example German. `set_translations` shows a preview as a dry run.
2. After your yes, it answers a job id and the preview of its changes.
3. Ask how the job is going: `get_job_status` follows it from **Queued** to **Succeeded**. The language version then holds the translated texts.

#### Every call is in the Agent audit log
1. Open **Settings › Monitoring & Tools › Agent audit log**. Each call shows the tool, date, user, client, scope, duration and outcome.
2. Calls that wait for approval, are refused or are declined are listed too. An approval made in the back office shows with the client `back-office`.
   ![Agent audit log: create_page, edit_page_draft and publish_page by the author's agent, publish_page Waiting for approval, then approve_pending_change and publish_page by admin from back-office](../../tickets/Sprint26-20/VCST-6842/vcst_dev/screenshots/docs-08-audit-log.png)

!!! note "Security"
    **Protected.** The agent works as you, with your rights and in your stores only. It shows every change before making it. A second person approves every publication, and if the draft changes after the dry run that was reviewed, approving publishes nothing. Every call is logged. Discarding a draft and restoring a version ask you to confirm in the chat. **The agent cannot** delete or archive pages, delete Shared Components, promote to the production branch, or upload files: these stay in the designer.

Video: VCST-6842-site-builder-agent-v2.mp4 (attached to this ticket).

Not documented: the **What will change** table of a publication shows only the status change, not the content going live (VCST-7019, open), so no frame shows it · connecting Claude Desktop or Claude Code by self-registration (not exercised; the run and the capture used a registered public OAuth client) · tool arguments with a wrong name are ignored without an error (run note) · `find_content_gaps`, `update_sections_bulk`, `edit_template_rules` and `edit_theme_draft` were checked as dry runs only (2026-11-26, nothing saved); their real saves and the theme publication were not exercised · walkthrough GIF of the bulk translation: not captured, it has no back-office screen and was verified in the run only · the film's chat window is an illustration; its replies come from the real calls of the capture · the run tested SiteBuilder 3.1002.0-pr-2-c357; the frames come from 3.1003.0-pr-5-1129, which also holds VCST-6963's custom section types (kept out of the frames)
Verified on vcst_dev · run VCST-6842 (Sprint26-20) · verdict PASS WITH NOTES · captured 2026-11-25 · versions capture

Sources: Site Builder README at tag 3.1002.0, https://github.com/VirtoCommerce/vc-module-site-builder/blob/3.1002.0/README.md (§AI agents (MCP), §Production setup, §Tools, §What agents cannot do) · the docs site has no Site Builder agent page yet (Context7 `/virtocommerce/vc-docs`, 2026-11-25) · kb KB-54FE11E6 (Agent approvals and audit routes), KB-0593FB2E (dry runs of the bulk, rule, palette and gap tools)
