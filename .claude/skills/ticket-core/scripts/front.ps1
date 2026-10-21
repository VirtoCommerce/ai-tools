<#
.SYNOPSIS
Prepares a ticket's storefront: a vc-frontend build (theme zip) or a vc-frontend clone.

.DESCRIPTION
-Url     unzips the zip's default\ folder into <ticket>\front (skipped when that build is already there)
-Source  copies .env.local from <root>\_template into the clone when it has none, then runs yarn install
         (output in logs\yarn-install.log)
#>
param(
    [Parameter(Mandatory)][string]$TicketDir,
    [Parameter(Mandatory, ParameterSetName = 'Url')][string]$Url,
    [Parameter(Mandatory, ParameterSetName = 'Source')][string]$Source
)
. "$PSScriptRoot\common.ps1"

$state = Read-TicketState $TicketDir

if ($Url) {
    $front = Join-Path $TicketDir 'front'
    if ($state.front.url -eq $Url -and (Test-Path (Join-Path $front 'index.html'))) {
        "front: $Url is already unpacked in $front"
        return
    }
    $zip = Join-Path $TicketDir '.work\theme.zip'
    Invoke-WebRequest $Url -OutFile $zip
    if (Test-Path $front) { Remove-Item $front -Recurse -Force }
    $frontFull = (New-Item -ItemType Directory $front).FullName + '\'
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
        foreach ($entry in $archive.Entries) {
            if (-not $entry.FullName.StartsWith('default/') -or -not $entry.Name) { continue }
            $target = [IO.Path]::GetFullPath((Join-Path $front $entry.FullName.Substring('default/'.Length)))
            if (-not $target.StartsWith($frontFull)) { throw "Unexpected path in the zip: $($entry.FullName)" }
            New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        }
    }
    finally { $archive.Dispose() }
    if (-not (Test-Path (Join-Path $front 'index.html'))) { throw "No default/index.html in $Url" }
    $state.front = [ordered]@{ kind = 'artifact'; url = $Url }
    "front: unpacked $Url into $front"
}
else {
    $clone = (Resolve-Path $Source).Path
    $envLocal = Join-Path $clone '.env.local'
    if (-not (Test-Path $envLocal)) {
        $template = Join-Path (Get-TicketsRoot) '_template\.env.local'
        if (-not (Test-Path $template)) { throw "TEMPLATE_MISSING: $template" }
        Copy-Item $template $envLocal
        $envNote = '.env.local copied from the template'
    }
    else {
        $envNote = 'kept its .env.local'
    }
    $log = Join-Path $TicketDir 'logs\yarn-install.log'
    Push-Location $clone
    try { cmd /c "yarn install > `"$log`" 2>&1" }
    finally { Pop-Location }
    if ($LASTEXITCODE) {
        "yarn install FAILED (exit $LASTEXITCODE). Last lines of ${log}:"
        Get-Content $log -Tail 30 | ForEach-Object { "  $_" }
        exit $LASTEXITCODE
    }
    $state.front = [ordered]@{ kind = 'source'; dir = [IO.Path]::GetRelativePath($TicketDir, $clone) }
    "front: $clone is ready ($envNote, yarn install done)"
}
Write-TicketState $TicketDir $state
