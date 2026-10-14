# Optional: the dotnet-diag performance pass

Read at `SKILL.md` Step 4, for perf-heavy diffs only.

For perf-heavy diffs (EF queries, hot paths, caching), if the `dotnet-diag` plugin is installed, also
run its **`analyzing-dotnet-performance` skill in the lead** (Skill tool, main loop) on the changed
files — its pattern catalog is wider than the checklist's performance section. Do **not** spawn the
sibling `optimizing-dotnet-performance` **agent** for this: its engine is that same skill, a subagent
cannot load skills, and it then free-forms — observed producing findings about code that does not
exist. Either way, every perf finding is verified against the worktree in Step 6.
