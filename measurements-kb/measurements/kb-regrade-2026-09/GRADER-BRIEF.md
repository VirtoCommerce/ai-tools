# Grade this knowledge base, without having seen how it was made

You are the outside check on a knowledge base that has, so far, only ever been judged by the people
who built it. Four agent sessions did real QA work against a live e-commerce platform, asked this
base questions as they went, and wrote entries back into it. Each of those sessions then graded its
own answers, and the author of the tooling read those grades and agreed with them.

Nobody else has looked. That is what you are for.

## What you must not read

Everything you need is in this directory: `PART-A-questions.md` and `entries/`. Do not open anything
else — specifically:

* the run reports and the measurement write-ups
* `MEASUREMENT/`, `MEASUREMENT-archive/`, and any `questions-*.csv`
* `git log` in either repository, whose commit messages state the author's own conclusions about
  the exact material you are grading
* the knowledge base itself at `C:/_VIRTO/vc-knowledge`

If you find yourself reading something that tells you what the runs concluded, stop, and say in
your report that you saw it. A grade formed after reading the answer is worth nothing, and saying
so is far better than quietly returning one.

## Part A — 26 questions and what the base served

`PART-A-questions.md` lists each question an agent actually asked while working, and names the exact
file each served entry is in.

**Entry files carry a run suffix — `KB-C941FAA3--r01.md` — and that is not decoration.** This corpus
is regenerated, and the same entry id can have a different body for different runs. `--r01` is that
entry as it stood when run 01 was served it. Judge the row against the file it names and no other;
the version a later run saw may say more or less.

For each row, answer one question: **did the base answer it?**

| verdict | means |
|---|---|
| `ANSWERED` | a served entry contains what was asked for. The asker could act on it. |
| `PARTLY` | the served entries are on the right subject but the asker would still have to go and find the answer out. Naming the right operation without saying what it does is `PARTLY`. |
| `NOT-ANSWERED` | nothing served bears on the question. |

Judge what was served, not what the base could have served. And judge against the question as
written, not a more convenient one nearby.

## Part B — 19 entries agents wrote

`entries/` also holds the entries written by those agents — the files whose `plane` is
`experiential`, with no run suffix, since those are graded as they stand today. Grade each on three axes.

**1. Is it a mechanism or an instance?** The standing instruction to every writer was to record the
mechanism, not the instance, so that the entry is still right on a deployment nobody has seen. The
example given to them:

> not "account X can sign in to the storefront here"
> but "the storefront sign-in posts a username, not the email, so a contact whose account carries a
> different username cannot sign in however right the password is"

`MECHANISM`, `INSTANCE`, or `MIXED` when a real mechanism carries a fixture inside it — a specific
id, an account name, a number that will rot.

**2. Would it still be true on a deployment you have never seen?** `TRANSFERABLE`, `LOCAL`, or
`UNCLEAR`. This is not the same question as the first: an entry can be phrased as a mechanism and
still be describing a quirk of one installation's configuration.

**3. Is its `refutableBy` channel right?** The field names what could show the claim false.

* `observation` — someone tries it and sees otherwise. Correct for almost everything.
* `anchor` — the coordinate it is anchored on changes or disappears.
* `artifact` — a stored artifact contradicts it.
* `practice` — a convention people agree to follow. **This channel has no executor at all**: nothing
  in the system can ever contradict such an entry, so it accrues trust from use alone. An entry
  using it should be looked at hard.

`RIGHT` or `WRONG`, and say what it should be if wrong.

Also flag, in the entry's note, anything else you would send back: a claim the body does not
support, two facts fused into one entry, an anchor that is not a real coordinate, a question field
nobody would ever type.

## What a good result looks like

Not agreement. If your grades match the runs' own, that is a real finding and a valuable one — but
it has to be earned item by item. **A report that says everything is fine without a per-item verdict
is worse than no report**, because it cannot be told apart from not having looked.

Disagreement is equally welcome and needs the same discipline: say which row, and why, in one
sentence that someone could argue with.

## Output

Write `verdicts.json` next to this brief:

```json
{
  "partA": [
    { "id": "r01.1", "verdict": "ANSWERED", "why": "one sentence" }
  ],
  "partB": [
    {
      "id": "KB-4B889114",
      "kind": "MECHANISM",
      "transfer": "TRANSFERABLE",
      "channel": "RIGHT",
      "note": "anything you would send back, or null"
    }
  ],
  "sawSomethingIShouldNotHave": false,
  "overall": "two or three sentences, after the per-item work and not instead of it"
}
```

Then say, in your own words, what you would fix first and why.
