# VCST-6451 — Low findings (below the filing floor, not filed)

Env vcptcore (vcptcore-qa) · theme vc-theme-b2b-vue-2.62.0-pr-2627-92b1-92b10c04 · VirtoCommerce.SalesRep 3.1017.0-pr-31-efa5 · 2026-11-03

## L1 — Sales Rep Hub caption wraps at 1280 px in de/fr and breaks row alignment (BL-UI-005) — Low, NEW
- Steps: sign in as @td(SR_REP_PRIMARY.email), viewport 1280×900, open `/de/`.
- Actual: the caption wraps to "Vertriebsmitarbeiter-" / "Hub". The link is 56 px tall against 42 px for its siblings. Its icon centre is at y=68 against y=75 for the other six. The search box shrinks to 117 px. In fr, both "Espace représentant commercial" and the host's "Commande en gros" wrap. No horizontal overflow; en at 1280/1024 and fr at 1920 are clean.
- Expected: icons share a vertical centre within 1 px (BL-UI-005), and the caption does not change the item height.
- Likely cause: the host header-link style allows wrapping (no nowrap or ellipsis). This item's long translations trigger it.
- Evidence: screenshots/r2-c21-de-row-1280-hub-wraps.png, screenshots/r2-c21-fr-row-1280-wrap.png · KB-5E83E458.

## L2 — raw `sales_rep.*` keys flash on a cold non-English load (BL-SR-013) — Low, PRE-EXISTING
- Steps: cold-load `/it/`, `/pt/` or `/pl/company/my-customers/{id}` as the rep.
- Actual: the header link, rail title, breadcrumb and document title show `sales_rep.hub.title` for a few seconds, then translate. Every plugin key does this, not only this one; it matches the PR's "key may flash" note.
- Evidence: DOM snapshot test-results/chrome/page-2026-11-03T14-04-01-053Z.yml · KB-2BA3B152 (confirmed).
