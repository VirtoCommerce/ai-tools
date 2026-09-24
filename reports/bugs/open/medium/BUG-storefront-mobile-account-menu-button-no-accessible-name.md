# BUG: At ≤768px the header account-menu button has no accessible name

## Status: CONFIRMED · axe-core `button-name` (critical), 2 nodes
**Severity: Medium** (P2) · storefront-wide header chrome; the control that opens the account menu is
unlabelled, so a screen-reader user on mobile cannot tell what it does.
**Found by:** `/qa-test VCST-5732` (2026-09-18 round, re-confirmed 2026-09-21) · **OUT OF SCOPE** for that
ticket — pre-existing header chrome, not introduced by the feature. The developer agreed it deserves its
own ticket.
**Archetype:** `RENDER` (accessible name)

**Env:** vcptcore-qa @ theme `2.58.0-pr-2464-2971-2971a77b` · store `B2B-store` · `playwright-edge` ·
**375px** (the defect is viewport-conditional).

## Steps to Reproduce
1. Open `{{FRONT_URL}}` at ≤768px, signed in as any user.
2. The header collapses to a hamburger menu — open it.
3. Inspect the account-menu button, or read the menu with a screen reader / the accessibility tree.

## Expected vs Actual
- **Expected:** the button announces something meaningful ("Account", "My account", the user's name) — the
  sibling Language button next to it does exactly this, pairing an image with text.
- **Actual:** the button has an **empty accessible name** — no text node, no `img` alt, no `aria-label`.
  axe-core reports `button-name` (**critical**) on 2 nodes: `.-mr-4` and `.self-start`.

## Why it is worth a ticket despite being "just" a label
It is the entry point to the whole account area on the viewport where the visual affordance (an icon) is
the only other cue. And unlike most findings on this surface, **axe does catch this one** — so it will keep
appearing in every automated scan of the storefront until it is fixed, adding noise to every future audit.

## Business rule
`WCAG 4.1.2` (name, role, value) · `BL-A11Y-*`.

## Provenance
**PRE-EXISTING / OUT-OF-SCOPE** for VCST-5732 — it does not fail that ticket's verdict
(`close-out.md` §5-verdict.2). Filed standalone so the finding is not lost with the run that surfaced it.

## Fix Routing
`vc-frontend` — the storefront header / mobile navigation component. Single repo, storefront only.

## Evidence
`reports/tickets/Sprint26-19/VCST-5732/screenshots/laneB-calendar-375-default.png` · axe-core 4.9.1
programmatic scan, 2026-09-21.
