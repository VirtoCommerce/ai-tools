# Triage of a pixel diff — intended, regression or noise

Read by step 6 of [`SKILL.md`](SKILL.md). `visual:diff` says **what** moved. This file decides **what
it means**, one component at a time, against the PR diff and the ticket's ACs.

## 1. Read before you judge

For each group in `visual-diff.json` → `components[]` (a story's component title, or a page target's `group`):

1. **Look at the diff PNG of every flagged story**, then at the base and head shots side by side.
   - A percentage says how much moved, not whether it is wrong.
   - A 0.3 % change can be a clipped label. A 20 % change can be an intended recolour.
2. **Find the change that explains it.** Is it the component's own file in the PR, a component it
   renders (the `renderers` list of `visual:affected`), or a global surface (a token, a preset, a
   style, a dependency)?
3. **Find what the ticket intends.** Look at the AC, the PR description and the design link. The
   intent decides; the size of the diff does not.

## 2. The three outcomes

| Outcome | When | Typical shape |
|---|---|---|
| **intended** | The visible change is what the ticket or PR declares, on the components it names | A recolour of the component the AC names; a new prop's rendering in its own story |
| **regression** | Anything the ticket does not declare. It always includes: a change in a component the PR never mentions (the blast radius), a `size-changed` story in a composite (layout moved), text clipped or overlapping, an icon gone or swapped, a state that no longer renders | 2 px of padding in `VcButton` reaching `VcModal` footers; a badge radius change on every chip |
| **noise** | The confirmation pass (`--repeat 3`) clears it, or it is `unstable` and its diff region is exactly where the story's own shots disagree | A panel that lands inside the viewport in some passes and below it in others |

**A "no visual change" PR has no intended outcome.** For a refactor, a dependency upgrade or a
technical change that declares no visual effect, every non-noise change is a regression. This is
the case `PIXEL` exists for.

**Blast radius is a finding even when the edited component is intended.** If the AC intends
`VcButton`'s new padding but `VcConfirmationModal`'s footer now wraps, the button is intended and the
modal is a regression. Judge each component separately.

**`unstable` is not noise by default.** The story renders more than one way *and* no base shot matches
any head shot. Compare the diff region with the region where its own shots disagree. If the change
lies outside that region, it is a real change on top of an unstable story. The instability itself is
a story defect worth a row: a story that cannot render the same way twice cannot guard anything.

**`unrendered` is not triaged as noise.** A story that rendered on base and fails on head is a
regression until shown otherwise: it may be a thrown error in the changed component.

## 3. The checklist row

One row per component that flagged, plus one per `uncovered[]` file routed to another instrument:

```
- [ ] [PIXEL] <component or page group> — <n> targets (<sets>) — <intended | regression | noise | unrendered>
      — evidence: {RUN_DIR}/visual/diff/<set>/<id>.png — why: <AC id / PR line / "not declared">
- [ ] [PIXEL pages|PROBE|DESIGN|CONTENT] <uncovered file> — no story; checked by <source or instrument> because <reason>
```

The verdict word is the outcome, never PASS/FAIL alone: a reader must see *why* a change was
accepted. A regression row carries the severity of the defect it shows
([`../qa-test/triage.md`](../qa-test/triage.md)), never a severity set by pixel count.

## 4. What triage never does

- **Never accepts a change because it is small.** A real 2 px radius regression moved 12 pixels, and
  noise is handled by the confirmation pass, not by size.
- **Never re-baselines.** There is no stored baseline: each run compares its own base build with its
  own head build. Deciding a change is intended is a row in the checklist, not a file you overwrite.
- **Never decides from one story.** Several stories of one component that disagree are themselves
  a signal. A change that shows in one state and not another is often the regression.
