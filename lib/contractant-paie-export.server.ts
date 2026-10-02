import 'server-only';

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import type { ContractantPayrollLineResult, ContractantPayrollSite } from './contractant-paie-calc';

const TEMPLATE_FILES: Record<ContractantPayrollSite, string> = {
  site: 'ppc-usine-site.xlsx',
  'hors-site': 'ppc-hors-site.xlsx',
};

const SHEET_NAMES: Record<ContractantPayrollSite, string> = {
  site: 'PPC Usine-Zamba',
  'hors-site': 'Hors-Site',
};

function templatePath(site: ContractantPayrollSite): string {
  return path.join(process.cwd(), 'data', 'templates', 'paie', TEMPLATE_FILES[site]);
}

function setNum(cell: ExcelJS.Cell, value: number) {
  // Valeur pure — évite de laisser des sharedFormula orphelines
  cell.value = Number.isFinite(value) ? Math.round(value * 1e8) / 1e8 : 0;
}

function setText(cell: ExcelJS.Cell, value: string) {
  cell.value = value || '';
}

/** Supprime les tableaux Excel (sources de formules partagées). */
function removeAllTables(ws: ExcelJS.Worksheet) {
  const tables = (ws as ExcelJS.Worksheet & { tables?: Record<string, unknown> }).tables;
  for (const name of Object.keys(tables ?? {})) {
    try {
      ws.removeTable(name);
    } catch {
      // ignore
    }
  }
}

/** Remplace toute formule / sharedFormula par sa valeur calculée ou vide. */
function flattenFormulas(ws: ExcelJS.Worksheet) {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as unknown;
      if (v && typeof v === 'object') {
        const obj = v as {
          formula?: string;
          sharedFormula?: string;
          result?: unknown;
          richText?: unknown;
        };
        if (obj.formula != null || obj.sharedFormula != null) {
          const result = obj.result;
          if (typeof result === 'number') cell.value = result;
          else if (typeof result === 'string') cell.value = result;
          else if (result == null) cell.value = null;
          else cell.value = Number(result) || 0;
        }
      }
    });
  });
}

/**
 * Remplit le template Excel paie (mêmes colonnes que le fichier source).
 * Les colonnes calculées sont écrites en valeurs (moteur TS).
 */
export async function buildContractantPaieExcelBuffer(opts: {
  site: ContractantPayrollSite;
  year: number;
  month: number;
  rows: ContractantPayrollLineResult[];
  fxRate: number;
}): Promise<{ buffer: Buffer; filename: string }> {
  const file = templatePath(opts.site);
  if (!fs.existsSync(file)) {
    throw new Error(`Template paie introuvable: ${TEMPLATE_FILES[opts.site]}`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  for (const sheet of wb.worksheets) {
    removeAllTables(sheet);
    flattenFormulas(sheet);
  }

  const sheetName = SHEET_NAMES[opts.site];
  const ws = wb.getWorksheet(sheetName) || wb.worksheets.find((s) => !/moteur|sheet1/i.test(s.name));
  if (!ws) throw new Error('Feuille paie introuvable dans le template');

  const moteur = wb.getWorksheet('Moteur IPR');
  if (moteur) {
    moteur.getCell('J4').value = opts.fxRate;
  }

  const startRow = 6;
  const lastDataRow = Math.max(ws.rowCount, startRow + opts.rows.length + 20);

  // Efface la zone données (valeurs uniquement, plus de formules partagées)
  for (let r = startRow; r <= lastDataRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 57; c++) {
      row.getCell(c).value = null;
    }
  }

  if (moteur) {
    const moteurLast = Math.max(moteur.rowCount, startRow + opts.rows.length + 20);
    for (let r = startRow; r <= moteurLast; r++) {
      for (const col of ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'] as const) {
        moteur.getCell(`${col}${r}`).value = null;
      }
    }
  }

  opts.rows.forEach((line, index) => {
    const r = startRow + index;
    const row = ws.getRow(r);
    setText(row.getCell(1), line.matricule);
    setText(row.getCell(2), line.nom);
    setText(row.getCell(3), line.fonction);
    setText(row.getCell(4), line.numeroCnss);
    setText(row.getCell(5), line.numeroCompte);
    setText(row.getCell(6), line.banque);
    setNum(row.getCell(7), line.dependants);
    setNum(row.getCell(9), line.jrsPrestes);
    setNum(row.getCell(10), line.txJr);
    setNum(row.getCell(11), line.basePrestes);
    setNum(row.getCell(12), line.jrsFeries);
    setNum(row.getCell(13), line.txJr);
    setNum(row.getCell(14), line.baseFeries);
    setNum(row.getCell(15), line.jrsConges);
    setNum(row.getCell(16), line.txJr);
    setNum(row.getCell(17), line.baseConges);
    setNum(row.getCell(18), line.jrsMaladies);
    setNum(row.getCell(19), line.txJr * 0.667);
    setNum(row.getCell(20), line.baseMaladies);
    setNum(row.getCell(21), line.indemniteLogement);
    setNum(row.getCell(22), line.coutTrs);
    setNum(row.getCell(23), line.transportJours);
    setNum(row.getCell(24), line.jrsFeriesDim);
    setNum(row.getCell(25), line.transportFeries);
    setNum(row.getCell(26), line.totTransport);
    setNum(row.getCell(27), line.montHeuresSupp);
    setNum(row.getCell(28), line.brutImpos);
    setNum(row.getCell(29), line.salImpos);
    setNum(row.getCell(30), line.cnssOuvrier);
    setNum(row.getCell(31), line.ipr);
    setNum(row.getCell(32), line.totalRetenues);
    setNum(row.getCell(33), line.avances);
    setNum(row.getCell(34), line.netAPayer);
    setNum(row.getCell(35), line.cnssPatronal);
    setNum(row.getCell(36), line.inpp);
    setNum(row.getCell(37), line.onem);
    setNum(row.getCell(38), line.totalPatronal);
    setNum(row.getCell(39), line.grossSalary);
    setNum(row.getCell(40), line.mb);
    setNum(row.getCell(41), line.provPpe);
    setNum(row.getCell(42), line.provMed);
    setNum(row.getCell(43), line.tva);
    setNum(row.getCell(44), line.totalGeneral);
    setNum(row.getCell(46), 0);
    setNum(row.getCell(47), line.ot130);
    setNum(row.getCell(48), line.ot160);
    setNum(row.getCell(49), line.ot200);
    setNum(row.getCell(50), line.ot10);
    setNum(row.getCell(51), line.ot25);
    setNum(row.getCell(52), line.ot130Usd);
    setNum(row.getCell(53), line.ot160Usd);
    setNum(row.getCell(54), line.ot200Usd);
    setNum(row.getCell(55), line.ot10Usd);
    setNum(row.getCell(56), line.ot25Usd);
    setNum(row.getCell(57), line.montHeuresSupp);

    if (moteur) {
      const mr = startRow + index;
      setNum(moteur.getCell(`G${mr}`), line.dependants);
      setNum(moteur.getCell(`H${mr}`), line.salImpos);
      setNum(moteur.getCell(`P${mr}`), line.ipr);
    }
  });

  const mois = String(opts.month).padStart(2, '0');
  const label = opts.site === 'site' ? 'SITE' : 'HORS_SITE';
  const filename = `PAIE_CAPITAL_HR_${label}_${opts.year}-${mois}.xlsx`;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename };
}
