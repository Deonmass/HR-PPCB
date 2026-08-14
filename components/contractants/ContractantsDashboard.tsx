'use client';

import { useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import HomeDonutChart from '@/components/home/HomeDonutChart';
import {
  CONTRACTANT_ETATS_CIVILS,
  etatCivilLabel,
  resolveContractantServiceStyle,
  type Contractant,
  type ContractantEmployee,
} from '@/lib/contractants-types';
import { DEFAULT_LOCALISATIONS } from '@/lib/localisations';

type FlatEmployee = ContractantEmployee & {
  contractantId: string;
  contractantNom: string;
  typeService: string;
};

type DrillKind =
  | 'contractants'
  | 'all'
  | 'hommes'
  | 'femmes'
  | 'permanents'
  | 'journaliers'
  | 'contractant'
  | 'sexe'
  | 'statut'
  | 'etatCivil'
  | 'lieu'
  | 'departement'
  | 'fonction'
  | 'service'
  | 'month';

interface DrillState {
  kind: DrillKind;
  label: string;
  value?: string;
  /** Pour drill mois : 1–12 */
  month?: number;
  year?: number;
}

interface Props {
  contractants: Contractant[];
  employees: FlatEmployee[];
}

const EMP_COLUMNS: DashboardListColumn[] = [
  { key: 'nom', label: 'Noms' },
  { key: 'contractant', label: 'Contractant' },
  { key: 'sexe', label: 'Sexe' },
  { key: 'lieu', label: 'Lieu' },
  { key: 'fonction', label: 'Fonction' },
  { key: 'departement', label: 'Dépt.' },
  { key: 'telephone', label: 'Tél.' },
  { key: 'etatCivil', label: 'État civil' },
  { key: 'statut', label: 'Statut' },
];

const CONTRACTANT_COLUMNS: DashboardListColumn[] = [
  { key: 'denomination', label: 'Dénomination' },
  { key: 'typeService', label: 'Type de service' },
  { key: 'employes', label: 'Employés', align: 'right' },
  { key: 'hommes', label: 'H', align: 'right' },
  { key: 'femmes', label: 'F', align: 'right' },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'Janvier' },
  { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' },
  { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' },
  { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Décembre' },
] as const;

const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const SEX_COLORS = { M: '#22d3ee', F: '#f472b6' } as const;
const STATUT_COLORS = { Permanent: '#0d9488', Journalier: '#f59e0b' } as const;
const ETAT_COLORS: Record<string, string> = {
  M: '#8b5cf6',
  C: '#06b6d4',
  V: '#f472b6',
  D: '#94a3b8',
};
const PALETTE = ['#e30613', '#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#db2777', '#0891b2', '#ea580c'];

function blank(value: string): string {
  const v = value.trim();
  return v || 'Non renseigné';
}

function createdAtMs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Présent à la fin de l’année / du mois (basé sur createdAt, pas de date de sortie). */
function isPresentAt(
  employee: FlatEmployee,
  year: number | '',
  month: number | '',
): boolean {
  if (year === '') return true;
  const t = createdAtMs(employee.createdAt);
  if (t == null) return true;
  const end =
    month !== ''
      ? new Date(year, month, 0, 23, 59, 59, 999)
      : new Date(year, 11, 31, 23, 59, 59, 999);
  return t <= end.getTime();
}

function countBy(
  rows: FlatEmployee[],
  keyFn: (e: FlatEmployee) => string,
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = blank(keyFn(row));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
}

function toDonutSlices(
  rows: { label: string; count: number }[],
  colors?: string[],
  max?: number,
) {
  let list = rows.filter((r) => r.count > 0);
  if (max != null && list.length > max) {
    const top = list.slice(0, max);
    const rest = list.slice(max).reduce((sum, r) => sum + r.count, 0);
    list = rest > 0 ? [...top, { label: 'Autres', count: rest }] : top;
  }
  return list.map((r, i) => ({
    label: r.label,
    value: r.count,
    color: colors?.[i % (colors?.length || 1)] || PALETTE[i % PALETTE.length]!,
  }));
}

function toEmployeeRows(list: FlatEmployee[]): DashboardListRow[] {
  return list.map((e) => ({
    id: `${e.contractantId}-${e.id}`,
    cells: {
      nom: e.nom,
      sexe: e.sexe || '—',
      lieu: e.lieuAffectation || '—',
      fonction: e.fonction || '—',
      departement: e.departement || '—',
      telephone: e.telephone || '—',
      etatCivil: etatCivilLabel(e.etatCivil),
      statut: e.statut,
      contractant: e.contractantNom,
    },
  }));
}

function sexeLabelToCode(label: string): string {
  if (label === 'Hommes' || label === 'M') return 'M';
  if (label === 'Femmes' || label === 'F') return 'F';
  if (label === 'Non renseigné' || label === '—') return '';
  return label;
}

function etatLabelToCode(label: string): string {
  const known = CONTRACTANT_ETATS_CIVILS.find(
    (x) => x.label === label || x.id === label,
  );
  return known?.id || label;
}

export default function ContractantsDashboard({ contractants, employees }: Props) {
  const currentYear = new Date().getFullYear();
  const [contractantFilter, setContractantFilter] = useState('');
  const [localisationFilter, setLocalisationFilter] = useState('');
  const [yearFilter, setYearFilter] = useState<number | ''>('');
  const [monthFilter, setMonthFilter] = useState<number | ''>('');
  const [drill, setDrill] = useState<DrillState | null>(null);

  const localisationOptions = useMemo(() => [...DEFAULT_LOCALISATIONS], []);

  const yearOptions = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const e of employees) {
      const t = createdAtMs(e.createdAt);
      if (t != null) years.add(new Date(t).getFullYear());
    }
    for (const c of contractants) {
      const t = createdAtMs(c.createdAt);
      if (t != null) years.add(new Date(t).getFullYear());
    }
    return [...years].sort((a, b) => b - a);
  }, [employees, contractants, currentYear]);

  const baseEmployees = useMemo(() => {
    let rows = employees;
    if (contractantFilter) {
      rows = rows.filter((e) => e.contractantId === contractantFilter);
    }
    if (localisationFilter) {
      rows = rows.filter(
        (e) => e.lieuAffectation.trim().toLowerCase() === localisationFilter.trim().toLowerCase(),
      );
    }
    return rows;
  }, [employees, contractantFilter, localisationFilter]);

  const filteredEmployees = useMemo(
    () => baseEmployees.filter((e) => isPresentAt(e, yearFilter, monthFilter)),
    [baseEmployees, yearFilter, monthFilter],
  );

  const filteredContractants = useMemo(() => {
    if (contractantFilter) {
      return contractants.filter((c) => c.id === contractantFilter);
    }
    const ids = new Set(filteredEmployees.map((e) => e.contractantId));
    if (yearFilter !== '' || monthFilter !== '') {
      return contractants.filter((c) => ids.has(c.id));
    }
    return contractants;
  }, [contractants, contractantFilter, filteredEmployees, yearFilter, monthFilter]);

  const currentMonth = new Date().getMonth() + 1;
  const evolutionYear = yearFilter === '' ? currentYear : yearFilter;

  const monthlyEvolution = useMemo(() => {
    return MONTH_OPTIONS.map((m) => {
      const isFuture =
        evolutionYear > currentYear
        || (evolutionYear === currentYear && m.value > currentMonth);
      if (isFuture) {
        return {
          label: MONTH_SHORT[m.value - 1]!,
          value: 0,
          month: m.value,
          future: true,
        };
      }
      const count = baseEmployees.filter((e) => isPresentAt(e, evolutionYear, m.value)).length;
      return {
        label: MONTH_SHORT[m.value - 1]!,
        value: count,
        month: m.value,
        future: false,
      };
    });
  }, [baseEmployees, evolutionYear, currentYear, currentMonth]);

  const stats = useMemo(() => {
    const hommes = filteredEmployees.filter((e) => e.sexe === 'M').length;
    const femmes = filteredEmployees.filter((e) => e.sexe === 'F').length;
    const permanents = filteredEmployees.filter((e) => e.statut === 'Permanent').length;
    const journaliers = filteredEmployees.filter((e) => e.statut === 'Journalier').length;
    return {
      contractants: filteredContractants.length,
      employes: filteredEmployees.length,
      hommes,
      femmes,
      permanents,
      journaliers,
      parContractant: countBy(filteredEmployees, (e) => e.contractantNom),
      parSexe: countBy(filteredEmployees, (e) => e.sexe),
      parStatut: countBy(filteredEmployees, (e) => e.statut),
      parEtatCivil: countBy(filteredEmployees, (e) => e.etatCivil),
      parLieu: countBy(filteredEmployees, (e) => e.lieuAffectation),
      parDepartement: countBy(filteredEmployees, (e) => e.departement),
      parFonction: countBy(filteredEmployees, (e) => e.fonction),
      parService: countBy(filteredEmployees, (e) => e.typeService),
    };
  }, [filteredEmployees, filteredContractants]);

  const contractantColors = useMemo(() => {
    return stats.parContractant.map((row) => {
      const c = contractants.find((x) => x.denomination === row.label);
      return resolveContractantServiceStyle(c?.typeService || '').color;
    });
  }, [stats.parContractant, contractants]);

  const contractantSlices = useMemo(
    () => toDonutSlices(stats.parContractant, contractantColors),
    [stats.parContractant, contractantColors],
  );

  const lieuSlices = useMemo(
    () => toDonutSlices(stats.parLieu, PALETTE),
    [stats.parLieu],
  );

  const departementSlices = useMemo(
    () => toDonutSlices(stats.parDepartement, PALETTE, 8),
    [stats.parDepartement],
  );

  const fonctionSlices = useMemo(
    () => toDonutSlices(stats.parFonction, PALETTE, 8),
    [stats.parFonction],
  );

  const sexeSlices = useMemo(
    () =>
      stats.parSexe.map((r) => ({
        label:
          r.label === 'M'
            ? 'Hommes'
            : r.label === 'F'
              ? 'Femmes'
              : r.label === 'Non renseigné'
                ? 'Non renseigné'
                : r.label,
        value: r.count,
        color:
          r.label === 'M'
            ? SEX_COLORS.M
            : r.label === 'F'
              ? SEX_COLORS.F
              : '#94a3b8',
      })),
    [stats.parSexe],
  );

  const statutSlices = useMemo(
    () =>
      stats.parStatut.map((r) => ({
        label: r.label,
        value: r.count,
        color:
          r.label === 'Permanent'
            ? STATUT_COLORS.Permanent
            : r.label === 'Journalier'
              ? STATUT_COLORS.Journalier
              : '#94a3b8',
      })),
    [stats.parStatut],
  );

  const etatSlices = useMemo(
    () =>
      stats.parEtatCivil.map((r) => {
        const known = CONTRACTANT_ETATS_CIVILS.find((x) => x.id === r.label);
        return {
          label: known?.label || etatCivilLabel(r.label),
          value: r.count,
          color: ETAT_COLORS[r.label] || '#94a3b8',
        };
      }),
    [stats.parEtatCivil],
  );

  const serviceSlices = useMemo(
    () =>
      stats.parService.map((r, i) => ({
        label: r.label,
        value: r.count,
        color: resolveContractantServiceStyle(r.label).color || PALETTE[i % PALETTE.length],
      })),
    [stats.parService],
  );

  const openDrill = (next: DrillState) => setDrill(next);

  const drillEmployeeRows = useMemo(() => {
    if (!drill || drill.kind === 'contractants') return [];
    let list = filteredEmployees;
    switch (drill.kind) {
      case 'all':
        break;
      case 'hommes':
        list = list.filter((e) => e.sexe === 'M');
        break;
      case 'femmes':
        list = list.filter((e) => e.sexe === 'F');
        break;
      case 'permanents':
        list = list.filter((e) => e.statut === 'Permanent');
        break;
      case 'journaliers':
        list = list.filter((e) => e.statut === 'Journalier');
        break;
      case 'contractant':
        list = list.filter((e) => e.contractantNom === drill.value);
        break;
      case 'sexe':
        list = list.filter((e) => (e.sexe || '') === sexeLabelToCode(drill.value || ''));
        break;
      case 'statut':
        list = list.filter((e) => e.statut === drill.value);
        break;
      case 'etatCivil':
        list = list.filter((e) => e.etatCivil === etatLabelToCode(drill.value || ''));
        break;
      case 'lieu':
        list = list.filter((e) => blank(e.lieuAffectation) === drill.value);
        break;
      case 'departement':
        list = list.filter((e) => blank(e.departement) === drill.value);
        break;
      case 'fonction':
        list = list.filter((e) => blank(e.fonction) === drill.value);
        break;
      case 'service':
        list = list.filter((e) => blank(e.typeService) === drill.value);
        break;
      case 'month': {
        const y = drill.year ?? evolutionYear;
        const m = drill.month ?? 1;
        list = baseEmployees.filter((e) => isPresentAt(e, y, m));
        break;
      }
      default:
        break;
    }
    return toEmployeeRows(list);
  }, [drill, filteredEmployees, baseEmployees, evolutionYear]);

  const drillContractantRows = useMemo((): DashboardListRow[] => {
    if (!drill || drill.kind !== 'contractants') return [];
    return filteredContractants.map((c) => {
      const emps = filteredEmployees.filter((e) => e.contractantId === c.id);
      return {
        id: c.id,
        cells: {
          denomination: c.denomination,
          typeService: c.typeService || '—',
          employes: emps.length,
          hommes: emps.filter((e) => e.sexe === 'M').length,
          femmes: emps.filter((e) => e.sexe === 'F').length,
        },
      };
    });
  }, [drill, filteredContractants, filteredEmployees]);

  const periodHint = useMemo(() => {
    if (yearFilter === '') return 'Toutes périodes';
    if (monthFilter === '') return `Année ${yearFilter}`;
    const m = MONTH_OPTIONS.find((x) => x.value === monthFilter)?.label || '';
    return `${m} ${yearFilter}`;
  }, [yearFilter, monthFilter]);

  const kpiCards = [
    {
      key: 'contractants',
      label: 'Contractants',
      value: stats.contractants,
      glow: 'card-glow-red',
      detail: periodHint,
      onClick: () => openDrill({ kind: 'contractants', label: 'Contractants' }),
    },
    {
      key: 'employes',
      label: 'Employés',
      value: stats.employes,
      glow: 'card-glow-cyan',
      detail: stats.parContractant[0]
        ? `Top · ${stats.parContractant[0].label} (${stats.parContractant[0].count})`
        : 'Aucun employé',
      onClick: () => openDrill({ kind: 'all', label: 'Tous les employés' }),
    },
    {
      key: 'hommes',
      label: 'Hommes',
      value: stats.hommes,
      glow: 'card-glow-cyan',
      detail: stats.employes
        ? `${Math.round((stats.hommes / stats.employes) * 100)}% des effectifs`
        : '—',
      onClick: () => openDrill({ kind: 'hommes', label: 'Hommes' }),
    },
    {
      key: 'femmes',
      label: 'Femmes',
      value: stats.femmes,
      glow: 'card-glow-pink',
      detail: stats.employes
        ? `${Math.round((stats.femmes / stats.employes) * 100)}% des effectifs`
        : '—',
      onClick: () => openDrill({ kind: 'femmes', label: 'Femmes' }),
    },
    {
      key: 'permanents',
      label: 'Permanents',
      value: stats.permanents,
      glow: 'card-glow-green',
      detail: stats.employes
        ? `${Math.round((stats.permanents / stats.employes) * 100)}% des effectifs`
        : '—',
      onClick: () => openDrill({ kind: 'permanents', label: 'Permanents' }),
    },
    {
      key: 'journaliers',
      label: 'Journaliers',
      value: stats.journaliers,
      glow: 'card-glow-amber',
      detail: stats.employes
        ? `${Math.round((stats.journaliers / stats.employes) * 100)}% des effectifs`
        : '—',
      onClick: () => openDrill({ kind: 'journaliers', label: 'Journaliers' }),
    },
  ];

  return (
    <div className="contractants-dashboard">
      <div className="contractants-dash-filters">
        <select
          className="filter-select"
          value={contractantFilter}
          onChange={(e) => setContractantFilter(e.target.value)}
          title="Filtrer par contractant"
        >
          <option value="">Tous les contractants</option>
          {contractants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.denomination}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={localisationFilter}
          onChange={(e) => setLocalisationFilter(e.target.value)}
          title="Filtrer par localisation"
        >
          <option value="">Toutes les localisations</option>
          {localisationOptions.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={yearFilter === '' ? '' : String(yearFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setYearFilter(v ? Number(v) : '');
            if (!v) setMonthFilter('');
          }}
          title="Filtrer par année de présence"
        >
          <option value="">Toutes les années</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={monthFilter === '' ? '' : String(monthFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setMonthFilter(v ? Number(v) : '');
          }}
          disabled={yearFilter === ''}
          title={
            yearFilter === ''
              ? 'Choisissez d’abord une année'
              : 'Filtrer par mois de présence'
          }
        >
          <option value="">Tous les mois</option>
          {MONTH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="contractants-kpi-row">
        {kpiCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`card card-glow ${card.glow} contractants-kpi is-clickable`}
            onClick={card.onClick}
          >
            <div className="card-label">{card.label}</div>
            <div className="card-value">{card.value}</div>
            <div className="contractants-kpi-detail">{card.detail}</div>
          </button>
        ))}
      </div>

      <div className="contractants-evolution-wrap">
        <DependantsBarChart
          title={`Évolution de l’effectif — ${evolutionYear}`}
          items={monthlyEvolution.map((m) => ({ label: m.label, value: m.value }))}
          fitAll
          compact
          formatValue={(v) => (v > 0 ? String(v) : '')}
          onItemClick={(label) => {
            const item = monthlyEvolution.find((m) => m.label === label);
            if (!item || item.future || item.value <= 0) return;
            const month = item.month;
            const monthName = MONTH_OPTIONS.find((m) => m.value === month)?.label || label;
            openDrill({
              kind: 'month',
              label: `Effectif · ${monthName} ${evolutionYear}`,
              month,
              year: evolutionYear,
            });
          }}
        />
      </div>

      <div className="contractants-charts-grid home-charts-grid">
        <HomeDonutChart
          title="Par contractant"
          slices={contractantSlices}
          centerLabel="Employés"
          emptyLabel="Aucun employé"
          onTitleClick={() => openDrill({ kind: 'all', label: 'Par contractant' })}
          onItemClick={(label) =>
            openDrill({ kind: 'contractant', label: `Contractant · ${label}`, value: label })
          }
        />
        <HomeDonutChart
          title="Type de service"
          slices={serviceSlices}
          centerLabel="Employés"
          emptyLabel="Aucun type de service"
          onTitleClick={() => openDrill({ kind: 'all', label: 'Type de service' })}
          onItemClick={(label) =>
            openDrill({ kind: 'service', label: `Service · ${label}`, value: label })
          }
        />
        <HomeDonutChart
          title="Par lieu d'affectation"
          slices={lieuSlices}
          centerLabel="Employés"
          emptyLabel="Aucun lieu renseigné"
          onTitleClick={() => openDrill({ kind: 'all', label: "Par lieu d'affectation" })}
          onItemClick={(label) =>
            openDrill({ kind: 'lieu', label: `Lieu · ${label}`, value: label })
          }
        />
        <HomeDonutChart
          title="Par département"
          slices={departementSlices}
          centerLabel="Employés"
          emptyLabel="Aucun département"
          onTitleClick={() => openDrill({ kind: 'all', label: 'Par département' })}
          onItemClick={(label) => {
            if (label === 'Autres') {
              openDrill({ kind: 'all', label: 'Par département' });
              return;
            }
            openDrill({ kind: 'departement', label: `Département · ${label}`, value: label });
          }}
        />
        <HomeDonutChart
          title="Par fonction"
          slices={fonctionSlices}
          centerLabel="Employés"
          emptyLabel="Aucune fonction"
          onTitleClick={() => openDrill({ kind: 'all', label: 'Par fonction' })}
          onItemClick={(label) => {
            if (label === 'Autres') {
              openDrill({ kind: 'all', label: 'Par fonction' });
              return;
            }
            openDrill({ kind: 'fonction', label: `Fonction · ${label}`, value: label });
          }}
        />
        <HomeDonutChart
          title="Répartition par sexe"
          slices={sexeSlices}
          centerLabel="Total"
          emptyLabel="Aucun employé"
          onTitleClick={() => openDrill({ kind: 'all', label: 'Répartition par sexe' })}
          onItemClick={(label) =>
            openDrill({ kind: 'sexe', label: `Sexe · ${label}`, value: label })
          }
        />
        <HomeDonutChart
          title="Statut (Permanent / Journalier)"
          slices={statutSlices}
          centerLabel="Total"
          emptyLabel="Aucun employé"
          onTitleClick={() => openDrill({ kind: 'all', label: 'Statut' })}
          onItemClick={(label) =>
            openDrill({ kind: 'statut', label: `Statut · ${label}`, value: label })
          }
        />
        <HomeDonutChart
          title="État civil"
          slices={etatSlices}
          centerLabel="Total"
          emptyLabel="Aucun employé"
          onTitleClick={() => openDrill({ kind: 'all', label: 'État civil' })}
          onItemClick={(label) =>
            openDrill({ kind: 'etatCivil', label: `État civil · ${label}`, value: label })
          }
        />
      </div>

      {drill && drill.kind === 'contractants' && (
        <DashboardListModal
          title={drill.label}
          columns={CONTRACTANT_COLUMNS}
          rows={drillContractantRows}
          onClose={() => setDrill(null)}
          searchPlaceholder="Rechercher un contractant…"
        />
      )}

      {drill && drill.kind !== 'contractants' && (
        <DashboardListModal
          title={drill.label}
          columns={EMP_COLUMNS}
          rows={drillEmployeeRows}
          onClose={() => setDrill(null)}
          searchPlaceholder="Rechercher un employé…"
        />
      )}
    </div>
  );
}
