# Root cause — VCST-5903 X5

## Symptom
A `value` made only of zero-width / format characters (U+200B, alone or among spaces) renders the ready-state figure row (37.5 px, visually blank, or only the `valueSuffix` unit) instead of the dash. An `errorText` of only U+200B takes the error branch: figures hidden, alert icon with a blank message, and the screen-reader status reads `"<label>: ​"`. Evidence: `evidence-index.md` rows 1a–2b.

## Lowest failing layer — proven
Frontend, UI-kit component, client-side only. No network request participates in the render (`network/X5-run2-network.log`); the Controls value reaches the component unchanged (control char codes = rendered char codes, rows 1a/2a).

## Mechanism (source, `bfe0b259`)
`client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue`
```ts
90  const hasValue = computed(() => !!props.value?.trim());
91  const hasError = computed(() => !!props.errorText?.trim());
```
`String.prototype.trim()` removes only ECMAScript WhiteSpace + LineTerminator. U+200B ZERO WIDTH SPACE is category Cf (format), not White_Space, so `"​".trim()` is `"​"` (length 1, truthy). Verified in Node: U+200B/200C/200D/200E/200F/061C/2060 survive `trim()`; U+00A0/202F/3000/FEFF do not. Then:
- `hasValue` true → line 28 `v-else` branch renders `{{ value }}` (invisible glyph) + suffix → blank row / lone unit.
- `hasError` true → line 17 error branch; line 97 interpolates the raw `errorText` into the status.

## Introduced by
The VCST-6427 fix in PR #2568 (moved the guard from a truthiness check to `trim()`). It closed the ASCII-whitespace case (control row C passes) but the guard is still a whitespace check, not a "has visible content" check. Not a regression of shipped behaviour — the component is unreleased.

## Alternatives ruled out
| Alternative | Why ruled out |
|---|---|
| By design | The PR body and the prop docstring promise a dash whenever there is no value, "so a blank figure can't read as a value" {SPEC}. A row that renders nothing visible is exactly that blank figure. No doc/AC scopes the promise to ASCII whitespace. |
| Data drift / stale build | No data involved (Storybook). Same preview bundle `iframe-D_mlhHPT.js` as Round 2; control row C proves the trim fix is deployed. |
| Storybook-only artefact | The Controls channel delivers the string verbatim (char codes match); any consumer passing the same string gets the same render — the logic is in the component, not the story. |
| Tool-injected input | U+200B was entered by keyboard insertText and by Ctrl+C / Ctrl+V clipboard paste; no evaluate wrote state. |

## Realism (plain statement)
Low. `Intl.NumberFormat` never yields a string made only of zero-width characters, and the component has no consumer yet (PR #2568 touches only the UI kit, stories, tests, locales and llms docs). The plausible routes are: (1) CMS / rich-text / localized strings — editors and copy-paste from web pages and Word commonly carry U+200B, U+200C/D or U+FEFF, and an "empty" CMS field can hold one; (2) RTL formatting — `Intl` output for he-IL / ar-EG wraps figures in U+200F marks, so a consumer that builds `value` from a template like `${mark}${amount ?? ""}` produces a marks-only string that `trim()` keeps; (3) errorText from a backend message that is empty apart from such a character. All need an upstream bug or an unusual composition first.

## Confidence and routing
HIGH. Owning layer: storefront UI kit. Repo: `VirtoCommerce/vc-frontend` (repoKind `frontend`), file `client-app/ui-kit/components/organisms/stat-widget/vc-stat-widget.vue:90-91` (and the status interpolation at :97). Fix shape for the developer to decide: a blank test that also ignores format characters, e.g. `/^[\s\p{Cf}]*$/u` (U+200B, 200C–200F, 061C, 2060 and FEFF are all `\p{Cf}`).
