<#
.SYNOPSIS
Writes start-back.cmd, start-front.cmd and stop.cmd into the ticket folder, from ticket.json.

.DESCRIPTION
Each start script opens its own window and also writes the output to logs\back.log or logs\front.log
(overwritten on each start). stop.cmd stops the processes started with the ticket's ports.
#>
param([Parameter(Mandatory)][string]$TicketDir)
. "$PSScriptRoot\common.ps1"

$state = Read-TicketState $TicketDir
$key = $state.key
$back = $state.ports.back
$front = $state.ports.front

# Inside a pwsh -Command: UTF-8 output, the server's output to the window and to a log file
function Get-RunLine([string]$Command, [string]$Log) {
    "pwsh -NoProfile -Command `"[Console]::OutputEncoding = [Text.Encoding]::UTF8; $Command 2>&1 | Tee-Object -FilePath '%~dp0logs\$Log'`""
}

if ($state.platform.kind -eq 'source') {
    $web = "%~dp0$($state.platform.dir)\src\VirtoCommerce.Platform.Web"
    $command = "dotnet '$web\bin\Debug\net10.0\VirtoCommerce.Platform.Web.dll' --webroot '$web\wwwroot' --urls http://localhost:$back"
    # With the branch's web root, FileSystem roots written as ~/... would resolve inside the clone; keep them in back\wwwroot
    $settings = Get-Content (Join-Path $TicketDir 'back\appsettings.json') -Raw | ConvertFrom-Json
    foreach ($section in 'Assets', 'Content') {
        $root = $settings.$section.FileSystem.RootPath
        if ($root -like '~/*') { $command += " '--$($section):FileSystem:RootPath=%~dp0back\wwwroot\$($root.Substring(2).Replace('/', '\'))'" }
    }
    $backNote = "platform from $($state.platform.dir)"
}
else {
    $command = "dotnet VirtoCommerce.Platform.Web.dll --urls http://localhost:$back"
    $backNote = 'installed platform'
}
@"
@echo off
rem $key backend ($backNote) on http://localhost:$back; output also in logs\back.log
title $key backend :$back
cd /d "%~dp0back"
$(Get-RunLine $command 'back.log')
"@ | Set-Content (Join-Path $TicketDir 'start-back.cmd') -Encoding ascii

if ($state.front.kind -eq 'source') {
    $frontLines = @"
rem $key storefront from $($state.front.dir) on https://localhost:$front; output also in logs\front.log
title $key storefront :$front
cd /d "%~dp0$($state.front.dir)"
rem The environment variable takes precedence over APP_BACKEND_URL in .env.local
set APP_BACKEND_URL=http://localhost:$back
$(Get-RunLine "yarn dev --port $front" 'front.log')
"@
}
else {
    # A copy next to the ticket keeps start-front.cmd working without the skills
    Copy-Item (Join-Path $PSScriptRoot 'serve-theme.mjs') (Join-Path $TicketDir '.work\serve-theme.mjs') -Force
    $frontLines = @"
rem $key storefront ($($state.front.url)) on http://localhost:$front; output also in logs\front.log
title $key storefront :$front
cd /d "%~dp0front"
$(Get-RunLine "node '%~dp0.work\serve-theme.mjs' --root '%~dp0front' --port $front --backend http://localhost:$back" 'front.log')
"@
}
"@echo off`r`n$frontLines" | Set-Content (Join-Path $TicketDir 'start-front.cmd') -Encoding ascii

# The servers and their pwsh wrappers carry the ticket's ports in their command lines; so does this command, hence -ne `$PID
@"
@echo off
rem Stops $key's backend (port $back) and storefront (port $front), found by those ports in their command lines
pwsh -NoProfile -Command "`$ports = 'localhost:$back\b|--port\W+$front\b'; Get-CimInstance Win32_Process | Where-Object { `$_.ProcessId -ne `$PID -and `$_.Name -match '^(dotnet|node|pwsh)\.exe$' -and `$_.CommandLine -match `$ports } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue; 'stopped ' + `$_.Name + ' ' + `$_.ProcessId }"
"@ | Set-Content (Join-Path $TicketDir 'stop.cmd') -Encoding ascii

"Wrote start-back.cmd ($backNote, http://localhost:$back), start-front.cmd ($($state.front.kind), port $front) and stop.cmd in $TicketDir"
