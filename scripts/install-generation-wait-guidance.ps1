param([string]$PatchPath = (Join-Path $HOME 'Downloads\radas-wait-guidance.patch'))
$ErrorActionPreference = 'Stop'
function Invoke-Git {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw 'Git gagal. Berhenti dan hantar output di atas.' }
}
if (!(Test-Path 'package.json') -or !(Test-Path 'supabase\auto-release-install.sql')) {
    throw 'Buka PowerShell dalam repo radas-v4 yang sudah dipasang auto-release dahulu.'
}
$remote = & git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote -notmatch 'wancupie-netizen/radas-v4(?:\.git)?$') {
    throw 'Origin bukan repo wancupie-netizen/radas-v4.'
}
$branch = & git branch --show-current
if ($branch -ne 'main') { throw 'Tukar ke branch main dahulu.' }
$dirty = & git status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Ada perubahan belum disimpan. Berhenti; jangan reset atau buang perubahan.' }
if (!(Test-Path -LiteralPath $PatchPath)) { throw "Patch tidak dijumpai: $PatchPath" }
Invoke-Git pull --ff-only origin main
$title = 'feat(generation): add wait timer and repeated-request guidance'
$subjects = & git log -30 --format=%s
if ($subjects -notcontains $title) { Invoke-Git am -- $PatchPath }
else { Write-Host 'Patch sudah dipasang; teruskan semakan.' }
if (!(Test-Path 'node_modules')) {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci gagal. Belum push.' }
}
foreach ($task in @('check:errors', 'typecheck', 'build')) {
    $log = Join-Path ([System.IO.Path]::GetTempPath()) ('radas-wait-guidance-' + $task.Replace(':','-') + '.log')
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & npm run $task *> $log
        $npmExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($npmExit -ne 0) {
        Get-Content -LiteralPath $log -Tail 60
        throw "FAIL $task. Belum push. Log: $log"
    }
    Write-Host "PASS $task"
}
Write-Host 'Siap. Tiada SQL baharu diperlukan. Untuk deploy, jalankan: git push origin main'
