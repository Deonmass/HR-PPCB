import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import type { PactilisCompareResult, PactilisDiffRow } from './dependants-pactilis-compare';

/** Helvetica (WinAnsi) — retire les caractères non supportés. */
function pdfSafe(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function sheetFromRows(title: string, rows: PactilisDiffRow[]) {
  const aoa: (string | number)[][] = [
    [
      'N° Pactilis',
      'Matricule RH',
      'Statut',
      'Sexe',
      'Nom et Prénoms',
      'Date de naissance',
      'Employé',
      'Département',
      'Source',
      'Correspondance',
      'À affecter N° Pactilis',
    ],
    ...rows.map((r) => [
      r.pactilisFromFile || r.pactilis,
      r.matricule,
      r.statut,
      r.sexe,
      r.nom,
      r.dateNaissance,
      r.employeNom ?? '',
      r.departement ?? '',
      r.source === 'pactilis'
        ? 'Uniquement Pactilis'
        : r.source === 'locale'
          ? 'Uniquement base locale'
          : 'Correspondance',
      r.matchKind === 'nom' ? 'Par nom' : r.matchKind === 'pactilis' ? 'Par N° Pactilis' : '',
      r.needsPactilisAssign ? 'Oui' : '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 8 },
    { wch: 32 },
    { wch: 14 },
    { wch: 28 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
  ];
  return { title, ws };
}

/** Export Excel des écarts Pactilis vs base locale. */
export function downloadPactilisDiffExcel(result: PactilisCompareResult): void {
  const wb = XLSX.utils.book_new();
  const resume = XLSX.utils.aoa_to_sheet([
    ['Vérification liste Pactilis'],
    ['Fichier', result.fileName],
    ['Lignes Pactilis', result.pactilisCount],
    ['Lignes base locale', result.localeCount],
    ['Correspondances', result.matchedCount],
    ['N° Pactilis à affecter', result.pactilisToAssignCount],
    ['Uniquement dans Pactilis', result.onlyInPactilis.length],
    ['Uniquement dans la base locale', result.onlyInLocale.length],
    ['Généré le', new Date().toLocaleString('fr-FR')],
  ]);
  XLSX.utils.book_append_sheet(wb, resume, 'Resume');

  const matched = sheetFromRows('Correspondances', result.matched ?? []);
  XLSX.utils.book_append_sheet(wb, matched.ws, 'Correspondances');

  const onlyP = sheetFromRows('Uniquement Pactilis', result.onlyInPactilis);
  XLSX.utils.book_append_sheet(wb, onlyP.ws, 'Uniquement_Pactilis');

  const onlyL = sheetFromRows('Uniquement locale', result.onlyInLocale);
  XLSX.utils.book_append_sheet(wb, onlyL.ws, 'Uniquement_Locale');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `Ecarts_Pactilis_${stamp()}.xlsx`,
  );
}

function drawWrappedText(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  color = rgb(0.1, 0.1, 0.1),
): number {
  const words = pdfSafe(text).split(/\s+/);
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      cursorY -= size + 3;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursorY, size, font, color });
    cursorY -= size + 3;
  }
  return cursorY;
}

async function appendDiffSection(
  pdf: PDFDocument,
  title: string,
  rows: PactilisDiffRow[],
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  const margin = 40;
  const lineH = 12;
  let page = pdf.addPage([595.28, 841.89]); // A4
  let { width, height } = page.getSize();
  let y = height - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([595.28, 841.89]);
      ({ width, height } = page.getSize());
      y = height - margin;
    }
  };

  ensureSpace(40);
  page.drawText(pdfSafe(title), { x: margin, y, size: 13, font: bold, color: rgb(0.7, 0.05, 0.1) });
  y -= 18;
  page.drawText(pdfSafe(`${rows.length} ecart(s)`), {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 16;

  if (!rows.length) {
    page.drawText('Aucun ecart.', { x: margin, y, size: 10, font });
    return;
  }

  for (const row of rows) {
    ensureSpace(52);
    const line = `${row.pactilis || '-'} · ${row.statut} · ${row.sexe || '-'} · ${row.nom}`;
    y = drawWrappedText(page, line, margin, y, width - margin * 2, font, 9);
    const detailParts = [
      row.dateNaissance ? `Ne(e) : ${row.dateNaissance}` : '',
      row.matricule ? `Matricule RH : ${row.matricule}` : '',
      row.employeNom ? `Employe : ${row.employeNom}` : '',
      row.departement ? `Dept : ${row.departement}` : '',
    ].filter(Boolean);
    if (detailParts.length) {
      y = drawWrappedText(
        page,
        detailParts.join(' · '),
        margin,
        y,
        width - margin * 2,
        font,
        8,
        rgb(0.4, 0.4, 0.4),
      );
    }
    y -= 6;
    page.drawLine({
      start: { x: margin, y: y + 2 },
      end: { x: width - margin, y: y + 2 },
      thickness: 0.4,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= lineH;
  }
}

/** Export PDF des écarts Pactilis vs base locale. */
export async function downloadPactilisDiffPdf(result: PactilisCompareResult): Promise<void> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  page.drawText('Verification liste Pactilis', {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 22;
  page.drawText(pdfSafe(`Fichier : ${result.fileName || '-'}`), { x: margin, y, size: 10, font });
  y -= 14;
  page.drawText(pdfSafe(`Genere le : ${new Date().toLocaleString('fr-FR')}`), {
    x: margin,
    y,
    size: 10,
    font,
  });
  y -= 22;

  const summary = [
    `Lignes Pactilis : ${result.pactilisCount}`,
    `Lignes base locale : ${result.localeCount}`,
    `Correspondances : ${result.matchedCount}`,
    `N° Pactilis a affecter : ${result.pactilisToAssignCount ?? 0}`,
    `Uniquement Pactilis : ${result.onlyInPactilis.length}`,
    `Uniquement base locale : ${result.onlyInLocale.length}`,
  ];
  for (const line of summary) {
    page.drawText(line, { x: margin, y, size: 11, font });
    y -= 16;
  }

  page.drawText(
    'Correspondance : N° Pactilis prioritaire, sinon nom. Consolidation affecte le N° Pactilis.',
    { x: margin, y: y - 8, size: 8, font, color: rgb(0.4, 0.4, 0.4) },
  );

  await appendDiffSection(
    pdf,
    'Correspondances',
    result.matched ?? [],
    font,
    bold,
  );
  await appendDiffSection(
    pdf,
    'Uniquement dans Pactilis (absents de la base locale)',
    result.onlyInPactilis,
    font,
    bold,
  );
  await appendDiffSection(
    pdf,
    'Uniquement dans la base locale (absents de Pactilis)',
    result.onlyInLocale,
    font,
    bold,
  );

  const bytes = await pdf.save();
  downloadBlob(
    new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
    `Ecarts_Pactilis_${stamp()}.pdf`,
  );
}
