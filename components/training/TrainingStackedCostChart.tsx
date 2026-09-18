'use client';

import { useMemo } from 'react';

export type TrainingStackMonth = {
  key: string;
  label: string;
  hq: number;
  plant: number;
  total: number;
  isCurrent?: boolean;
};

interface Props {
  title?: string;
  months: TrainingStackMonth[];
  onBarClick?: (monthKey: string) => void;
}

/** Vertical stacked bars — HQ (navy) + Plant (orange). */
export default function TrainingStackedCostChart({
  title = 'COST PER MONTH (USD)',
  months,
  onBarClick,
}: Props) {
  const max = useMemo(
    () => Math.max(...months.map((m) => m.total), 1),
    [months],
  );

  const ticks = useMemo(() => {
    const step = max <= 5000 ? 1000 : max <= 15000 ? 2500 : 5000;
    const top = Math.ceil(max / step) * step || step;
    const values: number[] = [];
    for (let v = 0; v <= top; v += step) values.push(v);
    return { top, values };
  }, [max]);

  return (
    <article className="training-stack-chart">
      <header className="training-stack-chart-head">
        <h4>{title}</h4>
        <div className="training-stack-legend">
          <span>
            <i className="is-hq" aria-hidden /> HQ
          </span>
          <span>
            <i className="is-plant" aria-hidden /> Plant
          </span>
        </div>
      </header>
      <div className="training-stack-body">
        <div className="training-stack-yaxis" aria-hidden>
          {[...ticks.values].reverse().map((v) => (
            <span key={v}>{v.toLocaleString('en-US')}</span>
          ))}
        </div>
        <div className="training-stack-main">
          <div className="training-stack-plot">
            <div className="training-stack-grid" aria-hidden>
              {ticks.values.map((v) => (
                <i key={v} style={{ bottom: `${(v / ticks.top) * 100}%` }} />
              ))}
            </div>
            <div className="training-stack-bars">
              {months.map((m) => {
                const hqH = (m.hq / ticks.top) * 100;
                const plantH = (m.plant / ticks.top) * 100;
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={`training-stack-col${m.isCurrent ? ' is-current' : ''}`}
                    title={`${m.label}: HQ ${m.hq.toLocaleString('en-US')} · Plant ${m.plant.toLocaleString('en-US')}`}
                    onClick={() => onBarClick?.(m.key)}
                  >
                    <div className="training-stack-stack">
                      <span className="is-plant" style={{ height: `${Math.max(plantH, 0)}%` }} />
                      <span className="is-hq" style={{ height: `${Math.max(hqH, 0)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="training-stack-labels">
            {months.map((m) => (
              <span
                key={`lab-${m.key}`}
                className={m.isCurrent ? 'is-current' : undefined}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
