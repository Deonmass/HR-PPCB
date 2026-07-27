'use client';

import { useEffect, useState } from 'react';
import SaveButton from '@/components/SaveButton';
import ProjectStatusBadge from '@/components/ProjectStatusBadge';
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_TYPES,
  formatPct,
  formatUsd,
  normalizeProject,
  validateBudgetPrevuVerification,
} from '@/lib/projects';
import type { ProjectRecord } from '@/lib/project-types';
import { showWarning } from '@/lib/swal';

export type ProjectModalMode = 'view' | 'edit' | 'create';

interface Props {
  project: ProjectRecord | null;
  mode: ProjectModalMode;
  sectors: string[];
  onClose: () => void;
  onSave: (project: ProjectRecord) => Promise<void>;
  onStatusChange?: (project: ProjectRecord) => Promise<void>;
  onEdit?: () => void;
}

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export default function ProjectModal({
  project,
  mode,
  sectors,
  onClose,
  onSave,
  onStatusChange,
  onEdit,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProjectRecord>(() =>
    project ?? {
      id: `p-${Date.now()}`,
      numero: null,
      name: '',
      lieu: '',
      secteur: '',
      typeProjet: 'CSR',
      sousActivite: '',
      annee: 'FY2026',
      dateDebut: '',
      dateFin: '',
      responsable: '',
      budgetPrevu: null,
      budgetDepense: 0,
      budgetPrevuVerifie: false,
      ecart: null,
      pctBudget: null,
      statut: 'Non debuté',
    },
  );

  useEffect(() => {
    if (project) setForm(project);
  }, [project]);

  const readOnly = mode === 'view';
  const title =
    mode === 'create' ? 'Nouveau projet' : mode === 'edit' ? 'Modifier le projet' : 'Détails du projet';

  const preview = normalizeProject(form);
  const isUnplannedProject = Boolean(form.budgetPrevuVerifie);

  const updateBudgetField = (patch: Partial<Pick<ProjectRecord, 'budgetPrevu' | 'budgetDepense'>>) => {
    setForm((current) => ({
      ...current,
      ...patch,
      budgetPrevuVerifie: false,
    }));
  };

  const toggleUnplannedProject = (checked: boolean) => {
    setForm((current) => ({
      ...current,
      budgetPrevuVerifie: checked,
      budgetPrevu: checked ? Number(current.budgetDepense) || 0 : current.budgetPrevu,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const next = normalizeProject(form);
    const validationError = validateBudgetPrevuVerification(next);
    if (validationError) {
      await showWarning(validationError);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatut: string) => {
    if (!onStatusChange || newStatut === form.statut) return;
    const next = normalizeProject({ ...form, statut: newStatut });
    setSaving(true);
    try {
      await onStatusChange(next);
      setForm(next);
    } finally {
      setSaving(false);
    }
  };

  const detailRows: { label: string; value: React.ReactNode }[] = [
    { label: 'N°', value: displayValue(form.numero) },
    { label: 'Projet', value: form.name },
    { label: 'Lieu', value: displayValue(form.lieu) },
    { label: 'Secteur', value: displayValue(form.secteur) },
    { label: 'Type de projet', value: form.typeProjet },
    { label: 'Sous-activité', value: displayValue(form.sousActivite) },
    { label: 'Année (AF)', value: displayValue(form.annee) },
    { label: 'Date début', value: displayValue(form.dateDebut) },
    { label: 'Date fin', value: displayValue(form.dateFin) },
    { label: 'Responsable', value: displayValue(form.responsable) },
    { label: 'Budget prévu', value: formatUsd(preview.budgetPrevu) },
    { label: 'Budget dépensé', value: formatUsd(preview.budgetDepense) },
    {
      label: 'Projet non prévu',
      value: preview.budgetPrevuVerifie ? 'Oui' : 'Non',
    },
    { label: 'Écart', value: formatUsd(preview.ecart) },
    { label: '% budget utilisé', value: formatPct(preview.pctBudget) },
    {
      label: 'Statut',
      value: (
        <ProjectStatusBadge
          statut={form.statut}
          onChange={readOnly && onStatusChange ? handleStatusChange : undefined}
        />
      ),
    },
  ];

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className={`modal modal-lg${readOnly ? '' : ' modal-form'}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {readOnly ? (
              <div className="detail-grid">
                {detailRows.map((row) => (
                  <div className="detail-row" key={row.label}>
                    <span className="detail-label">{row.label}</span>
                    <span className="detail-value">{row.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="form-grid">
                <div className="form-group full">
                  <label>Projet *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Statut</label>
                  <select
                    value={form.statut}
                    onChange={(e) => setForm({ ...form, statut: e.target.value })}
                  >
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type de projet</label>
                  <select
                    value={form.typeProjet}
                    onChange={(e) => setForm({ ...form, typeProjet: e.target.value })}
                  >
                    {PROJECT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Lieu</label>
                  <input
                    value={form.lieu}
                    onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Secteur</label>
                  <input
                    list="project-sectors"
                    value={form.secteur}
                    onChange={(e) => setForm({ ...form, secteur: e.target.value })}
                  />
                  <datalist id="project-sectors">
                    {sectors.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div className="form-group">
                  <label>Sous-activité</label>
                  <input
                    value={form.sousActivite}
                    onChange={(e) => setForm({ ...form, sousActivite: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Responsable</label>
                  <input
                    value={form.responsable}
                    onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Date début</label>
                  <input
                    value={form.dateDebut}
                    onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Date fin</label>
                  <input
                    value={form.dateFin}
                    onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Budget prévu ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={isUnplannedProject ? (form.budgetDepense || '') : (form.budgetPrevu ?? '')}
                    readOnly={isUnplannedProject}
                    className={isUnplannedProject ? 'input-readonly' : undefined}
                    onChange={(e) =>
                      updateBudgetField({
                        budgetPrevu: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Budget dépensé ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.budgetDepense}
                    readOnly
                    className="input-readonly"
                    title="Somme calculée depuis Expenses details"
                  />
                  <span className="form-hint">Somme des dépenses du projet (Expenses details)</span>
                </div>
                <div className="form-group full project-budget-verify">
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={isUnplannedProject}
                      onChange={(e) => toggleUnplannedProject(e.target.checked)}
                    />
                    <span>Projet non prévu</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            {readOnly ? (
              <>
                <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
                <button type="button" className="btn btn-primary" onClick={onEdit}>Modifier</button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                  Annuler
                </button>
                <SaveButton
                  saving={saving}
                  label={mode === 'create' ? 'Créer' : 'Enregistrer'}
                />
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
