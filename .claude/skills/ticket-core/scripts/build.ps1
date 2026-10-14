<#
.SYNOPSIS
Builds a clone from <ticket>\sources for running from source.

.DESCRIPTION
vc-platform: dotnet build of VirtoCommerce.Platform.Web and its admin UI (npm install + webpack:build).
A module: dotnet build of src\*.Web, its admin UI (webpack:build) and its VC-Shell apps (into Content\<app id>)
when it has them, then the commands that link it into back\modules (they need an elevated cmd).
Output goes to logs\build-<repo>.log.
#>
param(
    [Parameter(Mandatory)][string]$TicketDir,
    [Parameter(Mandatory)][string]$Repo
)
. "$PSScriptRoot\common.ps1"

$Repo = (Resolve-Path $Repo).Path
$log = Join-Path $TicketDir "logs\build-$(Split-Path $Repo -Leaf).log"
# A newly published NuGet advisory must not stop a local run (the repos treat warnings as errors); the warnings
# stay in the log and CI still fails on them. %3B is an escaped ';' (a bare one separates MSBuild properties).
$audit = '-p:WarningsNotAsErrors=NU1901%3BNU1902%3BNU1903%3BNU1904'
Set-Content $log "Build of $Repo, $(Get-Date)" -Encoding utf8NoBOM

function Invoke-Step([string]$Dir, [string]$Command) {
    Add-Content $log "`n> $Command   (in $Dir)"
    Push-Location $Dir
    try { cmd /c "$Command >> `"$log`" 2>&1" }
    finally { Pop-Location }
    if ($LASTEXITCODE) {
        "FAILED: $Command (exit $LASTEXITCODE). Last lines of ${log}:"
        Get-Content $log -Tail 30 | ForEach-Object { "  $_" }
        exit 1
    }
}

$platformWeb = Join-Path $Repo 'src\VirtoCommerce.Platform.Web'
if (Test-Path (Join-Path $platformWeb 'VirtoCommerce.Platform.Web.csproj')) {
    Invoke-Step $platformWeb "dotnet build VirtoCommerce.Platform.Web.csproj $audit"
    # The csproj does not build the admin UI; its package-lock.json is not committed, so npm install
    Invoke-Step $platformWeb 'npm install'
    Invoke-Step $platformWeb 'npm run webpack:build'
    $state = Read-TicketState $TicketDir
    $state.platform = [ordered]@{ kind = 'source'; dir = [IO.Path]::GetRelativePath($TicketDir, $Repo) }
    Write-TicketState $TicketDir $state
    "platform: built $Repo; start-back.cmd runs it with back\ as the working folder"
    return
}

$web = Get-ChildItem (Join-Path $Repo 'src') -Directory | Where-Object Name -like '*.Web' | Select-Object -First 1
if (-not $web) { throw "No src\*.Web project in $Repo" }
$manifest = [xml](Get-Content (Join-Path $web.FullName 'module.manifest') -Raw)
$id = $manifest.module.id
$project = Get-ChildItem $web.FullName -Filter *.csproj | Select-Object -First 1
Invoke-Step $web.FullName "dotnet build `"$($project.Name)`" $audit"

$package = Join-Path $web.FullName 'package.json'
if ((Test-Path $package) -and (Get-Content $package -Raw | ConvertFrom-Json).scripts.'webpack:build') {
    $restore = if (Test-Path (Join-Path $web.FullName 'package-lock.json')) { 'npm ci' } else { 'npm install' }
    Invoke-Step $web.FullName $restore
    Invoke-Step $web.FullName 'npm run webpack:build'
}

# A VC-Shell app is served from Content\<app id>; CI builds it into the zip, and without it the platform does not start
foreach ($app in $manifest.module.apps.app) {
    $appDir = Join-Path $web.FullName 'App'
    $yarn = Get-ChildItem (Join-Path $appDir '.yarn\releases') -Filter 'yarn-*.cjs' -ErrorAction SilentlyContinue | Select-Object -First 1
    $run = if ($yarn) { "node `"$($yarn.FullName)`"" } else { 'yarn' }
    Invoke-Step $appDir "$run install"
    Invoke-Step $appDir "$run build"
    $content = Join-Path $web.FullName "Content\$($app.id)"
    if (Test-Path $content) { Remove-Item $content -Recurse -Force }
    New-Item -ItemType Directory $content | Out-Null
    Copy-Item (Join-Path $appDir 'dist\*') $content -Recurse
}

# A storefront plugin (Module Federation remote) is built by `dotnet publish` (BuildStorefrontPlugin) into
# plugins\vc-frontend, where the platform serves it from; a linked module needs the same build (without type-check)
$storefront = Join-Path $web.FullName 'StorefrontApp'
if (Test-Path (Join-Path $storefront 'package.json')) {
    Invoke-Step $storefront 'yarn install'
    Invoke-Step $storefront 'yarn build'
}

$link = Join-Path $TicketDir "back\modules\$id"
$existing = Get-Item $link -ErrorAction SilentlyContinue
if ($existing.LinkTarget -eq $web.FullName) {
    "${id}: built; already linked to $($web.FullName)"
    return
}
"${id}: built. To run it, link it in an elevated cmd:"
if ($existing.LinkTarget) { "  rmdir `"$link`"" }
elseif ($existing) { "  rmdir /s /q `"$link`"" }
"  mklink /d `"$link`" `"$($web.FullName)`""
