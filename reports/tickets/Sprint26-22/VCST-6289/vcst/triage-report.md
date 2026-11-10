# Triage — VCST-6289 · /qa-test FULL 5-triage · vcst · 2026-11-06

Source: testing-checklist.md (ticket mode, `--verify`) · PR vc-frontend#2620 @ b47e1167 (base 37cdaf67) · stand Platform 3.1094.0, theme 2.62.0-pr-2620-b47e-b47e1167
Non-passing: **9** (8 FAIL, 1 BLOCKED) · advisory, not triaged: 3 (C-13 WAIVED, C-23 known divergence, C-36 env content)
Confirmed real bugs: **3**, all from before the PR · Owner decisions: **4** · Test defects: **0** (1 checklist cross-reference fix) · Dismissed: **2**
`--fix` does nothing in ticket mode. Phase 2 (dedup/history) was skipped as the skill specifies. App Insights was skipped by the operator.

## 1. Confirmed real bugs (reproduced live on playwright-chrome)
| Case | Sev | Provenance | Repo | Root cause | Draft · package |
|---|---|---|---|---|---|
| C-21 | P2 Medium | PRE-EXISTING | vc-frontend `ui-kit/.../widget/vc-widget.vue` | collapsible header `<button>` binds no `aria-expanded`/`aria-controls`; body toggled by v-show has no id (BL-A11Y-004, WCAG 4.1.2). QA SB, DEV SB and storefront /catalog Brand facet | `bugs/medium/BUG-VcWidget-Collapsible-Header-No-Aria-Expanded.md` · `evidence/C-21/` |
| C-30b | P3 Low | PRE-EXISTING | vc-frontend `shared/catalog/components/image-gallery.vue` | thumbs Swiper loop + slidesPerGroup 4 + `loopAddBlankSlides` default true pads 5 images to 8 slides (3 blank) | `bugs/low/BUG-Product-Gallery-5-Images-Empty-Thumbnail-Cells.md` · `evidence/C-30b/` |
| C-35 | P4 Low | PRE-EXISTING, Storybook only | vc-frontend `ui-kit/.../shape/vc-shape.stories.ts` | Mask story `img: "/static/images/home/main-banner.webp"` is not a key in `getImageUrl()`'s Vite asset map, so it resolves to `/assets/undefined` and returns 404 (QA + DEV SB) | `bugs/low/BUG-VcShape-Mask-Story-Requests-Assets-Undefined.md` · `evidence/C-35/` |

Dedup: Jira (read-only JQL) and local `reports/bugs/**` and `reports/tickets/Sprint*/**/bugs/` found no match for any of the three.

## 1b. Owner decisions: REAL_BUG at LOW confidence, not live-verified (no repro layer; already measured)
| Case | Provenance | What must be decided |
|---|---|---|
| C-04 | IN-SCOPE | AC-1 "exactly as before" vs AC-3 "skeleton = widget": accept the 44 classic skeleton PIXEL deltas, plus the undeclared header-slot story header 56→50 px, and amend AC-1; or restore the classic skeleton |
| C-10 | IN-SCOPE | Open Question 2: soft turns every unmasked VcShape into a disc (as built), or the disc is opt-in per block (needs a prop gate) |
| C-22 | IN-SCOPE | Soft dark plate bg = page bg, border 0, glow ~1.1:1. Is a perceivable edge required, or is plate = page intended (PR: "soft dark = today's dark colours")? If intended, the row becomes an assertion defect / known divergence |
| C-33 | IN-SCOPE (DoD) | Designer approval and answers to Open Questions 1–3 are not recorded on VCST-6289 (no comments). These answers also settle C-04, C-10 and C-22 |

## 2. Test-case / checklist fixes (recommended; the caller writes)
| Case | CLASS | Fix |
|---|---|---|
| C-28b | (evidence cross-ref) | "(VCST-6232 C-11)" → **VCST-6232 C-15** (C-11 there is the Tailwind var() check; C-15 measured home CLS 0.296 soft vs 0.277 base) |
| C-31b | ENV | record as not testable on this surface: Storybook does not include the app's `@layer vc.print`. The app half is C-31 (PASS) and soft-in-app is under the operator waiver |

## 3. Dismissed
| Case | CLASS | Reason |
|---|---|---|
| C-28b | KNOWN_ISSUE (MEDIUM) | load-time footer push and late mobile top bar, not widgets. Matches **VCST-6659** (375 px footer shift, To do) + kb KB-553F411E. Related: VCST-6716 (product action row slot, Draft), VCST-6712 (catalog sort CLS, Draft). Dashboard 0.58 and order details 0.28 at desktop are not clearly covered by VCST-6659 and were not measured on the base |
| C-31b | ENV (HIGH) | verification-surface limit, not a product defect |

kb: KB-F6BEC4A4 confirmed. Captured: KB-B70B1A4A (C-21), KB-4135FFBE (C-35); both queued until the next push.

No tracker ticket filed, no fix triggered — human decides.
