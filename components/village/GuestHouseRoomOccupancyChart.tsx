'use client';

import { useMemo, useState } from 'react';
import { KIMPESE_BUILDING } from '@/lib/guest-house-types';

export interface RoomOccupancyBar {
  roomId: string;
  label: string;
  building: string;
  isKimpese: boolean;
  nights: number;
  daysInMonth: number;
  rate: number;
}

interface Props {
  monthLabel: string;
  rooms: RoomOccupancyBar[];
}

const GROUPS: Array<{ key: string; title: string }> = [
  { key: 'Batiment #1', title: 'Bâtiment 1' },
  { key: 'Batiment #2', title: 'Bâtiment 2' },
  { key: KIMPESE_BUILDING, title: 'logé ailleurs' },
];

function shortLabel(label: string, isKimpese: boolean): string {
  if (isKimpese) {
    const trimmed = label.replace(/^Kimpese\s*[—–-]\s*/i, '').trim();
    return trimmed.length > 10 ? `${trimmed.slice(0, 9)}…` : (trimmed || label);
  }
  const num = label.split(/\s*[—–-]\s*/)[0]?.trim();
  return num || label.slice(0, 8);
}

export default function GuestHouseRoomOccupancyChart({ monthLabel, rooms }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byBuilding = new Map<string, RoomOccupancyBar[]>();
    for (const room of rooms) {
      const key = room.isKimpese
        ? KIMPESE_BUILDING
        : (room.building === 'Batiment #2' ? 'Batiment #2' : 'Batiment #1');
      const list = byBuilding.get(key) ?? [];
      list.push(room);
      byBuilding.set(key, list);
    }
    return GROUPS.map((group) => {
      const items = [...(byBuilding.get(group.key) ?? [])].sort((a, b) => {
        if (group.key === KIMPESE_BUILDING) return a.label.localeCompare(b.label, 'fr');
        return a.label.localeCompare(b.label, 'fr', { numeric: true });
      });
      return { ...group, items };
    });
  }, [rooms]);

  return (
    <div className="panel panel-padded guest-house-chart-panel guest-house-room-occ-panel">
      <div className="guest-house-chart-head">
        <div>
          <h3>Occupation par chambre</h3>
          <p className="text-muted guest-house-chart-sub">
            % d&apos;occupation · {monthLabel} · Bât.1 / Bât.2 / logé ailleurs
          </p>
        </div>
      </div>

      <div className="guest-house-room-occ-groups">
        {grouped.map((group) => {
          const isElsewhere = group.key === KIMPESE_BUILDING;
          return (
            <div
              key={group.key}
              className={`guest-house-room-occ-group${isElsewhere ? ' is-elsewhere' : ''}`}
            >
              <div className="guest-house-room-occ-group-title">{group.title}</div>
              {group.items.length === 0 ? (
                <p className="text-muted guest-house-room-occ-empty">Aucune entrée</p>
              ) : (
                <div
                  className="guest-house-room-occ-histo"
                  style={{ gridTemplateColumns: `repeat(${Math.max(group.items.length, 1)}, minmax(0, 1fr))` }}
                >
                  {group.items.map((item) => {
                    const rate = Math.max(0, Math.min(100, item.rate));
                    const heightPct = rate;
                    const active = hover === item.roomId;
                    return (
                      <div
                        key={item.roomId}
                        className={`guest-house-room-occ-col${active ? ' is-active' : ''}`}
                        onMouseEnter={() => setHover(item.roomId)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <div className="guest-house-histo-track guest-house-room-occ-track">
                          {rate > 0 ? (
                            <div
                              className={`guest-house-histo-shell is-occupancy${isElsewhere ? ' is-elsewhere' : ''}`}
                              style={{ height: `${heightPct}%` }}
                              title={`${item.label} · ${rate}%`}
                            >
                              <span className="guest-house-histo-tip">
                                {rate}%
                              </span>
                              <div
                                className={`guest-house-histo-fill is-occupancy${isElsewhere ? ' is-elsewhere' : ''}`}
                                style={{ height: '100%' }}
                              />
                            </div>
                          ) : (
                            <div className="guest-house-histo-zero" />
                          )}
                          {active && (
                            <div className="guest-house-histo-bubble" role="tooltip">
                              <strong>{item.label}</strong>
                              <div className="guest-house-histo-bubble-row is-occupied">
                                <span>Occupation</span>
                                <em>{rate}%</em>
                              </div>
                              <div className="guest-house-histo-bubble-row is-muted">
                                <span>Jours</span>
                                <em>{item.nights} / {item.daysInMonth} j</em>
                              </div>
                            </div>
                          )}
                        </div>
                        <span className="guest-house-chart-label" title={item.label}>
                          {shortLabel(item.label, item.isKimpese)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
