# vc-secrets — why the OAuth entry pair moves out of Credential Manager on Windows

**Date:** 2026-11-23 · **Status:** accepted; implemented in 0.3.0

Never loaded by an agent. The normative description of where a value is stored is
`plugins/vc-secrets/README.md` §Where a secret is stored, and under what key; this file records why the
OAuth entries stopped following it on Windows, and what was rejected on the way.

---

## The problem

A Credential Manager generic credential holds at most `CRED_MAX_CREDENTIAL_BLOB_SIZE` = 5 × 512 =
**2560 bytes** of blob ([CREDENTIALW](https://learn.microsoft.com/windows/win32/api/wincred/ns-wincred-credentialw#members)).
`lib/keystore.mjs` already knows the number (`WCM_BLOB_LIMIT`), and its write script exits 4 on
win32 error 1783 when a value exceeds it.

The OAuth **access** entry is a JSON object around the access token (`serializeAccess`: schema, token,
expiry, issue time, lifetime, uptime). The JSON wrapper is ~150 bytes; the rest is the token, and an
Entra access token carries the user's group claims. The size was measured at 2536 of 2560 bytes when the
oversize marker was written, growing about forty bytes per group membership; a machine with more
memberships has since been observed at **2906 bytes**. Shrinking the wrapper cannot help — the token alone
is over the ceiling.

What happens then is quiet by design: the access write is best effort (`storeAccessEntry`), the refresh
entry is smaller and still fits, so sign-in works. But no access token is ever cached, so **every launch
and every five-minute renewal tick performs a token exchange, and every exchange rotates the refresh
token**. The oversize marker and the doctor `WARN` make the condition visible; they do not remove it. The
`WARN` text itself named this outcome: *"this is the design's DPAPI contingency, and this line is its
trigger."* The trigger fired.

## Decisions

### D1 — On Windows the OAuth pair is stored in DPAPI-protected files

Each entry (refresh and access) becomes one file, `vc-secrets/secrets/<scope>/<name>.dpapi` (the gpg
backend's directory scheme), holding a `CryptProtectData` ciphertext under the **CurrentUser** scope. No
size ceiling applies.

The root is `%LOCALAPPDATA%`, not the `HOME`-derived `~/.config` the gpg backend uses. Credential Manager
is one store per Windows user whatever shell started the process; `HOME` is not — Git Bash, an IDE and
Explorer can disagree on it — and an entry found under one `HOME` and absent under another reads as
"not signed in", which costs a sign-in and a refresh-token rotation. `LOCALAPPDATA` is set by Windows for
every process of the user and does not roam, which matches a per-machine token. An explicit
`XDG_CONFIG_HOME` still wins, so a deliberate override (and the test suite) keeps working.

**Rejected — splitting the value across several Credential Manager entries (`<name>.0`, `<name>.1`, …).**
Each `CredWrite` is atomic for its own entry only; a set of entries is not. That matters here because the
cache is read **without** the token lock: the first read of a launch and every poll while a neighbour
holds the lock both read while the lock holder may be writing. Several servers that share one OAuth entry
are started together by the client at session start, so this overlap is the ordinary case, not a race to
dismiss. A reader would see chunk 0 of the new version beside chunk 1 of the old one. Making that safe
needs a manifest (count + hash), a commit protocol (generations and a head written last), garbage
collection of stale generations, and `CredEnumerate` on delete — an atomic-commit protocol rebuilt on top
of a key-value store, touching every Credential Manager code path (`buildLocalRead`, the batched read,
`batchedReadError`, delete, the write probe). A file replaced by `rename` gives readers the old version or
the new one and nothing in between, for free.

**Rejected — keep Credential Manager and accept the warning.** The status quo after the oversize marker:
visible, but still an exchange and a rotation on every launch and tick, indefinitely.

### D2 — Only the OAuth pair moves; `vc-secrets set` secrets stay in Credential Manager

A secret stored with `set` is a value the developer typed — a PAT, an API key — small enough for the
ceiling, and **not reproducible**: losing it means revoking and reissuing it. The OAuth pair is a cache:
the worst outcome of losing it is one interactive sign-in. Moving every local secret would buy a single
store per platform at the price of an automatic migration of every Windows user's typed credentials, for a
problem those credentials do not have. The blast radius decided it.

Consequence: on Windows two local stores are live at once, and the launch's single batched PowerShell
read must cover both (Credential Manager for secrets, DPAPI files for the pair), or every launch pays an
extra PowerShell start (1–3 s each, the reason the batch exists).

### D3 — The trust boundary does not change

Credential Manager stores its vault under the user profile encrypted with DPAPI, so the two stores share
one key hierarchy and one set of failure modes. Under CurrentUser scope, data is decryptable only under the
same logon credentials, normally on the same machine
([CryptProtectData remarks](https://learn.microsoft.com/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata#remarks)),
and by **any** process running as that user
([DpapiDataProtector.Scope](https://learn.microsoft.com/dotnet/api/system.security.cryptography.dpapidataprotector.scope?view=netframework-4.8.1)) —
exactly what `CredRead` already allows. An administrator's password reset can make previously protected data
unrecoverable ([example program, DPAPI scope and limitations](https://learn.microsoft.com/windows/win32/seccrypto/example-c-program-using-cryptprotectdata));
it does the same to Credential Manager, and for a cache the remedy is a sign-in.

The entry's full key is passed as DPAPI's optional entropy, so a ciphertext copied over another entry's
file does not decrypt as that entry.

### D4 — The file is written atomically and read by node, never by PowerShell

The ciphertext is written to a per-process `<name>.dpapi.<pid>.tmp` sibling and renamed over the entry,
as the gpg backend does — the pid because `login` stores even when the token lock is busy, so two
writers can meet; the gpg backend's fixed `.tmp` name has the same exposure and gets the same suffix.
Node's rename on Windows replaces an existing file — but not while any handle to it is open. A real
Windows run (2026-11-23) refused the rename with `EPERM` while this process held the file open through
`fs.openSync`, although node opens with share-delete: share-delete lets the name be marked for deletion,
not replaced. An earlier version of this record said a concurrent node reader does not block the rename;
that is wrong. What keeps a reader harmless is that `readDpapiFile` holds its handle only for one
`fs.readFileSync`, so its overlap with a rename is a momentary refusal of the kind the retry exists for.
A third party that opens the file without share-delete — an antivirus scan, the indexer — does the
same for longer; the run measured `EPERM` for it too, ridden out under a 150 ms hold and reported after
five attempts under a 3 s one. So the rename is retried briefly (`EPERM`/`EBUSY`/`EACCES`) before the
write is reported as failed.
Removing a file meets the same third party, so a removal is retried with the same policy — the stale
access file cleared before a migration publishes its refresh file, and the file a logout or a cleared
pair deletes. Unretried, one scan during a migration that holds a new refresh token signed the developer
out, and one during a logout failed it. A file already absent is not retried: that is the removal's
answer, not a refusal. The same run measured removal like rename: a 150 ms hold ridden out, a 3 s one
reported as `could not remove` after five `EPERM`s. `fs.rmSync`'s own `maxRetries` was not used for this: its documentation says the
option applies only with `recursive`, while Node 22 does retry a plain file under it, synchronously and
with no seam a test can replace — one policy for rename and removal, in one loop, is what stays checkable.
PowerShell receives ciphertext and returns plaintext on its standard streams, so every access to the
file — the read, the atomic write, the removal — stays in node, where one retry policy covers it and a
read holds its handle no longer than the read itself.

### D5 — DPAPI is reached through the same P/Invoke pattern as `CredWrite`

`crypt32!CryptProtectData` / `CryptUnprotectData` are declared through `Add-Type`, as the Credential
Manager scripts declare `advapi32`. The environments where that is refused (Constrained Language Mode) are
then exactly the ones where the Credential Manager scripts are already refused, with the same remedy, and
no dependency on which .NET the PowerShell host carries.

### D6 — Existing entries migrate by reading through, not by a migration step

When the **refresh** file is absent, the Credential Manager pair under the same keys is read as a
fallback — as a pair, never one entry from each store: a refresh file beside a Credential Manager access
entry could serve a previous principal's access token, the failure `cmdLogin` already deletes the access
entry first to prevent. The pair is written to files at the next exchange or sign-in, and the Credential
Manager entries are deleted once the refresh file is in place. A developer signed in before the upgrade
is never asked to sign in again. An exchange that returns no new refresh token (RFC 6749 §6 makes it
optional) carries the legacy refresh token into the file; otherwise the next read would find an access
file with no refresh file beside it and exchange again on every launch and tick.

The migration removes any access **file** before it publishes the refresh file. An access file with no
refresh file beside it is ignored by every read, but the moment a refresh file appears it is read again —
and it may belong to a previous principal (a pair whose refresh file was lost). Left in place, it would
be served as valid beside the migrated refresh token, to a reader that arrives while the legacy entries
are being deleted or after the new access write fails. A removal that fails for any reason other than
absence is handled as a failed refresh write: the legacy pair stays the store, or, with a newly issued
token, the pair is cleared and the error names `login`. Serving another principal's token is the outcome
ruled out; one extra sign-in is not.

Deleting the legacy pair after the refresh file is in place is best effort — the file decides from then
on — but not silent: a delete that fails for any reason other than absence prints one line naming the
entry and the remedy (`logout`, then a sign-in). It is not retried on later reads: that would cost a
PowerShell start on every read, and the copy left behind is the token the next rotation invalidates.

Every delete of an OAuth entry — `logout`, the access entry `login` clears first, the pair a renewal
clears when it cannot store a newly issued refresh token — removes the Credential Manager entry of the same
key **and** the file, in that order. Otherwise the fallback would bring back a token that `logout`
reported removed; and the order means a failure part-way leaves the file, which decides the store, rather
than a legacy entry the next read would fall back to.

A **refresh** file DPAPI refuses to decrypt (after an administrator's password reset, or a profile copied
to another machine) is read as absent with a notice naming the entry and `vc-secrets login`, exactly as an
entry that is not readable JSON: the remedy is a sign-in, and failing the launch over a cache helps
nobody. An undecryptable **access** file beside a good refresh file costs one exchange, and its notice
says so.

### D7 — `doctor` still does not exchange

Proposed alongside: let `doctor` redeem the refresh token so an expired sign-in (`invalid_grant`,
`AADSTS50078` under Conditional Access) is reported directly rather than as "the next launch will renew
it". Rejected for the reason `lib/doctor.mjs` already states: a refresh grant rotates the refresh token, so
the diagnostic would change the state it reports on. Out of scope here.

## What becomes unreachable

Exit 4 comes only from the Credential Manager write script, and once no OAuth entry is written there
the oversize marker (`recordOversizeMarker` and its siblings), `storeAccessEntry`'s marker parameter,
`cmdLogin`'s `oversize` seam and the doctor `WARN` have no producer left. They are removed with this
change rather than kept as dead guards. A marker file already on disk is left where it is — it holds no
secret — and nothing reads it any more. `mapResolveError`'s exit-4 message stays: `vc-secrets set` of an
oversized value still reaches it.

The write probe keeps its Credential Manager leg, re-worded to what it now proves (that `set` can store a
value up to the ceiling), and gains a DPAPI leg that stores and reads back a value well over the old
ceiling, so the `OK` printed for login and renewal is about the store they actually use.
