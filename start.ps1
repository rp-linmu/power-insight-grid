$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$crawlerDir = Join-Path $projectRoot "gd-market-crawler"
$pythonExe = $env:PYTHON_EXE
if (-not $pythonExe) {
    $pythonExe = "python"
}

if (-not (Test-Path $backendDir)) {
    throw "Backend directory not found: $backendDir"
}

if (-not (Test-Path $frontendDir)) {
    throw "Frontend directory not found: $frontendDir"
}

if (-not (Test-Path $crawlerDir)) {
    throw "Crawler directory not found: $crawlerDir"
}

if ($pythonExe -eq "python") {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw "Python executable not found. Install Python or set PYTHON_EXE to a full python.exe path."
    }
}
elseif (-not (Test-Path $pythonExe)) {
    throw "Python executable not found: $pythonExe"
}

$backendCommand = "Set-Location '$backendDir'; & '$pythonExe' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001"
$frontendCommand = "Set-Location '$frontendDir'; npm.cmd run dev"
$crawlerCommand = "Set-Location '$crawlerDir'; node src/index.js web --config config.local.json --port 8787"

function Test-LocalPort {
    param([int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(300)) {
            return $false
        }
        $client.EndConnect($connect)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Start-ServiceIfNeeded {
    param(
        [string]$Name,
        [int]$Port,
        [string]$Command,
        [string]$Url,
        [switch]$Hidden
    )

    if (Test-LocalPort -Port $Port) {
        Write-Host "$Name is already running: $Url"
        return
    }

    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass")
    if (-not $Hidden) {
        $arguments += "-NoExit"
    }
    $arguments += @("-Command", $Command)

    if ($Hidden) {
        Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $arguments | Out-Null
    }
    else {
        Start-Process powershell.exe -ArgumentList $arguments | Out-Null
    }
    Write-Host "$Name starting: $Url"
}

Start-ServiceIfNeeded -Name "Backend" -Port 8001 -Command $backendCommand -Url "http://127.0.0.1:8001"

$nodeModulesDir = Join-Path $frontendDir "node_modules"
if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "Frontend dependencies are missing. Run: cd '$frontendDir'; npm.cmd install"
}
else {
    Start-ServiceIfNeeded -Name "Frontend" -Port 3000 -Command $frontendCommand -Url "http://127.0.0.1:3000"
}

$crawlerConfig = Join-Path $crawlerDir "config.local.json"
if (-not (Test-Path $crawlerConfig)) {
    Write-Host "Crawler config.local.json is missing. Copy config.example.json to config.local.json before starting crawler."
}
else {
    Start-ServiceIfNeeded -Name "Crawler control service" -Port 8787 -Command $crawlerCommand -Url "http://127.0.0.1:8787" -Hidden
}
