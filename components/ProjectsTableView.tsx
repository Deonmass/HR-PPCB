'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProjectModal, { type ProjectModalMode } from '@/components/ProjectModal';
import ProjectStatusBadge from '@/components/ProjectStatusBadge';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  clampEvolution,
  formatEvolutionPct,
  getProjectSectors,
  normalizeProject,
  statutFromEvolution,
} from '@/lib/projects';
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
  hideTypeColumn?: boolean;
}

type FilterKey = 'projet' | 'lieu' | 'secteur' | 'type' | 'evolution' | 'commentaire' | 'statut';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  projet: [],
  lieu: [],
  secteur: [],
  type: [],
  evolution: [],
  commentaire: [],
  statut: [],
};

export default function ProjectsTableView({
  projects,
  onProjectsChange,
  search,
  type,
  secteur,
  statut,
  hideTypeColumn = false,
}: Props) {
  const { can } = usePermissions();
  const canEdit = can('project.projects', 'edit');
  const [modalMode, setModalMode] = useState<ProjectModalMode | null>(null);
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: ProjectRecord } | null>(null);
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [editingEvolutionId, setEditingEvolutionId] = useState<string | null>(null);
  const [evolutionDraft, setEvolutionDraft] = useState('');
  const [savingEvolutionId, setSavingEvolutionId] = useState<string | null>(null);
  const evolutionInputRef = useRef<HTMLInputElement | null>(null);

  const sectors = useMemo(() => getProjectSectors(projects), [projects]);

  const normalizedProjects = useMemo(
    () => projects.map((p) => normalizeProject(p)),
    [projects],
  );

  const toolbarFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return normalizedProjects.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.lieu.toLowerCase().includes(q) ||
        p.secteur.toLowerCase().includes(q) ||
        (p.commentaire || '').toLowerCase().includes(q);
      const matchType = !type || p.typeProjet === type;
      const matchSecteur = !secteur || p.secteur === secteur;
      const matchStatut = !statut || p.statut === statut || (statut === 'Terminé' && p.statut === 'Closed');
      return matchSearch && matchType && matchSecteur && matchStatut;
    });
  }, [normalizedProjects, search, type, secteur, statut]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarFiltered, {
        projet: (p) => p.name,
        lieu: (p) => p.lieu,
        secteur: (p) => p.secteur,
        type: (p) => p.typeProjet,
        evolution: (p) => formatEvolutionPct(p.evolution),
        commentaire: (p) => p.commentaire || '—',
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
          matchesColumnFilter(colFilters.evolution, formatEvolutionPct(p.evolution)) &&
          matchesColumnFilter(colFilters.commentaire, p.commentaire || '—') &&
          matchesColumnFilter(colFilters.statut, p.statut),
      ),
    [toolbarFiltered, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const setColFilter = (key: FilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const avgEvolution = useMemo(() => {
    if (!filtered.length) return null;
    const sum = filtered.reduce((acc, p) => acc + (p.evolution ?? 0), 0);
    return Math.round(sum / filtered.length);
  }, [filtered]);

  useEffect(() => {
    if (!editingEvolutionId) return;
    const id = window.setTimeout(() => evolutionInputRef.current?.select(), 0);
    return () => window.clearTimeout(id);
  }, [editingEvolutionId]);

  const openModal = useCallback((project: ProjectRecord, mode: ProjectModalMode) => {
    setEditingEvolutionId(null);
    setSelected(project);
    setModalMode(mode);
    setContextMenu(null);
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setSelected(null);
  }, []);

  const startEvolutionEdit = useCallback((project: ProjectRecord) => {
    if (!canEdit) return;
    setEditingEvolutionId(project.id);
    setEvolutionDraft(String(clampEvolution(project.evolution)));
  }, [canEdit]);

  const cancelEvolutionEdit = useCallback(() => {
    setEditingEvolutionId(null);
    setEvolutionDraft('');
  }, []);

  const saveEvolution = useCallback(
    async (project: ProjectRecord, rawValue: string) => {
      const nextEvolution = clampEvolution(rawValue === '' ? 0 : Number(rawValue));
      const current = clampEvolution(project.evolution);
      if (nextEvolution === current) {
        cancelEvolutionEdit();
        return;
      }
      setSavingEvolutionId(project.id);
      try {
        const payload = normalizeProject({
          ...project,
          evolution: nextEvolution,
          statut: statutFromEvolution(nextEvolution),
        });
        const res = await fetch(`/api/projects/${project.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          await showError(err.error || 'Erreur lors de la mise à jour de l’évolution');
          return;
        }
        const saved = normalizeProject((await res.json()) as ProjectRecord);
        onProjectsChange(projects.map((p) => (p.id === saved.id ? saved : p)));
        cancelEvolutionEdit();
      } finally {
        setSavingEvolutionId(null);
      }
    },
    [projects, onProjectsChange, cancelEvolutionEdit],
  );

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
      const saved = normalizeProject((await res.json()) as ProjectRecord);
      onProjectsChange(
        isCreate
          ? [...projects, saved]
          : projects.map((p) => (p.id === saved.id ? saved : p)),
      );
      closeModal();
    },
    [modalMode, projects, onProjectsChange, closeModal],
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
      if (canEdit) {
        items.push({
          id: 'edit',
          label: 'Modifier',
          icon: 'edit',
          onClick: () => openModal(project, 'edit'),
        });
        items.push({
          id: 'evolution',
          label: 'Modifier l’évolution',
          icon: 'edit',
          onClick: () => startEvolutionEdit(project),
        });
      }
      if (can('project.projects', 'delete')) {
        items.push({
          id: 'delete',
          label: 'Supprimer',
          icon: 'delete',
          danger: true,
          onClick: () => {
            void handleDelete(project);
          },
        });
      }
      return items;
    },
    [can, canEdit, openModal, startEvolutionEdit, handleDelete],
  );

  const contextMenuItems = useMemo(
    () => (contextMenu ? getContextMenuItems(contextMenu.project) : []),
    [contextMenu, getContextMenuItems],
  );

  const colSpanBase = hideTypeColumn ? 4 : 5;

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
          <table className={`project-table${hideTypeColumn ? ' is-typed-scope' : ''}`}>
            <colgroup>
              <col className="col-num" />
              <col className="col-name" />
              <col className="col-lieu" />
              <col className="col-secteur" />
              {hideTypeColumn ? null : <col className="col-type" />}
              <col className="col-evolution" />
              <col className="col-commentaire" />
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
                {hideTypeColumn ? null : (
                  <th className="th-filter">
                    <TableHeaderFilter
                      label="Type"
                      values={filterValues.type}
                      selected={colFilters.type}
                      onChange={setColFilter('type')}
                    />
                  </th>
                )}
                <th className="th-filter text-right">
                  <TableHeaderFilter
                    label="Évolution"
                    values={filterValues.evolution}
                    selected={colFilters.evolution}
                    onChange={setColFilter('evolution')}
                  />
                </th>
                <th className="th-filter">
                  <TableHeaderFilter
                    label="Commentaire"
                    values={filterValues.commentaire}
                    selected={colFilters.commentaire}
                    onChange={setColFilter('commentaire')}
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
              {filtered.map((p, index) => {
                const isEditing = editingEvolutionId === p.id;
                const isSaving = savingEvolutionId === p.id;
                return (
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
                        onClick={() => openModal(p, canEdit ? 'edit' : 'view')}
                        title={canEdit ? 'Modifier' : 'Voir'}
                      >
                        {p.name}
                      </button>
                    </td>
                    <td>{p.lieu || '—'}</td>
                    <td>{p.secteur}</td>
                    {hideTypeColumn ? null : (
                      <td><span className="project-type-tag">{p.typeProjet}</span></td>
                    )}
                    <td className="text-right project-evolution-cell">
                      {isEditing ? (
                        <div className="project-evolution-edit">
                          <input
                            ref={evolutionInputRef}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            className="project-evolution-input"
                            value={evolutionDraft}
                            disabled={isSaving}
                            aria-label={`Évolution ${p.name}`}
                            onChange={(e) => setEvolutionDraft(e.target.value)}
                            onBlur={() => {
                              if (!isSaving) void saveEvolution(p, evolutionDraft);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEvolutionEdit();
                              }
                            }}
                          />
                          <span className="project-evolution-suffix">%</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="project-evolution-btn"
                          disabled={!canEdit || isSaving}
                          onClick={() => startEvolutionEdit(p)}
                          title={
                            canEdit
                              ? 'Cliquer pour modifier l’évolution'
                              : formatEvolutionPct(p.evolution)
                          }
                        >
                          {isSaving ? '…' : formatEvolutionPct(p.evolution)}
                        </button>
                      )}
                    </td>
                    <td className="project-comment-cell" title={p.commentaire || undefined}>
                      {p.commentaire?.trim() ? p.commentaire : '—'}
                    </td>
                    <td className="text-center">
                      <ProjectStatusBadge statut={p.statut} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="projects-table-footer">
          <table className={`project-table project-table-footer-inner${hideTypeColumn ? ' is-typed-scope' : ''}`}>
            <colgroup>
              <col className="col-num" />
              <col className="col-name" />
              <col className="col-lieu" />
              <col className="col-secteur" />
              {hideTypeColumn ? null : <col className="col-type" />}
              <col className="col-evolution" />
              <col className="col-commentaire" />
              <col className="col-statut" />
            </colgroup>
            <tbody>
              <tr>
                <td colSpan={colSpanBase}>Total ({filtered.length})</td>
                <td className="text-right">
                  {avgEvolution === null ? '—' : `moy. ${formatEvolutionPct(avgEvolution)}`}
                </td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu && contextMenuItems.length > 0 ? (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenuItems}
        />
      ) : null}

      {modalMode && selected ? (
        <ProjectModal
          project={selected}
          mode={modalMode}
          sectors={sectors}
          onClose={closeModal}
          onSave={handleSave}
          onEdit={() => setModalMode('edit')}
        />
      ) : null}
    </>
  );
}
