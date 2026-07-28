/**
 * Seed data/charroi/*.json from Excel/templates/charroi/DECLARATION OF PPC B DRC VEHICLES.xlsx
 * Fallback: Downloads path.
 *
 * Run: node scripts/seed-charroi-from-excel.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XlsxPopulate from 'xlsx-populate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preferred = path.join(
  root,
  'Excel',
  'templates',
  'charroi',
  'DECLARATION OF PPC B DRC VEHICLES.xlsx',
);
const downloads = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'DECLARATION OF PPC B DRC VEHICLES.xlsx',
);
const vehiclesOut = path.join(root, 'data', 'charroi', 'vehicles.json');
const achatsOut = path.join(root, 'data', 'charroi', 'achats.json');

function cellValue(cell) {
  let v = cell.value();
  if (v != null && typeof v === 'object' && v.result !== undefined) v = v.result;
  return v;
}

function str(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function money(value) {
  const n = num(value);
  return n == null ? 0 : Math.round(n * 100) / 100;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeProprietaire(value) {
  const raw = str(value).toUpperCase();
  if (raw.includes('LOXEA')) return 'LOXEA';
  if (raw.includes('PPC')) return 'PPC';
  return '';
}

function nowIso() {
  return new Date().toISOString();
}

function computeFuelCost(litres, prixLitre) {
  return roundMoney(Number(litres || 0) * Number(prixLitre || 0));
}

function computeTotal(parts) {
  return roundMoney(
    parts.coutAchat
      + parts.coutPneus
      + parts.battery
      + parts.othersConsumables
      + parts.fuelCost
      + parts.assuranceAnnuelle
      + parts.taxesControlTech
      + parts.vignette
      + parts.nouvellePlaque
      + parts.entretienTrimestriel
      + parts.reparationsDiverses,
  );
}

function findFleetHeaderRow(sheet) {
  for (let r = 1; r <= 40; r += 1) {
    const a = str(cellValue(sheet.cell(r, 1))).toUpperCase();
    const b = str(cellValue(sheet.cell(r, 2))).toUpperCase();
    if (a.includes('N') && b.includes('MARQUE')) return r;
  }
  return 19;
}

async function main() {
  const src = fs.existsSync(preferred) ? preferred : downloads;
  if (!fs.existsSync(src)) {
    throw new Error(`Excel introuvable: ${preferred}`);
  }

  const workbook = await XlsxPopulate.fromFileAsync(src);
  const fleetSheet =
    workbook.sheets().find((s) => /PPC|LOXEA|VEHIC/i.test(s.name())) || workbook.sheet(0);
  const newCarsSheet =
    workbook.sheets().find((s) => /NEW\s*CARS/i.test(s.name())) || workbook.sheet(1);

  const headerRow = findFleetHeaderRow(fleetSheet);
  const stamp = nowIso();
  /** @type {import('../lib/charroi-types').CharroiVehicule[]} */
  const vehicles = [];

  for (let r = headerRow + 1; r <= headerRow + 80; r += 1) {
    const numeroRaw = cellValue(fleetSheet.cell(r, 1));
    const marque = str(cellValue(fleetSheet.cell(r, 2)));
    const type = str(cellValue(fleetSheet.cell(r, 3)));
    const numeroText = str(numeroRaw).toUpperCase();
    if (numeroText.includes('NOUVEAU')) break;
    if (numeroText === 'N°' || numeroText === 'N' || numeroText.startsWith('N°')) continue;
    if (typeof numeroRaw !== 'number') continue;
    if (!marque && !type) continue;

    const seq = vehicles.length + 1;
    vehicles.push({
      id: `veh-${String(seq).padStart(3, '0')}`,
      numero: num(numeroRaw) ?? seq,
      marque,
      type,
      numeroChassis: str(cellValue(fleetSheet.cell(r, 4))),
      plaque: str(cellValue(fleetSheet.cell(r, 5))),
      cv: str(cellValue(fleetSheet.cell(r, 6))),
      assureur: str(cellValue(fleetSheet.cell(r, 7))),
      departement: str(cellValue(fleetSheet.cell(r, 8))),
      user: str(cellValue(fleetSheet.cell(r, 9))),
      province: str(cellValue(fleetSheet.cell(r, 10))),
      proprietaire: normalizeProprietaire(cellValue(fleetSheet.cell(r, 11))),
      kilometrage: num(cellValue(fleetSheet.cell(r, 12))),
      miseCirculation: str(cellValue(fleetSheet.cell(r, 13))),
      age: num(cellValue(fleetSheet.cell(r, 14))),
      observationTech: str(cellValue(fleetSheet.cell(r, 15))),
      notes: '',
      createdAt: stamp,
      updatedAt: stamp,
    });

    // Fleet ends at N° 44 (Excel rows before NOUVEAUX VEHICULES block).
    if (vehicles.length >= 44 && (num(numeroRaw) ?? 0) >= 44) break;
  }

  /** @type {import('../lib/charroi-types').CharroiAchat[]} */
  const achats = [];
  let achatHeaderRow = 11;
  for (let r = 1; r <= 30; r += 1) {
    const a = str(cellValue(newCarsSheet.cell(r, 1))).toUpperCase();
    const b = str(cellValue(newCarsSheet.cell(r, 2))).toUpperCase();
    if (a.includes('N') && b.includes('NATURE')) {
      achatHeaderRow = r;
      break;
    }
  }

  for (let r = achatHeaderRow + 1; r <= achatHeaderRow + 40; r += 1) {
    const numeroRaw = cellValue(newCarsSheet.cell(r, 1));
    const nature = str(cellValue(newCarsSheet.cell(r, 2)));
    const marque = str(cellValue(newCarsSheet.cell(r, 3)));
    if (!nature && !marque && numeroRaw == null) continue;
    if (typeof numeroRaw !== 'number' && !nature) continue;

    const litres = money(cellValue(newCarsSheet.cell(r, 17)));
    const prixLitre = money(cellValue(newCarsSheet.cell(r, 18)));
    const fuelFromSheet = money(cellValue(newCarsSheet.cell(r, 19)));
    const fuelCost = fuelFromSheet || computeFuelCost(litres, prixLitre);
    const parts = {
      coutAchat: money(cellValue(newCarsSheet.cell(r, 13))),
      coutPneus: money(cellValue(newCarsSheet.cell(r, 14))),
      battery: money(cellValue(newCarsSheet.cell(r, 15))),
      othersConsumables: money(cellValue(newCarsSheet.cell(r, 16))),
      fuelCost,
      assuranceAnnuelle: money(cellValue(newCarsSheet.cell(r, 20))),
      taxesControlTech: money(cellValue(newCarsSheet.cell(r, 21))),
      vignette: money(cellValue(newCarsSheet.cell(r, 22))),
      nouvellePlaque: money(cellValue(newCarsSheet.cell(r, 23))),
      entretienTrimestriel: money(cellValue(newCarsSheet.cell(r, 24))),
      reparationsDiverses: money(cellValue(newCarsSheet.cell(r, 25))),
    };
    const totalFromSheet = money(cellValue(newCarsSheet.cell(r, 26)));
    const seq = achats.length + 1;
    achats.push({
      id: `ach-${String(seq).padStart(3, '0')}`,
      numero: num(numeroRaw) ?? seq,
      nature,
      marque,
      type: str(cellValue(newCarsSheet.cell(r, 4))),
      plaque: str(cellValue(newCarsSheet.cell(r, 5))),
      cv: str(cellValue(newCarsSheet.cell(r, 6))),
      miseCirc: str(cellValue(newCarsSheet.cell(r, 7))),
      depart: str(cellValue(newCarsSheet.cell(r, 8))),
      centreDeCout: str(cellValue(newCarsSheet.cell(r, 9))),
      province: str(cellValue(newCarsSheet.cell(r, 10))),
      matricule: str(cellValue(newCarsSheet.cell(r, 11))),
      secteur: str(cellValue(newCarsSheet.cell(r, 12))),
      ...parts,
      nbreLitrCarteEngen: litres,
      prixLitre,
      total: totalFromSheet || computeTotal(parts),
      status: 'demande',
      notes: '',
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  fs.mkdirSync(path.dirname(vehiclesOut), { recursive: true });
  fs.writeFileSync(
    vehiclesOut,
    JSON.stringify({ vehicles, nextSeq: vehicles.length + 1 }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    achatsOut,
    JSON.stringify({ achats, nextSeq: achats.length + 1 }, null, 2),
    'utf8',
  );

  console.log(`Source: ${src}`);
  console.log(`Vehicles seeded: ${vehicles.length} → ${vehiclesOut}`);
  console.log(`Achats seeded: ${achats.length} → ${achatsOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
