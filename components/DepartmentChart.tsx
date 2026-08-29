'use client';

import { useState } from 'react';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import { formatRate } from '@/lib/format-rate';

interface DeptItem {
  name: string;
  total: number;
  rate: number;
}

interface Props {
  departments: DeptItem[];
}

function barClass(rate: number): string {
  if (rate >= 80) return 'bar-high';
  if (rate >= 60) return 'bar-mid';
  return 'bar-low';
}

export default function DepartmentChart({ departments }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...departments].sort((a, b) => b.rate - a.rate);
  const maxRate = Math.max(...sorted.map((d) => d.rate), 100);

  return (
    <EnlargeableChartPanel
      title="Conformité par département"
      className="chart-panel"
      headExtra={
        <span className="panel-meta">{sorted.length} départements · taux de complétion moyen</span>
      }
      clickToEnlarge
    >
      <div className="chart-area">
        <div className="chart-y-axis">
          {[100, 75, 50, 25, 0].map((v) => (
            <span key={v} className="chart-y-label">{v}%</span>
          ))}
        </div>
        <div className="chart-bars-wrap">
          <div className="chart-grid-lines">
            {[100, 75, 50, 25, 0].map((v) => (
              <div key={v} className="chart-grid-line" style={{ bottom: `${v}%` }} />
            ))}
          </div>
          <div className={`chart-bars dash-chart-bars${hover ? ' has-hover' : ''}`}>
            {sorted.map((dept, index) => {
              const height = (dept.rate / maxRate) * 100;
              const isActive = hover === dept.name;
              return (
                <div
                  key={dept.name}
                  className={`chart-bar-col dash-bar-col${isActive ? ' is-active' : ''}${hover && !isActive ? ' is-dimmed' : ''}`}
                  style={{ animationDelay: `${index * 45}ms` }}
                  title={`${dept.name}: ${formatRate(dept.rate)} (${dept.total} employés)`}
                  onMouseEnter={() => setHover(dept.name)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className={`chart-bar-pct dash-bar-value${isActive ? ' is-active' : ''}`}>
                    {formatRate(dept.rate)}
                  </span>
                  <div className={`chart-bar-track dash-bar-wrap${isActive ? ' is-active' : ''}`}>
                    <div
                      className={`chart-bar-fill dash-bar-fill ${barClass(dept.rate)}${isActive ? ' is-active' : ''}`}
                      style={{ height: `${Math.max(height, dept.rate > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className={`chart-bar-label${isActive ? ' is-active' : ''}`}>{dept.name}</span>
                  <span className="chart-bar-meta">{dept.total} emp.</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </EnlargeableChartPanel>
  );
}
