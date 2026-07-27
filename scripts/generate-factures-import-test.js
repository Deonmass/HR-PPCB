const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '..', 'Excel', 'factures-fournisseurs');
fs.mkdirSync(outDir, { recursive: true });

const fournisseurs = [
  'Aquafina SARL',
  'Gringo Services',
  'Congo Tech Solutions',
  'Kin Metal Trading',
  'Zamba Logistics',
  'Lubudi Mining Supply',
  'Katanga Office Plus',
  'Boma Fresh Foods',
  'Gombe Nettoyage Pro',
  'Kasai Print Express',
  'Equateur Energies',
  'Bandundu Auto Parts',
  'Mwana Construction',
  'Senghor Consulting',
  'Tropica Securite',
  'Nile Pharma Distrib',
  'Copperbelt Spare Parts',
  'Fleuve Transport SA',
  'Okapi IT Services',
  'Virunga Catering',
  'Lualaba Electricite',
  'Matadi Port Agents',
  'Kasavubu Imprimerie',
  'Tshangu Fournitures',
  'Kivu Soft Drink',
  'Maniema Bois Export',
  'Bas-Congo Plomberie',
  'Sud-Kivu Agro Plus',
  'Nord-Kivu Medical',
  'Kinshasa Digital Hub',
];

const commentaires = [
  'Eau potable',
  'Nettoyage',
  'Informatique',
  'Metallurgie',
  'Logistique',
  'Fournitures mines',
  'Papeterie',
  'Alimentation',
  'Entretien',
  'Impression',
  'Energie',
  'Pieces auto',
  'BTP',
  'Conseil',
  'Securite',
  'Pharmaceutique',
  'Pieces detachees',
  'Transport',
  'IT',
  'Restauration',
  'Electricite',
  'Transit',
  'Impression',
  'Fournitures bureau',
  'Boissons',
  'Bois',
  'Plomberie',
  'Agroalimentaire',
  'Medical',
  'Services numeriques',
];

function pad(n, w = 5) {
  return String(n).padStart(w, '0');
}

function d(y, m, day) {
  return new Date(Date.UTC(y, m - 1, day));
}

function addDays(base, n) {
  const x = new Date(base.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Factures');

  const headers = [
    'DATE',
    'SOCIETE',
    'FACTURE',
    'MONTANT',
    'Echeance',
    'PR',
    'DATE PR',
    'P.O',
    'DATE PO',
    'GRN',
    'DATE GRN',
    'payment',
    'DATE PYM',
    'Statut',
  ];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  /**
   * Mix pipeline stages for status testing:
   * 0-5   facture only  → Facture reçue
   * 6-11  + PR          → unpaid
   * 12-17 + PO          → unpaid
   * 18-23 + GRN         → Posted and unpaid
   * 24-29 + payment     → paid
   */
  for (let i = 0; i < 30; i += 1) {
    const societe = fournisseurs[i];
    const facture = `FAC-TEST-${pad(i + 1)}`;
    const dateFac = d(2026, 6, 1 + (i % 28));
    const echeance = addDays(dateFac, 30);
    const montant = Math.round((500 + ((i * 1379) % 19500) + i * 17.25) * 100) / 100;

    let pr = '';
    let datePr = null;
    let po = '';
    let datePo = null;
    let grn = '';
    let dateGrn = null;
    let payment = '';
    let datePym = null;

    if (i >= 6) {
      pr = `PR-${pad(1000 + i, 4)}`;
      datePr = addDays(dateFac, 2);
    }
    if (i >= 12) {
      po = `PO-${pad(2000 + i, 4)}`;
      datePo = addDays(dateFac, 5);
    }
    if (i >= 18) {
      grn = `GRN-${pad(3000 + i, 4)}`;
      dateGrn = addDays(dateFac, 10);
    }
    if (i >= 24) {
      payment = `PYM-${pad(4000 + i, 4)}`;
      datePym = addDays(dateFac, 20);
    }

    const statut = `${commentaires[i]} — lot test import`;

    const excelRow = sheet.addRow([
      dateFac,
      societe,
      facture,
      montant,
      echeance,
      pr,
      datePr,
      po,
      datePo,
      grn,
      dateGrn,
      payment,
      datePym,
      statut,
    ]);

    [1, 5, 7, 9, 11, 13].forEach((c) => {
      const cell = excelRow.getCell(c);
      if (cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy';
    });
    excelRow.getCell(4).numFmt = '#,##0.00';
  }

  const widths = [12, 24, 14, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 32];
  sheet.columns.forEach((col, idx) => {
    col.width = widths[idx] || 12;
  });

  const guide = wb.addWorksheet('Guide');
  guide.addRow(['Fichier de test — Import Factures Fournisseurs']);
  guide.addRow([]);
  guide.addRow(['30 factures / 30 fournisseurs pour tester l import Excel.']);
  guide.addRow([]);
  guide.addRow(['Repartition des etapes (statuts calcules) :']);
  guide.addRow(['FAC-TEST-00001 a 00006', 'Facture seule → Facture recue']);
  guide.addRow(['FAC-TEST-00007 a 00012', 'PR renseigne → unpaid']);
  guide.addRow(['FAC-TEST-00013 a 00018', 'PR + PO → unpaid']);
  guide.addRow(['FAC-TEST-00019 a 00024', 'PR + PO + GRN → Posted and unpaid']);
  guide.addRow(['FAC-TEST-00025 a 00030', 'PR + PO + GRN + payment → paid']);
  guide.addRow([]);
  guide.addRow(['Usage : Factures fournisseurs → Importer Excel → choisir ce fichier.']);
  guide.getColumn(1).width = 28;
  guide.getColumn(2).width = 50;

  const outPath = path.join(outDir, 'FACTURES_IMPORT_TEST_30.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('OK', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
