'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import SideDrawer from '@/components/SideDrawer';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import GuestHouseMonthlyChart from '@/components/village/GuestHouseMonthlyChart';
import { usePermissions } from '@/contexts/PermissionContext';
import type {
  GuestHouseDashboard,
  GuestReservation,
  GuestRoom,
  GuestRoomPassage,
} from '@/lib/guest-house-types';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

type Tab = 'dashboard' | 'reservations' | 'rooms';
type DrawerKind = 'room' | 'reservation' | 'confirm' | 'history';
type KpiModal = 'rooms' | 'occupied' | 'empty' | 'pending' | null;
type ValidatedSubTab = 'approved' | 'rejected';

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

function IconHistory({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...iconProps}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 3 3 9 9 9" />
      <path d="M12 7v5l3 2" />
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

async function downloadGuestHouseExport(): Promise<void> {
  const response = await fetch('/api/village/guest-house/export');
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
  const filename = filenameMatch?.[1] ?? 'VILLAGE_GUEST_HOUSE.xlsx';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [confirmTarget, setConfirmTarget] = useState<GuestReservation | null>(null);
  const [historyRoom, setHistoryRoom] = useState<GuestRoom | null>(null);
  const [kpiModal, setKpiModal] = useState<KpiModal>(null);
  const [validatedSubTab, setValidatedSubTab] = useState<ValidatedSubTab>('approved');

  const [roomForm, setRoomForm] = useState({ roomNumber: '', building: '', characteristics: '' });
  const [reservationForm, setReservationForm] = useState({
    personName: '',
    matricule: '',
    isAgent: true,
    motif: '',
    startDate: '',
    endDate: '',
    notes: '',
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

  const pending = useMemo(
    () => reservations.filter((item) => item.status === 'pending'),
    [reservations],
  );
  const approved = useMemo(
    () => reservations.filter((item) => item.status === 'confirmed' || item.status === 'completed'),
    [reservations],
  );
  const rejected = useMemo(
    () => reservations.filter((item) => item.status === 'rejected' || item.status === 'cancelled'),
    [reservations],
  );
  const validatedList = validatedSubTab === 'approved' ? approved : rejected;

  const openRoomCreate = () => {
    setEditingRoom(null);
    setRoomForm({ roomNumber: '', building: '', characteristics: '' });
    setDrawer('room');
  };

  const openRoomEdit = (room: GuestRoom) => {
    setEditingRoom(room);
    setRoomForm({
      roomNumber: room.roomNumber,
      building: room.building,
      characteristics: room.characteristics,
    });
    setDrawer('room');
  };

  const openHistory = (room: GuestRoom) => {
    setHistoryRoom(room);
    setDrawer('history');
  };

  const openReservationCreate = () => {
    setReservationForm({
      personName: '',
      matricule: '',
      isAgent: true,
      motif: '',
      startDate: '',
      endDate: '',
      notes: '',
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
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Enregistrement impossible');
        return;
      }
      setDrawer(null);
      await showSuccess(editingRoom ? 'Chambre mise à jour' : 'Chambre créée');
      await load(true);
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
          ...reservationForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Création impossible');
        return;
      }
      setDrawer(null);
      await showSuccess('Réservation créée');
      setTab('reservations');
      await load(true);
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
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Action impossible');
        return;
      }
      setDrawer(null);
      setConfirmTarget(null);
      await showSuccess(
        status === 'confirmed' ? 'Réservation confirmée' : status === 'rejected' ? 'Réservation refusée' : 'Réservation annulée',
      );
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const removeRoom = async (room: GuestRoom) => {
    if (!(await confirmDelete(`Supprimer la chambre ${room.roomNumber} ?`))) return;
    const res = await fetch('/api/village/guest-house', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: 'room', action: 'delete', id: room.id }),
    });
    const json = await res.json();
    if (!res.ok) {
      await showError(json.error || 'Suppression impossible');
      return;
    }
    await showSuccess('Chambre supprimée');
    await load(true);
  };

  const roomPassages = useMemo(() => {
    if (!historyRoom) return [];
    return passages
      .filter((item) => item.roomId === historyRoom.id)
      .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));
  }, [historyRoom, passages]);

  const kpiModalContent = useMemo(() => {
    if (!dashboard || !kpiModal) return null;
    const reservationColumns: DashboardListColumn[] = [
      { key: 'numero', label: 'N°' },
      { key: 'person', label: 'Personne' },
      { key: 'room', label: 'Chambre' },
      { key: 'start', label: 'Début' },
      { key: 'end', label: 'Fin' },
      { key: 'status', label: 'Statut' },
    ];
    const roomColumns: DashboardListColumn[] = [
      { key: 'number', label: 'N° chambre' },
      { key: 'building', label: 'Bâtiment' },
      { key: 'characteristics', label: 'Caractéristique' },
    ];
    const mapReservation = (item: GuestReservation): DashboardListRow => ({
      id: item.id,
      cells: {
        numero: item.numero,
        person: item.personName,
        room: item.roomId ? roomsById.get(item.roomId)?.roomNumber ?? '—' : '—',
        start: formatDate(item.startDate),
        end: formatDate(item.endDate),
        status: statusLabel(item.status),
      },
    });
    const mapRoom = (room: GuestRoom): DashboardListRow => ({
      id: room.id,
      cells: {
        number: room.roomNumber,
        building: room.building,
        characteristics: room.characteristics || '—',
      },
    });

    if (kpiModal === 'rooms') {
      return {
        title: 'Toutes les chambres',
        columns: roomColumns,
        rows: rooms.map(mapRoom),
      };
    }
    if (kpiModal === 'occupied') {
      return {
        title: 'Chambres occupées',
        columns: reservationColumns,
        rows: (dashboard.occupiedReservations ?? []).map(mapReservation),
      };
    }
    if (kpiModal === 'empty') {
      return {
        title: 'Chambres vides',
        columns: roomColumns,
        rows: (dashboard.emptyRooms ?? []).map(mapRoom),
      };
    }
    return {
      title: 'Réservations en attente',
      columns: reservationColumns,
      rows: pending.map(mapReservation),
    };
  }, [dashboard, kpiModal, rooms, roomsById, pending]);

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
              <p>Réservations et gestion des chambres</p>
            </div>
            <div className="guest-house-header-actions">
              <div className="tabs header-tabs header-tabs-dashboard header-tabs-compact">
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm tab-btn-icon tab-btn-dashboard${tab === 'dashboard' ? ' active' : ''}`}
                  onClick={() => setTab('dashboard')}
                >
                  <IconDashboard size={16} />
                  Dashboard
                </button>
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm tab-btn-icon tab-btn-dashboard${tab === 'reservations' ? ' active' : ''}`}
                  onClick={() => setTab('reservations')}
                >
                  <IconCalendar size={16} />
                  Réservation
                  {pending.length > 0 && <span className="employees-tab-count">{pending.length}</span>}
                </button>
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm tab-btn-icon tab-btn-dashboard${tab === 'rooms' ? ' active' : ''}`}
                  onClick={() => setTab('rooms')}
                >
                  <IconBed size={16} />
                  Chambres
                </button>
              </div>
              {canExport && (
                <button
                  type="button"
                  className="btn btn-secondary btn-with-icon"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await downloadGuestHouseExport();
                    } catch (err) {
                      await showError(err instanceof Error ? err.message : 'Export impossible');
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  {exporting ? <span className="btn-spinner" aria-hidden="true" /> : <IconExport />}
                  {exporting ? 'Export…' : 'Exporter'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`guest-house-body${tab === 'reservations' || tab === 'dashboard' ? ' is-fill' : ''}`}>
          {tab === 'dashboard' && dashboard && (
            <div className="guest-house-dashboard">
              <div className="guest-house-kpi-grid">
                <button
                  type="button"
                  className="card card-glow card-glow-cyan guest-house-kpi-card"
                  onClick={() => setKpiModal('rooms')}
                >
                  <span className="guest-house-kpi-icon"><IconDoor /></span>
                  <div className="card-label">Total chambres</div>
                  <div className="card-value">{dashboard.totalRooms}</div>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-green guest-house-kpi-card"
                  onClick={() => setKpiModal('occupied')}
                >
                  <span className="guest-house-kpi-icon"><IconUsers /></span>
                  <div className="card-label">Occupées</div>
                  <div className="card-value">{dashboard.occupied}</div>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-violet guest-house-kpi-card"
                  onClick={() => setKpiModal('empty')}
                >
                  <span className="guest-house-kpi-icon"><IconEmpty /></span>
                  <div className="card-label">Vides</div>
                  <div className="card-value">{dashboard.empty}</div>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-orange guest-house-kpi-card"
                  onClick={() => setKpiModal('pending')}
                >
                  <span className="guest-house-kpi-icon"><IconClock /></span>
                  <div className="card-label">En attente</div>
                  <div className="card-value">{dashboard.pendingReservations}</div>
                </button>
              </div>

              <GuestHouseMonthlyChart
                years={dashboard.years ?? []}
                monthlyByYear={dashboard.monthlyByYear ?? {}}
              />

              <div className="panel panel-padded guest-house-alerts">
                <h3>Alertes — fin de booking ≤ 7 jours</h3>
                {dashboard.endingSoon.length === 0 ? (
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
                          <th>Chambre</th>
                          <th>Fin</th>
                          <th>Jours restants</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.endingSoon.map((item) => (
                          <tr key={item.id}>
                            <td>{item.numero}</td>
                            <td>{item.personName}</td>
                            <td>{item.roomNumber}</td>
                            <td>{formatDate(item.endDate)}</td>
                            <td>
                              <span className={`guest-house-days-left${item.daysLeft <= 2 ? ' is-critical' : ''}`}>
                                {item.daysLeft} j
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
          )}

          {tab === 'reservations' && (
            <div className="guest-house-reservations-layout">
              <div className="panel panel-padded guest-house-panel-fill">
                <div className="guest-house-section-head">
                  <div>
                    <h3>Réservations en attente d’action</h3>
                    <p className="text-muted">{pending.length} demande(s)</p>
                  </div>
                  {canCreate && (
                    <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={openReservationCreate}>
                      <IconPlus size={13} />
                      Nouvelle réservation
                    </button>
                  )}
                </div>
                {pending.length === 0 ? (
                  <div className="guest-house-panel-empty">
                    <p className="text-muted">Aucune réservation en attente.</p>
                  </div>
                ) : (
                  <div className="table-wrap guest-house-panel-scroll">
                    <table className="data-table">
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
                              <td>{item.motif}</td>
                              <td>
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
                                          Confirmer
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn-sm btn-with-icon"
                                          onClick={() => void setStatus(item, 'rejected')}
                                        >
                                          <IconX size={13} />
                                          Refuser
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
                    <p className="text-muted">Consommation et décisions</p>
                  </div>
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
                {validatedList.length === 0 ? (
                  <div className="guest-house-panel-empty">
                    <p className="text-muted">
                      {validatedSubTab === 'approved' ? 'Aucune réservation approuvée.' : 'Aucune réservation rejetée.'}
                    </p>
                  </div>
                ) : (
                  <div className="table-wrap guest-house-panel-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>N°</th>
                          <th>Personne</th>
                          <th>Chambre</th>
                          <th>Période</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validatedList.map((item) => (
                          <tr key={item.id}>
                            <td>{item.numero}</td>
                            <td>
                              <div className="guest-house-person-cell">
                                <strong>{item.personName}</strong>
                                {item.motif && <span className="text-muted">{item.motif}</span>}
                              </div>
                            </td>
                            <td>{item.roomId ? roomsById.get(item.roomId)?.roomNumber ?? '—' : '—'}</td>
                            <td>
                              {formatDate(item.startDate)} → {formatDate(item.endDate)}
                            </td>
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
          )}

          {tab === 'rooms' && (
            <div className="panel panel-padded">
              <div className="guest-house-section-head">
                <div>
                  <h3>Chambres</h3>
                  <p className="text-muted">{rooms.length} chambre(s) · historique des passages</p>
                </div>
                {canCreate && (
                  <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={openRoomCreate}>
                    <IconPlus size={14} />
                    Ajouter une chambre
                  </button>
                )}
              </div>
              {rooms.length === 0 ? (
                <p className="text-muted">Aucune chambre enregistrée.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>N° chambre</th>
                        <th>Bâtiment</th>
                        <th>Caractéristique</th>
                        <th>Passages</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map((room, index) => {
                        const count = passages.filter((item) => item.roomId === room.id).length;
                        return (
                          <tr key={room.id}>
                            <td>{index + 1}</td>
                            <td>{room.roomNumber}</td>
                            <td>{room.building}</td>
                            <td>{room.characteristics || '—'}</td>
                            <td>{count}</td>
                            <td>
                              <div className="guest-house-row-actions">
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm btn-with-icon"
                                  onClick={() => openHistory(room)}
                                >
                                  <IconHistory size={13} />
                                  Historique
                                </button>
                                {canEdit && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => openRoomEdit(room)}
                                  >
                                    Modifier
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm btn-danger-text"
                                    onClick={() => void removeRoom(room)}
                                  >
                                    Supprimer
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
          title={editingRoom ? 'Modifier la chambre' : 'Nouvelle chambre'}
          onClose={() => setDrawer(null)}
        >
          <div className="form-group">
            <label htmlFor="gh-room-number">N° chambre</label>
            <input
              id="gh-room-number"
              value={roomForm.roomNumber}
              onChange={(e) => setRoomForm((prev) => ({ ...prev, roomNumber: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="gh-building">Bâtiment</label>
            <input
              id="gh-building"
              value={roomForm.building}
              onChange={(e) => setRoomForm((prev) => ({ ...prev, building: e.target.value }))}
              required
            />
          </div>
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
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveRoom()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </SideDrawer>

        <SideDrawer
          open={drawer === 'reservation'}
          title="Nouvelle réservation"
          onClose={() => setDrawer(null)}
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
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveReservation()}>
            {saving ? 'Création…' : 'Créer'}
          </button>
        </SideDrawer>

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
                <label htmlFor="gh-confirm-room">Chambre</label>
                <select
                  id="gh-confirm-room"
                  value={confirmRoomId}
                  onChange={(e) => setConfirmRoomId(e.target.value)}
                  required
                >
                  <option value="">Sélectionner…</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.roomNumber} · {room.building}
                      {room.characteristics ? ` · ${room.characteristics}` : ''}
                    </option>
                  ))}
                </select>
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
          title={`Historique — chambre ${historyRoom?.roomNumber ?? ''}`}
          onClose={() => {
            setDrawer(null);
            setHistoryRoom(null);
          }}
        >
          {historyRoom && (
            <>
              <p className="text-muted">
                {historyRoom.building}
                {historyRoom.characteristics ? ` · ${historyRoom.characteristics}` : ''}
              </p>
              {roomPassages.length === 0 ? (
                <p className="text-muted">Aucun passage enregistré pour cette chambre.</p>
              ) : (
                <div className="guest-house-history-list">
                  {roomPassages.map((passage) => (
                    <article key={passage.id} className="guest-house-history-item">
                      <div className="guest-house-history-item-head">
                        <strong>{passage.personName}</strong>
                        <span>{passage.numero}</span>
                      </div>
                      <div className="text-muted">{passage.motif}</div>
                      <div>
                        {formatDate(passage.startDate)} → {formatDate(passage.endDate)}
                      </div>
                      <div className="guest-house-history-meta">
                        <span>Entrée {formatDate(passage.checkedInAt)}</span>
                        <span>
                          {passage.checkedOutAt
                            ? `Sortie ${formatDate(passage.checkedOutAt)}`
                            : 'Séjour en cours'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </SideDrawer>
      </div>
    </PermissionGate>
  );
}
