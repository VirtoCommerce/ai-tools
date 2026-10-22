# Security — what untrusted input can reach a privileged context

Each item names a well-known GitHub Actions rule so the reviewer knows where to look. A finding that
rests on one cites the `docs.github.com` page it checked (a helper, which cannot fetch, marks it
`needs docs check` with the page) (`SKILL.md` §Reading the code) — notably
*Security hardening for GitHub Actions* and *Events that trigger workflows*.

The question under every item: **who can cause this to run, with what input, and holding which
credentials?**

## Privileged triggers that run untrusted code

- **`pull_request_target`** runs in the context of the base branch, with repository secrets and a
  token that can write. It is safe only while it does not execute code from the PR. Flag any
  `actions/checkout` of the PR head (`ref: ${{ github.event.pull_request.head.sha }}`, `head.ref`,
  `refs/pull/<n>/merge`) followed by anything that executes it: a build, `npm install` (lifecycle
  scripts), `dotnet build` / `restore` (MSBuild targets in the PR), a test run, a script from the PR's
  tree, a local action (`uses: ./…`) resolved from the checked-out head. That is the "pwn request":
  **blocker** when a fork can open the PR. **Gating does not make it safe on its own.** The
  repository's approval setting for fork PRs does not apply: `pull_request_target` runs always,
  regardless of it (*Managing GitHub Actions settings for a repository*). A label or approval gate
  (`types: [labeled]`, an environment with reviewers) protects only the commit the maintainer looked
  at, so a gated job must check out `head.sha` from the event, never `head.ref` — the branch can be
  pushed to after the approval and before the checkout (TOCTOU).
- **`workflow_run`** runs privileged after another workflow — often one that a fork PR triggered.
  Artifacts, caches and outputs from the triggering run are attacker-controlled: downloading them and
  executing, extracting over the workspace, or interpolating their content is the same class.
- **Cache poisoning.** The docs name it for `pull_request_target`. Code from the PR that runs in a
  job with the **base branch's cache scope** — `pull_request_target`, `workflow_run`, or any
  privileged job that builds the PR — can write a cache entry under a key a later privileged run on
  the default branch restores: a dependency directory, a build output, a tool binary. The restore is
  then the execution. Flag `actions/cache` (or a `setup-*` action with `cache:`) in such a job, and a
  key built from files the PR controls (lockfiles from the PR head).
- **`issue_comment`, `discussion`** and similar fire on actions outsiders can take, and run with the
  default branch's workflow and secrets (`GITHUB_REF` is the default branch). Read the `if:` that gates on
  `author_association`, team membership or actor; a missing or spoofable guard (matching a comment
  body, trusting `github.actor` on a re-run) is the finding.
- **`pull_request` from a fork** — and `pull_request_review` / `pull_request_review_comment`, which run
  on the PR's merge ref the same way — has no repository secrets and a read-only token. So moving a job
  *from* `pull_request` *to* `pull_request_target` "to get secrets" is the most common way this class
  is introduced. Dependabot-triggered runs get Dependabot secrets only; a PR that works around that by
  switching trigger is in scope here.

## Script injection

- **`${{ … }}` inside `run:` (or `script:` of `actions/github-script`) is text substitution into a
  shell script before it runs.** Any attacker-controllable value — PR title and body, branch name
  (`head_ref`), commit messages, issue and comment bodies, review bodies, labels, a `workflow_dispatch`
  string input on a repository outsiders can dispatch, step outputs derived from those — becomes
  code. The safe shape is to pass it through `env:` and reference `"$VAR"` in the script. Flag every
  interpolation of such a value; a value the event's actor cannot set (`github.sha`,
  `github.repository`, a numeric id) is not one.
- **Writes to `$GITHUB_ENV`, `$GITHUB_OUTPUT`, `$GITHUB_PATH`** with untrusted content: a newline in
  the value lets the attacker set another variable (`LD_PRELOAD`, `BASH_ENV`, `PATH`) for every
  later step. Flag unsanitised `echo "X=$UNTRUSTED" >> "$GITHUB_ENV"`; the multiline delimiter form
  with a random delimiter is the safe shape.

## Token and permissions

- **`permissions`.** Is there a top-level or per-job `permissions:` block, and is each scope the
  narrowest the job uses? When the block is present, every unlisted scope is `none`; when it is
  absent, the token gets the repository or organization default, which the review cannot see — say
  so. A new `write` scope (`contents`, `packages`, `id-token`, `pull-requests`, `actions`) on a job
  that a fork or an outsider can trigger is the high-severity case.
- **Reusable workflows:** the callee's token can never exceed the caller's `permissions`, so read both
  ends; a callee that now needs a scope its callers do not grant breaks them (`contract.md`).
- **`id-token: write`** (OIDC to a cloud) — whatever can run in that job can assume the cloud role the
  trust policy allows. Read which branches, environments or events the policy is meant for and whether
  the trigger now reaches beyond them. **A branch-based policy is not an event filter:** per *OpenID
  Connect* (security reference), `sub` carries `pull_request` only for pull request events and the
  branch otherwise. Inferred, not stated there: a `workflow_run` job, which runs on the default branch,
  then presents the same `ref:refs/heads/main` subject as a push to `main`. Neither it nor
  `pull_request_target` is named on the page; treat a policy that trusts the default branch as reachable from both until the claims are
  checked, and prefer an `environment` claim behind protection rules.
- **`actions/checkout` persists the token** into `.git/config` by default (`persist-credentials`).
  In a job that later runs untrusted code or uploads the workspace as an artifact, that is a leaked
  token; `persist-credentials: false` is the safe shape.

## Secrets

- **Printed or exfiltrable:** `echo`, `set -x` / `bash -x` around a secret, a secret passed as a
  command-line argument (visible to other processes and often echoed by tools), a secret written to a
  file that is then uploaded as an artifact or cached. Masking is exact-string — an encoded, split or
  transformed secret prints in clear.
- **`secrets: inherit`** passes **every** secret the caller can see to the callee. Flag it where the
  callee is in another repository or pinned to a mutable ref; the explicit list is the safe shape.
- **Scope:** a new repository or organization secret the workflow starts reading — is it an
  environment secret behind protection rules where it should be (publish keys, production deploy)?
  The review cannot see environment rules; name the dependency.
- A `secrets.*` reference in `if:` — `correctness.md`, the *Conditions* item.

## Supply chain

- **Pinning follows the repository's own policy** — for VirtoCommerce, `.pinact.yaml` and
  `zizmor.yml` in `VirtoCommerce/.github` (`virto-ci-layout.md`), which decide which owners must be
  SHA-pinned and which may float on a ref; `actions/*` counts as third-party there. A use that breaks
  the policy: the tag can be moved to code that reads every secret the job holds, so severity rises
  with what the job holds (minor on a read-only lint job; major on a job with publish secrets or write
  scopes). A PR that **widens** the policy files is a security change in itself.
- **A re-pin** (Dependabot or manual) from one SHA to another: verify the new SHA is the commit the
  claimed tag points at in the action's repository (`gh api repos/<owner>/<action>/git/ref/tags/<tag>`,
  dereferencing an annotated tag), and that the action's repository is the one it was before.
- **Download-and-run** (`curl … | sh`, an unpinned `npm i -g`, `dotnet tool install` without a
  version, a container `image:` by tag) inside a job holding secrets — the same reasoning as an
  unpinned action.
- **Self-hosted runners** on a public repository reachable from fork PRs: anything the fork runs
  persists on the machine for the next job.
