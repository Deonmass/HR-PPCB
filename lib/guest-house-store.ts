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
  GuestHouseMonthlyPoint,
  GuestHouseStoreData,
  GuestReservation,
  GuestReservationInput,
  GuestReservationStatus,
  GuestRoom,
  GuestRoomInput,
  GuestRoomPassage,
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
  return { rooms: [], reservations: [], passages: [], nextReservationSeq: 1 };
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

async function readStore(): Promise<GuestHouseStoreData> {
  const storePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_GUEST_HOUSE_KEY, storePath);
  try {
    const raw = await fsPromises.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as GuestHouseStoreData;
    const data: GuestHouseStoreData = {
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
      passages: Array.isArray(parsed.passages) ? parsed.passages : [],
      nextReservationSeq: Number(parsed.nextReservationSeq) > 0
        ? Number(parsed.nextReservationSeq)
        : 1,
    };
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

function buildYearMonthly(data: GuestHouseStoreData, year: number): GuestHouseMonthlyPoint[] {
  const points: GuestHouseMonthlyPoint[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const monthReservations = data.reservations.filter((item) => item.createdAt.startsWith(key));
    const reservations = monthReservations.length;
    const approved = monthReservations.filter(
      (item) => item.status === 'confirmed' || item.status === 'completed',
    ).length;
    points.push({
      key,
      month,
      label: MONTH_LABELS[month - 1],
      reservations,
      approved,
    });
  }
  return points;
}

export async function getGuestHouseBundle(): Promise<GuestHouseStoreData & { dashboard: GuestHouseDashboard }> {
  const data = await readStore();
  return { ...data, dashboard: buildDashboard(data) };
}

export function buildDashboard(data: GuestHouseStoreData): GuestHouseDashboard {
  const today = todayIso();
  const roomsById = new Map(data.rooms.map((room) => [room.id, room]));
  const occupiedReservations = data.reservations.filter((item) => isActiveOn(item, today));
  const occupiedRoomIds = new Set(occupiedReservations.map((item) => item.roomId!).filter(Boolean));
  const occupied = occupiedRoomIds.size;
  const totalRooms = data.rooms.length;
  const empty = Math.max(0, totalRooms - occupied);
  const emptyRooms = data.rooms.filter((room) => !occupiedRoomIds.has(room.id));

  const endingSoon = data.reservations
    .filter((item) => item.status === 'confirmed' && item.endDate >= today)
    .map((item) => {
      const end = parseIsoDate(item.endDate);
      const now = parseIsoDate(today)!;
      const daysLeft = end ? Math.floor((end.getTime() - now.getTime()) / 86_400_000) : 999;
      return { item, daysLeft };
    })
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ item, daysLeft }) => ({
      id: item.id,
      numero: item.numero,
      personName: item.personName,
      endDate: item.endDate,
      daysLeft,
      roomNumber: item.roomId ? roomsById.get(item.roomId)?.roomNumber ?? '—' : '—',
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
    totalRooms,
    occupied,
    empty,
    pendingReservations: data.reservations.filter((item) => item.status === 'pending').length,
    endingSoon,
    years,
    monthlyByYear,
    occupiedReservations,
    emptyRooms,
  };
}

export async function upsertGuestRoom(input: GuestRoomInput & { id?: string }): Promise<GuestRoom> {
  const roomNumber = str(input.roomNumber);
  const building = str(input.building);
  const characteristics = str(input.characteristics);
  if (!roomNumber) throw new Error('N° chambre requis');
  if (!building) throw new Error('Bâtiment requis');

  const data = await readStore();
  const now = new Date().toISOString();
  const duplicate = data.rooms.find(
    (room) =>
      room.roomNumber.toLowerCase() === roomNumber.toLowerCase()
      && room.building.toLowerCase() === building.toLowerCase()
      && room.id !== input.id,
  );
  if (duplicate) throw new Error('Cette chambre existe déjà dans ce bâtiment');

  if (input.id) {
    const index = data.rooms.findIndex((room) => room.id === input.id);
    if (index < 0) throw new Error('Chambre introuvable');
    const updated: GuestRoom = {
      ...data.rooms[index],
      roomNumber,
      building,
      characteristics,
      updatedAt: now,
    };
    data.rooms[index] = updated;
    await writeStore(data);
    return updated;
  }

  const created: GuestRoom = {
    id: randomUUID(),
    roomNumber,
    building,
    characteristics,
    createdAt: now,
    updatedAt: now,
  };
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
    updatedAt: now,
  };
  data.nextReservationSeq += 1;
  data.reservations.unshift(reservation);
  await writeStore(data);
  return reservation;
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
    if (!nextRoomId) throw new Error('Attribuez une chambre pour confirmer');
    const roomExists = data.rooms.some((room) => room.id === nextRoomId);
    if (!roomExists) throw new Error('Chambre introuvable');
    const conflict = data.reservations.some(
      (item) =>
        item.id !== id
        && item.status === 'confirmed'
        && item.roomId === nextRoomId
        && datesOverlap(item.startDate, item.endDate, current.startDate, current.endDate),
    );
    if (conflict) throw new Error('Cette chambre est déjà réservée sur cette période');
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

export function remainingDays(endDate: string, from = todayIso()): number {
  const end = parseIsoDate(endDate);
  const start = parseIsoDate(from);
  if (!end || !start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export function reservationNightCount(startDate: string, endDate: string): number {
  return Math.max(0, daysBetweenInclusive(startDate, endDate) - 1) || daysBetweenInclusive(startDate, endDate);
}
