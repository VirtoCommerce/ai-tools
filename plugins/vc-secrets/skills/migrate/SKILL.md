---
name: migrate
description: "One-time: move user-scope secrets stored under the older flat `mcpw:` key prefix to their namespaced keys. A repository's local-store secret is skipped. Needed only on a machine that used the launcher this plugin replaces — otherwise every user-scope local-store secret not already set reports `no legacy entry`. Idempotent."
disable-model-invocation: true
---

# migrate — carry existing secrets over to the namespaced keys

Keys are now namespaced by the declaration's home (`vc-secrets:<projectId>:<name>`,
`vc-secrets:user:<name>`) instead of the older flat `mcpw:<name>` credential (Credential Manager,
Keychain) or `~/.config/mcpw/secrets/<name>.gpg` (gpg, `$XDG_CONFIG_HOME` honoured). This copies what
is already stored under that legacy key, for the secrets your own user file declares: a legacy entry has
no scope, so it is your own value, and a local-store secret a repository declares is skipped
(`declared by this repository`) rather than handed to that repository's namespace. If this machine never
ran the older launcher, there is nothing to migrate — every user-scope local-store secret not already set
reports `no legacy entry` and the command can be ignored.

## Why this exists rather than "just set them again"

`set` needs the plaintext, and the credential store will not hand a value back — that is the whole
point of putting it there. A developer whose PAT exists only under the old key cannot retype it; they
would have to mint a new one. Across a team, renaming a key prefix would become a credential
rotation. So the launcher reads the old entry itself and writes the new key, never printing the value.

## Run it

On a client that substitutes plugin placeholders into this file before you see it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/vc-secrets.mjs" migrate
```

On a client that substitutes nothing, the launcher sits two directories above this one — resolve the
relative path against **this file's directory**, not the working directory:

```bash
node ../../vc-secrets.mjs migrate
```

On the gpg backend the agent has to be warm first, so run the same launcher's `unlock` verb in a
terminal before this — `migrate` itself never prompts, it reads with pinentry disabled and fails fast
on a cold agent rather than waiting for a passphrase nobody can type. That works even here, before
anything has been migrated: `unlock` decrypts whichever of the current or the legacy stored file
exists, so it warms the agent equally well before a migration as after one.

If every secret reports as unreadable, check whether the shell can reach your credential store at all
(a sandboxed or restricted shell cannot read `~/.gnupg`, the Keychain or Credential Manager). That
answer is about the shell, not about the stored secrets.

## What it does per secret

| Outcome | Meaning |
|---|---|
| `migrated` | the legacy entry was read and written under the new key |
| `already present` | the new key already resolves — nothing to do |
| `no legacy entry` | nothing to carry over; `set <name>` is the next step |
| `declared by this repository` | a project- or local-scope declaration, so it was skipped and nothing was read or written. The legacy entry has no scope: it is your own value, and copying it into a repository's namespace would hand it to that repository's trusted servers. Run `set <name>` if the repository should have its own |
| `cannot tell whether it is already migrated, refusing to touch it` | the store answered neither "here it is" nor "absent" — a cold gpg agent, a timeout, a wrong recipient. Nothing was written, deliberately: the alternative is overwriting a current value with a stale one. Fix the store (`unlock`, or check the backend) and re-run |
| `migration failed` | the write itself failed; the old entry is untouched |

The run exits non-zero if any secret failed or could not be judged. Idempotent, so re-running is safe —
but do not run it alongside a `set` of the same secret: it decides "already migrated?" and then writes,
so a value stored in between would be overwritten with the older one. The legacy `mcpw:<name>` entry (or `~/.config/mcpw/secrets/<name>.gpg`) is left in place: nothing reads
it, and deleting it would add a second way to fail. Remove it by hand later if you want the store tidy.

## Report

The per-secret lines verbatim plus the final count, then run the `doctor` verb and confirm the
migrated names now report `OK`. If any secret says `no legacy entry`, list it explicitly — that is a
value nobody has, and the operator needs to know before a server fails at launch. Likewise list every
secret that says `declared by this repository`: it was not moved, and each needs `set <name>` if the
repository is to have its own.
