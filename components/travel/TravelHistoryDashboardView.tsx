'use client';

import { useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import TravelDepartmentChart from '@/components/travel/TravelDepartmentChart';
import TravelMonthlyTripsChart from '@/components/travel/TravelMonthlyTripsChart';
import {
  IconAverage,
  IconBudget,
  IconDepartments,
  IconTrips,
} from '@/components/travel/TravelVoyageIcons';
import type {
  TravelHistoryDashboard,
  TravelHistoryRow,
} from '@/lib/travel-history-types';
import { extractTravelDepartmentName } from '@/lib/travel-history-utils';

interface Props {
  dashboard: TravelHistoryDashboard;
  rows: TravelHistoryRow[];
}

function formatUsd(value: number): string {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatMoney(value: number): string {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isCurrentMonth(dateValue: string): boolean {
  const raw = dateValue.trim();
  if (!raw) return false;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7) === `${y}-${m}`;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) return fr[3] === String(y) && fr[2].padStart(2, '0') === m;
  return false;
}

const TRIP_COLUMNS: DashboardListColumn[] = [
  { key: 'date', label: 'Date' },
  { key: 'ref', label: 'Réf.' },
  { key: 'employee', label: 'Employé' },
  { key: 'department', label: 'Département' },
  { key: 'days', label: 'Jours', align: 'right' },
  { key: 'budget', label: 'Budget', align: 'right' },
];

const DEPT_COLUMNS: DashboardListColumn[] = [
  { key: 'department', label: 'Département' },
  { key: 'count', label: 'Voyages', align: 'right' },
  { key: 'budget', label: 'Budget', align: 'right' },
];

function tripToRow(row: TravelHistoryRow): DashboardListRow {
  return {
    id: row.recordId || row.rowIndex,
    cells: {
      date: row.date || '—',
      ref: row.ref || '—',
      employee: row.employee || '—',
      department: extractTravelDepartmentName(row.department) || row.department || '—',
      days: row.tripDays,
      budget: formatMoney(row.totalBudget),
    },
  };
}

export default function TravelHistoryDashboardView({ dashboard, rows }: Props) {
  const [drilldown, setDrilldown] = useState<{
    title: string;
    columns: DashboardListColumn[];
    rows: DashboardListRow[];
  } | null>(null);

  const thisMonthRows = useMemo(
    () => rows.filter((row) => isCurrentMonth(row.date)),
    [rows],
  );

  const openTrips = (title: string, list: TravelHistoryRow[]) => {
    setDrilldown({
      title,
      columns: TRIP_COLUMNS,
      rows: list.map(tripToRow),
    });
  };

  const openDepartments = () => {
    setDrilldown({
      title: 'Départements avec voyages',
      columns: DEPT_COLUMNS,
      rows: dashboard.departments.map((dept) => ({
        id: dept.department,
        cells: {
          department: dept.department,
          count: dept.count,
          budget: formatMoney(dept.budget),
        },
      })),
    });
  };

  return (
    <div className="travel-history-dashboard">
      <div className="travel-history-cards">
        <button
          type="button"
          className="card card-glow card-glow-violet travel-history-card dependants-kpi-clickable"
          onClick={() => openTrips('Total voyages', rows)}
          title="Voir la liste — Total voyages"
        >
          <div className="card-label travel-history-card-label">
            <IconTrips size={13} />
            Total voyages
          </div>
          <div className="card-value">{dashboard.totalTrips}</div>
          <div className="travel-history-card-meta">
            {dashboard.tripsThisMonth} ce mois-ci
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-cyan travel-history-card dependants-kpi-clickable"
          onClick={() => openTrips('Budget total — voyages', rows)}
          title="Voir la liste — Budget total"
        >
          <div className="card-label travel-history-card-label">
            <IconBudget size={13} />
            Budget total
          </div>
          <div className="card-value">{formatUsd(dashboard.totalBudget)}</div>
          <div className="travel-history-card-meta">
            {formatUsd(dashboard.budgetThisMonth)} ce mois-ci
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-green travel-history-card dependants-kpi-clickable"
          onClick={() => openTrips('Voyages ce mois-ci', thisMonthRows)}
          title="Voir la liste — Voyages ce mois-ci"
        >
          <div className="card-label travel-history-card-label">
            <IconAverage size={13} />
            Budget moyen
          </div>
          <div className="card-value">{formatUsd(dashboard.averageBudget)}</div>
          <div className="travel-history-card-meta">
            Par mission enregistrée
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-red travel-history-card dependants-kpi-clickable"
          onClick={openDepartments}
          title="Voir la liste — Départements"
        >
          <div className="card-label travel-history-card-label">
            <IconDepartments size={13} />
            Départements
          </div>
          <div className="card-value">{dashboard.departments.length}</div>
          <div className="travel-history-card-meta">
            Avec au moins un voyage
          </div>
        </button>
      </div>

      <TravelMonthlyTripsChart chart={dashboard.monthlyTrips} />
      <TravelDepartmentChart departments={dashboard.departments} />

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
