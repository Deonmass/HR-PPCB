param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$DataJson
)

$ErrorActionPreference = 'Stop'

function Set-TableCellText {
  param($Table, [int]$Row, [int]$Col, [string]$Value)
  if (-not $Value) { return }
  $Table.Cell($Row, $Col).Range.Text = $Value
}

$data = $DataJson | ConvertFrom-Json
$resolvedTemplate = [System.IO.Path]::GetFullPath($TemplatePath)
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $resolvedOutput
if (-not (Test-Path $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

Copy-Item -LiteralPath $resolvedTemplate -Destination $resolvedOutput -Force

$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($resolvedOutput, $false, $false)
  $table = $document.Tables.Item(1)

  Set-TableCellText $table 1 3 $data.passportFullName
  Set-TableCellText $table 2 3 $data.purpose
  Set-TableCellText $table 3 3 ([string]$data.numberOfTravellers)
  Set-TableCellText $table 4 3 $data.nearestAirport
  Set-TableCellText $table 5 3 $data.carrier
  Set-TableCellText $table 6 3 $data.frequentFlyerNumber
  Set-TableCellText $table 7 3 $data.seatPreference
  Set-TableCellText $table 9 3 $data.flyDepartureDate
  Set-TableCellText $table 9 5 $data.flyReturnDate
  Set-TableCellText $table 10 3 $data.flyDepartureFrom
  Set-TableCellText $table 10 5 $data.flyReturnFrom
  Set-TableCellText $table 11 3 $data.flyDepartureTo
  Set-TableCellText $table 11 5 $data.flyReturnTo
  Set-TableCellText $table 12 3 $data.estimatedCost

  if ($data.employeeName) {
    try {
      Set-TableCellText $document.Tables.Item(2) 1 2 $data.employeeName
    } catch {}
  }

  $document.Save()
}
finally {
  if ($document) { $document.Close($true) | Out-Null }
  if ($word) { $word.Quit() | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Write-Output $resolvedOutput
