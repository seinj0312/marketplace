# Modified from https://github.com/JulienMaille/dribbblish-dynamic-theme/blob/main/install.ps1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "Setting up..." -ForegroundColor "Green"

$checkSpice = Get-Command spicetify -ErrorAction Silent
if ($null -eq $checkSpice) {
  Write-Host -ForegroundColor Red "Spicetify not found. Installing that for you..."
  Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/khanhas/spicetify-cli/master/install.ps1" | Invoke-Expression
}

$spicePath = "$env:APPDATA\spicetify"
$sp_dot_dir = "$spicePath\CustomApps"
if (-not (Test-Path $sp_dot_dir)) {
  Write-Host "Making a CustomApps folder..." -ForegroundColor "Cyan"
  New-Item -Path $sp_dot_dir -ItemType Directory | Out-Null
}

Write-Host "Downloading..." -ForegroundColor "Green"

$latest_release_uri =
"https://api.github.com/repos/spicetify/spicetify-marketplace/releases/latest"
$latest_release_json = Invoke-WebRequest -Uri $latest_release_uri -UseBasicParsing
$version = ($latest_release_json | ConvertFrom-Json).tag_name -replace "v", ""
$download_uri = "https://github.com/spicetify/spicetify-marketplace/releases/download/" +
"v$version/spicetify-marketplace.zip"

Invoke-WebRequest -Uri $download_uri -UseBasicParsing -OutFile "$sp_dot_dir\marketplace.zip"

Write-Host "Unzipping and installing..." -ForegroundColor "Green"
Expand-Archive -Path "$sp_dot_dir\marketplace.zip" -DestinationPath $sp_dot_dir -Force
Remove-Item -Path "$sp_dot_dir\marketplace.zip" -Force
if (Test-Path -Path "$sp_dot_dir\marketplace") {
  Write-Host "marketplace was already found! Updating..." -ForegroundColor "Cyan"
  Remove-Item -Path "$sp_dot_dir\marketplace" -Force -Recurse
}
Rename-Item -Path "$sp_dot_dir\spicetify-marketplace-dist" -NewName "marketplace" -Force
spicetify config custom_apps spicetify-marketplace-
spicetify config custom_apps marketplace

# Color injection fix
spicetify config inject_css 1
spicetify config replace_colors 1

Write-Host "Applying placeholder theme..." -ForegroundColor "Cyan"
Remove-Item -Recurse -Force "$spicePath\Themes\marketplace" -ErrorAction Ignore
New-Item -Path "$spicePath\Themes\marketplace" -ItemType Directory | Out-Null
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/spicetify-marketplace/main/resources/color.ini" -OutFile "$spicePath\Themes\marketplace\color.ini"
spicetify config current_theme marketplace

spicetify backup
spicetify apply

Write-Host "Done! If nothing has happened, do spicetify apply" -ForegroundColor "Green"
