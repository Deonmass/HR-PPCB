import ExcelJS from 'exceljs';

function cellText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    if ('text' in raw) return String(raw.text ?? '');
    if ('richText' in raw) return (raw.richText || []).map((p) => p.text).join('');
    if ('result' in raw) return String(raw.result ?? '');
    if ('formula' in raw) return String(raw.formula ?? '');
  }
  return String(raw);
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('Excel/templates/employees/EMPLOYEES_HR_EXPORT_TEMPLATE.xlsx');
  for (const sh of wb.worksheets) {
    const headers = [];
    for (let c = 1; c <= 45; c++) {
      const text = cellText(sh.getRow(2).getCell(c).value).trim();
      if (text) headers.push(`${c}:${text}`);
    }
    console.log('SHEET', sh.name);
    console.log(headers.join('\n'));
    console.log('---');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
