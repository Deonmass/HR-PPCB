'use client';

import { useMemo, useState } from 'react';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { FactureSuivi } from '@/lib/factures-fournisseurs/types';
import {
  buildFacturesMonthlyTracking,
  formatUsdLike,
  listFactureYears,
} from '@/lib/factures-fournisseurs/utils';

interface Props {
  factures: FactureSuivi[];
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

export default function FacturesMonthlyChart({ factures }: Props) {
  const years = useMemo(() => listFactureYears(factures), [factures]);
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear());
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  const selectedYear = years.includes(year) ? year : (years[0] ?? new Date().getFullYear());

  const monthly = useMemo(
    () => buildFacturesMonthlyTracking(factures, selectedYear),
    [factures, selectedYear],
  );

  const maxMontant = useMemo(
    () => Math.max(
      1,
      ...monthly.map((p) => Math.max(p.recuMontant, p.paidMontant, p.unpaidMontant)),
    ),
    [monthly],
  );

  const maxCount = useMemo(
    () => Math.max(1, ...monthly.map((p) => p.recuCount)),
    [monthly],
  );

  const bars = useMemo(() => monthly.map((item) => {
    const h = (value: number) => (value > 0 ? Math.max((value / maxMontant) * 100, 4) : 0);
    const countH = item.recuCount > 0
      ? Math.max((item.recuCount / maxCount) * 100, 4)
      : 0;
    return {
      ...item,
      recuH: h(item.recuMontant),
      paidH: h(item.paidMontant),
      unpaidH: h(item.unpaidMontant),
      countH,
    };
  }), [monthly, maxMontant, maxCount]);

  const active = hoverMonth == null ? null : bars[hoverMonth] ?? null;

  const yearFilter = (
    <label className="factures-monthly-year-filter">
      <span>Année</span>
      <select
        className="filter-select"
        value={selectedYear}
        onChange={(e) => setYear(Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </label>
  );

  return (
    <EnlargeableChartPanel
      title="Suivi des factures par mois"
      className="travel-history-chart-panel factures-monthly-chart-panel"
      headExtra={yearFilter}
      clickToEnlarge={false}
    >
      <div className="factures-monthly-legend" onClick={(e) => e.stopPropagation()}>
        <span className="factures-monthly-legend-item is-recu-count">
          <i /> Reçu (nb)
        </span>
        <span className="factures-monthly-legend-item is-recu-montant">
          <i /> Reçu ($)
        </span>
        <span className="factures-monthly-legend-item is-paid">
          <i /> Paid ($)
        </span>
        <span className="factures-monthly-legend-item is-unpaid">
          <i /> Unpaid ($)
        </span>
      </div>

      <div className="factures-monthly-histo-wrap" onClick={(e) => e.stopPropagation()}>
        <div
          className="factures-monthly-histo"
          style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
        >
          {bars.map((item, index) => {
            const hasData = item.recuCount > 0
              || item.recuMontant > 0
              || item.paidMontant > 0
              || item.unpaidMontant > 0;
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
                      <span
                        className="factures-monthly-histo-bar is-recu-count"
                        style={{ height: `${item.countH}%` }}
                        title={`Reçu ${item.recuCount}`}
                      />
                      <span
                        className="factures-monthly-histo-bar is-recu-montant"
                        style={{ height: `${item.recuH}%` }}
                        title={`Reçu ${formatUsdCompact(item.recuMontant)}`}
                      />
                      <span
                        className="factures-monthly-histo-bar is-paid"
                        style={{ height: `${item.paidH}%` }}
                        title={`Paid ${formatUsdCompact(item.paidMontant)}`}
                      />
                      <span
                        className="factures-monthly-histo-bar is-unpaid"
                        style={{ height: `${item.unpaidH}%` }}
                        title={`Unpaid ${formatUsdCompact(item.unpaidMontant)}`}
                      />
                    </div>
                  ) : (
                    <span className="factures-monthly-histo-zero" />
                  )}

                  {hoverMonth === index && active && (
                    <div className="factures-monthly-histo-bubble" role="tooltip">
                      <strong>{active.label} {selectedYear}</strong>
                      <div className="factures-monthly-histo-bubble-row is-recu-count">
                        <span>Reçu (nb)</span>
                        <em>{active.recuCount}</em>
                      </div>
                      <div className="factures-monthly-histo-bubble-row is-recu-montant">
                        <span>Reçu ($)</span>
                        <em>{formatUsdCompact(active.recuMontant)}</em>
                      </div>
                      <div className="factures-monthly-histo-bubble-row is-paid">
                        <span>Paid ($)</span>
                        <em>{formatUsdCompact(active.paidMontant)}</em>
                      </div>
                      <div className="factures-monthly-histo-bubble-row is-unpaid">
                        <span>Unpaid ($)</span>
                        <em>{formatUsdCompact(active.unpaidMontant)}</em>
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
