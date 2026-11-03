# Coloured shadows (`shadow-<colour>`) ignore a design's shadow geometry tokens

**Severity:** Low (P3) · **Provenance:** IN-SCOPE, latent (no `shadow-<colour>` usage in client-app; forks/CMS) · **Not filed:** below severity floor
**Found by:** agent, /qa-test FULL round 2 (checklist C-12; 3x B-3) · **Env:** compiled CSS of vc-frontend#2600 @ a4f29534

## Expected
{SPEC} styles README: "a design changes geometry and alpha" of each shadow step.

## Actual
Compiled `.shadow-md`: `--tw-shadow: var(--vc-shadow-md-1, …), var(--vc-shadow-md-2, …)` but `--tw-shadow-colored: 0 4px 6px 0 var(--tw-shadow-color), 0 2px 4px -2px var(--tw-shadow-color)` — the classic geometry is hard-coded for every step, so a design's `--vc-shadow-*` never reaches a coloured shadow. Classic is unaffected (AC-1 holds).

## Evidence
`.fix-workspace/vc-frontend-2600/dist/assets/*.css` rules `.shadow-sm` … `.shadow-xl`

## Fix Routing
vc-frontend `tailwind.config.ts` `tokenizeShadows` — or state the limitation in the README.
