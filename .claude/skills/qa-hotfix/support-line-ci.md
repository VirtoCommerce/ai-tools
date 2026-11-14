# Release CI on a support line — fix it in the same push, never from a red run

A `support/X.Y` branch cut from an old tag inherits **that tag's** CI. The tag was green when it was
cut; today's nuget.org and today's NuGet audit are not the ones it was tested against. So the first
hotfix on a new (or long-idle) line can fail for reasons that have nothing to do with the fix — and
one of them fails **after** the GitHub release already exists.

`npm run hotfix:precheck` prints a **Release CI** block for each bundle that is about to release (on
its support branch, or on the tag the branch will be cut from). Every **`⚠`** there is fixed **before
the first release**, in its own commit, pushed together with the cherry-pick. An **`ℹ`** is a heads-up
only. The operator's go-ahead for the hotfix covers these commits: they change no product code and no
dependency version.

## The two known stale-CI failures

| Precheck flag | What happens if you release anyway | The fix (copy it, don't re-derive it) |
|---|---|---|
| **`⚠`** release workflow pushes NuGet with `secrets.NUGET_KEY`, no Trusted Publishing (`NuGet/login@` job or the `publish-nuget-central@` action) | `publish-github-release` creates the **GitHub release and tag**, then the NuGet push gets **403** and the job fails: a release with no packages, `increment-version` **skipped**, branch still on the old version | Copy the Trusted Publishing job from the reference branch the precheck names: add the job, add it to `publish-github-release.needs`, pass `forceNuget: false`, drop the `nugetKey` secret. The **copied job keeps the reference's action refs** (`…/actions/publish-nuget@v3.1000.x` does not exist at `v3.800.x`); the rest of the file keeps the branch's own refs. Precedent: [vc-module-catalog-csv-export-import#160](https://github.com/VirtoCommerce/vc-module-catalog-csv-export-import/pull/160) |
| **`⚠`** `TreatWarningsAsErrors` with no NU1902 mitigation, **and another line of this repo already had to add `<NuGetAuditMode>`** | `build` + `test` fail on restore: `NU1902: Warning As Error: Package '<transitive>' … has a known … vulnerability` — a transitive package the old line pins | Add `<NuGetAuditMode>direct</NuGetAuditMode>` to the `PropertyGroup` that holds `TreatWarningsAsErrors` in `Directory.Build.props` (audit keeps checking the module's direct deps). Precedent: [vc-module-catalog-csv-export-import#159](https://github.com/VirtoCommerce/vc-module-catalog-csv-export-import/pull/159) |
| **`ℹ`** the same audit gap, but no line of this repo has needed the fix yet | Usually nothing — restore fails only when a transitive package has a published advisory (most lines restore fine) | Release as is; if the run fails on NU1902, apply the row above and release again |

A props file already counts as mitigated with `<NuGetAuditMode>`, `<NuGetAudit>false</NuGetAudit>`,
or `NU1902`/`NU1903`/`NU1904` in `NoWarn` / `WarningsNotAsErrors`.

## When it already happened — a release without packages

`hotfix:release` reports it as `⛔ … ⚠ GitHub release X.Y.Z WAS created … NuGet packages most likely
NOT on nuget.org`. The published tag cannot be re-released (a re-run computes the same `X.Y.Z` → 422),
so:

1. Port the Trusted Publishing job (table above).
2. In the **same commit**, set `VersionPrefix` (`Directory.Build.props`) and `<version>` (module
   `module.manifest`) to `X.Y.Z` — what the skipped `increment-version` job would have written.
3. Push and release again → `X.Y.(Z+1)`, with GitHub release **and** NuGet. That patch is the one the
   bundle pins and the environments get; `X.Y.Z` stays a GitHub-only release.

Measured: VCST-6663, 2026-11-06 — `support/3.1002` from tag `3.1002.0` hit NU1902, then (after the
audit fix) the 403. `3.1002.1` came out GitHub-only; `3.1002.2` is the complete hotfix.
`support/3.1007`, cut the same hour from a newer tag, released clean.

## Don't hide the exit code

`hotfix:release --poll` exits `1` on a failed run. Piping it straight into `tail`/`grep` reports the
pipe's status instead — capture the script's own exit code before filtering its output.
