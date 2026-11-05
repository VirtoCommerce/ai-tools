# BUG: MFA widget: focus drops to the page body after Cancel or a correct code, and "code sent" is not announced — `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: BL-A11Y on a feature ticket → its own ticket, does not fail VCST-6597. Operator chose: draft only, named under Suggested separate tickets

## Summary
On /account/security (and /company/info), the Turn on/off button is unmounted while the code step is open, and nothing restores focus when the step closes: keyboard focus lands on the body (BL-A11Y-001, WCAG 2.4.3). The initial "code sent" is not announced: the step's live region is empty when it mounts and is created and destroyed with the step (BL-A11Y-004, WCAG 4.1.3). The outcome toast IS announced (notifications host, polite region).

## Steps to reproduce
1. CustomerChoice store, a confirmed customer, /account/security
2. Keyboard: Tab to Turn on, Enter: focus moves into the code field; the "code sent" subtitle is not live and not linked to the field
3. Enter a correct code, or press Cancel: document.activeElement is the body; the next Tab goes to the footer (4/4)

## Expected
After the step closes, focus returns to the Turn on/off button or the status; the code-sent message is announced (BL-A11Y-001, BL-A11Y-004).

## Root Cause Analysis
vc-frontend mfa-settings-widget.vue L3, L136-138 (button unmounted while challenge), L180-193 (no focus on success); useMfaSettings.ts L126/L138-139; sign-in-code-form.vue L3-4, L19, L92 · same focus pattern on the passkey widget (KB-26E71681) · investigations/C-34/ · KB-1CCD2E8C

## Fix Routing (→ /qa-fix)
Layer: storefront · Repo: VirtoCommerce/vc-frontend (PR #2622) · repoKind: frontend · Confidence: MEDIUM
