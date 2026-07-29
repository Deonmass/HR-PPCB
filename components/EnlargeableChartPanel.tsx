'use client';

import { useMemo, useState, type ReactNode } from 'react';
import ChartChipFilter from '@/components/ChartChipFilter';
import ChartGenderLegend from '@/components/ChartGenderLegend';
import ChartEnlargeModal, { ChartEnlargeButton } from '@/components/ChartEnlargeModal';
import type { Employee } from '@/lib/types';

export interface ChartDeptFilterSource {
  employees: Employee[];
  /** Reconstruit le contenu du graphique pour le sous-ensemble filtré. */
  renderFiltered: (employees: Employee[]) => ReactNode;
  /** Affiche la légende Hommes / Femmes dans le modal agrandi. */
  showGenderLegend?: boolean;
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
   * Si fourni, le modal agrandi affiche Company + Départements
   * et reconstruit le graphique selon les filtres.
   */
  deptFilter?: ChartDeptFilterSource;
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

/**
 * Enveloppe un graphique dashboard : bouton + modal plein écran au clic.
 * Le même contenu est réaffiché en grand dans le modal (filtres Company / Département).
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
  const [selectedDept, setSelectedDept] = useState('');
  const open = () => {
    setSelectedCompany('');
    setSelectedDept('');
    setEnlarged(true);
  };
  const close = () => {
    setEnlarged(false);
    setSelectedCompany('');
    setSelectedDept('');
  };

  const companies = useMemo(
    () => (deptFilter ? countByField(deptFilter.employees, companyLabel) : []),
    [deptFilter],
  );

  const departments = useMemo(() => {
    if (!deptFilter) return [];
    const base = selectedCompany
      ? deptFilter.employees.filter((employee) => companyLabel(employee) === selectedCompany)
      : deptFilter.employees;
    return countByField(base, departmentLabel);
  }, [deptFilter, selectedCompany]);

  const filteredEmployees = useMemo(() => {
    if (!deptFilter) return [];
    return deptFilter.employees.filter((employee) => {
      if (selectedCompany && companyLabel(employee) !== selectedCompany) return false;
      if (selectedDept && departmentLabel(employee) !== selectedDept) return false;
      return true;
    });
  }, [deptFilter, selectedCompany, selectedDept]);

  const enlargedBody = deptFilter
    ? deptFilter.renderFiltered(filteredEmployees)
    : children;

  const filterPoolCount = useMemo(() => {
    if (!deptFilter) return 0;
    if (!selectedCompany) return deptFilter.employees.length;
    return deptFilter.employees.filter((employee) => companyLabel(employee) === selectedCompany).length;
  }, [deptFilter, selectedCompany]);

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
        <ChartEnlargeModal title={title} onClose={close}>
          {deptFilter ? (
            <div className="chart-enlarge-with-sidebar">
              <div className={`panel ${className} is-enlarged chart-enlarge-main`.trim()}>
                {enlargedBody}
              </div>
              <div className="chart-enlarge-filters">
                {deptFilter.showGenderLegend ? (
                  <ChartGenderLegend employees={filteredEmployees} />
                ) : null}
                <ChartChipFilter
                  title="Company"
                  options={companies}
                  value={selectedCompany}
                  onChange={(next) => {
                    setSelectedCompany(next);
                    setSelectedDept('');
                  }}
                  totalCount={deptFilter.employees.length}
                  ariaLabel="Filtrer par company"
                />
                <ChartChipFilter
                  title="Départements"
                  options={departments}
                  value={selectedDept}
                  onChange={setSelectedDept}
                  totalCount={filterPoolCount}
                  ariaLabel="Filtrer par département"
                />
              </div>
            </div>
          ) : (
            <div className={`panel ${className} is-enlarged`.trim()}>
              {enlargedBody}
            </div>
          )}
        </ChartEnlargeModal>
      ) : null}
    </>
  );
}
