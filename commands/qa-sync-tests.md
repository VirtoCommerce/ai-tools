---
description: "[Deprecated] Redirects to /qa-test-lifecycle — use that command instead for change-driven test sync and quality review."
argument-hint: "PR #NNN | VCST-XXXX | module <name> | diff | changelog <version>"
disable-model-invocation: true
---

# /qa-sync-tests — Redirects to /qa-test-lifecycle

This command has been merged into `/qa-test-lifecycle`, which now handles both change-driven sync and quality review in a single 6-phase pipeline.

## Migration

| Old command | New command |
|-------------|-------------|
| `/qa-sync-tests PR #123` | `/qa-test-lifecycle PR #123` |
| `/qa-sync-tests VCST-1234` | `/qa-test-lifecycle VCST-1234` |
| `/qa-sync-tests module orders` | `/qa-test-lifecycle module orders` |
| `/qa-sync-tests diff` | `/qa-test-lifecycle diff` |
| `/qa-sync-tests changelog 3.850.0` | `/qa-test-lifecycle changelog 3.850.0` |
| `/qa-sync-tests PR #123 --dry-run` | `/qa-test-lifecycle PR #123 --report-only` |
| `/qa-sync-tests PR #123 --ci` | `/qa-test-lifecycle PR #123 --ci` |
| `/qa-sync-tests PR #123 --skip-verify` | `/qa-test-lifecycle PR #123 --skip-verify` |

## Action

When this command is invoked, **immediately redirect** to `/qa-test-lifecycle` with the same arguments. Pass all arguments and flags through unchanged. The `--dry-run` flag maps to `--report-only`.
