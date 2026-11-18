# Huge changes (mode XL)

Read from [SKILL.md](SKILL.md) when `mode.id` is XL.

Past a certain size one agent per lens cannot read the change, and a review that read a sample
looks the same as one that read everything. The script switches `huge.on` when the non-trivial part
of the change crosses its thresholds (`huge.reason`). Then:

With `--yes` nobody answers the pauses: show the split, take the default depth per cluster, and go
on.

1. **Say so first, and offer a split.** Show the `clusters` table as the proposed split into
   separate PRs, highest tier first. If the user splits, stop here.
2. **Set the mechanical part aside, and explain it.** `mechanicalGroups` holds the files that need
   no file-by-file reading: the same edit repeated across many files, generated files, pure renames,
   whitespace-only changes. For each group:
   - review the representative of a repeated edit once, against its before → after sample. Ask
     how the edit was made: a script or codemod the PR names can be trusted once; an edit an agent
     made file by file gets three representatives, because agents vary where scripts do not. A
     `shape` group (same edit, different names) gets one representative per distinct name pattern;
   - check that generated files have a source change in this diff (a `.graphql`, `package.json`,
     a facade export); a generated change with no source is a finding;
   - `outliers` repeat the edit and also change something else: they stay in the normal review,
     because a hand-edited codemod is where it usually breaks.

   Turn the groups into a short review guide: what each group did, how many files, why it is safe
   to skip, what was checked instead. Give it to every lens agent (so none of them re-reads those
   files) and put it in the report for the people who review next.
3. **[PAUSE] Agree the depth per cluster** with the user, by the cluster's tier: R3 clusters get the
   lenses their zone calls for, R2 clusters get correctness and consumers, R1 clusters one
   correctness pass, R0 clusters the `trivial` pass. The user may raise or lower any cluster.
4. **Map, units, seams (step 4 and 5) as usual**, only for the clusters and lenses agreed in step 3,
   with the review guide from step 2 added to every brief. Every agent also flags hunks that do not
   fit the PR's stated purpose: in a large change, the unrelated edit is the one nobody reads.
5. **Report coverage before findings:** for every cluster, what was reviewed deeply, what got one
   pass, and what was only listed, with the files no agent read named. Nothing that was not read
   may be reported as reviewed, and a review with unread files is never called clean: "no findings
   in what was read".

Review the clusters in the script's `order`: ui-kit, core and the facade first, pages last, the
riskiest first within a layer. People and agents find fewer defects in the last files they read.
