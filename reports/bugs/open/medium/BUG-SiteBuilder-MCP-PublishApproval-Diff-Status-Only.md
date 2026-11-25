# BUG: Agent approvals for `publish_page` show only "status Draft → Published", not what goes live

**Jira:** VCST-7019 · **Severity:** Medium · **Provenance:** IN-SCOPE (VCST-6842, vc-module-site-builder PR #2) · **Found by:** agent, in testing
**Env:** vcst_dev — SiteBuilder `3.1002.0-pr-2-c357`, MCP `3.1001.0`, platform `3.1100.0`, theme `2.63.0-pr-2698-ade1`

## What happens
An approver reviewing a page publication requested by an agent sees one row in **What will change**:
`status: Draft → Published`. The content the publication puts live (section texts, SEO title, settings) is
not in the diff — neither in Agent approvals nor in `get_pending_change` / the `publish_page` dry run the
agent shows the user. For a page that is already live, "now: Draft" is also wrong: the page is Published
with a draft.

The approver therefore approves blind. The safeguard the feature rests on — "customers see nothing an agent
publishes until a second person approves it" — holds mechanically, but the second person cannot see what
they are approving.

## Steps
1. As a user with `builder:*` on B2B-store, over `/admin/mcp`: publish page `/agent-test-vcst-6842` once
   (approved), so it is live.
2. `edit_page_draft`: change the carousel section `title` and `seoInfo.pageTitle`.
3. `publish_page` with `dryRun: true`, then without it, with the returned `expected_versions` → pending change.
4. Open the change in **Admin Shell → Configuration → AI agents (MCP) → Agent approvals**.

## Expected
A *now → after* diff of the content the publication puts live (MCP README §Agent approvals: "a change opens
with what will change: the object, a now → after diff"; Site Builder README §Features "Before publishing.
What a publication would put live…"). Here: the carousel title and the SEO title, from → to.

## Actual
- Dry run `changes`: `[{"field":"status","from":"Draft","to":"Published"}]` (same for a first publish and a re-publish).
- Agent approvals → What will change: one row, `status Draft → Published`.
- The data exists: `get_publish_readiness` for the same page returns
  `page settings: seoInfo.pageTitle → "AGENT-TEST SEO title v2"` and
  `section products-carousel 'productscarouselrGli': title "…changed AFTER the review" → "…second version"`.
  `discard_draft`'s dry run also lists the content diff.

## Where
`src/VirtoCommerce.SiteBuilder.MCP/Tools/PagePublishingTools.cs` — `PublishGroupAsync` takes the preview from
the designer's publish dry run (`RunPublishAsync` → `x.Preview`), which describes only the status change.
Likely fix: add the draft-vs-published diff that `PublishReadinessTools` already computes to the preview
(and say "Published (draft)" rather than "Draft" as *now* when the page is live).

## Evidence
- `reports/tickets/Sprint26-20/VCST-6842/screenshots/ac3-agent-approvals-diff-status-only.jpg`
- Pending change `4136fe1e-7cc7-48b3-9959-8479c34dfb4f` (rejected after capture), audit trace in Agent audit log.
- Workaround for approvers: run `get_publish_readiness` or the `review_site_change` prompt before approving.
