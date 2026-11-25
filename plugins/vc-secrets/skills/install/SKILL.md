---
name: install
description: "Put the vc-secrets shim at a stable path in the data directory of the client that installed the plugin, and print what that client's config needs plus the literal commands that use it. Run once per machine. NOT needed after an ordinary plugin update — the shim resolves the plugin's current location by itself."
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/install-shim.mjs" *)
---

# install — make the launcher reachable from a repo

A repo's committed MCP config cannot name the launcher's real location: plugin files live in a cache
directory whose path carries the plugin version, and several versions coexist there after an update —
so a hand-written path into it does not merely break, it keeps resolving to an old launcher. The
stable path holds `vc-secrets-shim.mjs`, a pointer that resolves the current install per launch, and
repos reference the shim through one variable.

## Run it

On a client that substitutes plugin placeholders into this file before you see it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install-shim.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}"
```

On a client that substitutes nothing — one that reads this file's frontmatter and leaves the body to
you — the same script sits two directories above this one, and `--data-dir` is omitted:

```bash
node ../../scripts/install-shim.mjs
```

Resolve that relative path against **this file's directory**, not the working directory.

Both placeholders are substituted in a plugin skill's markdown content and in the `allowed-tools` Bash
rules; the same variable in both places is what lets the script run without a permission prompt. The
script does not trust the `--data-dir` value on arrival — it checks that the directory names this
plugin — and it does not read either placeholder to find the shim it copies: that comes from the
script's own location, so a plugin root belonging to something else cannot redirect the source. Where the
placeholder is not substituted the line is an ordinary shell line, so the shell expands it from the
inherited environment instead, and an argument and an expansion are indistinguishable by the time the
script reads them. That is why the check exists rather than the trust.

With `--data-dir` absent or empty the script installs into the data directory of the client it was
installed by, read from where the script itself sits: `~/.claude/plugins/data/` for Claude Code,
`~/.codex/plugins/data/` for Codex, `~/.cursor/plugins/data/` for Cursor. Each client's copy is its own,
so uninstalling the plugin in one client never takes another client's shim with it. A plugin loaded from
`~/.cursor/plugins/local` gets no shim at all: that directory is updated in place and its path carries no
version, so the script names the launcher there directly. What the shim *resolves to* is not tied to its
path: a Codex or Cursor copy tries its own client's plugin cache first, then the install registry Claude
Code keeps, then the other clients' caches; Claude Code's copy reads that registry first, as before, since
only the registry knows per-project installs.

The script does the three exact things — resolve the stable directory, copy the shim (a Cursor local copy gets none, and its launcher is named
instead), print what to paste
for this client and the commands that use it — so they come out the same on every machine and are covered by tests.
It is idempotent: a second run reports `already up to date`.

It deliberately **prints** rather than writes. `~/.claude/settings.json` belongs to the developer, and a
tool that edits it unasked is a tool nobody trusts twice. There is no shell setup to do: `set`, `login`,
`unlock`, `doctor`, and `migrate` are run with the shim's literal path, which the script already computed.

## Then verify

```bash
node "${CLAUDE_PLUGIN_ROOT}/vc-secrets.mjs" doctor
```

```bash
node ../../vc-secrets.mjs doctor
```

1. **Relay its output verbatim.** What to paste depends on the client — a `settings.json` entry for
   Claude Code, the `emit-config` output for Codex, an exported `VC_SECRETS` plus the `emit-config`
   output for Cursor — and a wrapped MCP server picks it up only after a restart — say so. The commands below it are what a human runs by
   hand; they need nothing added to a shell.
2. **Run the `doctor` command the script prints** and report its output. On a machine with no declaration
   file yet the whole output is `FAIL no declaration file found` — expected at this point, not a bug
   report. The next step is writing a declaration, then `set`.
3. If the script exits non-zero, relay its message and stop. `vc-secrets-shim.mjs not found` means the
   shim is missing beside the script, i.e. this is not a complete plugin install; a `--data-dir` that is
   not an absolute path means the placeholder reached the script as text, which a shell would have
   expanded, so the line ran somewhere neither substitutes.

## Report

The shim's path, whether it was installed / replaced / already current, what to paste for this client,
the literal commands, and the `doctor` output. The path is printed with how the directory was chosen: anything other than `--data-dir`
means the placeholder did not reach the script, and the warning naming the ignored directory has to be
passed on too. The shim works either way, but a substitution that never happens is worth knowing about
before it is depended on elsewhere.
