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
  mergeEmployeesWithExits,
  type EmployeesHrKpiKey,
  type HrChartSegmentKind,
} from '@/lib/employees-hr-dashboard';
import type { Employee } from '@/lib/types';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChartDeptFilterSource, ChartFilterRenderContext } from '@/components/EnlargeableChartPanel';

interface Props {
  employees: Employee[];
  exits?: Employee[];
}

const KPI_META = [
  { key: 'total', label: 'Total', glow: 'card-glow-red', format: 'int', watermark: null, drill: 'total' as const },
  { key: 'hommes', label: 'Hommes', glow: 'card-glow-cyan', format: 'int', watermark: 'male', drill: 'hommes' as const },
  { key: 'femmes', label: 'Femmes', glow: 'card-glow-pink', format: 'int', watermark: 'female', drill: 'femmes' as const },
  { key: 'totalContractants', label: 'Total contractant', glow: 'card-glow-violet', format: 'int', watermark: null, drill: 'totalContractants' as const },
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

const CONTRACTANT_EMP_COLUMNS: DashboardListColumn[] = [
  { key: 'nom', label: 'Noms' },
  { key: 'contractant', label: 'Contractant' },
  { key: 'sexe', label: 'Sexe' },
  { key: 'lieu', label: 'Lieu' },
  { key: 'fonction', label: 'Fonction' },
  { key: 'statut', label: 'Statut' },
];

type ContractantDashStats = {
  totalContractants: number;
  contractantsFirms: number;
  contractantsPermanents: number;
  contractantsJournaliers: number;
  contractantRows: DashboardListRow[];
};

const EMPTY_CONTRACTANT_STATS: ContractantDashStats = {
  totalContractants: 0,
  contractantsFirms: 0,
  contractantsPermanents: 0,
  contractantsJournaliers: 0,
  contractantRows: [],
};

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

function topRow(rows: { label: string; count: number }[] | undefined) {
  return rows?.find((r) => r.count > 0) ?? rows?.[0] ?? null;
}

function formatKpiMeta(
  key: (typeof KPI_META)[number]['key'],
  stats: ReturnType<typeof buildEmployeesHrDashboard> & ContractantDashStats,
): { lines: string[]; barPct?: number; barClass?: string } {
  const topSite = topRow(stats.parLocalisation);
  const topCompany = topRow(stats.parCompany);
  const topDept = topRow(stats.parDepartement);
  const topGrade = topRow(stats.parGrade);
  const topCddDept = topRow(stats.cddParDepartement);
  const topExitReason = topRow(stats.exitsParRaison);
  const topEssaiStatut = topRow(stats.essaiParStatut);

  switch (key) {
    case 'total':
      return {
        lines: [
          topCompany ? `${topCompany.label} · ${topCompany.count}` : 'Aucune company',
          topSite ? `${topSite.label} en tête (${topSite.count})` : 'Aucun site',
          stats.moyEnfants != null ? `Moy. enfants ${stats.moyEnfants}` : 'Moy. enfants —',
        ],
        barPct: 100,
        barClass: 'is-red',
      };
    case 'hommes':
      return {
        lines: [
          `Ratio H/F ${stats.hommes} / ${stats.femmes}`,
          `${stats.maries} marié(s) au total`,
          topGrade ? `Grade dominant ${topGrade.label}` : 'Grade —',
        ],
        barPct: stats.total ? (stats.hommes / stats.total) * 100 : 0,
        barClass: 'is-cyan',
      };
    case 'femmes':
      return {
        lines: [
          `Part des effectifs ${stats.total ? ((stats.femmes / stats.total) * 100).toFixed(1).replace(/\.0$/, '') : 0}%`,
          topDept ? `Dept. dominant ${topDept.label}` : 'Département —',
          topSite ? `Site dominant ${topSite.label}` : 'Site —',
        ],
        barPct: stats.total ? (stats.femmes / stats.total) * 100 : 0,
        barClass: 'is-pink',
      };
    case 'totalContractants':
      return {
        lines: [
          `${stats.contractantsPermanents} permanent${stats.contractantsPermanents !== 1 ? 's' : ''}`,
          `${stats.contractantsJournaliers} journalier${stats.contractantsJournaliers !== 1 ? 's' : ''}`,
          `${stats.contractantsFirms} contractant${stats.contractantsFirms !== 1 ? 's' : ''}`,
        ],
        barPct: stats.totalContractants
          ? (stats.contractantsPermanents / stats.totalContractants) * 100
          : 0,
        barClass: 'is-violet',
      };
    case 'totalCdd':
      return {
        lines: [
          topCddDept ? `${topCddDept.label} · ${topCddDept.count}` : 'Aucun département CDD',
          `Sur ${stats.total} actifs`,
          stats.totalEssai > 0 ? `${stats.totalEssai} aussi en essai` : 'Aucun essai croisé',
        ],
        barPct: stats.total ? (stats.totalCdd / stats.total) * 100 : 0,
        barClass: 'is-amber',
      };
    case 'totalEssai':
      return {
        lines: [
          topEssaiStatut ? `${topEssaiStatut.label} · ${topEssaiStatut.count}` : 'Statut —',
          stats.alertesEssai > 0
            ? `${stats.alertesEssai} alerte${stats.alertesEssai > 1 ? 's' : ''} J-30`
            : 'Aucune alerte J-30',
          `Sur ${stats.total} actifs`,
        ],
        barPct: stats.total ? (stats.totalEssai / stats.total) * 100 : 0,
        barClass: 'is-violet',
      };
    case 'alertesEssai':
      return {
        lines: [
          stats.totalEssai > 0
            ? `${stats.alertesEssai} / ${stats.totalEssai} essais`
            : 'Aucune période d’essai',
          topEssaiStatut ? `Statut courant ${topEssaiStatut.label}` : 'Statut —',
          stats.alertesEssai > 0 ? 'Action RH recommandée' : 'Situation nominale',
        ],
        barPct: stats.totalEssai ? (stats.alertesEssai / stats.totalEssai) * 100 : 0,
        barClass: 'is-red',
      };
    case 'totalExits':
      return {
        lines: [
          topExitReason ? `${topExitReason.label} · ${topExitReason.count}` : 'Aucun motif',
          stats.exitsParMois.length
            ? `${stats.exitsParMois[stats.exitsParMois.length - 1]?.label ?? '—'} (dernier mois)`
            : 'Pas d’historique mensuel',
          `${stats.total} actifs restants`,
        ],
        barPct: stats.total + stats.totalExits
          ? (stats.totalExits / (stats.total + stats.totalExits)) * 100
          : 0,
        barClass: 'is-green',
      };
    default:
      return { lines: [] };
  }
}

/** Dashboard RH global — KPIs actifs + sorties. */
export default function EmployeesHrDashboardView({ employees, exits = [] }: Props) {
  const baseStats = useMemo(
    () => buildEmployeesHrDashboard(employees, exits),
    [employees, exits],
  );
  const [contractantStats, setContractantStats] = useState<ContractantDashStats>(EMPTY_CONTRACTANT_STATS);
  const [contractantsLoading, setContractantsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setContractantsLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/employes/contractants', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setContractantStats(EMPTY_CONTRACTANT_STATS);
          setContractantsLoading(false);
          return;
        }
        const list = Array.isArray(data.contractants) ? data.contractants : [];
        let permanents = 0;
        let journaliers = 0;
        const rows: DashboardListRow[] = [];
        for (const c of list) {
          const emps = Array.isArray(c.employees) ? c.employees : [];
          for (const e of emps) {
            const statut = String(e.statut || 'Permanent');
            if (statut === 'Journalier') journaliers += 1;
            else permanents += 1;
            rows.push({
              id: `${c.id}-${e.id}`,
              cells: {
                nom: e.nom || '—',
                contractant: c.denomination || '—',
                sexe: e.sexe || '—',
                lieu: e.lieuAffectation || '—',
                fonction: e.fonction || '—',
                statut,
              },
            });
          }
        }
        if (!cancelled) {
          setContractantStats({
            totalContractants: permanents + journaliers,
            contractantsFirms: list.length,
            contractantsPermanents: permanents,
            contractantsJournaliers: journaliers,
            contractantRows: rows,
          });
          setContractantsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setContractantStats(EMPTY_CONTRACTANT_STATS);
          setContractantsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => ({ ...baseStats, ...contractantStats }),
    [baseStats, contractantStats],
  );
  const workforce = useMemo(
    () => mergeEmployeesWithExits(employees, exits),
    [employees, exits],
  );
  const [drilldown, setDrilldown] = useState<{
    title: string;
    columns: DashboardListColumn[];
    rows: DashboardListRow[];
  } | null>(null);

  const fmt = (key: (typeof KPI_META)[number]['key'], format: string) => {
    const raw = stats[key as keyof typeof stats];
    if (raw == null || typeof raw === 'object') return '—';
    if (format === 'int') return String(raw);
    const digits = Number(format);
    return Number(raw).toLocaleString('fr-FR', {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    });
  };

  const pctLabel = (key: (typeof KPI_META)[number]['key']): string | null => {
    if (key === 'totalContractants') {
      const total = stats.totalContractants;
      if (!total) return '0%';
      const pct = Math.round((stats.contractantsPermanents / total) * 1000) / 10;
      return Number.isInteger(pct)
        ? `${pct}% perm.`
        : `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}% perm.`;
    }
    const value = stats[key as keyof typeof stats];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (key === 'total') return '100%';

    const base = key === 'alertesEssai' ? stats.totalEssai : stats.total;
    if (!base || base <= 0) return '0%';

    const pct = Math.round((value / base) * 1000) / 10;
    return Number.isInteger(pct)
      ? `${pct}%`
      : `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  };

  const openKpi = (key: EmployeesHrKpiKey | 'totalContractants', label: string) => {
    if (key === 'totalContractants') {
      setDrilldown({
        title: label,
        columns: CONTRACTANT_EMP_COLUMNS,
        rows: contractantStats.contractantRows,
      });
      return;
    }
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

  const workforceDeptFilter = (
    kind: HrChartSegmentKind,
    build: (emps: Employee[], ctx: ChartFilterRenderContext) => ReactNode,
  ): ChartDeptFilterSource => ({
    employees: workforce,
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
          const isContractantsLoading = kpi.key === 'totalContractants' && contractantsLoading;
          const className = `card card-glow ${kpi.glow} travel-history-card employees-hr-card${kpi.watermark ? ' has-watermark' : ''}${kpi.drill ? ' dependants-kpi-clickable' : ''}${kpi.key === 'alertesEssai' && stats.alertesEssai > 0 ? ' is-alert' : ''}${isContractantsLoading ? ' is-loading' : ''}`;
          const pct = isContractantsLoading ? null : pctLabel(kpi.key);
          const meta = isContractantsLoading
            ? { lines: [] as string[] }
            : formatKpiMeta(kpi.key, stats);
          const body = (
            <>
              {kpi.watermark && <GenderWatermark variant={kpi.watermark} />}
              <div className="employees-hr-card-body">
                <div className="card-label">{kpi.label}</div>
                <div className="card-value">
                  {isContractantsLoading ? (
                    <span className="btn-spinner employees-hr-card-spinner" aria-label="Chargement" />
                  ) : (
                    <>
                      {fmt(kpi.key, kpi.format)}
                      {pct ? <span className="employees-hr-card-pct">{pct}</span> : null}
                    </>
                  )}
                </div>
                {meta.lines.length > 0 ? (
                  <div className="employees-hr-card-meta">
                    {meta.lines.map((line) => (
                      <div key={line} className="employees-hr-card-meta-line" title={line}>
                        {line}
                      </div>
                    ))}
                  </div>
                ) : null}
                {meta.barPct != null ? (
                  <div className="employees-hr-card-bar" aria-hidden>
                    <div
                      className={`employees-hr-card-bar-fill ${meta.barClass ?? ''}`}
                      style={{ width: `${Math.max(0, Math.min(100, meta.barPct))}%` }}
                    />
                  </div>
                ) : null}
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
              disabled={isContractantsLoading}
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
          deptFilter={workforceDeptFilter('company', (emps, ctx) => (
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
          deptFilter={workforceDeptFilter('localisation', (emps, ctx) => (
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
          deptFilter={workforceDeptFilter('maritalStatus', (emps, ctx) => (
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
          deptFilter={workforceDeptFilter('genre', (emps, ctx) => (
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
          deptFilter={workforceDeptFilter('grade', (emps, ctx) => (
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
          deptFilter={workforceDeptFilter('ageBand', (emps, ctx) => (
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
          deptFilter={workforceDeptFilter('departement', (emps, ctx) => (
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
          deptFilter={workforceDeptFilter('nationalite', (emps, ctx) => (
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
