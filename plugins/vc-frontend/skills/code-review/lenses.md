# Review lenses

Each section is a brief for one subagent. Give it verbatim. Every lens shares the "Not a finding"
list at the end of this file, plus its own.

## correctness

Does the changed code do what it means to, in every state the UI can reach?

- Loading, empty, error and partial-data states; reactivity that never re-runs (a value read once in
  `setup`, a `watch` without `immediate`, a `computed` over a non-reactive source).
- Races: overlapping requests, a response for a previous route or input applied to the current one,
  double submit.
- Null and undefined from GraphQL fields that are optional in the schema.
- Edge values: zero, negative, very long text, empty lists, the last page.

Not a finding: a defect that needs inputs the types or the backend cannot produce.

## consumers

The change is safe for every place that uses the changed code. You get the consumer list.

- For each consumer: does it pass props, listen to events, use slots, read return values or CSS
  custom properties that changed meaning, default or shape?
- Removed or renamed export, prop, emit, slot, CSS variable or i18n key: who still uses it?
- Visible outside the repository (ui-kit, `core-api` facade, `shared/*/index.ts`, extension points):
  would a plugin or a fork that uses the public API as documented break? Name the usage.

Not a finding: a consumer that already behaved the same before the change.

## architecture

The code sits in the right place and does not bend the structure others will copy.

- Layers import only to the left: `ui-kit` ← `core` ← `shared` ← `modules` / `pages`. A module reaches
  the host only through its `init()` and the extension registry.
- New files: right layer, right domain folder, exported through the folder's `index.ts` when other
  domains need them, not when they don't.
- A new pattern, convention, key format or registry: would three more copies of it be good?
- GraphQL: one operation per folder with its `useXQuery` wrapper; generated `types.ts` untouched.

Not a finding: a layout preference with no rule or consumer behind it.

## design

Responsibilities and coupling of the new or reshaped code.

- One component or composable doing two jobs that change for different reasons.
- Reaching into another domain's internals instead of its public API.
- Duplication of something that exists (name the existing composable, helper or ui-kit component).
- An abstraction with one user and no second one in sight; options that only one caller passes.

Not a finding: a style of decomposition that differs from yours but is consistent with the folder.

## conventions

The change follows the repository's written rules. You get the rule files that apply to these paths
and `CLAUDE.md`.

- Report a violation only with the rule it breaks: rule file and the line or section, quoted.
- If the repository has a patterns file (house idioms such as which link or composable to use for a
  job), it counts as a rule file.

Not a finding: anything you cannot quote a rule for. Anything ESLint, Prettier, `vue-tsc` or
dependency-cruiser already enforces.

## security

- Untrusted content reaching `v-html`, `innerHTML`, a URL, `window.open` or a redirect without the
  repository's sanitizer or allow-list.
- Permission checks done only in the UI for something the backend must enforce; a check that reads
  the wrong organization, role or user.
- Tokens, user data or PII written to logs, analytics, `localStorage` or URLs.
- CI: workflow changes that run untrusted PR code with secrets, `pull_request_target`, unpinned actions.
- The plugin boundary: something exported through `core-api` that hands plugins more than they need.

Not a finding: a theoretical attack with no input path from a user, a URL, CMS content or a plugin.

## commerce

Money and orders.

- Prices, totals, discounts and taxes: formatted from the backend's money objects, never recomputed
  in floating point; currency and culture from the store context.
- Cart state: optimistic updates rolled back on error; quantity changes that can overlap; the cart
  shown after a failed mutation.
- Checkout: a step reachable with incomplete data; a double "place order"; payment results handled on
  every return path (success, failure, cancel, reload).
- B2B: contract prices, company and role restrictions, purchase limits respected where shown.

Not a finding: a pricing rule the backend owns and the frontend only displays.

## styles

Does every changed template and style follow the design system, so it survives a preset switch, dark
mode, RTL, every design and a fork's one-class override? Any `.vue` template or `<style>`, `.scss`,
design, preset or Tailwind config, inside `client-app/ui-kit` or outside it. You get `styles.md`,
`ui-kit.md`, `markup.md`, `designs-and-presets.md` and `client-app/assets/styles/README.md`: where a
check names a rule, read the rule for the detail. Most often needed first:

- Kit component restyled from app code, by any route (`ui-kit.md` §9–11, `styles.md` §10, §42): a
  `.vc-*` selector, a class on `<VcX>` setting what VcX owns, a kit private variable read or set
  (`--px`, `--size`), JS or tests that query `.vc-*` internals. Name the prop, slot or `--vc-*` token
  from the component's source that does the job.
- Hand-built UI the kit already has (`ui-kit.md` §1): name the component. Also a re-implemented kit
  composable, and money formatted in the client (`toFixed`, `Intl.NumberFormat`).
- BEM block (`styles.md` §6–8): one block, named after the file; the bare block class on the root,
  on `<VcModal>` / `<VcWidget>` itself when that is the root; a second top-level block is a component.
- All-or-nothing (`styles.md` §1.2): no utilities in a BEM template, child `Vc*` components and the
  root included; no partial BEM block in a utility-only template.
- An element belongs to its block (`styles.md` §6, §9–10): no `other-block__el` in this markup, no
  element of an element, no split names; an element with elements of its own, or a region with its
  own state and events, is a component to extract.
- States captured, never typed out again (`styles.md` §11, §13): `.block--mod .block__el`, `&--a &__b`,
  `#{$self}--mod`, the same declarations under several modifiers (one private variable, or `@each`), a
  hover that outranks the active state (`&:not(#{$active}):hover`), a bound modifier or an enum
  template-literal value with no rule.
- Restated styling (`styles.md` §32 and beyond): a utility or declaration that changes nothing, a
  colour the parent or kit already sets, a fallback equal to the token's own default, a declaration
  repeated in a wider `@media` of the same rule, an element or modifier that duplicates an existing
  one. A duplicate usually hides the real cause: name it.
- Colour (`styles.md` §25–27, §31): palette and semantic tokens only. Links `text-[--link-color]` with
  `hover:text-[--link-hover-color]`, not `text-primary` / `text-accent-*` and not `hover:underline`.
- Contrast (`styles.md` §29 and beyond): a new text/background pair keeps 4.5:1 for small text in every
  preset, light and dark, hover and selected fills included (neutral-500/600 on a hovered row, danger
  text on a danger fill). Name the pair and the preset, or put it under `Needs a run`.
- Modifier and element names (only partly in `styles.md` §9, §11): an enum modifier carries its axis
  (`--size--md`); a boolean one names a state that is true (`--read-only`; not `--with-x`, not
  `--hidden` on something still visible); a whole-component state is one root modifier, not a class on
  every child; an element with many modifiers is several elements; a class on a kit child names its
  role.
- Selector shape (only the tag-chain part is in `styles.md`): a compound nests as `&.other-class`, not
  a top-level `.block.other-class`; different elements are not grouped (`&__a, &__b {}`); no bare tag
  selectors inside a block (`li`, `dt`, `b`), give the element a class; no `:has()` for state the
  template knows, use `v-if` or a modifier.
- Markup weight (written only here): a new `<div>` with no class, handler or layout job goes (or is a
  `<template>`); a kit component offers a slot instead of a wrapper div; a component keeps one root so
  `$attrs` and the block class fall through; a label that is not prose is not a `<p>`.
- RTL, type, radius, spacing (`styles.md` §30, §33–35, §37–41): logical sides (`space-x-*` included),
  scale sizes, classic's loaded weights, headings via `VcTypography`, `rounded-[--vc-radius]` across
  the whole PR, rem, `gap`, a simple stack as `flex flex-col gap-*`, z-index above 50 with a reason.
- Responsive (`styles.md` §16, §19–24): no breakpoint variants in `@apply` or a BEM template; a layout
  switch is a theme `@media` or `@container`, not a `--desktop` modifier or a `(pointer: coarse)` /
  `(hover)` query; both layout paths changed together.
- Long text (`styles.md` §36 and beyond): names, labels, button text and headings that can be long
  truncate or wrap without breaking the layout at 320–375px; `truncate` in an auto-layout table grows
  the table, not the cell; sibling cells get the same truncation and `:title`; a number never breaks
  mid-figure.
- Skeletons (written only here): a changed `*-skeleton.vue` matches its real card: the same wrapper
  props (`shadow`, `compact`), one line box per text zone with the real text's size and line-height
  pair (not Tailwind's default `leading-*`), no extra gaps, built from `VcWidgetSkeleton`, kept simple;
  the page shows it during a refetch too, not only on first load.
- Kit look props (`ui-kit.md` §3, §9): no deprecated variant values, even when they render; the variant
  draws what the linked design shows (a text button is `ghost`, `surface` paints a plate); a
  placeholder passes the same look props as the card it stands in for.
- Touch and focus (`styles.md` §43–44 and beyond): a control shown only on `:hover` (`opacity-0`) is
  invisible but tappable on touch, it needs `@media (hover: none)`; an icon-only target is at least
  24×24 (`hit-area`); no focus removal; new motion under `prefers-reduced-motion`.
- Where a style lives (`styles.md` §1.4, §45; README "Where does my change go?"): dark fixes in
  `assets/styles/dark/**`, registered in the right file; kit print in `assets/styles/print/**`,
  `@media print` inside the block rather than `print:hidden` in a BEM template; no `html.dark` in an SFC;
  nothing added to `_custom.scss`.
- Designs and presets (`designs-and-presets.md` §1–8): token first, never a private variable; a block
  file styles only its block and restates every state. Beyond the rules: a design value is written out,
  not `var()` of another component's token (a fork retuning one would move the other); a design with
  its own shadow does not keep classic's `theme("boxShadow.md")`; a dark token never equals the page
  background.
- Changed or removed tokens: for each `changed` or `removed` entry in the classification's `tokens`
  list (name, change, defining files, users, ui-kit users, Tailwind), check every user in classic and
  each folder in `client-app/designs/`, every preset in `assets/presets/index.ts` with its
  `.dark.json`, and every state of each kit user (variant × colour, hover, checked, disabled, focus). A
  removed or renamed token is breaking for forks and for plugins on the core-api Tailwind preset even
  with no user left here: alias it per `ui-kit/DEPRECATION.md`, list it under Breaking changes.
- New tokens: today's value as the fallback so classic computes the same, read somewhere, and set for
  every state that draws that part; a state that sets the same property with a literal leaves it
  half-done.
- Removed, renamed or moved BEM classes, elements and modifiers (`styles.md` intro), a class moved to
  another node included: a fork's override stops matching silently. Ask for an old → new line under
  Breaking changes in the PR description, not a revert.
- Visual evidence, never run it: for each visual change add a `Needs a run` item saying where a human
  looks: the story or Docs page (`Components/<Layer>/Vc<Name>`, with
  `&globals=design:<design>;themePreset:<preset>;darkMode:dark`) or the app route and widths, which
  Design, Theme preset and dark toolbar settings, and what must look the same or different. For a
  token, list the designs and presets where its value moves.

Not a finding: small edits in a legacy utility-only template (BEM is asked of new components and full
rewrites); anything a rule file lists under Legacy; an element class with no rule (a fork hook);
`min-w-0` / `w-0` on a flex child for truncation; private per-size custom properties; `:has()` where a
library moves the DOM and it names no other block; a hand-built stand-in for a kit organism that lacks
the capability (report only the parts the kit does cover); a colour, variant or layout the design
decided in the PR or its thread; a missing token or kit-caused contrast gap deferred with
`TODO(VCST-NNNN)` and a ticket (a bare TODO is a finding); preset JSON keys left out where
`_colors.scss` or `_ui-kit-tokens.scss` has a fallback; mobile and desktop markup kept separate as on
the page it was copied from; names of breakpoint booleans; a table's own mobile breakpoint; Tailwind
class names in page-builder settings JSON; utility classes in story templates, unless the class does
not exist; a CSS `text-transform` in place of a JS transform that gives different text; `!important`
and blank lines between tags (`check:css-important`, ESLint).

Obsolete, never ask for: moving, resizing or recolouring SVG icon files (icons are a bundled set);
`text-[--color-accent-600]` or `text-[color:var(…)]` for links (now `--link-color` and palette
classes); `&:focus` styles instead of the global `*:focus-visible` ring; components that no longer
exist (`VcSectionWidget`, `VcCardWidget`, Font Awesome icons).

## ui-kit

A change under `client-app/ui-kit` is public API. Forks override its tokens and classes and merge every
change; Module Federation plugins render its components, all globally registered, some also typed
through the `core-api` facade. Judge each change by what a fork or plugin that uses the kit as
documented sees after upgrading. You get `ui-kit-internals.md`, `ui-kit.md`, `styles.md` and
`client-app/ui-kit/DEPRECATION.md`.

- Contract: props (name, type, default), emits and payloads, slots and slot props, `defineExpose`, the
  `Vc<Name>*Type` types, `--vc-*` tokens, BEM block, element and modifier classes, and the element each
  class sits on. List every one the diff adds, removes, renames or changes in meaning.
- Removed or renamed without the deprecation cycle (`ui-kit-internals.md` §6–7, `DEPRECATION.md`): a
  prop, value, slot, event or component stays with `@deprecated`, a normaliser and a dev warning; a
  token is aliased in its successor's fallback. Otherwise it is breaking.
- Breaks the types do not show: a class moved to another element or under a new wrapper, a dropped
  modifier, a new meaning for an existing prop value (`max={0}`), an emit with a new payload or timing,
  a slot rendered in fewer cases, a new wrapper that breaks a fork's child selector or `$attrs`
  fallthrough.
- Breaking changes note: every item above, and every changed default, is listed old → new under
  "Breaking changes" in the PR description. Ask for the note, not a revert. Without a PR description
  to read, put "check the PR body" under `Needs a run`.
- Defaults (`ui-kit-internals.md` §1): a changed default size, padding, colour, cursor or variant moves
  every screen and every fork; it needs the designer's agreement and the developer's instruction in the
  PR description. A usage that passes no new prop renders exactly as before.
- Trigger (`ui-kit-internals.md` §1): every changed kit hunk has a consumer in this PR that needs it.
- New prop names (written only here): named by role, not by look (`strong` names a look); in the kit's
  existing vocabulary, so check other components' `IProps` for the same idea (`description`, not
  `sub`; `size`, `variant`, `color` with the canonical values in `ui-kit.md` §3); a boolean that picks
  a look is an extendable string union (`variant: "search" | "icon"`); a name says what it does
  (`hideValue`, not `viewValue`); a size union offers only sizes the design has.
- Reach: a new prop, slot or token works on every path the component renders (each slot-driven
  layout, mobile and desktop, every variant). Name the path where it silently does nothing.
- New tokens (`ui-kit-internals.md` §5–6): `--vc-<comp>-…`, resolved prop → public → global →
  literal, today's value as the literal; read somewhere; not pinning a related value; set for every
  state that draws that part (hover, checked, disabled, dark). A replacement token falls back to the
  old one.
- Defaults in styles (written only here): visual defaults come from CSS (`--props-*` with a CSS
  fallback), not JS computeds that pick sizes or classes; an unknown enum value falls back to the
  default (`ui-kit-internals.md` §8).
- Generic (`ui-kit-internals.md` §3; the rest written only here): no `$cfg`, `Logger` (use `console`),
  `@/core` / `@/shared` / `@/modules` imports or core types. App behaviour (show more, list expansion,
  routing, data loading) and outer layout on the root (margin, width, `flex-1`) stay in the consumer.
- Kit-to-kit (`ui-kit-internals.md` §10): no selector, utility or JS naming another kit component's
  class (`.vc-dialog-header__close` in a focus helper) unless the PR description rules out each
  alternative and a comment names the other component.
- Kit styling (`ui-kit-internals.md` §5): block `vc-<name>` = file name, `vc-x--size--md` modifier
  shapes, variant × colour matrices through `@each`, variant colour tokens in `_ui-kit-tokens.scss`,
  dark in `assets/styles/dark/<layer>/`, print in `assets/styles/print/<layer>/` (no `print:` in kit
  templates), `focus-ring` and `hit-area` mixins.
- Structure: no wrapper or overlay nothing needs (an overlay that forces `isolate` or a z-index); a slot
  rather than a wrapper div; a slot for icon content where callers will want their own icon.
- Text (`ui-kit-internals.md` §4): labels and `aria-label`s from `ui_kit.*` keys in every kit locale.
- Files (`ui-kit-internals.md` §2, §9): `vc-<name>.types.d.ts` with global `Vc<Name>*Type`, the export
  in `<layer>/index.ts` and the `GlobalComponents` entry in `<layer>/types.d.ts`; `defineExpose` only
  for imperative needs, typed.
- Stories (`ui-kit-internals.md` §2, §7; the format is written only here): a new component has a story
  and a new prop, value or slot appears in one; `StoryObj`, not `StoryFn` or `Template.bind`; every
  story has `parameters.docs.source.code` with real usage, so "Show code" shows how to use it; the
  title's layer (`Components/Atoms|Molecules|Organisms|Templates`) matches the folder; no per-design
  story; a deprecated component's story is tagged `deprecated`.
- Facade contract: when the component, its types or a kit utility is re-exported from
  `client-app/core-api/index.ts`, a change to its props, emits, slots or exported types changes
  `client-app/core-api/contract/index.d.ts`, which the PR regenerates (`yarn build:core-types`) and
  commits; a breaking one also bumps the facade (`yarn bump:core`) and the `@vc-frontend/core` range in
  `federation.mjs`. Put `yarn validate:core-types` under `Needs a run`.
- Visual evidence, never run it: under `Needs a run`, name the component's Docs page and stories, the
  Design, Theme preset and dark toolbar settings
  (`&globals=design:<design>;themePreset:<preset>;darkMode:dark`), and the states to look at (each
  variant × colour, hover, focus, disabled).

Not a finding: anything a rule file lists under Legacy (existing `@/core` imports, existing
cross-component selectors); private per-size custom properties a component shares across its parts; an
element class with no rule; a preset JSON with no key where `_ui-kit-tokens.scss` has a fallback; dark
styles for a new variant deferred to a named follow-up task; a kit gap deferred with `TODO(VCST-NNNN)`
and a ticket; consumers in this repository (the `consumers` lens).

Obsolete, never ask for: SVG icon file hygiene (icons are a bundled set); `&:focus` rules on kit
controls (the global `*:focus-visible` ring covers them).

## ui

Accessibility and i18n of changed templates and messages.

- Accessibility: names for controls and icons, focus moved and returned in dialogs and menus, roles and
  `aria-*` that match behaviour, keyboard operation.
- i18n: user-visible text through `$t`, no concatenated sentences, plural forms, new keys in `en.json`.

Not a finding: styling, colour and contrast (the `styles` lens); a visual choice a design document
made.

## tests

Only for changed test files.

- Assertions removed, loosened (`toBeTruthy` for a value), or rewritten to match new behaviour without
  the behaviour change being intended.
- A test that cannot fail: mocks the unit under test, asserts on the mock, or never awaits.
- Cases deleted without the code path being deleted.

Not a finding: missing tests in general.

## trivial

One cheap pass over the R0 files: tests, stories, docs, locales, assets, a version bump. It checks
that they really are trivial and catches what hides there.

- Tests: assertions removed or loosened, cases deleted, expectations rewritten to match new
  behaviour, `.only` / `.skip` left in, snapshots updated together with a behaviour change.
- Locales: a removed or renamed key still referenced in code (`git grep` the key), a key added to
  `en` only, placeholders (`{count}`, `{name}`) or plural forms that differ between languages, a
  message whose meaning changed while its key stayed.
- Stories and docs: examples that use a prop, slot, event or token the change removed or renamed.
- Anything in these files that is not trivial after all (a test helper or fixture that production
  code imports, a JSON file read at runtime): say so and name the tier it should have.

Not a finding: wording, translation style, story layout.

## clean-code (on request)

Naming that misleads, dead code the change left behind, functions that grew past understanding,
comments that describe history instead of the code.

Not a finding: anything the written rules or ESLint already cover; taste.

## performance (on request)

Apollo queries that over-fetch or bypass the cache, watchers that refetch in loops, large reactive
objects that should be shallow, synchronous imports of heavy code on the critical path.

Not a finding: a cost you cannot tie to a user-visible path.

## Not a finding, for every lens

- Code the change did not touch, and defects that existed before it (check `git show <merge-base>:<file>`).
- Conformance to a ticket's acceptance criteria, or behaviour the ticket prescribes.
- Questions to a product owner or designer.
- "Add a test" with no defect it would catch.
- Anything a linter, formatter or type check in the repository enforces.

Authors here rejected these again and again; do not raise them:

- Naming, renames, formatting, attribute order, handler syntax, `void` vs `await` on router calls,
  missing type annotations, "magic number → constant".
- "Add a null check" or "remove `!`" without a concrete path that makes the value null.
- Races or states the code cannot reach: sub-millisecond windows, props outside their declared union.
- Behaviour the PR describes as intended, or a design decision the author explained.
- DRY or reuse when the existing piece does not fit the case.
- Performance micro-costs with no user-visible effect.
- Security-scanner patterns in `scripts/`, test fixtures and sanitizer tests; mutable tags on the
  organization's own GitHub actions; `target="_blank"` on a locally created blob.
- Version-compatibility warnings on `backend-packages.json` bumps, translation quality of non-English
  locales, "remove unused field" on a mutation result.
- Requests to split a PR, or failing end-to-end runs not tied to the diff.
