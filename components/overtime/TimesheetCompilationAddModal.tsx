'use client';

import { useEffect, useMemo, useState } from 'react';
import { showError } from '@/lib/swal';

export interface CompilationCandidate {
  matricule: string;
  nom: string;
  departement: string;
  grade: string;
  jobTitle: string;
  localisation: string;
  service: string;
  statut: string;
}

interface Props {
  open: boolean;
  year: number;
  month: number;
  department: string;
  onClose: () => void;
  onAdded: (employees: CompilationCandidate[]) => void;
}

export default function TimesheetCompilationAddModal({
  open,
  year,
  month,
  department,
  onClose,
  onAdded,
}: Props) {
  const [candidates, setCandidates] = useState<CompilationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !department) return;
    const controller = new AbortController();
    setLoading(true);
    setQuery('');
    setSelected(new Set());
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
      department,
      candidates: '1',
    });
    fetch(`/api/timesheet/compilation?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const json = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error || 'Liste indisponible');
        }
        return response.json() as Promise<CompilationCandidate[]>;
      })
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setCandidates([]);
        void showError(err instanceof Error ? err.message : 'Liste indisponible');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, year, month, department]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((employee) =>
      `${employee.matricule} ${employee.nom} ${employee.departement} ${employee.localisation} ${employee.service}`
        .toLowerCase()
        .includes(q),
    );
  }, [candidates, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((employee) => selected.has(employee.matricule));

  const toggle = (matricule: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(matricule)) next.delete(matricule);
      else next.add(matricule);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const employee of visible) next.delete(employee.matricule);
      } else {
        for (const employee of visible) next.add(employee.matricule);
      }
      return next;
    });
  };

  const handleValidate = async () => {
    const matricules = Array.from(selected);
    if (!matricules.length || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/timesheet/compilation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-agents',
          year,
          month,
          department,
          matricules,
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || 'Ajout impossible');
      }
      const added = candidates.filter((employee) => selected.has(employee.matricule));
      onAdded(added);
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Ajout impossible');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form compilation-add-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Ajouter des agents</h3>
            <p className="timesheet-manager-modal-subtitle">
              Agents absents de cette compilation. Sélectionnez-en un ou plusieurs.
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <input
            type="search"
            className="search-input"
            placeholder="Rechercher un nom, un matricule, un site…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          {loading ? (
            <p className="text-muted">Chargement…</p>
          ) : visible.length === 0 ? (
            <p className="text-muted">Aucun agent à ajouter.</p>
          ) : (
            <>
              <label className="compilation-add-row compilation-add-row-all">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} />
                <span>Tout sélectionner ({visible.length})</span>
              </label>
              <div className="compilation-add-list">
                {visible.map((employee) => (
                  <label key={employee.matricule} className="compilation-add-row">
                    <input
                      type="checkbox"
                      checked={selected.has(employee.matricule)}
                      onChange={() => toggle(employee.matricule)}
                    />
                    <span>
                      <strong>{employee.nom}</strong>
                      <small>
                        {employee.matricule}
                        {employee.departement ? ` · ${employee.departement}` : ''}
                        {employee.localisation ? ` · ${employee.localisation}` : ''}
                        {employee.statut && !/^act/i.test(employee.statut) ? ` · ${employee.statut}` : ''}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleValidate()}
            disabled={saving || selected.size === 0}
          >
            {saving ? 'Ajout…' : `Ajouter${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
