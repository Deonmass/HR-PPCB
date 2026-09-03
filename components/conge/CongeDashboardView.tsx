'use client';

import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import {
  buildCongeDashboard,
  codeFromChartLabel,
  type CongeDashboard,
} from '@/lib/conge-dashboard';
import { formatCongeNumber, formatIsoFr } from '@/lib/conge-rules';
import type { CongeBundle, CongeDrillKind, LeaveCode } from '@/lib/conge-types';
import { LEAVE_CODES } from '@/lib/conge-types';

interface Props {
  bundle: CongeBundle;
  asOf: string;
  department: string;
  departments: string[];
  onAsOfChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onOpenDrill: (drill: CongeDrillKind) => void;
}

function formatKpi(value: number, format: 'int' | '1'): string {
  if (format === 'int') return String(Math.round(value));
  return formatCongeNumber(value, 1);
}

export default function CongeDashboardView({
  bundle,
  asOf,
  department,
  departments,
  onAsOfChange,
  onDepartmentChange,
  onOpenDrill,
}: Props) {
  const dashboard: CongeDashboard = buildCongeDashboard(bundle, asOf, department);

  return (
    <div className="travel-history-dashboard conge-dashboard">
      <div className="dependants-dashboard-filters">
        <label className="dependants-dashboard-filter">
          <span>Date</span>
          <input
            type="date"
            className="filter-select"
            min={bundle.rangeStart}
            max={bundle.rangeEnd}
            value={asOf}
            onChange={(e) => onAsOfChange(e.target.value)}
          />
        </label>
        <label className="dependants-dashboard-filter">
          <span>Département</span>
          <select
            className="filter-select"
            value={department}
            onChange={(e) => onDepartmentChange(e.target.value)}
          >
            <option value="">Tous les départements</option>
            {departments.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <p className="conge-dashboard-range">
          Période {formatIsoFr(bundle.rangeStart)} → {formatIsoFr(bundle.rangeEnd)}
          {bundle.source ? ` · ${bundle.source}` : ''}
        </p>
      </div>

      <div className="travel-history-cards">
        {dashboard.kpis.map((kpi) => (
          <button
            key={kpi.key}
            type="button"
            className={`card card-glow ${kpi.glow} travel-history-card dependants-kpi-clickable`}
            onClick={() => onOpenDrill(kpi.drill)}
            title={`Voir la liste — ${kpi.label}`}
          >
            <div className="card-label">{kpi.label}</div>
            <div className="card-value">{formatKpi(kpi.value, kpi.format)}</div>
          </button>
        ))}
      </div>

      <div className="dependants-kpi-grid">
        {LEAVE_CODES.filter((item) => item.code !== 'IN').map((item) => {
          const days = dashboard.byCode.find((row) => row.label.startsWith(`${item.code}`))?.value ?? 0;
          return (
            <button
              key={item.code}
              type="button"
              className="dependants-kpi-item dependants-kpi-clickable"
              onClick={() => onOpenDrill({ kind: 'code', code: item.code as LeaveCode })}
              title={`Voir le détail — ${item.label}`}
            >
              <span className="dependants-kpi-label">{item.code} · {item.label}</span>
              <strong className="dependants-kpi-value">{days}</strong>
            </button>
          );
        })}
      </div>

      <div className="dependants-charts-grid">
        <DependantsBarChart
          title="Jours d’absence ce mois (par code)"
          items={dashboard.byCode}
          onItemClick={(label) => {
            const code = codeFromChartLabel(label);
            if (code && code !== 'IN') onOpenDrill({ kind: 'code', code });
          }}
        />
        <DependantsBarChart
          title="En congé par département"
          items={dashboard.byDepartment}
          onItemClick={(label) => onOpenDrill({ kind: 'dept', departement: label })}
        />
      </div>
    </div>
  );
}
