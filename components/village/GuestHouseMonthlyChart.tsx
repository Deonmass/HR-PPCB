'use client';

import { useMemo, useState } from 'react';
import type { GuestHouseDashboard } from '@/lib/guest-house-types';

interface Props {
  monthly: GuestHouseDashboard['monthly'];
}

export default function GuestHouseMonthlyChart({ monthly }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(
    () => Math.max(
      1,
      ...monthly.map((item) => Math.max(item.reservations, item.occupiedDays, item.emptyDays)),
    ),
    [monthly],
  );

  return (
    <div className="panel panel-padded guest-house-chart-panel">
      <div className="guest-house-chart-head">
        <h3>Évolution mensuelle</h3>
        <div className="guest-house-chart-legend">
          <span className="is-reservations">Réservations</span>
          <span className="is-occupied">Occupation (jours-chambre)</span>
          <span className="is-empty">Non occupation</span>
        </div>
      </div>
      <div className="guest-house-chart-bars">
        {monthly.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={`guest-house-chart-col${hover === index ? ' is-active' : ''}`}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
          >
            <div className="guest-house-chart-stack">
              <span
                className="guest-house-bar is-reservations"
                style={{ height: `${(item.reservations / max) * 100}%` }}
                title={`${item.reservations} réservations`}
              />
              <span
                className="guest-house-bar is-occupied"
                style={{ height: `${(item.occupiedDays / max) * 100}%` }}
                title={`${item.occupiedDays} jours occupés`}
              />
              <span
                className="guest-house-bar is-empty"
                style={{ height: `${(item.emptyDays / max) * 100}%` }}
                title={`${item.emptyDays} jours vides`}
              />
            </div>
            <span className="guest-house-chart-label">{item.label}</span>
          </button>
        ))}
      </div>
      {hover != null && monthly[hover] && (
        <div className="guest-house-chart-tooltip">
          <strong>{monthly[hover].label}</strong>
          <span>{monthly[hover].reservations} réservation(s)</span>
          <span>{monthly[hover].occupiedDays} jour(s)-chambre occupés</span>
          <span>{monthly[hover].emptyDays} jour(s)-chambre vides</span>
        </div>
      )}
    </div>
  );
}
