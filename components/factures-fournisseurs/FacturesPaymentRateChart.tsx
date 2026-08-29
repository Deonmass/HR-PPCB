'use client';

import { useMemo, useState } from 'react';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { FactureSuivi } from '@/lib/factures-fournisseurs/types';
import { buildFacturesMonthlyTracking } from '@/lib/factures-fournisseurs/utils';

interface Props {
  factures: FactureSuivi[];
  year: number;
}

function formatPct(value: number): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function formatPctAnnotation(value: number): string {
  return `+${Math.round(value)}%`;
}

export default function FacturesPaymentRateChart({ factures, year }: Props) {
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  const monthly = useMemo(
    () => buildFacturesMonthlyTracking(factures, year),
    [factures, year],
  );

  const lineGeometry = useMemo(() => {
    const n = monthly.length;
    const xAt = (i: number) => (n <= 0 ? 50 : ((i + 0.5) / n) * 100);
    const yAt = (pct: number) => 100 - Math.min(100, Math.max(0, pct));

    const points = monthly.map((item, i) => ({
      ...item,
      x: xAt(i),
      y: yAt(item.paidPct),
      hasData: item.recuCount > 0,
    }));

    const linePoints = points.filter((p) => p.hasData);
    const path = linePoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    const area =
      linePoints.length > 1
        ? `${path} L ${linePoints[linePoints.length - 1]!.x.toFixed(2)} 100 L ${linePoints[0]!.x.toFixed(2)} 100 Z`
        : '';

    return { points, path, area };
  }, [monthly]);

  const active = hoverMonth == null ? null : lineGeometry.points[hoverMonth] ?? null;

  return (
    <EnlargeableChartPanel
      title="Évolution du taux de paiement (%)"
      className="travel-history-chart-panel factures-monthly-chart-panel factures-payment-rate-panel"
      clickToEnlarge={false}
    >
      <div className="factures-monthly-legend" onClick={(e) => e.stopPropagation()}>
        <span className="factures-monthly-legend-item is-paid">
          <i /> % factures payées / reçues
        </span>
      </div>

      <div className="factures-payment-rate-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="factures-payment-rate-body">
          <div className="factures-payment-rate-y-axis" aria-hidden>
            {[100, 75, 50, 25, 0].map((tick) => (
              <span key={tick}>{tick}%</span>
            ))}
          </div>

          <div className="factures-payment-rate-plot">
            <svg
              className="factures-payment-rate-svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              {[0, 25, 50, 75, 100].map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  x2="100"
                  y1={100 - tick}
                  y2={100 - tick}
                  className="factures-payment-rate-grid"
                />
              ))}
              {lineGeometry.area ? (
                <path d={lineGeometry.area} className="factures-payment-rate-area" />
              ) : null}
              {lineGeometry.path ? (
                <path d={lineGeometry.path} className="factures-payment-rate-line" fill="none" />
              ) : null}
            </svg>

            <div
              className="factures-payment-rate-months"
              style={{ gridTemplateColumns: `repeat(${monthly.length}, minmax(0, 1fr))` }}
            >
              {lineGeometry.points.map((p, index) => (
                <div
                  key={p.label}
                  className={`factures-payment-rate-col${hoverMonth === index ? ' is-active' : ''}`}
                  onMouseEnter={() => setHoverMonth(index)}
                  onMouseLeave={() => setHoverMonth(null)}
                >
                  <div className="factures-payment-rate-track">
                    {p.hasData ? (
                      <div
                        className="factures-payment-rate-point"
                        style={{ bottom: `${p.paidPct}%` }}
                      >
                        <span className="factures-payment-rate-pct">
                          {formatPctAnnotation(p.paidPct)}
                        </span>
                        <span className="factures-payment-rate-dot" />
                      </div>
                    ) : null}
                  </div>
                  <span className="factures-payment-rate-label">{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {active?.hasData ? (
          <div className="factures-payment-rate-bubble" role="tooltip">
            <strong>
              {active.label} {year}
            </strong>
            <div className="factures-monthly-histo-bubble-row is-paid">
              <span>Taux (nb)</span>
              <em>{formatPct(active.paidPct)}</em>
            </div>
            <div className="factures-monthly-histo-bubble-row is-paid">
              <span>Taux (montant)</span>
              <em>{formatPct(active.paidPctMontant)}</em>
            </div>
            <div className="factures-monthly-histo-bubble-row is-recu-count">
              <span>Payées / reçues</span>
              <em>
                {active.paidCount} / {active.recuCount}
              </em>
            </div>
          </div>
        ) : null}
      </div>
    </EnlargeableChartPanel>
  );
}
