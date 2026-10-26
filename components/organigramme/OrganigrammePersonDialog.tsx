'use client';

import { useEffect, useMemo, useState } from 'react';
import { applyEmployeeServicePrefill } from '@/lib/employee-utils';
import { confirmAction, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import { orgPersonShortName } from '@/lib/organigramme';
import type { OrgPersonTarget } from '@/components/organigramme/OrganigrammeTree';

type Mode = 'manager' | 'role';

type Props = {
  mode: Mode;
  person: OrgPersonTarget;
  employee: Employee;
  employees: Employee[];
  departments: string[];
  onClose: () => void;
  onSaved: (employee: Employee) => void;
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function OrganigrammePersonDialog({
  mode,
  person,
  employee,
  employees,
  departments,
  onClose,
  onSaved,
}: Props) {
  const [query, setQuery] = useState('');
  const [managerMatricule, setManagerMatricule] = useState('');
  const [departement, setDepartement] = useState(person.departement || employee.departement || '');
  const [poste, setPoste] = useState(person.jobTitle || employee.jobTitle || employee.position || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choices = useMemo(() => {
    const q = fold(query.trim());
    return employees
      .filter((item) => {
        if (item.matricule === employee.matricule) return false;
        const statut = String(item.statut || 'Active').trim().toLowerCase();
        if (statut && statut !== 'active') return false;
        if (!q) return true;
        return fold(`${item.nom} ${item.matricule} ${item.jobTitle || item.position || ''}`).includes(q);
      })
      .slice(0, 12);
  }, [employees, employee.matricule, query]);

  const save = async () => {
    if (saving) return;
    let next: Employee = { ...employee };
    let summary = '';
    if (mode === 'manager') {
      const picked = employees.find((item) => item.matricule === managerMatricule);
      if (!picked) {
        await showError('Choisissez un N+1.');
        return;
      }
      next.lineManagerName = picked.nom;
      const posteManager = String(picked.jobTitle || picked.position || '').trim();
      if (posteManager) next.lineManagerPosition = posteManager;
      summary = `N+1 : ${orgPersonShortName(picked.nom)}`;
    } else {
      const dept = departement.trim();
      const title = poste.trim();
      if (!dept || !title) {
        await showError('Le département et le poste sont requis.');
        return;
      }
      const deptChanged = fold(dept) !== fold(employee.departement || '');
      next = {
        ...next,
        departement: dept,
        departmentHr: dept,
        jobTitle: title,
        position: title,
        service: deptChanged ? '' : next.service,
      };
      next = applyEmployeeServicePrefill(next);
      summary = `${dept} — ${title}`;
    }

    const confirmed = await confirmAction('Confirmer la modification ?', summary, 'Enregistrer');
    if (!confirmed) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(employee.matricule)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = (await res.json()) as Employee & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
      onSaved(json);
      await showSuccess('Modification enregistrée.');
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const deptOptions = useMemo(() => {
    const set = new Set(departments);
    if (departement.trim()) set.add(departement.trim());
    return [...set];
  }, [departments, departement]);

  return (
    <div className="org-dialog-backdrop" onClick={onClose}>
      <div
        className="org-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="org-dialog-title">
          {mode === 'manager' ? 'Modifier le N+1' : 'Département et poste'}
        </h3>
        <p className="org-dialog-who">{orgPersonShortName(person.nom)}</p>

        {mode === 'manager' ? (
          <>
            <label className="org-filter">
              <span>Rechercher</span>
              <input
                type="search"
                autoFocus
                placeholder="Nom, matricule, poste…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <ul className="org-dialog-list">
              {choices.length === 0 ? (
                <li className="org-dialog-empty">Aucun employé.</li>
              ) : (
                choices.map((item) => (
                  <li key={item.matricule}>
                    <button
                      type="button"
                      className={managerMatricule === item.matricule ? 'is-selected' : ''}
                      onClick={() => setManagerMatricule(item.matricule)}
                    >
                      <strong>{orgPersonShortName(item.nom)}</strong>
                      <span>{[item.jobTitle || item.position, item.departement].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : (
          <div className="org-dialog-fields">
            <label className="org-filter">
              <span>Département</span>
              <select value={departement} onChange={(event) => setDepartement(event.target.value)}>
                <option value="">Choisir…</option>
                {deptOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="org-filter">
              <span>Poste</span>
              <input
                type="text"
                value={poste}
                onChange={(event) => setPoste(event.target.value)}
              />
            </label>
          </div>
        )}

        <div className="org-dialog-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
