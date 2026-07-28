'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import ProjectModal from '@/components/ProjectModal';
import ProjectsTableView from '@/components/ProjectsTableView';
import RefreshButton from '@/components/RefreshButton';
import {
  createEmptyProject,
  getProjectSectors,
  getProjectStatuses,
  getProjectTypes,
} from '@/lib/projects';
import { downloadProjectsExport } from '@/lib/projects-export';
import { PROJECTS_BUDGET_SYNC_EVENT } from '@/lib/projects-events';
import { fetchProjectsData } from '@/lib/fetch-projects-api';
import type { ProjectExpense, ProjectRecord } from '@/lib/project-types';
import { showError } from '@/lib/swal';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [secteur, setSecteur] = useState('');
  const [statut, setStatut] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newProject, setNewProject] = useState<ProjectRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const json = await fetchProjectsData();
      setProjects(json.projects ?? []);
      setExpenses(json.expenses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setProjects([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onBudgetSync = (event: Event) => {
      const updated = (event as CustomEvent<ProjectRecord[]>).detail ?? [];
      if (!updated.length) return;
      setProjects((prev) => {
        const byId = new Map(updated.map((project) => [project.id, project]));
        return prev.map((project) => byId.get(project.id) ?? project);
      });
    };
    window.addEventListener(PROJECTS_BUDGET_SYNC_EVENT, onBudgetSync);
    return () => window.removeEventListener(PROJECTS_BUDGET_SYNC_EVENT, onBudgetSync);
  }, []);

  const types = useMemo(() => getProjectTypes(projects), [projects]);
  const sectors = useMemo(() => getProjectSectors(projects), [projects]);
  const statuses = useMemo(() => getProjectStatuses(projects), [projects]);

  const filteredCount = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.lieu.toLowerCase().includes(q) ||
        p.secteur.toLowerCase().includes(q);
      return (
        matchSearch &&
        (!type || p.typeProjet === type) &&
        (!secteur || p.secteur === secteur) &&
        (!statut || p.statut === statut)
      );
    }).length;
  }, [projects, search, type, secteur, statut]);

  const openCreate = () => {
    setNewProject(createEmptyProject(projects));
    setCreateOpen(true);
  };

  const handleCreateSave = async (project: ProjectRecord) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      await showError(err.error || 'Erreur lors de la création');
      return;
    }
    const saved = (await res.json()) as ProjectRecord;
    setProjects((prev) => [...prev, saved]);
    setCreateOpen(false);
    setNewProject(null);
  };

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadProjectsExport();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  }, []);

  if (loading) {
    return <div className="loading">Chargement…</div>;
  }

  if (error) {
    return (
      <div className="projects-page">
        <div className="panel panel-padded">
          <p className="text-danger">{error}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <PermissionGate menuId="project.projects" action="view">
    <div className="projects-page">
      <div className="projects-sticky">
        <div className="page-header page-header-with-tabs projects-header">
          <div className="projects-header-left">
            <div className="page-header-title-row">
              <h2>Projects</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p>PROJECTS DATABASE</p>
          </div>
          <div className="projects-header-actions check-docs-header-actions">
            <div className="panel-toolbar docs-filter-bar-compact projects-header-filters">
              <input
                type="search"
                className="search-input search-input-expand"
                placeholder="Rechercher un projet…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="filter-select" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Tous les types</option>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select className="filter-select" value={secteur} onChange={(e) => setSecteur(e.target.value)}>
                <option value="">Tous les secteurs</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select className="filter-select" value={statut} onChange={(e) => setStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span className="toolbar-count">
                {filteredCount} projet{filteredCount !== 1 ? 's' : ''}
              </span>
            </div>
            <PermissionGate menuId="project.projects" action="export">
              <button
                type="button"
                className="btn btn-outline btn-export btn-sm btn-with-icon"
                onClick={() => void handleExport()}
                disabled={exporting}
                title="Exporter via PROJECTS_TEMPLATE.xlsx"
              >
                {exporting ? (
                  <span className="btn-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                {exporting ? 'Export…' : 'Export'}
              </button>
            </PermissionGate>
            <PermissionGate menuId="project.projects" action="create">
              <button type="button" className="btn btn-primary btn-sm projects-new-btn" onClick={openCreate}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Nouveau projet
              </button>
            </PermissionGate>
          </div>
        </div>
      </div>

      <div className="projects-body">
        <div className="panel projects-panel">
          <ProjectsTableView
            projects={projects}
            expenses={expenses}
            onProjectsChange={setProjects}
            onExpensesChange={setExpenses}
            search={search}
            type={type}
            secteur={secteur}
            statut={statut}
          />
        </div>
      </div>

      {createOpen && newProject && (
        <ProjectModal
          project={newProject}
          mode="create"
          sectors={sectors}
          onClose={() => {
            setCreateOpen(false);
            setNewProject(null);
          }}
          onSave={handleCreateSave}
        />
      )}
    </div>
    </PermissionGate>
  );
}
