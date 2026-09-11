# The UI-kit shape class — what changes when the change IS the design system

**This file is the only place the `ui-kit` shape class is specified.**
[`ticket-routing.md`](../../knowledge/execution/ticket-routing.md) §5c owns the *routing* decision — when the
class applies, what it skips, which axes it defaults ON — and **cites this file** for how to actually run one.
`commands/qa-test.md` cites both and restates neither, the same discipline
[`visual-axis.md`](visual-axis.md) holds for the visual axis.

**The class is a third classifier, orthogonal to FLOW and EFFORT.** It never moves a ticket between paths.
What it changes is the *deliverable* — Artifact A, the `3-cases` gate and `4c`/C1 are skipped, so the
checklist is the run's entire durable output — and the two axes that come on by default.

It exists because a UI-kit change inverts the pipeline's central assumption. Every other ticket is *a
feature on a surface*; this one is **the surface itself**, arriving with no ACs, no owning page, no domain,
and a blast radius that is every consumer of the primitive. The provenance is VCST-5653 (*"[UI-Kit] Focus
indicators — WCAG 1.4.11 / 2.4.7"*, vc-frontend PR #2468): 44 files, a replaced focus-ring mechanism, four
**removed public custom properties**, and an AC field that read *"1. No requirements."*

---

## 1. Design the matrix on the CARRIER, not the component

**The discriminating axis of a kit change is the code path that delivers the behaviour, not the widget the
user sees.** Enumerating components is the intuitive move and it is wrong: a dozen components can share one
carrier (so a dozen rows prove one thing), while a single component can route through a carrier nothing else
uses (so the row that matters is missing).

VCST-5653's five carriers — every one a distinct path to the *same* ring:

| Carrier | How the behaviour arrives |
|---|---|
| element-level | the element itself `@include focus-ring` |
| native sibling | `input:focus-visible + &` — the real focus target is not the painted one |
| global fallback ONLY | the component **deleted its local rule and added none**; only `preflight.scss` remains |
| unconditional | applied on a state attribute (`[aria-pressed="true"]`) rather than on focus |
| **no carrier reachable** | the ring lands on a `display:none` span — a focus stop that paints nothing |

Reduce **carrier-first, then exhaustively on preset × mode**: 9 axes and 2880 raw cells became **21
scenarios** that way, because the carrier is the only axis on which no value collapses into another. All
carriers are mandatory rows. The last one is the reason the rule earns a section — *"no carrier reachable"*
is invisible to any component-shaped matrix, and it is a real defect class.

## 2. Derive the oracle from source BEFORE any browser opens

The whole of VCST-5653's contrast finding — 88 preset × mode × surface cells, **7 failing 3:1** — was
reachable by arithmetic from `client-app/assets/presets/*.json` at the PR sha, before a single page loaded.
The browser's job was to *confirm* it, and it reproduced the derived 2.97 exactly.

This is [`.claude/rules/test-data.md`](../../rules/test-data.md) §GOLDEN RULE applied to a visual oracle:
**if a value has a source of truth, compute it from there.** Do not transcribe a palette into a test, and do
not discover by browsing what a file already states.

**Cross-check the derivation against at least two independent implementations** before trusting it — a
standalone WCAG implementation, the repo's audited `COLOR_MATH_JS` in `scripts/lib/measure-layout.ts`, the
live measurement, the PR author's own declared figure. A derived oracle that agrees with nothing is a
hypothesis wearing a number. Record what agreed, to how many decimals, in `summary.json.derived_oracle`.

**Sweep the derived viewports, not one.** `BL-UI-002`'s own Verify clause is the template — *never hand-list
the allowed values, and run at the derived `AUDIT_VIEWPORTS_PX` sweep, because some breakpoints introduce
token overrides.* That clause is not spacing-specific: VCST-5653's mobile-menu 2.97 reproduced **only at
≤500 px**, so a derivation confirmed at one width would have cleared a real failure. Both constants come
from `scripts/lib/design-tokens.generated.ts` via `npm run tokens:sync`.

**This is still a discipline, not a gate** — `docs/repo-findings-backlog.md` B-32 proposes extending
`npm run tokens:sync` to carry each preset's accent / region / `primary_50` values and assert ≥3:1 for the
gated presets, enforced by `npm run tokens:check`.
[`contract-refresh.md`](contract-refresh.md) frames `tokens:sync` as the cheapest of the repo's three
freshness gates, which is the argument for putting the assertion there rather than in a new script. Until it
lands, the derivation is the run's own work — and the failure it prevents is already a known edge case
(`e-commerce-edge-cases-library.md` §1.5, *"Audit tool hardcodes a stale grid"*: a script embedding its own
copy of a scale flags conforming components after a design refresh).

## 3. Only the gated presets are in scope — and every run carries a negative control

Coffee and Red are the WCAG-gated themes; a failure on `purple-pink`, `watermelon` or `black-gold` is
**known-unsupported, informational, never a bug**
([`vc-bug-catalog.md`](../../knowledge/oracles/vc-bug-catalog.md) §VC-UI-001). Report it under that id and
move on — filing it is noise, and silently dropping it hides a real datum.

**Pair the run with a deliberate negative control on an ungated preset.** A UI-kit pass is mostly
confirmations, and a confirmation-shaped run cannot tell *the check passed* from *the check never ran*. An
ungated preset has a known failing value; if the harness reports it clean, the harness is broken. This is
the false-green scenario, and on this class it is mandatory rather than nice to have.

## 4. The preset applies by ASYNC DYNAMIC IMPORT — poll before asserting

A capture taken immediately after a preset switch **silently audits the previous preset**. Every check must
poll until the token actually resolves before it asserts, and in Storybook the same applies to
`?globals=themePreset:<name>;darkMode:light`.

The failure mode is the dangerous one: it produces a **green** result that describes the wrong subject.
Combined with §3's negative control, this is the whole defence — polling makes the measurement right, the
control proves a measurement happened at all.

## 5. The theme preset is SHARED MUTABLE CONFIG — serialize the window, verify the restore

Switching the store's active preset is a durable write to shared state on a shared environment. It is not a
fixture and it does not clean itself up.

- **Operator-gated.** Ask before the switch; never assume the environment is yours.
- **Admin SPA click-through only** — no REST store PUT. A whole-entity PUT replaces the entity, and a store
  with nulled defaults is a broken storefront.
- **One serialized window.** Open and close it inside a single phase. Never run another preset's scenarios
  concurrently, or both sets observe the wrong preset — the §4 failure at run scale.
- **Verify the restore from two independent sources**, not one: the Admin field reads back the original
  preset *and* the storefront resolves the original token value.
- **Record the window** — what changed, who authorised it, the method, the duration, and that it was
  restored — in `summary.json`.

## 6. Dual target: Storybook AND the storefront

[`visual-axis.md`](visual-axis.md) §2 already routes a storefront *component* to both surfaces because they
catch different bug classes. On this class the reason is sharper: **Storybook has a documented history of
lying about exactly this.** PR #2468's own diff fixed a `storybook-styles/preflight.scss` that had been
*silently deleting the focus rule* — so a clean Storybook result on a focus change was, for some period,
evidence of nothing.

Treat neither surface as the other's proxy. And remember the hosted Storybook is a **production build**
(`import.meta.env.DEV === false`); a dev-only affordance is not there to find. Methodology:
[`qa-storybook/SKILL.md`](../qa-storybook/SKILL.md), whose §Boundary with `/qa-accessibility` also settles
which of the two owns a finding — reproduces in a story ⇒ Storybook; only once composed into a page ⇒
accessibility.

## 7. The checklist is the ONLY durable record, so a blank row is a defect

With Artifact A skipped there is no case corpus to fall back on and no `4c` run to point at. Everything this
run knows is in [Artifact B](authoring.md) or it is lost.

Two rules follow, and `5b` **REJECTed VCST-5653 on both of them** before approving it:

1. **Every item carries its verdict IN the artifact.** Per-item results that existed only in chat relays
   made two items read as silent blanks. A verdict in a relay is not evidence.
2. **Record the literal scoping invocation, verbatim.** The `tc:scope` command line behind a hit count is
   part of the finding — a verifier cannot reproduce the number without it, and an unreproducible number
   is a claim.

**The regression block §5c requires — the `C1` skip, the gate as `not-assessed`, the one-line coverage
statement — is a ROUTING record and is stated there, not here.** What this file adds is the axis record
below.

**Populate `summary.json.visual.axes.design_system` — for this class it is never legitimately empty.**
The schema already carries the field (*live resolved custom properties vs the generated token set, no
hardcoded literals, sized-control token + aspect equality*) and it is the machine record of exactly what a
UI-kit run does. VCST-5653 left it **absent entirely**, because its visual work ran as a checklist phase
rather than as a `/qa-design` pass and no design report was written — so the run that most exercised this
axis is also the one that recorded nothing in it. A run that did not execute the axis fills
`skipped_reason`; it does not leave the block off. Same rule as the checklist row, one level down: silence
is not an answer.

## 8. Unverified is not cleared

A kit primitive routinely has variants **no data in the environment can reach**. VCST-5653 hit four: the
no-indicator radio (0 of 50 BOPIS pick points carried the variant), the ≥5-image `VcNavButton` (one
qualifying product in 4549 scanned), a review-images modal needing ≥2 images, and a payment integration this
store configures as a hosted redirect.

Each is `BLOCKED` — after a real attempt that failed, never as a shortcut
(`feedback_blocked_is_not_terminal`) — or `NOT_APPLICABLE` with the environment reason named. **Never a
silent PASS.** All four otherwise resolve to *"unverified"*, which is honest and, to anyone skimming,
indistinguishable from *"fine"*. Backlog: B-35.

## 9. The two lanes are COMPLEMENTARY — brief the right one, and derive only what neither can do

This class needs both measurement and real interaction, and **no single lane provides both.** Briefing the
wrong one does not fail loudly; it returns `BLOCKED` or `INCONCLUSIVE` for a tooling reason that reads like
a product finding.

| Needs | Lane | Why the other cannot |
|---|---|---|
| computed colour, `getBoundingClientRect`, token reads, axe injection | **Chrome DevTools MCP** (`ui-ux-expert`) | the **REAL-USER RULE** is hook-enforced on the Playwright lanes (`hooks/enforce-real-user.mjs`): `browser_evaluate` is *blocked*, so a measurement simply cannot be taken there |
| a real keyboard `Tab` journey, `--reduced-motion=reduce`, a genuine click path | **a Playwright lane** | Chrome DevTools MCP's `emulate` carries no reduced-motion axis (B-36) |

**Measured twice, on the same case.** Suite `097`'s `SR-CO-016` went `BLOCKED` on a Playwright lane because
`[TOUCH]`, `[SPACING]` and axe all needed injection the rule forbids — *"BLOCKING, and the reason is tooling
not product"* — and in an earlier run the same case recorded *"AXE INCONCLUSIVE … blocked by the real-user
hook; **never reported as a pass**"*. This is the structural reason VCST-5653 put its contrast and axe work
on a separate DevTools phase, and why a UI-kit run is normally **multi-phase by lane**, not by feature area.

**A derived PASS is legitimate only where neither lane can reach the condition — and only if the artifact
says what is still owed, and to which lane.** VCST-5653's reduced-motion item passed by derivation with
*"behavioural confirmation still owed to a Playwright lane with `--reduced-motion=reduce`"* recorded. A
derivation written down as a plain PASS is a claim the next reader cannot audit, and an `INCONCLUSIVE`
measurement is never a clean one.

## 10. Where a finding lands — the token contract is a defect in its own right

**A value that matches the design spec exactly and still fails WCAG makes the TOKEN the defect**, not the
component that used it. Route it to the design-system owner as `AMBIGUOUS` and escalate; per
[`visual-axis.md`](visual-axis.md) §3 a spec never outranks an invariant. The precedent is VCST-5346's
1.63:1 focus ring — *"matches the design token exactly … so the token contract is the defect"* — and a ≤40%
alpha ring cannot reach 3:1 on white for any mid-luminance hue, so no component fix was ever available.

Accessibility findings on a functional / feature / E2E ticket **file separately at their real severity and
never block it** ([`triage.md`](triage.md) §7a). The carve-out is a ticket that is itself *about*
accessibility — decided by the ticket's own ACs, never by the finding's severity. Filing rules for the
design-system class: [`design-system-consistency.md`](../qa-design/design-system-consistency.md) §Findings.

---

## 11. What this class does NOT cover

**vc-shell / Vendor Portal is a separate product and none of the above applies to it.** It has its own
hosted Storybook, which is exactly why the exclusion has to be written down — the §5c detection signals
would otherwise swallow it. No Coffee theme, no gated-preset set, no `BL-UI` invariant scope, no storefront
selectors, no regression suites. A vc-shell UI task is not a `ui-kit` shape class ticket; see
[`vc-shell-fix/SKILL.md`](../vc-shell-fix/SKILL.md) and the `reference_vc_shell_vendor_portal_testing`
memory.

**It does not own the visual axis, the BL-UI invariants, or the design-system methodology.** Those keep
their owners — [`visual-axis.md`](visual-axis.md), [`qa-design/SKILL.md`](../qa-design/SKILL.md) and
[`qa-accessibility/SKILL.md`](../qa-accessibility/SKILL.md). This file adds only what is specific to the
change being the kit itself.

**And it changes no verdict rule.** `5b` remains a hard STOP, the severity floor at `5d` is unchanged, and
the class never supplies a release recommendation — with C1 skipped the Feature Release Gate is
`not-assessed`, never a pass.
