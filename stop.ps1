$ErrorActionPreference = "SilentlyContinue"

$ports = @(3000, 8001, 8787)
$stopped = @()

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $processId = $connection.OwningProcess
        if (-not $processId) {
            continue
        }

        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) {
            continue
        }

        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        $stopped += [PSCustomObject]@{
            Port = $port
            ProcessName = $process.ProcessName
            Id = $processId
        }
    }
}

if ($stopped.Count -eq 0) {
    Write-Host "No listening dev processes found on ports 3000, 8001 or 8787."
    exit 0
}

$stopped |
    Sort-Object Port, Id -Unique |
    ForEach-Object {
        Write-Host ("Stopped PID {0} ({1}) on port {2}" -f $_.Id, $_.ProcessName, $_.Port)
    }
