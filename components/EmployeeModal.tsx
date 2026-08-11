'use client';

import { useEffect, useMemo, useState } from 'react';
import { DOCUMENT_FIELDS, normalizeDocStatus } from '@/lib/documents';
import {
  EMPLOYEE_STATUTS,
  RAISON_EXITS,
  TYPE_CONTRATS,
  computeAgeFromDisplayDate,
  computeFinPeriodeEssai,
  isRealExitRaison,
} from '@/lib/employee-columns';
import {
  ESSAI_ACTIONS,
  ESSAI_COMMENTAIRES,
  computeFinContratFromDuree,
  resolveEssaiEcheanceEval,
  resolveEssaiStatutEval,
} from '@/lib/employees-trial';
import { DEFAULT_LOCALISATIONS } from '@/lib/localisations';
import type { Employee } from '@/lib/types';
import { emptyEmployeeHrProfile } from '@/lib/types';

interface Props {
  employee: Employee | null;
  onClose: () => void;
  onSave: (employee: Employee) => void | Promise<void>;
}

const LOCALISATIONS = [...DEFAULT_LOCALISATIONS];
const GENDERS = ['Male', 'Female'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];

function toDateInputValue(display: string): string {
  const raw = display.trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
}

function fromDateInputValue(iso: string): string {
  const raw = iso.trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function blankEmployee(): Employee {
  return {
    matricule: '',
    nom: '',
    departement: '',
    grade: '',
    jobTitle: '',
    localisation: '',
    documents: Object.fromEntries(DOCUMENT_FIELDS.map((f) => [f.key, 'N'])),
    ...emptyEmployeeHrProfile(),
  };
}

export default function EmployeeModal({ employee, onClose, onSave }: Props) {
  const [form, setForm] = useState<Employee>(blankEmployee);
  const [saving, setSaving] = useState(false);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);

  useEffect(() => {
    if (employee) {
      setForm({
        ...blankEmployee(),
        ...employee,
        documents: {
          ...Object.fromEntries(DOCUMENT_FIELDS.map((f) => [f.key, 'N'])),
          ...employee.documents,
        },
      });
    } else {
      setForm(blankEmployee());
    }
  }, [employee]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/departments')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: unknown) => {
        if (cancelled) return;
        const names = Array.isArray(json)
          ? json
              .map((item) => String((item as { name?: string })?.name ?? '').trim())
              .filter(Boolean)
          : [];
        setDepartmentNames([...new Set(names)].sort((a, b) => a.localeCompare(b, 'fr')));
      })
      .catch(() => {
        if (!cancelled) setDepartmentNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const departmentOptions = useMemo(() => {
    const current = (form.departement || '').trim();
    const options = [...departmentNames];
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [departmentNames, form.departement]);

  const displayAge = useMemo(() => {
    if (form.age != null) return form.age;
    return computeAgeFromDisplayDate(form.dateOfBirth);
  }, [form.age, form.dateOfBirth]);

  const finEssaiAuto = useMemo(
    () => computeFinPeriodeEssai(form.appointmentDate, form.periodeEssaiMois),
    [form.appointmentDate, form.periodeEssaiMois],
  );

  const finContratAuto = useMemo(() => {
    const fromDuree = computeFinContratFromDuree(form.appointmentDate, form.dureeContratMois);
    const duree = form.dureeContratMois;
    if (duree != null && Number.isFinite(duree) && duree > 0 && fromDuree) {
      return fromDuree;
    }
    return form.dateFinContrat || fromDuree || '';
  }, [form.appointmentDate, form.dureeContratMois, form.dateFinContrat]);

  const echeanceEvalAuto = useMemo(
    () => resolveEssaiEcheanceEval({
      essaiEcheanceEval: form.essaiEcheanceEval,
      appointmentDate: form.appointmentDate,
      periodeEssaiMois: form.periodeEssaiMois,
      dateFinPeriodeEssai: finEssaiAuto,
    }),
    [form.essaiEcheanceEval, form.appointmentDate, form.periodeEssaiMois, finEssaiAuto],
  );

  const statutEvalAuto = useMemo(
    () => resolveEssaiStatutEval({
      appointmentDate: form.appointmentDate,
      periodeEssaiMois: form.periodeEssaiMois,
      dateFinPeriodeEssai: finEssaiAuto,
      essaiCommentaire: form.essaiCommentaire,
    }),
    [form.appointmentDate, form.periodeEssaiMois, finEssaiAuto, form.essaiCommentaire],
  );

  const setDoc = (key: string, value: string) => {
    setForm((f) => ({ ...f, documents: { ...f.documents, [key]: value } }));
  };

  const patch = <K extends keyof Employee>(key: K, value: Employee[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave({
        ...form,
        age: displayAge,
        dateFinPeriodeEssai: finEssaiAuto,
        dateFinContrat: finContratAuto,
        essaiEcheanceEval: form.essaiEcheanceEval || echeanceEvalAuto,
        essaiStatutEval: statutEvalAuto,
        raisonExit: form.raisonExit || '',
      }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{employee ? 'Fiche employé' : 'Ajouter un employé'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <h4 className="form-section-title">Identité</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Matricule *</label>
                <input required value={form.matricule} readOnly={!!employee} onChange={(e) => patch('matricule', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Nom & Prénom *</label>
                <input required value={form.nom} onChange={(e) => patch('nom', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Société</label>
                <input value={form.company} onChange={(e) => patch('company', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Genre</label>
                <select value={form.gender || ''} onChange={(e) => patch('gender', e.target.value)}>
                  <option value="">—</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date de naissance</label>
                <input
                  type="date"
                  value={toDateInputValue(form.dateOfBirth)}
                  onChange={(e) => patch('dateOfBirth', fromDateInputValue(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>Âge</label>
                <input value={displayAge ?? ''} readOnly title="Calculé (formule Excel) — non modifiable" />
              </div>
              <div className="form-group">
                <label>Nationalité</label>
                <input value={form.nationality} onChange={(e) => patch('nationality', e.target.value)} />
              </div>
              <div className="form-group">
                <label>État civil</label>
                <select value={form.maritalStatus || ''} onChange={(e) => patch('maritalStatus', e.target.value)}>
                  <option value="">—</option>
                  {MARITAL.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Nombre d&apos;enfants</label>
                <input
                  type="number"
                  min={0}
                  value={form.numberOfChildren ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch('numberOfChildren', v === '' ? null : Number(v));
                  }}
                />
              </div>
              <div className="form-group">
                <label>Date d&apos;embauche</label>
                <input
                  type="date"
                  value={toDateInputValue(form.appointmentDate)}
                  onChange={(e) => patch('appointmentDate', fromDateInputValue(e.target.value))}
                />
              </div>
            </div>

            <h4 className="form-section-title">Poste & organisation</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Département</label>
                <select
                  value={form.departement}
                  onChange={(e) => patch('departement', e.target.value)}
                >
                  <option value="">—</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Grade</label>
                <input value={form.grade} placeholder="C1, B2..." onChange={(e) => patch('grade', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Localisation</label>
                <input list="localisation-list" value={form.localisation} onChange={(e) => patch('localisation', e.target.value)} />
                <datalist id="localisation-list">{LOCALISATIONS.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div className="form-group full">
                <label>Intitulé du poste</label>
                <input value={form.jobTitle} onChange={(e) => patch('jobTitle', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Centre de coût</label>
                <input value={form.centreCout} onChange={(e) => patch('centreCout', e.target.value)} />
              </div>
              <div className="form-group">
                <label>CNSS</label>
                <input value={form.cnss} onChange={(e) => patch('cnss', e.target.value)} placeholder="N° CNSS" />
              </div>
              <div className="form-group">
                <label>NIF</label>
                <input value={form.nif} onChange={(e) => patch('nif', e.target.value)} placeholder="N° NIF" />
              </div>
              <div className="form-group">
                <label>Sous-groupe</label>
                <input value={form.employeeSubGroup} placeholder="Permanent…" onChange={(e) => patch('employeeSubGroup', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Payroll Area</label>
                <input value={form.payrollArea} onChange={(e) => patch('payrollArea', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Personnel Area</label>
                <input value={form.personnelArea} onChange={(e) => patch('personnelArea', e.target.value)} />
              </div>
            </div>

            <h4 className="form-section-title">Manager</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Line Manager</label>
                <input value={form.lineManagerName} onChange={(e) => patch('lineManagerName', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Poste du manager</label>
                <input value={form.lineManagerPosition} onChange={(e) => patch('lineManagerPosition', e.target.value)} />
              </div>
            </div>

            <h4 className="form-section-title">Contrat &amp; sortie</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Type de contrat</label>
                <select
                  value={form.typeContrat || ''}
                  onChange={(e) => patch('typeContrat', e.target.value)}
                >
                  <option value="">—</option>
                  {TYPE_CONTRATS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Durée contrat (mois)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.dureeContratMois ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch('dureeContratMois', v === '' ? null : Number(v));
                  }}
                />
              </div>
              <div className="form-group">
                <label>Période d&apos;essai (mois)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.periodeEssaiMois ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    patch('periodeEssaiMois', v === '' ? null : Number(v));
                  }}
                />
              </div>
              <div className="form-group">
                <label>Date fin période d&apos;essai</label>
                <input
                  type="date"
                  value={toDateInputValue(finEssaiAuto)}
                  readOnly
                  title="Calculée automatiquement (embauche + période d'essai)"
                />
              </div>
              <div className="form-group">
                <label>Date fin contrat</label>
                <input
                  type="date"
                  value={toDateInputValue(finContratAuto)}
                  readOnly={Boolean(form.dureeContratMois && form.dureeContratMois > 0)}
                  onChange={(e) => patch('dateFinContrat', fromDateInputValue(e.target.value))}
                  title={
                    form.dureeContratMois && form.dureeContratMois > 0
                      ? 'Calculée automatiquement (embauche + durée CDD)'
                      : undefined
                  }
                />
              </div>
              <div className="form-group">
                <label>Raison exit</label>
                <select
                  value={form.raisonExit || 'NA'}
                  onChange={(e) => {
                    const raison = e.target.value;
                    setForm((f) => ({
                      ...f,
                      raisonExit: raison || 'NA',
                      statut: isRealExitRaison(raison) ? 'Inactive' : 'Active',
                    }));
                  }}
                >
                  {RAISON_EXITS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select
                  value={form.statut || 'Active'}
                  onChange={(e) => {
                    const statut = e.target.value;
                    setForm((f) => ({
                      ...f,
                      statut,
                      raisonExit:
                        statut === 'Active' && isRealExitRaison(f.raisonExit)
                          ? 'NA'
                          : f.raisonExit || 'NA',
                    }));
                  }}
                >
                  {EMPLOYEE_STATUTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <h4 className="form-section-title">Évaluation période d&apos;essai</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Actions</label>
                <select
                  value={form.essaiActions || ''}
                  onChange={(e) => patch('essaiActions', e.target.value)}
                >
                  <option value="">—</option>
                  {ESSAI_ACTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Responsable (Account.)</label>
                <input
                  value={form.essaiResponsable || ''}
                  onChange={(e) => patch('essaiResponsable', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Échéance évaluation</label>
                <input
                  type="date"
                  value={toDateInputValue(form.essaiEcheanceEval || echeanceEvalAuto)}
                  onChange={(e) => patch('essaiEcheanceEval', fromDateInputValue(e.target.value))}
                  title="Par défaut : 1 mois avant la fin de période d'essai"
                />
              </div>
              <div className="form-group">
                <label>Statut évaluation</label>
                <input
                  value={statutEvalAuto}
                  readOnly
                  title="Calculé automatiquement selon la date de fin d'essai"
                />
              </div>
              <div className="form-group">
                <label>Commentaire</label>
                <select
                  value={form.essaiCommentaire || ''}
                  onChange={(e) => patch('essaiCommentaire', e.target.value)}
                >
                  <option value="">—</option>
                  {ESSAI_COMMENTAIRES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <h4 className="form-section-title">Documents du dossier</h4>
            <div className="docs-grid">
              {DOCUMENT_FIELDS.map((f) => (
                <div key={f.key} className="doc-toggle">
                  <label>{f.label}</label>
                  <select value={normalizeDocStatus(String(form.documents[f.key] || ''))} onChange={(e) => setDoc(f.key, e.target.value)}>
                    <option value="Y">Y</option>
                    <option value="N">N</option>
                    <option value="NA">NA</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary btn-with-icon" disabled={saving}>
              {saving ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Enregistrement…
                </>
              ) : (
                'Enregistrer'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
