/**
 * Génère Excel/factures-fournisseurs/FACTURES_SUIVI_EXPORT_TEMPLATE.xlsx
 * (Dashboard + Factures avec formules + Guide), puis tente d'ajouter les graphiques via Excel COM.
 *
 * Usage: node scripts/build-factures-suivi-export-template.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'Excel', 'factures-fournisseurs');
const outFile = path.join(outDir, 'FACTURES_SUIVI_EXPORT_TEMPLATE.xlsx');

const ALERTE = {
  retard: 'CRITIQUE — EN RETARD',
  echeance7: 'URGENT — Échéance ≤ 7 j',
  creerPr: 'ACTION — Créer PR',
  creerPo: 'ACTION — Créer PO',
  creerGrn: 'ACTION — Créer GRN',
  ok: 'OK — À jour',
};

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const XlsxPopulate = (await import('xlsx-populate')).default;

  const STAGE_LABELS = {
    facture: 'Facture reçue',
    pr: 'PR',
    po: 'PO',
    grn: 'GRN',
    posted: 'Posted and unpaid',
  };
  const STAGES = ['facture', 'pr', 'po', 'grn', 'posted'];
  const MAX = 500;
  const TITLE_ROW = 1;
  const HEADER_ROW = 2;
  const DATA_START = 3;
  const SHEET_DATA = 'Factures';
  const SHEET_DASH = 'Dashboard';
  const SHEET_HELP = 'Guide';

  const COL = {
    facture: 'C',
    montant: 'D',
    echeance: 'E',
    pr: 'F',
    po: 'H',
    grn: 'J',
    statut: 'L',
    commentaire: 'M',
    alerte: 'N',
    jours: 'O',
    retard: 'P',
  };

  function excelDateExpr(col, row) {
    const c = `${col}${row}`;
    return (
      `IF(ISNUMBER(${c}),${c},` +
      `DATE(` +
      `VALUE(RIGHT(TRIM(${c}),4)),` +
      `VALUE(MID(TRIM(${c}),FIND("/",TRIM(${c}))+1,FIND("/",TRIM(${c}),FIND("/",TRIM(${c}))+1)-FIND("/",TRIM(${c}))-1)),` +
      `VALUE(LEFT(TRIM(${c}),FIND("/",TRIM(${c}))-1))` +
      `))`
    );
  }

  function rowFormulas(row) {
    const posted = STAGE_LABELS.posted;
    const echeanceDate = `IFERROR(${excelDateExpr(COL.echeance, row)},"")`;
    const joursCell = `${COL.jours}${row}`;
    const isLate = `IFERROR(AND(ISNUMBER(${joursCell}),${joursCell}<0),FALSE)`;
    const isSoon = `IFERROR(AND(ISNUMBER(${joursCell}),${joursCell}<=7),FALSE)`;
    return {
      statut: `IF(${COL.facture}${row}="","",IF(${COL.pr}${row}="","${STAGE_LABELS.facture}",IF(${COL.po}${row}="","${STAGE_LABELS.pr}",IF(${COL.grn}${row}="","${STAGE_LABELS.po}","${posted}"))))`,
      commentaire: `IF(${COL.facture}${row}="","",IF(${COL.pr}${row}="","Facture reçue — en attente PR",IF(${COL.po}${row}="","PR affecté — en attente PO",IF(${COL.grn}${row}="","PO affecté — en attente GRN","Posted and unpaid"))))`,
      jours: `IF(${COL.facture}${row}="","",IF(OR(${COL.echeance}${row}="",${COL.statut}${row}="${posted}"),"",IF(${echeanceDate}="","",${echeanceDate}-TODAY())))`,
      alerte: `IF(${COL.facture}${row}="","",IF(${isLate},"${ALERTE.retard}",IF(${isSoon},"${ALERTE.echeance7}",IF(${COL.pr}${row}="","${ALERTE.creerPr}",IF(${COL.po}${row}="","${ALERTE.creerPo}",IF(${COL.grn}${row}="","${ALERTE.creerGrn}","${ALERTE.ok}"))))))`,
      retard: `IF(${COL.facture}${row}="","",IF(${isLate},"Oui","Non"))`,
    };
  }

  const wb = await XlsxPopulate.fromBlankAsync();
  const data = wb.sheet(0);
  data.name(SHEET_DATA);

  data.range(`A${TITLE_ROW}:P${TITLE_ROW}`).merged(true);
  data.cell(`A${TITLE_ROW}`).value('Suivi des factures fournisseurs');
  data.range(`A${TITLE_ROW}:P${TITLE_ROW}`).style({
    bold: true,
    fontSize: 16,
    fontColor: 'FFFFFF',
    fill: '0F172A',
    horizontalAlignment: 'left',
    verticalAlignment: 'center',
  });
  data.row(TITLE_ROW).height(32);

  const headers = [
    'DATE', 'SOCIETE', 'FACTURE', 'MONTANT', 'ECHEANCE',
    'PR', 'DATE PR', 'P.O', 'DATE PO', 'GRN', 'DATE GRN',
    'STATUT', 'COMMENTAIRE', 'ALERTE', 'JOURS_RESTANTS', 'RETARD',
  ];
  headers.forEach((h, i) => data.cell(HEADER_ROW, i + 1).value(h));
  data.range(`A${HEADER_ROW}:P${HEADER_ROW}`).style({
    bold: true,
    fontColor: 'FFFFFF',
    fill: '1E3A5F',
    horizontalAlignment: 'center',
    border: true,
    wrapText: true,
  });
  data.row(HEADER_ROW).height(28);

  const lastData = DATA_START + MAX - 1;
  for (let i = 0; i < MAX; i += 1) {
    const row = DATA_START + i;
    const f = rowFormulas(row);
    data.cell(`L${row}`).formula(f.statut);
    data.cell(`M${row}`).formula(f.commentaire);
    data.cell(`N${row}`).formula(f.alerte);
    data.cell(`O${row}`).formula(f.jours);
    data.cell(`P${row}`).formula(f.retard);
  }
  data.range(`N${DATA_START}:N${lastData}`).style({ bold: true, wrapText: true });
  [12, 22, 14, 12, 12, 12, 12, 12, 12, 12, 12, 18, 34, 28, 14, 10].forEach((w, i) =>
    data.column(i + 1).width(w),
  );
  data.freezePanes(0, HEADER_ROW);

  const dash = wb.addSheet(SHEET_DASH, 0);
  const statutRange = `${SHEET_DATA}!$L$${DATA_START}:$L$${lastData}`;
  const montantRange = `${SHEET_DATA}!$D$${DATA_START}:$D$${lastData}`;
  const factureRange = `${SHEET_DATA}!$C$${DATA_START}:$C$${lastData}`;
  const retardRange = `${SHEET_DATA}!$P$${DATA_START}:$P$${lastData}`;
  const alerteRange = `${SHEET_DATA}!$N$${DATA_START}:$N$${lastData}`;
  const posted = STAGE_LABELS.posted;

  dash.range('A1:G1').merged(true).value('Dashboard — Suivi des factures fournisseurs');
  dash.range('A1:G1').style({
    bold: true,
    fontSize: 14,
    fontColor: 'FFFFFF',
    fill: '0F172A',
    verticalAlignment: 'center',
  });
  dash.row(1).height(28);
  dash.cell('A2').value('Généré le');
  dash.cell('B2').value(new Date().toLocaleString('fr-FR'));
  dash.cell('D2').value('Mode');
  dash.cell('E2').value('Formules Excel (édition PR/PO/GRN dans feuille Factures)');

  dash.cell('A4').value('KPI');
  dash.range('A4:C4').style({ bold: true, fill: '1E3A5F', fontColor: 'FFFFFF' });
  dash.cell('A5').value('Indicateur');
  dash.cell('B5').value('Nb');
  dash.cell('C5').value('Montant ($)');
  dash.range('A5:C5').style({ bold: true, fill: 'EEF2FF', border: true });

  dash.cell('A6').value('TOTAL FACTURES');
  dash.cell('B6').formula(`COUNTA(${factureRange})`);
  dash.cell('C6').formula(`SUM(${montantRange})`);
  dash.cell('C6').style('numberFormat', '#,##0.00');

  dash.cell('A7').value('MONTANT DÛ');
  dash.cell('B7').formula(`B6-COUNTIF(${statutRange},"${posted}")`);
  dash.cell('C7').formula(`C6-SUMIF(${statutRange},"${posted}",${montantRange})`);
  dash.cell('C7').style('numberFormat', '#,##0.00');

  dash.cell('A8').value('EN RETARD (ÉCHÉANCE)');
  dash.cell('B8').formula(`COUNTIF(${retardRange},"Oui")`);
  dash.cell('C8').formula(`SUMIF(${retardRange},"Oui",${montantRange})`);
  dash.cell('C8').style('numberFormat', '#,##0.00');
  dash.range('A8:C8').style({ fill: 'FEE2E2' });

  dash.cell('A9').value('POSTED AND UNPAID');
  dash.cell('B9').formula(`COUNTIF(${statutRange},"${posted}")`);
  dash.cell('C9').formula(`SUMIF(${statutRange},"${posted}",${montantRange})`);
  dash.cell('C9').style('numberFormat', '#,##0.00');
  dash.range('A6:C9').style({ border: true });

  dash.cell('A11').value('ALERTES DE SUIVI');
  dash.range('A11:C11').style({ bold: true, fill: '1E3A5F', fontColor: 'FFFFFF' });
  dash.cell('A12').value('Priorité / type');
  dash.cell('B12').value('Nb');
  dash.range('A12:B12').style({ bold: true, fill: 'FEF3C7', border: true });

  const alerts = [
    [ALERTE.retard, 13, 'FEE2E2'],
    [ALERTE.echeance7, 14, 'FFEDD5'],
    [ALERTE.creerPr, 15, 'DBEAFE'],
    [ALERTE.creerPo, 16, 'DBEAFE'],
    [ALERTE.creerGrn, 17, 'DBEAFE'],
    [ALERTE.ok, 18, 'DCFCE7'],
  ];
  alerts.forEach(([label, row, fill]) => {
    dash.cell(`A${row}`).value(label);
    dash.cell(`B${row}`).formula(`COUNTIF(${alerteRange},"${label}")`);
    dash.range(`A${row}:B${row}`).style({ fill, border: true });
  });

  dash.cell('A20').value('PIPELINE — MONTANTS PAR ÉTAPE (source graphiques)');
  dash.range('A20:D20').style({ bold: true, fill: '1E3A5F', fontColor: 'FFFFFF' });
  dash.cell('A21').value('Étape');
  dash.cell('B21').value('Nb factures');
  dash.cell('C21').value('% factures');
  dash.cell('D21').value('Montant ($)');
  dash.range('A21:D21').style({ bold: true, fill: 'EEF2FF', border: true });

  STAGES.forEach((stage, index) => {
    const row = 22 + index;
    const label = STAGE_LABELS[stage];
    dash.cell(`A${row}`).value(label);
    dash.cell(`B${row}`).formula(`COUNTIF(${statutRange},"${label}")`);
    dash.cell(`C${row}`).formula(`IFERROR(B${row}/$B$6,0)`);
    dash.cell(`C${row}`).style('numberFormat', '0.0%');
    dash.cell(`D${row}`).formula(`SUMIF(${statutRange},"${label}",${montantRange})`);
    dash.cell(`D${row}`).style('numberFormat', '#,##0.00');
  });
  dash.range('A22:D26').style({ border: true });

  dash.cell('F4').value('RÉPARTITION DES MONTANTS');
  dash.range('F4:G4').style({ bold: true, fill: '1E3A5F', fontColor: 'FFFFFF' });
  dash.cell('F5').value('Catégorie');
  dash.cell('G5').value('Montant');
  dash.range('F5:G5').style({ bold: true, fill: 'EEF2FF', border: true });
  dash.cell('F6').value('Montant dû');
  dash.cell('G6').formula('C7');
  dash.cell('F7').value('En retard');
  dash.cell('G7').formula('C8');
  dash.cell('F8').value('Posted unpaid');
  dash.cell('G8').formula('C9');
  dash.range('F6:G8').style({ border: true });
  dash.range('G6:G8').style('numberFormat', '#,##0.00');

  dash.cell('F10').value('MONTANT DÛ VS PAYÉ');
  dash.range('F10:G10').style({ bold: true, fill: '1E3A5F', fontColor: 'FFFFFF' });
  dash.cell('F11').value('Catégorie');
  dash.cell('G11').value('Montant');
  dash.range('F11:G11').style({ bold: true, fill: 'EEF2FF', border: true });
  dash.cell('F12').value('Montant dû');
  dash.cell('G12').formula('C7');
  dash.cell('F13').value('En retard');
  dash.cell('G13').formula('C8');
  dash.cell('F14').value('Posted unpaid');
  dash.cell('G14').formula('C9');
  dash.range('F12:G14').style({ border: true });
  dash.range('G12:G14').style('numberFormat', '#,##0.00');

  dash.cell('A28').value(
    'Priorité alertes : CRITIQUE → URGENT → ACTION → OK. Modifiez PR/PO/GRN dans « Factures » : STATUT, ALERTE et Dashboard se recalculent.',
  );
  dash.range('A28:G28').merged(true);
  dash.cell('A28').style({ italic: true, fontColor: '64748B', wrapText: true });
  dash.row(28).height(36);
  dash.column('A').width(30);
  dash.column('B').width(14);
  dash.column('C').width(14);
  dash.column('D').width(14);
  dash.column('F').width(18);
  dash.column('G').width(14);

  const guide = wb.addSheet(SHEET_HELP);
  guide.cell('A1').value('Guide — gestion Excel du suivi factures');
  guide.cell('A1').style({ bold: true, fontSize: 13, fill: '0F172A', fontColor: 'FFFFFF' });
  guide.range('A1:B1').merged(true);
  const guideLines = [
    ['Pipeline', 'Facture reçue → PR → PO → GRN → Posted and unpaid'],
    ['Règle PR', '1 PR peut regrouper plusieurs factures'],
    ['Règle PO', '1 PO peut regrouper plusieurs PR'],
    ['Règle GRN', '1 GRN est lié à un seul PO'],
    ['Saisie', 'DATE, SOCIETE, FACTURE, MONTANT, ECHEANCE, PR, DATE PR, P.O, DATE PO, GRN, DATE GRN'],
    ['Calculé', 'STATUT, COMMENTAIRE, ALERTE, JOURS_RESTANTS, RETARD'],
    ['Dates', 'DD/MM/YYYY (texte ou date Excel) — formules convertissent automatiquement'],
    ['Alertes', `${ALERTE.retard} / ${ALERTE.echeance7} / ACTION PR|PO|GRN / ${ALERTE.ok}`],
  ];
  guideLines.forEach((pair, i) => {
    guide.cell(`A${i + 3}`).value(pair[0]).style({ bold: true });
    guide.cell(`B${i + 3}`).value(pair[1]);
  });
  guide.column('A').width(22);
  guide.column('B').width(90);

  wb.activeSheet(SHEET_DASH);
  await wb.toFileAsync(outFile);
  console.log(`Template écrit: ${outFile}`);

  const ps1 = path.join(root, 'scripts', 'add-factures-suivi-charts.ps1');
  if (fs.existsSync(ps1)) {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-WorkbookPath', outFile],
      { encoding: 'utf8' },
    );
    if (result.status === 0) {
      console.log(result.stdout || 'Graphiques ajoutés via Excel COM');
    } else {
      console.warn('Graphiques non ajoutés (Excel COM indisponible). Les sources de données sont prêtes.');
      if (result.stderr) console.warn(result.stderr);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
