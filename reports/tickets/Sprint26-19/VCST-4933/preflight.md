# VCST-4933 — pre-flight record (1a/1b)

Run: /qa-test VCST-4933 on vcptcore-qa · 2026-09-17 · FULL path

## 1a — routing
- Type: Story · Status: `Ready for test` (role: testable) · Priority: High
- FLOW: feature-test · EFFORT: **FULL** (Story, cross-layer, >=2 domains, High)
- Shape class: not `ui-kit` (feature change, not design-system/token layer)
- Parent Epic: VCST-4931 "Page Builder - 26Q2 Roadmap"
- Sub-tasks: VCST-5183 MVP / VCST-5184 Production ready / VCST-5185 Linked Components Tuning — **all still `To do`** (scope question, 1d §H)
- Linked: causes VP-9060 "[Innovadis] Asset management & Component reusability"
- Opening status hop: **SKIPPED — no in-testing transition exists** from `Ready for test`
  (available: Cancelled / On hold / Need fixes->Reopen / Finish test->Tested)

## 1b — pre-flight
| Item | Result |
|---|---|
| env health | backend 200, storefront 200 |
| declared build | vc-deploy-dev@vcptcore-qa -> PageBuilderModule_3.1025.0-pr-159-7361 |
| deployed build (ground truth) | PageBuilderModule **3.1025.0-pr-159-7361** = PR #159 itself |
| platform | 3.1070.0-pr-3115-8265 |
| sprint | Sprint26-19 |
| duplicate check | none in 2h window |
| attachments | 16 present, **0 fetchable** — .env.local JIRA_API_TOKEN expired (401). STATED GAP |

## Derived axes
- 2b layer: **all** (backend .NET API + Angular Designer + VC Shell Vue app + storefront)
- 2c visual_surface: **true** (Designer UI, Shared Blocks Library, VC Shell workspace, design PDF/HTML prototype attached)
- 2d contract_surface: **true** (storefront delivery read via GraphQL slugInfo -> pageDocument)
- 2e coverage_surface: **true** (059/060/060b exist)
- 2f data_surface: **true**
- 2g domain_map: **ABSENT** + all_layer_chain -> 1c-map dispatched (FULL)

## 1r — reachability: REACHABLE (orchestrator correction)
Sub-agent returned BLOCKED claiming the module never started. **Falsified directly:**
- registered in /api/apps/platform/manifest as a platform plugin
- entry bundle /modules/$(VirtoCommerce.PageBuilderModule)/dist/app.js -> 200, 76014 bytes
- VC Shell app /apps/page-builder-shell/ -> 200 (appId page-builder-shell)
- API live: POST /api/page-builder-shared-components/search -> 200 (3 components), /api/page-builder-pages/search -> 200 (107 groups)
The `RefreshProbingFolderOnStart=false` banner is a generic platform notice, not this module's state.
**Surviving observation carried as a HYPOTHESIS (not a defect):** an admin exploring the UI found no
Page Builder / Shared Components entry in the left nav, the Browse/Configuration menu, or the app
launcher, while the workspace exists at a URL. If reproduced -> challenges AC1.

## Env fixture inventory (2026-09-17)
Shared Components on B2B-store (3):
- 8b17ecd15fca4290a987e5b5315b61b5  AGENT-TEST-SC-q5          usage=3
- 35a5ad9c85944d608cb74fcbe38b7b77  AGENT-TEST-SC-vcpt2-trio  usage=2
- 740043164d18402090c801c1a3a04e71  saA1                      usage=1
All three carry an identical modifiedDate 2026-09-09T13:32 (bulk re-save / propagation event — verify).
Pages: 107 groups, 49 Published, 84 non-published.

## Oracles
**No BL-* invariant exists for the Page Builder / CMS domain** — the corpus records behaviour
rather than judging it. This is the run's first finding. Available adjacent: BL-UI-001..007,
BL-A11Y-001..004, VC-CMS-001, VC-CMS-002.

## Access recipes (for later steps)
- token: POST /connect/token, form `grant_type=password&username=admin&password=Password1`,
  **no client_id, no scope** (sending either returns 401)
- browser login: username `admin`, password = bare secret key `ADMIN_PASSWORD_VCPTCORE`
