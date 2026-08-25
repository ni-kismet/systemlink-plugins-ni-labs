param(
  [string]$WebAppId = "33354324-e3aa-483a-bf17-07f09b89bc6f",
  [string]$ManifestPath = "nipkg.config.json",
  [string]$OutputDir = "dist/packages"
)

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$timestampedPackage = Join-Path $OutputDir "systemlink-health-viewer-$timestamp.nipkg"
$latestPackage = Join-Path $OutputDir "systemlink-health-viewer-latest.nipkg"

# Pack using the Plugin Manager manifest so the package carries display name,
# description, icon, and section metadata for the Plugin Manager listing.
& slcli webapp pack --config $ManifestPath --output $timestampedPackage
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Copy-Item -LiteralPath $timestampedPackage -Destination $latestPackage -Force

& slcli webapp publish $timestampedPackage --id $WebAppId
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# Keep only the latest alias package and remove all timestamped copies.
$timestampedPackages = Get-ChildItem -Path $OutputDir -File -Filter "systemlink-health-viewer-*.nipkg" |
  Where-Object { $_.Name -match '^systemlink-health-viewer-\d{8}-\d{6}\.nipkg$' } |
  Sort-Object LastWriteTime -Descending

$packagesToRemove = $timestampedPackages
foreach ($package in $packagesToRemove) {
  Remove-Item -LiteralPath $package.FullName -Force
}

Write-Host "Updated latest package: $latestPackage"
if ($packagesToRemove.Count -gt 0) {
  Write-Host "Removed timestamped package copies: $($packagesToRemove.Count)"
}
