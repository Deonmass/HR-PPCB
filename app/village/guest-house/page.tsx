'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@/lib/guest-house-types';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

type Tab = 'dashboard' | 'reservations' | 'rooms';
type DrawerKind = 'room' | 'reservation' | 'confirm';

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

export default function VillageGuestHousePage() {
  const { can } = usePermissions();
  const canCreate = can('village.guest-house', 'create');
  const canEdit = can('village.guest-house', 'edit');
  const canDelete = can('village.guest-house', 'delete');

  const [tab, setTab] = useState<Tab>('dashboard');
  const [rooms, setRooms] = useState<GuestRoom[]>([]);
  const [reservations, setReservations] = useState<GuestReservation[]>([]);
  const [dashboard, setDashboard] = useState<GuestHouseDashboard | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [editingRoom, setEditingRoom] = useState<GuestRoom | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<GuestReservation | null>(null);

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
            <div className="tabs header-tabs header-tabs-dashboard header-tabs-compact">
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === 'dashboard' ? ' active' : ''}`}
                onClick={() => setTab('dashboard')}
              >
                Dashboard
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === 'reservations' ? ' active' : ''}`}
                onClick={() => setTab('reservations')}
              >
                Réservation
                {pending.length > 0 && <span className="employees-tab-count">{pending.length}</span>}
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === 'rooms' ? ' active' : ''}`}
                onClick={() => setTab('rooms')}
              >
                Chambres
              </button>
            </div>
          </div>
        </div>

        <div className="guest-house-body">
          {tab === 'dashboard' && dashboard && (
            <div className="guest-house-dashboard">
              <div className="guest-house-kpi-grid">
                <div className="card card-glow card-glow-cyan">
                  <div className="card-label">Total chambres</div>
                  <div className="card-value">{dashboard.totalRooms}</div>
                </div>
                <div className="card card-glow card-glow-green">
                  <div className="card-label">Occupées</div>
                  <div className="card-value">{dashboard.occupied}</div>
                </div>
                <div className="card card-glow card-glow-violet">
                  <div className="card-label">Vides</div>
                  <div className="card-value">{dashboard.empty}</div>
                </div>
                <div className="card card-glow card-glow-orange">
                  <div className="card-label">En attente</div>
                  <div className="card-value">{dashboard.pendingReservations}</div>
                </div>
              </div>

              <div className="panel panel-padded guest-house-alerts">
                <h3>Alertes — fin de booking ≤ 7 jours</h3>
                {dashboard.endingSoon.length === 0 ? (
                  <p className="text-muted">Aucune fin de séjour imminente.</p>
                ) : (
                  <div className="table-wrap">
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

              <GuestHouseMonthlyChart monthly={dashboard.monthly} />
            </div>
          )}

          {tab === 'reservations' && (
            <div className="panel panel-padded">
              <div className="guest-house-section-head">
                <div>
                  <h3>Réservations en attente d’action</h3>
                  <p className="text-muted">{pending.length} demande(s)</p>
                </div>
                {canCreate && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={openReservationCreate}>
                    Nouvelle réservation
                  </button>
                )}
              </div>
              {pending.length === 0 ? (
                <p className="text-muted">Aucune réservation en attente.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>N°</th>
                        <th>Date</th>
                        <th>Personne</th>
                        <th>Motif</th>
                        <th>Début</th>
                        <th>Fin</th>
                        <th>Jours restants</th>
                        {(canEdit || canDelete) && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((item) => {
                        const days = remainingDays(item.endDate);
                        return (
                          <tr key={item.id}>
                            <td>{item.numero}</td>
                            <td>{formatDate(item.createdAt.slice(0, 10))}</td>
                            <td>
                              <div className="guest-house-person-cell">
                                <strong>{item.personName}</strong>
                                {item.isAgent && item.matricule && (
                                  <span className="text-muted">Agent · {item.matricule}</span>
                                )}
                              </div>
                            </td>
                            <td>{item.motif}</td>
                            <td>{formatDate(item.startDate)}</td>
                            <td>{formatDate(item.endDate)}</td>
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
                                        className="btn btn-primary btn-sm"
                                        onClick={() => openConfirm(item)}
                                      >
                                        Confirmer
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => void setStatus(item, 'rejected')}
                                      >
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
          )}

          {tab === 'rooms' && (
            <div className="panel panel-padded">
              <div className="guest-house-section-head">
                <div>
                  <h3>Chambres</h3>
                  <p className="text-muted">{rooms.length} chambre(s)</p>
                </div>
                {canCreate && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={openRoomCreate}>
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
                        {(canEdit || canDelete) && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map((room, index) => (
                        <tr key={room.id}>
                          <td>{index + 1}</td>
                          <td>{room.roomNumber}</td>
                          <td>{room.building}</td>
                          <td>{room.characteristics || '—'}</td>
                          {(canEdit || canDelete) && (
                            <td>
                              <div className="guest-house-row-actions">
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
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

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
                className="btn btn-primary"
                disabled={saving || !confirmRoomId}
                onClick={() => void setStatus(confirmTarget, 'confirmed', confirmRoomId)}
              >
                {saving ? 'Confirmation…' : 'Confirmer la réservation'}
              </button>
            </>
          )}
        </SideDrawer>
      </div>
    </PermissionGate>
  );
}
