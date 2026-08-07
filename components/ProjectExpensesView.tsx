'use client';

import { useMemo, useState } from 'react';
import ExpenseDetailModal from '@/components/ExpenseDetailModal';
import ExpensesMonthlyChart from '@/components/ExpensesMonthlyChart';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  aggregateExpensesByMonth,
  filterValidExpenses,
  formatUsd,
} from '@/lib/projects';
import type { ProjectExpense } from '@/lib/project-types';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

interface Props {
  expenses: ProjectExpense[];
  search: string;
  projet: string;
  year: string;
  onEdit: (expense: ProjectExpense) => void;
  onDelete: (expense: ProjectExpense) => void;
}

type FilterKey = 'date' | 'projet' | 'motif';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  date: [],
  projet: [],
  motif: [],
};

export default function ProjectExpensesView({
  expenses,
  search,
  projet,
  year,
  onEdit,
  onDelete,
}: Props) {
  const { can } = usePermissions();
  const [selected, setSelected] = useState<ProjectExpense | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; expense: ProjectExpense } | null>(null);
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);

  const validExpenses = useMemo(() => filterValidExpenses(expenses), [expenses]);

  const toolbarFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return validExpenses.filter((e) => {
      const parsedYear = e.date.split('/')[2];
      const matchYear = !year || parsedYear === year;
      const matchSearch =
        !q ||
        e.projet.toLowerCase().includes(q) ||
        e.motif.toLowerCase().includes(q) ||
        e.date.includes(q);
      const matchProjet = !projet || e.projet === projet;
      return matchSearch && matchProjet && matchYear;
    });
  }, [validExpenses, search, projet, year]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarFiltered, {
        date: (e) => e.date,
        projet: (e) => e.projet,
        motif: (e) => e.motif,
      }),
    [toolbarFiltered],
  );

  const filtered = useMemo(
    () =>
      toolbarFiltered.filter(
        (e) =>
          matchesColumnFilter(colFilters.date, e.date) &&
          matchesColumnFilter(colFilters.projet, e.projet) &&
          matchesColumnFilter(colFilters.motif, e.motif),
      ),
    [toolbarFiltered, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const setColFilter = (key: FilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const chartMonths = useMemo(
    () => aggregateExpensesByMonth(validExpenses, year),
    [validExpenses, year],
  );

  const total = useMemo(
    () => filtered.reduce((sum, e) => sum + e.montant, 0),
    [filtered],
  );

  const openView = (expense: ProjectExpense) => {
    setSelected(expense);
    setContextMenu(null);
  };

  const getContextMenuItems = (expense: ProjectExpense): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (can('project.expenses', 'view')) {
      items.push({
        id: 'view',
        label: 'Voir',
        icon: 'view',
        onClick: () => openView(expense),
      });
    }
    if (can('project.expenses', 'edit')) {
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => {
          onEdit(expense);
          setContextMenu(null);
        },
      });
    }
    if (can('project.expenses', 'delete')) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => {
          onDelete(expense);
          setContextMenu(null);
        },
      });
    }
    return items;
  };

  const contextMenuItems = useMemo(
    () => (contextMenu ? getContextMenuItems(contextMenu.expense) : []),
    [contextMenu, can, onEdit, onDelete],
  );

  return (
    <>
      <ExpensesMonthlyChart months={chartMonths} year={year} />

      {activeFilterCount > 0 ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setColFilters(EMPTY_FILTERS)}
          >
            Effacer les filtres ({activeFilterCount})
          </button>
        </div>
      ) : null}

      <div className="projects-table-shell expenses-table-shell">
        <div className="projects-table-scroll">
          <table className="project-table">
            <colgroup>
              <col className="col-exp-num" />
              <col className="col-exp-date" />
              <col className="col-exp-name" />
              <col className="col-exp-motif" />
              <col className="col-exp-money" />
            </colgroup>
            <thead>
              <tr>
                <th>N°</th>
                <th className="th-filter">
                  <TableHeaderFilter
                    label="Date"
                    values={filterValues.date}
                    selected={colFilters.date}
                    onChange={setColFilter('date')}
                  />
                </th>
                <th className="th-filter">
                  <TableHeaderFilter
                    label="Projet"
                    values={filterValues.projet}
                    selected={colFilters.projet}
                    onChange={setColFilter('projet')}
                  />
                </th>
                <th className="th-filter">
                  <TableHeaderFilter
                    label="Motif"
                    values={filterValues.motif}
                    selected={colFilters.motif}
                    onChange={setColFilter('motif')}
                  />
                </th>
                <th className="text-right">Budget dépensé</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, index) => (
                <tr
                  key={e.id}
                  className="project-data-row"
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    const items = getContextMenuItems(e);
                    if (items.length === 0) return;
                    setContextMenu({ x: ev.clientX, y: ev.clientY, expense: e });
                  }}
                >
                  <td>{index + 1}</td>
                  <td>{e.date}</td>
                  <td className="project-name-cell">
                    <button
                      type="button"
                      className="project-name-link"
                      onClick={() => openView(e)}
                    >
                      {e.projet}
                    </button>
                  </td>
                  <td>{e.motif}</td>
                  <td className="text-right project-money-bold">{formatUsd(e.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="projects-table-footer">
          <table className="project-table project-table-footer-inner">
            <colgroup>
              <col className="col-exp-num" />
              <col className="col-exp-date" />
              <col className="col-exp-name" />
              <col className="col-exp-motif" />
              <col className="col-exp-money" />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={4}>Total ({filtered.length})</td>
                <td className="text-right project-money-bold">{formatUsd(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu && contextMenuItems.length > 0 && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenuItems}
        />
      )}

      {selected && (
        <ExpenseDetailModal expense={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
