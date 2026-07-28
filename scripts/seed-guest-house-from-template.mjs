/**
 * One-shot: seed data/guest-house/store.json from Guesthouse_template.xlsx,
 * then blank guest-name data cells (keep headers, room labels, formulas, styles).
 * Also ensures Kimpese section exists in the blanked template.
 *
 * Run: node scripts/seed-guest-house-from-template.mjs
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XlsxPopulate from 'xlsx-populate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preferred = path.join(root, 'Excel', 'templates', 'guest-house', 'Guesthouse_template.xlsx');
const rootCopy = path.join(root, 'Excel', 'Guesthouse_template.xlsx');
const storePath = path.join(root, 'data', 'guest-house', 'store.json');
const notePath = path.join(root, 'Excel', 'templates', 'guest-house', 'README.txt');

const DAY_START_COL = 2; // B
const DAY_END_COL = 32; // AF
const TOTAL_COL = 33; // AG
const RATE_COL = 34; // AH

function excelSerialToIso(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

function parseRoomLabel(label) {
  const raw = String(label ?? '').trim();
  const m = raw.match(/^Room\s*#\s*(.+?)\s*-\s*(.+)$/i);
  if (!m) return null;
  return {
    templateLabel: raw,
    roomNumber: m[1].trim(),
    roomName: m[2].trim(),
  };
}

function cellText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (value.result !== undefined) return String(value.result ?? '').trim();
    return '';
  }
  return String(value).trim();
}

function spansFromDayNames(dayNames, dates) {
  /** @type {Array<{ personName: string, startDate: string, endDate: string }>} */
  const spans = [];
  let current = null;
  for (let i = 0; i < dayNames.length; i += 1) {
    const name = dayNames[i];
    const date = dates[i];
    if (!name || !date) {
      if (current) {
        spans.push(current);
        current = null;
      }
      continue;
    }
    if (current && current.personName === name) {
      current.endDate = date;
    } else {
      if (current) spans.push(current);
      current = { personName: name, startDate: date, endDate: date };
    }
  }
  if (current) spans.push(current);
  return spans;
}

async function loadSourceWorkbook() {
  const src = fs.existsSync(preferred) ? preferred : rootCopy;
  if (!fs.existsSync(src)) throw new Error(`Template introuvable: ${preferred}`);
  return { workbook: await XlsxPopulate.fromFileAsync(src), src };
}

function extractStructure(sheet) {
  const dates = [];
  for (let c = DAY_START_COL; c <= DAY_END_COL; c += 1) {
    const v = sheet.cell(1, c).value();
    dates.push(typeof v === 'number' ? excelSerialToIso(v) : '');
  }

  /** @type {Array<{ row: number, building: string, buildingKey: string, parsed: ReturnType<typeof parseRoomLabel> }>} */
  const rooms = [];
  let currentBuilding = '';
  let currentBuildingKey = '';
  const used = sheet.usedRange();
  const endRow = used ? used.endCell().rowNumber() : 40;

  for (let r = 1; r <= endRow; r += 1) {
    const a = cellText(sheet.cell(r, 1).value());
    if (!a) continue;
    if (/^batiment/i.test(a)) {
      currentBuilding = a.trim();
      currentBuildingKey = a.trim();
      continue;
    }
    if (/^total/i.test(a) || /^taux/i.test(a) || /^ppcb/i.test(a) || /^kimpese$/i.test(a)) {
      continue;
    }
    const parsed = parseRoomLabel(a);
    if (parsed && currentBuilding) {
      rooms.push({
        row: r,
        building: currentBuilding,
        buildingKey: currentBuildingKey,
        parsed,
      });
    }
  }

  return { dates, rooms };
}

function extractReservations(sheet, roomMeta, dates) {
  const now = new Date().toISOString();
  /** @type {any[]} */
  const reservations = [];
  /** @type {any[]} */
  const passages = [];
  let seq = 1;

  for (const room of roomMeta) {
    const dayNames = [];
    for (let c = DAY_START_COL; c <= DAY_END_COL; c += 1) {
      dayNames.push(cellText(sheet.cell(room.row, c).value()));
    }
    const spans = spansFromDayNames(dayNames, dates);
    for (const span of spans) {
      const id = randomUUID();
      const numero = `GH-2026-${String(seq).padStart(4, '0')}`;
      seq += 1;
      const reservation = {
        id,
        numero,
        createdAt: `${span.startDate}T08:00:00.000Z`,
        personName: span.personName,
        isAgent: false,
        motif: 'Séjour (import template)',
        startDate: span.startDate,
        endDate: span.endDate,
        roomId: room.id,
        status: 'confirmed',
        notes: 'Importé depuis Guesthouse_template.xlsx',
        company: '',
        mission: '',
        phone: '',
        email: '',
        nationality: '',
        idDoc: '',
        billing: '',
        updatedAt: now,
        source: 'template-seed',
      };
      reservations.push(reservation);
      passages.push({
        id: randomUUID(),
        roomId: room.id,
        reservationId: id,
        numero,
        personName: span.personName,
        motif: reservation.motif,
        startDate: span.startDate,
        endDate: span.endDate,
        checkedInAt: `${span.startDate}T08:00:00.000Z`,
        checkedOutAt: `${span.endDate}T12:00:00.000Z`,
      });
    }
  }

  return { reservations, passages, nextReservationSeq: seq };
}

function clearGuestDataCells(sheet, roomRows) {
  for (const row of roomRows) {
    for (let c = DAY_START_COL; c <= DAY_END_COL; c += 1) {
      const cell = sheet.cell(row, c);
      let formula = null;
      try {
        formula = cell.formula();
      } catch {
        // ignore
      }
      if (formula) continue;
      const v = cell.value();
      if (v === undefined || v === null || v === '') continue;
      cell.value('');
    }
  }
}

function ensureKimpeseSection(sheet) {
  // Place Kimpese block after summary rows (row 26+) so existing formulas stay intact.
  const headerRow = 26;
  const existing = cellText(sheet.cell(headerRow, 1).value());
  if (/^kimpese$/i.test(existing)) return headerRow;

  sheet.cell(headerRow, 1).value('Kimpese');
  try {
    sheet.cell(headerRow, 1).style({
      bold: true,
      fill: { type: 'solid', color: { rgb: '9BC2E6' } },
    });
  } catch {
    // ignore style failures
  }
  // Placeholder note in B26
  sheet.cell(headerRow, 2).value(
    'Hôtels externes (débordement) — noms saisis dans l’app; export remplit les lignes suivantes.',
  );
  return headerRow;
}

async function main() {
  const { workbook, src } = await loadSourceWorkbook();
  const sheet = workbook.sheet(0);
  try {
    sheet.name('Gestion');
  } catch {
    // ignore
  }

  const { dates, rooms: extracted } = extractStructure(sheet);
  const now = new Date().toISOString();

  const rooms = extracted.map((item, index) => {
    const isVip = /vip/i.test(item.parsed.roomNumber);
    return {
      id: randomUUID(),
      roomNumber: item.parsed.roomNumber,
      roomName: item.parsed.roomName,
      templateLabel: item.parsed.templateLabel,
      templateRow: item.row,
      building: item.building,
      buildingKey: item.buildingKey,
      category: 'standard',
      hotelName: '',
      characteristics: isVip ? 'VIP' : '',
      capacity: 1,
      floor: '',
      amenities: [],
      notes: '',
      sortOrder: index + 1,
      status: 'available',
      createdAt: now,
      updatedAt: now,
    };
  });

  const roomMeta = extracted.map((item, i) => ({ ...item, id: rooms[i].id }));
  const { reservations, passages, nextReservationSeq } = extractReservations(sheet, roomMeta, dates);

  const store = {
    meta: {
      version: 2,
      seededFrom: path.relative(root, src).replace(/\\/g, '/'),
      seededAt: now,
      templateSheet: 'Gestion',
      templateMonthHint: dates.find(Boolean)?.slice(0, 7) || null,
      buildings: ['Batiment #1', 'Batiment #2', 'Kimpese'],
      notes: [
        'Rooms seeded from column A (Room # N - NAME) under Batiment headers.',
        'Kimpese = external hotel overflow; hotelName is free text.',
        'Reservations seeded from day-grid guest names (June 2026 sample data).',
      ],
    },
    rooms,
    reservations,
    passages,
    nextReservationSeq,
  };

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
  console.log(`Wrote ${rooms.length} rooms, ${reservations.length} reservations → ${storePath}`);

  clearGuestDataCells(sheet, extracted.map((r) => r.row));
  ensureKimpeseSection(sheet);

  fs.mkdirSync(path.dirname(preferred), { recursive: true });
  await workbook.toFileAsync(preferred);
  console.log(`Blanked template saved → ${preferred}`);

  // Sync root copy if writable; otherwise leave a note.
  let rootNote = '';
  try {
    await workbook.toFileAsync(rootCopy);
    console.log(`Also synced root copy → ${rootCopy}`);
    rootNote = 'Root Excel/Guesthouse_template.xlsx was synced with the blanked template. You may delete the root copy once unlocked workflows no longer reference it; canonical path is Excel/templates/guest-house/Guesthouse_template.xlsx.';
  } catch (err) {
    rootNote = `Root Excel/Guesthouse_template.xlsx could not be overwritten (${err.message}). Canonical blanked template is Excel/templates/guest-house/Guesthouse_template.xlsx — remove the root copy when unlocked.`;
    console.warn(rootNote);
  }

  fs.writeFileSync(
    notePath,
    [
      'Guest house Excel template',
      '==========================',
      '',
      'Canonical path: Excel/templates/guest-house/Guesthouse_template.xlsx',
      'Registered via GUEST_HOUSE_EXPORT_TEMPLATE_PATH in lib/excel-export-template-paths.ts',
      '',
      rootNote,
      '',
      'Sheet "Gestion": monthly occupancy calendar.',
      '- Column A: building headers (Batiment #1, Batiment #2, Kimpese) + Room # N - NAME',
      '- Columns B–AF: days of the month (guest name when occupied)',
      '- AG/AH: Total / Taux % (formulas preserved)',
      '- Kimpese (row 26+): external hotels when on-site guest house is full',
      '',
    ].join('\n'),
    'utf8',
  );
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
