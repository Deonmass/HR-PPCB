'use client';

import type { CSSProperties } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import {
  GUEST_HOUSE_BUILDINGS,
  roomDisplayName,
  type GuestReservation,
  type GuestRoom,
} from '@/lib/guest-house-types';

export type MotelRoomStatus = 'occupied' | 'reserved' | 'empty';

export interface MotelRoomItem {
  room: GuestRoom;
  status: MotelRoomStatus;
  linkedReservation: GuestReservation | null;
}

interface Props {
  roomsByBuilding: Record<string, MotelRoomItem[]>;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onCreateRoom?: (building: string) => void;
  onEditRoom: (room: GuestRoom) => void;
  onDeleteRoom: (room: GuestRoom) => void;
  onHistory: (room: GuestRoom) => void;
}

const ONSITE_BUILDINGS = GUEST_HOUSE_BUILDINGS.filter((b) => b !== 'Kimpese');

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value || '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function remainingDays(endDate: string): number {
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((end.getTime() - today.getTime()) / 86_400_000);
}

function formatDaysLeftShort(endDate: string): string {
  const days = remainingDays(endDate);
  if (days < 0) return 'Terminé';
  if (days === 0) return 'Jour J';
  return `${days} j`;
}

function statusLabel(status: MotelRoomStatus): string {
  if (status === 'occupied') return 'Occupé';
  if (status === 'reserved') return 'Réservé';
  return 'Vide';
}

function IconPlus({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconBed({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 18V9a2 2 0 0 1 2-2h6v11" />
      <path d="M11 11h8a2 2 0 0 1 2 2v5" />
      <path d="M3 18h18" />
      <path d="M7 9V7a1 1 0 0 1 1-1h2" />
    </svg>
  );
}

function sortRooms(items: MotelRoomItem[]): MotelRoomItem[] {
  return [...items].sort((a, b) =>
    a.room.roomNumber.localeCompare(b.room.roomNumber, 'fr', { numeric: true }),
  );
}

function roomUnitLabel(room: GuestRoom): string {
  const num = (room.roomNumber || '').trim();
  if (!num) return 'CH.';
  if (/^vip$/i.test(num)) return 'VIP';
  return `CH. ${num}`;
}

export default function GuestHouseMotelView({
  roomsByBuilding,
  canCreate = false,
  canEdit = false,
  canDelete = false,
  onCreateRoom,
  onEditRoom,
  onDeleteRoom,
  onHistory,
}: Props) {
  const buildings = ONSITE_BUILDINGS.map((building) => ({
    building,
    rooms: sortRooms(roomsByBuilding[building] ?? []),
  }));

  const totals = buildings.reduce(
    (acc, block) => {
      for (const item of block.rooms) {
        acc.total += 1;
        if (item.status === 'occupied') acc.occupied += 1;
        else if (item.status === 'reserved') acc.reserved += 1;
        else acc.empty += 1;
      }
      return acc;
    },
    { total: 0, occupied: 0, reserved: 0, empty: 0 },
  );

  return (
    <section className="panel panel-padded guest-house-motel">
      <div className="guest-house-section-head guest-house-motel-head">
        <div>
          <h3>Plan des chambres</h3>
          <p className="text-muted">
            Plan type motel · Bâtiment 1 &amp; 2 · {totals.occupied} occupée(s) · {totals.empty} vide(s)
            {totals.reserved ? ` · ${totals.reserved} réservée(s)` : ''}
          </p>
        </div>
        <div className="guest-house-motel-legend" aria-hidden>
          <span className="guest-house-motel-legend-item is-occupied">Occupé</span>
          <span className="guest-house-motel-legend-item is-reserved">Réservé</span>
          <span className="guest-house-motel-legend-item is-empty">Vide</span>
        </div>
      </div>

      <div className="guest-house-motel-plans">
        {buildings.map(({ building, rooms }, buildingIndex) => {
          const shortLabel = building.replace(/^Batiment\s*#?/i, 'Bâtiment ');
          const occupiedCount = rooms.filter((r) => r.status === 'occupied').length;

          return (
            <article key={building} className="guest-house-floorplan">
              <header className="guest-house-floorplan-head">
                <div>
                  <h4>{shortLabel}</h4>
                  <p>
                    {rooms.length} chambre(s) · {occupiedCount} occupée(s)
                    {buildingIndex === 0 ? ' · étage chambres' : ''}
                  </p>
                </div>
                {canCreate && onCreateRoom ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-with-icon"
                    onClick={() => onCreateRoom(building)}
                    title={`Ajouter une chambre — ${building}`}
                  >
                    <IconPlus size={13} />
                    Chambre
                  </button>
                ) : null}
              </header>

              {rooms.length === 0 ? (
                <p className="text-muted guest-house-motel-empty">Aucune chambre dans ce bâtiment.</p>
              ) : (
                <div className="guest-house-floorplan-scroll">
                  <div
                    className="guest-house-floorplan-strip"
                    style={{ '--gh-room-count': String(Math.max(rooms.length, 1)) } as CSSProperties}
                  >
                    <div className="guest-house-floorplan-corridor" aria-hidden>
                      <span>DÉGAGEMENT</span>
                    </div>

                    <div className="guest-house-floorplan-units" role="list">
                      {rooms.map(({ room, status, linkedReservation }) => {
                        const daysLeft = linkedReservation
                          ? remainingDays(linkedReservation.endDate)
                          : null;
                        const menuItems = [
                          {
                            id: 'history',
                            label: 'Historique',
                            icon: 'view' as const,
                            onClick: () => onHistory(room),
                          },
                          ...(canEdit
                            ? [{
                                id: 'edit',
                                label: 'Modifier',
                                icon: 'edit' as const,
                                onClick: () => onEditRoom(room),
                              }]
                            : []),
                          ...(canDelete
                            ? [{
                                id: 'delete',
                                label: 'Supprimer',
                                icon: 'delete' as const,
                                danger: true,
                                onClick: () => onDeleteRoom(room),
                              }]
                            : []),
                        ];

                        return (
                          <div
                            key={room.id}
                            role="listitem"
                            className={`guest-house-floorplan-unit is-${status}`}
                            title={`${roomDisplayName(room)} — ${statusLabel(status)}`}
                          >
                            <div className="guest-house-floorplan-balcony" aria-hidden>
                              BALCON
                            </div>

                            <div className="guest-house-floorplan-unit-main">
                              <div className="guest-house-floorplan-unit-top">
                                <strong className="guest-house-floorplan-ch-label">
                                  {roomUnitLabel(room)}
                                </strong>
                                <CardActionMenu
                                  ariaLabel={`Actions ${roomDisplayName(room)}`}
                                  items={menuItems}
                                />
                              </div>

                              {room.roomName ? (
                                <div className="guest-house-floorplan-room-name" title={room.roomName}>
                                  {room.roomName}
                                </div>
                              ) : null}

                              <div className="guest-house-floorplan-furnish" aria-hidden>
                                <span className="guest-house-floorplan-bed">
                                  <IconBed size={16} />
                                </span>
                                <span className="guest-house-floorplan-toil">TOIL.</span>
                              </div>

                              {linkedReservation ? (
                                <div className="guest-house-floorplan-info">
                                  <div
                                    className="guest-house-floorplan-occupant"
                                    title={linkedReservation.personName}
                                  >
                                    {linkedReservation.personName}
                                  </div>
                                  <div className="guest-house-floorplan-dates">
                                    {formatDate(linkedReservation.startDate)}
                                    {' → '}
                                    {formatDate(linkedReservation.endDate)}
                                  </div>
                                  <div
                                    className={`guest-house-floorplan-restant${
                                      daysLeft != null && daysLeft <= 2 && daysLeft >= 0
                                        ? ' is-critical'
                                        : ''
                                    }`}
                                  >
                                    {formatDaysLeftShort(linkedReservation.endDate)}
                                  </div>
                                </div>
                              ) : (
                                <div className="guest-house-floorplan-info is-vacant">
                                  <span>{statusLabel(status)}</span>
                                  <span>Libre</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
