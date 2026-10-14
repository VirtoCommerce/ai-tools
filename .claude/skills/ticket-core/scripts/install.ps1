<#
.SYNOPSIS
Installs the platform and modules of back\vc-package.json with vc-build, then sets back\appsettings.json.

.DESCRIPTION
On the first install appsettings.json is copied from <root>\_template; on later installs the ticket's own file is
kept, so an edit such as a dedicated database survives. The ticket's backend must be stopped (vc-build replaces
DLLs). Output goes to logs\install.log; on failure the last lines are printed. Exit code: vc-build's.
#>
param([Parameter(Mandatory)][string]$TicketDir)
. "$PSScriptRoot\common.ps1"

$state = Read-TicketState $TicketDir
$back = Join-Path $TicketDir 'back'
$settings = Join-Path $back 'appsettings.json'
$template = Join-Path (Get-TicketsRoot) '_template\appsettings.json'
$kept = Join-Path $TicketDir '.work\appsettings.json'
$log = Join-Path $TicketDir 'logs\install.log'

if (-not (Get-Command vc-build -ErrorAction SilentlyContinue)) { throw 'vc-build is not installed: dotnet tool install -g VirtoCommerce.GlobalTool' }
if (-not (Test-Path $template)) { throw "TEMPLATE_MISSING: $template" }
if (Get-TicketProcesses $state.ports) { throw 'The ticket''s servers are running: run stop.cmd first' }

$first = -not (Test-Path (Join-Path $back 'VirtoCommerce.Platform.Web.dll'))
if (-not $first -and (Test-Path $settings)) { Copy-Item $settings $kept -Force }

# A failed dependency check makes vc-build ask (p)roceed/(r)ollback; answering r keeps it from waiting forever
Push-Location $back
try {
    cmd /c "echo r| vc-build install > `"$log`" 2>&1"
    $code = $LASTEXITCODE
}
finally { Pop-Location }

if (Test-Path $kept) {
    Move-Item $kept $settings -Force
    $settingsNote = 'kept the ticket''s own appsettings.json'
}
elseif ($code -eq 0) {
    Copy-Item $template $settings -Force
    $settingsNote = "appsettings.json copied from $template"
}

if ($code -ne 0) {
    "vc-build install FAILED (exit $code). Last lines of ${log}:"
    Get-Content $log -Tail 40 | ForEach-Object { "  $_" }
    exit $code
}
$platform = (Get-Item (Join-Path $back 'VirtoCommerce.Platform.Web.dll')).VersionInfo.ProductVersion
$count = @(Get-ChildItem (Join-Path $back 'modules') -Directory).Count
"vc-build install OK: platform $platform, $count module folders; $settingsNote. Log: $log"
