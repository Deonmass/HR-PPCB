'use client';

import { useMemo, useState } from 'react';
import { calcDocumentCompletion, calcGlobalStats, parseRate } from '@/lib/documents';
import { buildAuditRateInfo } from '@/lib/audit-formulas';
import type { EmployeeFilters } from '@/lib/employee-filters';
import type { DashboardData, Employee } from '@/lib/types';
import AuditFormulaTooltip from './AuditFormulaTooltip';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from './DashboardListModal';
import DepartmentChart from './DepartmentChart';

interface Props {
  filteredEmployees: Employee[];
  dashboard: DashboardData | null;
  filters: EmployeeFilters;
}

const EMP_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'departement', label: 'Département' },
  { key: 'taux', label: 'Taux', align: 'right' },
  { key: 'manquants', label: 'Manquants', align: 'right' },
];

function toRow(employee: Employee): DashboardListRow {
  const completion = calcDocumentCompletion(employee);
  return {
    id: employee.matricule || employee.nom,
    cells: {
      matricule: employee.matricule || '—',
      nom: employee.nom || '—',
      departement: employee.departement || '—',
      taux: `${completion.pct}%`,
      manquants: completion.missing,
    },
  };
}

export default function DocumentsStatsTab({
  filteredEmployees,
  dashboard,
  filters,
}: Props) {
  const stats = calcGlobalStats(filteredEmployees);
  const filtered = Boolean(filters.search.trim() || filters.dept);
  const audit = useMemo(
    () => buildAuditRateInfo(filteredEmployees, dashboard, filtered),
    [filteredEmployees, dashboard, filtered],
  );
  const dashDepts = dashboard?.dashboard?.departments ?? [];
  const deptData = useMemo(() => {
    if (filters.search || filters.dept) {
      return stats.departments;
    }
    return dashDepts.length
      ? dashDepts.map((d) => ({
          name: d.name,
          total: Number(d.total),
          rate: parseRate(d.rate),
        }))
      : stats.departments;
  }, [dashDepts, stats.departments, filters]);

  const total = filteredEmployees.length;
  const [drilldown, setDrilldown] = useState<{
    title: string;
    rows: DashboardListRow[];
  } | null>(null);

  const conformeEmployees = useMemo(
    () => filteredEmployees.filter((e) => calcDocumentCompletion(e).pct >= 100),
    [filteredEmployees],
  );
  const nonConformeEmployees = useMemo(
    () => filteredEmployees.filter((e) => calcDocumentCompletion(e).pct < 100),
    [filteredEmployees],
  );

  const openList = (title: string, list: Employee[]) => {
    setDrilldown({ title, rows: list.map(toRow) });
  };

  return (
    <div className="stats-tab">
      <div className="cards">
        <button
          type="button"
          className="card card-glow card-glow-cyan dependants-kpi-clickable"
          onClick={() => openList('Total employés', filteredEmployees)}
          title="Voir la liste — Total employés"
        >
          <div className="card-label">Total employés</div>
          <div className="card-value">{total}</div>
        </button>
        <button
          type="button"
          className="card card-audit card-glow card-glow-green dependants-kpi-clickable"
          onClick={() => openList('Dossiers conformes (100%)', conformeEmployees)}
          title="Voir la liste — Conformes"
        >
          <div className="card-label">Taux conforme</div>
          <AuditFormulaTooltip
            value={audit.conformeLabel}
            title="Taux conforme — formule audit"
            lines={audit.conformeLines}
            className="card-value success"
          />
        </button>
        <button
          type="button"
          className="card card-audit card-glow card-glow-red dependants-kpi-clickable"
          onClick={() => openList('Dossiers non conformes', nonConformeEmployees)}
          title="Voir la liste — Non conformes"
        >
          <div className="card-label">Taux non conforme</div>
          <AuditFormulaTooltip
            value={audit.nonConformeLabel}
            title="Taux non conforme — formule audit"
            lines={audit.nonConformeLines}
            className="card-value danger"
          />
        </button>
        <div className="card card-audit card-glow card-glow-violet">
          <div className="card-label">Moyenne calculée live</div>
          <AuditFormulaTooltip
            value={`${stats.conformeRate}%`}
            title="Moyenne dossiers — formule audit"
            lines={audit.liveAvgLines}
            className="card-value"
          />
        </div>
      </div>

      <DepartmentChart departments={deptData} />

      {drilldown && (
        <DashboardListModal
          title={drilldown.title}
          columns={EMP_COLUMNS}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
