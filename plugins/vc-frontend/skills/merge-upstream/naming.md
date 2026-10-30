# Naming a merge after the upstream release it brings

Read by `merge-upstream` step 1, before the branch is created. The name goes into `<slug>`, the branch, the log
title, the commit messages, the PR title and anything posted about the merge (a tracker comment).

**Never take a version from upstream's root `package.json` or from a commit subject on `dev`.** Right after
tagging a release, upstream bumps `dev` to the *next* version (a commit titled `2.62.0`), so `upstream/dev`
names a release that does not exist yet. The fork numbers its own releases; upstream's app version means
nothing in it.

The release a ref brings is the newest upstream release tag it contains (`[0-9]*` skips the `core-v*`
facade tags):

```bash
git for-each-ref --merged <ref> --sort=-version:refname --count=1 --format='%(refname:lstrip=2)' 'refs/upstream-tags/[0-9]*'
git log --oneline refs/upstream-tags/<version>..<ref>   # what rides on top of it
```

- **Nothing on top but upstream's version bump** — the merge *is* that release: `<slug>` is `<version>`
  (`chore/merge-upstream-2.61.0`, `upstream-merges/<date>-2.61.0.md`, "merge upstream vc-frontend 2.61.0").
  The bump and upstream's next version are not mentioned anywhere.
- **Feature or fix commits on top** — `<slug>` is `upstream-dev`, and the text says "`<version>` plus N
  `dev` commits".
- **A release tag as the ref** — `<slug>` is the tag.
