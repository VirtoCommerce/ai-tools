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
    • REBUILD-IF-CHANGED + PER-MANIFEST IMAGE CACHE: the backend/frontend images are rebuilt only
      when the manifest (or frontend ZIP) differs from the last built one. Every successful build is
      ALSO snapshotted under a manifest-hash cache tag (vc-platform:cache-<hash>). When you switch
      back to a manifest you already built (e.g. baseline↔task), the cached image is retagged live
      instead of rebuilt — no multi-minute restore. gen-manifest is run fresh by the caller, so
      upstream version drift is still picked up automatically.
    • FRESH DB by default; WARM DB opt-in: every start wipes ALL data volumes (DB + search index +
      cache) so the env is deterministic — no migration of stale data against a rebuilt image.
      `-KeepData` reuses the existing volumes for a fast warm restart, but ONLY when the live image
      is unchanged; any rebuild/cache-retag forces a wipe regardless (schema + module-DLL safety).
    • KEEP DB PROVIDER: -DbProvider is honoured only when you pass it explicitly. On an already
      bootstrapped env with no explicit provider, the existing engine is kept (no needless
      re-bootstrap). postgres is the default only for a brand-new env.
    • ADMIN PASSWORD: after start, init-admin.mjs ensures admin == Password1! and writes
      ADMIN_PASSWORD_LOCALHOST to .env.local.

  Layout (verified): everything lives under <WorkDir>/VirtoLocal (start-local's default basename).
  The docker compose project is "virtolocal"; platform container "virtolocal-vc-platform-web-1".

.PARAMETER Action  up (default) | bootstrap | build | start | stop | clean | remove | status | monitor
.PARAMETER Manifest        Custom packages.json (from gen-manifest.mjs). Required for build/up.
.PARAMETER WorkDir         start-local checkout dir. Default: <repo>/.local-env (gitignored).
.PARAMETER DbProvider      postgres (default for a NEW env) | mysql | sqlserver. Honoured only when
                           passed explicitly; otherwise the already-bootstrapped engine is kept.
.PARAMETER KeepData        Reuse existing data volumes (warm DB) for a fast restart. Honoured ONLY
                           when the live image is unchanged; any rebuild/cache-retag forces a wipe.
.PARAMETER FrontendUrl     Optional storefront ZIP override (e.g. a frontend PR build).
.PARAMETER Branch          start-local TOOLING repo branch to bootstrap from (default: dev). Internal.
.PARAMETER HeartbeatSec    Progress cadence (s) for long, otherwise-silent steps (build, /health wait).

.EXAMPLE  pwsh -File provision.ps1 -Action up -Manifest .local-env/packages.custom.json
.EXAMPLE  pwsh -File provision.ps1 -Action up -Manifest .local-env/packages.custom.json -DbProvider sqlserver
.EXAMPLE  pwsh -File provision.ps1 -Action up -Manifest .local-env/packages.custom.json -KeepData
#>
[CmdletBinding()]
param(
  [ValidateSet("up", "bootstrap", "build", "start", "stop", "clean", "remove", "status", "monitor")]
  [string]$Action = "up",
  [string]$Manifest,
  [string]$WorkDir,
  [ValidateSet("postgres", "mysql", "sqlserver")]
  [string]$DbProvider = "postgres",
  [switch]$KeepData,
  [string]$FrontendUrl = "",
  [string]$Branch = "dev",
  [int]$HeartbeatSec = 60
)

$ErrorActionPreference = "Stop"
# Force UTF-8 console output so the status marks (✅ ⚠️ ❌) and box-drawing survive redirection.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8

# Was -DbProvider passed explicitly? (Used to KEEP the bootstrapped engine when it was not.)
$script:DbExplicit = $PSBoundParameters.ContainsKey('DbProvider')
# Did this run change the live image (build or cache-retag)? Drives the warm-DB safety guard.
# Default false so a bare `-Action start` honours -KeepData; Invoke-BuildIfChanged sets it in all branches.
$script:ImageChanged = $false
# Numbered-step state (see Begin-Step/End-Step).
$script:StepNum = -1
$script:StepVerdict = 'ok'
$script:StepStart = [DateTime]::UtcNow

$SkillDir = $PSScriptRoot
$RepoRoot = (Resolve-Path "$PSScriptRoot/../../../..").Path
if (-not $WorkDir) { $WorkDir = Join-Path $RepoRoot ".local-env" }
$SolutionName = "VirtoLocal"
$ProjectName  = "virtolocal"
$PlatformImage = "vc-platform:local-latest"
$FrontendImage = "vc-frontend:local-latest"
$LastManifest = Join-Path $WorkDir ".last-built-manifest.json"
$LastFrontend = Join-Path $WorkDir ".last-built-frontend.txt"
$DbMarker     = Join-Path $WorkDir ".bootstrapped-db.txt"
$BootstrapScript = "VirtoLocal_create_local_files.ps1"
$BootstrapUrl = "https://raw.githubusercontent.com/VirtoCommerce/start-local/$Branch/$BootstrapScript"
$DataVolumes = @(
  "virto_postgres_data", "virto_mysql_data", "virto_mssql_data",
  "virto_esdata01", "virto_redisdata", "virto_cms-content-data", "virto_modules-data"
)
$RequiredPorts = @(80, 8090, 9200, 5601, 6379, 5432)

# ── Visual vocabulary ─────────────────────────────────────────────────────────
# Numbered steps with a colored completion verdict; ✅ green = pass, ⚠️ yellow = advisory,
# ❌ red = fail, · grey = info, • sub-action. The step verdict auto-escalates to the worst
# inner mark (a Write-Warn makes the step yellow; a Write-Fail makes it red).
$Bar      = "─" * 62
$BarHeavy = "═" * 62
function Write-Pass($m) { Write-Host "  ✅ $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Host "  ⚠️  $m" -ForegroundColor Yellow; if ($script:StepVerdict -eq 'ok') { $script:StepVerdict = 'warn' } }
function Write-Fail($m) { Write-Host "  ❌ $m" -ForegroundColor Red; $script:StepVerdict = 'fail' }
function Write-Note($m) { Write-Host "  ·  $m" -ForegroundColor DarkGray }
function Write-Sub($m)  { Write-Host "  • $m" -ForegroundColor Gray }

# Open a numbered step: prints a header bar, resets the verdict, starts the timer.
function Begin-Step([string]$Title) {
  $script:StepNum++
  $script:StepVerdict = 'ok'
  $script:StepStart = [DateTime]::UtcNow
  Write-Host ""
  Write-Host (("━━ Step {0} · {1} " -f $script:StepNum, $Title).PadRight(64, [char]0x2501)) -ForegroundColor Cyan
}
# Close the current step: colored ✅/⚠️/❌ verdict + elapsed (mm:ss).
function End-Step {
  $dur = "{0:mm\:ss}" -f ([DateTime]::UtcNow - $script:StepStart)
  switch ($script:StepVerdict) {
    'fail' { $i = "❌"; $c = "Red" }
    'warn' { $i = "⚠️"; $c = "Yellow" }
    default { $i = "✅"; $c = "Green" }
  }
  Write-Host ("  {0} Step {1} done · {2}" -f $i, $script:StepNum, $dur) -ForegroundColor $c
}

# Map a `docker ps` status string to a (icon, color) pair: Up→✅, unhealthy→⚠️, else→❌.
function Get-StatusMark([string]$Status) {
  if ($Status -match 'unhealthy')        { return @("⚠️", "Yellow") }
  elseif ($Status -match '^Up')          { return @("✅", "Green") }
  else                                   { return @("❌", "Red") }
}

# Print the project's containers as marked rows. Returns the count of running containers.
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

# Best progress signal from a phase log: download size (X / Y) → buildkit stage [n/total] → last
# meaningful line. Read-only + best-effort; never throws. This is what makes a >1-min step report
# WHAT it is doing (process + how much downloaded / which stage), not just "working…".
function Get-ProgressSignal([string]$Log) {
  if (-not $Log -or -not (Test-Path $Log)) { return "" }
  try {
    $tail = Get-Content $Log -Tail 200 -ErrorAction SilentlyContinue |
      ForEach-Object { ($_ -replace '\x1b\[[0-9;]*m', '').Trim() } | Where-Object { $_ }
    if (-not $tail) { return "" }
    # 1) download progress: "50.3MB / 120.5MB"
    $dl = $tail | Where-Object { $_ -match '(\d+(?:\.\d+)?\s*[KMG]B)\s*/\s*(\d+(?:\.\d+)?\s*[KMG]B)' } | Select-Object -Last 1
    if ($dl -and ($dl -match '(\d+(?:\.\d+)?\s*[KMG]B)\s*/\s*(\d+(?:\.\d+)?\s*[KMG]B)')) {
      return "downloading $($Matches[1]) / $($Matches[2])"
    }
    # 2) buildkit stage: "[4/9] RUN dotnet restore"
    $stage = $tail | Where-Object { $_ -match '\[(\d+)/(\d+)\]' } | Select-Object -Last 1
    if ($stage -and ($stage -match '\[(\d+)/(\d+)\]')) {
      $desc = ($stage -replace '^.*\[\d+/\d+\]\s*', '')
      if ($desc.Length -gt 48) { $desc = $desc.Substring(0, 48) + "…" }
      return "build stage $($Matches[1])/$($Matches[2]) — $desc"
    }
    # 3) fallback: last non-noise line
    $last = $tail | Where-Object { $_ -notmatch '^(Downloading|Extracting|Waiting)\s' } | Select-Object -Last 1
    if ($last) { if ($last.Length -gt 80) { $last = $last.Substring(0, 80) + "…" }; return $last }
  } catch {}
  return ""
}

# One concise progress line for an otherwise-silent long step (fires every $HeartbeatSec).
# Signal: running containers (start phase) → else Get-ProgressSignal (build/pull phase) → else "working…".
function Write-Heartbeat([string]$Phase, [DateTime]$Start, [string]$Log) {
  $elapsed = "{0:hh\:mm\:ss}" -f ([DateTime]::UtcNow - $Start)
  $signal = ""
  try {
    $up = @(docker ps --filter "name=$ProjectName" -q 2>$null).Count
    if ($up -gt 0) { $signal = "$up container(s) up" }
  } catch {}
  if (-not $signal) { $signal = Get-ProgressSignal $Log }
  if (-not $signal) { $signal = "working…" }
  Write-Host ("  ⏱ [{0}] {1}: {2}" -f $elapsed, $Phase, $signal) -ForegroundColor DarkCyan
}

# PROMPTING scripts (bootstrap, build): child pwsh process with stdin answers piped. The (noisy)
# child output is routed to <WorkDir>/.provision-<Phase>.log; the main stream gets the command echo,
# a heartbeat every $HeartbeatSec, and on failure the log tail.
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

# NON-PROMPTING lifecycle scripts (start/stop): via `&` + splatting so a typed [bool] binds.
function Invoke-Lifecycle([string]$ScriptName, [hashtable]$Params, [bool]$AllowFail = $false, [string]$Phase = "") {
  Push-Location $WorkDir
  try {
    $scriptPath = Join-Path $WorkDir "$SolutionName/$ScriptName"
    if (-not (Test-Path $scriptPath)) {
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

# Which DB engine the env is currently bootstrapped with. Prefers the marker; falls back to
# DB_PROVIDER in the generated .env. Returns $null when it cannot be determined.
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
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
  if (Test-Path (Join-Path $WorkDir "$SolutionName/docker-compose.yml")) {
    $current = Get-BootstrappedDbProvider
    # KEEP the bootstrapped engine unless the caller passed -DbProvider explicitly.
    if ($current -and -not $script:DbExplicit) { $DbProvider = $current }
    if ($current -and $current -ne $DbProvider) {
      # Explicit provider switch. Every run wipes the DB anyway, so re-bootstrap for the new engine.
      Write-Warn "DB provider switch '$current' → '$DbProvider' (explicit): tearing down + re-bootstrapping"
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
  Write-Sub "Bootstrapping start-local (branch: $Branch, db: $DbProvider)"
  $local = Join-Path $WorkDir $BootstrapScript
  if (-not (Test-Path $local)) {
    Write-Note "Downloading $BootstrapScript …"
    Invoke-WebRequest -Uri $BootstrapUrl -UseBasicParsing -OutFile $local
  }
  Invoke-ChildPiped $BootstrapScript @("-targetFolder", $SolutionName, "-dbProvider", $DbProvider) "n`nn`n" "bootstrap"
  Set-Content -Path $DbMarker -Value $DbProvider -NoNewline
  Write-Pass "Bootstrapped start-local for db: $DbProvider"
}

function Test-ImageExists($tag) { docker image inspect $tag *> $null; return ($LASTEXITCODE -eq 0) }

# Deterministic 12-hex cache key from the manifest content + frontend URL (the two real build inputs).
function Get-BuildHash([string]$ManifestPath, [string]$Frontend) {
  $content = (Get-Content $ManifestPath -Raw) + "`n--frontend--`n" + $Frontend.Trim()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return (-join ($hash[0..5] | ForEach-Object { $_.ToString('x2') }))
}

# Keep only the $Keep most-recent cache-* tags per repo (images of different manifests mostly differ
# in the module-restore layer, but trim anyway to bound disk use).
function Limit-ImageCache([int]$Keep = 4) {
  foreach ($repo in @("vc-platform", "vc-frontend")) {
    $tags = @(docker images $repo --format "{{.Tag}}|{{.CreatedAt}}" 2>$null |
      Where-Object { $_ -match '^cache-' } |
      Sort-Object { ($_ -split '\|', 2)[1] } -Descending |
      ForEach-Object { ($_ -split '\|', 2)[0] })
    if ($tags.Count -gt $Keep) {
      foreach ($t in $tags[$Keep..($tags.Count - 1)]) { docker rmi "${repo}:$t" *> $null }
    }
  }
}

function Invoke-BuildIfChanged {
  if (-not $Manifest) { throw "-Manifest is required for build/up. Generate one with gen-manifest.mjs." }
  $manifestPath = (Resolve-Path $Manifest).Path
  $hash = Get-BuildHash $manifestPath $FrontendUrl
  $platCache  = "vc-platform:cache-$hash"
  $frontCache = "vc-frontend:cache-$hash"
  $liveOk = (Test-ImageExists $PlatformImage) -and (Test-ImageExists $FrontendImage)
  $manifestSame = (Test-Path $LastManifest) -and ((Get-Content $manifestPath -Raw) -eq (Get-Content $LastManifest -Raw))
  $frontendSame = ((Test-Path $LastFrontend) ? ((Get-Content $LastFrontend -Raw) ?? "").Trim() : "") -eq $FrontendUrl.Trim()

  # (a) Live image already matches this manifest → no rebuild, warm DB is safe.
  if ($liveOk -and $manifestSame -and $frontendSame) {
    $script:ImageChanged = $false
    Write-Pass "Live image already matches this manifest (cache-$hash) → no rebuild"
    return
  }
  # (b) A previously built image for THIS exact manifest+frontend exists → retag it live (no rebuild).
  if ((Test-ImageExists $platCache) -and (Test-ImageExists $frontCache)) {
    Write-Sub "Reusing cached image for this manifest (cache-$hash)"
    docker tag $platCache $PlatformImage *> $null
    docker tag $frontCache $FrontendImage *> $null
    Copy-Item $manifestPath $LastManifest -Force
    Set-Content -Path $LastFrontend -Value $FrontendUrl -NoNewline
    $script:ImageChanged = $true
    Write-Pass "Cached image retagged live (cache-$hash) → no rebuild"
    return
  }
  # (c) No usable image → rebuild, then snapshot under the cache tag for next time.
  $reason = if (-not $liveOk) { "image missing" } elseif (-not (Test-Path $LastManifest)) { "no prior build recorded" } elseif (-not $manifestSame) { "manifest changed" } else { "frontend URL changed" }
  Write-Warn "Rebuilding — reason: $reason  (cache-$hash)"
  Write-Note "manifest: $manifestPath"
  $buildArgs = @("-targetFolder", $SolutionName, "-vcSolutionVersion", "custom",
    "-customPackagesJson", $manifestPath, "-customFrontendUrl", $FrontendUrl)
  Invoke-ChildPiped "$SolutionName/build-VC-solution.ps1" $buildArgs "n`n" "build"
  Copy-Item $manifestPath $LastManifest -Force
  Set-Content -Path $LastFrontend -Value $FrontendUrl -NoNewline
  docker tag $PlatformImage $platCache *> $null
  docker tag $FrontendImage $frontCache *> $null
  Limit-ImageCache
  $script:ImageChanged = $true
  Write-Pass "Images built + cached (cache-$hash); manifest recorded"
}

function Stop-Stack { Invoke-Lifecycle "stop-VC-solution.ps1" @{ solutionFolder = $SolutionName } -AllowFail $true -Phase "stop" }

function Clear-DataVolumes {
  $n = 0
  foreach ($v in $DataVolumes) {
    docker volume inspect $v *> $null
    if ($LASTEXITCODE -eq 0) { docker volume rm $v *> $null; Write-Note "removed volume: $v"; $n++ }
  }
  Write-Pass "$n data volume(s) wiped → fresh DB on next start"
}

# start-VC-solution.ps1's trailing "Checking installed modules" step authenticates with the seed
# password 'store' and can exit 1 even when the platform is fully up. Gate on real /health instead.
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

# start-local refuses to start if any of its ports is busy. After a 'down', the OS can lag releasing
# a just-removed container's port; wait the ports out before starting.
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

# Patch start-local's module-check probe so it authenticates with $env:VC_MODULECHECK_PASSWORD
# (avoids the admin lockout on a preserved DB). Idempotent; no-ops if upstream changes the file.
function Set-ModuleCheckPassword {
  $script = Join-Path $WorkDir "$SolutionName/scripts/check-installed-modules.ps1"
  if (-not (Test-Path $script)) { return }
  $raw = Get-Content $script -Raw
  if ($raw -match '\$Password\s*=\s*\$\(if \(\$env:VC_MODULECHECK_PASSWORD\)') { return }
  $patched = $raw -replace '(\$Password\s*=\s*)"store"', '$1$(if ($env:VC_MODULECHECK_PASSWORD) { $env:VC_MODULECHECK_PASSWORD } else { "store" })'
  if ($patched -ne $raw) {
    Set-Content -Path $script -Value $patched -NoNewline
    Write-Note "Patched check-installed-modules.ps1 to honour `$env:VC_MODULECHECK_PASSWORD (avoids admin lockout)"
  }
}

# Module-health gate (advisory): name any module that failed to load/validate. Best-effort.
function Test-ModuleHealth {
  Write-Sub "Module health (load/validation errors)"
  & node (Join-Path $SkillDir "healthcheck.mjs") --back "http://localhost:8090" --token --password "Password1!" --no-front --module-errors
  if ($LASTEXITCODE -ne 0) { Write-Warn "Module-health check flagged an issue (exit $LASTEXITCODE) — a broken module breaks /health" }
  else { Write-Pass "All modules loaded — no load/validation errors" }
}

# Verify each AzureBlob (pre-release) module pinned in the manifest is ACTUALLY loaded. Best-effort.
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
  Write-Sub "Verify pinned pre-release module(s) actually loaded"
  & node (Join-Path $SkillDir "healthcheck.mjs") --back "http://localhost:8090" --token --password "Password1!" --no-front @expect
  if ($LASTEXITCODE -ne 0) { Write-Warn "Pinned-module verification flagged an issue (exit $LASTEXITCODE) — a MISSING module is serious; a version mismatch is the known pre-release labelling quirk" }
  else { Write-Pass "Pinned pre-release module(s) confirmed loaded" }
}

function Initialize-Admin {
  Write-Sub "Set admin password (store → Password1!) + write .env.local"
  & node (Join-Path $SkillDir "init-admin.mjs") --back "http://localhost:8090"
  if ($LASTEXITCODE -ne 0) { Write-Warn "init-admin reported a problem (exit $LASTEXITCODE) — check the platform is fully up" }
  else { Write-Pass "admin / Password1! ready; ADMIN_PASSWORD_LOCALHOST written to .env.local" }
}

# Bring the stack up. Wipes data volumes (fresh DB) UNLESS -KeepData AND the live image is unchanged.
function Invoke-StartStack {
  $env:COMPOSE_PROJECT_NAME = $ProjectName
  Stop-Stack                                   # free ports + drop old containers
  if ($KeepData -and -not $script:ImageChanged) {
    Write-Warn "KeepData: reusing existing DB + search index + cache (warm start — NOT deterministic)"
  }
  else {
    if ($KeepData) { Write-Warn "KeepData ignored — image changed; wiping volumes for schema/module-DLL safety" }
    Clear-DataVolumes                          # from-scratch DB + search index + cache
  }
  Wait-PortsFree                               # OS can lag freeing a just-removed container's port
  Set-ModuleCheckPassword                      # tell start-local's module-check probe the seed password
  $env:VC_MODULECHECK_PASSWORD = "store"
  Invoke-Lifecycle "start-VC-solution.ps1" @{ solutionFolder = $SolutionName; skipSampleData = $true } -AllowFail $true -Phase "start"
  Wait-PlatformReady                           # gate on real /health (seed-password probe can exit 1)
}

# Post-start: rotate admin pwd, verify pins, surface module-load errors.
function Invoke-PostStart {
  Initialize-Admin
  Test-PinnedModules
  Test-ModuleHealth
}

# Final report banner: overall verdict, links, per-container marks, DB mode, next step.
function Show-Summary {
  $db = Get-BootstrappedDbProvider; if (-not $db) { $db = $DbProvider }
  $dbMode = if ($KeepData -and -not $script:ImageChanged) { "warm (kept)" } else { "fresh" }
  $up = 0
  $healthOk = $false
  try { $r = Invoke-WebRequest -Uri "http://localhost:8090/health" -UseBasicParsing -TimeoutSec 4; $healthOk = ($r.StatusCode -eq 200) } catch {}
  if (Get-Command docker -ErrorAction SilentlyContinue) { $up = @(docker ps --filter "name=$ProjectName" -q 2>$null).Count }

  if ($healthOk -and $up -ge 1)      { $icon = "✅"; $verdict = "LOCAL VC ENVIRONMENT IS UP";          $c = "Green" }
  elseif ($up -ge 1)                 { $icon = "⚠️"; $verdict = "STACK RUNNING — /health NOT 200 yet"; $c = "Yellow" }
  else                               { $icon = "❌"; $verdict = "STACK IS DOWN";                       $c = "Red" }

  Write-Host ""
  Write-Host "  $BarHeavy" -ForegroundColor $c
  Write-Host ("   {0}  {1}" -f $icon, $verdict) -ForegroundColor $c
  Write-Host ("       db: {0} ({1})  ·  {2} container(s) up" -f $db, $dbMode, $up) -ForegroundColor DarkGray
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

# One-shot progress snapshot for polling an in-flight provision from ANOTHER shell.
function Show-Monitor {
  Write-Host "  $Bar" -ForegroundColor DarkGray
  $logs = @(Get-ChildItem -Path $WorkDir -Filter ".provision-*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
  if ($logs.Count -gt 0) {
    $cur = $logs[-1]
    $phase = ($cur.Name -replace '^\.provision-', '' -replace '\.log$', '')
    $age = [DateTime]::Now - $cur.LastWriteTime
    if ($age.TotalSeconds -lt 30) { $fresh = "⏱ ACTIVE"; $fc = "Green" } else { $fresh = "idle $([int]$age.TotalSeconds)s"; $fc = "DarkGray" }
    Write-Host ("   phase    {0,-10} " -f $phase) -ForegroundColor White -NoNewline
    Write-Host ("{0} · updated {1:HH:mm:ss}" -f $fresh, $cur.LastWriteTime) -ForegroundColor $fc
    $sig = Get-ProgressSignal $cur.FullName
    if ($sig) { Write-Host "            └ $sig" -ForegroundColor DarkGray }
  }
  else { Write-Note "phase    no .provision-*.log yet — bootstrap not started" }

  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "  $Bar" -ForegroundColor DarkGray
    Write-Host "   images" -ForegroundColor White
    foreach ($img in @($PlatformImage, $FrontendImage)) {
      if (Test-ImageExists $img) { Write-Pass $img } else { Write-Warn "$img  (building / absent)" }
    }
    Write-Host "  $Bar" -ForegroundColor DarkGray
    Write-Host "   containers" -ForegroundColor White
    $up = Write-ContainerRows "   "
    if ($up -eq 0) { Write-Note "no containers up yet" }
  }

  Write-Host "  $Bar" -ForegroundColor DarkGray
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:8090/health" -UseBasicParsing -TimeoutSec 4
    if ($r.StatusCode -eq 200) { Write-Pass "/health → 200" } else { Write-Warn "/health → $($r.StatusCode)" }
  } catch { Write-Note "/health → not up yet" }
}

# ---- dispatch ----------------------------------------------------------------
switch ($Action) {
  "bootstrap" {
    Begin-Step "Preconditions"; Test-Preflight; End-Step
    Begin-Step "Bootstrap start-local"; Initialize-Bootstrap; End-Step
  }
  "build" {
    Begin-Step "Preconditions"; Test-Preflight; End-Step
    Begin-Step "Bootstrap start-local"; Initialize-Bootstrap; End-Step
    Begin-Step "Platform image (build / reuse cache)"; Invoke-BuildIfChanged; End-Step
  }
  "start" {
    Begin-Step "Start stack"; Invoke-StartStack; End-Step
    Begin-Step "Admin & module health"; Invoke-PostStart; End-Step
    Show-Summary
  }
  "stop"    { Begin-Step "Stop (containers down, volumes kept)"; $env:COMPOSE_PROJECT_NAME = $ProjectName; Stop-Stack; End-Step }
  "clean"   { Begin-Step "Clean (wipe data volumes)"; $env:COMPOSE_PROJECT_NAME = $ProjectName; Stop-Stack; Clear-DataVolumes; End-Step }
  "remove"  { Begin-Step "Remove (containers + volumes + images + $SolutionName)"; $env:COMPOSE_PROJECT_NAME = $ProjectName; Invoke-Lifecycle "remove-VC-solution.ps1" @{ solutionFolder = $SolutionName } -AllowFail $true; Remove-Item -Force -ErrorAction SilentlyContinue $LastManifest, $LastFrontend, $DbMarker; End-Step }
  "status"  { Show-Summary }
  "monitor" { Begin-Step "Monitor — local VC stack (one-shot snapshot)"; Show-Monitor; End-Step }
  "up" {
    Begin-Step "Preconditions";                         Test-Preflight;        End-Step
    Begin-Step "Bootstrap start-local";                 Initialize-Bootstrap;  End-Step
    Begin-Step "Platform image (build / reuse cache)";  Invoke-BuildIfChanged; End-Step
    Begin-Step "Start stack (fresh DB · seed via npm run seed:*)"; Invoke-StartStack; End-Step
    Begin-Step "Admin & module health";                 Invoke-PostStart;      End-Step
    Show-Summary    # final report banner (links + verdict + next step)
  }
}
