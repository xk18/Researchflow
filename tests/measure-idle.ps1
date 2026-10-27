$ErrorActionPreference = 'Stop'
$nativeRoot = Get-Process -Name researchflow
if (@($nativeRoot).Count -ne 1) { throw 'Expected a single ResearchFlow process.' }
$inventory = Get-CimInstance Win32_Process
$nativeIds = [System.Collections.Generic.HashSet[int]]::new()
[void]$nativeIds.Add($nativeRoot.Id)
do {
    $added = $false
    foreach ($process in $inventory) {
        if ($nativeIds.Contains([int]$process.ParentProcessId) -and !$nativeIds.Contains([int]$process.ProcessId)) {
            [void]$nativeIds.Add([int]$process.ProcessId)
            $added = $true
        }
    }
} while ($added)
$initialCpu = 0.0
$workingSet = 0L
$privateBytes = 0L
$names = @()
foreach ($nativeId in $nativeIds) {
    $process = Get-Process -Id $nativeId -ErrorAction SilentlyContinue
    if ($process) {
        $initialCpu += $process.CPU
        $workingSet += $process.WorkingSet64
        $privateBytes += $process.PrivateMemorySize64
        $names += $process.ProcessName
    }
}
$watch = [Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Seconds 10
$finalCpu = 0.0
foreach ($nativeId in $nativeIds) {
    $process = Get-Process -Id $nativeId -ErrorAction SilentlyContinue
    if ($process) { $finalCpu += $process.CPU }
}
$seconds = $watch.Elapsed.TotalSeconds
$report = [ordered]@{
    sampleSeconds = [Math]::Round($seconds, 2)
    processCount = $nativeIds.Count
    processNames = $names
    workingSetMiB = [Math]::Round($workingSet / 1MB, 2)
    privateBytesMiB = [Math]::Round($privateBytes / 1MB, 2)
    nativeHostWorkingSetMiB = [Math]::Round($nativeRoot.WorkingSet64 / 1MB, 2)
    cpuSeconds = [Math]::Round([Math]::Max(0, $finalCpu - $initialCpu), 4)
    percentOfOneCpuCore = [Math]::Round([Math]::Max(0, $finalCpu - $initialCpu) / $seconds * 100, 3)
    note = 'One idle sample with no timer or user records. Includes descendant WebView2 processes. Working-set sum may double-count shared pages; private bytes are committed memory, not resident memory. Sample may include CDP if enabled by launcher; see sample label in ACCEPTANCE.'
}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath 'artifacts\performance.json' -Encoding utf8
$report | ConvertTo-Json -Depth 4

