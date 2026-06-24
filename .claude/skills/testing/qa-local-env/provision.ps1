#requires -Version 7.0
<#
.SYNOPSIS
  Non-interactive driver for a local Virto Commerce QA stack via VirtoCommerce start-local
  (backend + storefront + DB + Redis + Elasticsearch), pinned to a custom package manifest.

.DESCRIPTION
  Wraps start-local's interactive PowerShell + Docker Compose scripts and drives them
  non-interactively with the correct paths. Verified end-to-end on 2026-06-24.

  Behaviour (per the skill's contract):
    • Default modules come from the manifest you pass (-Manifest), produced by gen-manifest.mjs
      from vc-deploy-dev@vcptcore-demo; with a task, that manifest is augmented upstream.
    • REBUILD-IF-CHANGED: the backend/frontend images are rebuilt only when the manifest differs
      from the last built one (or images are missing). gen-manifest is run fresh by the caller each
      time, so upstream version drift is picked up automatically.
    • FRESH DB EVERY RUN: every start wipes ALL data volumes (DB + search index + cache) so the env
      is deterministic — no migration of stale data against a rebuilt image. (Cleaning the DB is cheap;
      the expensive image build is still skipped when the manifest is unchanged.) Seed fixtures after
      with `npm run seed:*`.
    • ADMIN PASSWORD: after start, init-admin.mjs ensures admin == Password1! (changes the seed
      'store' on the fresh DB) and writes ADMIN_PASSWORD_LOCALHOST to .env.local.

  Layout (verified): everything lives under <WorkDir>/VirtoLocal (start-local's default basename).
  All start-local scripts run from <WorkDir> with the basename "VirtoLocal" (never a nested path)
  so the docker compose project is "virtolocal" and the platform container is
  "virtolocal-vc-platform-web-1". start-VC-solution refuses to start if its ports are in use, so we
  always 'down' first (frees ports + lets a rebuilt image take effect).

.PARAMETER Action  up (default) | bootstrap | build | start | stop | clean | remove | status
.PARAMETER Manifest        Custom packages.json (from gen-manifest.mjs). Required for build/up.
.PARAMETER WorkDir         start-local checkout dir. Default: <repo>/.local-env (gitignored).
.PARAMETER DbProvider      postgres (default) | mysql | sqlserver. Only applied at bootstrap; on an
                           already-bootstrapped env a DIFFERENT provider is a switch — since every run
                           wipes the DB (see below), a mismatch just triggers an automatic re-bootstrap
                           for the new engine (no flag needed).
.PARAMETER FrontendUrl     Optional storefront ZIP override (e.g. a frontend PR build).
.PARAMETER Branch          start-local TOOLING repo branch to bootstrap from (default: dev) — the
                           bootstrap scripts/Dockerfiles/compose, NOT the VC backend versions (those
                           come from the gen-manifest baseline, vc-deploy-dev@vcptcore-demo). Internal.

.EXAMPLE  pwsh -File provision.ps1 -Action up -Manifest .local-env/packages.custom.json
.EXAMPLE  pwsh -File provision.ps1 -Action up -Manifest .local-env/packages.custom.json -DbProvider sqlserver
#>
[CmdletBinding()]
param(
  [ValidateSet("up", "bootstrap", "build", "start", "stop", "clean", "remove", "status", "monitor")]
  [string]$Action = "up",
  [string]$Manifest,
  [string]$WorkDir,
  [ValidateSet("postgres", "mysql", "sqlserver")]
  [string]$DbProvider = "postgres",
  [string]$FrontendUrl = "",
  [string]$Branch = "dev",
  # Heartbeat cadence (seconds) for the long, otherwise-silent steps (build, /health wait). The noisy
  # child output (docker's thousands of "Downloading …MB" lines) is routed to a per-phase log file in
  # $WorkDir and ONE concise status line is emitted every $HeartbeatSec instead. 0 disables the heartbeat.
  [int]$HeartbeatSec = 60
)

$ErrorActionPreference = "Stop"
# Force UTF-8 console output so the status marks (✅ ⚠️ ❌) and box-drawing survive redirection to a
# pipe/file (the harness captures provision output to a file; without this they degrade to '?' under the
# OEM codepage). Guarded: no-op when there is no console handle.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8
$SkillDir = $PSScriptRoot
$RepoRoot = (Resolve-Path "$PSScriptRoot/../../../..").Path
if (-not $WorkDir) { $WorkDir = Join-Path $RepoRoot ".local-env" }
$SolutionName = "VirtoLocal"
$ProjectName  = "virtolocal"
$PlatformImage = "vc-platform:local-latest"
$LastManifest = Join-Path $WorkDir ".last-built-manifest.json"
$LastFrontend = Join-Path $WorkDir ".last-built-frontend.txt"
# Records the DB provider the env was bootstrapped with. -DbProvider only takes effect at bootstrap
# (it shapes the generated docker-compose.yml + .env), so we persist it here to detect a later
# provider switch instead of silently honouring the originally-bootstrapped engine.
$DbMarker     = Join-Path $WorkDir ".bootstrapped-db.txt"
$BootstrapScript = "VirtoLocal_create_local_files.ps1"
$BootstrapUrl = "https://raw.githubusercontent.com/VirtoCommerce/start-local/$Branch/$BootstrapScript"
# All named data volumes (compose declares them with the virto_ prefix).
$DataVolumes = @(
  "virto_postgres_data", "virto_mysql_data", "virto_mssql_data",
  "virto_esdata01", "virto_redisdata", "virto_cms-content-data", "virto_modules-data"
)
# Ports start-local checks before it will start (it refuses to start if any is busy).
$RequiredPorts = @(80, 8090, 9200, 5601, 6379, 5432)

# ── Visual vocabulary ─────────────────────────────────────────────────────────
# Consistent status marks across every step: ✅ green = pass, ⚠️ yellow = advisory,
# ❌ red = fail, · grey = info. Emoji are placed at line-start (never inside aligned
# columns) so their cell-width never breaks layout.
$Bar      = "─" * 62
$BarHeavy = "═" * 62
function Write-Step($m) { Write-Host ""; Write-Host "▸ $m" -ForegroundColor Cyan }
function Write-Pass($m) { Write-Host "  ✅ $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "  ⚠️  $m" -ForegroundColor Yellow }
function Write-Fail($m) { Write-Host "  ❌ $m" -ForegroundColor Red }
function Write-Note($m) { Write-Host "  ·  $m" -ForegroundColor DarkGray }

# Map a `docker ps` status string to a (icon, color) pair: Up→✅, unhealthy→⚠️, else→❌.
function Get-StatusMark([string]$Status) {
  if ($Status -match 'unhealthy')        { return @("⚠️", "Yellow") }
  elseif ($Status -match '^Up')          { return @("✅", "Green") }
  else                                   { return @("❌", "Red") }
}

# Print the project's containers as marked rows (shared by Show-Summary + Show-Monitor).
# Returns the count of running containers. Names are shown without the project prefix.
function Write-ContainerRows([string]$Indent = "     ") {
  $rows = @(docker ps -a --filter "name=$ProjectName" --format "{{.Names}}|{{.Status}}" 2>$null)
  foreach ($row in $rows) {
    $name, $status = $row -split '\|', 2
    $short = $name -replace "^$ProjectName-", ""
    $mark, $color = Get-StatusMark $status
    Write-Host ("{0}{1} {2,-22} {3}" -f $Indent, $mark, $short, $status) -ForegroundColor $color
  }
  return @($rows | Where-Object { ($_ -split '\|', 2)[1] -match '^Up' }).Count
}

# One concise progress line for an otherwise-silent long step. Signal preference: running containers
# (start phase) → else the last meaningful, ANSI-stripped line of the phase log (build phase) → else
# a generic "working…". Read-only + best-effort: never throws, never blocks.
function Write-Heartbeat([string]$Phase, [DateTime]$Start, [string]$Log) {
  $elapsed = "{0:hh\:mm\:ss}" -f ([DateTime]::UtcNow - $Start)
  $signal = ""
  try {
    $up = @(docker ps --filter "name=$ProjectName" -q 2>$null).Count
    if ($up -gt 0) { $signal = "$up container(s) up" }
  } catch {}
  if (-not $signal -and $Log -and (Test-Path $Log)) {
    try {
      $last = Get-Content $Log -Tail 60 -ErrorAction SilentlyContinue |
        ForEach-Object { ($_ -replace '\x1b\[[0-9;]*m', '').Trim() } |
        Where-Object { $_ -and ($_ -notmatch '^Downloading\s') } | Select-Object -Last 1
      if ($last) { if ($last.Length -gt 90) { $last = $last.Substring(0, 90) + "…" }; $signal = $last }
    } catch {}
  }
  if (-not $signal) { $signal = "working…" }
  Write-Host ("  ⏱ [{0}] {1}: {2}" -f $elapsed, $Phase, $signal) -ForegroundColor DarkCyan
}

# PROMPTING scripts (bootstrap, build): child pwsh process with stdin answers piped. No [bool] args.
# The child's (very noisy) output is routed to <WorkDir>/.provision-<Phase>.log; the main stream gets
# the command echo, a heartbeat line every $HeartbeatSec, and on failure the log tail. The exact
# `$Stdin | pwsh -File …` mechanism (verified working) is preserved inside a thread job so the main
# thread is free to emit the heartbeat.
function Invoke-ChildPiped([string]$ScriptRel, [string[]]$ScriptArgs, [string]$Stdin, [string]$Phase = "child") {
  Push-Location $WorkDir
  try {
    Write-Host "  > (cwd=$WorkDir) pwsh -File $ScriptRel $($ScriptArgs -join ' ')  [log: .provision-$Phase.log]" -ForegroundColor DarkGray
    $log = Join-Path $WorkDir ".provision-$Phase.log"
    Remove-Item -Force -ErrorAction SilentlyContinue $log
    $start = [DateTime]::UtcNow
    $tj = Start-ThreadJob -ScriptBlock {
      Set-Location $using:WorkDir
      $using:Stdin | pwsh -NoProfile -File $using:ScriptRel @using:ScriptArgs *> $using:log
      $LASTEXITCODE
    }
    if ($HeartbeatSec -gt 0) {
      while ($tj.State -eq 'Running') {
        Start-Sleep -Seconds $HeartbeatSec
        if ($tj.State -ne 'Running') { break }
        Write-Heartbeat $Phase $start $log
      }
    }
    $code = (Receive-Job $tj -Wait -AutoRemoveJob | Select-Object -Last 1)
    if ($null -eq $code) { $code = 0 }
    Write-Host ("  {0} finished in {1:hh\:mm\:ss} (exit {2})" -f $Phase, ([DateTime]::UtcNow - $start), $code) -ForegroundColor DarkGray
    if ($code -ne 0 -and (Test-Path $log)) {
      Write-Host "  --- last 25 log lines ($log) ---" -ForegroundColor DarkGray
      Get-Content $log -Tail 25 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
  } finally { Pop-Location }
  if ($code -ne 0) { throw "Child script '$ScriptRel' failed with exit code $code (see .provision-$Phase.log)" }
}

# NON-PROMPTING lifecycle scripts (start/stop): via `&` + splatting so a typed [bool] like
# -skipSampleData $false binds (a "0"/"1" string via -File would NOT).
#   • No -Phase  → legacy in-process call (kept for one-shot/quiet callers like 'remove').
#   • -Phase X   → QUIET path: the (very noisy) compose/start chatter — teardown's per-container
#                  "Stopping/Removing" lines, start's 60× "Try to open … Attempt #N" + raw ANSI — is
#                  routed to .provision-<phase>.log; the main stream gets only a command echo, a
#                  heartbeat every $HeartbeatSec, and (on a real failure) the log tail. This both
#                  declutters the output AND lets `-Action monitor` see the live phase (it keys off
#                  the freshest .provision-*.log). Mirrors Invoke-ChildPiped, but runs inside a thread
#                  job with & + splat (not -File) so the typed [bool] params still bind.
function Invoke-Lifecycle([string]$ScriptName, [hashtable]$Params, [bool]$AllowFail = $false, [string]$Phase = "") {
  Push-Location $WorkDir
  try {
    $scriptPath = Join-Path $WorkDir "$SolutionName/$ScriptName"
    if (-not (Test-Path $scriptPath)) {
      # Nothing bootstrapped. For the idempotent teardown actions (-AllowFail) this is a no-op, not an error.
      if ($AllowFail) { Write-Host "  $ScriptName not present (nothing bootstrapped) — skipping." -ForegroundColor DarkGray; return }
      throw "Not bootstrapped: $scriptPath missing (run -Action bootstrap)."
    }
    $argEcho = ($Params.GetEnumerator() | ForEach-Object { "-$($_.Key) $($_.Value)" }) -join ' '
    if (-not $Phase) {
      Write-Host "  > (cwd=$WorkDir) & $ScriptName $argEcho" -ForegroundColor DarkGray
      & $scriptPath @Params
      $code = $LASTEXITCODE
    }
    else {
      $log = Join-Path $WorkDir ".provision-$Phase.log"
      Remove-Item -Force -ErrorAction SilentlyContinue $log
      Write-Host "  > (cwd=$WorkDir) & $ScriptName $argEcho  [log: .provision-$Phase.log]" -ForegroundColor DarkGray
      $start = [DateTime]::UtcNow
      $tj = Start-ThreadJob -ScriptBlock {
        Set-Location $using:WorkDir
        $p = $using:Params
        & $using:scriptPath @p *> $using:log
        $LASTEXITCODE
      }
      if ($HeartbeatSec -gt 0) {
        while ($tj.State -eq 'Running') {
          Start-Sleep -Seconds $HeartbeatSec
          if ($tj.State -ne 'Running') { break }
          Write-Heartbeat $Phase $start $log
        }
      }
      $code = (Receive-Job $tj -Wait -AutoRemoveJob | Select-Object -Last 1)
      if ($null -eq $code) { $code = 0 }
      Write-Host ("  {0} finished in {1:hh\:mm\:ss} (exit {2})" -f $Phase, ([DateTime]::UtcNow - $start), $code) -ForegroundColor DarkGray
      if ($code -ne 0 -and -not $AllowFail -and (Test-Path $log)) {
        Write-Host "  --- last 25 log lines ($log) ---" -ForegroundColor DarkGray
        Get-Content $log -Tail 25 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
      }
    }
  } finally { Pop-Location }
  if ($code -ne 0 -and -not $AllowFail) { throw "Lifecycle script '$ScriptName' failed with exit code $code" }
}

function Test-Preflight {
  Write-Step "Preflight — toolchain & Docker daemon"
  $ok = $true
  if ($PSVersionTable.PSVersion.Major -lt 7) { Write-Fail "PowerShell 7+ required (have $($PSVersionTable.PSVersion))"; $ok = $false }
  else { Write-Pass "PowerShell $($PSVersionTable.PSVersion)" }
  foreach ($tool in @("docker", "vc-build", "node")) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) { Write-Pass "$tool" }
    else { Write-Fail "$tool not on PATH"; $ok = $false }
  }
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try { docker info *> $null; if ($LASTEXITCODE -ne 0) { Write-Fail "Docker daemon not responding"; $ok = $false } else { Write-Pass "Docker daemon responding" } }
    catch { Write-Fail "Docker daemon not responding"; $ok = $false }
  }
  if (-not $ok) { throw "Preflight failed — fix the ❌ items above and retry." }
}

# Which DB engine the env is currently bootstrapped with. Prefers the marker written at bootstrap;
# falls back to the authoritative source start-local itself reads — DB_PROVIDER in the generated .env
# (for envs bootstrapped before the marker existed). Returns $null when it cannot be determined.
function Get-BootstrappedDbProvider {
  if (Test-Path $DbMarker) { return (Get-Content $DbMarker -Raw).Trim() }
  $envFile = Join-Path $WorkDir "$SolutionName/.env"
  if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern '^\s*DB_PROVIDER\s*=\s*(.+?)\s*$' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { return $line.Matches[0].Groups[1].Value.Trim().ToLower() }
  }
  return $null
}

function Initialize-Bootstrap {
  Write-Step "Bootstrap start-local → $WorkDir/$SolutionName (branch: $Branch, db: $DbProvider)"
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
  if (Test-Path (Join-Path $WorkDir "$SolutionName/docker-compose.yml")) {
    # -DbProvider is consumed ONLY at bootstrap; an already-bootstrapped env keeps its original engine.
    # Detect a requested switch instead of silently ignoring it.
    $current = Get-BootstrappedDbProvider
    if ($current -and $current -ne $DbProvider) {
      # Provider switch. Every run wipes the DB anyway, so just re-bootstrap for the new engine
      # (the per-provider compose/.env must be regenerated). Images + last-manifest survive in $WorkDir.
      Write-Warn "DB provider switch '$current' → '$DbProvider': tearing down + re-bootstrapping for '$DbProvider'"
      $env:COMPOSE_PROJECT_NAME = $ProjectName
      Stop-Stack
      Clear-DataVolumes
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $WorkDir $SolutionName)
      # fall through to a fresh bootstrap for the new provider
    }
    else {
      Write-Pass "Already bootstrapped (db: $(if ($current) { $current } else { 'unknown' })) — skipping"
      if (-not (Test-Path $DbMarker) -and $current) { Set-Content -Path $DbMarker -Value $current -NoNewline }
      return
    }
  }
  $local = Join-Path $WorkDir $BootstrapScript
  if (-not (Test-Path $local)) {
    Write-Note "Downloading $BootstrapScript …"
    Invoke-WebRequest -Uri $BootstrapUrl -UseBasicParsing -OutFile $local
  }
  # Downloads management scripts + Dockerfiles + .env, then prompts (vc-build update / proceed
  # build) → both answered "n" (we build separately with the custom manifest).
  Invoke-ChildPiped $BootstrapScript @("-targetFolder", $SolutionName, "-dbProvider", $DbProvider) "n`nn`n" "bootstrap"
  Set-Content -Path $DbMarker -Value $DbProvider -NoNewline   # record the engine for later switch detection
  Write-Pass "Bootstrapped start-local for db: $DbProvider"
}

function Test-ImageExists($tag) { docker image inspect $tag *> $null; return ($LASTEXITCODE -eq 0) }

function Invoke-BuildIfChanged {
  Write-Step "Build (rebuild-if-manifest-changed)"
  if (-not $Manifest) { throw "-Manifest is required for build/up. Generate one with gen-manifest.mjs." }
  $manifestPath = (Resolve-Path $Manifest).Path
  $imgOk = (Test-ImageExists $PlatformImage) -and (Test-ImageExists "vc-frontend:local-latest")
  $manifestSame = (Test-Path $LastManifest) -and ((Get-Content $manifestPath -Raw) -eq (Get-Content $LastManifest -Raw))
  # The frontend ZIP (-FrontendUrl) is a build input too, but it is NOT in the manifest — track it
  # separately so a frontend-only task (changed PR theme, same backend) still triggers a rebuild.
  $frontendSame = ((Test-Path $LastFrontend) ? ((Get-Content $LastFrontend -Raw) ?? "").Trim() : "") -eq $FrontendUrl.Trim()
  if ($imgOk -and $manifestSame -and $frontendSame) {
    Write-Pass "Manifest + frontend unchanged and images present → skipping rebuild"
    return
  }
  $reason = if (-not $imgOk) { "image missing" } elseif (-not (Test-Path $LastManifest)) { "no prior build recorded" } elseif (-not $manifestSame) { "manifest changed" } else { "frontend URL changed" }
  Write-Warn "Rebuilding — reason: $reason"
  Write-Note "manifest: $manifestPath"
  # -customFrontendUrl always passed (empty = latest release) so the script never prompts;
  # trailing "proceed with running?" answered "n" — we start explicitly afterwards.
  $buildArgs = @("-targetFolder", $SolutionName, "-vcSolutionVersion", "custom",
    "-customPackagesJson", $manifestPath, "-customFrontendUrl", $FrontendUrl)
  Invoke-ChildPiped "$SolutionName/build-VC-solution.ps1" $buildArgs "n`n" "build"
  Copy-Item $manifestPath $LastManifest -Force
  Set-Content -Path $LastFrontend -Value $FrontendUrl -NoNewline
  Write-Pass "Images built (vc-platform + vc-frontend) and manifest recorded"
}

function Stop-Stack { Invoke-Lifecycle "stop-VC-solution.ps1" @{ solutionFolder = $SolutionName } -AllowFail $true -Phase "stop" }

function Clear-DataVolumes {
  Write-Step "Clean — wiping ALL data volumes (fresh DB + search index + cache)"
  $n = 0
  foreach ($v in $DataVolumes) {
    docker volume inspect $v *> $null
    if ($LASTEXITCODE -eq 0) { docker volume rm $v *> $null; Write-Note "removed volume: $v"; $n++ }
  }
  Write-Pass "$n data volume(s) wiped → fresh DB on next start"
}

# start-VC-solution.ps1's trailing "Checking installed modules" step authenticates with the seed
# password 'store' and can exit 1 even when the platform is fully up. We run that lifecycle call with
# -AllowFail and assert platform reachability ourselves via /health.
function Wait-PlatformReady([int]$TimeoutSec = 180) {
  Write-Host "  Waiting for platform /health …" -ForegroundColor DarkGray
  $start = [DateTime]::UtcNow
  $deadline = $start.AddSeconds($TimeoutSec)
  $nextBeat = $start.AddSeconds($HeartbeatSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:8090/health" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { Write-Pass "platform /health UP (after $([int]([DateTime]::UtcNow - $start).TotalSeconds)s)"; return }
    } catch {}
    if ($HeartbeatSec -gt 0 -and [DateTime]::UtcNow -ge $nextBeat) {
      Write-Host ("  ⏱ [{0:hh\:mm\:ss}] start: waiting for /health (DB migration + module load)…" -f ([DateTime]::UtcNow - $start)) -ForegroundColor DarkCyan
      $nextBeat = [DateTime]::UtcNow.AddSeconds($HeartbeatSec)
    }
    Start-Sleep -Seconds 3
  }
  throw "Platform did not become reachable at http://localhost:8090/health within $TimeoutSec s — the stack failed to start."
}

# start-local refuses to start if any of its ports is busy. After a 'down', the OS can lag releasing a
# just-removed container's port (observed on ES :9200), which makes the next start fail spuriously.
# Wait the ports out before starting.
function Wait-PortsFree([int]$TimeoutSec = 45) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
  do {
    $busy = @($RequiredPorts | Where-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue })
    if ($busy.Count -eq 0) { return }
    Write-Note "Waiting for ports to free: $($busy -join ', ') …"
    Start-Sleep -Seconds 3
  } while ([DateTime]::UtcNow -lt $deadline)
  Write-Warn "Ports still busy after $TimeoutSec s: $($busy -join ', '). start-local may refuse to start."
}

# PREVENT the admin lockout at its source. start-local's post-start "Checking installed modules" probe
# (scripts/check-installed-modules.ps1) authenticates with a hardcoded default password "store". On a
# PRESERVED DB whose admin was already rotated to Password1!, that probe fails repeatedly and trips
# Identity lockout — which is why Initialize-Admin then needs the (expensive) clear-lockout + restart
# self-heal on every re-run. We patch the probe's DEFAULT password to read $env:VC_MODULECHECK_PASSWORD
# (idempotent; falls back to "store" when the env var is unset), then set that env to the password the
# probe will actually meet. The self-heal below stays as a safety net for any case this doesn't cover
# (e.g. an externally-created DB with a different admin password). Touching a start-local script is
# deliberate and minimal: a guarded one-line regex that no-ops if upstream changes the file.
function Set-ModuleCheckPassword {
  $script = Join-Path $WorkDir "$SolutionName/scripts/check-installed-modules.ps1"
  if (-not (Test-Path $script)) { return }
  $raw = Get-Content $script -Raw
  if ($raw -match '\$Password\s*=\s*\$\(if \(\$env:VC_MODULECHECK_PASSWORD\)') { return }  # already patched
  $patched = $raw -replace '(\$Password\s*=\s*)"store"', '$1$(if ($env:VC_MODULECHECK_PASSWORD) { $env:VC_MODULECHECK_PASSWORD } else { "store" })'
  if ($patched -ne $raw) {
    Set-Content -Path $script -Value $patched -NoNewline
    Write-Note "Patched check-installed-modules.ps1 to honour `$env:VC_MODULECHECK_PASSWORD (avoids admin lockout)"
  }
}

# Module-health gate (advisory): after the platform is up, name any module that failed to load/validate.
# A version-incompatible manifest (e.g. a switched/pinned module other modules depend on) BUILDS and the
# platform STARTS, but those modules stay broken → /health flips to 503. Test-PinnedModules only checks
# the pins; this catches the broader "some modules have errors" case (which bit the Customer-downgrade
# test). Best-effort: warn loudly, never throw.
function Test-ModuleHealth {
  Write-Step "Check module health (load/validation errors)"
  & node (Join-Path $SkillDir "healthcheck.mjs") --back "http://localhost:8090" --token --password "Password1!" --no-front --module-errors
  if ($LASTEXITCODE -ne 0) { Write-Warn "Module-health check flagged an issue (exit $LASTEXITCODE) — see the module(s) named above; a broken module breaks /health" }
  else { Write-Pass "All modules loaded — no load/validation errors" }
}

# Verify each AzureBlob (pre-release) module pinned in the manifest is ACTUALLY loaded — never trust
# the build log / artifact filename. Delegates to healthcheck.mjs --expect-module (a version mismatch
# is a loud advisory, since pre-release artifacts are often not version-bumped in module.manifest;
# a MISSING module is the real failure). Best-effort: warn, don't throw.
function Test-PinnedModules {
  $mf = if ($Manifest -and (Test-Path $Manifest)) { (Resolve-Path $Manifest).Path } elseif (Test-Path $LastManifest) { $LastManifest } else { return }
  $expect = @()
  try {
    $m = Get-Content $mf -Raw | ConvertFrom-Json
    foreach ($s in $m.Sources) {
      if ($s.Name -eq "AzureBlob") { foreach ($mod in $s.Modules) { $expect += @("--expect-module", "$($mod.Id)=$($mod.Version)") } }
    }
  } catch { return }
  if ($expect.Count -eq 0) { return }
  Write-Step "Verify pinned pre-release module(s) actually loaded"
  & node (Join-Path $SkillDir "healthcheck.mjs") --back "http://localhost:8090" --token --password "Password1!" --no-front @expect
  if ($LASTEXITCODE -ne 0) { Write-Warn "Pinned-module verification flagged an issue (exit $LASTEXITCODE) — a MISSING module is serious; a version mismatch is the known pre-release labelling quirk (confirm the PR by behaviour/schema)" }
  else { Write-Pass "Pinned pre-release module(s) confirmed loaded" }
}

function Initialize-Admin {
  Write-Step "Set admin password (fresh DB: store → Password1!) + write .env.local"
  & node (Join-Path $SkillDir "init-admin.mjs") --back "http://localhost:8090"
  if ($LASTEXITCODE -ne 0) { Write-Warn "init-admin reported a problem (exit $LASTEXITCODE) — check the platform is fully up" }
  else { Write-Pass "admin / Password1! ready; ADMIN_PASSWORD_LOCALHOST written to .env.local" }
}

function Invoke-Start {
  $env:COMPOSE_PROJECT_NAME = $ProjectName
  # Every run is a fresh DB (deterministic env). Cleaning the volumes is cheap; the heavy image
  # build is still skipped when the manifest is unchanged (handled in Invoke-BuildIfChanged).
  Write-Step "Start stack (project: $ProjectName, fresh DB — data volumes wiped; seed via npm run seed:*)"
  Stop-Stack                                   # free ports + drop old containers
  Clear-DataVolumes                            # always wipe → from-scratch DB + search index + cache
  Wait-PortsFree                               # OS can lag freeing a just-removed container's port
  # The fresh DB still has the seed admin password 'store'; tell start-local's module-check probe so
  # it authenticates successfully and never trips Identity lockout before init-admin rotates the pwd.
  Set-ModuleCheckPassword
  $env:VC_MODULECHECK_PASSWORD = "store"
  Invoke-Lifecycle "start-VC-solution.ps1" @{ solutionFolder = $SolutionName; skipSampleData = $true } -AllowFail $true -Phase "start"
  Wait-PlatformReady   # start-local's seed-password module probe can exit 1; gate on real /health instead
  Initialize-Admin     # rotate the fresh DB's seed 'store' → Password1! + write .env.local
  Test-PinnedModules   # confirm pinned pre-release module(s) actually loaded (not silently the release)
  Test-ModuleHealth    # surface any module that failed to load/validate (broken manifest → /health 503)
  Show-Summary
}

function Show-Status { Show-Summary }

# Final report banner: overall verdict (✅/⚠️/❌), the storefront + backend links, per-container marks,
# and the next step to wire the QA tooling. Used as the closing report of `up`/`start`/`status`.
function Show-Summary {
  $db = Get-BootstrappedDbProvider; if (-not $db) { $db = $DbProvider }
  $up = 0
  $healthOk = $false
  try { $r = Invoke-WebRequest -Uri "http://localhost:8090/health" -UseBasicParsing -TimeoutSec 4; $healthOk = ($r.StatusCode -eq 200) } catch {}
  if (Get-Command docker -ErrorAction SilentlyContinue) { $up = @(docker ps --filter "name=$ProjectName" -q 2>$null).Count }

  if ($healthOk -and $up -ge 1)      { $icon = "✅"; $verdict = "LOCAL VC ENVIRONMENT IS UP";       $c = "Green" }
  elseif ($up -ge 1)                 { $icon = "⚠️"; $verdict = "STACK RUNNING — /health NOT 200 yet"; $c = "Yellow" }
  else                               { $icon = "❌"; $verdict = "STACK IS DOWN";                     $c = "Red" }

  Write-Host ""
  Write-Host "  $BarHeavy" -ForegroundColor $c
  Write-Host ("   {0}  {1}" -f $icon, $verdict) -ForegroundColor $c
  Write-Host ("       db: {0}  ·  {1} container(s) up" -f $db, $up) -ForegroundColor DarkGray
  Write-Host "  $BarHeavy" -ForegroundColor $c
  $hStr = if ($healthOk) { "→ 200" } else { "→ not up yet" }
  Write-Host "   🛍  Storefront    " -ForegroundColor White -NoNewline; Write-Host "http://localhost:80"
  Write-Host "   🔧  Platform API  " -ForegroundColor White -NoNewline; Write-Host "http://localhost:8090"
  Write-Host "   🛠  Admin SPA     " -ForegroundColor White -NoNewline; Write-Host "http://localhost:8090   (admin / Password1!)"
  Write-Host "   ❤  Health        " -ForegroundColor White -NoNewline; Write-Host "http://localhost:8090/health   $hStr"
  if ((Get-Command docker -ErrorAction SilentlyContinue) -and ($up -ge 1)) {
    Write-Host "  $Bar" -ForegroundColor DarkGray
    Write-Host "   containers" -ForegroundColor DarkGray
    [void](Write-ContainerRows)
  }
  Write-Host "  $Bar" -ForegroundColor DarkGray
  Write-Host '   next   ' -ForegroundColor DarkGray -NoNewline
  Write-Host '$env:TEST_ENV = "localhost"   ·   npm run seed:*   ·   healthcheck.mjs --token'
  Write-Host "  $BarHeavy" -ForegroundColor $c
}

# One-shot progress snapshot for polling an in-flight provision from ANOTHER shell (the up/build run
# loaded provision.ps1 already; this read-only action never touches the running stack). Shows the most
# recent phase log's tail + elapsed, running containers, local image presence, and /health.
function Show-Monitor {
  Write-Step "Monitor — local VC stack (one-shot snapshot)"
  Write-Host "  $Bar" -ForegroundColor DarkGray

  # — current phase (from the freshest .provision-*.log) —
  $logs = @(Get-ChildItem -Path $WorkDir -Filter ".provision-*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
  if ($logs.Count -gt 0) {
    $cur = $logs[-1]
    $phase = ($cur.Name -replace '^\.provision-', '' -replace '\.log$', '')
    $age = [DateTime]::Now - $cur.LastWriteTime
    if ($age.TotalSeconds -lt 30) { $fresh = "⏱ ACTIVE"; $fc = "Green" } else { $fresh = "idle $([int]$age.TotalSeconds)s"; $fc = "DarkGray" }
    Write-Host ("   phase    {0,-10} " -f $phase) -ForegroundColor White -NoNewline
    Write-Host ("{0} · updated {1:HH:mm:ss}" -f $fresh, $cur.LastWriteTime) -ForegroundColor $fc
    $last = Get-Content $cur.FullName -Tail 60 -ErrorAction SilentlyContinue |
      ForEach-Object { ($_ -replace '\x1b\[[0-9;]*m', '').Trim() } |
      Where-Object { $_ -and ($_ -notmatch '^Downloading\s') } | Select-Object -Last 1
    if ($last) { if ($last.Length -gt 80) { $last = $last.Substring(0, 80) + "…" }; Write-Host "            └ $last" -ForegroundColor DarkGray }
  }
  else { Write-Note "phase    no .provision-*.log yet — bootstrap not started" }

  # — images —
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "  $Bar" -ForegroundColor DarkGray
    Write-Host "   images" -ForegroundColor White
    foreach ($img in @($PlatformImage, "vc-frontend:local-latest")) {
      if (Test-ImageExists $img) { Write-Pass $img } else { Write-Warn "$img  (building / absent)" }
    }

    # — containers —
    Write-Host "  $Bar" -ForegroundColor DarkGray
    Write-Host "   containers" -ForegroundColor White
    $up = Write-ContainerRows "   "
    if ($up -eq 0) { Write-Note "no containers up yet" }
  }

  # — health —
  Write-Host "  $Bar" -ForegroundColor DarkGray
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:8090/health" -UseBasicParsing -TimeoutSec 4
    if ($r.StatusCode -eq 200) { Write-Pass "/health → 200" } else { Write-Warn "/health → $($r.StatusCode)" }
  } catch { Write-Note "/health → not up yet" }
}

# ---- dispatch ----------------------------------------------------------------
switch ($Action) {
  "bootstrap" { Test-Preflight; Initialize-Bootstrap }
  "build"     { Test-Preflight; Initialize-Bootstrap; Invoke-BuildIfChanged }
  "start"     { Invoke-Start }
  "stop"      { Write-Step "Stop (containers down, volumes kept)"; $env:COMPOSE_PROJECT_NAME = $ProjectName; Stop-Stack }
  "clean"     { $env:COMPOSE_PROJECT_NAME = $ProjectName; Stop-Stack; Clear-DataVolumes; Write-Host "Data volumes wiped. Next start re-seeds a fresh DB." -ForegroundColor Cyan }
  "remove"    { Write-Step "Remove (containers + volumes + images + $SolutionName folder)"; $env:COMPOSE_PROJECT_NAME = $ProjectName; Invoke-Lifecycle "remove-VC-solution.ps1" @{ solutionFolder = $SolutionName } -AllowFail $true; Remove-Item -Force -ErrorAction SilentlyContinue $LastManifest, $LastFrontend, $DbMarker }
  "status"    { Show-Status }
  "monitor"   { Show-Monitor }
  "up" {
    Test-Preflight
    Initialize-Bootstrap
    Invoke-BuildIfChanged
    Invoke-Start          # ends with the Show-Summary report banner (links + verdict + next step)
  }
}
