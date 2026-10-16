# Scripts — bash, PowerShell and JS/TS that workflows and actions run

The code in `run:` blocks **and** in the files an action executes: `actions/*/scripts/*.sh|*.ps1|*.jq`,
`actions/*/src/**` and the `main`/`pre`/`post` entry of a Node action. `security.md` covers what reaches
a script from outside (`${{ }}` in `run:`, `GITHUB_ENV`); this file covers what the script then does.
Claims about shell or runtime behaviour cite the page they rest on, on a host in the hook's `WEB_HOSTS`
(`SKILL.md` §Inputs) — anything else the helper cannot fetch. The ones below are checked:
[workflow syntax → `shell`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[about_Preference_Variables](https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_preference_variables).

## Every language

- **Untrusted values as code.** A PR title, branch, label, comment body, issue text, artifact or
  file from the PR reaching `eval`, `bash -c "$x"`, `Invoke-Expression`, `iex`, `& ([scriptblock]::Create($x))`,
  `child_process.exec(\`… ${x}\`)`, `execSync`, `spawn(..., { shell: true })`, or a URL / path / SQL /
  JSON built by string concatenation. The safe shapes: an argument array (`execFile`, `spawn` without
  a shell, `& $exe @args`, `"$x"` quoted), and a parser for structured data (`jq --arg`,
  `ConvertTo-Json`, `JSON.stringify`).
- **Secrets in output.** `echo`/`Write-Host`/`console.log` of a token, a URL with a token in it, a
  whole env dump (`env`, `Get-ChildItem env:`, `printenv`, `JSON.stringify(process.env)`), `set -x` or
  `Set-PSDebug -Trace` around secret use, an HTTP client's debug logging. A secret built or transformed
  in the script (base64, a header) needs `::add-mask::` / `core.setSecret` **before** it is printed.
- **Writes to `$GITHUB_ENV` / `$GITHUB_OUTPUT` / `$GITHUB_PATH`** of a value that can hold a newline:
  the multi-line delimiter form with a random delimiter, or `core.exportVariable` / `core.setOutput`,
  which do it for you.
- **Failure that does not fail.** An error is caught and logged, the script exits 0, and the step goes
  green — on a gating or release job that is **major** (`correctness.md`).
- **Temp files and paths**: predictable names in a shared temp dir, `rm -rf "$dir/"` with `$dir`
  possibly empty, `Remove-Item -Recurse` on a computed path — check the empty and the unexpected value.

## bash / sh

- **Error handling is set by the shell keyword, not by the script.** `shell: bash` runs
  `bash --noprofile --norc -eo pipefail {0}`; a `run:` with no `shell:` on Linux/macOS runs `bash -e {0}`
  — **no `pipefail`**, so `cmd | tee log` hides `cmd`'s failure. A script **file** gets only what its
  own `set` line gives it: no `set -euo pipefail` (or equivalent checks) in a `.sh` that gates
  something is a finding.
- **`set -e` does not fire** inside `if`/`while` conditions, in `cmd || x`, `cmd && x` (left side), in
  `$(…)` assigned with `local x=$(…)`, or in a function called from a condition — read the code path,
  not the `set` line.
- **Quoting.** Unquoted `$var` / `$(…)` splits and globs; `"$@"` not `$*`; `[[ ]]` with a quoted
  right-hand side when a literal match is meant. Shellcheck (`static-tools.md`) catches most of it.
- **`jq`**: `--arg`/`--argjson` for values, never string-built filters; `-e` when "null" must fail;
  `-r` output piped onward unquoted.
- **Portability**: GNU-only forms (`sed -i` with no suffix argument, `date -d`, `base64 -w`) fail on
  macOS runners, and the BSD form `sed -i ''` fails on Linux and in Git Bash on Windows (both GNU).

## PowerShell (`pwsh`, `powershell`, `.ps1`)

- **Which shell.** `shell: pwsh` is PowerShell 7 and the default on Windows runners;
  `shell: powershell` is Windows PowerShell 5.1. A `.ps1` started as `pwsh -File x.ps1` from a `run:`
  gets none of the runner's preamble below.
- **Native command failures do not stop the script.** The runner prepends
  `$ErrorActionPreference = 'stop'` and appends an exit with `$LASTEXITCODE` — but `Stop` acts on
  cmdlet errors only. With `$PSNativeCommandUseErrorActionPreference` at its default `$false`, a
  failing `git`, `docker`, `dotnet`, `az` in the middle of a script is ignored and only the **last**
  command's exit code reaches the step. Look for: `$LASTEXITCODE` checked after every native call that
  matters, or `$PSNativeCommandUseErrorActionPreference = $true` (PowerShell 7) at the top.
- **`2>&1` and stderr**: a native tool that writes progress to stderr becomes an error record under
  `Stop` in some versions and not others — read how the script handles it rather than assume.
- **`$GITHUB_ENV` from PowerShell**: append with `Out-File -Append -Encoding utf8` /
  `Add-Content -Encoding utf8`. Windows PowerShell 5.1's `>>` writes UTF-16, which the runner does not
  read as the expected `NAME=value` lines — a silent no-op.
- **Strings as code**: `Invoke-Expression`, `iex`, `Start-Process` with a single command-line string,
  `cmd /c "…$x…"`; argument arrays (`& $exe @argList`) are the safe shape.
- **Strictness**: `Set-StrictMode -Version Latest` absent in a long script means typos in variable
  names read as `$null` — a correctness smell, minor.
- **Credentials**: `ConvertTo-SecureString -AsPlainText` from a literal, credentials in a URL passed
  to `Invoke-WebRequest`, `-SkipCertificateCheck`.

## JavaScript / TypeScript actions (`using: node*`)

- **Runtime.** `runs.using` names a Node version GitHub still supports; a bump changes the runtime
  every consumer gets on its next pin move (`contract.md`). The bundle in `dist/` is checked by the
  repository's `check-dist` gate — review `src/` and the lockfile, not the bundle.
- **Inputs and context are untrusted** when the trigger lets outsiders set them:
  `github.context.payload.pull_request.title|body|head.ref`, comment bodies, labels. Their path into
  `@actions/exec` (`exec.exec(cmd, args)` with a real args array is safe; `exec.exec(\`… ${x}\`)` parses a
  command line), `child_process`, URLs, file paths, Markdown posted back to GitHub.
- **`@actions/core`**: `core.setSecret` for any derived secret before it is logged; `core.setFailed` on
  every failure path (an unhandled promise rejection or a `catch` that only logs leaves exit code 0);
  `core.getInput(..., { required: true })` where the code assumes a value.
- **Tokens**: an Octokit client built from an input token — what scopes does the action assume, and
  is the token ever logged, put in a URL, or passed to a third-party host?
- **Dependencies** (`package.json`, `package-lock.json`): a new dependency, a major bump, an
  `install`/`postinstall` script, a git or tarball URL instead of a registry version, a lockfile that
  changes far more than `package.json` explains. Each runs inside the job with its token.
- **Async**: un-awaited promises (the step ends before the work does), `Promise.all` where one failure
  must not hide the others, retries without a bound.
