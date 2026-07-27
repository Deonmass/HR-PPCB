param(
  [Parameter(Mandatory = $true)][string]$JobsPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $JobsPath)) {
  throw "Fichier jobs introuvable: $JobsPath"
}

$jobs = Get-Content -LiteralPath $JobsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $jobs) {
  throw 'Aucun document a convertir'
}

$wordJobs = @($jobs | Where-Object { $_.ext -in '.docx', '.doc' })
$excelJobs = @($jobs | Where-Object { $_.ext -eq '.xlsx' })

function Convert-WordBatch {
  param($Items)
  if ($Items.Count -eq 0) { return }

  $word = $null
  try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.ScreenUpdating = $false

    foreach ($item in $Items) {
      $inputPath = [System.IO.Path]::GetFullPath([string]$item.input)
      $outputPath = [System.IO.Path]::GetFullPath([string]$item.output)
      $parent = Split-Path -Parent $outputPath
      if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
      }

      $document = $null
      try {
        $document = $word.Documents.Open($inputPath, $false, $true)
        $document.ExportAsFixedFormat2($outputPath, 17)
      }
      finally {
        if ($document) { $document.Close($false) | Out-Null }
      }
    }
  }
  finally {
    if ($word) { $word.Quit() | Out-Null }
  }
}

function Convert-ExcelBatch {
  param($Items)
  if ($Items.Count -eq 0) { return }

  $excel = $null
  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $excel.EnableEvents = $false

    foreach ($item in $Items) {
      $inputPath = [System.IO.Path]::GetFullPath([string]$item.input)
      $outputPath = [System.IO.Path]::GetFullPath([string]$item.output)
      $parent = Split-Path -Parent $outputPath
      if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
      }

      $workbook = $null
      try {
        $workbook = $excel.Workbooks.Open($inputPath, 0, $true)
        $workbook.ExportAsFixedFormat(0, $outputPath)
      }
      finally {
        if ($workbook) { $workbook.Close($false) | Out-Null }
      }
    }
  }
  finally {
    if ($excel) { $excel.Quit() | Out-Null }
  }
}

Convert-WordBatch -Items $wordJobs
Convert-ExcelBatch -Items $excelJobs

foreach ($item in $jobs) {
  $outputPath = [System.IO.Path]::GetFullPath([string]$item.output)
  if (-not (Test-Path -LiteralPath $outputPath)) {
    throw "PDF non genere: $outputPath"
  }
}

Write-Output 'OK'
