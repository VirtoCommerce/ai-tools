# Resolving `$pluginRoot` — where the plugin's own scripts live

Several commands/skills launch a bundled Node helper by absolute path, e.g.
`node "$pluginRoot/skills/qa-fix-routing/ado.mjs" …`. `$pluginRoot` is a **placeholder the
model fills at runtime** — it is NOT a shell variable and is NOT stored in
`project-profile.json`.

## Why it must be resolved at runtime (not baked)

- `$CLAUDE_PLUGIN_ROOT` is exported by Claude Code **only to hook / MCP / LSP subprocesses**,
  **not** into the Bash/PowerShell tool shell — so a command's `echo "$CLAUDE_PLUGIN_ROOT"`
  is empty and cannot be relied on.
- The marketplace installs the plugin into a **version-stamped** cache dir
  (`…/vc-tools/vc-fix/<version>/`); a NEW sibling appears on every upgrade and old versions
  are not pruned. Baking that absolute path into the profile leaves it pointing at a stale
  (or deleted) version after any upgrade.

So the model resolves the **active (enabled)** install path fresh, each time it needs it.

## The resolver (documented CLI — preferred)

`claude plugin list --json` is a documented Claude Code CLI command that returns every
installed plugin with its `installPath`, `version`, `scope`, and `enabled` flag. Pick the
enabled `vc-fix@vc-tools` entry:

```bash
PLUGIN_ROOT="$(claude plugin list --json | node -e "const a=JSON.parse(require('fs').readFileSync(0,'utf8'));const p=a.find(x=>x.id==='vc-fix@vc-tools'&&x.enabled)||a.find(x=>x.id==='vc-fix@vc-tools');process.stdout.write(p?p.installPath:'')")"
node "$PLUGIN_ROOT/skills/qa-fix-routing/ado.mjs" <cmd> …
```

PowerShell:

```powershell
$PLUGIN_ROOT = (claude plugin list --json | ConvertFrom-Json | Where-Object { $_.id -eq 'vc-fix@vc-tools' -and $_.enabled } | Select-Object -First 1).installPath
node "$PLUGIN_ROOT/skills/qa-fix-routing/ado.mjs" <cmd> …
```

Resolve it **once** per task and reuse `$PLUGIN_ROOT`. Always the active version — no
re-`/project-init` after an upgrade, no version-stamped path in the profile, no stale link.

## Fallback (if the `claude` CLI is not on PATH in the shell)

Scan the documented cache dir and take the highest-semver `vc-fix` install:

```bash
PLUGIN_ROOT="$(node -e "const fs=require('fs'),os=require('os'),p=require('path');const base=p.join(os.homedir(),'.claude','plugins','cache');let best='';let bv=[-1,-1,-1];for(const mp of (fs.existsSync(base)?fs.readdirSync(base):[])){const d=p.join(base,mp,'vc-fix');if(!fs.existsSync(d))continue;for(const v of fs.readdirSync(d)){const m=/^(\d+)\.(\d+)\.(\d+)/.exec(v);if(!m)continue;const cur=[+m[1],+m[2],+m[3]];if(cur[0]>bv[0]||(cur[0]===bv[0]&&(cur[1]>bv[1]||(cur[1]===bv[1]&&cur[2]>bv[2])))){bv=cur;best=p.join(d,v);}}}process.stdout.write(best);")"
```

If neither resolves, stop and tell the operator the plugin install could not be located
(re-install `vc-fix`, or run from the plugin checkout with an explicit path).

## Notes

- Node scripts themselves need no resolver once launched — they locate their own siblings and
  data files via `import.meta.url` (`skills/qa-fix-routing/ado.mjs`, `lib/paths.mjs`
  `pluginRoot()`, etc.). The resolver only supplies the initial **launch** path.
- `~/.claude/plugins/installed_plugins.json` carries the same data but is an **internal,
  undocumented** file — prefer `claude plugin list --json`.
