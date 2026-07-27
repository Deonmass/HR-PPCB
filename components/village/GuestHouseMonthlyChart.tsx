'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GuestHouseMonthlyPoint } from '@/lib/guest-house-types';

interface Props {
  years: number[];
  monthlyByYear: Record<number, GuestHouseMonthlyPoint[]>;
}

const MONTH_SHORT: Record<number, string> = {
  1: 'Jan',
  2: 'Fév',
  3: 'Mar',
  4: 'Avr',
  5: 'Mai',
  6: 'Jun',
  7: 'Jul',
  8: 'Aoû',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Déc',
};

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export default function GuestHouseMonthlyChart({ years, monthlyByYear }: Props) {
  const yearOptions = useMemo(() => {
    const list = (Array.isArray(years) ? years : [])
      .map((y) => safeNum(y, NaN))
      .filter((y) => Number.isFinite(y));
    const current = new Date().getFullYear();
    if (list.length === 0) return [current];
    return [...new Set(list)].sort((a, b) => b - a);
  }, [years]);

  const [year, setYear] = useState(yearOptions[0]);
  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all');
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!yearOptions.includes(year)) {
      setYear(yearOptions[0]);
      setMonthFilter('all');
    }
  }, [yearOptions, year]);

  const yearPoints = useMemo(() => {
    const byYear = monthlyByYear ?? {};
    const direct = byYear[year] ?? byYear[String(year) as unknown as number];
    if (Array.isArray(direct) && direct.length > 0) return direct;
    return [];
  }, [monthlyByYear, year]);

  const points = useMemo(() => {
    if (monthFilter === 'all') return yearPoints;
    return yearPoints.filter((item) => item.month === monthFilter);
  }, [yearPoints, monthFilter]);

  const maxReservations = useMemo(() => {
    if (points.length === 0) return 1;
    return Math.max(1, ...points.map((item) => safeNum(item.reservations)));
  }, [points]);

  const bars = useMemo(() => points.map((item) => {
    const reservations = safeNum(item.reservations);
    const approved = Math.min(safeNum(item.approved), reservations);
    const heightPct = reservations > 0
      ? Math.max((reservations / maxReservations) * 100, 12)
      : 0;
    const approvedPct = pct(approved, reservations);
    return {
      ...item,
      reservations,
      approved,
      heightPct,
      approvedPct,
    };
  }), [points, maxReservations]);

  return (
    <div className="panel panel-padded guest-house-chart-panel">
      <div className="guest-house-chart-head">
        <h3>Évolution mensuelle</h3>
        <div className="guest-house-chart-filters">
          <label>
            Année
            <select
              className="filter-select"
              value={String(year)}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setMonthFilter('all');
              }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Mois
            <select
              className="filter-select"
              value={monthFilter === 'all' ? 'all' : String(monthFilter)}
              onChange={(e) => {
                const value = e.target.value;
                setMonthFilter(value === 'all' ? 'all' : Number(value));
              }}
            >
              <option value="all">Tous (jan–déc)</option>
              {yearPoints.map((item) => (
                <option key={item.key} value={String(item.month)}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="guest-house-chart-legend">
        <span className="is-reservations">Réservations du mois</span>
        <span className="is-occupied">Approuvées / occupées</span>
      </div>

      {bars.length === 0 ? (
        <div className="guest-house-chart-empty">
          Aucune donnée pour cette période.
        </div>
      ) : (
        <div className="guest-house-histo-wrap">
          <div
            className="guest-house-histo"
            style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
          >
            {bars.map((item, index) => (
              <div
                key={item.key}
                className={`guest-house-histo-col${hover === index ? ' is-active' : ''}`}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="guest-house-histo-track">
                  {item.reservations > 0 ? (
                    <div
                      className="guest-house-histo-shell"
                      style={{ height: `${item.heightPct}%` }}
                      title={`${item.reservations} réservation(s)`}
                    >
                      <div
                        className="guest-house-histo-fill"
                        style={{ height: `${item.approvedPct}%` }}
                        title={`${item.approved} approuvée(s)`}
                      >
                        {item.approvedPct >= 18 && (
                          <span>{item.approvedPct}%</span>
                        )}
                      </div>
                      {item.approvedPct < 82 && (
                        <span className="guest-house-histo-shell-label">
                          {item.reservations}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="guest-house-histo-zero" />
                  )}

                  {hover === index && (
                    <div className="guest-house-histo-bubble" role="tooltip">
                      <strong>{item.label} {year}</strong>
                      <div className="guest-house-histo-bubble-row is-reservations">
                        <span>Réservations</span>
                        <em>{item.reservations}</em>
                      </div>
                      <div className="guest-house-histo-bubble-row is-occupied">
                        <span>Approuvées / occupées</span>
                        <em>{item.approved}</em>
                      </div>
                      <div className="guest-house-histo-bubble-row is-muted">
                        <span>Taux d’approbation</span>
                        <em>{item.approvedPct}%</em>
                      </div>
                      <p className="guest-house-histo-bubble-note">
                        Sur {item.reservations} réservation{item.reservations > 1 ? 's' : ''},{' '}
                        {item.approved} ont été approuvée{item.approved > 1 ? 's' : ''} et
                        occupée{item.approved > 1 ? 's' : ''}.
                      </p>
                    </div>
                  )}
                </div>
                <span className="guest-house-chart-label">
                  {MONTH_SHORT[item.month] ?? item.label.slice(0, 3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
