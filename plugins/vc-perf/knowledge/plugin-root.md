# Resolving `$pluginRoot` — where the plugin's own scripts live

Every skill in this plugin invokes bundled scripts by absolute path, e.g.
`"$pluginRoot/skills/perf-benchmark/run-own-before-after.sh" …` or
`dotnet run "$pluginRoot/skills/perf-trace/perftools/allocparse.cs" …`. `$pluginRoot` is a
**placeholder the model fills at runtime** — it is NOT a shell variable and is NOT stored in
`project-profile.json`.

## Why it must be resolved at runtime (not baked)

- `$CLAUDE_PLUGIN_ROOT` is exported by Claude Code **only to hook / MCP / LSP subprocesses**,
  **not** into the Bash/PowerShell tool shell — so a command's `echo "$CLAUDE_PLUGIN_ROOT"`
  is empty and cannot be relied on. Every example in this plugin's skills/commands that looks
  like `${CLAUDE_PLUGIN_ROOT}/skills/...` needs `$pluginRoot` resolved first, exactly as below.
- The marketplace installs the plugin into a **version-stamped** cache dir
  (`…/ai-tools/vc-perf/<version>/`); a NEW sibling appears on every upgrade and old versions
  are not pruned. Baking that absolute path anywhere leaves it pointing at a stale (or deleted)
  version after any upgrade.

So the model resolves the **active (enabled)** install path fresh, each time it needs it. This
is the same lesson `vc-fix` already learned — see its own
[`knowledge/execution/plugin-root.md`](../../vc-fix/knowledge/execution/plugin-root.md) — vc-perf
follows the identical convention for its own scripts.

## The resolver (documented CLI — preferred)

`claude plugin list --json` is a documented Claude Code CLI command that returns every
installed plugin with its `installPath`, `version`, `scope`, and `enabled` flag. Pick the
enabled `vc-perf@ai-tools` entry (an install made before the 2026-09-30 marketplace rename still
has the id `vc-perf@vc-tools`, so the resolver accepts both, **new id first** whatever order the CLI prints.
Both enabled at once is a fault, not a fallback: each copy's `hooks.json` starts its own collector —
uninstall `vc-perf@vc-tools` and restart):

```bash
PLUGIN_ROOT="$(claude plugin list --json | node -e "const a=JSON.parse(require('fs').readFileSync(0,'utf8'));const ids=['vc-perf@ai-tools','vc-perf@vc-tools'];const pick=f=>ids.map(i=>a.find(x=>x.id===i&&f(x))).find(Boolean);const p=pick(x=>x.enabled)||pick(()=>true);process.stdout.write(p?p.installPath:'')")"
"$PLUGIN_ROOT/skills/perf-benchmark/run-own-before-after.sh" <baseline-ref> <target> …
```

PowerShell:

```powershell
$list = claude plugin list --json | ConvertFrom-Json
$PLUGIN_ROOT = @(foreach ($i in 'vc-perf@ai-tools','vc-perf@vc-tools') { $list | Where-Object { $_.id -eq $i -and $_.enabled } })[0].installPath
& "$PLUGIN_ROOT/skills/perf-benchmark/run-own-before-after.sh" <baseline-ref> <target> …
```

Resolve it **once** per task and reuse `$PLUGIN_ROOT`. Always the active version — no stale
version-stamped path, no manual re-pointing after an upgrade.

## Fallback (if the `claude` CLI is not on PATH in the shell)

Scan the documented cache dir and take the highest-semver `vc-perf` install:

```bash
PLUGIN_ROOT="$(node -e "const fs=require('fs'),os=require('os'),p=require('path');const base=p.join(os.homedir(),'.claude','plugins','cache');let best='';let bv=[-1,-1,-1];for(const mp of (fs.existsSync(base)?fs.readdirSync(base):[])){const d=p.join(base,mp,'vc-perf');if(!fs.existsSync(d))continue;for(const v of fs.readdirSync(d)){const m=/^(\d+)\.(\d+)\.(\d+)/.exec(v);if(!m)continue;const cur=[+m[1],+m[2],+m[3]];if(cur[0]>bv[0]||(cur[0]===bv[0]&&(cur[1]>bv[1]||(cur[1]===bv[1]&&cur[2]>bv[2])))){bv=cur;best=p.join(d,v);}}}process.stdout.write(best);")"
```

If neither resolves, stop and tell the operator the plugin install could not be located
(re-install `vc-perf`, or run from the plugin checkout with an explicit path).

## Notes

- This resolver only supplies the initial **launch** path for `vc-perf`'s own scripts. Commands
  that additionally invoke a `vc-fix` script (e.g. its `qa-fix-routing` helper) resolve `vc-fix`'s
  root the same way with vc-fix's ids — `vc-fix@ai-tools`, then `vc-fix@vc-tools` — see `vc-fix`'s own
  `plugin-root.md`. The two resolutions are independent; never assume `vc-perf` and `vc-fix`
  share an install path.
- `~/.claude/plugins/installed_plugins.json` carries the same data but is an **internal,
  undocumented** file — prefer `claude plugin list --json`.
