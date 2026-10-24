param(
    [string]$PatchPath = (Join-Path $HOME 'Downloads\radas-auto-release.patch')
)
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw "Git gagal. Berhenti dan hantar output di atas." }
}

if (!(Test-Path 'package.json') -or !(Test-Path 'supabase\migrations')) {
    throw 'Buka PowerShell dalam folder repo radas-v4 dahulu.'
}
$remote = & git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -notmatch 'wancupie-netizen/radas-v4(?:\.git)?$') {
    throw 'Repo origin bukan wancupie-netizen/radas-v4.'
}
$branch = & git branch --show-current
if ($branch -ne 'main') { throw 'Tukar ke branch main dahulu. Tiada perubahan dibuat.' }
$dirty = & git status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Ada perubahan belum disimpan. Berhenti; jangan reset atau buang perubahan.' }
if (!(Test-Path -LiteralPath $PatchPath)) { throw "Patch tidak dijumpai: $PatchPath" }
Invoke-Git pull --ff-only origin main
$title = 'fix(generation): release unresolved slots and recover requests safely'
$subjects = & git log -30 --format=%s
if ($subjects -notcontains $title) {
    Invoke-Git am -- $PatchPath
} else {
    Write-Host 'Patch sudah ada dalam sejarah branch ini; teruskan pengesahan.'
}
if (!(Test-Path 'node_modules')) {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci gagal. Belum push.' }
}
foreach ($task in @('check:generation', 'check:errors', 'check:safety', 'check:history', 'typecheck', 'build')) {
    $taskFile = 'radas-auto-release-' + $task.Replace(':', '-') + '.log'
    $log = Join-Path ([System.IO.Path]::GetTempPath()) $taskFile
    # Windows PowerShell can surface harmless native stderr as PowerShell errors.
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & npm run $task *> $log
        $npmExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedPreference
    }
    if ($npmExit -ne 0) {
        Get-Content -LiteralPath $log -Tail 60
        throw "FAIL $task. Belum push. Log: $log"
    }
    Write-Host "PASS $task"
}
$sql = (Get-Content 'supabase\auto-release-install.sql' -Raw) + "`r`n" +
       (Get-Content 'supabase\verify-auto-release.sql' -Raw)
Set-Clipboard -Value $sql
Start-Process 'https://supabase.com/dashboard/project/fyqvvkpzcwrmyozxlqkw/sql/new'
Write-Host ''
Write-Host 'SQL pemasangan + semakan sudah disalin ke clipboard.'
Write-Host 'Dalam Supabase SQL Editor: Ctrl+V -> Run. Semua 6 baris passed mesti true.'
Write-Host 'Jika semua true, jalankan: git push origin main'
Write-Host 'Jika ada false/error, berhenti dan hantar hasil SQL. Kod belum dipush oleh skrip ini.'
