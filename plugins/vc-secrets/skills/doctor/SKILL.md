---
name: doctor
description: "Run the vc-secrets diagnostic and interpret it — which declarations loaded, which secrets resolve, which need migrating, and what to do about each FAIL. Use when a wrapped MCP server shows failed, or after any change to a declaration."
argument-hint: "[--all]"
---

# doctor — diagnose the secret path

## Run it

On a client that substitutes plugin placeholders into this file before you see it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/vc-secrets.mjs" doctor   # add --all to force-check Key Vault secrets no enabled server consumes
```

On a client that substitutes nothing, the launcher sits two directories above this one — resolve the
relative path against **this file's directory**, not the working directory:

```bash
node ../../vc-secrets.mjs doctor                     # add --all for the same reason
```

**The shell must be able to reach the credential store.** `doctor` decrypts for real, so a restricted
or sandboxed shell — one that cannot read `~/.gnupg`, the Keychain or Credential Manager — reports a
`FAIL` on every local secret while saying nothing about the actual configuration. The tell is that
*all* of them fail at once. If the restriction cannot be lifted, say so and stop rather than reporting
those FAILs as findings.

## Reading the output

| Prefix | Meaning | Next step |
|---|---|---|
| `OK` | resolved | — |
| `INFO` | which declaration files loaded | confirm the expected scopes are there; a missing project file usually means the wrong working directory |
| `INFO <server/task> "x" (home) is authorized to receive "y"` | a project- or local-declared server or task — or a user-scope one whose secret or sign-in a repository's declaration replaced — consumes a secret or oauth entry whose authorization lives in your user file | allowed and often intended; report it so the operator knows the crossing exists |
| `FAIL <server/task> "x" (home) wants <secret\|oauth> "y" and is not authorized` / `... authorized for a different shape` | the same crossing, but the granting file has not granted it, or the launch shape has drifted from what was granted | paste the JSON block the line prints under the `where` it names, in the user file |
| `FAIL <server/task> "x" is declared by <file> ... and is not trusted` / `... changed since you trusted it: ...` | a repository's own declaration names what an approved client entry runs, and the operator has not reviewed this argv in this repository (or it changed since) | show the operator the line, and ask them to review the declaration and run `vc-secrets trust` in the named directory **in their own terminal**. Do not try to run it yourself: it requires an interactive terminal so that trusting is the operator's own confirmation, which a pipe, a script or a plain shell tool cannot give (a process that allocates its own pseudo-terminal could; that is why the instruction is to ask the operator, not to work around it) |
| `FAIL <server/task> "x" (user) reads <secret\|oauth> "y" from namespace "p", which this repository declares, and this checkout is not trusted` / `... and the projectId changed since you trusted this checkout: ...` | the operator's own user-scope server or task reads a `local`-backend secret or an `oauth` entry that a repository declares; those are stored under the repository's `projectId`, which the repository can set to another project's, so the launch needs this checkout's trust record with that `projectId` | show the operator the line, and ask them to check the `projectId` and run `vc-secrets trust` in the named directory **in their own terminal**, as for the line above. A changed `projectId` they did not change themselves is the finding |
| `FAIL the trust file … could not be read` / `... is unusable` | the trust file is unreadable or malformed, so every repository-declared launchable — and every user-scope one reading a repository's namespace — is refused, and `doctor` reads no repository `local` secret or `oauth` cache either | report the named file; the operator fixes it, or deletes it and re-runs `vc-secrets trust` in each repository |
| `INFO oauth "y" (home): no registration block yet -- add {} under <where> ...` | a non-user-scope oauth entry has no registration block, and no non-user-scope launchable has already reported the same path | add `{}` at the named path so `vc-secrets login y` will run |
| `INFO oauth "y": a renewed token reaches <server/task> "x" only if it reads <ENV> from its environment at each use -- ...` | printed for every launchable that consumes oauth entry `y` whose cache `doctor` checked (an entry it `SKIP`ped because this checkout is not trusted for its namespace gets none); it is a standing caveat, not a finding. Renewal replaces the variable in the supervised launch's environment, so a server that copied it at startup keeps running on the launch token until it expires | relay it once; if the operator reports the server failing on an expired token while sign-in is `OK`, this is the cause (see below) |
| `INFO … still required until the vc-secrets switch lands` | a plaintext token is present and this project has nothing wired yet | expected mid-migration; it becomes the `WARN` below once a server is wrapped |
| `WARN the installed shim speaks contract N` | the shim predates the launcher | re-run the vc-secrets install skill |
| `WARN … only under the legacy key` | the value exists, under the pre-plugin key | run the vc-secrets migrate skill — it cannot be re-typed, the store never hands a value back. `doctor` raises this for user-scope secrets only, because `migrate` skips a repository's secret; that one reports as not resolvable and is `set` instead |
| `WARN … declared in both` | the same name in two homes | intended override, or an accident — say which one wins and let the operator decide |
| `WARN … unknown key … ignored` | the declaration is ahead of the installed launcher | update the plugin, or drop the key |
| `WARN <name> present in settings.local.json env — remove it (servers now read via vc-secrets)` | one of the five names the launcher watches (`ADO_MCP_AUTH_TOKEN`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`) is still set in plaintext | remove the first three — they are stripped from the child and nothing reads them once wrapped. The two identifiers (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`) are **not** stripped — a server may legitimately inherit a tenant id — so remove them only once your declaration supplies them. This is a fixed list of five names, not a general plaintext sweep |
| `FAIL` | not resolvable | `set` it, or `az login` for a Key Vault secret |
| `FAIL wcm rejected a write at the size limit` | Credential Manager refused a value at its documented blob limit — the only backend with a size verdict here, and the only one this line can name | a store limit, not a configuration error: the token this machine produces may not fit, and no declaration change helps |
| `FAIL <backend> refused a write` | the rehearsal write failed for anything else — a locked keychain, a sandbox, a timeout — with the cause on the same line after the colon | act on that cause, not on size. The probe does not run at all when the backend's tool is missing, so a missing tool appears once, as its own FAIL. The probe's throwaway entry sits under the repository's `projectId` only in a trusted checkout, and under `user` otherwise, so this line says nothing about the repository's namespace either way |
| `SKIP secret "y" (keyvault) -- no enabled server consumes it` | a Key Vault secret no enabled server consumes | `--all` to check it anyway |
| `SKIP secret "y" not read -- this checkout is not trusted for namespace "p"` / `SKIP oauth "y" not read -- ...` | a `local` secret or an `oauth` entry the repository declares, stored under the repository's `projectId` (which it can set to another project's), and this checkout has no trust record for that id — `doctor` did not read the keystore for it | show the operator the line, and ask them to check the `projectId` and run `vc-secrets trust` in the repository **in their own terminal**, as for the trust lines above; then re-run. Do not read the entry another way |
| `SKIP secret "y" not checked -- this checkout is not trusted for namespace "p"` / `SKIP oauth "y" not checked -- ...` | not a `doctor` line: what `unlock` prints for a `local` secret or `oauth` entry the repository declares, under the same condition as the `SKIP ... not read` above — it did not check or decrypt that entry | the same: the operator reviews and runs `vc-secrets trust` in their own terminal, then re-runs `unlock` |
| `<secret\|oauth> "y" is stored in namespace "p", which this repository declares, and this checkout is not trusted` / `... and the projectId changed since you trusted this checkout: ...` | not a `doctor` line: the refusal `set`, `login` or `logout` prints for a repository's entry, with nothing written or deleted. Same cause as the `SKIP` above | the same: the operator reviews and runs `vc-secrets trust`; a changed `projectId` they did not change themselves is the finding |
| `SKIP secret "y" not read -- declared by the repository, and no trusted, authorized consumer uses it` | a Key Vault secret the repository declared, and no launchable that references it is both trusted and authorized — `doctor` did not call `az` for it, and `--all` does not change that | resolve the `FAIL` lines for the consumer (trust it, or paste the block its crossing line prints), then re-run |
| `WARN <file>: cannot be read … so advice about leftover tokens may be wrong` | the file behind a wiring check couldn't be read | the legacy-token verdict above it is unreliable — fix the read access and re-run |
| `WARN … looks like a mistyped reference but is treated as a literal` | an env value looks like a `secrets:`-style typo for `secret:<name>` | fix the reference, or confirm the literal is intended |
| `WARN … projectId is meaningless at user scope` | a user-scope declaration sets `projectId` | remove it — user scope doesn't use one |
| `FAIL server "x" env Y: undeclared <secret\|oauth> "z"` | the env entry references a secret or oauth name absent from `secrets`/`oauth` | declare it, or fix the typo — this is different from the plain `FAIL` row above, which means a *declared* secret or oauth entry didn't resolve |

Exit code is 1 if any line is a `FAIL`, so it works as a gate in a script.

## Then, if a server still fails

`doctor` answers "is the secret resolvable". It says nothing about the server binary. For that, run
the probe, which completes a real `initialize` handshake through `run`. When nothing answers, it
separates three cases rather than reporting one: no token could be obtained (routine — nobody has
signed in yet), the launcher refused for some other reason, or the server binary exited without
answering. Only the last is the binary's fault:

```bash
node "${CLAUDE_PLUGIN_ROOT}/vc-secrets-probe.mjs" <server>
```

## A server that worked, then lost access

Neither check above sees this one, and it is the only failure here that arrives late: the secret
resolves, the handshake succeeds, and an `oauth:`-backed server serves normally until the token it
started with expires. The cause is a renewal with nowhere to go — no process matched the declared
`targetPackage`/`binName`, so nothing was ever handed the new token.

`doctor` cannot report it: the condition exists only inside a launch. The launcher does, on its second
renewal tick, to its own stderr — which is where the client keeps a wrapped server's log:

```
vc-secrets: still nothing connected to the token channel -- no process has matched the declared
target (targetPackage "...", binName "..."), so the server is running on the token it started
with and will lose access when that one expires
```

The usual cause is a missing or wrong `binName`. Check it against the package's own `bin` entry: the
key is the name to declare, and the value says whether the `dist/index.js` alternative can match at
all — `../../README.md` has the rule and the packages it does not hold for.

A third cause prints no finding of its own, only the standing `INFO oauth` caveat above: the target
matched, but the server read the token once at startup and keeps its own copy. Renewal replaces the variable the `oauth:` reference is bound to in the server's
`process.env`, so only a server that reads it from there at each use gets the new token; one that caches
it runs on the launch token until it expires. That is a property of the server's code, not of the
declaration.

## Report

The output verbatim, then one line per non-`OK` entry saying what it means and the exact command to
fix it. Do not fix anything that changes a credential without asking first.
