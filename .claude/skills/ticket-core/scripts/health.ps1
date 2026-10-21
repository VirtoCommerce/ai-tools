<#
.SYNOPSIS
Checks a started ticket environment: one OK/FAIL line per check, exit code 1 when any check fails.

.DESCRIPTION
Waits for the backend first (it listens only after every module has started; the first start also runs the
database migrations). Then: the module-load line and error lines in logs\back.log, the GraphQL schema, the
storefront page and the storefront's /graphql (through its proxy). Browser checks (logins, reindex) are separate.
#>
param(
    [Parameter(Mandatory)][string]$TicketDir,
    [int]$TimeoutSec = 900
)
. "$PSScriptRoot\common.ps1"

$state = Read-TicketState $TicketDir
$backUrl = "http://localhost:$($state.ports.back)"
$frontUrl = if ($state.front.kind -eq 'source') { "https://localhost:$($state.ports.front)" } else { "http://localhost:$($state.ports.front)" }
$log = Join-Path $TicketDir 'logs\back.log'
$failed = $false
function Report([bool]$Ok, [string]$Text) {
    if ($Ok) { "OK   $Text" } else { "FAIL $Text"; $script:failed = $true }
}
function Get-Status([string]$Url) {
    try { (Invoke-WebRequest $Url -SkipHttpErrorCheck -SkipCertificateCheck -TimeoutSec 15).StatusCode } catch { 0 }
}
$query = @{ Method = 'Post'; ContentType = 'application/json'; Body = '{"query":"{ __typename }"}'; SkipCertificateCheck = $true; TimeoutSec = 60 }

# 1. Backend: /health answers 200, or 503 when modules have errors
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$unhealthy = 0
do {
    $status = Get-Status "$backUrl/health"
    if ($status -eq 200) { break }
    if ($status -eq 503 -and ++$unhealthy -ge 3) { break }
    $running = Get-CimInstance Win32_Process -Filter "Name='dotnet.exe'" | Where-Object { $_.CommandLine -match "localhost:$($state.ports.back)\b" }
    if (-not $running) { break }
    Start-Sleep 5
} while ((Get-Date) -lt $deadline)
$reason = if ($status -eq 0 -and -not $running) { ' (the backend process is not running; see logs\back.log)' } else { '' }
Report ($status -eq 200) "backend $backUrl/health -> $status$reason"

# 2. The log: modules loaded without errors, no ERR/FTL lines
$text = if (Test-Path $log) { Get-Content $log -Raw } else { '' }
$loaded = [regex]::Match($text, 'Loaded modules: (\d+), with errors: (\d+)')
if ($loaded.Success) { Report ($loaded.Groups[2].Value -eq '0') $loaded.Value }
else { Report $false 'no "Loaded modules" line in logs\back.log' }
$errors = [regex]::Matches($text, '(?m)^\[\d\d:\d\d:\d\d (ERR|FTL)\].*$')
Report ($errors.Count -eq 0) "error lines in logs\back.log: $($errors.Count)"
foreach ($line in $errors | Select-Object -First 10) { "       $($line.Value.Substring(0, [Math]::Min(220, $line.Value.Length)))" }

# 3. GraphQL: a module built against newer assemblies than installed shows up here as FILE_NOT_FOUND
if ($status -eq 200) {
    $answer = try { Invoke-RestMethod "$backUrl/graphql" @query } catch { @{ errors = @(@{ message = $_.Exception.Message }) } }
    Report ($answer.data.__typename -eq 'Query') "backend /graphql { __typename } -> $(if ($answer.errors) { $answer.errors[0].message } else { $answer.data.__typename })"
}

# 4. Storefront: the page, and the backend through its proxy
$deadline = (Get-Date).AddSeconds(120)
do { $page = Get-Status "$frontUrl/"; if ($page -eq 200) { break }; Start-Sleep 3 } while ((Get-Date) -lt $deadline)
Report ($page -eq 200) "storefront $frontUrl/ -> $page"
if ($page -eq 200 -and $status -eq 200) {
    $answer = try { Invoke-RestMethod "$frontUrl/graphql" @query } catch { @{ errors = @(@{ message = $_.Exception.Message }) } }
    Report ($answer.data.__typename -eq 'Query') "storefront /graphql (proxied to the backend) -> $(if ($answer.errors) { $answer.errors[0].message } else { $answer.data.__typename })"
}

if ($failed) { exit 1 }
