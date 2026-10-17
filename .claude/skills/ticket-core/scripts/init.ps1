<#
.SYNOPSIS
Creates or reopens a ticket folder and prints its facts as JSON.

.DESCRIPTION
Exit codes: 0 ok; 2 the tickets root is not configured yet (ask the developer, rerun with -Root);
3 the folder was set up in the other mode (ask the developer, rerun with -Force to switch).

.EXAMPLE
init.ps1 -Key VCST-1234 -Mode pr
init.ps1 -Key VCST-1234 -Mode src -Root D:\tickets    # first run: remembers the root
#>
param(
    [Parameter(Mandatory)][ValidatePattern('^[A-Z][A-Z0-9]*-\d+$')][string]$Key,
    [Parameter(Mandatory)][ValidateSet('pr', 'src')][string]$Mode,
    [string]$Root,
    [switch]$Force
)
. "$PSScriptRoot\common.ps1"

if ($Root) {
    New-Item -ItemType Directory -Force $Root | Out-Null
    @{ root = (Resolve-Path $Root).Path } | ConvertTo-Json | Set-Content (Get-ConfigPath) -Encoding utf8NoBOM
}
$rootDir = Get-TicketsRoot
if (-not $rootDir) {
    "ROOT_NOT_SET: ask the developer for the tickets root folder and rerun with -Root <path>"
    exit 2
}

$dir = Join-Path $rootDir $Key
$state = Read-TicketState $dir
if ($state.mode -and $state.mode -ne $Mode -and -not $Force) {
    "MODE_MISMATCH: $Key runs from '$($state.mode)'; ask the developer, then rerun with -Force to switch to '$Mode'"
    exit 3
}

foreach ($sub in 'back', 'logs', '.work') { New-Item -ItemType Directory -Force (Join-Path $dir $sub) | Out-Null }
$state.key = $Key
$state.mode = $Mode
$state.ports = Get-TicketPorts $Key
Write-TicketState $dir $state

$template = Join-Path $rootDir '_template'
$busy = foreach ($port in $state.ports.Values) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        [ordered]@{ port = $port; pid = $listener.OwningProcess; command = $process.CommandLine }
    }
}

[ordered]@{
    dir       = $dir
    mode      = $Mode
    ports     = $state.ports
    templates = [ordered]@{
        dir         = $template
        appsettings = Test-Path (Join-Path $template 'appsettings.json')
        envLocal    = Test-Path (Join-Path $template '.env.local')
    }
    installed = Test-Path (Join-Path $dir 'back\VirtoCommerce.Platform.Web.dll')
    sources   = @(Get-ChildItem (Join-Path $dir 'sources') -Directory -ErrorAction SilentlyContinue | ForEach-Object Name)
    front     = $state.front
    busyPorts = @($busy)
} | ConvertTo-Json -Depth 5
