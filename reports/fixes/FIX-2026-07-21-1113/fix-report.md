# FIX-2026-07-21-1113 — VCST-5515 — STOP at Gate 1 (out of auto-fix scope)

- **Ticket:** [VCST-5515](https://virtocommerce.atlassian.net/browse/VCST-5515) — Stale "Has unsaved changes" banner after a clean Publish (Bug, Low)
- **Report:** `reports/bugs/open/BUG-PageBuilder-Stale-Unsaved-Changes-Banner-VCST-5515.md`
- **Outcome:** `FIX_STATUS: STOPPED` at **Gate 1**. No repo cloned, no branch, no PR. Ticket left as filed.

## Gate results
| Gate | Result | Note |
|------|--------|------|
| G0 — eligibility | PASS-ish | Simple, low-risk, localized, non-breaking cosmetic bug; clear STR + expected/actual. |
| **G1 — single target repo** | **STOP** | Repo resolves cleanly to one allowed repo (`vc-module-pagebuilder`, in profile `repos.platform`), **but** the owning code is that repo's **Vue 3 `@vc-shell` shell** app — a framework no auto-fix developer agent is equipped for (see below). |
| G2 — reproduce (red) | Blocked | Shell test harness is `tsx --test` (plain Node); no `@vue/test-utils`/jsdom mount harness for this mounted-component UI-state bug. |

## Why STOP (Gate 1)
The bug is in `src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/` (Vue 3 + `@vc-shell/framework`; banner in `.../modules/page-builder/locales/en.json`). The repo is `kind: module` → pipeline routes to the **backend** developer (.NET + legacy AngularJS 1.x via `/angular-admin`) — wrong framework. The **frontend** developer knows Vue 3 but is scoped to the **vc-frontend storefront** repo (different structure, `vitest`+`@vue/test-utils`, storefront UI kit), not a module-embedded `@vc-shell` app. Neither agent + the missing mount harness + Low severity + unpinned RCA anchor (report confidence MEDIUM) ⇒ forcing a fix is the wrong trade; clearing the "has changes" flag incorrectly could mask genuine unsaved changes.

## Handoff
Page Builder frontend engineer familiar with `page-builder-shell` (`@vc-shell/framework`): reconcile the details-blade "has unsaved changes" flag with `GET grouped/publish-status/{id}` (`hasChanges:false`) after a successful Publish. Ticket commented with the same reasoning.

## Gap surfaced (pipeline)
`vc-module-pagebuilder` (and any module hosting a modern `@vc-shell` Vue app) is a routing blind spot: `kind: module` implies .NET/AngularJS, but the owning sub-app can be Vue 3. No agent/skill covers "Vue 3 `@vc-shell` app inside a module repo" today.
