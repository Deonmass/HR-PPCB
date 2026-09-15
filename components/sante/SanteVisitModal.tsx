'use client';

import { useEffect, useMemo, useState } from 'react';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import { emptyEmployeeHrProfile } from '@/lib/types';
import {
  SANTE_PATIENT_TYPES,
  type SanteDependantLite,
  type SanteEmployeeLite,
  type SanteVisitInput,
} from '@/lib/sante-types';
import { isFamilyPatientType, splitEmployeeNom } from '@/lib/sante-utils';
import { normalizePersonName } from '@/lib/dependants-pactilis-compare';

interface Props {
  open: boolean;
  title: string;
  value: SanteVisitInput;
  employees: SanteEmployeeLite[];
  dependants: SanteDependantLite[];
  pathologies: string[];
  traitements: string[];
  references: string[];
  saving?: boolean;
  onChange: (next: SanteVisitInput) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function genderToSexe(gender?: string): 'M' | 'F' | '' {
  const v = (gender || '').toLowerCase();
  if (v.startsWith('f') || v.includes('female') || v.includes('femme')) return 'F';
  if (v.startsWith('m') || v.includes('male') || v.includes('homme')) return 'M';
  return '';
}

export default function SanteVisitModal({
  open,
  title,
  value,
  employees,
  dependants,
  pathologies,
  traitements,
  references,
  saving,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  const [personQuery, setPersonQuery] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    if (!open) {
      setPersonQuery('');
      setShowSuggest(false);
    }
  }, [open]);

  const pickerValue: EmployeeSelection | null = value.employeeMatricule
    ? {
        matricule: value.employeeMatricule,
        nom: value.employeeNom || value.employeeMatricule,
        departement: employees.find((e) => e.matricule === value.employeeMatricule)?.departement || '',
      }
    : null;

  const family = isFamilyPatientType(value.typeMalade);
  const pickerEmployees = useMemo(
    () =>
      employees.map((e) => ({
        ...emptyEmployeeHrProfile(),
        matricule: e.matricule,
        nom: e.nom,
        departement: e.departement,
        grade: '',
        jobTitle: '',
        localisation: '',
        documents: {},
        gender: e.gender || '',
        age: e.age ?? null,
        dateOfBirth: e.dateOfBirth || '',
      })),
    [employees],
  );
  const dependantSuggestions = useMemo(() => {
    if (!family) return [];
    const parentMat = (value.employeeMatricule || '').trim();
    if (!parentMat) return [];
    const q = normalizePersonName(personQuery || `${value.nom} ${value.postnom}`);
    return dependants
      .filter((d) => {
        if (d.matricule.trim() !== parentMat) return false;
        if (value.typeMalade.toUpperCase().includes('ENFANT') && !/enfant/i.test(d.statut)) return false;
        if (/epouse|conjoint/i.test(value.typeMalade) && !/conjoint/i.test(d.statut)) return false;
        if (!q) return true;
        return normalizePersonName(`${d.nom} ${d.employeNom} ${d.matricule}`).includes(q);
      })
      .slice(0, 20);
  }, [dependants, family, personQuery, value.employeeMatricule, value.nom, value.postnom, value.typeMalade]);
  const agentSuggestions = useMemo(() => {
    if (family) return [];
    const q = normalizePersonName(personQuery || `${value.nom} ${value.postnom}`);
    if (!q) return [];
    return employees
      .filter((e) => normalizePersonName(`${e.nom} ${e.matricule}`).includes(q))
      .slice(0, 8);
  }, [employees, family, personQuery, value.nom, value.postnom]);

  if (!open) return null;

  const applyEmployee = (emp: EmployeeSelection | null) => {
    if (!emp) {
      onChange({ ...value, employeeMatricule: '', employeeNom: '', dependantId: family ? null : value.dependantId });
      setShowSuggest(false);
      return;
    }
    const lite = employees.find((e) => e.matricule === emp.matricule);
    const split = splitEmployeeNom(emp.nom);
    onChange({
      ...value,
      employeeMatricule: emp.matricule,
      employeeNom: emp.nom,
      dependantId: family ? null : value.dependantId,
      ...(family
        ? {}
        : {
            nom: split.nom,
            postnom: split.postnom,
            sexe: genderToSexe(lite?.gender) || value.sexe,
            age: lite?.age ?? value.age,
          }),
    });
    setPersonQuery('');
    setShowSuggest(family);
  };

  const applyDependant = (dep: SanteDependantLite) => {
    const split = splitEmployeeNom(dep.nom);
    onChange({
      ...value,
      nom: split.nom,
      postnom: split.postnom,
      sexe: dep.sexe === 'F' || dep.sexe === 'M' ? dep.sexe : value.sexe,
      age: dep.age,
      dependantId: dep.id,
      employeeMatricule: dep.matricule,
      employeeNom: dep.employeNom,
    });
    setPersonQuery(dep.nom);
    setShowSuggest(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form sante-visit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={value.date}
                onChange={(e) => onChange({ ...value, date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Type de malade</label>
              <select
                value={value.typeMalade}
                onChange={(e) => onChange({ ...value, typeMalade: e.target.value, dependantId: null })}
              >
                {SANTE_PATIENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
                {value.typeMalade && !SANTE_PATIENT_TYPES.includes(value.typeMalade as never) ? (
                  <option value={value.typeMalade}>{value.typeMalade}</option>
                ) : null}
              </select>
            </div>
            <div className="form-group form-group-full">
              <label>{family ? 'Agent lié (parent)' : 'Agent'}</label>
              <EmployeePicker
                employees={pickerEmployees}
                value={pickerValue}
                onChange={applyEmployee}
                placeholder="Nom ou matricule…"
              />
              {pickerValue ? (
                <p className="sante-linked-hint">
                  Matricule <strong>{pickerValue.matricule}</strong>
                  {pickerValue.departement ? ` · ${pickerValue.departement}` : ''}
                </p>
              ) : family ? (
                <p className="sante-linked-hint">Sélectionnez d’abord l’agent pour voir ses enfants / conjoints.</p>
              ) : null}
            </div>
            {family && value.employeeMatricule ? (
              <div className="form-group form-group-full">
                {dependantSuggestions.length > 0 ? (
                  <div className="sante-suggest-list">
                    {dependantSuggestions.map((dep) => (
                      <button
                        key={dep.id}
                        type="button"
                        className={`sante-suggest-item${value.dependantId === dep.id ? ' is-selected' : ''}`}
                        onClick={() => applyDependant(dep)}
                      >
                        <strong>{dep.nom}</strong>
                        <span>
                          {dep.statut} · {dep.employeNom || '—'} ({dep.matricule || '—'})
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="sante-linked-hint">Aucun {/epouse/i.test(value.typeMalade) ? 'conjoint' : 'enfant'} lié à cet agent.</p>
                )}
              </div>
            ) : null}
            <div className="form-group">
              <label>Nom</label>
              <input
                value={value.nom}
                onChange={(e) => {
                  onChange({ ...value, nom: e.target.value, dependantId: family ? value.dependantId : null });
                  setPersonQuery(e.target.value);
                  setShowSuggest(true);
                }}
                onFocus={() => setShowSuggest(true)}
              />
            </div>
            <div className="form-group">
              <label>Postnom</label>
              <input
                value={value.postnom}
                onChange={(e) => {
                  onChange({ ...value, postnom: e.target.value });
                  setPersonQuery(`${value.nom} ${e.target.value}`);
                  setShowSuggest(true);
                }}
              />
            </div>
            {showSuggest && agentSuggestions.length > 0 ? (
              <div className="form-group form-group-full">
                <div className="sante-suggest-list">
                  {agentSuggestions.map((emp) => (
                    <button
                      key={emp.matricule}
                      type="button"
                      className="sante-suggest-item"
                      onClick={() => {
                        applyEmployee({
                          matricule: emp.matricule,
                          nom: emp.nom,
                          departement: emp.departement,
                        });
                        setShowSuggest(false);
                      }}
                    >
                      <strong>{emp.nom}</strong>
                      <span>AGENT · {emp.matricule}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="form-group">
              <label>Sexe</label>
              <select
                value={value.sexe}
                onChange={(e) => onChange({ ...value, sexe: e.target.value as 'M' | 'F' | '' })}
              >
                <option value="">—</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </div>
            <div className="form-group">
              <label>Âge (années)</label>
              <input
                type="number"
                min={0}
                step="0.25"
                value={value.age ?? ''}
                onChange={(e) =>
                  onChange({ ...value, age: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className="form-group form-group-full">
              <label>Pathologie</label>
              <input
                list="sante-pathologies"
                value={value.pathologie}
                onChange={(e) => onChange({ ...value, pathologie: e.target.value })}
              />
              <datalist id="sante-pathologies">
                {pathologies.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div className="form-group form-group-full">
              <label>Traitement</label>
              <input
                list="sante-traitements"
                value={value.traitement}
                onChange={(e) => onChange({ ...value, traitement: e.target.value })}
              />
              <datalist id="sante-traitements">
                {traitements.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div className="form-group form-group-full">
              <label>Référence</label>
              <input
                list="sante-references"
                value={value.reference}
                onChange={(e) => onChange({ ...value, reference: e.target.value })}
              />
              <datalist id="sante-references">
                {['NON', ...references.filter((r) => r.toUpperCase() !== 'NON')].map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="btn btn-accent" onClick={onSubmit} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
