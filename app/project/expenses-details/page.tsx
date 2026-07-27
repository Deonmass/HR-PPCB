'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ExpenseFormModal from '@/components/ExpenseFormModal';
import PermissionGate from '@/components/PermissionGate';
import ProjectExpensesView from '@/components/ProjectExpensesView';
import RefreshButton from '@/components/RefreshButton';
import { fetchProjectsData } from '@/lib/fetch-projects-api';
import {
  createEmptyExpense,
  filterValidExpenses,
  getExpenseProjects,
  getExpenseYears,
} from '@/lib/projects';
import { emitProjectsBudgetSync } from '@/lib/projects-events';
import type { ProjectExpense, ProjectRecord } from '@/lib/project-types';
import { confirmDelete, showError } from '@/lib/swal';

type FormMode = 'create' | 'edit';

function applyUpdatedProjects(
  setProjects: (value: ProjectRecord[] | ((prev: ProjectRecord[]) => ProjectRecord[])) => void,
  updatedProjects: ProjectRecord[],
) {
  if (!updatedProjects.length) return;
  setProjects((prev) => {
    const byId = new Map(updatedProjects.map((project) => [project.id, project]));
    return prev.map((project) => byId.get(project.id) ?? project);
  });
  emitProjectsBudgetSync(updatedProjects);
}

export default function ExpensesDetailsPage() {
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [projet, setProjet] = useState('');
  const [year, setYear] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [formExpense, setFormExpense] = useState<ProjectExpense | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const json = await fetchProjectsData();
      const list = json.expenses ?? [];
      setExpenses(list);
      setProjects(json.projects ?? []);
      const years = getExpenseYears(list);
      setYear((current) => current || years[0] || String(new Date().getFullYear()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projectNames = useMemo(() => {
    const fromProjects = projects.map((p) => p.name).filter(Boolean);
    const fromExpenses = getExpenseProjects(expenses);
    return [...new Set([...fromProjects, ...fromExpenses])].sort();
  }, [projects, expenses]);
  const years = useMemo(() => getExpenseYears(expenses), [expenses]);

  const filteredCount = useMemo(() => {
    const q = search.toLowerCase().trim();
    return filterValidExpenses(expenses).filter((e) => {
      const parsedYear = e.date.split('/')[2];
      const matchYear = !year || parsedYear === year;
      const matchSearch =
        !q ||
        e.projet.toLowerCase().includes(q) ||
        e.motif.toLowerCase().includes(q) ||
        e.date.includes(q);
      return matchSearch && (!projet || e.projet === projet) && matchYear;
    }).length;
  }, [expenses, search, projet, year]);

  const openCreate = () => {
    setFormExpense(createEmptyExpense(expenses));
    setFormMode('create');
    setFormOpen(true);
  };

  const openEdit = (expense: ProjectExpense) => {
    setFormExpense({ ...expense });
    setFormMode('edit');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormExpense(null);
  };

  const handleFormSave = async (expense: ProjectExpense) => {
    const isEdit = formMode === 'edit';
    const res = await fetch(
      isEdit ? `/api/projects/expenses/${expense.id}` : '/api/projects/expenses',
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense),
      },
    );

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
    setExpenses((prev) =>
      isEdit
        ? prev.map((item) => (item.id === saved.id ? saved : item))
        : [...prev, saved],
    );
    applyUpdatedProjects(setProjects, updatedProjects);

    const savedYear = saved.date.split('/')[2];
    if (savedYear && !years.includes(savedYear)) {
      setYear(savedYear);
    }
    closeForm();
  };

  const handleDelete = async (expense: ProjectExpense) => {
    if (
      !(await confirmDelete(
        'Supprimer cette dépense ?',
        `Projet « ${expense.projet} » — ${expense.montant} $`,
      ))
    ) {
      return;
    }

    const res = await fetch(`/api/projects/expenses/${expense.id}`, { method: 'DELETE' });
    const text = await res.text();
    let json: { updatedProjects?: ProjectRecord[]; error?: string };
    try {
      json = JSON.parse(text);
    } catch {
      await showError('Réponse serveur invalide.');
      return;
    }

    if (!res.ok) {
      await showError(json.error || 'Erreur lors de la suppression');
      return;
    }

    setExpenses((prev) => prev.filter((item) => item.id !== expense.id));
    applyUpdatedProjects(setProjects, json.updatedProjects ?? []);
  };

  if (loading) {
    return <div className="loading">Chargement…</div>;
  }

  if (error) {
    return (
      <div className="projects-page expenses-page">
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
    <div className="projects-page expenses-page">
      <div className="projects-sticky">
        <div className="page-header page-header-with-tabs projects-header">
          <div className="projects-header-left">
            <div className="page-header-title-row">
              <h2>Expenses details</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p>BUDGET EXPENSE DETAILS</p>
          </div>
          <div className="projects-header-actions check-docs-header-actions">
            <div className="panel-toolbar docs-filter-bar-compact projects-header-filters">
              <select className="filter-select" value={year} onChange={(e) => setYear(e.target.value)}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <input
                type="search"
                className="search-input search-input-expand"
                placeholder="Rechercher date, projet, motif…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="filter-select" value={projet} onChange={(e) => setProjet(e.target.value)}>
                <option value="">Tous les projets</option>
                {projectNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <span className="toolbar-count">
                {filteredCount} ligne{filteredCount !== 1 ? 's' : ''}
              </span>
            </div>
            <PermissionGate menuId="project.expenses" action="create">
              <button type="button" className="btn btn-primary btn-sm projects-new-btn" onClick={openCreate}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Nouvelle dépense
              </button>
            </PermissionGate>
          </div>
        </div>
      </div>

      <div className="projects-body expenses-body">
        <ProjectExpensesView
          expenses={expenses}
          search={search}
          projet={projet}
          year={year}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </div>

      {formOpen && formExpense && (
        <ExpenseFormModal
          expense={formExpense}
          projects={projects}
          mode={formMode}
          onClose={closeForm}
          onSave={handleFormSave}
        />
      )}
    </div>
  );
}
