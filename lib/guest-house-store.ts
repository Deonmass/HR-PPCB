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
  GuestHouseStoreData,
  GuestReservation,
  GuestReservationInput,
  GuestReservationStatus,
  GuestRoom,
  GuestRoomInput,
} from './guest-house-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

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
  return { rooms: [], reservations: [], nextReservationSeq: 1 };
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

async function readStore(): Promise<GuestHouseStoreData> {
  const storePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_GUEST_HOUSE_KEY, storePath);
  try {
    const raw = await fsPromises.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as GuestHouseStoreData;
    return {
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
      nextReservationSeq: Number(parsed.nextReservationSeq) > 0
        ? Number(parsed.nextReservationSeq)
        : 1,
    };
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

export async function getGuestHouseBundle(): Promise<GuestHouseStoreData & { dashboard: GuestHouseDashboard }> {
  const data = await readStore();
  return { ...data, dashboard: buildDashboard(data) };
}

export function buildDashboard(data: GuestHouseStoreData): GuestHouseDashboard {
  const today = todayIso();
  const occupiedRoomIds = new Set(
    data.reservations
      .filter((item) => isActiveOn(item, today))
      .map((item) => item.roomId!)
      .filter(Boolean),
  );
  const occupied = occupiedRoomIds.size;
  const totalRooms = data.rooms.length;
  const empty = Math.max(0, totalRooms - occupied);

  const roomsById = new Map(data.rooms.map((room) => [room.id, room]));
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

  const monthlyMap = new Map<string, { reservations: number; occupiedDays: number; emptyDays: number }>();
  const now = new Date();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, { reservations: 0, occupiedDays: 0, emptyDays: 0 });
  }

  for (const reservation of data.reservations) {
    const createdKey = reservation.createdAt.slice(0, 7);
    const bucket = monthlyMap.get(createdKey);
    if (bucket) bucket.reservations += 1;
  }

  for (const [key, bucket] of monthlyMap) {
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const daysInMonth = new Date(year, month, 0).getDate();
    const capacityDays = totalRooms * daysInMonth;
    let occupiedDays = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${key}-${String(day).padStart(2, '0')}`;
      const occupiedThatDay = new Set(
        data.reservations
          .filter((item) => isActiveOn(item, iso) || (
            item.status === 'confirmed'
            && item.roomId
            && item.startDate <= iso
            && item.endDate >= iso
          ))
          .map((item) => item.roomId!),
      ).size;
      occupiedDays += occupiedThatDay;
    }
    bucket.occupiedDays = occupiedDays;
    bucket.emptyDays = Math.max(0, capacityDays - occupiedDays);
  }

  const monthly = [...monthlyMap.entries()].map(([key, value]) => {
    const [year, month] = key.split('-');
    const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('fr-FR', {
      month: 'short',
      year: '2-digit',
    });
    return { key, label, ...value };
  });

  return {
    totalRooms,
    occupied,
    empty,
    pendingReservations: data.reservations.filter((item) => item.status === 'pending').length,
    endingSoon,
    monthly,
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

  const updated: GuestReservation = {
    ...current,
    status,
    roomId: nextRoomId,
    updatedAt: new Date().toISOString(),
  };
  data.reservations[index] = updated;
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
