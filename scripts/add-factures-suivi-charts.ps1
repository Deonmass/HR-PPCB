param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "Workbook introuvable: $WorkbookPath"
}

$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open((Resolve-Path -LiteralPath $WorkbookPath).Path)
  $dash = $wb.Worksheets.Item('Dashboard')

  # Remove existing charts to keep the template idempotent.
  while ($dash.ChartObjects().Count -gt 0) {
    $dash.ChartObjects(1).Delete()
  }

  # Donut — Répartition des montants (F5:G8)
  $chart1 = $dash.ChartObjects().Add(420, 40, 320, 220).Chart
  $chart1.ChartType = 5 # xlPie (Excel will allow doughnut via ChartType 112 if available)
  try { $chart1.ChartType = 112 } catch { } # xlDoughnut
  $chart1.SetSourceData($dash.Range('F5:G8'))
  $chart1.HasTitle = $true
  $chart1.ChartTitle.Text = 'Répartition des montants'
  $chart1.ApplyDataLabels()

  # Bar — Montant dû vs payé (F11:G14)
  $chart2 = $dash.ChartObjects().Add(420, 280, 320, 220).Chart
  $chart2.ChartType = 51 # xlColumnClustered
  $chart2.SetSourceData($dash.Range('F11:G14'))
  $chart2.HasTitle = $true
  $chart2.ChartTitle.Text = 'Montant dû vs posted'

  # Bar — Pipeline (A21:D26 using categories + montant)
  $chart3 = $dash.ChartObjects().Add(40, 420, 700, 240).Chart
  $chart3.ChartType = 51
  $chart3.SetSourceData($dash.Range('A21:A26,D21:D26'))
  $chart3.HasTitle = $true
  $chart3.ChartTitle.Text = 'Montants par étape du pipeline'

  $wb.Save()
  Write-Output "Charts added to $WorkbookPath"
}
finally {
  if ($wb -ne $null) { $wb.Close($true) | Out-Null }
  if ($excel -ne $null) {
    $excel.Quit() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
