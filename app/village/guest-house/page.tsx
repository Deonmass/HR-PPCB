'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import SideDrawer from '@/components/SideDrawer';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import CardActionMenu from '@/components/CardActionMenu';
import GuestHouseMonthlyChart from '@/components/village/GuestHouseMonthlyChart';
import GuestHouseRoomOccupancyChart from '@/components/village/GuestHouseRoomOccupancyChart';
import { usePermissions } from '@/contexts/PermissionContext';
import type {
  GuestHouseDashboard,
  GuestReservation,
  GuestRoom,
  GuestRoomCategory,
  GuestRoomPassage,
} from '@/lib/guest-house-types';
import {
  GUEST_HOUSE_BUILDINGS,
  KIMPESE_BUILDING,
  roomDisplayName,
} from '@/lib/guest-house-types';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

type Tab = 'dashboard' | 'reservations' | 'rooms';
type DrawerKind = 'room' | 'reservation' | 'confirm' | 'history';
type KpiModal = 'rooms' | 'occupied' | 'empty' | 'pending' | 'kimpese' | 'occupancy' | null;
type ValidatedSubTab = 'approved' | 'rejected';

function isKimpeseRoom(room: GuestRoom): boolean {
  return room.category === 'kimpese' || room.building === KIMPESE_BUILDING;
}

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconDashboard({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function IconCalendar({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconBed({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
      <path d="M2 14h20" />
      <path d="M4 12V8a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v4" />
    </svg>
  );
}

function IconPlus({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconChevron({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconExport({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconDoor({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h8v18" />
      <path d="M14 11h.01" />
    </svg>
  );
}

function IconUsers({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconEmpty({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

function IconClock({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value || '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR');
}

function remainingDays(endDate: string): number {
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - today.getTime()) / 86_400_000);
}

/** Hours + minutes left until end of checkout day (when daysLeft === 0). */
function formatHoursMinutesLeft(endDate: string, now = new Date()): string {
  const end = new Date(`${endDate.slice(0, 10)}T23:59:59`);
  if (Number.isNaN(end.getTime())) return '0 h 00';
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return '0 h 00';
  const totalMins = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours} h ${String(mins).padStart(2, '0')}`;
}

function formatDaysLeftDisplay(endDate: string): string {
  const days = remainingDays(endDate);
  if (days < 0) return 'Terminé';
  if (days === 0) return formatHoursMinutesLeft(endDate);
  return `${days} j`;
}

function stayDayCount(startDate: string, endDate: string): number {
  const a = new Date(`${startDate.slice(0, 10)}T00:00:00`);
  const b = new Date(`${endDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseMonthKey(key: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function monthBounds(monthKey: string): { start: string; end: string; days: number } | null {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  const { year, month } = parsed;
  const days = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`,
    days,
  };
}

function overlapsMonth(startDate: string, endDate: string, monthKey: string): boolean {
  const bounds = monthBounds(monthKey);
  if (!bounds) return true;
  return startDate <= bounds.end && endDate >= bounds.start;
}

function nightsCoveredInMonth(startDate: string, endDate: string, monthKey: string): number {
  const bounds = monthBounds(monthKey);
  if (!bounds) return 0;
  if (endDate < bounds.start || startDate > bounds.end) return 0;
  const from = startDate > bounds.start ? startDate : bounds.start;
  const to = endDate < bounds.end ? endDate : bounds.end;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function compactDurationDays(days: number): string {
  if (days <= 0) return '< 1 j';
  return `${days} j`;
}

/** Elapsed stay time relative to today / check-in. */
function formatTempsEcoule(startDate: string, endDate: string, today = todayIso()): string {
  if (today < startDate) return 'À venir';
  if (today > endDate) {
    const a = new Date(`${startDate}T00:00:00`);
    const b = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'Terminé';
    const days = Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
    return days <= 0 ? 'Terminé' : compactDurationDays(days);
  }
  const a = new Date(`${startDate}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const days = Math.floor((t.getTime() - a.getTime()) / 86_400_000);
  if (days <= 0) return '12 h';
  return compactDurationDays(days);
}

/** Remaining time until check-out. */
function formatTempsRestant(startDate: string, endDate: string, today = todayIso()): string {
  if (today < startDate) return 'À venir';
  if (today > endDate) return 'Terminé';
  const days = remainingDays(endDate);
  if (days <= 0) return formatHoursMinutesLeft(endDate);
  return compactDurationDays(days);
}

const IMPORT_MOTIF_RE = /^séjour\s*\(import\s*(template|historique)\)\s*$/i;

function personMotifSubtitle(motif?: string): string | null {
  const value = (motif ?? '').trim();
  if (!value || IMPORT_MOTIF_RE.test(value)) return null;
  return value;
}

function monthLabelFr(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const label = new Date(parsed.year, parsed.month - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** YYYY-MM from an ISO date (fallback for incomplete values). */
function dateMonthKey(value: string): string {
  const key = (value || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : 'inconnu';
}

function statusLabel(status: GuestReservation['status']): string {
  switch (status) {
    case 'pending': return 'En attente';
    case 'confirmed': return 'Approuvé';
    case 'rejected': return 'Rejeté';
    case 'cancelled': return 'Annulé';
    case 'completed': return 'Terminé';
    default: return status;
  }
}

async function downloadGuestHouseExport(monthKey?: string): Promise<void> {
  const qs = monthKey ? `?month=${encodeURIComponent(monthKey)}` : '';
  const response = await fetch(`/api/village/guest-house/export${qs}`);
  if (!response.ok) {
    let message = 'Export impossible';
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  const filename = filenameMatch?.[1] ?? 'GUEST_HOUSE.xlsx';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function VillageGuestHousePage() {
  const { can } = usePermissions();
  const canCreate = can('village.guest-house', 'create');
  const canEdit = can('village.guest-house', 'edit');
  const canDelete = can('village.guest-house', 'delete');
  const canExport = can('village.guest-house', 'export');

  const [tab, setTab] = useState<Tab>('dashboard');
  const [rooms, setRooms] = useState<GuestRoom[]>([]);
  const [reservations, setReservations] = useState<GuestReservation[]>([]);
  const [passages, setPassages] = useState<GuestRoomPassage[]>([]);
  const [dashboard, setDashboard] = useState<GuestHouseDashboard | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [editingRoom, setEditingRoom] = useState<GuestRoom | null>(null);
  const [editingReservation, setEditingReservation] = useState<GuestReservation | null>(null);
  const [resContextMenu, setResContextMenu] = useState<{
    x: number;
    y: number;
    item: GuestReservation;
  } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<GuestReservation | null>(null);
  const [historyRoom, setHistoryRoom] = useState<GuestRoom | null>(null);
  /** Expanded month keys (YYYY-MM) in the Historique drawer. */
  const [historyOpenMonths, setHistoryOpenMonths] = useState<string[]>([]);
  const [kpiModal, setKpiModal] = useState<KpiModal>(null);
  /** Month key for the occupation-by-room modal (may differ from page filter). */
  const [occupancyDetailMonth, setOccupancyDetailMonth] = useState(currentMonthKey);
  const [validatedSubTab, setValidatedSubTab] = useState<ValidatedSubTab>('approved');
  /** Shared month filter for lists, dashboard KPIs, occupancy, and export. */
  const [viewMonth, setViewMonth] = useState(currentMonthKey);

  const [roomForm, setRoomForm] = useState({
    category: 'standard' as GuestRoomCategory,
    roomNumber: '',
    roomName: '',
    building: 'Batiment #1',
    hotelName: '',
    characteristics: '',
    notes: '',
  });
  const [reservationForm, setReservationForm] = useState({
    personName: '',
    matricule: '',
    isAgent: true,
    motif: '',
    startDate: '',
    endDate: '',
    notes: '',
    company: '',
    mission: '',
    phone: '',
    email: '',
  });
  const [confirmRoomId, setConfirmRoomId] = useState('');
  const [saving, setSaving] = useState(false);

  const roomsById = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms],
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resGuest, resEmployees] = await Promise.all([
        fetch('/api/village/guest-house', { cache: 'no-store' }),
        fetch('/api/employees', { cache: 'no-store' }),
      ]);
      const guestJson = await resGuest.json();
      const employeesJson = await resEmployees.json();
      if (!resGuest.ok) {
        await showError(guestJson?.error || 'Chargement Guest house impossible');
        return;
      }
      setRooms(Array.isArray(guestJson.rooms) ? guestJson.rooms : []);
      setReservations(Array.isArray(guestJson.reservations) ? guestJson.reservations : []);
      setPassages(Array.isArray(guestJson.passages) ? guestJson.passages : []);
      setDashboard(guestJson.dashboard ?? null);
      setEmployees(Array.isArray(employeesJson) ? employeesJson : []);
    } catch {
      await showError('Erreur de chargement Guest house');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingAll = useMemo(
    () => reservations.filter((item) => item.status === 'pending'),
    [reservations],
  );
  const monthReservations = useMemo(
    () => reservations.filter((item) => overlapsMonth(item.startDate, item.endDate, viewMonth)),
    [reservations, viewMonth],
  );
  const pending = useMemo(
    () => monthReservations.filter((item) => item.status === 'pending'),
    [monthReservations],
  );
  const approved = useMemo(
    () => monthReservations.filter((item) => item.status === 'confirmed' || item.status === 'completed'),
    [monthReservations],
  );
  const rejected = useMemo(
    () => monthReservations.filter((item) => item.status === 'rejected' || item.status === 'cancelled'),
    [monthReservations],
  );
  const validatedList = validatedSubTab === 'approved' ? approved : rejected;

  const roomOccupancy = useMemo(() => {
    const bounds = monthBounds(viewMonth);
    if (!bounds) return [];
    const nightsByRoom = new Map<string, number>();
    for (const item of reservations) {
      if (item.status !== 'confirmed' && item.status !== 'completed') continue;
      if (!item.roomId) continue;
      const nights = nightsCoveredInMonth(item.startDate, item.endDate, viewMonth);
      if (nights <= 0) continue;
      nightsByRoom.set(item.roomId, (nightsByRoom.get(item.roomId) ?? 0) + nights);
    }
    return rooms
      .map((room) => {
        const nights = nightsByRoom.get(room.id) ?? 0;
        const rate = bounds.days > 0
          ? Math.round((nights / bounds.days) * 1000) / 10
          : 0;
        const kimpese = isKimpeseRoom(room);
        return {
          roomId: room.id,
          label: roomDisplayName(room),
          building: kimpese ? KIMPESE_BUILDING : room.building,
          isKimpese: kimpese,
          nights,
          daysInMonth: bounds.days,
          rate,
        };
      })
      .sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label, 'fr'));
  }, [reservations, rooms, viewMonth]);

  const occupancyModalRows = useMemo(() => {
    const monthKey = occupancyDetailMonth || viewMonth;
    const bounds = monthBounds(monthKey);
    if (!bounds) return { monthKey, days: 0, rows: [] as typeof roomOccupancy };
    const nightsByRoom = new Map<string, number>();
    for (const item of reservations) {
      if (item.status !== 'confirmed' && item.status !== 'completed') continue;
      if (!item.roomId) continue;
      const nights = nightsCoveredInMonth(item.startDate, item.endDate, monthKey);
      if (nights <= 0) continue;
      nightsByRoom.set(item.roomId, (nightsByRoom.get(item.roomId) ?? 0) + nights);
    }
    const rows = rooms
      .filter((room) => !isKimpeseRoom(room))
      .map((room) => {
        const nights = nightsByRoom.get(room.id) ?? 0;
        const rate = bounds.days > 0
          ? Math.round((nights / bounds.days) * 1000) / 10
          : 0;
        return {
          roomId: room.id,
          label: roomDisplayName(room),
          building: room.building,
          isKimpese: false,
          nights,
          daysInMonth: bounds.days,
          rate,
        };
      })
      .sort((a, b) => b.rate - a.rate || a.label.localeCompare(b.label, 'fr'));
    return { monthKey, days: bounds.days, rows };
  }, [reservations, rooms, occupancyDetailMonth, viewMonth]);

  const openOccupancyModal = useCallback((monthKey: string) => {
    setOccupancyDetailMonth(monthKey);
    setKpiModal('occupancy');
  }, []);

  const onsiteOccupancy = useMemo(
    () => roomOccupancy.filter((item) => !item.isKimpese),
    [roomOccupancy],
  );

  const kimpeseLodgers = useMemo(() => {
    const today = todayIso();
    return reservations
      .filter((item) => {
        if (item.status !== 'confirmed' && item.status !== 'completed') return false;
        if (!item.roomId) return false;
        const room = roomsById.get(item.roomId);
        if (!room || !isKimpeseRoom(room)) return false;
        return overlapsMonth(item.startDate, item.endDate, viewMonth);
      })
      .map((item) => {
        const room = roomsById.get(item.roomId!)!;
        const daysLeft = remainingDays(item.endDate);
        const active = item.startDate <= today && item.endDate >= today && item.status === 'confirmed';
        return {
          id: item.id,
          numero: item.numero,
          personName: item.personName,
          hotel: roomDisplayName(room),
          startDate: item.startDate,
          endDate: item.endDate,
          daysLeft,
          active,
        };
      })
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.endDate.localeCompare(b.endDate) || a.personName.localeCompare(b.personName, 'fr');
      });
  }, [reservations, roomsById, viewMonth]);

  const monthDashboard = useMemo(() => {
    const bounds = monthBounds(viewMonth);
    const today = todayIso();
    const onsiteRoomsList = rooms.filter((r) => !isKimpeseRoom(r));
    const kimpeseRooms = rooms.filter(isKimpeseRoom);
    const occupiedRoomIds = new Set(
      roomOccupancy.filter((item) => item.nights > 0).map((item) => item.roomId),
    );
    const occupiedOnsite = onsiteRoomsList.filter((room) => occupiedRoomIds.has(room.id)).length;
    const emptyOnsite = onsiteRoomsList.filter((room) => !occupiedRoomIds.has(room.id));
    const reservedOnsite = onsiteRoomsList.filter((room) => {
      if (occupiedRoomIds.has(room.id)) return false;
      return reservations.some(
        (item) =>
          item.roomId === room.id
          && (item.status === 'confirmed' || item.status === 'pending')
          && overlapsMonth(item.startDate, item.endDate, viewMonth)
          && item.startDate > today,
      );
    });
    const kimpeseOccupied = kimpeseRooms.filter((room) => occupiedRoomIds.has(room.id)).length;
    const onsiteRooms = onsiteRoomsList.length;
    const totalNights = roomOccupancy
      .filter((item) => !item.isKimpese)
      .reduce((sum, item) => sum + item.nights, 0);
    const capacityNights = onsiteRooms * (bounds?.days ?? 0);
    const occupancyRate = capacityNights > 0
      ? Math.round((totalNights / capacityNights) * 1000) / 10
      : 0;

    const occupiedReservations = monthReservations.filter(
      (item) =>
        (item.status === 'confirmed' || item.status === 'completed')
        && Boolean(item.roomId)
        && nightsCoveredInMonth(item.startDate, item.endDate, viewMonth) > 0,
    );

    const endingSoon = reservations
      .filter((item) => item.status === 'confirmed' && overlapsMonth(item.startDate, item.endDate, viewMonth))
      .map((item) => {
        const daysLeft = remainingDays(item.endDate);
        const room = item.roomId ? roomsById.get(item.roomId) : undefined;
        return { item, daysLeft, room };
      })
      .filter(({ daysLeft, item }) => {
        if (viewMonth === currentMonthKey()) {
          return daysLeft >= 0 && daysLeft <= 7;
        }
        return item.endDate >= (bounds?.start ?? '') && item.endDate <= (bounds?.end ?? '');
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .map(({ item, daysLeft, room }) => ({
        id: item.id,
        numero: item.numero,
        personName: item.personName,
        endDate: item.endDate,
        daysLeft,
        roomNumber: room ? roomDisplayName(room) : '—',
        building: room?.building ?? '—',
        isKimpese: room ? isKimpeseRoom(room) : false,
      }));

    const futureReservations = reservations
      .filter((item) => {
        if (item.status !== 'confirmed' && item.status !== 'pending' && item.status !== 'completed') {
          return false;
        }
        return item.startDate > (bounds?.end ?? '');
      })
      .map((item) => {
        const room = item.roomId ? roomsById.get(item.roomId) : undefined;
        return {
          id: item.id,
          numero: item.numero,
          personName: item.personName,
          startDate: item.startDate,
          endDate: item.endDate,
          status: item.status,
          roomNumber: room ? roomDisplayName(room) : '—',
          building: room?.building ?? '—',
          isKimpese: room ? isKimpeseRoom(room) : false,
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.numero.localeCompare(b.numero, 'fr'));

    return {
      onsiteRooms,
      occupied: occupiedOnsite,
      empty: emptyOnsite.length,
      reserved: reservedOnsite.length,
      pendingReservations: pending.length,
      kimpeseHotels: kimpeseRooms.length,
      kimpeseOccupied,
      occupancyRate,
      endingSoon,
      futureReservations,
      occupiedReservations,
      emptyRooms: emptyOnsite,
    };
  }, [rooms, reservations, roomsById, viewMonth, roomOccupancy, monthReservations, pending]);

  const openRoomCreate = (category: GuestRoomCategory = 'standard') => {
    setEditingRoom(null);
    setRoomForm({
      category,
      roomNumber: '',
      roomName: '',
      building: category === 'kimpese' ? KIMPESE_BUILDING : 'Batiment #1',
      hotelName: '',
      characteristics: '',
      notes: '',
    });
    setDrawer('room');
  };

  const openRoomEdit = (room: GuestRoom) => {
    setEditingRoom(room);
    setRoomForm({
      category: isKimpeseRoom(room) ? 'kimpese' : 'standard',
      roomNumber: room.roomNumber,
      roomName: room.roomName,
      building: room.building,
      hotelName: room.hotelName || room.roomName,
      characteristics: room.characteristics,
      notes: room.notes || '',
    });
    setDrawer('room');
  };

  const openHistory = (room: GuestRoom) => {
    setHistoryRoom(room);
    setHistoryOpenMonths([]);
    setDrawer('history');
  };

  const toggleHistoryMonth = (monthKey: string) => {
    setHistoryOpenMonths((prev) => (
      prev.includes(monthKey)
        ? prev.filter((key) => key !== monthKey)
        : [...prev, monthKey]
    ));
  };

  const openReservationCreate = () => {
    setEditingReservation(null);
    setReservationForm({
      personName: '',
      matricule: '',
      isAgent: true,
      motif: '',
      startDate: '',
      endDate: '',
      notes: '',
      company: '',
      mission: '',
      phone: '',
      email: '',
    });
    setDrawer('reservation');
  };

  const openReservationEdit = (item: GuestReservation) => {
    setResContextMenu(null);
    setEditingReservation(item);
    setReservationForm({
      personName: item.personName,
      matricule: item.matricule || '',
      isAgent: Boolean(item.isAgent || item.matricule),
      motif: item.motif === '—' ? '' : item.motif,
      startDate: item.startDate,
      endDate: item.endDate,
      notes: item.notes || '',
      company: item.company || '',
      mission: item.mission || '',
      phone: item.phone || '',
      email: item.email || '',
    });
    setDrawer('reservation');
  };

  const openConfirm = (reservation: GuestReservation) => {
    setConfirmTarget(reservation);
    setConfirmRoomId(reservation.roomId || '');
    setDrawer('confirm');
  };

  const saveRoom = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/village/guest-house', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'room',
          id: editingRoom?.id,
          ...roomForm,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showError(json.error || `Enregistrement impossible (HTTP ${res.status})`);
        return;
      }
      setDrawer(null);
      await showSuccess(editingRoom ? 'Chambre mise à jour' : 'Chambre créée');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible (réseau)');
    } finally {
      setSaving(false);
    }
  };

  const saveReservation = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/village/guest-house', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'reservation',
          ...(editingReservation ? { action: 'update', id: editingReservation.id } : {}),
          ...reservationForm,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showError(
          json.error
            || `${editingReservation ? 'Modification' : 'Création'} impossible (HTTP ${res.status})`,
        );
        return;
      }
      setDrawer(null);
      setEditingReservation(null);
      await showSuccess(editingReservation ? 'Réservation mise à jour' : 'Réservation créée');
      setTab('reservations');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible (réseau)');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (
    reservation: GuestReservation,
    status: 'confirmed' | 'rejected' | 'cancelled',
    roomId?: string,
  ) => {
    setSaving(true);
    try {
      const res = await fetch('/api/village/guest-house', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'reservation',
          action: 'status',
          id: reservation.id,
          status,
          roomId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showError(json.error || `Action impossible (HTTP ${res.status})`);
        return;
      }
      setDrawer(null);
      setConfirmTarget(null);
      await showSuccess(
        status === 'confirmed' ? 'Réservation confirmée' : status === 'rejected' ? 'Réservation refusée' : 'Réservation annulée',
      );
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Action impossible (réseau)');
    } finally {
      setSaving(false);
    }
  };

  const removeRoom = async (room: GuestRoom) => {
    const label = roomDisplayName(room);
    if (!(await confirmDelete(`Supprimer ${isKimpeseRoom(room) ? 'l’hôtel' : 'la chambre'} ${label} ?`))) return;
    const res = await fetch('/api/village/guest-house', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'room', action: 'delete', id: room.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      await showError(json.error || `Suppression impossible (HTTP ${res.status})`);
      return;
    }
    await showSuccess(isKimpeseRoom(room) ? 'Hôtel Kimpese supprimé' : 'Chambre supprimée');
    await load(true);
  };

  const roomPassages = useMemo(() => {
    if (!historyRoom) return [];
    return passages
      .filter((item) => item.roomId === historyRoom.id)
      .sort((a, b) => {
        const endCmp = (b.endDate || '').localeCompare(a.endDate || '');
        if (endCmp !== 0) return endCmp;
        return (b.checkedInAt || '').localeCompare(a.checkedInAt || '');
      });
  }, [historyRoom, passages]);

  const roomPassagesByMonth = useMemo(() => {
    const groups = new Map<string, GuestRoomPassage[]>();
    for (const passage of roomPassages) {
      const key = dateMonthKey(passage.startDate || passage.checkedInAt || passage.endDate);
      const list = groups.get(key);
      if (list) list.push(passage);
      else groups.set(key, [passage]);
    }
    return [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({
        key,
        label: key === 'inconnu' ? 'Date inconnue' : monthLabelFr(key),
        items,
      }));
  }, [roomPassages]);

  useEffect(() => {
    if (drawer !== 'history' || !historyRoom || roomPassagesByMonth.length === 0) return;
    setHistoryOpenMonths((prev) => (
      prev.length === 0 ? [roomPassagesByMonth[0].key] : prev
    ));
  }, [drawer, historyRoom, roomPassagesByMonth]);

  const roomsGrouped = useMemo(() => {
    const today = todayIso();
    const withStatus = rooms.map((room) => {
      const roomReservations = reservations.filter((item) => item.roomId === room.id);
      const activeReservation = roomReservations.find(
        (item) =>
          item.status === 'confirmed'
          && item.startDate <= today
          && item.endDate >= today,
      );
      const upcomingReservation = roomReservations.find(
        (item) =>
          (item.status === 'confirmed' || item.status === 'pending')
          && item.startDate > today,
      );
      const status = activeReservation
        ? 'occupied'
        : upcomingReservation
          ? 'reserved'
          : 'empty';
      const linkedReservation = activeReservation ?? upcomingReservation ?? null;
      return {
        room,
        status,
        linkedReservation,
        passageCount: passages.filter((item) => item.roomId === room.id).length,
      };
    });

    const groups: Record<string, typeof withStatus> = {};
    for (const building of GUEST_HOUSE_BUILDINGS) {
      groups[building] = [];
    }
    for (const item of withStatus) {
      const key = isKimpeseRoom(item.room)
        ? KIMPESE_BUILDING
        : (item.room.building || 'Sans lieu');
      if (!groups[key]) groups[key] = [];
      groups[key]!.push(item);
    }
    return groups;
  }, [rooms, reservations, passages]);

  const buildingOrder = useMemo(() => {
    const keys = Object.keys(roomsGrouped);
    const preferred = GUEST_HOUSE_BUILDINGS as readonly string[];
    const rest = keys
      .filter((k) => !preferred.includes(k))
      .sort((a, b) => a.localeCompare(b, 'fr'));
    return [...preferred.filter((k) => keys.includes(k)), ...rest];
  }, [roomsGrouped]);

  const kpiModalContent = useMemo(() => {
    if (!dashboard || !kpiModal) return null;
    const reservationColumns: DashboardListColumn[] = [
      { key: 'numero', label: 'N°' },
      { key: 'person', label: 'Personne' },
      { key: 'room', label: 'Chambre / Hôtel' },
      { key: 'start', label: 'Début' },
      { key: 'end', label: 'Fin' },
      { key: 'status', label: 'Statut' },
    ];
    const roomColumns: DashboardListColumn[] = [
      { key: 'number', label: 'Chambre / Hôtel' },
      { key: 'building', label: 'Lieu' },
      { key: 'characteristics', label: 'Caractéristique' },
    ];
    const mapReservation = (item: GuestReservation): DashboardListRow => ({
      id: item.id,
      cells: {
        numero: item.numero,
        person: item.personName,
        room: (() => {
          const room = item.roomId ? roomsById.get(item.roomId) : undefined;
          return room ? roomDisplayName(room) : '—';
        })(),
        start: formatDate(item.startDate),
        end: formatDate(item.endDate),
        status: statusLabel(item.status),
      },
    });
    const mapRoom = (room: GuestRoom): DashboardListRow => ({
      id: room.id,
      cells: {
        number: roomDisplayName(room),
        building: room.building,
        characteristics: room.characteristics || '—',
      },
    });

    if (kpiModal === 'rooms') {
      return {
        title: 'Toutes les chambres (sur site)',
        columns: roomColumns,
        rows: rooms.filter((r) => !isKimpeseRoom(r)).map(mapRoom),
      };
    }
    if (kpiModal === 'occupied') {
      return {
        title: `Chambres occupées — ${monthLabelFr(viewMonth)}`,
        columns: reservationColumns,
        rows: monthDashboard.occupiedReservations.map(mapReservation),
      };
    }
    if (kpiModal === 'empty') {
      return {
        title: `Chambres vides — ${monthLabelFr(viewMonth)}`,
        columns: roomColumns,
        rows: monthDashboard.emptyRooms.map(mapRoom),
      };
    }
    if (kpiModal === 'kimpese') {
      return {
        title: 'Logé ailleurs (hôtels externes)',
        columns: roomColumns,
        rows: rooms.filter(isKimpeseRoom).map(mapRoom),
      };
    }
    if (kpiModal === 'occupancy') {
      const { monthKey, days, rows } = occupancyModalRows;
      return {
        title: `Occupation par chambre — ${monthLabelFr(monthKey)}`,
        columns: [
          { key: 'room', label: 'Chambre' },
          { key: 'occupied', label: 'Jours occupés', align: 'right' as const },
          { key: 'total', label: 'Jours mois', align: 'right' as const },
          { key: 'rate', label: 'Occupation %', align: 'right' as const },
        ],
        rows: rows.map((item) => ({
          id: item.roomId,
          cells: {
            room: item.label,
            occupied: item.nights,
            total: days,
            rate: `${item.rate}%`,
          },
        })),
      };
    }
    return {
      title: `Réservations en attente — ${monthLabelFr(viewMonth)}`,
      columns: reservationColumns,
      rows: pending.map(mapReservation),
    };
  }, [dashboard, kpiModal, rooms, roomsById, pending, monthDashboard, viewMonth, occupancyModalRows]);

  if (loading) return <div className="loading">Chargement…</div>;

  return (
    <PermissionGate menuId="village.guest-house" action="view">
      <div className="guest-house-page">
        <div className="guest-house-sticky">
          <div className="page-header page-header-with-tabs">
            <div>
              <div className="page-header-title-row">
                <h2>Guest house</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
            </div>
            <div className="guest-house-header-actions">
              <div className="guest-house-toolbar-right">
                <div className="tabs header-tabs header-tabs-compact guest-house-main-tabs">
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-icon${tab === 'dashboard' ? ' active' : ''}`}
                    onClick={() => setTab('dashboard')}
                  >
                    <IconDashboard size={13} />
                    Dashboard
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-icon${tab === 'reservations' ? ' active' : ''}`}
                    onClick={() => setTab('reservations')}
                  >
                    <IconCalendar size={13} />
                    Réservation
                    {pendingAll.length > 0 && <span className="employees-tab-count">{pendingAll.length}</span>}
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-icon${tab === 'rooms' ? ' active' : ''}`}
                    onClick={() => setTab('rooms')}
                  >
                    <IconBed size={13} />
                    Chambres
                  </button>
                </div>
                <div className="guest-house-export-group">
                  <input
                    type="month"
                    className="guest-house-export-month"
                    value={viewMonth}
                    onChange={(e) => setViewMonth(e.target.value)}
                    aria-label="Mois affiché"
                    title="Filtre mois / année (listes, dashboard, export)"
                  />
                  {canExport && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm btn-with-icon"
                      disabled={exporting}
                      onClick={async () => {
                        setExporting(true);
                        try {
                          await downloadGuestHouseExport(viewMonth);
                        } catch (err) {
                          await showError(err instanceof Error ? err.message : 'Export impossible');
                        } finally {
                          setExporting(false);
                        }
                      }}
                    >
                      {exporting ? <span className="btn-spinner" aria-hidden="true" /> : <IconExport size={12} />}
                      {exporting ? 'Export…' : 'Exporter'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`guest-house-body${tab === 'reservations' || tab === 'dashboard' ? ' is-fill' : ''}`}>
          {tab === 'dashboard' && dashboard && (
            <div className="guest-house-dashboard">
              <p className="guest-house-period-label text-muted">
                Période : {monthLabelFr(viewMonth)}
              </p>
              <div className="guest-house-kpi-grid">
                <button
                  type="button"
                  className="card card-glow card-glow-cyan guest-house-kpi-card"
                  onClick={() => setKpiModal('rooms')}
                >
                  <div className="guest-house-kpi-text">
                    <div className="card-label">Chambres sur site</div>
                    <div className="card-value">{monthDashboard.onsiteRooms}</div>
                  </div>
                  <span className="guest-house-kpi-icon"><IconDoor /></span>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-green guest-house-kpi-card"
                  onClick={() => setKpiModal('occupied')}
                >
                  <div className="guest-house-kpi-text">
                    <div className="card-label">Occupées</div>
                    <div className="card-value">{monthDashboard.occupied}</div>
                    <div className="text-muted guest-house-kpi-sub">{monthDashboard.occupancyRate}% taux</div>
                  </div>
                  <span className="guest-house-kpi-icon"><IconUsers /></span>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-violet guest-house-kpi-card"
                  onClick={() => setKpiModal('empty')}
                >
                  <div className="guest-house-kpi-text">
                    <div className="card-label">Vides</div>
                    <div className="card-value">{monthDashboard.empty}</div>
                    {monthDashboard.reserved > 0 && (
                      <div className="text-muted guest-house-kpi-sub">{monthDashboard.reserved} réservé(s)</div>
                    )}
                  </div>
                  <span className="guest-house-kpi-icon"><IconEmpty /></span>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-orange guest-house-kpi-card"
                  onClick={() => setKpiModal('pending')}
                >
                  <div className="guest-house-kpi-text">
                    <div className="card-label">En attente</div>
                    <div className="card-value">{monthDashboard.pendingReservations}</div>
                  </div>
                  <span className="guest-house-kpi-icon"><IconClock /></span>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-cyan guest-house-kpi-card"
                  onClick={() => setKpiModal('kimpese')}
                >
                  <div className="guest-house-kpi-text">
                    <div className="card-label">Logé ailleurs</div>
                    <div className="card-value">{monthDashboard.kimpeseHotels}</div>
                    <div className="text-muted guest-house-kpi-sub">
                      {monthDashboard.kimpeseOccupied} occupé(s)
                    </div>
                  </div>
                  <span className="guest-house-kpi-icon"><IconBed /></span>
                </button>
              </div>

              <GuestHouseMonthlyChart
                years={dashboard.years ?? []}
                monthlyByYear={dashboard.monthlyByYear ?? {}}
                selectedMonthKey={viewMonth}
                onBarClick={openOccupancyModal}
              />

              <GuestHouseRoomOccupancyChart
                monthLabel={monthLabelFr(viewMonth)}
                rooms={roomOccupancy}
              />

              <div className="panel panel-padded guest-house-kimpese-panel">
                <div className="guest-house-section-head">
                  <div>
                    <h3>Logé ailleurs</h3>
                    <p className="text-muted">
                      Hôtels externes · {kimpeseLodgers.length} séjour(s) · {monthLabelFr(viewMonth)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="guest-house-occupancy-badge"
                    onClick={() => setKpiModal('kimpese')}
                    title="Voir les hôtels (logé ailleurs)"
                  >
                    {monthDashboard.kimpeseOccupied} / {monthDashboard.kimpeseHotels} occupé(s)
                  </button>
                </div>
                {kimpeseLodgers.length === 0 ? (
                  <div className="guest-house-panel-empty">
                    <p className="text-muted">Aucun séjour logé ailleurs sur cette période.</p>
                  </div>
                ) : (
                  <div className="table-wrap guest-house-panel-scroll guest-house-kimpese-scroll">
                    <table className="data-table guest-house-compact-table">
                      <thead>
                        <tr>
                          <th>N°</th>
                          <th>Personne</th>
                          <th>Hôtel</th>
                          <th>Période</th>
                          <th>Restant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kimpeseLodgers.map((item) => (
                          <tr key={item.id} className={item.active ? 'is-active-row' : undefined}>
                            <td>{item.numero}</td>
                            <td>{item.personName}</td>
                            <td>{item.hotel}</td>
                            <td className="guest-house-period-cell">
                              {formatDate(item.startDate)} → {formatDate(item.endDate)}
                            </td>
                            <td>
                              <span className={`guest-house-days-left${item.daysLeft <= 2 ? ' is-critical' : ''}`}>
                                {formatDaysLeftDisplay(item.endDate)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="guest-house-dashboard-split">
                <div className="panel panel-padded guest-house-alerts">
                  <h3>
                    {viewMonth === currentMonthKey()
                      ? 'Alertes — fin de booking ≤ 7 jours'
                      : `Fins de séjour — ${monthLabelFr(viewMonth)}`}
                  </h3>
                  {monthDashboard.endingSoon.length === 0 ? (
                    <div className="guest-house-panel-empty">
                      <p className="text-muted">Aucune fin de séjour imminente.</p>
                    </div>
                  ) : (
                    <div className="table-wrap guest-house-panel-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>N°</th>
                            <th>Personne</th>
                            <th>Chambre / Hôtel</th>
                            <th>Lieu</th>
                            <th>Fin</th>
                            <th>Jours restants</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthDashboard.endingSoon.map((item) => (
                            <tr key={item.id}>
                              <td>{item.numero}</td>
                              <td>{item.personName}</td>
                              <td>{item.roomNumber}</td>
                              <td>
                                {item.building}
                                {item.isKimpese ? ' · overflow' : ''}
                              </td>
                              <td>{formatDate(item.endDate)}</td>
                              <td>
                                <span className={`guest-house-days-left${item.daysLeft <= 2 ? ' is-critical' : ''}`}>
                                  {formatDaysLeftDisplay(item.endDate)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="panel panel-padded guest-house-alerts guest-house-future-panel">
                  <h3>Réservations mois futurs</h3>
                  {monthDashboard.futureReservations.length === 0 ? (
                    <div className="guest-house-panel-empty">
                      <p className="text-muted">Aucune réservation après {monthLabelFr(viewMonth)}.</p>
                    </div>
                  ) : (
                    <div className="table-wrap guest-house-panel-scroll">
                      <table className="data-table guest-house-compact-table">
                        <thead>
                          <tr>
                            <th>N°</th>
                            <th>Personne</th>
                            <th>Chambre</th>
                            <th>Début</th>
                            <th>Fin</th>
                            <th>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthDashboard.futureReservations.map((item) => (
                            <tr key={item.id}>
                              <td>{item.numero}</td>
                              <td>{item.personName}</td>
                              <td>
                                {item.roomNumber}
                                {item.isKimpese ? ' · K' : ''}
                              </td>
                              <td>{formatDate(item.startDate)}</td>
                              <td>{formatDate(item.endDate)}</td>
                              <td>
                                <span className={`guest-house-status-pill is-${item.status}`}>
                                  {statusLabel(item.status)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'reservations' && (
            <div className="guest-house-reservations-layout">
              <div className="panel panel-padded guest-house-panel-fill">
                <div className="guest-house-section-head">
                  <div>
                    <h3>En attente</h3>
                    <p className="text-muted">{pending.length} · {monthLabelFr(viewMonth)}</p>
                  </div>
                  {canCreate && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm guest-house-icon-btn"
                      onClick={openReservationCreate}
                      title="Nouvelle réservation"
                      aria-label="Nouvelle réservation"
                    >
                      <IconPlus size={16} />
                    </button>
                  )}
                </div>
                {pending.length === 0 ? (
                  <div className="guest-house-panel-empty">
                    <p className="text-muted">Aucune réservation en attente.</p>
                  </div>
                ) : (
                  <div className="table-wrap guest-house-panel-scroll">
                    <table className="data-table guest-house-compact-table">
                      <thead>
                        <tr>
                          <th>N°</th>
                          <th>Personne</th>
                          <th>Motif</th>
                          <th>Période</th>
                          <th>Jours</th>
                          {(canEdit || canDelete) && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {pending.map((item) => {
                          const days = remainingDays(item.endDate);
                          const motifCol = IMPORT_MOTIF_RE.test(item.motif.trim()) ? '—' : (item.motif || '—');
                          return (
                            <tr key={item.id}>
                              <td>{item.numero}</td>
                              <td>
                                <div className="guest-house-person-cell">
                                  <strong>{item.personName}</strong>
                                  {item.isAgent && item.matricule && (
                                    <span className="text-muted">Agent · {item.matricule}</span>
                                  )}
                                </div>
                              </td>
                              <td>{motifCol}</td>
                              <td className="guest-house-period-cell">
                                {formatDate(item.startDate)} → {formatDate(item.endDate)}
                              </td>
                              <td>
                                <span className={`guest-house-days-left${days <= 2 ? ' is-critical' : ''}`}>
                                  {days} j
                                </span>
                              </td>
                              {(canEdit || canDelete) && (
                                <td>
                                  <div className="guest-house-row-actions">
                                    {canEdit && (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm btn-with-icon"
                                          onClick={() => openConfirm(item)}
                                        >
                                          <IconCheck size={13} />
                                          OK
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn-sm btn-with-icon"
                                          onClick={() => void setStatus(item, 'rejected')}
                                        >
                                          <IconX size={13} />
                                          Non
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="panel panel-padded guest-house-panel-fill">
                <div className="guest-house-section-head">
                  <div>
                    <h3>En cours / validées</h3>
                    <p className="text-muted">{monthLabelFr(viewMonth)}</p>
                  </div>
                  <div className="guest-house-validated-tools">
                    <button
                      type="button"
                      className="guest-house-occupancy-badge"
                      onClick={() => openOccupancyModal(viewMonth)}
                      title="Voir l’occupation par chambre"
                    >
                      Occupation <strong>{monthDashboard.occupancyRate}%</strong>
                    </button>
                    <div className="tabs guest-house-subtabs">
                      <button
                        type="button"
                        className={`guest-house-subtab${validatedSubTab === 'approved' ? ' active' : ''}`}
                        onClick={() => setValidatedSubTab('approved')}
                      >
                        Approuvé ({approved.length})
                      </button>
                      <button
                        type="button"
                        className={`guest-house-subtab${validatedSubTab === 'rejected' ? ' active' : ''}`}
                        onClick={() => setValidatedSubTab('rejected')}
                      >
                        Rejeté ({rejected.length})
                      </button>
                    </div>
                  </div>
                </div>
                {validatedList.length === 0 ? (
                  <div className="guest-house-panel-empty">
                    <p className="text-muted">
                      {validatedSubTab === 'approved' ? 'Aucune réservation approuvée.' : 'Aucune réservation rejetée.'}
                    </p>
                  </div>
                ) : (
                  <div className="table-wrap guest-house-panel-scroll">
                    <table className="data-table guest-house-compact-table">
                      <thead>
                        <tr>
                          <th>N°</th>
                          <th>Personne</th>
                          <th>Chambre</th>
                          <th>Période</th>
                          <th>Nbr Jours</th>
                          <th>Restant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validatedList.map((item) => {
                          const motifSub = personMotifSubtitle(item.motif);
                          const daysLeft = remainingDays(item.endDate);
                          return (
                            <tr
                              key={item.id}
                              onContextMenu={(event) => {
                                if (!canEdit) return;
                                event.preventDefault();
                                setResContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  item,
                                });
                              }}
                            >
                              <td>{item.numero}</td>
                              <td>
                                <div className="guest-house-person-cell">
                                  <strong>{item.personName}</strong>
                                  {motifSub && <span className="text-muted">{motifSub}</span>}
                                </div>
                              </td>
                              <td>{item.roomId ? (() => {
                                const room = roomsById.get(item.roomId);
                                return room ? roomDisplayName(room) : '—';
                              })() : '—'}</td>
                              <td className="guest-house-period-cell">
                                {formatDate(item.startDate)} → {formatDate(item.endDate)}
                              </td>
                              <td>
                                <span className="guest-house-time-chip">
                                  {formatTempsEcoule(item.startDate, item.endDate)}
                                </span>
                              </td>
                              <td>
                                <span className={`guest-house-time-chip${daysLeft <= 2 && daysLeft >= 0 ? ' is-critical' : ''}`}>
                                  {formatTempsRestant(item.startDate, item.endDate)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'rooms' && (
            <div className="panel panel-padded">
              <div className="guest-house-section-head guest-house-rooms-head">
                <div>
                  <h3>Chambres & Kimpese</h3>
                  <p className="text-muted">
                    Batiment #1 / #2 · Kimpese = overflow
                  </p>
                </div>
                {canCreate && (
                  <div className="guest-house-row-actions">
                    <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={() => openRoomCreate('standard')}>
                      <IconPlus size={14} />
                      Chambre
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm btn-with-icon" onClick={() => openRoomCreate('kimpese')}>
                      <IconPlus size={14} />
                      Hôtel Kimpese
                    </button>
                  </div>
                )}
              </div>
              {rooms.length === 0 ? (
                <p className="text-muted">Aucune chambre enregistrée.</p>
              ) : (
                <div className="guest-house-room-groups">
                  {buildingOrder.map((place) => {
                    const groupedRooms = roomsGrouped[place] ?? [];
                    const isKimpeseGroup = place === KIMPESE_BUILDING;
                    return (
                      <section
                        key={place}
                        className={`guest-house-room-group${isKimpeseGroup ? ' is-kimpese' : ''}`}
                      >
                        <div className="guest-house-room-group-head">
                          <div>
                            <h4>{place}</h4>
                            <p className="text-muted">
                              {isKimpeseGroup
                                ? `${groupedRooms.length} hôtel(s) externe(s) — utilisé-texte`
                                : `${groupedRooms.length} chambre(s)`}
                            </p>
                          </div>
                          {canCreate && isKimpeseGroup && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm btn-with-icon"
                              onClick={() => openRoomCreate('kimpese')}
                            >
                              <IconPlus size={13} />
                              Ajouter un hôtel
                            </button>
                          )}
                        </div>
                        {groupedRooms.length === 0 ? (
                          <p className="text-muted">
                            {isKimpeseGroup
                              ? 'Aucun hôtel Kimpese — utilisé-en quand la guest house est pleine.'
                              : 'Aucune chambre dans ce bâtiment.'}
                          </p>
                        ) : (
                          <div className="guest-house-room-grid">
                            {groupedRooms
                              .sort((a, b) => {
                                if (isKimpeseGroup) {
                                  return roomDisplayName(a.room).localeCompare(roomDisplayName(b.room), 'fr');
                                }
                                return a.room.roomNumber.localeCompare(b.room.roomNumber, 'fr', { numeric: true });
                              })
                              .map(({ room, status, linkedReservation }) => {
                                const menuItems = [
                                  {
                                    id: 'history',
                                    label: 'Historique',
                                    icon: 'view' as const,
                                    onClick: () => openHistory(room),
                                  },
                                  ...(canEdit ? [{
                                    id: 'edit',
                                    label: 'Modifier',
                                    icon: 'edit' as const,
                                    onClick: () => openRoomEdit(room),
                                  }] : []),
                                  ...(canDelete ? [{
                                    id: 'delete',
                                    label: 'Supprimer',
                                    icon: 'delete' as const,
                                    danger: true,
                                    onClick: () => { void removeRoom(room); },
                                  }] : []),
                                ];
                                return (
                                <article key={room.id} className={`guest-house-room-card is-${status}`}>
                                  <div className="guest-house-room-card-top">
                                    <div>
                                      <strong className="guest-house-room-number">
                                        {roomDisplayName(room)}
                                      </strong>
                                      <div className="guest-house-room-status">
                                        {status === 'occupied' ? 'Occupé' : status === 'reserved' ? 'Réservé' : 'Vide'}
                                      </div>
                                    </div>
                                    <CardActionMenu
                                      ariaLabel={`Actions ${roomDisplayName(room)}`}
                                      items={menuItems}
                                    />
                                  </div>
                                  <div className="guest-house-room-meta">
                                    <span>
                                      {isKimpeseRoom(room)
                                        ? 'Overflow · hôtel externe'
                                        : (room.characteristics || room.templateLabel || 'Aucune caractéristique')}
                                    </span>
                                    {linkedReservation ? (
                                      <span>
                                        {linkedReservation.personName}
                                        {linkedReservation.startDate ? ` · ${formatDate(linkedReservation.startDate)}` : ''}
                                      </span>
                                    ) : (
                                      <span>Aucune réservation active</span>
                                    )}
                                  </div>
                                </article>
                                );
                              })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {kpiModalContent && (
          <DashboardListModal
            title={kpiModalContent.title}
            columns={kpiModalContent.columns}
            rows={kpiModalContent.rows}
            onClose={() => setKpiModal(null)}
          />
        )}

        <SideDrawer
          open={drawer === 'room'}
          title={
            editingRoom
              ? (isKimpeseRoom(editingRoom) ? 'Modifier l’hôtel Kimpese' : 'Modifier la chambre')
              : (roomForm.category === 'kimpese' ? 'Nouvel hôtel Kimpese' : 'Nouvelle chambre')
          }
          onClose={() => setDrawer(null)}
        >
          {!editingRoom && (
            <div className="form-group">
              <label htmlFor="gh-category">Catégorie</label>
              <select
                id="gh-category"
                value={roomForm.category}
                onChange={(e) => {
                  const category = e.target.value as GuestRoomCategory;
                  setRoomForm((prev) => ({
                    ...prev,
                    category,
                    building: category === 'kimpese' ? KIMPESE_BUILDING : (prev.building === KIMPESE_BUILDING ? 'Batiment #1' : prev.building),
                  }));
                }}
              >
                <option value="standard">Chambre guest house</option>
                <option value="kimpese">Kimpese (hôtel externe)</option>
              </select>
            </div>
          )}
          {roomForm.category === 'kimpese' ? (
            <div className="form-group">
              <label htmlFor="gh-hotel-name">Nom de l’hôtel (texte libre)</label>
              <input
                id="gh-hotel-name"
                value={roomForm.hotelName}
                onChange={(e) => setRoomForm((prev) => ({
                  ...prev,
                  hotelName: e.target.value,
                  roomName: e.target.value,
                }))}
                placeholder="Ex. Hôtel Auberge du Centre"
                required
              />
              <p className="text-muted" style={{ marginTop: '0.35rem', fontSize: '0.78rem' }}>
                Utilisé quand la guest house est pleine — débordement Kimpese.
              </p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="gh-room-number">N° chambre</label>
                <input
                  id="gh-room-number"
                  value={roomForm.roomNumber}
                  onChange={(e) => setRoomForm((prev) => ({ ...prev, roomNumber: e.target.value }))}
                  placeholder="Ex. 3 ou VIP"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="gh-room-name">Nom (template)</label>
                <input
                  id="gh-room-name"
                  value={roomForm.roomName}
                  onChange={(e) => setRoomForm((prev) => ({ ...prev, roomName: e.target.value }))}
                  placeholder="Ex. MALANGA"
                />
              </div>
              <div className="form-group">
                <label htmlFor="gh-building">Lieu / Bâtiment</label>
                <select
                  id="gh-building"
                  value={roomForm.building}
                  onChange={(e) => setRoomForm((prev) => ({ ...prev, building: e.target.value }))}
                  required
                >
                  <option value="Batiment #1">Batiment #1</option>
                  <option value="Batiment #2">Batiment #2</option>
                </select>
              </div>
            </>
          )}
          <div className="form-group">
            <label htmlFor="gh-characteristics">Caractéristique</label>
            <textarea
              id="gh-characteristics"
              rows={3}
              value={roomForm.characteristics}
              onChange={(e) => setRoomForm((prev) => ({ ...prev, characteristics: e.target.value }))}
              placeholder="Lit double, clim, vue jardin…"
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-room-notes">Notes</label>
            <textarea
              id="gh-room-notes"
              rows={2}
              value={roomForm.notes}
              onChange={(e) => setRoomForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveRoom()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </SideDrawer>

        <SideDrawer
          open={drawer === 'reservation'}
          title={editingReservation ? `Modifier ${editingReservation.numero}` : 'Nouvelle réservation'}
          onClose={() => {
            setDrawer(null);
            setEditingReservation(null);
          }}
        >
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={reservationForm.isAgent}
                onChange={(e) => setReservationForm((prev) => ({
                  ...prev,
                  isAgent: e.target.checked,
                  matricule: e.target.checked ? prev.matricule : '',
                }))}
              />
              {' '}Agent PPC (suggestions employés)
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="gh-person">Personne</label>
            {reservationForm.isAgent ? (
              <EmployeeSuggestInput
                id="gh-person"
                employees={employees}
                value={reservationForm.personName}
                onChange={(value) => setReservationForm((prev) => ({ ...prev, personName: value }))}
                onEmployeeSelect={(employee) => setReservationForm((prev) => ({
                  ...prev,
                  personName: employee.nom,
                  matricule: employee.matricule,
                  isAgent: true,
                }))}
                placeholder="Rechercher un agent…"
                required
              />
            ) : (
              <input
                id="gh-person"
                value={reservationForm.personName}
                onChange={(e) => setReservationForm((prev) => ({ ...prev, personName: e.target.value }))}
                required
              />
            )}
          </div>
          {reservationForm.isAgent && (
            <div className="form-group">
              <label htmlFor="gh-matricule">Matricule</label>
              <input id="gh-matricule" value={reservationForm.matricule} readOnly />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="gh-motif">Motif</label>
            <input
              id="gh-motif"
              value={reservationForm.motif}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, motif: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-start">Date début</label>
            <input
              id="gh-start"
              type="date"
              value={reservationForm.startDate}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, startDate: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-end">Date fin</label>
            <input
              id="gh-end"
              type="date"
              value={reservationForm.endDate}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, endDate: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-notes">Notes</label>
            <textarea
              id="gh-notes"
              rows={2}
              value={reservationForm.notes}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-company">Société / organisme</label>
            <input
              id="gh-company"
              value={reservationForm.company}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, company: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-mission">Mission</label>
            <input
              id="gh-mission"
              value={reservationForm.mission}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, mission: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-phone">Téléphone</label>
            <input
              id="gh-phone"
              value={reservationForm.phone}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-email">Email</label>
            <input
              id="gh-email"
              type="email"
              value={reservationForm.email}
              onChange={(e) => setReservationForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveReservation()}>
            {saving
              ? (editingReservation ? 'Enregistrement…' : 'Création…')
              : (editingReservation ? 'Enregistrer' : 'Créer')}
          </button>
        </SideDrawer>

        {resContextMenu && (
          <RowContextMenu
            x={resContextMenu.x}
            y={resContextMenu.y}
            onClose={() => setResContextMenu(null)}
            items={([
              {
                id: 'edit',
                label: 'Modifier',
                icon: 'edit',
                onClick: () => openReservationEdit(resContextMenu.item),
              },
            ] as ContextMenuItem[])}
          />
        )}

        <SideDrawer
          open={drawer === 'confirm' && Boolean(confirmTarget)}
          title={`Confirmer ${confirmTarget?.numero ?? ''}`}
          onClose={() => {
            setDrawer(null);
            setConfirmTarget(null);
          }}
        >
          {confirmTarget && (
            <>
              <p>
                <strong>{confirmTarget.personName}</strong>
                <br />
                {formatDate(confirmTarget.startDate)} → {formatDate(confirmTarget.endDate)}
              </p>
              <div className="form-group">
                <label htmlFor="gh-confirm-room">Chambre / Hôtel Kimpese</label>
                <select
                  id="gh-confirm-room"
                  value={confirmRoomId}
                  onChange={(e) => setConfirmRoomId(e.target.value)}
                  required
                >
                  <option value="">Sélectionner…</option>
                  <optgroup label="Batiment #1">
                    {rooms.filter((r) => r.building === 'Batiment #1').map((room) => (
                      <option key={room.id} value={room.id}>
                        {roomDisplayName(room)}
                        {room.characteristics ? ` · ${room.characteristics}` : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Batiment #2">
                    {rooms.filter((r) => r.building === 'Batiment #2').map((room) => (
                      <option key={room.id} value={room.id}>
                        {roomDisplayName(room)}
                        {room.characteristics ? ` · ${room.characteristics}` : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Kimpese (hôtels externes)">
                    {rooms.filter(isKimpeseRoom).map((room) => (
                      <option key={room.id} value={room.id}>
                        {roomDisplayName(room)}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <p className="text-muted" style={{ marginTop: '0.35rem', fontSize: '0.78rem' }}>
                  Si aucune chambre libre : attribuez un hôtel Kimpese (créer l’entrée si besoin).
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                disabled={saving || !confirmRoomId}
                onClick={() => void setStatus(confirmTarget, 'confirmed', confirmRoomId)}
              >
                <IconCheck size={14} />
                {saving ? 'Confirmation…' : 'Confirmer la réservation'}
              </button>
            </>
          )}
        </SideDrawer>

        <SideDrawer
          open={drawer === 'history' && Boolean(historyRoom)}
          title={`Historique — ${historyRoom ? roomDisplayName(historyRoom) : ''}`}
          onClose={() => {
            setDrawer(null);
            setHistoryRoom(null);
            setHistoryOpenMonths([]);
          }}
        >
          {historyRoom && (
            <>
              <p className="text-muted guest-house-history-intro">
                {historyRoom.building}
                {historyRoom.characteristics ? ` · ${historyRoom.characteristics}` : ''}
                {isKimpeseRoom(historyRoom) ? ' · overflow' : ''}
              </p>
              {roomPassagesByMonth.length === 0 ? (
                <p className="text-muted">Aucun passage enregistré pour cette chambre.</p>
              ) : (
                <div className="guest-house-history-list">
                  {roomPassagesByMonth.map((group) => {
                    const isOpen = historyOpenMonths.includes(group.key);
                    return (
                      <section
                        key={group.key}
                        className={`guest-house-history-month${isOpen ? ' is-open' : ''}`}
                      >
                        <button
                          type="button"
                          className="guest-house-history-month-toggle"
                          aria-expanded={isOpen}
                          onClick={() => toggleHistoryMonth(group.key)}
                        >
                          <span className="guest-house-history-month-label">
                            <span className="guest-house-history-month-chevron" aria-hidden>
                              <IconChevron size={14} />
                            </span>
                            {group.label}
                          </span>
                          <span className="guest-house-history-month-count">
                            {group.items.length} séjour{group.items.length > 1 ? 's' : ''}
                          </span>
                        </button>
                        <div className="guest-house-history-month-panel">
                          <div className="guest-house-history-month-items">
                            {group.items.map((passage) => {
                              const motifSub = personMotifSubtitle(passage.motif);
                              const days = stayDayCount(passage.startDate, passage.endDate);
                              return (
                                <article key={passage.id} className="guest-house-history-item">
                                  <div className="guest-house-history-item-head">
                                    <strong>{passage.personName}</strong>
                                    <span className="guest-house-history-ref">{passage.numero}</span>
                                  </div>
                                  {motifSub && (
                                    <div className="guest-house-history-motif text-muted">{motifSub}</div>
                                  )}
                                  <div className="guest-house-history-period">
                                    <span>
                                      {formatDate(passage.startDate)} → {formatDate(passage.endDate)}
                                    </span>
                                    {days > 0 && (
                                      <span className="guest-house-days-left">{days} j</span>
                                    )}
                                  </div>
                                  <div className="guest-house-history-meta">
                                    <span>Entrée {formatDate(passage.checkedInAt)}</span>
                                    <span className="guest-house-history-meta-sep" aria-hidden>·</span>
                                    <span>
                                      {passage.checkedOutAt
                                        ? `Sortie ${formatDate(passage.checkedOutAt)}`
                                        : 'Séjour en cours'}
                                    </span>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </SideDrawer>
      </div>
    </PermissionGate>
  );
}
