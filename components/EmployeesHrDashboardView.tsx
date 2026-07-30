'use client';

import DependantsBarChart, { DependantsBarChartBody } from '@/components/dependants/DependantsBarChart';
import EmployeesExitMonthlyChart, {
  EmployeesExitMonthlyChartBody,
} from '@/components/employees/EmployeesExitMonthlyChart';
import EmployeesPieChart, { EmployeesPieChartBody } from '@/components/employees/EmployeesPieChart';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import {
  buildEmployeesHrDashboard,
  employeeToDashboardListRow,
  employeesForHrKpi,
  employeesMatchingHrSegment,
  type EmployeesHrKpiKey,
  type HrChartSegmentKind,
} from '@/lib/employees-hr-dashboard';
import type { Employee } from '@/lib/types';
import { useMemo, useState, type ReactNode } from 'react';
import type { ChartDeptFilterSource, ChartFilterRenderContext } from '@/components/EnlargeableChartPanel';

interface Props {
  employees: Employee[];
  exits?: Employee[];
}

const KPI_META = [
  { key: 'total', label: 'Total actifs', glow: 'card-glow-red', format: 'int', watermark: null, drill: 'total' as const },
  { key: 'hommes', label: 'Hommes', glow: 'card-glow-cyan', format: 'int', watermark: 'male', drill: 'hommes' as const },
  { key: 'femmes', label: 'Femmes', glow: 'card-glow-pink', format: 'int', watermark: 'female', drill: 'femmes' as const },
  { key: 'ageMoyen', label: 'Âge moyen', glow: 'card-glow-violet', format: '1', watermark: null, drill: null },
  { key: 'totalCdd', label: 'CDD', glow: 'card-glow-amber', format: 'int', watermark: null, drill: 'totalCdd' as const },
  { key: 'totalEssai', label: "Période d'essai", glow: 'card-glow-violet', format: 'int', watermark: null, drill: 'totalEssai' as const },
  { key: 'alertesEssai', label: 'Alertes essai (J-30)', glow: 'card-glow-red', format: 'int', watermark: null, drill: 'alertesEssai' as const },
  { key: 'totalExits', label: 'Sorties', glow: 'card-glow-green', format: 'int', watermark: null, drill: 'totalExits' as const },
] as const;

const ACTIVE_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'departement', label: 'Département' },
  { key: 'grade', label: 'Grade' },
  { key: 'genre', label: 'Genre' },
  { key: 'company', label: 'Company' },
  { key: 'embauche', label: 'Date d\'embauche' },
];

const TRIAL_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'localisation', label: 'Site' },
  { key: 'typeContrat', label: 'Contrat' },
  { key: 'finEssai', label: "Fin d'essai" },
  { key: 'statutEval', label: 'Statut éval.' },
];

const CDD_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'localisation', label: 'Site' },
  { key: 'typeContrat', label: 'Contrat' },
  { key: 'embauche', label: 'Début' },
  { key: 'finContrat', label: 'Fin contrat' },
];

const EXIT_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'departement', label: 'Département' },
  { key: 'company', label: 'Company' },
  { key: 'raison', label: 'Motif' },
];

const COMPANY_COLORS = ['#2563eb', '#f59e0b'];
const LOC_COLORS = ['#22d3ee', '#0891b2', '#67e8f9', '#0e7490'];
const MARITAL_COLORS = ['#8b5cf6', '#06b6d4', '#f472b6', '#94a3b8', '#f59e0b'];
const ESSAI_STATUS_COLORS = ['#f59e0b', '#2563eb', '#dc2626', '#16a34a'];
const CDD_DEPT_BAR = 'employees-bar-fill-cdd';
const AGE_BAR_CLASS = 'employees-bar-fill-age';

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

function toChartItems(rows: { label: string; count: number }[]) {
  return rows.map((r) => ({ label: r.label, value: r.count }));
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

  const pctLabel = (key: (typeof KPI_META)[number]['key']): string | null => {
    if (key === 'ageMoyen') return null;
    const value = stats[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (key === 'total') return '100%';

    const base = key === 'alertesEssai' ? stats.totalEssai : stats.total;
    if (!base || base <= 0) return '0%';

    const pct = Math.round((value / base) * 1000) / 10;
    return Number.isInteger(pct)
      ? `${pct}%`
      : `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  };

  const openKpi = (key: EmployeesHrKpiKey, label: string) => {
    const list = employeesForHrKpi(employees, exits, key);
    const columns =
      key === 'totalExits'
        ? EXIT_COLUMNS
        : key === 'totalCdd'
          ? CDD_COLUMNS
          : key === 'totalEssai' || key === 'alertesEssai'
            ? TRIAL_COLUMNS
            : ACTIVE_COLUMNS;
    setDrilldown({
      title: label,
      columns,
      rows: list.map(employeeToDashboardListRow),
    });
  };

  const activeDeptFilter = (
    kind: HrChartSegmentKind,
    build: (emps: Employee[], ctx: ChartFilterRenderContext) => ReactNode,
  ): ChartDeptFilterSource => ({
    employees,
    renderFiltered: build,
    showGenderLegend: true,
    resolveSegment: (emps, label) => employeesMatchingHrSegment(emps, kind, label),
    toListRow: employeeToDashboardListRow,
    segmentColumns: ACTIVE_COLUMNS,
  });

  const exitDeptFilter = (
    kind: HrChartSegmentKind,
    build: (emps: Employee[], ctx: ChartFilterRenderContext) => ReactNode,
  ): ChartDeptFilterSource => ({
    employees: exits,
    renderFiltered: build,
    showGenderLegend: true,
    resolveSegment: (emps, label) => employeesMatchingHrSegment(emps, kind, label),
    toListRow: employeeToDashboardListRow,
    segmentColumns: EXIT_COLUMNS,
  });

  const openLatestHires = () => {
    const order = new Map(
      stats.derniersArrives.map((row, index) => [row.matricule, index]),
    );
    const list = employees
      .filter((employee) => order.has(employee.matricule))
      .sort((a, b) => (order.get(a.matricule) ?? 0) - (order.get(b.matricule) ?? 0));
    setDrilldown({
      title: 'Derniers arrivés',
      columns: ACTIVE_COLUMNS,
      rows: list.map(employeeToDashboardListRow),
    });
  };

  return (
    <div className="travel-history-dashboard employees-hr-dashboard">
      <div className="travel-history-cards employees-hr-cards">
        {KPI_META.map((kpi) => {
          const className = `card card-glow ${kpi.glow} travel-history-card employees-hr-card${kpi.watermark ? ' has-watermark' : ''}${kpi.drill ? ' dependants-kpi-clickable' : ''}${kpi.key === 'alertesEssai' && stats.alertesEssai > 0 ? ' is-alert' : ''}`;
          const pct = pctLabel(kpi.key);
          const body = (
            <>
              {kpi.watermark && <GenderWatermark variant={kpi.watermark} />}
              <div className="employees-hr-card-body">
                <div className="card-label">{kpi.label}</div>
                <div className="card-value">
                  {fmt(kpi.key, kpi.format)}
                  {pct ? <span className="employees-hr-card-pct">{pct}</span> : null}
                </div>
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
        <EmployeesPieChart
          title="Par company"
          items={stats.parCompany}
          colors={COMPANY_COLORS}
          deptFilter={activeDeptFilter('company', (emps, ctx) => (
            <EmployeesPieChartBody
              items={buildEmployeesHrDashboard(emps).parCompany}
              colors={COMPANY_COLORS}
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <EmployeesPieChart
          title="Par localisation"
          items={stats.parLocalisation}
          colors={LOC_COLORS}
          deptFilter={activeDeptFilter('localisation', (emps, ctx) => (
            <EmployeesPieChartBody
              items={buildEmployeesHrDashboard(emps).parLocalisation}
              colors={LOC_COLORS}
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <EmployeesPieChart
          title="Par statut marital"
          items={stats.parMaritalStatus}
          colors={MARITAL_COLORS}
          deptFilter={activeDeptFilter('maritalStatus', (emps, ctx) => (
            <EmployeesPieChartBody
              items={buildEmployeesHrDashboard(emps).parMaritalStatus}
              colors={MARITAL_COLORS}
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <EmployeesPieChart
          title="Par genre"
          items={stats.parGenre}
          colors={['#06b6d4', '#f472b6']}
          deptFilter={activeDeptFilter('genre', (emps, ctx) => (
            <EmployeesPieChartBody
              items={buildEmployeesHrDashboard(emps).parGenre}
              colors={['#06b6d4', '#f472b6']}
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <EmployeesPieChart
          title="Statut période d'essai"
          items={stats.essaiParStatut}
          colors={ESSAI_STATUS_COLORS}
          deptFilter={{
            employees,
            renderFiltered: (emps, ctx) => (
              <EmployeesPieChartBody
                items={buildEmployeesHrDashboard(emps).essaiParStatut}
                colors={ESSAI_STATUS_COLORS}
                onItemClick={ctx.onSegmentClick}
              />
            ),
            showGenderLegend: true,
            resolveSegment: (emps, label) => employeesMatchingHrSegment(emps, 'essaiStatut', label),
            toListRow: employeeToDashboardListRow,
            segmentColumns: TRIAL_COLUMNS,
          }}
        />
        <DependantsBarChart
          title="CDD par département"
          items={toChartItems(stats.cddParDepartement)}
          barClassName={CDD_DEPT_BAR}
          fitAll
          compact
          deptFilter={{
            employees,
            renderFiltered: (emps, ctx) => (
              <DependantsBarChartBody
                items={toChartItems(buildEmployeesHrDashboard(emps).cddParDepartement)}
                barClassName={CDD_DEPT_BAR}
                fitAll
                onItemClick={ctx.onSegmentClick}
              />
            ),
            showGenderLegend: true,
            resolveSegment: (emps, label) => employeesMatchingHrSegment(emps, 'cddDepartement', label),
            toListRow: employeeToDashboardListRow,
            segmentColumns: CDD_COLUMNS,
          }}
        />
        <DependantsBarChart
          title="Par grade"
          items={toChartItems(stats.parGrade)}
          barClassName="employees-bar-fill-grade"
          fitAll
          compact
          deptFilter={activeDeptFilter('grade', (emps, ctx) => (
            <DependantsBarChartBody
              items={toChartItems(buildEmployeesHrDashboard(emps).parGrade)}
              barClassName="employees-bar-fill-grade"
              fitAll
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <DependantsBarChart
          title="Par tranche d'âge"
          items={toChartItems(stats.parTrancheAge)}
          barClassName={AGE_BAR_CLASS}
          fitAll
          compact
          deptFilter={activeDeptFilter('ageBand', (emps, ctx) => (
            <DependantsBarChartBody
              items={toChartItems(buildEmployeesHrDashboard(emps).parTrancheAge)}
              barClassName={AGE_BAR_CLASS}
              fitAll
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <DependantsBarChart
          title="Par département"
          items={toChartItems(stats.parDepartement)}
          barClassName="employees-bar-fill-dept"
          fitAll
          compact
          deptFilter={activeDeptFilter('departement', (emps, ctx) => (
            <DependantsBarChartBody
              items={toChartItems(buildEmployeesHrDashboard(emps).parDepartement)}
              barClassName="employees-bar-fill-dept"
              fitAll
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <EmployeesPieChart
          title="Par nationalité"
          items={stats.parNationalite}
          deptFilter={activeDeptFilter('nationalite', (emps, ctx) => (
            <EmployeesPieChartBody
              items={buildEmployeesHrDashboard(emps).parNationalite}
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <EmployeesExitMonthlyChart
          title="Sorties par mois et motif"
          rows={stats.exitsParMois}
          deptFilter={exitDeptFilter('exitMonth', (emps, ctx) => (
            <EmployeesExitMonthlyChartBody
              rows={buildEmployeesHrDashboard([], emps).exitsParMois}
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
        <EmployeesPieChart
          title="Motifs de sortie"
          items={stats.exitsParRaison}
          colors={['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']}
          deptFilter={exitDeptFilter('exitRaison', (emps, ctx) => (
            <EmployeesPieChartBody
              items={buildEmployeesHrDashboard([], emps).exitsParRaison}
              colors={['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']}
              onItemClick={ctx.onSegmentClick}
            />
          ))}
        />
      </div>

      <div className="panel employees-latest-hires-panel">
        <div className="panel-head">
          <h3>Derniers arrivés</h3>
          <div className="employees-latest-hires-head-actions">
            <span className="employees-latest-hires-hint">Selon la date d&apos;embauche</span>
            {stats.derniersArrives.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost employees-latest-hires-open"
                onClick={openLatestHires}
              >
                Voir la liste
              </button>
            ) : null}
          </div>
        </div>
        {stats.derniersArrives.length === 0 ? (
          <p className="empty-state">Aucune date d&apos;embauche disponible.</p>
        ) : (
          <div className="employees-latest-hires-table-wrap">
            <table className="employees-latest-hires-table">
              <thead>
                <tr>
                  <th>Date d&apos;embauche</th>
                  <th>Matricule</th>
                  <th>Nom</th>
                  <th>Département</th>
                  <th>Localisation</th>
                  <th>Grade</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {stats.derniersArrives.map((row) => (
                  <tr
                    key={`${row.matricule}-${row.appointmentDate}`}
                    className="employees-latest-hires-row"
                    onClick={openLatestHires}
                    title="Voir la liste des derniers arrivés"
                  >
                    <td>{row.appointmentDate}</td>
                    <td>{row.matricule}</td>
                    <td>{row.nom}</td>
                    <td>{row.departement}</td>
                    <td>{row.localisation}</td>
                    <td>{row.grade}</td>
                    <td title={row.company}>{row.company}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
