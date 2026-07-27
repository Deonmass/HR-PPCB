'use client';

import { useEffect, useMemo, useState } from 'react';
import ProjectPicker from '@/components/ProjectPicker';
import SaveButton from '@/components/SaveButton';
import {
  PROJECT_TYPES,
  expenseDateToInputValue,
  inputValueToExpenseDate,
} from '@/lib/projects';
import type { ProjectExpense, ProjectRecord } from '@/lib/project-types';

interface Props {
  expense: ProjectExpense;
  projects: ProjectRecord[];
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSave: (expense: ProjectExpense) => Promise<void>;
}

export default function ExpenseFormModal({
  expense,
  projects,
  mode = 'create',
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState(expense);
  const [typeFilter, setTypeFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(expense);
    const match = projects.find((p) => p.name === expense.projet);
    if (match?.typeProjet) setTypeFilter(match.typeProjet);
  }, [expense, projects]);

  const filteredProjects = useMemo(() => {
    if (!typeFilter) return projects;
    return projects.filter((p) => p.typeProjet === typeFilter);
  }, [projects, typeFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'edit' ? 'Modifier la dépense' : 'Nouvelle dépense';

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-form expense-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Date *</label>
                <input
                  required
                  type="date"
                  className="input-date"
                  value={expenseDateToInputValue(form.date)}
                  onChange={(e) =>
                    setForm({ ...form, date: inputValueToExpenseDate(e.target.value) })
                  }
                />
              </div>
              <div className="form-group">
                <label>Budget dépensé ($) *</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.montant || ''}
                  onChange={(e) => setForm({ ...form, montant: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group">
                <label>Type de projet</label>
                <select
                  className="filter-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="">Tous les types</option>
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Projet *</label>
                <ProjectPicker
                  projects={filteredProjects}
                  value={form.projet}
                  onChange={(projet) => setForm({ ...form, projet })}
                  required
                />
              </div>
              <div className="form-group full">
                <label>Motif</label>
                <textarea
                  rows={3}
                  value={form.motif}
                  onChange={(e) => setForm({ ...form, motif: e.target.value })}
                  placeholder="Description de la dépense…"
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <SaveButton
              saving={saving}
              label={mode === 'edit' ? 'Enregistrer' : 'Créer'}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
