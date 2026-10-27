/**
 * sign-in-selectors.ts — the storefront sign-in form's selectors, shared by every script that signs in.
 *
 * A module of constants only: no env load, no I/O. scripts/auth/save-storage-state.ts imports config.js, which
 * exits on a missing CORE variable, so a script that only needs these selectors (scripts/layout/layout-runner.ts,
 * regression/lib/fixtures.ts) imports them from here and keeps working on a checkout without passwords.
 */

// Sign-in selectors (test-execution-preflight.md). Two known data-test-id forms.
export const EMAIL_SELECTORS = [
  '[data-test-id="sign-in-page.email-input"]',
  '[data-test-id="email-input"]',
];
export const PWD_SELECTORS = [
  '[data-test-id="sign-in-page.password-input"]',
  '[data-test-id="password-input"]',
];
export const SUBMIT_SELECTORS = [
  '[data-test-id="sign-in-page.login-button"]',
  '[data-test-id="login-button"]',
];

// The sign-in page now opens on a one-time-code form (email + "Continue"); the password form sits
// behind this link. Observed live on vcst 2026-10-21. Absent on builds that open on the password form.
export const SWITCH_TO_PASSWORD_SELECTORS = ['[data-test-id="otp-email-switch-to-password-link"]'];
