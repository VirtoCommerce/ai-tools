# Design / visual lane — VCST-5378 (4v)

> ## ⚠ ACCESSIBILITY FINDINGS EXCLUDED FROM THIS RUN — operator decision, 2026-09-22
>
> The operator scoped accessibility **out** of VCST-5378. **F1 and F2 below are both `BL-A11Y-*` findings and are therefore NOT filed, NOT carried into 5-triage, and NOT counted in this run's verdict.**
>
> They are kept in this report rather than deleted, because an excluded finding and an unfound one must not read the same. Both were reproduced live and their severities stand on their own evidence; whoever picks accessibility up for this surface should start here.
>
> **This axis was NOT assessed clean — it was assessed and set aside.** Do not read the absence of a11y findings in `summary.json` as a pass. The two pre-existing sitewide axe violations noted below were already out of scope for this PR and are unaffected either way.
>
> **Still in scope from this lane:** the UX copy judgment on the handoff-failure banner (§ at the end) — that is a clarity/honesty finding about the message, not an accessibility one, and it survives the exclusion.

---


Build: storefront `2.59.0-pr-2467-1951-195127f5` · UCP `3.1006.0-pr-7-612c` · Platform `3.1072.0-pr-3108-b6ef`.
Browser: Chrome DevTools MCP. Env: vcst-qa (`FRONT_URL`).

## Axis verdicts

| Axis | Verdict | Notes |
|---|---|---|
| `vs. DESIGN` (Claude Design spec) | `SKIPPED` | Ticket carries no Prototype/design link — no source to resolve. Not a PASS. |
| `BL-UI-*` / `BL-A11Y-*` invariants | **FAIL — NON-BLOCKING** (see correction below) | F1 re-cited to `BL-A11Y-001` (storefront focus management) + WCAG 2.4.11. Everything else PASS on the audited surfaces. |
| WCAG 2.2 AA (axe-core + keyboard) | **FAIL** (1 new-surface violation) | See Findings F2 (WCAG 4.1.2). Pre-existing sitewide items noted separately, out of scope. |

## Auth-path note (read before the findings)

Chrome DevTools MCP has no `--secrets`; the persistent profile (`~/.chrome-devtools-mcp/vc-qa-profile`) was checked and is **signed out**. Per the browser-lanes rule this is a STOP for role-gated/data-bearing content — no password was typed. Two of the three targets are role-agnostic or resolvable without login, so they were fully exercised:

- **Target 1** (failure banner): no auth needed — reproduced directly.
- **Target 2** (successful handoff landing): the brief's recipe mints a handoff as the **authenticated B2B buyer** (`test-john.mitchell`). That cart carries `organization_id`, and opening its `continue_url` anonymously correctly bounced to `/sign-in?returnUrl=/checkout?ucp_resume=<uuid>&reauthenticate=1` rather than either leaking the cart or erroring — this **confirms live, for the first time, half of domain-map gap G1** (`.claude/knowledge/domain/ucp.md` G1: "the authenticated and organization-scoped handoff was never exercised live"). The other half (does sign-in-then-resume actually complete the merge) remains unverified in this lane — it needs either a restored persistent-profile login or a Playwright lane with `--secrets`.
  To still exercise the **rendered landing page itself** (line items, addresses, checkout form, a11y), I minted a **second, anonymous** handoff via the same MCP recipe (anonymous `buyer_id`, no bearer token, explicit `shipping_address`) and opened its `continue_url` in a fresh isolated context. This is the documented, `CONFIRMED`-live anonymous-buyer path, not a substitute claim for the org-scoped one — the report is explicit about which cart backs which screenshot.
- **Target 3** (`/oauth/authorize`): anonymous hit redirects to `/sign-in?returnUrl=/oauth/authorize` (matches domain map `CONFIRMED`). The actual consent/session-establishment page behind that gate could not be rendered in this lane for the same reason as above. Reported as `SKIPPED` for the authenticated view; the anonymous gate itself was audited and is clean.

## Findings

### F1 — Failure-banner toast obscures the focused "Sign in" link at desktop width — `BL-A11Y-001` / WCAG 2.4.11 (Focus Not Obscured, Minimum) — **High**

At ≥1280px, the handoff-failure toast (`.notifications-host__item`, fixed top-right, 320×96px) renders **on top of** the header's "Sign in" link. Measured: focused-element rect `{left:1061, top:6.5, right:1110, bottom:32.5}` vs toast rect `{left:929, top:20, right:1249, bottom:116}` → **48% of the focused link's box is covered** (`overlapAreaPx: 612` of `focusedAreaPx: 1273`). A sighted keyboard user tabbing from the skip-links reaches "Sign in" while it is nearly half-hidden under the red banner — they cannot see what they've focused. Confirmed both by measurement and screenshot (thin blue focus-ring sliver visible at the toast's left edge, `screenshots/oauth-handoff-failure-banner-1280-r1.png`, second capture after the Tab walk).

Not reproducible at ~500px effective mobile width — the toast repositions to a bottom, full-width band there and does not overlap the header (`screenshots/oauth-handoff-failure-banner-375-r1.png`). This is a **desktop-viewport-only** occlusion.

- Cite: `BL-A11Y-001` (storefront keyboard operability + visible focus indicator), WCAG **2.4.11** Focus Not Obscured (Minimum) — new in 2.2.
- Repro: open `{FRONT_URL}/checkout?ucp_session=<any garbage string>` at ≥1280px, Tab from page top ~9 times to reach "Sign in", observe.
- Screens: `oauth-handoff-failure-banner-1280-r1.png` (×2, pre/post Tab-walk), `oauth-handoff-failure-banner-375-r1.png`.

### F2 — Address "edit" icon button has no accessible name on the handoff cart landing — WCAG 4.1.2 (Name, Role, Value) — **Medium**

On `/cart/{cartId}?ucp_handoff=1`, the pencil/edit button next to "Shipping address" (`.vc-button--outline--primary`, accessibility-tree `button` with empty name) exposes no accessible name — confirmed both via `axe-core` (`button-name`, impact: critical, 1 node) and by reading the live snapshot (uid `5_31`: bare `button`, no label, no `aria-label`). A screen-reader user hears "button" with no indication it edits the shipping address.

- Cite: WCAG **4.1.2**, `BL-A11Y-002` (Accessible naming and label association).
- Screens: `ucp-handoff-success-landing-1280-r1.png`.

### Out-of-scope, pre-existing (noted per always-on bug detection, not filed against this ticket)

Recurring on both the failure-banner cart page and the handoff-success landing, in different themes:
- `aria-allowed-attr` (critical) on a `<select>` trigger (`#select-*-trigger`) — same pattern on both pages, unrelated to UCP/handoff.
- `image-alt` (critical) on `.shipping-details-section__method-image--placeholder` — a shipping-method placeholder image with no alt text, present on both audited pages.

These appear on every checkout/cart-adjacent page this session touched, in code that predates this PR (no changed files in this ticket relate to the shipping-method selector or its images). Flagging per the "always-on bug detection" rule rather than filing — a proper fix belongs to whichever ticket owns the checkout shipping-method component, not VCST-5378.

## Copy assessment — the UX question

> *"This checkout link has expired, has already been used, or is unavailable in this tab. Request a new checkout link from your shopping assistant."*

**Assessment: not fully honest, and the "in this tab" clause is actively misleading.**

1. **Three distinct server causes collapse into one sentence, and the sentence is written as if that's a feature, not a limitation.** Per the UCP restore contract (`.claude/knowledge/domain/ucp.md` §Error taxonomy), a genuinely expired token, an already-consumed token, and an unknown/forged token **all return the same HTTP 400 `invalid_request` "ucp_session is invalid or expired"** — verified this session by hitting the endpoint with a garbage string and getting the identical banner a real expired link would produce. The storefront can't tell the buyer which of the three happened because the *server* doesn't tell the storefront. That's a legitimate security posture (don't leak which of three states an opaque bearer token is in) — but the copy papers over it by listing all three as if the buyer could distinguish their own situation from the sentence. They can't; the sentence is decorative, not diagnostic.

2. **"unavailable in this tab" is the one clause that's actually wrong for the common case.** The banner implies a tab/browser-storage problem — but the case I reproduced (a syntactically-invalid token) has nothing to do with tabs; it would fail in every tab, on every device, forever. Tab-locality genuinely applies only to the narrower "restored in a different browser than the one holding the parked `sessionStorage` key" case (§7 in the domain map). Naming the narrow case in the general sentence tells most affected buyers to try something (a different tab) that cannot possibly fix their actual problem.

3. **It never mentions the one fact that would actually reassure the buyer: the cart is untouched.** I confirmed server-side that a garbage/expired token produces this banner while leaving the buyer's real cart fully intact (the banner rendered over my browser's own live 9-item, $221 cart — nothing was cleared, merged, or touched). The copy's only actionable instruction is "ask your shopping assistant for a new link" — which is correct, but a buyer reading "expired, used, or unavailable" reasonably fears they lost their cart or their order state. One added clause ("Your cart has not been affected.") would remove that fear at zero engineering cost, since it's already true.

**Net:** the message is honest about *what to do* (get a new link) and dishonest by omission about *what happened* and *what didn't*. Recommend: drop or qualify "in this tab," and add an explicit reassurance that the cart/order was not affected. This is a copy-only change with no BL-UI or WCAG blocking status — filed as a UX observation, not a defect, per the Findings/UX-heuristic split in this skill.

## Screenshots

`reports/tickets/Sprint26-19/VCST-5378/screenshots/`:
- `oauth-handoff-failure-banner-1280-r1.png` — target 1, desktop, garbage `ucp_session` → banner over intact cart, F1 occlusion visible
- `oauth-handoff-failure-banner-375-r1.png` — target 1, mobile, banner relocates to bottom band, no occlusion
- `ucp-handoff-success-landing-1280-r1.png` — target 2 (anonymous-buyer handoff), desktop, `/cart/{cartId}?ucp_handoff=1`, F2 visible
- `ucp-handoff-success-landing-375-r1.png` — target 2, mobile, same cart, no overflow
- `oauth-authorize-anon-signin-redirect-1280-r1.png` — target 3, desktop, anonymous → sign-in gate
- `oauth-authorize-anon-signin-redirect-375-r1.png` — target 3, mobile, same gate

## Scope note for the domain map

This lane closes part of `.claude/knowledge/domain/ucp.md` gap **G1** (org-scoped handoff restore, anonymous side: `CONFIRMED` — correctly redirects to sign-in with `reauthenticate=1`, does not leak or 500). The signed-in completion of that same flow is still open; nearest lever unchanged (a persistent-profile login as the exact fixture buyer, or a Playwright `--secrets` lane).


---

## Citation correction (orchestrator, 5-triage)

This lane originally cited **`PROPOSED-BL-UI-007`** for F1 and graded the axis **FAIL (blocking)**. Both are corrected here.

- **`BL-UI-007` already exists**, and its rule text opens *"Every interactive control **an admin surface** introduces..."*. It is an Admin-editor invariant and cannot apply to a storefront toast. Proposing a new invariant at an id that is already taken would also have broken the ID citation contract. Worse, had it been written as a bare `BL-UI-007` it would have **resolved** — a ref pointing at a real-but-wrong entry passes `bl:lint` and every other gate, which is precisely the class `/qa-review-tests` Dimension 6 exists to catch.
- F1 is a **storefront focus-management** finding, so its existing home is **`BL-A11Y-001`** (keyboard operability, logical order, visible focus indicator on the accessibility-gated storefront themes — this env runs Coffee, so the gate applies). WCAG 2.4.11 is the standard; no new invariant is needed.
- **Neither F1 nor F2 blocks the ticket verdict.** Both are `BL-A11Y-*`, and on a functional/feature ticket a `BL-A11Y-*` finding is filed **standalone + related at its real severity and does NOT fail 5-verdict** (`skills/qa-test/triage.md` §7a). The axis rows above are therefore FAIL-but-non-blocking: the defects are real and stay at High/Medium, and the ticket is not failed on them.
