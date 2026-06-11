---
name: vue-fix
description: "[Development] Implement a minimal, idiomatic Vue 3 / TypeScript fix in the vc-frontend storefront that turns the reproduction test green while preserving BL-UI invariants and component contracts and leaving existing tests/stories untouched. Used by the fullstack-frontend developer agent in /qa-fix (Gate 3)."
---

# /vue-fix — Implement a minimal Vue 3 / TS fix in vc-frontend

Turn the red reproduction test (`/vue-unit-test`) green with the **smallest correct change**, then pass
the typecheck + lint + test (+ build) gate. This is **Gate 3** of `.claude/rules/quality-gates.md`.

## Preconditions
- Source checked out in `.fix-workspace/vc-frontend/` on branch `claude/qa-autofix/VCST-XXXX` (base `dev`).
- A NEW failing vitest test exists (Gate 2) or trivial-skip is justified.

## Steps
1. **Understand the seam** (route/page → component → composable → store → GraphQL → util). Confirm the
   real root cause, not a symptom. **Rule out `$cfg` config-gating** (a flag-dependent symptom is config,
   not a code bug → BAIL to G0). See `.claude/agents/knowledge/vc-frontend-architecture.md`.
2. **Implement the smallest correct change** to product code only. See `vue-fix-patterns.md` and
   `vue3-best-practices.md`. Match the file's existing style (`<script setup lang="ts">`, Composition
   API, `defineProps<…>()`/`defineEmits<…>()`). Two build-hygiene facts that bite:
   - **ESLint runs error-level** (vue + ts + sonarjs + tailwind + a11y, flat config) — a new lint error
     in your fix **fails CI**. Fix the warning; never disable a rule or edit `eslint.config.js`.
   - **`vue-tsc` typecheck is strict** — a new type error fails CI. Type it correctly; don't `@ts-ignore`.
   - **No dependency / `yarn.lock` change**, no formatting churn, no edits to generated
     `core/api/graphql/**/types.ts`.
3. **Green — fast inner loop first** (repro test only), then the affected suite:
   ```
   npx vitest run -t VCST-1234            # the repro only
   npx vitest run path/to/the.spec.ts     # the affected file's suite
   ```
   Repro test passes; **ALL pre-existing tests/stories still pass and are UNMODIFIED**.
4. **Gate — full verification** (all must pass), per `REPO_PROFILES.frontend`:
   ```
   yarn typecheck || npx vue-tsc --noEmit
   yarn lint      || npm run lint
   yarn test:unit || npx vitest run
   yarn build     || npm run build      # run if the change could affect the build; skip only for trivial, well-covered changes (say so)
   ```
   The repo's PR CI also runs a **SonarCloud quality gate** (G5) — keep the changed lines clean (no new
   bug / vuln / unreviewed hotspot; no unhandled null, unawaited promise, swallowed error, missing i18n
   key) and cover the new code so **new-code** thresholds hold. Self-review for it now; re-confirm at G5.
5. **Self-scan the diff** (`git diff`) for accidental churn — formatting, auto-import reordering,
   unrelated files, `yarn.lock` — then hand it to `frontend-reviewer` (Gate 4) before any PR is opened.

## Hard rules (a violation = STOP, not "push anyway")
- **Single repo.** All changed files in `vc-frontend` (the in-repo `client-app/ui-kit/` is single-repo).
  Root cause in a separately-published design-system package → cross-repo → STOP
  (`ROOT_CAUSE: belongs in <package>`).
- **Minimal diff.** No refactors, no dep adds/upgrades, no `yarn.lock` changes, no formatting churn, no
  unrelated files.
- **Never modify/delete existing tests or stories** — only ADD. An existing test going red = contract
  conflict → STOP.
- **No breaking changes.** No public GraphQL query/contract change; no shared-component **prop / event
  (`emits`) / slot** API change; no router-contract change. Any of these → STOP (Gate 0 boundary).
- **Never touch** secrets, `.env*`, `yarn.lock`, CI config, `eslint.config.js`/`tsconfig`/Storybook
  config, or generated files.
- **Preserve BL-UI invariants** (`business-logic.md` + `critical-ui-scope.md`). A fix that passes the
  STR but breaks a BL-UI rule or a critical-UI-scope cell is a regression — reject it.
- If the correct fix is unclear or risky → `FIX_STATUS: FAILED`, don't push speculative changes.

## References
- `vue-fix-patterns.md` — common VC storefront fix shapes (reactivity, watch, prop, v-model, i18n, $cfg, GraphQL field, store)
- `vue3-best-practices.md` — modern Vue 3 / TS idioms + build hygiene within a minimal diff
- `.claude/rules/quality-gates.md` — G3 (green), G4 (review), G5 (CI + SonarCloud), G7 (no auto-merge)
- `.claude/agents/knowledge/vc-bug-catalog.md` — don't re-introduce a historical VC-UI-* failure pattern
