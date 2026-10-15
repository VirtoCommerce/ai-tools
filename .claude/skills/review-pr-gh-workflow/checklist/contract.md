# Contract — what callers, branch protection and other workflows rely on

A reusable workflow (`on: workflow_call`) or an action (`action.yml`) is called from repositories the
PR cannot show. Their callers are found by the census (`SKILL.md` Step 3); this file is what to check
against them.

## Interface of a reusable workflow or action

- **Inputs:** a removed or renamed input; a new `required: true` input with no default; a changed
  `type`; a changed `default` that alters behavior for callers who relied on it. A removed input
  fails the caller at run start; a changed default fails nothing and behaves differently — watch the
  second hardest.
- **Secrets:** a newly required secret (`secrets: … required: true`) that existing callers do not
  pass; a renamed secret. Callers using `secrets: inherit` pass whatever they have, so a new name
  silently arrives empty unless the caller's repository already holds it.
- **Outputs:** a removed or renamed output, or one whose value changed shape (a version with or
  without a `v` prefix, a JSON string becoming a plain string, a path becoming relative). Callers read
  outputs by name in `needs.<job>.outputs.<name>`, and an absent output evaluates empty, not as an
  error.
- **Permissions the callee now needs.** The callee's token cannot exceed what the caller's job grants
  (`security.md`); a new scope the callers do not grant breaks every one of them at run time.
- **Usage examples are part of the interface.** A README or template that shows
  `uses: …/<new action>@<tag>` must name a tag that contains the action (`virto-ci-layout.md` has the
  check); a copied example that fails at run start is how most callers meet a new action.
- **Side effects:** what the workflow now writes — tags, releases, packages, commits back to the
  branch, PR comments, artifacts with a new name or retention. A caller that did not opt in gets the
  new effect on its next run if it pins a branch.

## Who picks it up, and when

- The channel decides it (`virto-ci-layout.md`). Callers pinned to a branch (`LIVE-MUTABLE`) take the
  change on merge, without a PR of their own and without anyone reviewing it in their repository.
  Callers pinned to a tag or SHA (`LIVE-pinned`) take it on their next bump. A module workflow
  template reaches every repository in `module-repos.json` at once, on the next deploy. **A break
  hitting `LIVE-MUTABLE` callers is a blocker**; a break hitting only pinned callers or the next
  template deploy is a blocker that must also be **declared** — in the PR description and in the
  release notes of the tag that carries it.
- **A module workflow template** is also a contract with the module repositories' own setup: the
  secrets, variables, environments and branch protection names it expects must exist in every listed
  repository. A new one that only some repositories have breaks the rest on deploy.
- **Is it declared?** As in `/review-pr-virto` `checklist/backward-compatibility.md`: every break
  belongs under a `## Breaking changes` heading in the description, with what a caller must change.
  An undeclared break carries the severity of the break itself.

## Names other systems match on

- **Required status checks match by check name.** A check's name comes from the job's `name:` (or its
  id), plus the matrix values, plus — for a reusable workflow — the caller job's name as a prefix.
  Renaming a job, changing a matrix axis, moving a job into a reusable workflow, or splitting a job
  changes the name, and branch protection keeps waiting for the old one. The same holds when a
  `paths:` / `paths-ignore:` / `branches:` filter means the workflow no longer runs at all on some
  PRs: a required check that never reports blocks the merge; one dropped from the required list
  silently stops gating. The review cannot see branch protection — name the dependency.
- **`workflow_run` consumers** match the triggering workflow by its `name:`. Renaming a workflow
  silently stops every `workflow_run` listener on it.
- **Artifact and cache names, environment names, concurrency groups** shared between workflows:
  a rename on one side and not the other.
