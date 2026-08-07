'use client';

import { useMemo, useState } from 'react';
import type { HomeBarItem } from '@/lib/home-dashboard-types';

interface Props {
  title: string;
  items: HomeBarItem[];
  emptyLabel?: string;
  valueLabel?: string;
  secondaryLabel?: string;
  formatValue?: (n: number) => string;
  maxBars?: number;
}

function defaultFormat(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default function HomeBarChart({
  title,
  items,
  emptyLabel = 'Aucune donnée',
  valueLabel = 'Valeur',
  secondaryLabel,
  formatValue = defaultFormat,
  maxBars = 6,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const rows = useMemo(() => items.slice(0, maxBars), [items, maxBars]);
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.secondary ?? 0)), 1);
  const dual = Boolean(secondaryLabel && rows.some((r) => r.secondary != null));
  const overflow = items.length > maxBars ? items.length - maxBars : 0;

  if (!rows.length) {
    return (
      <article className="home-chart-panel panel">
        <header className="home-chart-head">
          <h4>{title}</h4>
        </header>
        <p className="empty-state home-chart-empty">{emptyLabel}</p>
      </article>
    );
  }

  return (
    <article className="home-chart-panel panel">
      <header className="home-chart-head">
        <div className="home-chart-head-text">
          <h4>{title}</h4>
          {overflow > 0 && (
            <span className="home-chart-meta">Top {maxBars} · +{overflow}</span>
          )}
        </div>
        <div className="home-chart-legend">
          <span>
            <i className="home-chart-swatch home-chart-swatch-primary" aria-hidden />
            {valueLabel}
          </span>
          {dual && secondaryLabel && (
            <span>
              <i className="home-chart-swatch home-chart-swatch-secondary" aria-hidden />
              {secondaryLabel}
            </span>
          )}
        </div>
      </header>
      <div className={`home-bar-chart${dual ? ' is-dual' : ''}`}>
        {rows.map((item) => {
          const pct = Math.max(3, (item.value / max) * 100);
          const pct2 =
            item.secondary != null ? Math.max(2, (item.secondary / max) * 100) : 0;
          const active = hover === item.label;
          const barColor = dual
            ? undefined
            : item.color || 'var(--home-chart-primary, #e30613)';
          return (
            <div
              key={item.label}
              className={`home-bar-row${active ? ' is-active' : ''}${dual ? ' is-dual' : ''}`}
              onMouseEnter={() => setHover(item.label)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="home-bar-label" title={item.label}>
                {item.label}
              </span>
              <div className="home-bar-tracks">
                <div className="home-bar-track">
                  <div
                    className="home-bar-fill home-bar-fill-primary"
                    style={{
                      width: `${pct}%`,
                      ...(barColor ? { background: barColor } : {}),
                    }}
                  />
                </div>
                {dual && item.secondary != null && (
                  <div className="home-bar-track home-bar-track-secondary">
                    <div
                      className="home-bar-fill home-bar-fill-secondary"
                      style={{ width: `${pct2}%` }}
                    />
                  </div>
                )}
              </div>
              <span className="home-bar-value">
                {dual && item.secondary != null ? (
                  <>
                    <span>{formatValue(item.value)}</span>
                    <span className="home-bar-value-sec">{formatValue(item.secondary)}</span>
                  </>
                ) : (
                  formatValue(item.value)
                )}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
