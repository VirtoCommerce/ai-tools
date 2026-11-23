# vc-secrets — why `set` on macOS reads the value itself

**Date:** 2026-11-23 · **Status:** accepted; implemented in 0.3.0

Never loaded by an agent. The normative description of `set` is the `set <name>` row of the verb table in
`plugins/vc-secrets/README.md`;
this file records why its macOS path changed, and what was rejected on the way.

---

## The problem

On every backend but one, `vc-secrets set` read the value with its own hidden prompt (`promptHidden`,
`lib/cli.mjs`) and wrote it non-interactively. On macOS it did not: it ran
`security add-generic-password -U -a <account> -s <key> -w` with no value after `-w`, so `security`
prompted on the terminal itself.

That prompt keeps the first **128 characters** of what is typed and drops the rest without a word. `security`
exits 0, `set` prints that the value was stored, and nothing is wrong until the service the secret belongs to
refuses it. A long API token — around 190 characters in the case that surfaced this — is stored cut, and the
401 that follows names neither the length nor the prompt.

Nothing on our side can see the truncation: the value never passes through `vc-secrets`, so there is no
length to compare against.

## The decision

`set` reads the value with `promptHidden` on macOS too, and writes it through `security -i`, with the whole
`add-generic-password` command on **stdin** (`stdinCommand`, quoted by `quoteForSecurityInteractive`). That is
the path `migrate`, `login`, token renewal and the doctor's keychain probe already used, so `set` stopped being
the one writer that differed from what the doctor checks.

Two limits come with that path, and both refuse rather than degrade:

- **The command line.** `security -i` reads one line of at most `SECURITY_LINE_LIMIT` = 4095 bytes, for the
  whole command — account and key included. A value that does not fit is refused with that reason. Storing a
  value cut is the defect being fixed, so it is not an acceptable outcome at a larger size either.
- **A line ending in the value.** It cannot be written as one `security -i` line. The keychain builder's only
  other route puts the value in argv, so `set` refuses such a value instead of taking it. `promptHidden` ends
  input at a line ending, so this guards the builder's contract rather than a case a person can type.

The interactive keychain build — the `security … -w` with no value — had no remaining caller and was removed,
together with the `interactive` branch in `cmdSet` that ran it.

## Rejected

- **`-w <value>` in argv.** It stores the whole value, and puts the secret in the process table, where any
  process of the same user can read it for as long as `security` runs. The README promises that a value never
  appears in argv; this would break that promise on one platform.
- **Keep the `security` prompt and warn about long values.** The prompt reads the terminal directly, so
  `vc-secrets` never learns the length that was typed. A warning printed unconditionally would be noise on
  every short secret and still store the long one cut.

## Verified by

The unit suite drives `cmdSet` on the keychain backend with an injected prompt and runner: a 190-character
value reaches `security -i` stdin whole and appears nowhere in argv, an empty value and an oversized command
are refused with nothing spawned. A run against a real Keychain — `set` a value over 128 characters, then
`security find-generic-password -a "$USER" -s "<key>" -w | wc -c` equals its length + 1 — needs a Mac and is
done by hand.
