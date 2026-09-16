# How the base reaches real work, once it is not an experiment

The run brief is scaffolding. It exists so that every measured run meets identical conditions, and
most of it dies the day the measurement ends. This is what survives, where it goes, and the one
thing we do not yet know.

## The brief splits three ways

| part | where it ends up |
|---|---|
| Set `KB_PHASE`, close the row with `log-row mark`, do not read the frozen corpus, archive `MEASUREMENT` between runs, do not grade yourself | **Dies with the experiment.** Nobody closes a question row by hand while doing their job. |
| Which browser lane signs in, what not to read from a network request, which account works here | **Project configuration.** Skills and `.claude/knowledge/` already hold exactly this kind of thing in the QA repository; none of it is new machinery. |
| Ask the base before looking elsewhere; record what you learned; confirm or dispute what you were served | **The only part that has to survive**, and the only part this page is about. |
| An axis may repeat; what counts as a fact; which refutation channel; mechanism not instance | **Already moved, into `kb capture --help`.** See below. |

Worth noticing: the working load is **lighter** than the measured one, not heavier. Phases and row
marks go away. Two actions remain, and one of them need not be manual.

## Four ways an agent can come to use it

**A line in `CLAUDE.md`.** Always loaded, costs nothing. It is *advice*: under the pressure of a
task it competes with every other rule on the page, and there is no way to tell afterwards whether
it was read.

**A skill.** Pulled in when the task matches its description, so it is not occupying context the
rest of the time. Sharper than `CLAUDE.md`, and the shape the QA repository is already built in.

**A hook.** The only option that does not depend on the model remembering. A `UserPromptSubmit`
hook can run `kb deliver` against the prompt and put what it finds into the context — the agent does
not go to the base, the base arrives. Nothing to break: no match, nothing injected.

**An MCP server.** The verbs exposed as tools, so the base shows up in the tool list with its own
descriptions. The model then sees a *capability* rather than an instruction it has to remember. This
is a translation of what already exists, not new development.

## The split that decides which

**Reading can be made almost automatic — do that.** It removes the "did the agent remember"
variable outright, which is the largest uncontrolled term in everything measured so far. A hook is
enough.

**Writing cannot be automated.** Deciding that something is a fact worth the next agent's time is a
judgement, and a machine will not make it. So writing needs `kb capture` in the definition of done
for a QA task — and, behind that, detection: a run that consulted the base, was told nothing, went
to the source and finished without recording is **visible in the journal**. That detector is
already built.

But the judgement still has to be *informed*, and that guidance was living in the run brief, which
dies. It now lives in `kb capture --help`, next to the required-input list it qualifies, and
nowhere else.

**Why the verb and not a skill or a `CLAUDE.md` line.** Those are read before the work. The help
page is read *during* it, at the one moment someone is deciding whether what they just learned is
worth recording — and that is a decision no gate downstream can make for them. The gate checks that
seven fields are filled; it has no opinion about whether anything worth reading is in them. Two
further properties follow from the placement rather than from the prose: there is exactly one copy,
so it cannot go stale against a second, and the door's own refusal message points at it, which puts
it in front of the one person guaranteed to be fumbling. A test asserts that every input the door
requires is explained there, so an eighth input cannot be added without the page gaining it.

Reading help writes no journal line. The journal answers "how often did an agent write to the
base?", and a manual-reading counted as a capture would inflate that number in the flattering
direction — the kind of error nobody goes looking for.

## What we do not know, and how run 03 finds out

**Nobody has yet seen an agent consult the base without being told to.** Runs 01 and 02 were both
instructed to. So "agents use the base" is an assumption, not a result, and it is load-bearing: if
agents reach for it unprompted, a skill is enough and the hook is wasted work; if they do not, no
amount of documentation substitutes for the hook.

Run 03 is therefore given a brief that says the base exists and how to use it, and does **not** say
to consult it (`RUN-BRIEF-unprompted.md`). What we read afterwards is not whether it asked, but
*which* questions it brought and which it answered by going straight to the deployment.

Measuring this costs one run. Building the hook and then discovering it was unnecessary costs more,
and building nothing and discovering agents never ask costs the whole idea.

**Run 03 therefore differs from 01 and 02 in two respects, not one**, and this is recorded here so
that nobody later reads it as a clean single-variable result: it is not told to consult the base,
*and* the editorial guidance reaches it through `kb capture --help` rather than through its brief.
The two are close to orthogonal — whether you are told to *read* the base does not plausibly change
how well you *write* to it — so each is still readable on its own. But if run 03's captures come
back worse rather than better, that is two candidate causes and the next run has to separate them.
