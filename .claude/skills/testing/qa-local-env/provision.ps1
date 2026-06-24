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
      from the last built one (or images are missing, or -Rebuild is passed). gen-manifest is run
      fresh by the caller each time, so upstream version drift is picked up automatically.
    • DATA PERSISTS by default: re-running keeps the DB/search volumes (the platform migrates the
      existing DB against the rebuilt image). -Clean wipes ALL data volumes for a from-scratch DB.
    • ADMIN PASSWORD: after start, init-admin.mjs ensures admin == Password1! (idempotent: changes
      the seed 'store' on a fresh DB, no-ops on a preserved one) and writes ADMIN_PASSWORD_LOCALHOST
      to .env.local.

  Layout (verified): everything lives under <WorkDir>/VirtoLocal (start-local's default basename).
  All start-local scripts run from <WorkDir> with the basename "VirtoLocal" (never a nested path)
  so the docker compose project is "virtolocal" and the platform container is
  "virtolocal-vc-platform-web-1". start-VC-solution refuses to start if its ports are in use, so we
  always 'down' first (frees ports + lets a rebuilt image take effect).

.PARAMETER Action  up (default) | bootstrap | build | start | stop | clean | remove | status
.PARAMETER Manifest        Custom packages.json (from gen-manifest.mjs). Required for build/up.
.PARAMETER WorkDir         start-local checkout dir. Default: <repo>/.local-env (gitignored).
.PARAMETER DbProvider      postgres (default) | mysql | sqlserver.
.PARAMETER Clean           Wipe ALL data volumes before start (fresh DB + search index + cache).
.PARAMETER Rebuild         Force an image rebuild even if the manifest is unchanged.
.PARAMETER WithSampleData  Attempt start-local's demo sample-data import on a FRESH DB (default: off).
                           Best-effort: the bundled demo can fail against the pinned module versions
                           (e.g. a product property name newer Catalog validation rejects). For clean,
                           module-compatible fixtures use the repo seeders: `npm run seed:*`.
.PARAMETER FrontendUrl     Optional storefront ZIP override (e.g. a frontend PR build).
.PARAMETER Branch          start-local repo branch to bootstrap from (default: dev).

.EXAMPLE  pwsh -File provision.ps1 -Action up -Manifest .local-env/packages.custom.json
.EXAMPLE  pwsh -File provision.ps1 -Action up -Manifest .local-env/packages.custom.json -Clean
#>
[CmdletBinding()]
param(
  [ValidateSet("up", "bootstrap", "build", "start", "stop", "clean", "remove", "status")]
  [string]$Action = "up",
  [string]$Manifest,
  [string]$WorkDir,
  [ValidateSet("postgres", "mysql", "sqlserver")]
  [string]$DbProvider = "postgres",
  [switch]$Clean,
  [switch]$Rebuild,
  [switch]$WithSampleData,
  [string]$FrontendUrl = "",
  [string]$Branch = "dev"
)

$ErrorActionPreference = "Stop"
$SkillDir = $PSScriptRoot
$RepoRoot = (Resolve-Path "$PSScriptRoot/../../../..").Path
if (-not $WorkDir) { $WorkDir = Join-Path $RepoRoot ".local-env" }
$SolutionName = "VirtoLocal"
$ProjectName  = "virtolocal"
$PlatformImage = "vc-platform:local-latest"
$LastManifest = Join-Path $WorkDir ".last-built-manifest.json"
$LastFrontend = Join-Path $WorkDir ".last-built-frontend.txt"
$BootstrapScript = "VirtoLocal_create_local_files.ps1"
$BootstrapUrl = "https://raw.githubusercontent.com/VirtoCommerce/start-local/$Branch/$BootstrapScript"
# All named data volumes (compose declares them with the virto_ prefix).
$DataVolumes = @(
  "virto_postgres_data", "virto_mysql_data", "virto_mssql_data",
  "virto_esdata01", "virto_redisdata", "virto_cms-content-data", "virto_modules-data"
)
$PlatformContainer = "$ProjectName-vc-platform-web-1"
$DbContainer       = "$ProjectName-vc-db-1"
# Ports start-local checks before it will start (it refuses to start if any is busy).
$RequiredPorts = @(80, 8090, 9200, 5601, 6379, 5432)

function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

# PROMPTING scripts (bootstrap, build): child pwsh process with stdin answers piped. No [bool] args.
function Invoke-ChildPiped([string]$ScriptRel, [string[]]$ScriptArgs, [string]$Stdin) {
  Push-Location $WorkDir
  try {
    Write-Host "  > (cwd=$WorkDir) pwsh -File $ScriptRel $($ScriptArgs -join ' ')" -ForegroundColor DarkGray
    $Stdin | pwsh -NoProfile -File $ScriptRel @ScriptArgs
    $code = $LASTEXITCODE
  } finally { Pop-Location }
  if ($code -ne 0) { throw "Child script '$ScriptRel' failed with exit code $code" }
}

# NON-PROMPTING lifecycle scripts (start/stop): in-process via `&` + splatting so a typed
# [bool] like -skipSampleData $false binds (a "0"/"1" string via -File would NOT).
function Invoke-Lifecycle([string]$ScriptName, [hashtable]$Params, [bool]$AllowFail = $false) {
  Push-Location $WorkDir
  try {
    $scriptPath = Join-Path $WorkDir "$SolutionName/$ScriptName"
    if (-not (Test-Path $scriptPath)) { throw "Not bootstrapped: $scriptPath missing (run -Action bootstrap)." }
    Write-Host "  > (cwd=$WorkDir) & $ScriptName $(($Params.GetEnumerator() | ForEach-Object { "-$($_.Key) $($_.Value)" }) -join ' ')" -ForegroundColor DarkGray
    & $scriptPath @Params
    $code = $LASTEXITCODE
  } finally { Pop-Location }
  if ($code -ne 0 -and -not $AllowFail) { throw "Lifecycle script '$ScriptName' failed with exit code $code" }
}

function Test-Preflight {
  Write-Step "Preflight"
  $ok = $true
  if ($PSVersionTable.PSVersion.Major -lt 7) { Write-Warning "PowerShell 7+ required (have $($PSVersionTable.PSVersion))."; $ok = $false }
  foreach ($tool in @("docker", "vc-build", "node")) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) { Write-Host "  $tool : found" -ForegroundColor Green }
    else { Write-Warning "$tool not on PATH."; $ok = $false }
  }
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try { docker info *> $null; if ($LASTEXITCODE -ne 0) { Write-Warning "Docker daemon not responding."; $ok = $false } }
    catch { Write-Warning "Docker daemon not responding."; $ok = $false }
  }
  if (-not $ok) { throw "Preflight failed — fix the issues above and retry." }
}

function Initialize-Bootstrap {
  Write-Step "Bootstrap start-local → $WorkDir/$SolutionName (branch: $Branch, db: $DbProvider)"
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
  if (Test-Path (Join-Path $WorkDir "$SolutionName/docker-compose.yml")) { Write-Host "  Already bootstrapped — skipping." -ForegroundColor Green; return }
  $local = Join-Path $WorkDir $BootstrapScript
  if (-not (Test-Path $local)) {
    Write-Host "  Downloading $BootstrapScript …" -ForegroundColor DarkGray
    Invoke-WebRequest -Uri $BootstrapUrl -UseBasicParsing -OutFile $local
  }
  # Downloads management scripts + Dockerfiles + .env, then prompts (vc-build update / proceed
  # build) → both answered "n" (we build separately with the custom manifest).
  Invoke-ChildPiped $BootstrapScript @("-targetFolder", $SolutionName, "-dbProvider", $DbProvider) "n`nn`n"
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
  if (-not $Rebuild -and $imgOk -and $manifestSame -and $frontendSame) {
    Write-Host "  Manifest + frontend unchanged and images present → skipping rebuild." -ForegroundColor Green
    return
  }
  $reason = if ($Rebuild) { "forced (-Rebuild)" } elseif (-not $imgOk) { "image missing" } elseif (-not (Test-Path $LastManifest)) { "no prior build recorded" } elseif (-not $manifestSame) { "manifest changed" } else { "frontend URL changed" }
  Write-Host "  Rebuilding — reason: $reason" -ForegroundColor Yellow
  Write-Host "  manifest: $manifestPath" -ForegroundColor DarkGray
  # -customFrontendUrl always passed (empty = latest release) so the script never prompts;
  # trailing "proceed with running?" answered "n" — we start explicitly afterwards.
  $buildArgs = @("-targetFolder", $SolutionName, "-vcSolutionVersion", "custom",
    "-customPackagesJson", $manifestPath, "-customFrontendUrl", $FrontendUrl)
  Invoke-ChildPiped "$SolutionName/build-VC-solution.ps1" $buildArgs "n`n"
  Copy-Item $manifestPath $LastManifest -Force
  Set-Content -Path $LastFrontend -Value $FrontendUrl -NoNewline
  Write-Host "  Recorded built manifest + frontend → $LastManifest" -ForegroundColor DarkGray
}

function Stop-Stack { Invoke-Lifecycle "stop-VC-solution.ps1" @{ solutionFolder = $SolutionName } -AllowFail $true }

function Clear-DataVolumes {
  Write-Step "Clean — wiping ALL data volumes (fresh DB + search index + cache)"
  foreach ($v in $DataVolumes) {
    docker volume inspect $v *> $null
    if ($LASTEXITCODE -eq 0) { docker volume rm $v *> $null; Write-Host "  removed volume: $v" -ForegroundColor Cyan }
  }
}

function Test-VolumeExists($name) { docker volume inspect $name *> $null; return ($LASTEXITCODE -eq 0) }

# start-VC-solution.ps1's trailing "Checking installed modules" step authenticates with the SEED
# password 'store'; on a PRESERVED DB whose admin was already rotated to Password1! by a prior
# init-admin, that probe 400s and the script exits 1 even though the platform is fully up. We run
# that lifecycle call with -AllowFail and assert platform reachability ourselves via /health.
function Wait-PlatformReady([int]$TimeoutSec = 180) {
  Write-Host "  Waiting for platform /health …" -ForegroundColor DarkGray
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:8090/health" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { Write-Host "  platform /health: UP" -ForegroundColor Green; return }
    } catch { Start-Sleep -Seconds 3 }
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
    Write-Host "  Waiting for ports to free: $($busy -join ', ') …" -ForegroundColor DarkGray
    Start-Sleep -Seconds 3
  } while ([DateTime]::UtcNow -lt $deadline)
  Write-Warning "Ports still busy after $TimeoutSec s: $($busy -join ', '). start-local may refuse to start."
}

# Clear an Identity lockout on the admin user directly in the DB. start-local's post-start module
# probe authenticates with the seed 'store'; on a PRESERVED DB whose admin was rotated to Password1!,
# the repeated failures lock the account (15-min window) AND the platform caches the locked user —
# so init-admin then fails even with the correct password. Best-effort; SQL/user differ per provider.
function Clear-AdminLockout {
  $dbPass = "v!rto_Labs!"  # compose default if .env has none
  $envFile = Join-Path $WorkDir "$SolutionName/.env"
  if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern '^\s*DB_PASSWORD\s*=\s*(.+?)\s*$' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { $dbPass = $line.Matches[0].Groups[1].Value }
  }
  Write-Host "  Clearing admin lockout in $DbContainer ($DbProvider) …" -ForegroundColor DarkGray
  try {
    switch ($DbProvider) {
      "postgres"  { docker exec -e PGPASSWORD=$dbPass $DbContainer psql -U postgres -d VirtoCommerce3 -c 'UPDATE "AspNetUsers" SET "LockoutEnd"=NULL, "AccessFailedCount"=0 WHERE "UserName"=''admin'';' *> $null }
      "mysql"     { docker exec $DbContainer mysql -uroot -p"$dbPass" VirtoCommerce3 -e "UPDATE AspNetUsers SET LockoutEnd=NULL, AccessFailedCount=0 WHERE UserName='admin';" *> $null }
      "sqlserver" { docker exec $DbContainer /bin/sh -c "(/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P '$dbPass' -d VirtoCommerce3 -Q `"UPDATE [AspNetUsers] SET [LockoutEnd]=NULL, [AccessFailedCount]=0 WHERE [UserName]='admin';`") 2>/dev/null || (/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P '$dbPass' -d VirtoCommerce3 -Q `"UPDATE [AspNetUsers] SET [LockoutEnd]=NULL, [AccessFailedCount]=0 WHERE [UserName]='admin';`")" *> $null }
    }
  } catch { Write-Warning "  lockout clear failed: $($_.Exception.Message)" }
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
    Write-Host "  Patched check-installed-modules.ps1 to honour `$env:VC_MODULECHECK_PASSWORD (avoids admin lockout)." -ForegroundColor DarkGray
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
  if ($LASTEXITCODE -ne 0) { Write-Warning "Module-health check flagged an issue (exit $LASTEXITCODE) — see the module(s) named above; a broken module breaks /health." }
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
  if ($LASTEXITCODE -ne 0) { Write-Warning "Pinned-module verification flagged an issue (exit $LASTEXITCODE) — a MISSING module is serious; a version mismatch is the known pre-release labelling quirk (confirm the PR by behaviour/schema)." }
}

function Initialize-Admin([bool]$Fresh = $true) {
  Write-Step "Ensure admin password (store → Password1!, idempotent) + write .env.local"
  & node (Join-Path $SkillDir "init-admin.mjs") --back "http://localhost:8090"
  if ($LASTEXITCODE -eq 0) { return }
  if (-not $Fresh) {
    # Preserved DB: the seed-password probe likely locked admin and the platform cached that state.
    # Clear the lockout in the DB, restart the platform to flush the user cache, wait, retry once.
    Write-Warning "init-admin failed on a preserved DB — likely admin lockout from start-local's seed-password probe. Clearing lockout + restarting platform, then retrying."
    Clear-AdminLockout
    docker restart $PlatformContainer *> $null
    Wait-PlatformReady
    & node (Join-Path $SkillDir "init-admin.mjs") --back "http://localhost:8090"
    if ($LASTEXITCODE -ne 0) { Write-Warning "init-admin still failing after lockout recovery (exit $LASTEXITCODE) — admin password may be unknown; consider re-running with -Clean." }
  } else {
    Write-Warning "init-admin reported a problem (exit $LASTEXITCODE) — check the platform is fully up."
  }
}

# Sample data via start-local's own importer. Runs on a FRESH DB BEFORE the password change, so the
# admin password is still the seed 'store'. (The demo's own 'Users' import also resets admin back to
# 'store', which is exactly why init-admin must run AFTER this — see Invoke-Start.) Child process so
# its `exit` can't kill provision. A non-zero exit is usually upstream demo-data drift vs the pinned
# module versions (e.g. a sample product property name that newer Catalog validation rejects) — the
# env is still up, so we warn rather than fail.
function Install-SampleData {
  Write-Step "Install sample data (autoinstall, admin/store — fresh DB, before password change)"
  Push-Location $WorkDir
  try {
    pwsh -NoProfile -File "$SolutionName/scripts/setup-sampledata.ps1" -ApiUrl "http://localhost:8090" -Password "store"
    $code = $LASTEXITCODE
  } finally { Pop-Location }
  if ($code -ne 0) { Write-Warning "Sample-data import reported errors (exit $code) — often upstream demo-data vs module-version drift. Env is up; seed clean fixtures with 'npm run seed:*' if needed." }
  else { Write-Host "  ... sample data installed" -ForegroundColor Green }
}

function Invoke-Start {
  $env:COMPOSE_PROJECT_NAME = $ProjectName
  # Fresh DB = no existing postgres volume, or -Clean wipes it. Decided BEFORE down/clean.
  $wasFresh = $Clean -or (-not (Test-VolumeExists "virto_postgres_data"))
  $sd = if (-not $WithSampleData) { "off (seed via npm run seed:*)" } elseif ($wasFresh) { "demo import (fresh DB, best-effort)" } else { "kept (preserved DB)" }
  Write-Step "Start stack (project: $ProjectName, fresh DB: $wasFresh, sample data: $sd)"
  Stop-Stack                                   # free ports + drop old containers (keeps volumes)
  if ($Clean) { Clear-DataVolumes }
  Wait-PortsFree                               # OS can lag freeing a just-removed container's port
  # Tell start-local's module-check probe the password it will actually meet, so it doesn't lock admin:
  # a fresh DB still has the seed 'store'; a preserved DB was rotated to Password1! by a prior init-admin.
  Set-ModuleCheckPassword
  $env:VC_MODULECHECK_PASSWORD = if ($wasFresh) { "store" } else { "Password1!" }
  # ALWAYS skip start-local's built-in sample-data (hardcodes admin/store → fails post-rotation);
  # when -WithSampleData we import it ourselves below, before the password change.
  Invoke-Lifecycle "start-VC-solution.ps1" @{ solutionFolder = $SolutionName; skipSampleData = $true } -AllowFail $true
  Wait-PlatformReady   # start-local's seed-password module probe exits 1 on a rotated/preserved DB; gate on real /health instead
  # Order matters: sample data FIRST (its 'Users' import resets admin to the seed 'store'), then
  # init-admin LAST so the final, persisted password is Password1!.
  if ($wasFresh -and $WithSampleData) { Install-SampleData }
  Initialize-Admin $wasFresh
  Test-PinnedModules   # confirm pinned pre-release module(s) actually loaded (not silently the release)
  Test-ModuleHealth    # surface any module that failed to load/validate (broken manifest → /health 503)
  Show-Status
}

function Show-Status {
  Write-Step "Status"
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker ps --filter "name=$ProjectName" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  }
  Write-Host "`n  Storefront : http://localhost:80"
  Write-Host "  Platform   : http://localhost:8090   (admin / Password1!, OAuth password grant WITHOUT client_id)"
  Write-Host "  Health     : node .claude/skills/testing/qa-local-env/healthcheck.mjs --token --password 'Password1!'"
}

# ---- dispatch ----------------------------------------------------------------
switch ($Action) {
  "bootstrap" { Test-Preflight; Initialize-Bootstrap }
  "build"     { Test-Preflight; Initialize-Bootstrap; Invoke-BuildIfChanged }
  "start"     { Invoke-Start }
  "stop"      { Write-Step "Stop (containers down, volumes kept)"; $env:COMPOSE_PROJECT_NAME = $ProjectName; Stop-Stack }
  "clean"     { $env:COMPOSE_PROJECT_NAME = $ProjectName; Stop-Stack; Clear-DataVolumes; Write-Host "Data volumes wiped. Next start re-seeds a fresh DB." -ForegroundColor Cyan }
  "remove"    { Write-Step "Remove (containers + volumes + images + $SolutionName folder)"; $env:COMPOSE_PROJECT_NAME = $ProjectName; Invoke-Lifecycle "remove-VC-solution.ps1" @{ solutionFolder = $SolutionName } -AllowFail $true; Remove-Item -Force -ErrorAction SilentlyContinue $LastManifest }
  "status"    { Show-Status }
  "up" {
    Test-Preflight
    Initialize-Bootstrap
    Invoke-BuildIfChanged
    Invoke-Start
    Write-Host "`nStack up. Verify + wire the QA tooling:" -ForegroundColor Cyan
    Write-Host '  node .claude/skills/testing/qa-local-env/healthcheck.mjs --token --password "Password1!"'
    Write-Host '  $env:TEST_ENV = "localhost"   # .env.localhost targets localhost:80/:8090; ADMIN_PASSWORD_LOCALHOST is set in .env.local'
  }
}
