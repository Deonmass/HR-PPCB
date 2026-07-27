/**
 * Smoke-test village export: Dashboard formulas + charts preserved, timing.
 * Run: node scripts/bench-village-export.mjs
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import XlsxPopulate from 'xlsx-populate';

const template = 'Excel/export-templates/VILLAGE_EXPORT_TEMPLATE.xlsx';

async function main() {
  const t0 = Date.now();
  const wb = await XlsxPopulate.fromFileAsync(template);
  console.log('load', Date.now() - t0, 'ms');

  const liste = wb.sheet('Liste');
  for (let i = 0; i < 50; i++) {
    liste.cell(2 + i, 1).value(`M${i}`);
    liste.cell(2 + i, 3).value('Employé');
    liste.cell(2 + i, 7).value(i % 2 === 0 ? `${i}` : '');
  }

  const occ = wb.sheet('Maisons occupees');
  for (let i = 0; i < 30; i++) {
    occ.cell(3 + i, 1).value(i + 1);
    occ.cell(3 + i, 2).value(['Twins', 'Free Style', 'Studio', 'High Standard'][i % 4]);
    occ.cell(3 + i, 3).value('Occupée');
  }
  const vide = wb.sheet('Maisons vides');
  for (let i = 0; i < 6; i++) {
    vide.cell(2 + i, 1).value(100 + i);
    vide.cell(2 + i, 2).value(['Twins', 'Free Style', 'Studio', 'High Standard'][i % 4]);
    vide.cell(2 + i, 3).value('Vide');
  }

  const dash = wb.sheet('Dashboard');
  const occA = "'Maisons occupees'!$A$3:$A$32";
  const videA = "'Maisons vides'!$A$2:$A$7";
  const occType = "'Maisons occupees'!$B$3:$B$32";
  const videType = "'Maisons vides'!$B$2:$B$7";
  const listeStatut = 'Liste!$C$2:$C$51';
  const listeVilla = 'Liste!$G$2:$G$51';

  dash.cell(4, 1).formula(`COUNTA(${occA})+COUNTA(${videA})`);
  dash.cell(4, 2).formula(`COUNTA(${occA})`);
  dash.cell(4, 3).formula(`COUNTA(${videA})`);
  dash
    .cell(11, 1)
    .formula(
      `SUMPRODUCT((${listeStatut}<>"")*(ISNUMBER(SEARCH("Employ",${listeStatut}))))`,
    );
  dash
    .cell(11, 2)
    .formula(
      `SUMPRODUCT((${listeStatut}<>"")*(ISNUMBER(SEARCH("Employ",${listeStatut})))*(${listeVilla}<>""))`,
    );
  dash
    .cell(11, 3)
    .formula(
      `SUMPRODUCT((${listeStatut}<>"")*(ISNUMBER(SEARCH("Employ",${listeStatut})))*(${listeVilla}=""))`,
    );

  for (let row = 4; row <= 7; row++) {
    const label = String(dash.cell(row, 5).value() ?? '').replace(/"/g, '""');
    if (label) {
      dash.cell(row, 6).formula(`COUNTIF(${occType},"${label}")`);
      dash.cell(row, 7).formula(`COUNTIF(${videType},"${label}")`);
    }
    dash.cell(row, 8).formula(`F${row}+G${row}`);
  }
  dash.cell(8, 6).formula('SUM(F4:F7)');
  dash.cell(8, 7).formula('SUM(G4:G7)');
  dash.cell(8, 8).formula('SUM(H4:H7)');

  for (let row = 20; row <= 30; row++) {
    for (let col = 1; col <= 6; col++) dash.cell(row, col).value(null);
  }
  dash.cell(20, 1).value('Engineering');
  for (const [col, letter] of [
    [2, 'B'],
    [3, 'C'],
    [4, 'D'],
    [5, 'E'],
  ]) {
    dash
      .cell(20, col)
      .formula(
        `COUNTIFS(Liste!$I$2:$I$51,$A20,Liste!$H$2:$H$51,${letter}$19,Liste!$C$2:$C$51,"Employé",Liste!$G$2:$G$51,"<>")`,
      );
  }
  dash.cell(20, 6).formula('SUM(B20:E20)');
  dash.cell(31, 1).value('Total');
  dash.cell(31, 2).formula('SUM(B20:B20)');
  dash.cell(31, 3).formula('SUM(C20:C20)');
  dash.cell(31, 4).formula('SUM(D20:D20)');
  dash.cell(31, 5).formula('SUM(E20:E20)');
  dash.cell(31, 6).formula('SUM(F20:F20)');

  const t1 = Date.now();
  const buf = Buffer.from(await wb.outputAsync());
  console.log('output', Date.now() - t1, 'ms', 'bytes', buf.length);
  console.log('total', Date.now() - t0, 'ms');

  const zip = await JSZip.loadAsync(buf);
  const charts = Object.keys(zip.files).filter((n) => n.includes('xl/charts/'));
  console.log(
    'charts kept',
    charts.length,
    charts.filter((c) => /chart\d+\.xml$/.test(c)),
  );

  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const mustHave = ['A4', 'A11', 'F4', 'F8', 'B20', 'C20', 'D20', 'E20', 'F20', 'F31'];
  for (const ref of mustHave) {
    const re = new RegExp(`<c r="${ref}"[^>]*>[\\s\\S]*?</c>`);
    const m = sheet.match(re);
    const hasF = m?.[0]?.includes('<f>');
    console.log(ref, hasF ? 'formula ok' : 'MISSING FORMULA', (m?.[0] || '').slice(0, 160));
  }

  const out = path.join('Excel', 'export-templates', '_bench_village_out.xlsx');
  fs.writeFileSync(out, buf);
  console.log('wrote', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
