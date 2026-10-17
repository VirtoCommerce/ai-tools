<#
.SYNOPSIS
Writes back\vc-package.json: the newest released platform and modules (vc-deploy-dev@vcptcore-demo) plus the
ticket's changes.

.DESCRIPTION
The base is read once per ticket and pinned in ticket.json, so a rerun changes only what the ticket changes.
-RefreshBase moves the ticket to the current releases.

Minimums come from the frontend's backend-packages.json, from the module.manifest of modules run from source and
from -Floor/-Platform. A prerelease minimum (3.1050.0-alpha.12-x) installs that build from the vc3prerelease blob.
A released minimum newer than the base is only raised when asked with -Floor/-Platform; otherwise it is reported.

Prints each difference from the base, then CHANGED (back\vc-package.json rewritten) or UNCHANGED.
Exit codes: 0 ok; 4 written, but a minimum could not be met (lines starting with NEEDS) - ask the developer.

.EXAMPLE
manifest.ps1 -TicketDir P:\tickets\VCST-1234 -Blob VirtoCommerce.Catalog_3.1050.0-pr-914-f223.zip -FrontRef 2.59.0
#>
param(
    [Parameter(Mandatory)][string]$TicketDir,
    # PR artifacts of modules, e.g. VirtoCommerce.Catalog_3.1050.0-pr-914-f223.zip
    [string[]]$Blob = @(),
    # vc-frontend ref (PR head sha or release tag) whose backend-packages.json gives minimum versions
    [string]$FrontRef,
    # The same from a local file, e.g. sources\vc-frontend\backend-packages.json
    [string]$FrontPackages,
    # module.manifest files of the modules run from source
    [string[]]$ModuleManifest = @(),
    # Ids of the modules run from source: they stay in the manifest as released and are never raised
    [string[]]$Linked = @(),
    # Minimums to apply as given, e.g. VirtoCommerce.Xapi=3.1027.0
    [string[]]$Floor = @(),
    [string]$Platform,
    [switch]$RefreshBase
)
. "$PSScriptRoot\common.ps1"

# pwsh -File passes "a,b" as one string; split lists so both invocation styles work
$Blob = $Blob -split ',' | Where-Object { $_ }
$ModuleManifest = $ModuleManifest -split ',' | Where-Object { $_ }
$Linked = $Linked -split ',' | Where-Object { $_ }
$Floor = $Floor -split ',' | Where-Object { $_ }

$blobRoot = 'https://vc3prerelease.blob.core.windows.net/packages'
$state = Read-TicketState $TicketDir

# Base: what vcptcore-demo runs, i.e. the newest releases
if ($state.base.commit -and -not $RefreshBase) {
    $ref = $state.base.commit
}
else {
    $ref = gh api 'repos/VirtoCommerce/vc-deploy-dev/commits/vcptcore-demo' --jq .sha
    if ($LASTEXITCODE -or -not $ref) { throw 'GitHub: cannot read vc-deploy-dev@vcptcore-demo (check gh auth status)' }
}
$baseJson = gh api -H 'Accept: application/vnd.github.raw' "repos/VirtoCommerce/vc-deploy-dev/contents/backend/packages.json?ref=$ref" | Out-String
if ($LASTEXITCODE) { throw "GitHub: cannot read backend/packages.json at vc-deploy-dev@$ref" }
$manifest = $baseJson | ConvertFrom-Json -AsHashtable

$releases = $manifest.Sources | Where-Object { $_.Name -eq 'GithubReleases' } | Select-Object -First 1
$prereleases = $manifest.Sources | Where-Object { $_.Name -eq 'AzureBlob' } | Select-Object -First 1
if (-not $prereleases) {
    $prereleases = [ordered]@{ Name = 'AzureBlob'; Container = 'packages'; ServiceUri = 'https://vc3prerelease.blob.core.windows.net'; Modules = @() }
    $manifest.Sources = @($manifest.Sources) + $prereleases
}

# Id -> released version ("3.1048.0") or blob name ("VirtoCommerce.X_3.1050.0-pr-1-ab12.zip"), in the base's order
$modules = [ordered]@{}
foreach ($module in $releases.Modules) { $modules[$module.Id] = $module.Version }
foreach ($module in $prereleases.Modules) { $modules[(Get-BlobId $module.BlobName)] = $module.BlobName }
$base = [ordered]@{}
foreach ($id in $modules.Keys) { $base[$id] = $modules[$id] }
$basePlatform = $manifest.PlatformVersion

function Get-EntryVersion([string]$Entry) {
    if ($Entry -like '*.zip') { $Entry = Get-BlobVersion $Entry }
    Get-VersionNumber $Entry
}

# Minimums: Id -> @{ Version; Source; Required }. Required = a mandatory dependency: when the base lacks the module, it
# is installed from the blob (prerelease) or reported as NEEDS (release); an optional one is only mentioned.
$floors = [ordered]@{}
$platformFloor = $null
function Add-Floor([string]$Id, [string]$Version, [string]$Source, [bool]$Required) {
    $known = $floors[$Id]
    if ($known -and (Get-VersionNumber $known.Version) -ge (Get-VersionNumber $Version)) { return }
    $floors[$Id] = @{ Version = $Version; Source = $Source; Required = $Required }
}
function Add-PlatformFloor([string]$Version, [string]$Source) {
    if (-not $Version) { return }
    if ($script:platformFloor -and (Get-VersionNumber $script:platformFloor.Version) -ge (Get-VersionNumber $Version)) { return }
    $script:platformFloor = @{ Version = $Version; Source = $Source }
}

$frontJson = $null
if ($FrontRef) {
    $frontJson = gh api -H 'Accept: application/vnd.github.raw' "repos/VirtoCommerce/vc-frontend/contents/backend-packages.json?ref=$FrontRef" | Out-String
    if ($LASTEXITCODE) { throw "GitHub: cannot read vc-frontend backend-packages.json at $FrontRef" }
}
elseif ($FrontPackages) {
    $frontJson = Get-Content $FrontPackages -Raw
}
if ($frontJson) {
    $front = $frontJson | ConvertFrom-Json -AsHashtable
    Add-PlatformFloor $front.PlatformVersion 'the frontend'
    foreach ($source in $front.Sources) {
        foreach ($module in $source.Modules) {
            if ($module.BlobName) { Add-Floor (Get-BlobId $module.BlobName) (Get-BlobVersion $module.BlobName) 'the frontend' $false }
            else { Add-Floor $module.Id $module.Version 'the frontend' $false }
        }
    }
}

foreach ($file in $ModuleManifest) {
    $xml = [xml](Get-Content $file -Raw)
    $owner = $xml.module.id
    Add-PlatformFloor $xml.module.platformVersion $owner
    foreach ($dependency in $xml.module.dependencies.dependency) {
        Add-Floor $dependency.id $dependency.version $owner ($dependency.optional -ne 'true')
    }
}

$why = @{}
$notes = [System.Collections.Generic.List[string]]::new()

foreach ($name in $Blob) {
    if (-not (Test-Url "$blobRoot/$name")) { throw "No such blob: $blobRoot/$name" }
    $id = Get-BlobId $name
    $modules[$id] = $name
    $why[$id] = 'PR artifact'
}
$overridden = @($Blob | ForEach-Object { Get-BlobId $_ }) + $Linked

foreach ($id in $floors.Keys) {
    if ($overridden -contains $id) { continue }
    $minimum = $floors[$id]
    if (-not $modules.Contains($id)) {
        if (-not $minimum.Required) { $notes.Add("info: $($minimum.Source) lists $id $($minimum.Version), which the base does not install"); continue }
    }
    elseif ((Get-EntryVersion $modules[$id]) -ge (Get-VersionNumber $minimum.Version)) {
        continue
    }
    if ($minimum.Version -like '*-*') {
        $name = "$($id)_$($minimum.Version).zip"
        if (-not (Test-Url "$blobRoot/$name")) {
            $notes.Add("NEEDS $id >= $($minimum.Version) for $($minimum.Source): no blob $name")
            continue
        }
        $modules[$id] = $name
        $why[$id] = "prerelease needed by $($minimum.Source)"
    }
    else {
        $have = if ($modules.Contains($id)) { $modules[$id] } else { 'not installed' }
        $notes.Add("NEEDS $id >= $($minimum.Version) for $($minimum.Source); the base has $have. Rerun with -RefreshBase, or -Floor $id=<released version>")
    }
}

foreach ($item in $Floor) {
    $id, $version = $item -split '=', 2
    if ($version -like '*-*') { $modules[$id] = "$($id)_$version.zip" } else { $modules[$id] = $version }
    $why[$id] = 'requested'
}

if ($Platform) {
    $zip = "https://github.com/VirtoCommerce/vc-platform/releases/download/$Platform/VirtoCommerce.Platform.$Platform.zip"
    if (-not (Test-Url $zip)) { throw "Platform $Platform is not released: $zip" }
    $manifest.PlatformVersion = $Platform
    $manifest.PlatformImageTag = $Platform
}
elseif ($platformFloor -and (Get-VersionNumber $platformFloor.Version) -gt (Get-VersionNumber $manifest.PlatformVersion)) {
    $notes.Add("NEEDS platform >= $($platformFloor.Version) for $($platformFloor.Source); the base has $($manifest.PlatformVersion). Rerun with -RefreshBase or -Platform <released version>, or run the platform from source")
}

$releases.Modules = @(foreach ($id in $modules.Keys) { if ($modules[$id] -notlike '*.zip') { [ordered]@{ Id = $id; Version = $modules[$id] } } })
$prereleases.Modules = @(foreach ($id in $modules.Keys) { if ($modules[$id] -like '*.zip') { [ordered]@{ Id = $id; BlobName = $modules[$id] } } })

"Base: vc-deploy-dev@vcptcore-demo $($ref.Substring(0, 8)): platform $basePlatform, $($base.Count) modules"
foreach ($id in $modules.Keys) {
    if ($base[$id] -ne $modules[$id]) { "  ${id}: $($base[$id] ?? '(not in base)') -> $($modules[$id]) ($($why[$id]))" }
}
if ($manifest.PlatformVersion -ne $basePlatform) { "  platform: $basePlatform -> $($manifest.PlatformVersion) (requested)" }
foreach ($note in $notes) { "  $note" }

$state.base = [ordered]@{ branch = 'vcptcore-demo'; commit = $ref; platform = $basePlatform }
Write-TicketState $TicketDir $state

# vc-build rewrites back\vc-package.json on install, so compare with the last manifest written here, not with that file
$target = Join-Path $TicketDir 'back\vc-package.json'
$last = Join-Path $TicketDir '.work\vc-package.json'
$json = $manifest | ConvertTo-Json -Depth 10
if ((Test-Path $target) -and (Test-Path $last) -and (Get-Content $last -Raw).Trim() -eq $json.Trim()) {
    'UNCHANGED'
}
else {
    $json | Set-Content $target -Encoding utf8NoBOM
    $json | Set-Content $last -Encoding utf8NoBOM
    "CHANGED: $target"
}
if ($notes | Where-Object { $_ -like 'NEEDS*' }) { exit 4 }
