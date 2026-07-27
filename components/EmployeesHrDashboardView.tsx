'use client';

import { useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import EmployeesExitMonthlyChart from '@/components/employees/EmployeesExitMonthlyChart';
import EmployeesLineChart from '@/components/employees/EmployeesLineChart';
import EmployeesPieChart from '@/components/employees/EmployeesPieChart';
import {
  buildEmployeesHrDashboard,
  employeeToDashboardListRow,
  employeesForHrKpi,
  type EmployeesHrKpiKey,
} from '@/lib/employees-hr-dashboard';
import type { Employee } from '@/lib/types';

interface Props {
  employees: Employee[];
  exits?: Employee[];
}

const KPI_META = [
  { key: 'total', label: 'Total actifs', glow: 'card-glow-red', format: 'int', watermark: null, drill: 'total' as const },
  { key: 'hommes', label: 'Hommes', glow: 'card-glow-cyan', format: 'int', watermark: 'male', drill: 'hommes' as const },
  { key: 'femmes', label: 'Femmes', glow: 'card-glow-pink', format: 'int', watermark: 'female', drill: 'femmes' as const },
  { key: 'ageMoyen', label: 'Âge moyen', glow: 'card-glow-violet', format: '1', watermark: null, drill: null },
  { key: 'moyEnfants', label: 'Moy. enfants', glow: 'card-glow-amber', format: '2', watermark: null, drill: null },
  { key: 'totalExits', label: 'Sorties', glow: 'card-glow-green', format: 'int', watermark: null, drill: 'totalExits' as const },
] as const;

const ACTIVE_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'departement', label: 'Département' },
  { key: 'grade', label: 'Grade' },
  { key: 'genre', label: 'Genre' },
];

const EXIT_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'departement', label: 'Département' },
  { key: 'raison', label: 'Motif' },
];

function GenderWatermark({ variant }: { variant: 'male' | 'female' }) {
  const female = variant === 'female';
  return (
    <svg
      className={`employees-hr-card-watermark is-${variant}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      {female ? (
        <>
          <circle cx="12" cy="7.5" r="3.6" />
          <path d="M12 12.2c-4.2 0-6.8 2.3-6.8 5.6V21h13.6v-3.2c0-3.3-2.6-5.6-6.8-5.6z" />
        </>
      ) : (
        <>
          <circle cx="12" cy="7" r="3.6" />
          <path d="M5.8 21v-2c0-3.4 2.8-5.7 6.2-5.7s6.2 2.3 6.2 5.7V21H5.8z" />
        </>
      )}
    </svg>
  );
}

/** Dashboard RH global — KPIs actifs + sorties. */
export default function EmployeesHrDashboardView({ employees, exits = [] }: Props) {
  const stats = useMemo(
    () => buildEmployeesHrDashboard(employees, exits),
    [employees, exits],
  );
  const [drilldown, setDrilldown] = useState<{
    title: string;
    columns: DashboardListColumn[];
    rows: DashboardListRow[];
  } | null>(null);

  const fmt = (key: (typeof KPI_META)[number]['key'], format: string) => {
    const raw = stats[key];
    if (raw == null) return '—';
    if (format === 'int') return String(raw);
    const digits = Number(format);
    return Number(raw).toLocaleString('fr-FR', {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    });
  };

  const toChartItems = (rows: { label: string; count: number }[]) =>
    rows.map((r) => ({ label: r.label, value: r.count }));

  const openKpi = (key: EmployeesHrKpiKey, label: string) => {
    const list = employeesForHrKpi(employees, exits, key);
    setDrilldown({
      title: label,
      columns: key === 'totalExits' ? EXIT_COLUMNS : ACTIVE_COLUMNS,
      rows: list.map(employeeToDashboardListRow),
    });
  };

  return (
    <div className="travel-history-dashboard employees-hr-dashboard">
      <div className="travel-history-cards employees-hr-cards">
        {KPI_META.map((kpi) => {
          const className = `card card-glow ${kpi.glow} travel-history-card employees-hr-card${kpi.watermark ? ' has-watermark' : ''}${kpi.drill ? ' dependants-kpi-clickable' : ''}`;
          const body = (
            <>
              {kpi.watermark && <GenderWatermark variant={kpi.watermark} />}
              <div className="employees-hr-card-body">
                <div className="card-label">{kpi.label}</div>
                <div className="card-value">{fmt(kpi.key, kpi.format)}</div>
              </div>
            </>
          );
          if (!kpi.drill) {
            return (
              <div key={kpi.key} className={className}>
                {body}
              </div>
            );
          }
          return (
            <button
              key={kpi.key}
              type="button"
              className={className}
              onClick={() => openKpi(kpi.drill, kpi.label)}
              title={`Voir la liste — ${kpi.label}`}
            >
              {body}
            </button>
          );
        })}
      </div>

      <div className="employees-charts-grid">
        <DependantsBarChart
          title="Par localisation"
          items={toChartItems(stats.parLocalisation)}
          barClassName="employees-bar-fill-loc"
          fitAll
          compact
        />
        <EmployeesPieChart
          title="Par genre"
          items={stats.parGenre}
          colors={['#06b6d4', '#f472b6']}
        />
        <DependantsBarChart
          title="Par grade"
          items={toChartItems(stats.parGrade)}
          barClassName="employees-bar-fill-grade"
          fitAll
          compact
        />
        <EmployeesLineChart
          title="Par tranche d'âge"
          items={stats.parTrancheAge}
          color="#a78bfa"
        />
        <DependantsBarChart
          title="Par département"
          items={toChartItems(stats.parDepartement)}
          barClassName="employees-bar-fill-dept"
          fitAll
          compact
        />
        <EmployeesPieChart
          title="Par nationalité"
          items={stats.parNationalite}
        />
        <div className="employees-chart-span">
          <EmployeesExitMonthlyChart
            title="Sorties par mois et motif"
            rows={stats.exitsParMois}
          />
        </div>
        <EmployeesPieChart
          title="Motifs de sortie"
          items={stats.exitsParRaison}
          colors={['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']}
        />
      </div>

      {drilldown && (
        <DashboardListModal
          title={drilldown.title}
          columns={drilldown.columns}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
