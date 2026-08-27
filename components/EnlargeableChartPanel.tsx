'use client';

import { useMemo, useState, type ReactNode } from 'react';
import ChartChipFilter from '@/components/ChartChipFilter';
import ChartGenderLegend, {
  countByGender,
  genderBucket,
  type GenderFilterValue,
} from '@/components/ChartGenderLegend';
import ChartEnlargeModal, { ChartEnlargeButton } from '@/components/ChartEnlargeModal';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import type { Employee } from '@/lib/types';

export interface ChartFilterRenderContext {
  onSegmentClick?: (label: string) => void;
}

export interface ChartDeptFilterSource {
  employees: Employee[];
  /** Reconstruit le contenu du graphique pour le sous-ensemble filtré. */
  renderFiltered: (employees: Employee[], ctx: ChartFilterRenderContext) => ReactNode;
  /**
   * Affiche le filtre Sexe (défaut : true).
   * Passer false pour le masquer.
   */
  showGenderLegend?: boolean;
  /** Résout la liste derrière un segment cliqué (barre / part). */
  resolveSegment?: (employees: Employee[], label: string) => Employee[];
  /** Colonnes du modal de détail (défaut : colonnes actives standard). */
  segmentColumns?: DashboardListColumn[];
  /** Titre du modal de détail. */
  segmentTitle?: (label: string) => string;
  /** Mappe un employé vers une ligne de liste. */
  toListRow?: (employee: Employee) => DashboardListRow;
}

interface Props {
  title: string;
  className?: string;
  /** Contenu additionnel dans l’en-tête (légende, filtre…). */
  headExtra?: ReactNode;
  /** Clic sur le panneau entier → agrandir (désactiver si interactions internes). */
  clickToEnlarge?: boolean;
  children: ReactNode;
  /**
   * Si fourni, le modal agrandi affiche Sexe + Company + Départements
   * et reconstruit le graphique selon les filtres.
   */
  deptFilter?: ChartDeptFilterSource;
}

const DEFAULT_SEGMENT_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'departement', label: 'Département' },
  { key: 'grade', label: 'Grade' },
  { key: 'genre', label: 'Genre' },
  { key: 'company', label: 'Company' },
  { key: 'embauche', label: 'Date d\'embauche' },
];

function defaultToListRow(employee: Employee): DashboardListRow {
  return {
    id: employee.matricule || employee.nom,
    cells: {
      matricule: employee.matricule || '—',
      nom: employee.nom || '—',
      localisation: employee.localisation || '—',
      departement: employee.departement || '—',
      grade: employee.grade || '—',
      genre: employee.gender || '—',
      company: employee.company || '—',
      embauche: employee.appointmentDate || '—',
      nationalite: employee.nationality || '—',
      raison: employee.raisonExit || '—',
    },
  };
}

function countByField(
  employees: Employee[],
  pick: (employee: Employee) => string,
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const employee of employees) {
    const name = pick(employee);
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
}

function companyLabel(employee: Employee): string {
  return employee.company?.trim() || '—';
}

function departmentLabel(employee: Employee): string {
  return employee.departement?.trim() || '—';
}

function localisationLabel(employee: Employee): string {
  return employee.localisation?.trim() || 'Non renseigné';
}

function matchesGender(employee: Employee, selected: GenderFilterValue): boolean {
  if (!selected) return true;
  return genderBucket(employee.gender) === selected;
}

function buildFilterSubtitle(opts: {
  gender: GenderFilterValue;
  company: string;
  localisation: string;
  dept: string;
  count: number;
  noun?: string;
}): string {
  const parts: string[] = [];
  if (opts.gender) parts.push(opts.gender);
  if (opts.company) parts.push(opts.company);
  if (opts.localisation) parts.push(opts.localisation);
  if (opts.dept) parts.push(opts.dept);
  const noun = opts.noun ?? 'employé';
  const countLabel = `${opts.count} ${noun}${opts.count !== 1 ? 's' : ''}`;
  if (!parts.length) return `Tous · ${countLabel}`;
  return `${parts.join(' · ')} — ${countLabel}`;
}

/**
 * Enveloppe un graphique dashboard : bouton + modal plein écran au clic.
 * Le même contenu est réaffiché en grand dans le modal (filtres Sexe / Company / Département).
 */
export default function EnlargeableChartPanel({
  title,
  className = '',
  headExtra,
  clickToEnlarge = true,
  children,
  deptFilter,
}: Props) {
  const [enlarged, setEnlarged] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedGender, setSelectedGender] = useState<GenderFilterValue>('');
  const [selectedLocalisation, setSelectedLocalisation] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [segmentDrilldown, setSegmentDrilldown] = useState<{
    title: string;
    columns: DashboardListColumn[];
    rows: DashboardListRow[];
  } | null>(null);
  const showGender = deptFilter?.showGenderLegend !== false;
  const isExitSource = Boolean(deptFilter?.segmentColumns?.some((c) => c.key === 'raison'));

  const open = () => {
    setSelectedCompany('');
    setSelectedGender('');
    setSelectedLocalisation('');
    setSelectedDept('');
    setSegmentDrilldown(null);
    setEnlarged(true);
  };
  const close = () => {
    setEnlarged(false);
    setSelectedCompany('');
    setSelectedGender('');
    setSelectedLocalisation('');
    setSelectedDept('');
    setSegmentDrilldown(null);
  };

  const companies = useMemo(() => {
    if (!deptFilter) return [];
    const base = selectedGender
      ? deptFilter.employees.filter((employee) => matchesGender(employee, selectedGender))
      : deptFilter.employees;
    return countByField(base, companyLabel);
  }, [deptFilter, selectedGender]);

  const genderPool = useMemo(() => {
    if (!deptFilter) return [];
    return deptFilter.employees.filter((employee) => {
      if (selectedCompany && companyLabel(employee) !== selectedCompany) return false;
      if (selectedLocalisation && localisationLabel(employee) !== selectedLocalisation) return false;
      return true;
    });
  }, [deptFilter, selectedCompany, selectedLocalisation]);

  const genderCounts = useMemo(() => countByGender(genderPool), [genderPool]);

  const localisations = useMemo(() => {
    if (!deptFilter) return [];
    const base = deptFilter.employees.filter((employee) => {
      if (selectedCompany && companyLabel(employee) !== selectedCompany) return false;
      if (!matchesGender(employee, selectedGender)) return false;
      return true;
    });
    return countByField(base, localisationLabel);
  }, [deptFilter, selectedCompany, selectedGender]);

  const departments = useMemo(() => {
    if (!deptFilter) return [];
    const base = deptFilter.employees.filter((employee) => {
      if (selectedCompany && companyLabel(employee) !== selectedCompany) return false;
      if (!matchesGender(employee, selectedGender)) return false;
      if (selectedLocalisation && localisationLabel(employee) !== selectedLocalisation) return false;
      return true;
    });
    return countByField(base, departmentLabel);
  }, [deptFilter, selectedCompany, selectedGender, selectedLocalisation]);

  const filteredEmployees = useMemo(() => {
    if (!deptFilter) return [];
    return deptFilter.employees.filter((employee) => {
      if (selectedCompany && companyLabel(employee) !== selectedCompany) return false;
      if (!matchesGender(employee, selectedGender)) return false;
      if (selectedLocalisation && localisationLabel(employee) !== selectedLocalisation) return false;
      if (selectedDept && departmentLabel(employee) !== selectedDept) return false;
      return true;
    });
  }, [deptFilter, selectedCompany, selectedGender, selectedLocalisation, selectedDept]);

  const filterSubtitle = useMemo(
    () => buildFilterSubtitle({
      gender: selectedGender,
      company: selectedCompany,
      localisation: selectedLocalisation,
      dept: selectedDept,
      count: filteredEmployees.length,
      noun: isExitSource ? 'sortie' : 'employé',
    }),
    [selectedGender, selectedCompany, selectedLocalisation, selectedDept, filteredEmployees.length, isExitSource],
  );

  const openSegment = (label: string) => {
    if (!deptFilter?.resolveSegment) return;
    const list = deptFilter.resolveSegment(filteredEmployees, label);
    const toRow = deptFilter.toListRow ?? defaultToListRow;
    const columns = deptFilter.segmentColumns ?? DEFAULT_SEGMENT_COLUMNS;
    const segmentTitle = deptFilter.segmentTitle?.(label) ?? `${title} — ${label}`;
    setSegmentDrilldown({
      title: segmentTitle,
      columns,
      rows: list.map(toRow),
    });
  };

  const renderCtx: ChartFilterRenderContext = {
    onSegmentClick: deptFilter?.resolveSegment ? openSegment : undefined,
  };

  const enlargedBody = deptFilter
    ? deptFilter.renderFiltered(filteredEmployees, renderCtx)
    : children;

  const companyTotalCount = useMemo(() => {
    if (!deptFilter) return 0;
    if (!selectedGender) return deptFilter.employees.length;
    return deptFilter.employees.filter((employee) => matchesGender(employee, selectedGender)).length;
  }, [deptFilter, selectedGender]);

  const localisationPoolCount = useMemo(() => {
    if (!deptFilter) return 0;
    return deptFilter.employees.filter((employee) => {
      if (selectedCompany && companyLabel(employee) !== selectedCompany) return false;
      if (!matchesGender(employee, selectedGender)) return false;
      return true;
    }).length;
  }, [deptFilter, selectedCompany, selectedGender]);

  const filterPoolCount = useMemo(() => {
    if (!deptFilter) return 0;
    return deptFilter.employees.filter((employee) => {
      if (selectedCompany && companyLabel(employee) !== selectedCompany) return false;
      if (!matchesGender(employee, selectedGender)) return false;
      if (selectedLocalisation && localisationLabel(employee) !== selectedLocalisation) return false;
      return true;
    }).length;
  }, [deptFilter, selectedCompany, selectedGender, selectedLocalisation]);

  return (
    <>
      <div
        className={`panel ${className}${clickToEnlarge ? ' is-chart-enlargeable' : ''}`.trim()}
        onClick={clickToEnlarge ? open : undefined}
        onKeyDown={clickToEnlarge ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        } : undefined}
        role={clickToEnlarge ? 'button' : undefined}
        tabIndex={clickToEnlarge ? 0 : undefined}
        title={clickToEnlarge ? 'Cliquer pour agrandir' : undefined}
      >
        <div className="panel-head travel-history-chart-head">
          <h3>{title}</h3>
          <div className="chart-panel-head-actions" onClick={(event) => event.stopPropagation()}>
            {headExtra}
            <ChartEnlargeButton onClick={open} />
          </div>
        </div>
        {children}
      </div>

      {enlarged ? (
        <ChartEnlargeModal title={title} subtitle={filterSubtitle} onClose={close}>
          {deptFilter ? (
            <div className="chart-enlarge-with-sidebar">
              <aside className="chart-enlarge-filters chart-enlarge-filters-left">
                {showGender ? (
                  <ChartGenderLegend
                    hommes={genderCounts.hommes}
                    femmes={genderCounts.femmes}
                    other={genderCounts.other}
                    totalCount={genderCounts.total}
                    value={selectedGender}
                    onChange={(next) => {
                      setSelectedGender(next);
                      setSelectedLocalisation('');
                      setSelectedDept('');
                    }}
                  />
                ) : null}
                <ChartChipFilter
                  title="Company"
                  options={companies}
                  value={selectedCompany}
                  onChange={(next) => {
                    setSelectedCompany(next);
                    setSelectedLocalisation('');
                    setSelectedDept('');
                  }}
                  totalCount={companyTotalCount}
                  ariaLabel="Filtrer par company"
                />
              </aside>
              <div className={`panel ${className} is-enlarged chart-enlarge-main`.trim()}>
                {enlargedBody}
              </div>
              <aside className="chart-enlarge-filters chart-enlarge-filters-right">
                <ChartChipFilter
                  title="Localisation"
                  options={localisations}
                  value={selectedLocalisation}
                  onChange={(next) => {
                    setSelectedLocalisation(next);
                    setSelectedDept('');
                  }}
                  totalCount={localisationPoolCount}
                  ariaLabel="Filtrer par localisation"
                />
                <ChartChipFilter
                  title="Départements"
                  options={departments}
                  value={selectedDept}
                  onChange={setSelectedDept}
                  totalCount={filterPoolCount}
                  ariaLabel="Filtrer par département"
                />
              </aside>
            </div>
          ) : (
            <div className={`panel ${className} is-enlarged`.trim()}>
              {enlargedBody}
            </div>
          )}
        </ChartEnlargeModal>
      ) : null}

      {segmentDrilldown ? (
        <DashboardListModal
          title={segmentDrilldown.title}
          columns={segmentDrilldown.columns}
          rows={segmentDrilldown.rows}
          onClose={() => setSegmentDrilldown(null)}
        />
      ) : null}
    </>
  );
}
