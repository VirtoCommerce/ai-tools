# Shared helpers for the ticket scripts. Dot-source it first: . "$PSScriptRoot\common.ps1"
$ErrorActionPreference = 'Stop'

# The tickets root is remembered in ~/.vc-tickets.json; VC_TICKETS_CONFIG points to another file (tests)
function Get-ConfigPath {
    if ($env:VC_TICKETS_CONFIG) { return $env:VC_TICKETS_CONFIG }
    Join-Path $HOME '.vc-tickets.json'
}

function Get-TicketsRoot {
    $config = Get-ConfigPath
    if (Test-Path $config) { (Get-Content $config -Raw | ConvertFrom-Json).root }
}

# Ports come from the ticket number: VCST-6315 -> backend 16315, frontend 26315
function Get-TicketPorts([string]$Key) {
    $number = [int]($Key -replace '^.*-', '') % 10000
    [ordered]@{ back = 10000 + $number; front = 20000 + $number }
}

function Read-TicketState([string]$TicketDir) {
    $file = Join-Path $TicketDir 'ticket.json'
    if (Test-Path $file) { return Get-Content $file -Raw | ConvertFrom-Json -AsHashtable }
    [ordered]@{}
}

function Write-TicketState([string]$TicketDir, [System.Collections.IDictionary]$State) {
    $State.updated = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
    $State | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $TicketDir 'ticket.json') -Encoding utf8NoBOM
}

# "3.1050.0-alpha.12-x" -> 3.1050.0. The prerelease part is dropped, as the platform's dependency check does.
function Get-VersionNumber([string]$Version) {
    [version](($Version -split '-', 2)[0])
}

# Blob names are <ModuleId>_<version>.zip
function Get-BlobId([string]$BlobName) { ($BlobName -split '_', 2)[0] }
function Get-BlobVersion([string]$BlobName) { ($BlobName -replace '\.zip$', '' -split '_', 2)[1] }

function Test-Url([string]$Url) {
    try { (Invoke-WebRequest $Url -Method Head -SkipHttpErrorCheck -TimeoutSec 30).StatusCode -eq 200 }
    catch { $false }
}

# Processes of a ticket's servers: the backend runs with --urls http://localhost:<back>, the frontend with --port <front>
# (yarn starts vite with quoted arguments: "--port" "21234")
function Get-TicketProcesses([System.Collections.IDictionary]$Ports) {
    $pattern = "localhost:$($Ports.back)\b|--port\W+$($Ports.front)\b"
    Get-CimInstance Win32_Process -Filter "Name='dotnet.exe' OR Name='node.exe'" |
        Where-Object { $_.CommandLine -match $pattern }
}
