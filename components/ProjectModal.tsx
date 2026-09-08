'use client';

import { useEffect, useMemo, useState } from 'react';
import SaveButton from '@/components/SaveButton';
import ProjectStatusBadge from '@/components/ProjectStatusBadge';
import {
  PROJECT_TYPES,
  clampEvolution,
  formatEvolutionPct,
  normalizeProject,
  statutFromEvolution,
} from '@/lib/projects';
import type { ProjectHistoryEntry, ProjectRecord } from '@/lib/project-types';

export type ProjectModalMode = 'view' | 'edit' | 'create';

interface Props {
  project: ProjectRecord | null;
  mode: ProjectModalMode;
  sectors: string[];
  onClose: () => void;
  onSave: (project: ProjectRecord) => Promise<void>;
  onEdit?: () => void;
}

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatHistoryAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function historyLabel(entry: ProjectHistoryEntry): string {
  if (entry.field === 'evolution') {
    return `Évolution ${formatEvolutionPct(Number(entry.from))} → ${formatEvolutionPct(Number(entry.to))}`;
  }
  const from = entry.from == null || entry.from === '' ? '—' : String(entry.from);
  const to = entry.to == null || entry.to === '' ? '—' : String(entry.to);
  return `Commentaire « ${from} » → « ${to} »`;
}

export default function ProjectModal({
  project,
  mode,
  sectors,
  onClose,
  onSave,
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
      evolution: 0,
      commentaire: '',
      history: [],
      statut: 'Non debuté',
    },
  );

  useEffect(() => {
    if (project) setForm(normalizeProject(project));
  }, [project]);

  const readOnly = mode === 'view';
  const title =
    mode === 'create' ? 'Nouveau projet' : mode === 'edit' ? 'Modifier le projet' : 'Détails du projet';

  const preview = useMemo(() => {
    const evolution = clampEvolution(form.evolution);
    return normalizeProject({ ...form, evolution, statut: statutFromEvolution(evolution) });
  }, [form]);

  const history = preview.history || [];

  const setEvolution = (raw: string) => {
    const evolution = clampEvolution(raw === '' ? 0 : Number(raw));
    setForm((current) => ({
      ...current,
      evolution,
      statut: statutFromEvolution(evolution),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setSaving(true);
    try {
      await onSave(normalizeProject(form));
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
    { label: 'Évolution', value: formatEvolutionPct(preview.evolution) },
    { label: 'Commentaire', value: displayValue(preview.commentaire) },
    {
      label: 'Statut',
      value: <ProjectStatusBadge statut={preview.statut} />,
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
              <>
                <div className="detail-grid">
                  {detailRows.map((row) => (
                    <div className="detail-row" key={row.label}>
                      <span className="detail-label">{row.label}</span>
                      <span className="detail-value">{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="project-history-block">
                  <h4>Historique</h4>
                  {history.length === 0 ? (
                    <p className="project-history-empty">Aucun changement enregistré.</p>
                  ) : (
                    <ul className="project-history-list">
                      {history.map((entry) => (
                        <li key={entry.id}>
                          <span className="project-history-at">{formatHistoryAt(entry.at)}</span>
                          <span className="project-history-text">{historyLabel(entry)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
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
                  <label>Évolution (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={form.evolution ?? 0}
                    onChange={(e) => setEvolution(e.target.value)}
                  />
                  <span className="form-hint">
                    0 % = Non débuté · 1–99 % = En cours · 100 % = Closed
                  </span>
                </div>
                <div className="form-group">
                  <label>Statut (auto)</label>
                  <div className="project-status-readonly">
                    <ProjectStatusBadge statut={preview.statut} />
                  </div>
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
                <div className="form-group full">
                  <label>Commentaire</label>
                  <textarea
                    rows={3}
                    value={form.commentaire || ''}
                    onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
                    placeholder="Notes / suivi du projet…"
                  />
                </div>
                {history.length > 0 ? (
                  <div className="form-group full project-history-block">
                    <h4>Historique</h4>
                    <ul className="project-history-list">
                      {history.slice(0, 8).map((entry) => (
                        <li key={entry.id}>
                          <span className="project-history-at">{formatHistoryAt(entry.at)}</span>
                          <span className="project-history-text">{historyLabel(entry)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <div className="modal-footer">
            {readOnly ? (
              <>
                <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
                {onEdit ? (
                  <button type="button" className="btn btn-primary" onClick={onEdit}>Modifier</button>
                ) : null}
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
