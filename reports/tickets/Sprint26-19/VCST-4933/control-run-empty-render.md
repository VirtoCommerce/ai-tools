# Control run — "Shared Component isn't displayed" is a FIXTURE defect, not a product defect

Date 2026-09-17 · env vcptcore-qa · build PageBuilderModule 3.1025.0-pr-159-7361 (PR #159),
storefront 2.58.0-pr-2410-3aa8 (PR #2410). Both PRs deployed.

## The claim under test
1c observed both shared-component fixture pages rendering VISUALLY EMPTY on the storefront
(header/breadcrumb/footer paint, content area blank), corroborating the open 2026-09-11 ticket
comment "the Shared Component isn't displayed in Preview".

## The A/B control
| Page | authored by | block types DELIVERED | componentRef delivered | renders? |
|---|---|---|---|---|
| `/agent-test-q5-use1` | prior agent session, REST API | `Text` x10 | **0** | NO — main = breadcrumb only |
| `/agent-test-q5-plain` (CONTROL, no shared component) | prior agent session, REST API | `Text` x6 | 0 | **NO — equally empty** |
| `/qa-homepage-spring-sale` (CONTROL, human-authored) | Designer | `title`,`text`,`predefined-product-list`,... | 0 | **YES — headings, text, live product carousel** |
| `/qa-return-policy` | Designer | `title`,`text` | 0 | n/a (delivery confirmed) |

Delivery layer read via storefront `POST /graphql`: `slugInfo(permalink,storeId,cultureName)`
-> `entityInfo.id` -> `pageDocument(id)` (note: `pageDocument` takes **id only** — no storeId/cultureName).

## Conclusion
The empty render is caused by an **invalid block type** in the prior session's fixtures: `"Text"`
(capitalised) is not a renderer this theme has; real content uses lowercase `text`/`title`. A page
with NO shared component authored the same way is equally blank, and a Designer-authored page on the
same delivery path renders fully. **Therefore the symptom is not caused by Shared Components.**

Filed as: NOT A PRODUCT DEFECT (fixture defect). Had the observation been taken at face value this run
would have filed a false Critical.

## Positive result for AC7 obtained from the same evidence
`/agent-test-q5-use1` and `/agent-test-q5-use2` both deliver **10 expanded blocks with ZERO
`componentRef` markers**, while the AUTHORING content for the same groups
(`GET /api/page-builder-pages/grouped/{groupId}/content?draft=true`) holds the compact 3-key marker.
=> "Page Builder expands references before Pages indexing, so Storefront receives ordinary resolved
blocks" **HOLDS on live data.** Both pages deliver identical shared text, proving true sharing rather
than independent copies at the delivery layer.

## Consequences
1. The 3 existing `AGENT-TEST-SC-*` components and every page referencing them are **invalid fixtures**
   for any storefront/preview assertion. Do not build render assertions on them.
2. The open 2026-09-11 "not displayed in Preview" finding is **NOT closed** by this control — it must be
   re-tested on Designer-authored fixtures with valid block types.
3. New fixtures must be authored through the Designer, or at minimum with block types taken from a
   real page. (Consistent with VC-CMS-002: never use the REST API for content authoring.)

---

# AC7 — VERIFIED IN FULL (2026-09-17, orchestrator, playwright-chrome)

AC7: "Authoring content stores compact `componentRef` references. Page Builder expands references
before Pages indexing, so Storefront receives ordinary resolved blocks and does not call the Shared
Components API."

| Clause | Oracle | Result |
|---|---|---|
| (a) authoring stores the COMPACT marker | `GET /api/page-builder-pages/grouped/{gid}/content?draft=true` returns the 3-key `{"id","type":"componentRef","componentRef"}` item | **PASS** |
| (b) expanded BEFORE Pages indexing | storefront `pageDocument(id)` for both linked pages delivers 10 expanded blocks with **componentRef count = 0** | **PASS** |
| (c) Storefront never calls the component API | full network trace of a page render: **zero** requests to `/api/page-builder-shared-components`; zero requests to the platform backend at all; all content via storefront `/graphql` | **PASS** |

Evidence: network trace on https://vcptcore-qa-storefront.govirto.com/agent-test-q5-use1 — 4x POST
/graphql (storefront), static assets, Builder.io CDN (unrelated pre-existing integration), App
Insights (known 400 "Invalid workspace" env noise, not a defect). No platform-API call of any kind.

Note the strength of this result: it holds even though these fixture pages render blank, because the
blank render is a block-type fixture defect (above) and does not touch the delivery contract. The
expansion and the API-isolation boundary are the two architecturally load-bearing claims of the
ticket, and both hold on live data.
