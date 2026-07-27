param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'

function Convert-ExcelToPdf {
  param([string]$ExcelPath, [string]$PdfPath)
  $excel = $null
  $workbook = $null
  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($ExcelPath, 0, $true)
    $workbook.ExportAsFixedFormat(0, $PdfPath)
  }
  finally {
    if ($workbook) { $workbook.Close($false) | Out-Null }
    if ($excel) { $excel.Quit() | Out-Null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

function Convert-WordToPdf {
  param([string]$WordPath, [string]$PdfPath)
  $word = $null
  $document = $null
  try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $document = $word.Documents.Open($WordPath, $false, $true)
    $document.ExportAsFixedFormat2($PdfPath, 17)
  }
  finally {
    if ($document) { $document.Close($false) | Out-Null }
    if ($word) { $word.Quit() | Out-Null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

$extension = [System.IO.Path]::GetExtension($InputPath).ToLowerInvariant()
$resolvedInput = [System.IO.Path]::GetFullPath($InputPath)
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $resolvedOutput
if (-not (Test-Path $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

switch ($extension) {
  '.xlsx' { Convert-ExcelToPdf -ExcelPath $resolvedInput -PdfPath $resolvedOutput }
  '.docx' { Convert-WordToPdf -WordPath $resolvedInput -PdfPath $resolvedOutput }
  '.doc' { Convert-WordToPdf -WordPath $resolvedInput -PdfPath $resolvedOutput }
  default { throw "Extension non supportee: $extension" }
}

if (-not (Test-Path $resolvedOutput)) {
  throw "PDF non genere: $resolvedOutput"
}

Write-Output $resolvedOutput
