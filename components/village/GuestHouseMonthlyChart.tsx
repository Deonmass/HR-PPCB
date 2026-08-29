'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatRate, ratioToRate } from '@/lib/format-rate';
import type { GuestHouseMonthlyPoint } from '@/lib/guest-house-types';

interface Props {
  years: number[];
  monthlyByYear: Record<number, GuestHouseMonthlyPoint[]>;
  /** YYYY-MM — highlights that month’s bar in red; also syncs chart year. */
  selectedMonthKey?: string;
  /** Fired when a month bar is clicked (YYYY-MM for chart year + that month). */
  onBarClick?: (monthKey: string) => void;
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

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const Y_TICKS = [100, 75, 50, 25, 0] as const;

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function emptyYearPoints(year: number): GuestHouseMonthlyPoint[] {
  return MONTH_LABELS.map((label, index) => {
    const month = index + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    return {
      key: `${year}-${String(month).padStart(2, '0')}`,
      month,
      label,
      reservations: 0,
      approved: 0,
      nights: 0,
      daysInMonth,
      capacityNights: 0,
      occupancyRate: 0,
      kimpese: 0,
    };
  });
}

export default function GuestHouseMonthlyChart({
  years,
  monthlyByYear,
  selectedMonthKey,
  onBarClick,
}: Props) {
  const yearOptions = useMemo(() => {
    const list = (Array.isArray(years) ? years : [])
      .map((y) => safeNum(y, NaN))
      .filter((y) => Number.isFinite(y));
    const current = new Date().getFullYear();
    if (list.length === 0) return [current];
    return [...new Set(list)].sort((a, b) => b - a);
  }, [years]);

  const [year, setYear] = useState(yearOptions[0]);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!yearOptions.includes(year)) {
      setYear(yearOptions[0]);
    }
  }, [yearOptions, year]);

  useEffect(() => {
    if (!selectedMonthKey) return;
    const match = /^(\d{4})-(\d{2})$/.exec(selectedMonthKey);
    if (!match) return;
    const y = Number(match[1]);
    if (!Number.isFinite(y)) return;
    if (yearOptions.includes(y)) setYear(y);
  }, [selectedMonthKey, yearOptions]);

  const yearPoints = useMemo(() => {
    const byYear = monthlyByYear ?? {};
    const direct = byYear[year] ?? byYear[String(year) as unknown as number];
    const source = Array.isArray(direct) ? direct : [];
    const byMonth = new Map(source.map((item) => [item.month, item]));
    return emptyYearPoints(year).map((fallback) => {
      const item = byMonth.get(fallback.month);
      if (!item) return fallback;
      const nights = safeNum(item.nights, 0);
      const daysInMonth = safeNum(item.daysInMonth, fallback.daysInMonth);
      const capacityNights = safeNum(item.capacityNights, 0);
      const rateFromCapacity = capacityNights > 0
        ? ratioToRate(nights, capacityNights)
        : 0;
      return {
        ...fallback,
        ...item,
        nights,
        daysInMonth,
        capacityNights,
        occupancyRate: safeNum(item.occupancyRate, rateFromCapacity),
        reservations: safeNum(item.reservations, 0),
        approved: safeNum(item.approved, 0),
        kimpese: safeNum(item.kimpese, 0),
      };
    });
  }, [monthlyByYear, year]);

  const bars = useMemo(() => yearPoints.map((item) => {
    const rate = Math.max(0, Math.min(100, safeNum(item.occupancyRate)));
    const heightPct = rate;
    const selected = Boolean(selectedMonthKey && item.key === selectedMonthKey);
    return { ...item, rate, heightPct, selected };
  }), [yearPoints, selectedMonthKey]);

  return (
    <div className="panel panel-padded guest-house-chart-panel">
      <div className="guest-house-chart-head">
        <div>
          <h3>Évolution mensuelle</h3>
          <p className="text-muted guest-house-chart-sub">
            Taux d&apos;occupation · 12 mois · {year}
          </p>
        </div>
        <div className="guest-house-chart-filters">
          <label>
            Année
            <select
              className="filter-select"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="guest-house-chart-legend">
        <span className="is-occupied">Taux d&apos;occupation (%)</span>
        <span className="is-selected-month">Mois sélectionné</span>
      </div>

      <div className="guest-house-histo-wrap">
        <div className="guest-house-histo-y" aria-hidden="true">
          {Y_TICKS.map((tick) => (
            <span key={tick}>{tick}%</span>
          ))}
        </div>
        <div
          className="guest-house-histo"
          style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
        >
          <div className="guest-house-histo-gridlines" aria-hidden="true">
            {Y_TICKS.map((tick) => (
              <span key={tick} style={{ bottom: `${tick}%` }} />
            ))}
          </div>
          {bars.map((item, index) => {
            const nights = safeNum(item.nights);
            const capacity = safeNum(item.capacityNights);
            const days = safeNum(item.daysInMonth);
            const denom = capacity > 0 ? capacity : days;
            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                className={[
                  'guest-house-histo-col',
                  hover === index ? 'is-active' : '',
                  item.selected ? 'is-selected' : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onBarClick?.(item.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onBarClick?.(item.key);
                  }
                }}
              >
                <div className="guest-house-histo-track">
                  {item.rate > 0 ? (
                    <div
                      className={`guest-house-histo-shell is-occupancy${item.selected ? ' is-selected' : ''}`}
                      style={{ height: `${item.heightPct}%` }}
                      title={`${formatRate(item.rate)}`}
                    >
                      <span className="guest-house-histo-tip">
                        {formatRate(item.rate)}
                      </span>
                      <div
                        className={`guest-house-histo-fill is-occupancy${item.selected ? ' is-selected' : ''}`}
                        style={{ height: '100%' }}
                      />
                    </div>
                  ) : (
                    <div className={`guest-house-histo-zero${item.selected ? ' is-selected' : ''}`} />
                  )}

                  {hover === index && (
                    <div className="guest-house-histo-bubble" role="tooltip">
                      <strong>{item.label} {year}</strong>
                      <div className="guest-house-histo-bubble-row is-occupied">
                        <span>Taux d&apos;occupation</span>
                        <em>{formatRate(item.rate)}</em>
                      </div>
                      <div className="guest-house-histo-bubble-row is-muted">
                        <span>Occupation</span>
                        <em>{nights} / {denom || '—'} j</em>
                      </div>
                      <p className="guest-house-histo-bubble-note">
                        Nuits-chambre / (chambres × {days || '—'} j) × 100.
                        {onBarClick ? ' Cliquez pour le détail par chambre.' : ''}
                      </p>
                    </div>
                  )}
                </div>
                <span className="guest-house-chart-label">
                  {MONTH_SHORT[item.month] ?? item.label.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
