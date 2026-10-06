'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import ProjectPickerDropdown from '@/components/ProjectPickerDropdown';
import { emptyEmployeeHrProfile } from '@/lib/types';
import {
  SANTE_PATIENT_TYPES,
  type SanteContractantEmployeeLite,
  type SanteContractantLite,
  type SanteDependantLite,
  type SanteEmployeeLite,
  type SanteVisitInput,
} from '@/lib/sante-types';
import { isFamilyPatientType, normalizeSanteType, splitEmployeeNom } from '@/lib/sante-utils';
import { normalizePersonName } from '@/lib/dependants-pactilis-compare';

interface Props {
  open: boolean;
  title: string;
  value: SanteVisitInput;
  employees: SanteEmployeeLite[];
  dependants: SanteDependantLite[];
  contractants: SanteContractantLite[];
  contractantEmployees: SanteContractantEmployeeLite[];
  pathologies: string[];
  traitements: string[];
  references: string[];
  saving?: boolean;
  onChange: (next: SanteVisitInput) => void;
  onClose: () => void;
  onSubmit: () => void;
}

function ContractantPersonPicker({
  people,
  selectedId,
  onSelect,
}: {
  people: SanteContractantEmployeeLite[];
  selectedId: string;
  onSelect: (person: SanteContractantEmployeeLite | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = people.find((person) => person.id === selectedId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selected?.nom ?? '');

  useEffect(() => {
    setQuery(selected?.nom ?? '');
  }, [selected?.nom, selectedId]);

  const suggestions = useMemo(() => {
    const q = normalizePersonName(query);
    const list = q
      ? people.filter((item) => normalizePersonName(`${item.nom} ${item.matricule} ${item.contractantNom}`).includes(q))
      : people;
    return list.slice(0, 12);
  }, [people, query]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setQuery(selected?.nom ?? '');
  }, [selected?.nom]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      dismiss();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [dismiss, open]);

  return (
    <div ref={wrapRef} className={`project-picker${open ? ' is-open' : ''}`}>
      <input
        className="project-picker-input"
        value={query}
        placeholder="Nom ou matricule…"
        autoComplete="off"
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
      />
      <ProjectPickerDropdown
        anchorRef={wrapRef}
        listRef={listRef}
        open={open && suggestions.length > 0}
        minWidth={420}
      >
        {suggestions.map((person) => (
          <button
            key={`${person.contractantId}-${person.id}`}
            type="button"
            className={`project-picker-option${selectedId === person.id ? ' active' : ''}`}
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSelect(person);
              setQuery(person.nom);
              setOpen(false);
            }}
          >
            <span className="project-picker-name">{person.nom}</span>
            <span className="project-picker-meta">
              {person.contractantNom}{person.matricule ? ` · ${person.matricule}` : ''}
            </span>
          </button>
        ))}
      </ProjectPickerDropdown>
    </div>
  );
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
  contractants,
  contractantEmployees,
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

  const patientType = normalizeSanteType(value.typeMalade);
  const family = isFamilyPatientType(value.typeMalade);
  const isContractant = patientType === 'CONTRACTANT';
  const isSocial = patientType === 'CAS SOCIAL';
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
    if (family || isContractant || isSocial) return [];
    const q = normalizePersonName(personQuery || `${value.nom} ${value.postnom}`);
    if (!q) return [];
    return employees
      .filter((e) => normalizePersonName(`${e.nom} ${e.matricule}`).includes(q))
      .slice(0, 8);
  }, [employees, family, isContractant, isSocial, personQuery, value.nom, value.postnom]);

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

  const applyContractantEmployee = (person: SanteContractantEmployeeLite | null) => {
    if (!person) {
      onChange({
        ...value,
        contractantEmployeeId: '',
        employeeMatricule: '',
        employeeNom: '',
      });
      return;
    }
    const split = splitEmployeeNom(person.nom);
    onChange({
      ...value,
      nom: split.nom,
      postnom: split.postnom,
      sexe: person.sexe || value.sexe,
      employeeMatricule: person.matricule,
      employeeNom: person.nom,
      contractantEmployeeId: person.id,
      contractantId: person.contractantId,
      contractantNom: person.contractantNom,
      dependantId: null,
    });
    setPersonQuery('');
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
                onChange={(e) => {
                  const nextType = e.target.value;
                  const nextKind = normalizeSanteType(nextType);
                  onChange({
                    ...value,
                    typeMalade: nextType,
                    dependantId: null,
                    ...(nextKind === 'CONTRACTANT'
                      ? { employeeMatricule: '', employeeNom: '' }
                      : { contractantId: '', contractantNom: '', contractantEmployeeId: '' }),
                  });
                  setPersonQuery('');
                  setShowSuggest(false);
                }}
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
            {isContractant ? (
              <div className="form-group form-group-full">
                <label>Contractant</label>
                <ContractantPersonPicker
                  people={contractantEmployees}
                  selectedId={value.contractantEmployeeId || ''}
                  onSelect={applyContractantEmployee}
                />
                {value.contractantEmployeeId ? (
                  <p className="sante-linked-hint">
                    Société <strong>{value.contractantNom || '—'}</strong>
                    {value.employeeMatricule ? ` · ${value.employeeMatricule}` : ''}
                  </p>
                ) : (
                  <p className="sante-linked-hint">Saisissez un nom pour voir les suggestions, ou complétez la fiche si la personne n’est pas enregistrée.</p>
                )}
              </div>
            ) : null}
            {!isContractant && !isSocial ? (
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
            ) : null}
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
                  onChange({
                    ...value,
                    nom: e.target.value,
                    dependantId: family ? value.dependantId : null,
                    ...(isContractant
                      ? { contractantEmployeeId: '', employeeMatricule: '', employeeNom: '' }
                      : {}),
                  });
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
                  onChange({
                    ...value,
                    postnom: e.target.value,
                    ...(isContractant
                      ? { contractantEmployeeId: '', employeeMatricule: '', employeeNom: '' }
                      : {}),
                  });
                  setPersonQuery(`${value.nom} ${e.target.value}`);
                  setShowSuggest(true);
                }}
              />
            </div>
            {isContractant && !value.contractantEmployeeId && (value.nom.trim() || value.postnom.trim()) ? (
              <div className="form-group form-group-full">
                <label>Contractant</label>
                <select
                  value={value.contractantId || ''}
                  onChange={(e) => {
                    const company = contractants.find((item) => item.id === e.target.value);
                    onChange({
                      ...value,
                      contractantId: company?.id || '',
                      contractantNom: company?.denomination || '',
                    });
                  }}
                >
                  <option value="">Choisir le contractant…</option>
                  {contractants.map((company) => (
                    <option key={company.id} value={company.id}>{company.denomination}</option>
                  ))}
                </select>
                <p className="sante-linked-hint">Personne non enregistrée : indiquez la société à laquelle elle est liée.</p>
              </div>
            ) : null}
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
              <label>Commentaire</label>
              <textarea
                rows={3}
                value={value.commentaire || ''}
                onChange={(e) => onChange({ ...value, commentaire: e.target.value })}
              />
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
            {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
