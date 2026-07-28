/**
 * One-shot: import ALL month sheets from All GH passage.xlsx into data/guest-house/store.json.
 * History source only — does NOT touch Guesthouse_template.xlsx (unique export format).
 *
 * Run: node scripts/import-guest-house-history.mjs
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XlsxPopulate from 'xlsx-populate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const historyPreferred = path.join(
  root,
  'Excel',
  'templates',
  'guest-house',
  'history',
  'All GH passage.xlsx',
);
const historyBeside = path.join(root, 'Excel', 'templates', 'guest-house', 'All GH passage.xlsx');
const storePath = path.join(root, 'data', 'guest-house', 'store.json');

const DAY_START_COL = 2; // B
const DAY_END_COL = 40; // allow spill past AF when sheets have 31+ date cols
const TOTAL_LIKE = /^(total(\s|$)|taux|booking\s*plan|ppcb)/i;
const HOTEL_LIKE =
  /^(hotel|hôtel|maison|house\s*\d|legende|légende|mont\s*sinai|basile|rosette|kimpese\s*hotel|travel\s*by)/i;

function excelSerialToIso(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

function cellText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (value.result !== undefined) return String(value.result ?? '').trim();
    return '';
  }
  return String(value).trim();
}

function normName(value) {
  return cellText(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseRoomLabel(label) {
  const raw = String(label ?? '').replace(/\s+/g, ' ').trim();
  const m = raw.match(/^Room\s*#\s*(.+?)\s*-\s*(.+)$/i);
  if (!m) return null;
  return {
    templateLabel: `Room # ${m[1].trim()} - ${m[2].trim()}`,
    roomNumber: m[1].trim(),
    roomName: m[2].trim(),
  };
}

function mapBuilding(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/^batiment\s*#?\s*1$/i.test(text) || (/guesthouse/i.test(text) && !/bravo/i.test(text))) {
    return { building: 'Batiment #1', buildingKey: 'Batiment #1' };
  }
  if (/^batiment\s*#?\s*2$/i.test(text) || (/guesthouse/i.test(text) && /bravo/i.test(text))) {
    return { building: 'Batiment #2', buildingKey: 'Batiment #2' };
  }
  if (/^kimpese$/i.test(text)) {
    return { building: 'Kimpese', buildingKey: 'Kimpese' };
  }
  return null;
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

function addOneDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function mergeAdjacentSpans(spans) {
  const sorted = [...spans].sort((a, b) => {
    const rk = `${a.roomKey}|${normName(a.personName)}`;
    const rk2 = `${b.roomKey}|${normName(b.personName)}`;
    if (rk !== rk2) return rk.localeCompare(rk2);
    return a.startDate.localeCompare(b.startDate);
  });
  /** @type {typeof spans} */
  const out = [];
  for (const span of sorted) {
    const prev = out[out.length - 1];
    if (
      prev
      && prev.roomKey === span.roomKey
      && normName(prev.personName) === normName(span.personName)
      && (prev.endDate >= span.startDate || addOneDay(prev.endDate) === span.startDate)
    ) {
      if (span.endDate > prev.endDate) prev.endDate = span.endDate;
      if (span.sheetName && !prev.sheetNames.includes(span.sheetName)) {
        prev.sheetNames.push(span.sheetName);
      }
      continue;
    }
    out.push({ ...span, sheetNames: [span.sheetName] });
  }
  return out;
}

function reservationMergeKey(item) {
  return [
    item.roomId || '',
    normName(item.personName),
    item.startDate,
    item.endDate,
  ].join('|');
}

function isHotelLabel(text) {
  const t = cellText(text);
  if (!t || t.length < 3) return false;
  if (TOTAL_LIKE.test(t)) return false;
  if (/^kimpese$/i.test(t) || /^kimpese\s*hotel\s*booking$/i.test(t)) return false;
  return HOTEL_LIKE.test(t) || /hotel|hôtel|maison|house\s*\d/i.test(t);
}

function extractDates(sheet) {
  for (const row of [3, 4, 1, 2]) {
    const dates = [];
    let found = 0;
    for (let c = DAY_START_COL; c <= DAY_END_COL; c += 1) {
      const v = sheet.cell(row, c).value();
      if (typeof v === 'number' && v > 30000) {
        dates.push(excelSerialToIso(v));
        found += 1;
      } else {
        dates.push('');
      }
    }
    if (found >= 28) return { dates, dateRow: row };
  }
  return { dates: [], dateRow: 0 };
}

function extractSheetOccupancy(sheet, sheetName) {
  const used = sheet.usedRange();
  const endRow = used ? used.endCell().rowNumber() : 50;
  const { dates, dateRow } = extractDates(sheet);
  if (!dates.some(Boolean)) {
    return { rooms: [], spans: [], kimpeseSpans: [], skipped: true, reason: 'no-dates' };
  }

  /** @type {Array<{ row: number, building: string, buildingKey: string, parsed: ReturnType<typeof parseRoomLabel> }>} */
  const rooms = [];
  /** @type {Array<{ roomKey: string, personName: string, startDate: string, endDate: string, sheetName: string, category: string, hotelName?: string }>} */
  const spans = [];
  let currentBuilding = null;
  let summaryReached = false;

  for (let r = 1; r <= endRow; r += 1) {
    if (r === dateRow) continue;
    const a = cellText(sheet.cell(r, 1).value()).replace(/\s+/g, ' ').trim();
    if (!a) continue;

    const building = mapBuilding(a);
    if (building) {
      currentBuilding = building;
      summaryReached = false;
      continue;
    }

    if (/^total/i.test(a) || /^taux/i.test(a)) {
      summaryReached = true;
      continue;
    }
    // Exact "ROOM" / "Room" sub-header only — do NOT match "Room # N - NAME"
    if (/^rooms?$/i.test(a) || TOTAL_LIKE.test(a)) continue;

    const parsed = parseRoomLabel(a);
    if (parsed && currentBuilding && !summaryReached) {
      rooms.push({
        row: r,
        building: currentBuilding.building,
        buildingKey: currentBuilding.buildingKey,
        parsed,
      });
      const dayNames = [];
      for (let c = DAY_START_COL; c <= DAY_END_COL; c += 1) {
        const raw = sheet.cell(r, c).value();
        // Skip numeric totals / rates in Total/Taux columns
        if (typeof raw === 'number' && raw < 1000) {
          dayNames.push('');
          continue;
        }
        const text = cellText(raw);
        dayNames.push(text && !/^\d+(\.\d+)?%?$/.test(text) ? text.replace(/\s+/g, ' ').trim() : '');
      }
      const roomKey = `${currentBuilding.buildingKey}::${parsed.roomNumber}`;
      for (const span of spansFromDayNames(dayNames, dates)) {
        spans.push({
          ...span,
          roomKey,
          sheetName,
          category: 'standard',
        });
      }
    }
  }

  // Best-effort Kimpese overflow: hotel header row(s) then guest cells by column/date
  const kimpeseSpans = extractKimpeseOverflow(sheet, dates, endRow, sheetName);

  return { rooms, spans, kimpeseSpans, skipped: false, dateRow, monthHint: dates.find(Boolean)?.slice(0, 7) || null };
}

function extractKimpeseOverflow(sheet, dates, endRow, sheetName) {
  /** @type {Array<{ roomKey: string, personName: string, startDate: string, endDate: string, sheetName: string, category: string, hotelName: string }>} */
  const out = [];
  /** @type {Map<number, string>} */
  const hotelByCol = new Map();

  // Find first row after totals that looks like overflow
  let startRow = 26;
  for (let r = 23; r <= Math.min(endRow, 35); r += 1) {
    for (let c = 1; c <= DAY_END_COL; c += 1) {
      const t = cellText(sheet.cell(r, c).value());
      if (/kimpese\s*hotel|hotel\s*booking|hotel\s+kimpese|hôtel/i.test(t)) {
        startRow = r;
        break;
      }
    }
  }

  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = DAY_START_COL; c <= DAY_END_COL; c += 1) {
      const date = dates[c - DAY_START_COL];
      if (!date) continue;
      const text = cellText(sheet.cell(r, c).value()).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (typeof sheet.cell(r, c).value() === 'number') continue;
      if (/booking|total|taux|^kimpese$/i.test(text)) continue;

      if (isHotelLabel(text)) {
        hotelByCol.set(c, text);
        continue;
      }

      // Guest under a known hotel column
      const hotel = hotelByCol.get(c);
      if (!hotel) continue;
      // Skip if text itself looks like another hotel replacing header
      if (isHotelLabel(text)) {
        hotelByCol.set(c, text);
        continue;
      }

      out.push({
        roomKey: `Kimpese::${normName(hotel)}`,
        personName: text,
        startDate: date,
        endDate: date,
        sheetName,
        category: 'kimpese',
        hotelName: hotel,
      });
    }
  }

  return mergeAdjacentSpans(out);
}

function loadStore() {
  if (!fs.existsSync(storePath)) {
    return {
      meta: { version: 2, buildings: ['Batiment #1', 'Batiment #2', 'Kimpese'] },
      rooms: [],
      reservations: [],
      passages: [],
      nextReservationSeq: 1,
    };
  }
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

async function main() {
  const historyPath = fs.existsSync(historyPreferred) ? historyPreferred : historyBeside;
  if (!fs.existsSync(historyPath)) {
    throw new Error(`History workbook not found: ${historyPreferred}`);
  }

  const workbook = await XlsxPopulate.fromFileAsync(historyPath);
  const store = loadStore();
  const now = new Date().toISOString();

  /** @type {Map<string, any>} */
  const roomsByKey = new Map();
  for (const room of store.rooms || []) {
    if (room.category === 'kimpese') {
      roomsByKey.set(`Kimpese::${normName(room.hotelName || room.roomName)}`, room);
    } else {
      roomsByKey.set(`${room.buildingKey || room.building}::${room.roomNumber}`, room);
    }
  }

  const importedSheets = [];
  /** @type {any[]} */
  const allSpans = [];
  let sheetsSkipped = 0;

  for (const sheet of workbook.sheets()) {
    const sheetName = sheet.name();
    if (/^sheet\d*$/i.test(sheetName.trim())) {
      sheetsSkipped += 1;
      continue;
    }
    const extracted = extractSheetOccupancy(sheet, sheetName);
    if (extracted.skipped) {
      sheetsSkipped += 1;
      console.warn(`Skip ${JSON.stringify(sheetName)}: ${extracted.reason}`);
      continue;
    }

    importedSheets.push({
      sheetName,
      monthHint: extracted.monthHint,
      rooms: extracted.rooms.length,
      spans: extracted.spans.length,
      kimpese: extracted.kimpeseSpans.length,
    });

    for (const item of extracted.rooms) {
      const key = `${item.buildingKey}::${item.parsed.roomNumber}`;
      if (roomsByKey.has(key)) continue;
      const isVip = /vip/i.test(item.parsed.roomNumber);
      const room = {
        id: randomUUID(),
        roomNumber: item.parsed.roomNumber,
        roomName: item.parsed.roomName,
        templateLabel: item.parsed.templateLabel,
        building: item.building,
        buildingKey: item.buildingKey,
        category: 'standard',
        hotelName: '',
        characteristics: isVip ? 'VIP' : '',
        capacity: 1,
        floor: '',
        amenities: [],
        notes: '',
        sortOrder: roomsByKey.size + 1,
        status: 'available',
        createdAt: now,
        updatedAt: now,
      };
      roomsByKey.set(key, room);
    }

    for (const span of extracted.spans) allSpans.push(span);
    for (const span of extracted.kimpeseSpans) {
      const key = span.roomKey;
      if (!roomsByKey.has(key)) {
        const hotelName = span.hotelName;
        const kCount = [...roomsByKey.values()].filter((r) => r.category === 'kimpese').length;
        roomsByKey.set(key, {
          id: randomUUID(),
          roomNumber: `K${kCount + 1}`,
          roomName: hotelName,
          templateLabel: `Kimpese — ${hotelName}`,
          building: 'Kimpese',
          buildingKey: 'Kimpese',
          category: 'kimpese',
          hotelName,
          characteristics: 'overflow',
          capacity: 1,
          floor: '',
          amenities: [],
          notes: 'Importé depuis historique overflow',
          sortOrder: 900 + kCount,
          status: 'available',
          createdAt: now,
          updatedAt: now,
        });
      }
      allSpans.push(span);
    }
  }

  const mergedSpans = mergeAdjacentSpans(allSpans);

  // Drop prior template-seed / history-import rows so re-runs are idempotent for those sources
  const keepReservations = (store.reservations || []).filter(
    (item) => item.source !== 'template-seed' && item.source !== 'history-import',
  );
  const keepPassages = (store.passages || []).filter((p) => {
    const res = (store.reservations || []).find((r) => r.id === p.reservationId);
    return res && res.source !== 'template-seed' && res.source !== 'history-import';
  });

  const existingKeys = new Set(keepReservations.map(reservationMergeKey));
  let seq = Number(store.nextReservationSeq) > 0 ? Number(store.nextReservationSeq) : 1;
  const newReservations = [];
  const newPassages = [];

  for (const span of mergedSpans) {
    const room = roomsByKey.get(span.roomKey);
    if (!room) continue;
    const draft = {
      roomId: room.id,
      personName: span.personName,
      startDate: span.startDate,
      endDate: span.endDate,
    };
    const key = reservationMergeKey(draft);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    const year = Number(span.startDate.slice(0, 4)) || new Date().getFullYear();
    const id = randomUUID();
    const numero = `GH-${year}-${String(seq).padStart(4, '0')}`;
    seq += 1;
    const sourceMonth = span.startDate.slice(0, 7);
    const sheetNames = span.sheetNames || [span.sheetName];
    const today = now.slice(0, 10);
    const status = span.endDate >= today ? 'confirmed' : 'completed';
    const reservation = {
      id,
      numero,
      createdAt: `${span.startDate}T08:00:00.000Z`,
      personName: span.personName,
      isAgent: false,
      motif: span.category === 'kimpese'
        ? 'Séjour overflow Kimpese (import historique)'
        : 'Séjour (import historique)',
      startDate: span.startDate,
      endDate: span.endDate,
      roomId: room.id,
      status,
      notes: `Importé depuis All GH passage.xlsx`,
      company: '',
      mission: '',
      phone: '',
      email: '',
      nationality: '',
      idDoc: '',
      billing: '',
      source: 'history-import',
      sourceMonth,
      sheetName: sheetNames.join(' | '),
      updatedAt: now,
    };
    newReservations.push(reservation);
    newPassages.push({
      id: randomUUID(),
      roomId: room.id,
      reservationId: id,
      numero,
      personName: span.personName,
      motif: reservation.motif,
      startDate: span.startDate,
      endDate: span.endDate,
      checkedInAt: `${span.startDate}T08:00:00.000Z`,
      checkedOutAt: status === 'completed' ? `${span.endDate}T12:00:00.000Z` : undefined,
    });
  }

  const rooms = [...roomsByKey.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category === 'kimpese' ? 1 : -1;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });

  const months = [...new Set(importedSheets.map((s) => s.monthHint).filter(Boolean))].sort();
  const nextStore = {
    meta: {
      ...(store.meta || {}),
      version: 3,
      seededFrom: store.meta?.seededFrom,
      seededAt: store.meta?.seededAt,
      historyImportedFrom: path.relative(root, historyPath).replace(/\\/g, '/'),
      historyImportedAt: now,
      historySheetsImported: importedSheets.length,
      historyMonths: months,
      templateSheet: 'Gestion',
      buildings: ['Batiment #1', 'Batiment #2', 'Kimpese'],
      notes: [
        'Rooms from Guesthouse_template.xlsx column A (Batiment #1/#2) + Kimpese hotels discovered from history overflow.',
        'Kimpese = external hotel overflow; hotelName is free text.',
        'History imported from Excel/templates/guest-house/history/All GH passage.xlsx (import-only).',
        'Export template remains Excel/templates/guest-house/Guesthouse_template.xlsx (unique single-sheet format).',
        `Imported ${importedSheets.length} planning sheets / months ${months[0] || '?'} → ${months[months.length - 1] || '?'}.`,
      ],
    },
    rooms,
    reservations: [...newReservations, ...keepReservations],
    passages: [...newPassages, ...keepPassages],
    nextReservationSeq: seq,
  };

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(nextStore, null, 2), 'utf8');

  const byYear = {};
  for (const r of nextStore.reservations) {
    const y = r.startDate.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  }

  console.log(JSON.stringify({
    historyPath: path.relative(root, historyPath).replace(/\\/g, '/'),
    sheetsImported: importedSheets.length,
    sheetsSkipped,
    months: months.length,
    monthRange: months.length ? `${months[0]} → ${months[months.length - 1]}` : null,
    rooms: nextStore.rooms.length,
    roomsKimpese: nextStore.rooms.filter((r) => r.category === 'kimpese').length,
    reservations: nextStore.reservations.length,
    reservationsImported: newReservations.length,
    passages: nextStore.passages.length,
    byYear,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
