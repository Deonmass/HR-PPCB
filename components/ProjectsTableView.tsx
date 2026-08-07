'use client';

import { useCallback, useMemo, useState } from 'react';
import ExpenseFormModal from '@/components/ExpenseFormModal';
import ProjectExpensesModal from '@/components/ProjectExpensesModal';
import ProjectModal, { type ProjectModalMode } from '@/components/ProjectModal';
import ProjectStatusBadge from '@/components/ProjectStatusBadge';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  createEmptyExpense,
  ecartClass,
  formatUsd,
  getProjectSectors,
} from '@/lib/projects';
import { emitProjectsBudgetSync } from '@/lib/projects-events';
import type { ProjectExpense, ProjectRecord } from '@/lib/project-types';
import { confirmDelete, showError } from '@/lib/swal';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

interface Props {
  projects: ProjectRecord[];
  expenses: ProjectExpense[];
  onProjectsChange: (projects: ProjectRecord[]) => void;
  onExpensesChange: (expenses: ProjectExpense[]) => void;
  search: string;
  type: string;
  secteur: string;
  statut: string;
}

type FilterKey = 'projet' | 'lieu' | 'secteur' | 'type' | 'prevu' | 'depense' | 'ecart' | 'statut';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  projet: [],
  lieu: [],
  secteur: [],
  type: [],
  prevu: [],
  depense: [],
  ecart: [],
  statut: [],
};

function applyUpdatedProjects(
  projects: ProjectRecord[],
  updatedProjects: ProjectRecord[],
): ProjectRecord[] {
  if (!updatedProjects.length) return projects;
  const byId = new Map(updatedProjects.map((project) => [project.id, project]));
  return projects.map((project) => byId.get(project.id) ?? project);
}

export default function ProjectsTableView({
  projects,
  expenses,
  onProjectsChange,
  onExpensesChange,
  search,
  type,
  secteur,
  statut,
}: Props) {
  const { can } = usePermissions();
  const [modalMode, setModalMode] = useState<ProjectModalMode | null>(null);
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: ProjectRecord } | null>(null);
  const [expensesModalProject, setExpensesModalProject] = useState<ProjectRecord | null>(null);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState<ProjectExpense | null>(null);
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);

  const sectors = useMemo(() => getProjectSectors(projects), [projects]);

  const toolbarFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.lieu.toLowerCase().includes(q) ||
        p.secteur.toLowerCase().includes(q);
      const matchType = !type || p.typeProjet === type;
      const matchSecteur = !secteur || p.secteur === secteur;
      const matchStatut = !statut || p.statut === statut;
      return matchSearch && matchType && matchSecteur && matchStatut;
    });
  }, [projects, search, type, secteur, statut]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarFiltered, {
        projet: (p) => p.name,
        lieu: (p) => p.lieu,
        secteur: (p) => p.secteur,
        type: (p) => p.typeProjet,
        prevu: (p) => formatUsd(p.budgetPrevu),
        depense: (p) => formatUsd(p.budgetDepense),
        ecart: (p) => formatUsd(p.ecart),
        statut: (p) => p.statut,
      }),
    [toolbarFiltered],
  );

  const filtered = useMemo(
    () =>
      toolbarFiltered.filter(
        (p) =>
          matchesColumnFilter(colFilters.projet, p.name) &&
          matchesColumnFilter(colFilters.lieu, p.lieu) &&
          matchesColumnFilter(colFilters.secteur, p.secteur) &&
          matchesColumnFilter(colFilters.type, p.typeProjet) &&
          matchesColumnFilter(colFilters.prevu, formatUsd(p.budgetPrevu)) &&
          matchesColumnFilter(colFilters.depense, formatUsd(p.budgetDepense)) &&
          matchesColumnFilter(colFilters.ecart, formatUsd(p.ecart)) &&
          matchesColumnFilter(colFilters.statut, p.statut),
      ),
    [toolbarFiltered, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const setColFilter = (key: FilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, p) => {
          acc.prevu += p.budgetPrevu ?? 0;
          acc.depense += p.budgetDepense ?? 0;
          return acc;
        },
        { prevu: 0, depense: 0 },
      ),
    [filtered],
  );

  const openModal = useCallback((project: ProjectRecord, mode: ProjectModalMode) => {
    setSelected(project);
    setModalMode(mode);
    setContextMenu(null);
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setSelected(null);
  }, []);

  const openExpensesModal = useCallback((project: ProjectRecord) => {
    setExpensesModalProject(project);
    setContextMenu(null);
  }, []);

  const openExpenseForm = useCallback((project: ProjectRecord) => {
    const empty = createEmptyExpense(expenses);
    setExpenseFormData({ ...empty, projet: project.name });
    setExpenseFormOpen(true);
    setContextMenu(null);
  }, [expenses]);

  const closeExpenseForm = useCallback(() => {
    setExpenseFormOpen(false);
    setExpenseFormData(null);
  }, []);

  const handleSave = useCallback(
    async (project: ProjectRecord) => {
      const isCreate = modalMode === 'create';
      const res = await fetch(isCreate ? '/api/projects' : `/api/projects/${project.id}`, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await showError(err.error || 'Erreur lors de l\'enregistrement');
        return;
      }
      const saved = (await res.json()) as ProjectRecord;
      onProjectsChange(
        isCreate
          ? [...projects, saved]
          : projects.map((p) => (p.id === saved.id ? saved : p)),
      );
      closeModal();
    },
    [modalMode, projects, onProjectsChange, closeModal],
  );

  const handleExpenseSave = useCallback(
    async (expense: ProjectExpense) => {
      const res = await fetch('/api/projects/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense),
      });

      const text = await res.text();
      let json: { expense?: ProjectExpense; updatedProjects?: ProjectRecord[]; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        await showError('Réponse serveur invalide.');
        return;
      }

      if (!res.ok) {
        await showError(json.error || 'Erreur lors de l\'enregistrement');
        return;
      }

      const saved = json.expense as ProjectExpense;
      const updatedProjects = json.updatedProjects ?? [];
      onExpensesChange([...expenses, saved]);
      onProjectsChange(applyUpdatedProjects(projects, updatedProjects));
      emitProjectsBudgetSync(updatedProjects);
      closeExpenseForm();
    },
    [expenses, projects, onExpensesChange, onProjectsChange, closeExpenseForm],
  );

  const handleStatusChange = useCallback(
    async (project: ProjectRecord) => {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await showError(err.error || 'Erreur lors de la mise à jour du statut');
        return;
      }
      const saved = (await res.json()) as ProjectRecord;
      onProjectsChange(projects.map((p) => (p.id === saved.id ? saved : p)));
      setSelected((current) => (current?.id === saved.id ? saved : current));
    },
    [projects, onProjectsChange],
  );

  const handleDelete = useCallback(
    async (project: ProjectRecord) => {
      if (!(await confirmDelete('Supprimer ce projet ?', `Le projet « ${project.name} » sera définitivement supprimé.`))) return;
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) {
        await showError('Erreur lors de la suppression');
        return;
      }
      onProjectsChange(projects.filter((p) => p.id !== project.id));
      closeModal();
    },
    [projects, onProjectsChange, closeModal],
  );

  const getContextMenuItems = useCallback(
    (project: ProjectRecord): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];
      if (can('project.projects', 'view')) {
        items.push({
          id: 'view',
          label: 'Voir',
          icon: 'view',
          onClick: () => openModal(project, 'view'),
        });
      }
      if (can('project.projects', 'edit')) {
        items.push({
          id: 'edit',
          label: 'Modifier',
          icon: 'edit',
          onClick: () => openModal(project, 'edit'),
        });
      }
      if (can('project.expenses', 'create')) {
        items.push({
          id: 'add-expense',
          label: 'Ajouter une dépense',
          icon: 'add',
          onClick: () => openExpenseForm(project),
        });
      }
      if (can('project.expenses', 'view')) {
        items.push({
          id: 'view-expenses',
          label: 'Voir les dépenses',
          icon: 'expenses',
          onClick: () => openExpensesModal(project),
        });
      }
      if (can('project.projects', 'delete')) {
        items.push({
          id: 'delete',
          label: 'Supprimer',
          icon: 'delete',
          danger: true,
          onClick: () => handleDelete(project),
        });
      }
      return items;
    },
    [can, openModal, openExpenseForm, openExpensesModal, handleDelete],
  );

  const contextMenuItems = useMemo(
    () => (contextMenu ? getContextMenuItems(contextMenu.project) : []),
    [contextMenu, getContextMenuItems],
  );

  return (
    <>
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
      <div className="projects-table-shell">
        <div className="projects-table-scroll">
          <table className="project-table">
            <colgroup>
              <col className="col-num" />
              <col className="col-name" />
              <col className="col-lieu" />
              <col className="col-secteur" />
              <col className="col-type" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-statut" />
            </colgroup>
            <thead>
              <tr>
                <th>N°</th>
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
                    label="Lieu"
                    values={filterValues.lieu}
                    selected={colFilters.lieu}
                    onChange={setColFilter('lieu')}
                  />
                </th>
                <th className="th-filter">
                  <TableHeaderFilter
                    label="Secteur"
                    values={filterValues.secteur}
                    selected={colFilters.secteur}
                    onChange={setColFilter('secteur')}
                  />
                </th>
                <th className="th-filter">
                  <TableHeaderFilter
                    label="Type"
                    values={filterValues.type}
                    selected={colFilters.type}
                    onChange={setColFilter('type')}
                  />
                </th>
                <th className="th-filter text-right">
                  <TableHeaderFilter
                    label="Prévu"
                    values={filterValues.prevu}
                    selected={colFilters.prevu}
                    onChange={setColFilter('prevu')}
                  />
                </th>
                <th className="th-filter text-right">
                  <TableHeaderFilter
                    label="Dépensé"
                    values={filterValues.depense}
                    selected={colFilters.depense}
                    onChange={setColFilter('depense')}
                  />
                </th>
                <th className="th-filter text-right">
                  <TableHeaderFilter
                    label="Écart"
                    values={filterValues.ecart}
                    selected={colFilters.ecart}
                    onChange={setColFilter('ecart')}
                  />
                </th>
                <th className="th-filter text-center">
                  <TableHeaderFilter
                    label="Statut"
                    values={filterValues.statut}
                    selected={colFilters.statut}
                    onChange={setColFilter('statut')}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, index) => (
                <tr
                  key={p.id}
                  className="project-data-row"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const items = getContextMenuItems(p);
                    if (items.length === 0) return;
                    setContextMenu({ x: e.clientX, y: e.clientY, project: p });
                  }}
                >
                  <td>{index + 1}</td>
                  <td className="project-name-cell">
                    <button
                      type="button"
                      className="project-name-link"
                      onClick={() => openModal(p, 'view')}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td>{p.lieu || '—'}</td>
                  <td>{p.secteur}</td>
                  <td><span className="project-type-tag">{p.typeProjet}</span></td>
                  <td className="text-right">{formatUsd(p.budgetPrevu)}</td>
                  <td className="text-right">
                    {(p.budgetDepense ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="project-money-link"
                        onClick={() => openExpensesModal(p)}
                        title="Voir les dépenses"
                      >
                        {formatUsd(p.budgetDepense)}
                      </button>
                    ) : (
                      formatUsd(p.budgetDepense)
                    )}
                  </td>
                  <td className={`text-right ${ecartClass(p.ecart)}`}>{formatUsd(p.ecart)}</td>
                  <td className="text-center">
                    <ProjectStatusBadge
                      statut={p.statut}
                      onChange={(newStatut) => handleStatusChange({ ...p, statut: newStatut })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="projects-table-footer">
          <table className="project-table project-table-footer-inner">
            <colgroup>
              <col className="col-num" />
              <col className="col-name" />
              <col className="col-lieu" />
              <col className="col-secteur" />
              <col className="col-type" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-statut" />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={5}>Total ({filtered.length})</td>
                <td className="text-right">{formatUsd(totals.prevu)}</td>
                <td className="text-right">{formatUsd(totals.depense)}</td>
                <td className={`text-right ${ecartClass(totals.prevu - totals.depense)}`}>
                  {formatUsd(totals.prevu - totals.depense)}
                </td>
                <td />
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

      {modalMode && selected && (
        <ProjectModal
          project={selected}
          mode={modalMode}
          sectors={sectors}
          onClose={closeModal}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          onEdit={() => setModalMode('edit')}
        />
      )}

      {expensesModalProject && (
        <ProjectExpensesModal
          project={expensesModalProject}
          expenses={expenses}
          onClose={() => setExpensesModalProject(null)}
        />
      )}

      {expenseFormOpen && expenseFormData && (
        <ExpenseFormModal
          expense={expenseFormData}
          projects={projects}
          mode="create"
          onClose={closeExpenseForm}
          onSave={handleExpenseSave}
        />
      )}
    </>
  );
}
