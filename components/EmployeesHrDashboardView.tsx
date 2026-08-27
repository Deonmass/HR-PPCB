'use client';

import DependantsBarChart, { DependantsBarChartBody } from '@/components/dependants/DependantsBarChart';
import EmployeesExitMonthlyChart, {
  EmployeesExitMonthlyChartBody,
} from '@/components/employees/EmployeesExitMonthlyChart';
import EmployeesPieChart, { EmployeesPieChartBody } from '@/components/employees/EmployeesPieChart';
import EmployeesPpcLocGenderTable, {
  EmployeesPpcLocGenderTableBody,
} from '@/components/employees/EmployeesPpcLocGenderTable';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import {
  buildEmployeesHrDashboard,
  buildPpcLocalisationGenderRows,
  employeeToDashboardListRow,
  buildHrPeriodMomStats,
  employeesForHrKpi,
  employeesMatchingHrSegment,
  isFemaleGender,
  isMaleGender,
  type EmployeesHrKpiKey,
  type HrChartSegmentKind,
  type HrPeriodMomStats,
} from '@/lib/employees-hr-dashboard';
import { computeSeniority } from '@/lib/employee-columns';
import {
  formatChequeValue,
  formatIncentive,
  highestLongServicePalier,
  isLongServiceDue5Or10,
  LONG_SERVICE_POLICY,
  type LongServiceBeneficiary,
} from '@/lib/politique-longs-etats';
import type { Employee } from '@/lib/types';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChartDeptFilterSource, ChartFilterRenderContext } from '@/components/EnlargeableChartPanel';

interface Props {
  employees: Employee[];
  exits?: Employee[];
  /** Effectif complet (sans filtre période) pour le comparatif mois précédent. */
  allEmployees?: Employee[];
  allExits?: Employee[];
  year?: number | '';
  month?: number | '';
}

const KPI_META = [
  { key: 'total', label: 'Total', glow: 'card-glow-red', format: 'int', watermark: null, drill: 'total' as const },
  { key: 'hommes', label: 'Hommes', glow: 'card-glow-cyan', format: 'int', watermark: 'male' as const, drill: 'hommes' as const },
  { key: 'femmes', label: 'Femmes', glow: 'card-glow-pink', format: 'int', watermark: 'female' as const, drill: 'femmes' as const },
  { key: 'totalContractants', label: 'Total contractant', glow: 'card-glow-violet', format: 'int', watermark: null, drill: 'totalContractants' as const },
  { key: 'ageMoyen', label: 'Âge moyen des employés', glow: 'card-glow-amber', format: '1', watermark: null, drill: 'ageMoyen' as const },
  { key: 'alertesEssai', label: 'Alertes essai (J-30)', glow: 'card-glow-red', format: 'int', watermark: null, drill: 'alertesEssai' as const },
  { key: 'entrees', label: 'Entrées', glow: 'card-glow-violet', format: 'int', watermark: 'in' as const, drill: 'entrees' as const },
  { key: 'totalExits', label: 'Sorties', glow: 'card-glow-green', format: 'int', watermark: 'out' as const, drill: 'totalExits' as const },
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

const AGE_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'age', label: 'Âge' },
  { key: 'genre', label: 'Genre' },
  { key: 'departement', label: 'Département' },
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

const TOTAL_GENERAL_COLUMNS: DashboardListColumn[] = [
  { key: 'origine', label: 'Origine' },
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'departement', label: 'Département' },
  { key: 'genre', label: 'Genre' },
  { key: 'company', label: 'Company / Contractant' },
];

const PPC_SLICE_LABEL = 'PPC';
const CONTRACTANT_DONUT_COLORS = [
  '#2563eb',
  '#0d9488',
  '#f59e0b',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#ea580c',
  '#64748b',
];

type ContractantFirmSlice = {
  label: string;
  count: number;
  rows: DashboardListRow[];
};

type ContractantDashStats = {
  totalContractants: number;
  contractantsFirms: number;
  contractantsPermanents: number;
  contractantsJournaliers: number;
  contractantRows: DashboardListRow[];
  contractantFirms: ContractantFirmSlice[];
};

const EMPTY_CONTRACTANT_STATS: ContractantDashStats = {
  totalContractants: 0,
  contractantsFirms: 0,
  contractantsPermanents: 0,
  contractantsJournaliers: 0,
  contractantRows: [],
  contractantFirms: [],
};

const COMPANY_COLORS = ['#2563eb', '#f59e0b'];
const LOC_COLORS = ['#22d3ee', '#0891b2', '#67e8f9', '#0e7490'];
const MARITAL_COLORS = ['#8b5cf6', '#06b6d4', '#f472b6', '#94a3b8', '#f59e0b'];
const ESSAI_STATUS_COLORS = ['#f59e0b', '#2563eb', '#dc2626', '#16a34a'];
const CDD_DEPT_BAR = 'employees-bar-fill-cdd';
const AGE_BAR_CLASS = 'employees-bar-fill-age';

type KpiWatermarkVariant = 'male' | 'female' | 'in' | 'out';

function KpiWatermark({ variant }: { variant: KpiWatermarkVariant }) {
  return (
    <svg
      className={`employees-hr-card-watermark is-${variant}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      {variant === 'female' ? (
        <>
          <circle cx="12" cy="7.5" r="3.6" />
          <path d="M12 12.2c-4.2 0-6.8 2.3-6.8 5.6V21h13.6v-3.2c0-3.3-2.6-5.6-6.8-5.6z" />
        </>
      ) : variant === 'male' ? (
        <>
          <circle cx="12" cy="7" r="3.6" />
          <path d="M5.8 21v-2c0-3.4 2.8-5.7 6.2-5.7s6.2 2.3 6.2 5.7V21H5.8z" />
        </>
      ) : variant === 'in' ? (
        <>
          <circle cx="8.6" cy="7.1" r="3.15" />
          <path d="M2.8 20.2v-1.85c0-2.85 2.4-4.85 5.8-4.85 3.4 0 5.8 2 5.8 4.85V20.2H2.8z" />
          <path d="M18.15 6.05h-1.7v2.55h-2.55v1.7h2.55v2.55h1.7v-2.55h2.55v-1.7h-2.55V6.05z" />
        </>
      ) : (
        <>
          <circle cx="8.6" cy="7.1" r="3.15" />
          <path d="M2.8 20.2v-1.85c0-2.85 2.4-4.85 5.8-4.85 3.4 0 5.8 2 5.8 4.85V20.2H2.8z" />
          <path d="M14.35 9.15h6.6v1.85h-6.6z" />
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

function genderSharePct(count: number, total: number): string {
  if (!total) return '0%';
  const pct = Math.round((count / total) * 1000) / 10;
  return Number.isInteger(pct)
    ? `${pct}%`
    : `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

function formatMomDelta(delta: number | null): { text: string; trend: 'up' | 'down' | 'flat' } | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const pct = Math.round(delta * 1000) / 10;
  if (pct > 0) return { text: `▲ ${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}% vs préc.`, trend: 'up' };
  if (pct < 0) return { text: `▼ ${Math.abs(pct).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}% vs préc.`, trend: 'down' };
  return { text: '• 0% vs préc.', trend: 'flat' };
}

function formatKpiMeta(
  key: (typeof KPI_META)[number]['key'],
  stats: ReturnType<typeof buildEmployeesHrDashboard> & ContractantDashStats,
  mom?: HrPeriodMomStats | null,
): { lines: string[]; barPct?: number; barClass?: string } {
  const topSite = topRow(stats.parLocalisation);
  const topCompany = topRow(stats.parCompany);
  const topDept = topRow(stats.parDepartement);
  const topGrade = topRow(stats.parGrade);
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
          `Part des effectifs ${genderSharePct(stats.hommes, stats.total)}`,
          `Ratio H/F ${stats.hommes} / ${stats.femmes}`,
          topGrade ? `Grade dominant ${topGrade.label}` : 'Grade —',
        ],
        barPct: stats.total ? (stats.hommes / stats.total) * 100 : 0,
        barClass: 'is-cyan',
      };
    case 'femmes':
      return {
        lines: [
          `Part des effectifs ${genderSharePct(stats.femmes, stats.total)}`,
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
    case 'ageMoyen': {
      const prev =
        mom?.prevAgeMoyen != null
          ? `Mois préc. ${mom.prevAgeMoyen.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ans (${mom.prevPeriodLabel})`
          : 'Mois préc. —';
      const h = mom?.ageHomme != null ? mom.ageHomme.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—';
      const f = mom?.ageFemme != null ? mom.ageFemme.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—';
      return {
        lines: [
          prev,
          `H ${h} ans · F ${f} ans`,
          mom ? mom.periodLabel : 'Période —',
        ],
        barPct: 100,
        barClass: 'is-amber',
      };
    }
    case 'entrees': {
      const prev =
        mom != null
          ? `Mois préc. ${mom.prevEntrees} (${mom.prevPeriodLabel})`
          : 'Mois préc. —';
      return {
        lines: [
          prev,
          mom ? mom.periodLabel : 'Période —',
          mom ? `${mom.present.length} présent${mom.present.length !== 1 ? 's' : ''} fin de mois` : 'Présents —',
        ],
        barPct: mom && (mom.entrees > 0 || mom.prevEntrees > 0)
          ? Math.min(100, (mom.entrees / Math.max(mom.entrees, mom.prevEntrees, 1)) * 100)
          : 0,
        barClass: 'is-violet',
      };
    }
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
          `${stats.total} employés restants`,
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

/** Dashboard RH global — KPIs effectif fin de mois + sorties de la période. */
export default function EmployeesHrDashboardView({
  employees,
  exits = [],
  allEmployees,
  allExits,
  year,
  month,
}: Props) {
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
        const firms: ContractantFirmSlice[] = [];
        for (const c of list) {
          const emps = Array.isArray(c.employees) ? c.employees : [];
          const firmLabel = String(c.denomination || '').trim() || '—';
          const firmRows: DashboardListRow[] = [];
          for (const e of emps) {
            const statut = String(e.statut || 'Permanent');
            if (statut === 'Journalier') journaliers += 1;
            else permanents += 1;
            const row: DashboardListRow = {
              id: `${c.id}-${e.id}`,
              cells: {
                nom: e.nom || '—',
                contractant: firmLabel,
                sexe: e.sexe || '—',
                lieu: e.lieuAffectation || '—',
                fonction: e.fonction || '—',
                statut,
              },
            };
            rows.push(row);
            firmRows.push(row);
          }
          firms.push({
            label: firmLabel,
            count: firmRows.length,
            rows: firmRows,
          });
        }
        firms.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
        if (!cancelled) {
          setContractantStats({
            totalContractants: permanents + journaliers,
            contractantsFirms: list.length,
            contractantsPermanents: permanents,
            contractantsJournaliers: journaliers,
            contractantRows: rows,
            contractantFirms: firms,
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
  const momStats = useMemo(() => {
    const now = new Date();
    const y = typeof year === 'number' ? year : now.getFullYear();
    const m =
      typeof month === 'number'
        ? month
        : typeof year === 'number' && year < now.getFullYear()
          ? 12
          : now.getMonth() + 1;
    return buildHrPeriodMomStats(allEmployees ?? employees, allExits ?? exits, y, m);
  }, [allEmployees, allExits, employees, exits, year, month]);
  const workforce = employees;
  const [drilldown, setDrilldown] = useState<{
    title: string;
    columns: DashboardListColumn[];
    rows: DashboardListRow[];
  } | null>(null);

  const fmt = (key: (typeof KPI_META)[number]['key'], format: string) => {
    if (key === 'ageMoyen') {
      if (momStats.ageMoyen == null) return '—';
      return `${momStats.ageMoyen.toLocaleString('fr-FR', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      })}`;
    }
    if (key === 'entrees') return String(momStats.entrees);
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
    if (key === 'ageMoyen') return momStats.ageMoyen != null ? 'ans' : null;
    if (key === 'entrees') return null;
    if (key === 'hommes') {
      const pct = genderSharePct(stats.hommes, stats.total);
      return pct ? `${pct} des emp.` : null;
    }
    if (key === 'femmes') {
      const pct = genderSharePct(stats.femmes, stats.total);
      return pct ? `${pct} des emp.` : null;
    }
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

  const momDelta = (key: (typeof KPI_META)[number]['key']) => {
    if (key === 'ageMoyen') return formatMomDelta(momStats.ageDeltaPct);
    if (key === 'entrees') return formatMomDelta(momStats.entreesDeltaPct);
    return null;
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
    if (key === 'ageMoyen') {
      setDrilldown({
        title: `Âge moyen des employés — ${momStats.periodLabel}`,
        columns: AGE_COLUMNS,
        rows: momStats.present.map(employeeToDashboardListRow),
      });
      return;
    }
    if (key === 'entrees') {
      setDrilldown({
        title: `Entrées — ${momStats.periodLabel}`,
        columns: ACTIVE_COLUMNS,
        rows: momStats.hires.map(employeeToDashboardListRow),
      });
      return;
    }
    const list = employeesForHrKpi(employees, exits, key);
    const columns =
      key === 'totalExits'
        ? EXIT_COLUMNS
        : key === 'alertesEssai'
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

  const ppcLocRows = useMemo(
    () => buildPpcLocalisationGenderRows(employees),
    [employees],
  );

  const longServiceAlerts = useMemo(() => {
    const asOf = new Date();
    const list: LongServiceBeneficiary[] = [];
    for (const employee of employees) {
      if (/^inact/i.test(employee.statut || '')) continue;
      const seniority = computeSeniority(employee.appointmentDate || '', asOf);
      if (!seniority || !isLongServiceDue5Or10(seniority.years, seniority.months)) continue;
      const palier = highestLongServicePalier(seniority.years);
      if (!palier) continue;
      list.push({
        matricule: employee.matricule,
        nom: employee.nom,
        departement: employee.departement,
        localisation: employee.localisation,
        appointmentDate: employee.appointmentDate,
        years: seniority.years,
        months: seniority.months,
        palier,
      });
    }
    list.sort((a, b) => {
      if (b.years !== a.years) return b.years - a.years;
      return a.nom.localeCompare(b.nom, 'fr');
    });
    return list;
  }, [employees]);

  const ppcToGeneralRow = (employee: Employee): DashboardListRow => {
    const base = employeeToDashboardListRow(employee);
    return {
      id: `ppc-${base.id}`,
      cells: {
        origine: PPC_SLICE_LABEL,
        matricule: base.cells.matricule,
        nom: base.cells.nom,
        localisation: base.cells.localisation,
        departement: base.cells.departement,
        genre: base.cells.genre,
        company: base.cells.company,
      },
    };
  };

  const contractantToGeneralRow = (row: DashboardListRow): DashboardListRow => ({
    id: `c-${row.id}`,
    cells: {
      origine: String(row.cells.contractant ?? '—'),
      matricule: '—',
      nom: row.cells.nom,
      localisation: row.cells.lieu,
      departement: '—',
      genre: row.cells.sexe,
      company: row.cells.contractant,
    },
  });

  const totalGeneralItems = useMemo(
    () => [
      { label: PPC_SLICE_LABEL, count: employees.length },
      ...contractantStats.contractantFirms
        .filter((firm) => firm.count > 0)
        .map((firm) => ({ label: firm.label, count: firm.count })),
    ].filter((row) => row.count > 0),
    [employees.length, contractantStats.contractantFirms],
  );

  const totalGeneralColors = useMemo(
    () => ['#e30613', ...CONTRACTANT_DONUT_COLORS],
    [],
  );

  const openTotalGeneral = (label?: string, ppcPool?: Employee[]) => {
    const ppcList = ppcPool ?? employees;
    if (!label || label === 'Total général') {
      setDrilldown({
        title: 'Total général — PPC et contractants',
        columns: TOTAL_GENERAL_COLUMNS,
        rows: [
          ...ppcList.map(ppcToGeneralRow),
          ...contractantStats.contractantRows.map(contractantToGeneralRow),
        ],
      });
      return;
    }
    if (label === PPC_SLICE_LABEL) {
      setDrilldown({
        title: `Total général — ${PPC_SLICE_LABEL}`,
        columns: TOTAL_GENERAL_COLUMNS,
        rows: ppcList.map(ppcToGeneralRow),
      });
      return;
    }
    const firm = contractantStats.contractantFirms.find((f) => f.label === label);
    setDrilldown({
      title: `Total général — ${label}`,
      columns: TOTAL_GENERAL_COLUMNS,
      rows: (firm?.rows ?? []).map(contractantToGeneralRow),
    });
  };

  const openPpcLocCell = (
    pool: Employee[],
    localisation: string,
    gender: 'hommes' | 'femmes' | 'total',
  ) => {
    let list = employeesMatchingHrSegment(pool, 'localisation', localisation);
    if (gender === 'hommes') list = list.filter((e) => isMaleGender(e.gender));
    if (gender === 'femmes') list = list.filter((e) => isFemaleGender(e.gender));
    const genderLabel =
      gender === 'hommes' ? 'Hommes' : gender === 'femmes' ? 'Femmes' : 'Total';
    setDrilldown({
      title: `PPC · ${localisation} · ${genderLabel}`,
      columns: ACTIVE_COLUMNS,
      rows: list.map(employeeToDashboardListRow),
    });
  };

  const ppcLocDeptFilter = (
    build: (emps: Employee[], ctx: ChartFilterRenderContext) => ReactNode,
  ): ChartDeptFilterSource => ({
    employees,
    renderFiltered: build,
    showGenderLegend: true,
    resolveSegment: (emps, label) => employeesMatchingHrSegment(emps, 'localisation', label),
    toListRow: employeeToDashboardListRow,
    segmentColumns: ACTIVE_COLUMNS,
    segmentTitle: (label) => `PPC · ${label}`,
  });

  return (
    <div className="travel-history-dashboard employees-hr-dashboard">
      <div className="travel-history-cards employees-hr-cards">
        {KPI_META.map((kpi) => {
          const isContractantsLoading = kpi.key === 'totalContractants' && contractantsLoading;
          const className = `card card-glow ${kpi.glow} travel-history-card employees-hr-card${kpi.watermark ? ' has-watermark' : ''} dependants-kpi-clickable${kpi.key === 'alertesEssai' && stats.alertesEssai > 0 ? ' is-alert' : ''}${isContractantsLoading ? ' is-loading' : ''}`;
          const pct = isContractantsLoading ? null : pctLabel(kpi.key);
          const delta = isContractantsLoading ? null : momDelta(kpi.key);
          const meta = isContractantsLoading
            ? { lines: [] as string[] }
            : formatKpiMeta(kpi.key, stats, momStats);
          return (
            <button
              key={kpi.key}
              type="button"
              className={className}
              onClick={() => openKpi(kpi.drill, kpi.label)}
              title={`Voir la liste — ${kpi.label}`}
              disabled={isContractantsLoading}
            >
              {kpi.watermark && <KpiWatermark variant={kpi.watermark} />}
              <div className="employees-hr-card-body">
                <div className="card-label">{kpi.label}</div>
                <div className="card-value">
                  {isContractantsLoading ? (
                    <span className="btn-spinner employees-hr-card-spinner" aria-label="Chargement" />
                  ) : (
                    <>
                      {fmt(kpi.key, kpi.format)}
                      {pct ? <span className="employees-hr-card-pct">{pct}</span> : null}
                      {delta ? (
                        <span className={`employees-hr-card-delta is-${delta.trend}`}>{delta.text}</span>
                      ) : null}
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
            </button>
          );
        })}
      </div>

      <div className="employees-charts-grid">
        <EmployeesPpcLocGenderTable
          title="Total employé PPC par localisation"
          rows={ppcLocRows}
          deptFilter={ppcLocDeptFilter((emps, ctx) => (
            <EmployeesPpcLocGenderTableBody
              rows={buildPpcLocalisationGenderRows(emps)}
              onCellClick={(localisation, gender) => {
                if (gender === 'total') {
                  ctx.onSegmentClick?.(localisation);
                  return;
                }
                openPpcLocCell(emps, localisation, gender);
              }}
            />
          ))}
        />
        <EmployeesPieChart
          title="Total général (PPC et contractants)"
          items={totalGeneralItems}
          colors={totalGeneralColors}
          deptFilter={{
            employees,
            showGenderLegend: true,
            resolveSegment: (emps, label) =>
              label === PPC_SLICE_LABEL ? emps : [],
            toListRow: (employee) => ppcToGeneralRow(employee),
            segmentColumns: TOTAL_GENERAL_COLUMNS,
            segmentTitle: (label) => `Total général — ${label}`,
            renderFiltered: (emps, ctx) => (
              <EmployeesPieChartBody
                items={[
                  { label: PPC_SLICE_LABEL, count: emps.length },
                  ...contractantStats.contractantFirms
                    .filter((firm) => firm.count > 0)
                    .map((firm) => ({ label: firm.label, count: firm.count })),
                ].filter((row) => row.count > 0)}
                colors={totalGeneralColors}
                onItemClick={(label) => {
                  if (label === PPC_SLICE_LABEL) {
                    ctx.onSegmentClick?.(label);
                    return;
                  }
                  openTotalGeneral(label, emps);
                }}
              />
            ),
          }}
        />
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

      <div className="employees-latest-and-alerts">
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

        <div className="panel employees-long-service-alerts-panel">
          <div className="panel-head">
            <div>
              <h3>{LONG_SERVICE_POLICY.title}</h3>
              <p className="employees-latest-hires-hint">
                5 et 10 ans · 0 mois ce mois-ci · {longServiceAlerts.length} agent
                {longServiceAlerts.length > 1 ? 's' : ''}
              </p>
            </div>
            <Link
              href="/politique/longs-etats-de-service"
              className="btn btn-ghost employees-latest-hires-open"
              prefetch={false}
            >
              Voir
            </Link>
          </div>
          {longServiceAlerts.length === 0 ? (
            <p className="empty-state">Aucun agent à 5 ou 10 ans pile ce mois-ci.</p>
          ) : (
            <div className="employees-latest-hires-table-wrap">
              <table className="employees-latest-hires-table employees-long-service-alerts-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Palier</th>
                    <th>Avantages</th>
                  </tr>
                </thead>
                <tbody>
                  {longServiceAlerts.map((row) => (
                    <tr key={row.matricule} className="politique-row-zero-mois">
                      <td>
                        <strong>{row.nom}</strong>
                        <span className="politique-row-meta">
                          {row.matricule} · {row.departement || '—'}
                        </span>
                        <span className="politique-row-meta">
                          {row.years} an(s) ({row.months} mois)
                        </span>
                      </td>
                      <td>
                        <span className="politique-palier">
                          {row.palier.years} ans ({row.months} mois)
                        </span>
                      </td>
                      <td>
                        <span className="politique-row-meta">
                          {row.palier.sacs} sacs · {formatChequeValue(row.palier.cheque)}
                        </span>
                        <span className="politique-row-meta">
                          Incitatif {formatIncentive(row.palier.incentivePct)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
