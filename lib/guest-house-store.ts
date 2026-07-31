import 'server-only';

import { randomUUID } from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_GUEST_HOUSE_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import type {
  GuestHouseDashboard,
  GuestHouseMeta,
  GuestHouseMonthlyPoint,
  GuestHouseStoreData,
  GuestReservation,
  GuestReservationInput,
  GuestReservationStatus,
  GuestRoom,
  GuestRoomCategory,
  GuestRoomInput,
  GuestRoomPassage,
} from './guest-house-types';
import {
  buildTemplateLabel,
  KIMPESE_BUILDING,
  roomDisplayName,
} from './guest-house-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function resolveStorePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'guest-house', 'store.json');
  }
  const writable = path.join(getWritableDataRoot(), 'guest-house', 'store.json');
  const bundled = path.join(process.cwd(), 'data', 'guest-house', 'store.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

function emptyStore(): GuestHouseStoreData {
  return {
    meta: {
      version: 2,
      buildings: ['Batiment #1', 'Batiment #2', 'Kimpese'],
    },
    rooms: [],
    reservations: [],
    passages: [],
    nextReservationSeq: 1,
  };
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (!a || !b || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function isActiveOn(reservation: GuestReservation, day: string): boolean {
  return (
    reservation.status === 'confirmed'
    && Boolean(reservation.roomId)
    && reservation.startDate <= day
    && reservation.endDate >= day
  );
}

function isOnsiteRoom(room: GuestRoom): boolean {
  return room.category !== 'kimpese' && room.building !== KIMPESE_BUILDING;
}

function normalizeCategory(value: unknown, building: string): GuestRoomCategory {
  if (value === 'kimpese' || building === KIMPESE_BUILDING || /^kimpese$/i.test(building)) {
    return 'kimpese';
  }
  return 'standard';
}

function normalizeRoom(raw: Partial<GuestRoom> & { id?: string }, index: number): GuestRoom | null {
  const id = str(raw.id) || randomUUID();
  const building = str(raw.building) || 'Batiment #1';
  const category = normalizeCategory(raw.category, building);
  const hotelName = str(raw.hotelName);
  const roomNumber = str(raw.roomNumber) || (category === 'kimpese' ? `K${index + 1}` : '');
  const roomName = str(raw.roomName) || (category === 'kimpese' ? hotelName : '');
  if (category === 'kimpese') {
    if (!hotelName && !roomName) return null;
  } else if (!roomNumber && !roomName && !str(raw.templateLabel)) {
    return null;
  }

  const now = new Date().toISOString();
  const room: GuestRoom = {
    id,
    roomNumber,
    roomName: category === 'kimpese' ? (hotelName || roomName) : roomName,
    templateLabel: str(raw.templateLabel),
    templateRow: typeof raw.templateRow === 'number' ? raw.templateRow : undefined,
    building: category === 'kimpese' ? KIMPESE_BUILDING : building,
    buildingKey: category === 'kimpese' ? KIMPESE_BUILDING : (str(raw.buildingKey) || building),
    category,
    hotelName: category === 'kimpese' ? (hotelName || roomName) : '',
    characteristics: str(raw.characteristics),
    capacity: Number(raw.capacity) > 0 ? Number(raw.capacity) : 1,
    floor: str(raw.floor),
    amenities: Array.isArray(raw.amenities)
      ? raw.amenities.map((item) => str(item)).filter(Boolean)
      : [],
    notes: str(raw.notes),
    sortOrder: Number(raw.sortOrder) > 0 ? Number(raw.sortOrder) : index + 1,
    status: raw.status === 'maintenance' || raw.status === 'inactive' ? raw.status : 'available',
    createdAt: str(raw.createdAt) || now,
    updatedAt: str(raw.updatedAt) || now,
  };
  room.templateLabel = buildTemplateLabel(room);
  return room;
}

function normalizeReservation(raw: Partial<GuestReservation>): GuestReservation | null {
  const id = str(raw.id);
  const personName = str(raw.personName);
  const startDate = str(raw.startDate);
  const endDate = str(raw.endDate);
  if (!id || !personName || !startDate || !endDate) return null;
  const status = (['pending', 'confirmed', 'rejected', 'cancelled', 'completed'] as GuestReservationStatus[])
    .includes(raw.status as GuestReservationStatus)
    ? (raw.status as GuestReservationStatus)
    : 'pending';
  return {
    id,
    numero: str(raw.numero) || id.slice(0, 8),
    createdAt: str(raw.createdAt) || new Date().toISOString(),
    personName,
    matricule: str(raw.matricule) || undefined,
    isAgent: Boolean(raw.isAgent || str(raw.matricule)),
    motif: str(raw.motif) || '—',
    startDate,
    endDate,
    roomId: str(raw.roomId) || undefined,
    status,
    notes: str(raw.notes) || undefined,
    company: str(raw.company) || undefined,
    mission: str(raw.mission) || undefined,
    phone: str(raw.phone) || undefined,
    email: str(raw.email) || undefined,
    nationality: str(raw.nationality) || undefined,
    idDoc: str(raw.idDoc) || undefined,
    billing: str(raw.billing) || undefined,
    source: str(raw.source) || undefined,
    sourceMonth: str(raw.sourceMonth) || undefined,
    sheetName: str(raw.sheetName) || undefined,
    updatedAt: str(raw.updatedAt) || str(raw.createdAt) || new Date().toISOString(),
  };
}

function ensurePassages(data: GuestHouseStoreData): GuestHouseStoreData {
  const passages = [...data.passages];
  let changed = false;
  for (const item of data.reservations) {
    if (item.status !== 'confirmed' && item.status !== 'completed') continue;
    if (!item.roomId) continue;
    if (passages.some((p) => p.reservationId === item.id)) continue;
    passages.unshift({
      id: randomUUID(),
      roomId: item.roomId,
      reservationId: item.id,
      numero: item.numero,
      personName: item.personName,
      matricule: item.matricule,
      motif: item.motif,
      startDate: item.startDate,
      endDate: item.endDate,
      checkedInAt: item.updatedAt || item.createdAt,
      checkedOutAt: item.status === 'completed' ? item.updatedAt : undefined,
    });
    changed = true;
  }
  return changed ? { ...data, passages } : data;
}

function normalizeStore(parsed: Partial<GuestHouseStoreData>): GuestHouseStoreData {
  const rooms = (Array.isArray(parsed.rooms) ? parsed.rooms : [])
    .map((room, index) => normalizeRoom(room as Partial<GuestRoom>, index))
    .filter((room): room is GuestRoom => Boolean(room));
  const reservations = (Array.isArray(parsed.reservations) ? parsed.reservations : [])
    .map((item) => normalizeReservation(item as Partial<GuestReservation>))
    .filter((item): item is GuestReservation => Boolean(item));
  const passages = Array.isArray(parsed.passages) ? parsed.passages : [];
  const meta: GuestHouseMeta = {
    version: Number(parsed.meta?.version) || 2,
    seededFrom: parsed.meta?.seededFrom,
    seededAt: parsed.meta?.seededAt,
    historyImportedFrom: parsed.meta?.historyImportedFrom,
    historyImportedAt: parsed.meta?.historyImportedAt,
    historySheetsImported: parsed.meta?.historySheetsImported,
    historyMonths: parsed.meta?.historyMonths,
    templateSheet: parsed.meta?.templateSheet || 'Gestion',
    templateMonthHint: parsed.meta?.templateMonthHint ?? null,
    buildings: parsed.meta?.buildings?.length
      ? parsed.meta.buildings
      : ['Batiment #1', 'Batiment #2', 'Kimpese'],
    notes: parsed.meta?.notes,
  };
  return {
    meta,
    rooms,
    reservations,
    passages,
    nextReservationSeq: Number(parsed.nextReservationSeq) > 0
      ? Number(parsed.nextReservationSeq)
      : 1,
  };
}

async function readStore(): Promise<GuestHouseStoreData> {
  const storePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_GUEST_HOUSE_KEY, storePath);
  try {
    const raw = await fsPromises.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GuestHouseStoreData>;
    const data = normalizeStore(parsed);
    const ensured = ensurePassages(data);
    if (ensured.passages.length !== data.passages.length) {
      await writeStore(ensured);
    }
    return ensured;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyStore();
    throw err;
  }
}

async function writeStore(data: GuestHouseStoreData): Promise<void> {
  const storePath = resolveStorePath();
  await fsPromises.mkdir(path.dirname(storePath), { recursive: true });
  await fsPromises.writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_GUEST_HOUSE_KEY, storePath);
}

function nextNumero(seq: number): string {
  const year = new Date().getFullYear();
  return `GH-${year}-${String(seq).padStart(4, '0')}`;
}

function nightsInMonth(startDate: string, endDate: string, year: number, month: number): number {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  if (endDate < monthStart || startDate > monthEnd) return 0;
  const from = startDate > monthStart ? startDate : monthStart;
  const to = endDate < monthEnd ? endDate : monthEnd;
  return daysBetweenInclusive(from, to);
}

function buildYearMonthly(data: GuestHouseStoreData, year: number): GuestHouseMonthlyPoint[] {
  const roomsById = new Map(data.rooms.map((room) => [room.id, room]));
  const onsiteRoomCount = data.rooms.filter(isOnsiteRoom).length;
  const points: GuestHouseMonthlyPoint[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthReservations = data.reservations.filter((item) => {
      const sourceMonth = str(item.sourceMonth);
      if (sourceMonth) return sourceMonth === key;
      return item.createdAt.startsWith(key) || item.startDate.startsWith(key);
    });
    const reservations = monthReservations.length;
    const approved = monthReservations.filter(
      (item) => item.status === 'confirmed' || item.status === 'completed',
    ).length;
    let nights = 0;
    let kimpese = 0;
    for (const item of data.reservations) {
      if (item.status !== 'confirmed' && item.status !== 'completed') continue;
      const n = nightsInMonth(item.startDate, item.endDate, year, month);
      if (n <= 0) continue;
      const room = item.roomId ? roomsById.get(item.roomId) : undefined;
      if (room && !isOnsiteRoom(room)) {
        kimpese += 1;
        continue;
      }
      // On-site room-nights only (unassigned treated as on-site capacity usage).
      if (!room || isOnsiteRoom(room)) nights += n;
    }
    const capacityNights = onsiteRoomCount * daysInMonth;
    const occupancyRate = capacityNights > 0
      ? Math.round((nights / capacityNights) * 1000) / 10
      : 0;
    points.push({
      key,
      month,
      label: MONTH_LABELS[month - 1],
      reservations,
      approved,
      nights,
      daysInMonth,
      capacityNights,
      occupancyRate,
      kimpese,
    });
  }
  return points;
}

export async function getGuestHouseBundle(): Promise<GuestHouseStoreData & { dashboard: GuestHouseDashboard }> {
  const data = await readStore();
  return { ...data, dashboard: buildDashboard(data) };
}

export async function getGuestRoom(id: string): Promise<GuestRoom | null> {
  const data = await readStore();
  return data.rooms.find((room) => room.id === id) ?? null;
}

export async function getGuestReservation(id: string): Promise<GuestReservation | null> {
  const data = await readStore();
  return data.reservations.find((item) => item.id === id) ?? null;
}

export function buildDashboard(data: GuestHouseStoreData): GuestHouseDashboard {
  const today = todayIso();
  const roomsById = new Map(data.rooms.map((room) => [room.id, room]));
  const onsiteRoomsList = data.rooms.filter(isOnsiteRoom);
  const kimpeseRooms = data.rooms.filter((room) => !isOnsiteRoom(room));

  const occupiedReservations = data.reservations.filter((item) => isActiveOn(item, today));
  const occupiedRoomIds = new Set(occupiedReservations.map((item) => item.roomId!).filter(Boolean));

  const occupiedOnsite = onsiteRoomsList.filter((room) => occupiedRoomIds.has(room.id)).length;
  const emptyOnsite = onsiteRoomsList.filter(
    (room) => room.status === 'available' && !occupiedRoomIds.has(room.id),
  );
  const reservedOnsite = onsiteRoomsList.filter((room) => {
    if (occupiedRoomIds.has(room.id)) return false;
    return data.reservations.some(
      (item) =>
        item.roomId === room.id
        && (item.status === 'confirmed' || item.status === 'pending')
        && item.startDate > today,
    );
  });

  const kimpeseOccupied = kimpeseRooms.filter((room) => occupiedRoomIds.has(room.id)).length;
  const onsiteRooms = onsiteRoomsList.length;
  const occupancyRate = onsiteRooms > 0
    ? Math.round((occupiedOnsite / onsiteRooms) * 1000) / 10
    : 0;

  const endingSoon = data.reservations
    .filter((item) => item.status === 'confirmed' && item.endDate >= today)
    .map((item) => {
      const end = parseIsoDate(item.endDate);
      const now = parseIsoDate(today)!;
      const daysLeft = end ? Math.floor((end.getTime() - now.getTime()) / 86_400_000) : 999;
      const room = item.roomId ? roomsById.get(item.roomId) : undefined;
      return { item, daysLeft, room };
    })
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ item, daysLeft, room }) => ({
      id: item.id,
      numero: item.numero,
      personName: item.personName,
      endDate: item.endDate,
      daysLeft,
      roomNumber: room ? roomDisplayName(room) : '—',
      building: room?.building ?? '—',
      isKimpese: room ? !isOnsiteRoom(room) : false,
    }));

  const yearSet = new Set<number>([new Date().getFullYear()]);
  for (const item of data.reservations) {
    const y = Number(item.createdAt.slice(0, 4));
    if (Number.isFinite(y)) yearSet.add(y);
    const ys = Number(item.startDate.slice(0, 4));
    if (Number.isFinite(ys)) yearSet.add(ys);
  }
  const years = [...yearSet].sort((a, b) => b - a);
  const monthlyByYear: Record<number, GuestHouseMonthlyPoint[]> = {};
  for (const year of years) {
    monthlyByYear[year] = buildYearMonthly(data, year);
  }

  return {
    totalRooms: data.rooms.length,
    onsiteRooms,
    occupied: occupiedOnsite,
    empty: emptyOnsite.length,
    reserved: reservedOnsite.length,
    pendingReservations: data.reservations.filter((item) => item.status === 'pending').length,
    kimpeseHotels: kimpeseRooms.length,
    kimpeseOccupied,
    occupancyRate,
    endingSoon,
    years,
    monthlyByYear,
    occupiedReservations,
    emptyRooms: emptyOnsite,
    reservedRooms: reservedOnsite,
  };
}

export async function upsertGuestRoom(input: GuestRoomInput & { id?: string }): Promise<GuestRoom> {
  const category = normalizeCategory(input.category, str(input.building));
  const hotelName = str(input.hotelName);
  const building = category === 'kimpese' ? KIMPESE_BUILDING : (str(input.building) || 'Batiment #1');
  const roomNumber = str(input.roomNumber);
  const roomName = category === 'kimpese'
    ? (hotelName || str(input.roomName))
    : str(input.roomName);

  if (category === 'kimpese') {
    if (!hotelName && !roomName) throw new Error('Nom de l’hôtel requis pour Kimpese');
  } else {
    if (!roomNumber) throw new Error('N° chambre requis');
    if (!building) throw new Error('Bâtiment / lieu requis');
  }

  const data = await readStore();
  const now = new Date().toISOString();
  const displayHotel = hotelName || roomName;

  const duplicate = data.rooms.find((room) => {
    if (room.id === input.id) return false;
    if (category === 'kimpese') {
      return room.category === 'kimpese'
        && room.hotelName.toLowerCase() === displayHotel.toLowerCase();
    }
    return (
      room.category !== 'kimpese'
      && room.roomNumber.toLowerCase() === roomNumber.toLowerCase()
      && room.building.toLowerCase() === building.toLowerCase()
    );
  });
  if (duplicate) {
    throw new Error(
      category === 'kimpese'
        ? 'Cet hôtel Kimpese existe déjà'
        : 'Cette chambre existe déjà dans ce bâtiment',
    );
  }

  if (input.id) {
    const index = data.rooms.findIndex((room) => room.id === input.id);
    if (index < 0) throw new Error('Chambre introuvable');
    const prev = data.rooms[index];
    const updated: GuestRoom = {
      ...prev,
      roomNumber: category === 'kimpese'
        ? (roomNumber || prev.roomNumber || `K${index + 1}`)
        : roomNumber,
      roomName: category === 'kimpese' ? displayHotel : roomName,
      building,
      buildingKey: building,
      category,
      hotelName: category === 'kimpese' ? displayHotel : '',
      characteristics: str(input.characteristics),
      capacity: Number(input.capacity) > 0 ? Number(input.capacity) : prev.capacity || 1,
      floor: str(input.floor),
      amenities: Array.isArray(input.amenities)
        ? input.amenities.map((item) => str(item)).filter(Boolean)
        : prev.amenities,
      notes: str(input.notes),
      status: input.status === 'maintenance' || input.status === 'inactive'
        ? input.status
        : (prev.status || 'available'),
      updatedAt: now,
      templateLabel: '',
    };
    updated.templateLabel = buildTemplateLabel(updated);
    data.rooms[index] = updated;
    await writeStore(data);
    return updated;
  }

  const created: GuestRoom = {
    id: randomUUID(),
    roomNumber: category === 'kimpese'
      ? (roomNumber || `K${data.rooms.filter((r) => r.category === 'kimpese').length + 1}`)
      : roomNumber,
    roomName: category === 'kimpese' ? displayHotel : roomName,
    templateLabel: '',
    building,
    buildingKey: building,
    category,
    hotelName: category === 'kimpese' ? displayHotel : '',
    characteristics: str(input.characteristics),
    capacity: Number(input.capacity) > 0 ? Number(input.capacity) : 1,
    floor: str(input.floor),
    amenities: Array.isArray(input.amenities)
      ? input.amenities.map((item) => str(item)).filter(Boolean)
      : [],
    notes: str(input.notes),
    sortOrder: data.rooms.length + 1,
    status: input.status === 'maintenance' || input.status === 'inactive'
      ? input.status
      : 'available',
    createdAt: now,
    updatedAt: now,
  };
  created.templateLabel = buildTemplateLabel(created);
  data.rooms.push(created);
  await writeStore(data);
  return created;
}

export async function deleteGuestRoom(id: string): Promise<boolean> {
  const data = await readStore();
  const index = data.rooms.findIndex((room) => room.id === id);
  if (index < 0) return false;
  const active = data.reservations.some(
    (item) => item.roomId === id && (item.status === 'pending' || item.status === 'confirmed'),
  );
  if (active) throw new Error('Impossible de supprimer une chambre liée à une réservation active');
  data.rooms.splice(index, 1);
  await writeStore(data);
  return true;
}

export async function createGuestReservation(input: GuestReservationInput): Promise<GuestReservation> {
  const personName = str(input.personName);
  const motif = str(input.motif);
  const startDate = str(input.startDate);
  const endDate = str(input.endDate);
  if (!personName) throw new Error('Personne requise');
  if (!motif) throw new Error('Motif requis');
  if (!parseIsoDate(startDate) || !parseIsoDate(endDate)) throw new Error('Dates invalides');
  if (endDate < startDate) throw new Error('La date de fin doit être après la date de début');

  const data = await readStore();
  const now = new Date().toISOString();
  const reservation: GuestReservation = {
    id: randomUUID(),
    numero: nextNumero(data.nextReservationSeq),
    createdAt: now,
    personName,
    matricule: str(input.matricule) || undefined,
    isAgent: Boolean(input.isAgent || str(input.matricule)),
    motif,
    startDate,
    endDate,
    roomId: str(input.roomId) || undefined,
    status: 'pending',
    notes: str(input.notes) || undefined,
    company: str(input.company) || undefined,
    mission: str(input.mission) || undefined,
    phone: str(input.phone) || undefined,
    email: str(input.email) || undefined,
    nationality: str(input.nationality) || undefined,
    idDoc: str(input.idDoc) || undefined,
    billing: str(input.billing) || undefined,
    updatedAt: now,
  };
  data.nextReservationSeq += 1;
  data.reservations.unshift(reservation);
  await writeStore(data);
  return reservation;
}

/** Met à jour les informations d'une réservation (personne, motif, dates, contacts…). */
export async function updateGuestReservation(
  id: string,
  input: GuestReservationInput,
): Promise<GuestReservation> {
  const personName = str(input.personName);
  const motif = str(input.motif);
  const startDate = str(input.startDate);
  const endDate = str(input.endDate);
  if (!personName) throw new Error('Personne requise');
  if (!motif) throw new Error('Motif requis');
  if (!parseIsoDate(startDate) || !parseIsoDate(endDate)) throw new Error('Dates invalides');
  if (endDate < startDate) throw new Error('La date de fin doit être après la date de début');

  const data = await readStore();
  const index = data.reservations.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Réservation introuvable');
  const current = data.reservations[index];

  // Réservation confirmée avec chambre : vérifier les conflits sur la nouvelle période.
  if (current.status === 'confirmed' && current.roomId) {
    const conflict = data.reservations.some(
      (item) =>
        item.id !== id
        && item.status === 'confirmed'
        && item.roomId === current.roomId
        && datesOverlap(item.startDate, item.endDate, startDate, endDate),
    );
    if (conflict) throw new Error('Cette chambre / cet hôtel est déjà réservé(e) sur cette période');
  }

  const now = new Date().toISOString();
  const updated: GuestReservation = {
    ...current,
    personName,
    matricule: str(input.matricule) || undefined,
    isAgent: Boolean(input.isAgent || str(input.matricule)),
    motif,
    startDate,
    endDate,
    notes: str(input.notes) || undefined,
    company: str(input.company) || undefined,
    mission: str(input.mission) || undefined,
    phone: str(input.phone) || undefined,
    email: str(input.email) || undefined,
    updatedAt: now,
  };
  data.reservations[index] = updated;

  // Synchronise le passage lié (identité / dates).
  const passage = data.passages.find((p) => p.reservationId === id);
  if (passage) {
    passage.personName = updated.personName;
    passage.matricule = updated.matricule;
    passage.motif = updated.motif;
    passage.startDate = updated.startDate;
    passage.endDate = updated.endDate;
  }

  await writeStore(data);
  return updated;
}

export async function updateGuestReservationStatus(
  id: string,
  status: GuestReservationStatus,
  roomId?: string,
): Promise<GuestReservation> {
  const data = await readStore();
  const index = data.reservations.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Réservation introuvable');
  const current = data.reservations[index];

  let nextRoomId = roomId !== undefined ? str(roomId) || undefined : current.roomId;
  if (status === 'confirmed') {
    if (!nextRoomId) throw new Error('Attribuez une chambre (ou un hôtel Kimpese) pour confirmer');
    const roomExists = data.rooms.some((room) => room.id === nextRoomId);
    if (!roomExists) throw new Error('Chambre / hôtel introuvable');
    const conflict = data.reservations.some(
      (item) =>
        item.id !== id
        && item.status === 'confirmed'
        && item.roomId === nextRoomId
        && datesOverlap(item.startDate, item.endDate, current.startDate, current.endDate),
    );
    if (conflict) throw new Error('Cette chambre / cet hôtel est déjà réservé(e) sur cette période');
  }

  const now = new Date().toISOString();
  const updated: GuestReservation = {
    ...current,
    status,
    roomId: nextRoomId,
    updatedAt: now,
  };
  data.reservations[index] = updated;

  if (status === 'confirmed' && nextRoomId) {
    const existingPassage = data.passages.find((p) => p.reservationId === id);
    if (!existingPassage) {
      const passage: GuestRoomPassage = {
        id: randomUUID(),
        roomId: nextRoomId,
        reservationId: id,
        numero: updated.numero,
        personName: updated.personName,
        matricule: updated.matricule,
        motif: updated.motif,
        startDate: updated.startDate,
        endDate: updated.endDate,
        checkedInAt: now,
      };
      data.passages.unshift(passage);
    } else {
      existingPassage.roomId = nextRoomId;
      existingPassage.startDate = updated.startDate;
      existingPassage.endDate = updated.endDate;
    }
  }

  if (status === 'completed' || status === 'cancelled' || status === 'rejected') {
    const passage = data.passages.find((p) => p.reservationId === id && !p.checkedOutAt);
    if (passage) passage.checkedOutAt = now;
  }

  await writeStore(data);
  return updated;
}

export async function deleteGuestReservation(id: string): Promise<boolean> {
  const data = await readStore();
  const index = data.reservations.findIndex((item) => item.id === id);
  if (index < 0) return false;
  data.reservations.splice(index, 1);
  await writeStore(data);
  return true;
}

/** Restore / upsert a room snapshot (audit undo). */
export async function restoreGuestRoom(room: GuestRoom): Promise<GuestRoom> {
  const data = await readStore();
  const restored: GuestRoom = {
    ...room,
    id: str(room.id),
    updatedAt: new Date().toISOString(),
  };
  if (!restored.id) throw new Error('ID chambre manquant');
  const index = data.rooms.findIndex((item) => item.id === restored.id);
  if (index >= 0) data.rooms[index] = { ...data.rooms[index], ...restored };
  else data.rooms.push(restored);
  await writeStore(data);
  return restored;
}

/** Restore / upsert a reservation snapshot (audit undo). */
export async function restoreGuestReservation(reservation: GuestReservation): Promise<GuestReservation> {
  const data = await readStore();
  const restored: GuestReservation = {
    ...reservation,
    id: str(reservation.id),
    updatedAt: new Date().toISOString(),
  };
  if (!restored.id) throw new Error('ID réservation manquant');
  const index = data.reservations.findIndex((item) => item.id === restored.id);
  if (index >= 0) data.reservations[index] = { ...data.reservations[index], ...restored };
  else data.reservations.unshift(restored);
  await writeStore(data);
  return restored;
}

export function remainingDays(endDate: string, from = todayIso()): number {
  const end = parseIsoDate(endDate);
  const start = parseIsoDate(from);
  if (!end || !start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export function reservationNightCount(startDate: string, endDate: string): number {
  return Math.max(0, daysBetweenInclusive(startDate, endDate) - 1) || daysBetweenInclusive(startDate, endDate);
}

export { isOnsiteRoom, roomDisplayName };
