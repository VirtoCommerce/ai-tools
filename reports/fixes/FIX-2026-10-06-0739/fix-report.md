# FIX VCST-6176 — Returns icon outline

- Repo: VirtoCommerce/vc-frontend (frontend), base dev, branch claude/qa-autofix/VCST-6176
- PR: https://github.com/VirtoCommerce/vc-frontend/pull/2544 (labels bug, claude-code-assisted; reviewers Andrew-Orlov, ivan-kalachikov, vkrashenko, vas11yev1work)
- Change: icon-aliases.ts `"receipt-refund": "undo-2"` (glyph chosen by reporter in ticket comment)
- G2 RED / G3 GREEN: new modules/returns/menu.test.ts (VcIcon mount, vc-icon--outline) — red before, green after; icons.test.ts + vc-icon.test.ts 35/35; eslint + vue-tsc clean
- G4: frontend-reviewer APPROVE (HIGH)
- G5: Sonar/CodeQL/Semgrep/OSV green; `ci` in progress at report time
- G6: needs deploy verification (visual)
- Jira: In review; one combined comment 111470 (embeds the ticket's existing screenshot; new screenshot could not be uploaded — device shell has no route to atlassian.net)
- proof_medium: rendered-DOM (jsdom VcIcon mount); proof_provenance: new test; proof_linkage: menuItems + button icon name; g2_proxy: false
