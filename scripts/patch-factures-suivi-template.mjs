/**
 * Met à jour le template export (colonnes payment / DATE PYM + formules STATUT).
 * Préserve le layout Dashboard ; met à jour les formules KPI / pipeline.
 */
import XlsxPopulate from 'xlsx-populate';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(
  root,
  'Excel',
  'factures-fournisseurs',
  'FACTURES_SUIVI_EXPORT_TEMPLATE.xlsx',
);

const LABELS = {
  facture: 'Facture reçue',
  unpaid: 'unpaid',
  posted: 'Posted and unpaid',
  paid: 'paid',
};

const COMMENTS = {
  facture: 'La facture a été reçue et est en attente de création du PR.',
  pr: 'Le PR a été renseigné ; facture non payée, en attente du bon de commande (PO).',
  po: 'Le PO a été renseigné ; facture non payée, en attente du bon de réception (GRN).',
  posted: 'Le GRN a été renseigné ; facture comptabilisée et non payée.',
  paid: 'Le paiement a été enregistré ; facture payée.',
};

const HEADERS = [
  'DATE',
  'SOCIETE',
  'FACTURE',
  'MONTANT',
  'ECHEANCE',
  'PR',
  'DATE PR',
  'P.O',
  'DATE PO',
  'GRN',
  'DATE GRN',
  'payment',
  'DATE PYM',
  'STATUT',
  'COMMENTAIRE',
];

function rowFormulas(row) {
  return {
    statut: `IF(C${row}="","",IF(F${row}="","${LABELS.facture}",IF(H${row}="","${LABELS.unpaid}",IF(J${row}="","${LABELS.unpaid}",IF(L${row}="","${LABELS.posted}","${LABELS.paid}")))))`,
    commentaire: `IF(C${row}="","",IF(F${row}="","${COMMENTS.facture}",IF(H${row}="","${COMMENTS.pr}",IF(J${row}="","${COMMENTS.po}",IF(L${row}="","${COMMENTS.posted}","${COMMENTS.paid}")))))`,
  };
}

async function main() {
  const wb = await XlsxPopulate.fromFileAsync(templatePath);
  const fact = wb.sheet('Factures');

  HEADERS.forEach((h, i) => fact.cell(2, i + 1).value(h));

  for (let i = 0; i < 500; i += 1) {
    const row = 3 + i;
    const f = rowFormulas(row);
    fact.cell(`N${row}`).formula(f.statut);
    fact.cell(`O${row}`).formula(f.commentaire);
  }

  const dash = wb.sheet('Dashboard');
  const statutRange = 'Factures!$N$3:$N$502';
  const montantRange = 'Factures!$D$3:$D$502';
  const factureRange = 'Factures!$C$3:$C$502';

  dash.cell('B6').formula(`COUNTA(${factureRange})`);
  dash.cell('C6').formula(`SUM(${montantRange})`);
  dash.cell('B7').formula(`B6-COUNTIF(${statutRange},"paid")`);
  dash.cell('C7').formula(`C6-SUMIF(${statutRange},"paid",${montantRange})`);
  dash.cell('B8').formula(
    `SUMPRODUCT((Factures!$C$3:$C$502<>"")*(Factures!$N$3:$N$502<>"paid")*(Factures!$E$3:$E$502<>"")*(Factures!$E$3:$E$502<TODAY()))`,
  );
  dash.cell('C8').formula(
    `SUMPRODUCT((Factures!$C$3:$C$502<>"")*(Factures!$N$3:$N$502<>"paid")*(Factures!$E$3:$E$502<>"")*(Factures!$E$3:$E$502<TODAY())*(Factures!$D$3:$D$502))`,
  );
  dash.cell('B9').formula(`COUNTIF(${statutRange},"Posted and unpaid")`);
  dash.cell('C9').formula(`SUMIF(${statutRange},"Posted and unpaid",${montantRange})`);

  const pipeline = [
    [6, LABELS.facture],
    [7, LABELS.unpaid],
    [8, LABELS.posted],
    [9, LABELS.paid],
  ];
  pipeline.forEach(([row, label]) => {
    dash.cell(`E${row}`).value(label);
    dash.cell(`F${row}`).formula(`COUNTIF(${statutRange},"${label}")`);
    dash.cell(`G${row}`).formula(`IFERROR(F${row}/$B$6,0)`);
    dash.cell(`H${row}`).formula(`SUMIF(${statutRange},"${label}",${montantRange})`);
  });
  for (const addr of ['E10', 'F10', 'G10', 'H10']) dash.cell(addr).value(null);

  const guide = wb.sheet('Guide');
  if (guide) {
    guide.cell('B3').value(
      'Facture reçue → unpaid (PR/PO) → Posted and unpaid (GRN) → paid (payment)',
    );
    guide.cell('B7').value(
      'DATE, SOCIETE, FACTURE, MONTANT, ECHEANCE, PR, DATE PR, P.O, DATE PO, GRN, DATE GRN, payment, DATE PYM',
    );
    guide.cell('B8').value('STATUT et COMMENTAIRE (ne pas écraser)');
    guide.cell('A9').value('Statuts');
    guide.cell('B9').value(
      'unpaid = PR ou PO renseigné ; Posted and unpaid = GRN ; paid = payment',
    );
  }

  await wb.toFileAsync(templatePath);
  console.log('Template patched with payment / DATE PYM:', templatePath);
  console.log('N3:', fact.cell('N3').formula());
  console.log('B8:', dash.cell('B8').formula());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
