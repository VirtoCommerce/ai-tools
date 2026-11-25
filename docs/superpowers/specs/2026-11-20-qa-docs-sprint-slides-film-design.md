# `/qa-docs` for a sprint: release notes, slides and a film of the key stories

> **Status: approved by the owner (2026-11-20).** Agreed in conversation with the owner on 2026-11-20.
> Builds on `/qa-docs` (`.claude/skills/qa-docs/`), whose ticket mode and `release` aggregate stay as
> they are except where §6 says otherwise.

## 1. Intent

At a sprint review the team and the product owner want to see **what the sprint's key stories changed,
shown on a real stand** — as a deck they can present (and edit in PowerPoint before presenting), as a
short film, or both.

`/qa-docs` today documents one ticket at a time and aggregates the *What's new* sections into release
notes. That is not enough for a review: on Sprint 26-22, 3 of 195 tickets had a document, and the
screenshots of those three were already gone (their run folders were pruned). So the sprint mode must
**not stop at what is on disk or in the ticket**: when a key story has no material, it finds a stand
where the story is deployed and configured, walks it, and captures what the slide or the film needs.

The person running it should not need to know the skill's flags — and **need not be QA**: a product
owner or a developer may run it on a machine with no run folders, no Playwright lanes and no test
accounts (owner, 2026-11-20). The mode must say up front what that machine can produce and produce it,
never fail half-way.

## 2. Goals, non-goals, anti-goals

**Goals**
- `/qa-docs <sprint>` in any spelling (`sprint26-22`, `Sprint 26-22`, `Sprint26-22`) starts the sprint
  mode. The Jira sprint name is resolved (`Sprint 26-22`), not assumed from the local folder name.
- One **multi-select** question: *Release notes · Slides · Film* — any combination.
- One **approval table**: the candidate key stories and the stand for each; the person confirms, cuts,
  adds, reorders and names stands. Nothing is captured before this approval.
- **Slides**: a Slides artifact (private; the person shares it) whose PowerPoint export is editable
  (verified 2026-11-20 on a one-slide spike: text edits in PowerPoint).
- **Film**: a Motion artifact, ≤ 90 s, ≤ 10 stories, MP4 exported by the person.
- Everything in **English**, like the ticket documents. Text is taken from ticket documents as is.
- **Virto corporate style** from one source (§5), not from hex values written into the skill; the style
  and every other agreed knob are **customization points** in one config file (§5a).

**Non-goals**
- A sprint film embedded in the slides (Slides cannot play an MP4; a slide may link a ticket film).
- New per-ticket films or Jira comments. Ticket documentation stays `/qa-docs <TICKET>`.
- Changing the palette of the existing **ticket** films (`media.md` §Film) in this change — see §8.

**Anti-goals** (would be a failure even if it works)
- A slide or a film scene that states a behaviour nobody saw on a stand — built from ticket or PR text.
- QA-internal marks on screen: no status badges ("Tested by QA", "on stand, QA not finished"), no
  "Captured on <stand> · <date>" line. Those go to speaker notes (slides) or the artifact description (film).
- A person having to learn flags to get the deck.
- A run that fails half-way because the machine lacks lanes, accounts or run folders — the preflight
  (§3.0) says so before anything starts.
- A deck that silently looks like everything was verified: the stand, the capture date and the QA state
  of every story are always recorded (in the notes), never dropped.

## 3. The flow

```
/qa-docs <sprint>
 0. Preflight              what this machine can do — §3.0
 1. Resolve the sprint     Jira: project = <JIRA_PROJECT_KEY> AND sprint = "<name>", sub-tasks excluded
 2. Ask: what to make      [ ] Release notes  [ ] Slides  [ ] Film      (multi-select; none ⇒ stop)
 3. Build the window list  per ticket: included / not included + reason   (always, in memory)
 4. Pick candidates        §3.1
 5. Find stands            §3.2
 6. Approval table         stories × stand; the person edits and approves     (one question)
 7. Gather material        §3.3 — from the ticket document, else a capture walk on the approved stand
 8. Write what was chosen  release notes file · Slides artifact · Motion artifact
 9. Bank + hand-off        kb confirm/capture; links; tell the person to export PPTX / MP4
```

The sprint mode is **interactive only** — no caller runs it unattended (`/qa-test` calls the ticket
mode). Flags (`--notes`, `--slides`, `--film`) only pre-answer step 2; step 6 is never skipped.
*(Builder-check answer, my call.)*

**Backward compatibility** *(my call)*: `/qa-docs release --sprint <S>` and `release --version <V>` with no
other flag keep today's behaviour exactly — release notes only, no question, no stand. The new flow
starts from `/qa-docs <sprint>` or from `release --sprint <S>` with `--slides` / `--film`.

**Where it runs** *(my call)*: steps 1–6 and 8–9 in the main session. Each **capture walk (step 7) is
dispatched to a lane specialist** (`qa-frontend-expert` on `playwright-chrome`, `qa-backend-expert` on
`playwright-edge`, `qa-testing-expert` on `playwright-firefox`; at most 3 at once, never two on one lane),
because 10–20 walks of full-viewport PNGs do not fit one context. The brief names the stand, the lane, the
account, the scenarios and the output folder, and the `kb_ask` coordinates (`agents.md` §Agent
Delegation); the walker returns, per frame: path, the step it shows, the waited-for text, mask boxes, and
per scenario `shown` or `differs: <what>`. This changes `SKILL.md`'s "dispatches no subagent" sentence
for the sprint mode only.

### 3.0 Preflight — what this machine can do

Before the step-2 question, the skill checks, without a browser and without writing anything:

| Capability | Check | Without it |
|---|---|---|
| Tracker | the Jira connector answers for the project | stop: nothing can be listed |
| Ticket documents | `reports/ba/**/*-guide.md` (tracked, so present after a pull) | stories have no document text |
| Jira attachments | the documentation comment of a documented ticket is readable | frames only from disk or a walk |
| Code host | GitHub through vc-secrets (`ticket-context`) | build per story unknown — the person names the stand |
| Stand walks | a configured Playwright lane (`.mcp.json`) and test accounts for the stand (`npm run creds:check -- <env>`) | no walk: stories that need one go to *Not included — needs a stand walk, not possible on this machine* |
| Style | `style.designSystem` (§5a) readable | ask once: neutral look or stop |

It then tells the person, in one block, what this run **can** produce — e.g. "release notes: yes;
slides: 9 of 14 candidates (frames from Jira); 5 need a stand walk, which this machine cannot do" — and
asks the step-2 question with that in view. The approval table marks each story's material source, so
nothing is discovered missing after approval. The preflight runs for every runner; it assumes no role.

### 3.1 Candidates (key stories)

In by default:
- **Story** in **Tested** or **Done**;
- **Bug / Task** with priority **High** or **Highest**, any status;
- **Bug / Task** carrying an **important update**: (a) a contract change that qualifies as `⚠ Breaking`
  under `rules.md` §Truth guardrail 4, (b) a feature row in the release ledger's month(s) of the window
  that the ticket's merged PR belongs to, (c) a new setting or module an administrator must enable.

Out by default:
- **TechDebt, Spike, Review task** — always;
- **internal Task** — a Task with no PR in a product repo (`vc-module-*`, `vc-platform`, `vc-frontend`,
  a theme repo): branch merges, autotests, sample data, this repo's tooling;
- **Cancelled**.

The person has the last word in the approval table (cut, add, reorder). The skill never decides
importance by itself beyond these defaults.

### 3.2 Stands

For each candidate, the build that carries it: the ticket's merged PRs → the module / theme versions
(reuse `vc-test:ticket-context`, which already says per PR whether it is deployed on a stand). Then the
skill probes the stands this checkout knows (`.env.<env>` files and `QA_ENV_PATH` folders):
`GET {{BACK_URL}}/api/platform/modules` and the theme version, and lists every stand whose versions
equal the build or are later releases containing the PR (`rules.md` §Shipped in).

The approval table shows, per story: what is needed, where the skill found it, and **where the feature
is configured** — which only the person knows (a module can be installed and its store setting off). The
person confirms or corrects the stand, may name a stand outside the repo (`QA_ENV_PATH`), or writes
*skip*. A story with no stand from either side goes to *Not included — no stand with this build*.

After approval the skill probes the chosen stand once more; a mismatch is reported, never captured silently.

**Which stands, and writes** *(my call, from existing rules)*: a stand of a client project
(`project-profile.json`, `quality-gates.md` §2a) is never a candidate — its frames and name would land in
a Virto deck. A walk may change data only on a stand the profile marks writable, and undoes it as
`media.md` §Capture step 2 says. A story whose scenario needs a write on a read-only stand goes to
*Not included — needs a writable stand*.

### 3.3 Material per story

| The story has… | Text from | Frames from |
|---|---|---|
| a ticket document (`reports/ba/**/<ticket>-*-guide.md`) and its frames on disk | the document's *What's new* | the run's frames |
| a ticket document, frames not on disk | the document's *What's new* | **the screenshots attached to the ticket's documentation comment in Jira** (the durable copy, `reports.md` §9) |
| a ticket document, no usable attachment | the document's *What's new* | a capture walk of the document's *How it works* scenarios |
| no document | the ticket's acceptance criteria, **as observed on the stand** | a capture walk of the AC |

**Jira attachments.** The comment is the one `/qa-docs <TICKET>` posted (first line
`Documentation — <TICKET>`, or `documentation.json`'s `comment_id` when present). Downloading its images
is a download: the skill asks once per run, naming the tickets and the number of files, then saves them
under the frames folder of §4.4. An attachment is used as is — already redacted when it was posted —
and its mask boxes, if the film needs any, are measured again on the image.

The capture walk is `media.md` §Capture steps 2–6 unchanged (Playwright lane, real sign-in, wait for
the state, full-viewport PNG, mask boxes, JPEG for the film), with the build check of step 1 replaced by
§3.2. A step that does not behave as the document or the AC says is **not shown**; the story is reported
to the person and listed under *Not included — differs on the stand*. It is not a bug report: the skill
files nothing.

Before the first walk: `kb_ask` per page path / operation in scope (CLAUDE.md §Essential Rules →
*Product context*); VirtoOZ before any behaviour sentence the skill writes that is not copied from a
ticket document. After: `kb_confirm` / `kb_dispute` / `kb_capture` for what the walk established.

**"Why" line.** From the ticket's own problem statement, shortened. No problem statement ⇒ no line. Never
written by the model from the change itself.

## 4. What is produced

### 4.1 Release notes (when chosen)

`release.md` §Aggregate: `reports/ba/release-notes/release-<label>.md`, the whole sprint, sections in its
fixed order, *Not included* mandatory. *What's new* stays document-backed, as today. *(My call.)* Two
additions: a *Shown on slides / film, no ticket document* group — the walked stories, each with its
stand — between *What's new* and *Not included*, so the notes and the deck never disagree about a story;
and a *Slides* / *Film* link line when those were made. Not chosen ⇒ no file; the list from step 3 still
drives the approval table.

### 4.2 Slides (when chosen)

A Slides artifact, private, title `Sprint <S> — key stories`. 16:9.

1. **Cover** — sprint, the number of stories.
2. **⚠ Breaking changes** — only when an included story carries one; always before the stories.
3. **One slide per story** — the layout the owner chose (mock-up "variant 1", 2026-11-20):
   - left column: area eyebrow · title · **Why** (§3.3) · what changed, 3–4 bullets · **Who** — the
     role the change serves (e.g. "Sales reps", "Store administrators"), never a person's name;
   - right: one screenshot, `object-fit: contain`;
   - bottom right, small: the versions, printed exactly as probed (prerelease suffix kept);
   - speaker notes: stand, capture date, QA state (`Tested`/`Done` verdict, or "observed on stand, QA
     not finished"), the ticket key, the film link if the ticket has one.
4. ~~**Not included** — grouped reasons, keys only.~~ *Dropped 2026-11-25 at the owner's request (out of place in the deck): the stories not shown are named in the cover's speaker notes and in the release notes.*

Export: the person uses the page's *Share › Export › PowerPoint* (not "slides as pictures"). The skill
tells them so; it does not produce a `.pptx` itself.

### 4.3 Film (when chosen)

A Motion artifact built the way `media.md` §Film builds a ticket film (assets, shared kit, `scenes.json`),
with: a title card; one scene per story, 6–8 s, its key frames, one caption chip per step; an end card.
**≤ 90 s and ≤ 10 stories**: more approved stories ⇒ the skill asks which 10 go into the film (the
slides keep all). No status badges in frames or chips. The MP4 is exported by the person, as for a
ticket film.

### 4.4 Records

- Frames: `test-results/<lane>/docs/<sprint>/<ticket>/` (gitignored, never committed).
- **Sprint record** *(my call)*: `reports/ba/release-notes/release-<label>.json`, written by every sprint
  run whatever was chosen — the approved table (story, stand, versions probed, material source, outcome),
  the Slides and Motion artifact slugs and links, what was chosen in step 2. A re-run reads it: same
  person ⇒ republish the existing artifacts (amend, never fork, as the ticket mode does); another person
  (cannot edit a private artifact) ⇒ new artifacts, the record keeps both. A run that stopped after
  approval resumes from it.
- A story captured by the walk does **not** get a `documentation.json` or a ticket guide — this mode
  documents the sprint, not the ticket.

## 5. Corporate style

> **Superseded (2026-11-25):** the **VC Brand System** Claude Design system now exists (introduced for the
> ticket film in VCST-6571) and is the first value of `style.designSystem`. The paragraphs below record
> the state on 2026-11-20 and the decision then; creating a second "Virto" design system is no longer
> needed.

No Virto brand book or presentation template is known to this repo (searched 2026-11-20: repo,
artifacts, virtocommerce.com). The only official source found is the logo,
`https://virtocommerce.com/images/logo-bold.svg`: `#EC3A35` red, `#FF9A3B` orange, `#262626` charcoal,
`#D8CECE` warm grey. The site's typefaces could not be read.

Decision: create **one Design System artifact, "Virto"**, from the logo (colours, the logo itself) and a
provisional type pair with Cyrillic coverage (Montserrat headings, Inter text — the spike's choice; Lato
in `media.md` is not a Virto source). Slides install it (`designSystems` record); the film reads the same
tokens. When marketing provides the brand book, only the design system changes.

**The style is an extension and customization point** (owner, 2026-11-20). Who owns the Virto design
system and shares it org-wide is deferred. The skill does not hard-wire any brand: it reads the style
from configuration (§5a), so a team or a customer deployment plugs in its own design system without
touching the skill. The Virto design system is the first value of that setting, not a constant.

## 5a. Customization points

One tracked file, `config/qa-docs.json` (schema beside it, like `config/test-suites.json`), holds every
knob the sprint mode would otherwise hard-code. Defaults are the values agreed on 2026-11-20:

| Key | Default | What it changes |
|---|---|---|
| `style.designSystem` | the Virto design system's link (empty until created) | colours, fonts, logo of slides and film |
| `language` | `en` | slides, notes, film captions |
| `film.maxSeconds` / `film.maxStories` | `90` / `10` | the film's length cap and the "pick N for the film" question |
| `candidates.include` | Story in Tested/Done; Bug/Task priority High/Highest; important updates (§3.1) | the pre-selected rows of the approval table |
| `candidates.exclude` | TechDebt, Spike, Review task, internal Task, Cancelled | rows left out of it |
| `slides.layout` | `story-a-why-who` (the chosen layout) | the story slide's layout; another layout is a new named entry, not an edit |

`style.designSystem` empty or unreadable ⇒ the run says so and asks once: continue in the Slides /
Motion type's neutral look, or stop. It never invents a palette. The skill's prompt files name the keys,
never their values (GOLDEN RULE). Per-deployment overrides (a customer's brand) are a later extension:
the file is the one place they would plug in.

**The film** *(left to the builder)*: if the Motion type can install a design system as Slides does, it
installs it; otherwise the skill reads the design system's tokens at run time and passes them into the
film's shared kit — never re-typed into `media.md`.

## 6. Changes to the skill

| File | Change |
|---|---|
| `SKILL.md` | Recognise a sprint argument; one row in *Invocations*; `description` and `argument-hint` mention sprint slides and film. Stays under BUDGET-004 (19K; now 10.8K) — detail lives in the new file |
| new `sprint.md` | §3–§4 of this design: the flow, candidates, stands, approval table, material, slides, film, records |
| `release.md` | the aggregate is reused by `sprint.md`; add the Slides / Film link line |
| `media.md` | §Capture is reused by reference; §Film gains "a sprint film: see `sprint.md`" |
| `rules.md` | §Evidence bar gains one paragraph: in the sprint mode, a story without a document is shown only as observed on a stand by the capture walk, with its QA state in the notes |
| new `config/qa-docs.json` + `config/qa-docs.schema.json` | the customization points of §5a |

No script, so no unit test (`when-to-write-a-test.md`); the gates are `npm run context:check` and the
config's schema.
`.superpowers/` (the brainstorm mock-ups) goes into `.gitignore`.

## 7. Approaches considered

| | Slides is the source, PPTX exported from it | Skill builds Slides **and** a `.pptx` (pptx skill) from one content file |
|---|---|---|
| Editable PPTX | yes — verified on the spike | yes, guaranteed |
| Builds | one | two, looks may drift |
| Chosen | **yes** | fallback if the export ever stops giving editable text |

Hand edits in PowerPoint do not flow back to the link: the link is "as generated", the file is "as presented".

Film: one Motion artifact per sprint, reusing the ticket-film kit — rather than stitching ticket films,
which would need a film per story and exceed 90 s.

## 8. Left to the builder

- The exact wording of the step-2 question and the approval table's columns.
- How the theme version is probed per stand (store capabilities probe vs the storefront's version endpoint).
- Mapping a merged PR to "a later release containing it" — reuse `ticket-context`; if it cannot tell, show
  the story with "build unknown" in the table and let the person decide.
- The Design System artifact's contents beyond the logo colours and the provisional fonts.
- Follow-up, not in this change: move the ticket films' palette (`media.md` §Film step 2) onto the Virto
  design system.
