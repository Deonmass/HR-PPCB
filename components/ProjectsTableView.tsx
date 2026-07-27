'use client';

import { useCallback, useMemo, useState } from 'react';
import ExpenseFormModal from '@/components/ExpenseFormModal';
import ProjectExpensesModal from '@/components/ProjectExpensesModal';
import ProjectModal, { type ProjectModalMode } from '@/components/ProjectModal';
import ProjectStatusBadge from '@/components/ProjectStatusBadge';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
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

  const sectors = useMemo(() => getProjectSectors(projects), [projects]);

  const filtered = useMemo(() => {
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
                <th>Projet</th>
                <th>Lieu</th>
                <th>Secteur</th>
                <th>Type</th>
                <th className="text-right">Prévu</th>
                <th className="text-right">Dépensé</th>
                <th className="text-right">Écart</th>
                <th className="text-center">Statut</th>
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
