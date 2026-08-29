'use client';

import { useMemo, useState } from 'react';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { FactureSuivi } from '@/lib/factures-fournisseurs/types';
import {
  buildFacturesMonthlyTracking,
  formatUsdLike,
} from '@/lib/factures-fournisseurs/utils';

interface Props {
  factures: FactureSuivi[];
  year: number;
}

function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M $`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k $`;
  }
  return `${formatUsdLike(value)} $`;
}

export default function FacturesMonthlyChart({ factures, year }: Props) {
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  const monthly = useMemo(
    () => buildFacturesMonthlyTracking(factures, year),
    [factures, year],
  );

  const maxCount = useMemo(
    () => Math.max(
      1,
      ...monthly.map((p) => Math.max(p.recuCount, p.paidCount, p.unpaidCount)),
    ),
    [monthly],
  );

  const bars = useMemo(() => monthly.map((item) => {
    const h = (value: number) => (value > 0 ? Math.max((value / maxCount) * 100, 8) : 0);
    return {
      ...item,
      recuH: h(item.recuCount),
      paidH: h(item.paidCount),
      unpaidH: h(item.unpaidCount),
    };
  }), [monthly, maxCount]);

  const active = hoverMonth == null ? null : bars[hoverMonth] ?? null;

  return (
    <EnlargeableChartPanel
      title="Suivi des factures par mois"
      className="travel-history-chart-panel factures-monthly-chart-panel"
      clickToEnlarge={false}
    >
      <div className="factures-monthly-legend" onClick={(e) => e.stopPropagation()}>
        <span className="factures-monthly-legend-item is-recu-count">
          <i /> Total reçu
        </span>
        <span className="factures-monthly-legend-item is-paid">
          <i /> Paid
        </span>
        <span className="factures-monthly-legend-item is-unpaid">
          <i /> Unpaid
        </span>
      </div>

      <div className="factures-monthly-histo-wrap" onClick={(e) => e.stopPropagation()}>
        <div
          className="factures-monthly-histo"
          style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
        >
          {bars.map((item, index) => {
            const hasData = item.recuCount > 0 || item.paidCount > 0 || item.unpaidCount > 0;
            return (
              <div
                key={item.label}
                className={`factures-monthly-histo-col${hoverMonth === index ? ' is-active' : ''}`}
                onMouseEnter={() => setHoverMonth(index)}
                onMouseLeave={() => setHoverMonth(null)}
              >
                <div className="factures-monthly-histo-track">
                  {hasData ? (
                    <div className="factures-monthly-histo-group">
                      <div className="factures-monthly-histo-bar-wrap">
                        {item.recuCount > 0 ? (
                          <span
                            className="factures-monthly-histo-value is-recu-count"
                            style={{ bottom: `calc(${item.recuH}% + 3px)` }}
                          >
                            {item.recuCount}
                          </span>
                        ) : null}
                        <span
                          className="factures-monthly-histo-bar is-recu-count"
                          style={{ height: `${item.recuH}%` }}
                        />
                      </div>
                      <div className="factures-monthly-histo-bar-wrap">
                        {item.paidCount > 0 ? (
                          <span
                            className="factures-monthly-histo-value is-paid"
                            style={{ bottom: `calc(${item.paidH}% + 3px)` }}
                          >
                            {item.paidCount}
                          </span>
                        ) : null}
                        <span
                          className="factures-monthly-histo-bar is-paid"
                          style={{ height: `${item.paidH}%` }}
                        />
                      </div>
                      <div className="factures-monthly-histo-bar-wrap">
                        {item.unpaidCount > 0 ? (
                          <span
                            className="factures-monthly-histo-value is-unpaid"
                            style={{ bottom: `calc(${item.unpaidH}% + 3px)` }}
                          >
                            {item.unpaidCount}
                          </span>
                        ) : null}
                        <span
                          className="factures-monthly-histo-bar is-unpaid"
                          style={{ height: `${item.unpaidH}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="factures-monthly-histo-zero" />
                  )}

                  {hoverMonth === index && active && (
                    <div className="factures-monthly-histo-bubble" role="tooltip">
                      <strong>{active.label} {year}</strong>
                      <div className="factures-monthly-histo-bubble-row is-recu-count">
                        <span>Total reçu</span>
                        <em>{active.recuCount} · {formatUsdCompact(active.recuMontant)}</em>
                      </div>
                      <div className="factures-monthly-histo-bubble-row is-paid">
                        <span>Payé</span>
                        <em>{active.paidCount} · {formatUsdCompact(active.paidMontant)}</em>
                      </div>
                      <div className="factures-monthly-histo-bubble-row is-unpaid">
                        <span>Non payé</span>
                        <em>{active.unpaidCount} · {formatUsdCompact(active.unpaidMontant)}</em>
                      </div>
                      <div className="factures-monthly-histo-bubble-row is-paid">
                        <span>Taux paiement</span>
                        <em>{active.paidPct.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</em>
                      </div>
                    </div>
                  )}
                </div>
                <span className="factures-monthly-histo-label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </EnlargeableChartPanel>
  );
}
