## Root-Cause Worksheet — VCST-6077 F-6

1. **Symptom:** the Notes field in New task and Edit task has an empty accessible name (WCAG 1.3.1 / 4.1.2).
2. **Layer:** the shared vc-frontend ui-kit component `VcTextarea`, so every labelled VcTextarea is affected.
3. **Evidence:** the DOM on both builds (evidence-index) and the source lines cited there.
4. **Why:** VcTextarea binds `for`, which falls through as a plain attribute, instead of VcLabel's `for-id` prop, so VcLabel renders a `<div>`. `aria-labelledby` also points at the textarea's own id, so the name is computed from the field's own (empty) content.
5. **Alternatives ruled out:** *Introduced by PR 2536*: no. Neither the modal nor VcTextarea is in the PR, and the baseline is identical. *Snapshot artefact*: no. `textarea.labels` is empty and there is no aria-label.
6. **Regression:** none observed.
7. **Confidence:** HIGH.
8. **Fix routing:** vc-frontend (`frontend`), `client-app/ui-kit/components/molecules/textarea/vc-textarea.vue`: pass `:for-id="componentId"`, and drop the self-referencing `aria-labelledby` (or point it at the label's id). **Provenance: PRE-EXISTING / OUT-OF-SCOPE** for 6077.
