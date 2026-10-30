# Naming a merge

Read by `merge-upstream` step 1. The name goes into `<slug>`, the branch, the log, commit messages, the PR title
and tracker comments.

Name it after the newest upstream release tag the ref contains — never after upstream's `package.json` version or
a commit subject: right after a release upstream bumps `dev` to the next, unreleased version.

```bash
git for-each-ref --merged <ref> --sort=-version:refname --count=1 --format='%(refname:lstrip=2)' 'refs/upstream-tags/[0-9]*'
git log --oneline refs/upstream-tags/<version>..<ref>
```

- Only the version bump on top: the name is `<version>`; the bump is not mentioned.
- Other commits on top: `<slug>` is `upstream-dev`, the text says "`<version>` plus N `dev` commits".
