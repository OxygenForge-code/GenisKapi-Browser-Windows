$ErrorActionPreference = 'Stop'
Write-Host '=== GenişKapı Browser Windows Build ==='
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ gerekli.' }
if (-not (Test-Path package-lock.json)) { npm install }
else { npm ci }
npm run build
Write-Host 'Build tamamlandi. dist klasorunu kontrol edin.'
