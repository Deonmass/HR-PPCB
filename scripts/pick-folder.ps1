param(
  [string]$InitialPath = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles() | Out-Null

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Dossier d'enregistrement des documents de voyage"
$dialog.ShowNewFolderButton = $true

if ($InitialPath -and (Test-Path -LiteralPath $InitialPath)) {
  $dialog.SelectedPath = [System.IO.Path]::GetFullPath($InitialPath)
}

$result = $dialog.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  exit 2
}

$selected = $dialog.SelectedPath.Trim()
if (-not $selected) {
  exit 2
}

Write-Output $selected
