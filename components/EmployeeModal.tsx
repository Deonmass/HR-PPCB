'use client';

import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import ProjectPickerDropdown from '@/components/ProjectPickerDropdown';
import {
  TYPE_CONTRATS,
  computeAgeFromDisplayDate,
  computeFinPeriodeEssai,
} from '@/lib/employee-columns';
import {
  CLASSIFICATION_RULES,
  resolveClassification,
} from '@/lib/convention-collective-rules';
import { familyGroupKey, isChildStatut, isSpouseStatut } from '@/lib/dependants-utils';
import type { Dependant } from '@/lib/dependants-types';
import { DEFAULT_LOCALISATIONS } from '@/lib/localisations';
import type { PosteGroup, VacantPoste } from '@/lib/postes-types';
import { showError, showWarning } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import { emptyEmployeeHrProfile } from '@/lib/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  employee: Employee | null;
  /** Liste active déjà chargée sur la page (Line Manager + sociétés). */
  employees?: Employee[];
  onClose: () => void;
  /** Retourne `true` si l’enregistrement a réussi dans la base employés. */
  onSave: (employee: Employee) => boolean | Promise<boolean>;
}

const LOCALISATIONS = [...DEFAULT_LOCALISATIONS];
const GENDERS = ['Male', 'Female'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
const DEFAULT_COMPANIES = [
  'PPC Barnet DRC Manufacturing',
  'PPC Barnet DRC Quarrying',
];
const CONJOINT_EMPLOYE_STATUT = 'Conjoint employé';

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

function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isConvertibleDependant(statut: string): boolean {
  const normalized = statut.trim().toLowerCase();
  if (normalized.includes('conjoint employ')) return false;
  return isSpouseStatut(statut) || isChildStatut(statut);
}

function blankEmployee(): Employee {
  return {
    matricule: '',
    nom: '',
    departement: '',
    grade: '',
    jobTitle: '',
    localisation: '',
    documents: {},
    ...emptyEmployeeHrProfile(),
    statut: 'Active',
    raisonExit: 'NA',
  };
}

function trialMonthsForGrade(grade: string): number | null {
  const trimmed = grade.trim();
  if (!trimmed) return null;
  return CLASSIFICATION_RULES[resolveClassification(trimmed)].trialMonths;
}

function filterPosteTitles(titles: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return titles.slice(0, 20);
  return titles.filter((title) => title.toLowerCase().includes(q)).slice(0, 20);
}

function NameSearchDoneIcon() {
  return (
    <svg
      className="employee-name-done-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="employee-name-done-circle" cx="12" cy="12" r="9" fill="none" />
      <path
        className="employee-name-done-check"
        d="M7.2 12.3l3.1 3.1 6.5-6.5"
        fill="none"
      />
    </svg>
  );
}

export default function EmployeeModal({
  employee,
  employees: employeesProp = [],
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<Employee>(blankEmployee);
  const [saving, setSaving] = useState(false);
  const [fetchedEmployees, setFetchedEmployees] = useState<Employee[]>([]);
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [dependantsLoading, setDependantsLoading] = useState(true);
  const [nameSearching, setNameSearching] = useState(false);
  const [debouncedNom, setDebouncedNom] = useState('');
  const [posteGroups, setPosteGroups] = useState<PosteGroup[]>([]);
  const [vacants, setVacants] = useState<VacantPoste[]>([]);
  const [posteTitles, setPosteTitles] = useState<string[]>([]);
  const [companyOptions, setCompanyOptions] = useState<string[]>(DEFAULT_COMPANIES);
  const [postePickerOpen, setPostePickerOpen] = useState(false);

  const posteWrapRef = useRef<HTMLDivElement>(null);
  const posteListRef = useRef<HTMLDivElement>(null);

  const employees = useMemo(() => {
    if (employeesProp.length > 0) return employeesProp;
    return fetchedEmployees;
  }, [employeesProp, fetchedEmployees]);

  useEffect(() => {
    if (!postePickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (posteWrapRef.current?.contains(target)) return;
      if (posteListRef.current?.contains(target)) return;
      setPostePickerOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [postePickerOpen]);

  useEffect(() => {
    if (employee) {
      setForm({
        ...blankEmployee(),
        ...employee,
        documents: { ...employee.documents },
        statut: employee.statut || 'Active',
        raisonExit: employee.raisonExit || 'NA',
      });
    } else {
      setForm(blankEmployee());
    }
  }, [employee]);

  useEffect(() => {
    let cancelled = false;
    setDependantsLoading(true);
    Promise.all([
      employeesProp.length > 0
        ? Promise.resolve(null)
        : fetch('/api/employees').then((res) => (res.ok ? res.json() : [])),
      fetch('/api/dependants').then((res) => (res.ok ? res.json() : null)),
      fetch('/api/employes/postes').then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([empsRaw, depsRaw, postesRaw]) => {
        if (cancelled) return;
        if (Array.isArray(empsRaw)) {
          setFetchedEmployees(empsRaw as Employee[]);
        }

        const depsList = Array.isArray(depsRaw?.dependants)
          ? (depsRaw.dependants as Dependant[])
          : [];
        setDependants(depsList);
        setDependantsLoading(false);

        const groups = Array.isArray(postesRaw?.groups) ? (postesRaw.groups as PosteGroup[]) : [];
        const vacantList = Array.isArray(postesRaw?.vacants) ? (postesRaw.vacants as VacantPoste[]) : [];
        const suggestTitles = Array.isArray(postesRaw?.suggestions?.titles)
          ? (postesRaw.suggestions.titles as string[])
          : [];
        const apiTitles = Array.isArray(postesRaw?.titles)
          ? (postesRaw.titles as string[])
          : [];
        const titles = [
          ...apiTitles,
          ...suggestTitles,
          ...groups.map((g) => g.title),
          ...vacantList.map((v) => v.title),
        ].filter(Boolean);
        setPosteGroups(groups);
        setVacants(vacantList);
        setPosteTitles([...new Set(titles)].sort((a, b) => a.localeCompare(b, 'fr')));

        const sourceEmps = employeesProp.length > 0 ? employeesProp : (Array.isArray(empsRaw) ? empsRaw as Employee[] : []);
        const fromEmployees = sourceEmps
          .map((e) => String(e.company || '').trim())
          .filter(Boolean);
        const fromPostes = groups.map((g) => String(g.company || '').trim()).filter(Boolean);
        setCompanyOptions(
          [...new Set([...DEFAULT_COMPANIES, ...fromEmployees, ...fromPostes])].sort((a, b) =>
            a.localeCompare(b, 'fr'),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setFetchedEmployees([]);
        setDependants([]);
        setDependantsLoading(false);
        setPosteGroups([]);
        setVacants([]);
        setPosteTitles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [employeesProp]);

  useEffect(() => {
    const raw = form.nom;
    if (raw.trim().length < 3) {
      setNameSearching(false);
      setDebouncedNom('');
      return;
    }
    setNameSearching(true);
    const timer = window.setTimeout(() => {
      setDebouncedNom(raw);
      setNameSearching(false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.nom]);

  const displayAge = useMemo(() => {
    if (form.age != null) return form.age;
    return computeAgeFromDisplayDate(form.dateOfBirth);
  }, [form.age, form.dateOfBirth]);

  const periodeEssaiAuto = useMemo(
    () => trialMonthsForGrade(form.grade),
    [form.grade],
  );

  const periodeEssaiMois = periodeEssaiAuto ?? form.periodeEssaiMois;

  const finEssaiAuto = useMemo(
    () => computeFinPeriodeEssai(form.appointmentDate, periodeEssaiMois),
    [form.appointmentDate, periodeEssaiMois],
  );

  const matchedDependant = useMemo(() => {
    const needle = normalizePersonName(debouncedNom);
    if (needle.length < 3 || nameSearching || dependantsLoading) return null;
    return (
      dependants.find((d) => {
        if (!isConvertibleDependant(d.statut)) return false;
        return normalizePersonName(d.nom) === needle;
      }) ?? null
    );
  }, [dependants, debouncedNom, nameSearching, dependantsLoading]);

  const showNameSearchSpinner = (nameSearching || dependantsLoading) && form.nom.trim().length >= 3;

  const selectedPosteMeta = useMemo(() => {
    const title = form.jobTitle.trim();
    if (!title) return null;
    const group = posteGroups.find((g) => g.title === title);
    const vacant = vacants.find((v) => v.title === title);
    if (!group && !vacant) {
      return {
        department: form.departement,
        location: form.localisation,
        grade: form.grade,
        costCenter: form.centreCout,
        company: form.company,
      };
    }
    return {
      department: group?.department || vacant?.department || form.departement,
      location: group?.location || vacant?.location || form.localisation,
      grade: group?.grade || vacant?.grade || form.grade,
      costCenter: group?.costCenter || vacant?.costCenter || form.centreCout,
      company: group?.company || form.company,
    };
  }, [form.jobTitle, form.departement, form.localisation, form.grade, form.centreCout, form.company, posteGroups, vacants]);

  const posteSuggestions = useMemo(
    () => filterPosteTitles(posteTitles, form.jobTitle),
    [posteTitles, form.jobTitle],
  );

  const companySelectOptions = useMemo(() => {
    const current = form.company.trim();
    const options = [...companyOptions];
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [companyOptions, form.company]);

  const managerSelection: EmployeeSelection | null = useMemo(() => {
    const name = form.lineManagerName.trim();
    if (!name) return null;
    const found = employees.find(
      (e) => normalizePersonName(e.nom) === normalizePersonName(name),
    );
    return {
      matricule: found?.matricule || '',
      nom: form.lineManagerName,
      departement: found?.departement || '',
    };
  }, [employees, form.lineManagerName]);

  const managerCandidates = useMemo(
    () => employees.filter((e) => (e.statut || 'Active').toLowerCase() !== 'inactive'),
    [employees],
  );

  const patch = <K extends keyof Employee>(key: K, value: Employee[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const applyPosteTitle = useCallback((title: string) => {
    const group = posteGroups.find((g) => g.title === title);
    const vacant = vacants.find((v) => v.title === title);
    const grade = group?.grade || vacant?.grade || '';
    const trial = trialMonthsForGrade(grade);
    setForm((f) => ({
      ...f,
      jobTitle: title,
      position: title || f.position,
      departement: group?.department || vacant?.department || f.departement,
      localisation: group?.location || vacant?.location || f.localisation,
      grade: grade || f.grade,
      centreCout: group?.costCenter || vacant?.costCenter || f.centreCout,
      company: f.company || group?.company || '',
      periodeEssaiMois: trial ?? f.periodeEssaiMois,
    }));
    setPostePickerOpen(false);
  }, [posteGroups, vacants]);

  const handleJobTitleInput = (value: string) => {
    const group = posteGroups.find((g) => g.title === value);
    const vacant = vacants.find((v) => v.title === value);
    if (group || vacant) {
      applyPosteTitle(value);
      return;
    }
    setForm((f) => ({
      ...f,
      jobTitle: value,
      position: value || f.position,
    }));
    setPostePickerOpen(true);
  };

  const handleManagerChange = (selection: EmployeeSelection | null) => {
    if (!selection) {
      setForm((f) => ({
        ...f,
        lineManagerName: '',
        lineManagerPosition: '',
      }));
      return;
    }
    const full = managerCandidates.find((e) => e.matricule === selection.matricule)
      || employees.find((e) => e.matricule === selection.matricule);
    setForm((f) => ({
      ...f,
      lineManagerName: selection.nom,
      lineManagerPosition: full?.jobTitle || full?.position || (selection.matricule ? f.lineManagerPosition : ''),
    }));
  };

  const handleGradeChange = (grade: string) => {
    const trial = trialMonthsForGrade(grade);
    setForm((f) => ({
      ...f,
      grade,
      periodeEssaiMois: trial ?? f.periodeEssaiMois,
    }));
  };

  const promoteMatchedDependant = async (saved: Employee, match: Dependant) => {
    // Reste sous le bloc du mari (matricule famille) ; ownMatricule = matricule employé du conjoint.
    const familyMat = familyGroupKey(match) || saved.matricule;
    const payload = {
      matricule: familyMat,
      ownMatricule: saved.matricule,
      pactilis: match.pactilis,
      statut: CONJOINT_EMPLOYE_STATUT,
      sexe: match.sexe,
      nom: saved.nom || match.nom,
      localisation: saved.localisation || match.localisation,
      numeroVilla: match.numeroVilla || '',
      typeMaison: match.typeMaison || '',
      dateNaissance: match.dateNaissance,
      age: match.age,
      compositionFamille: match.compositionFamille,
      enfants: match.enfants,
      total: match.total,
      commentaires: match.commentaires,
      lienDocument: match.lienDocument,
    };
    const res = await fetch(`/api/dependants/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || 'Mise à jour du dépendant impossible');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const missing: string[] = [];
    if (!form.matricule.trim()) missing.push('Matricule');
    if (!form.nom.trim()) missing.push('Nom complet');
    if (missing.length) {
      await showWarning(
        `Veuillez renseigner : ${missing.join(', ')}.`,
        'Champs obligatoires',
      );
      return;
    }

    setSaving(true);
    try {
      const payload: Employee = {
        ...form,
        age: displayAge,
        periodeEssaiMois: periodeEssaiMois ?? null,
        dateFinPeriodeEssai: finEssaiAuto,
        statut: form.statut || 'Active',
        raisonExit: form.raisonExit || 'NA',
        position: form.position || form.jobTitle,
        departement: form.departement || selectedPosteMeta?.department || '',
        centreCout: form.centreCout || selectedPosteMeta?.costCenter || '',
      };

      // Toujours persister dans la base employés (POST/PUT /api/employees).
      const ok = await Promise.resolve(onSave(payload));
      if (!ok) return;

      if (matchedDependant) {
        try {
          await promoteMatchedDependant(payload, matchedDependant);
        } catch (err) {
          await showError(
            err instanceof Error
              ? err.message
              : 'Employé enregistré, mais le statut dépendant n’a pas pu être mis à jour.',
          );
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const posteHintParts = selectedPosteMeta
    ? [
        selectedPosteMeta.department && `Département : ${selectedPosteMeta.department}`,
        selectedPosteMeta.location && `Localisation : ${selectedPosteMeta.location}`,
        selectedPosteMeta.grade && `Grade : ${selectedPosteMeta.grade}`,
        selectedPosteMeta.costCenter && `Centre de coût : ${selectedPosteMeta.costCenter}`,
        selectedPosteMeta.company && `Société : ${selectedPosteMeta.company}`,
      ].filter(Boolean)
    : [];

  return (
    <div className="modal-overlay open" role="presentation">
      <div
        className="modal modal-lg modal-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-modal-title"
      >
        <div className="modal-header">
          <h3 id="employee-modal-title">{employee ? 'Fiche employé' : 'Ajouter un employé'}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <h4 className="form-section-title">Identité</h4>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="emp-matricule">Matricule *</label>
                <input
                  id="emp-matricule"
                  required
                  value={form.matricule}
                  readOnly={!!employee}
                  onChange={(e) => patch('matricule', e.target.value)}
                />
              </div>
              <div className="form-group full">
                <label htmlFor="emp-nom">Nom complet *</label>
                <div
                  className={`employee-name-search-field${matchedDependant ? ' is-found' : ''}${showNameSearchSpinner ? ' is-searching' : ''}`}
                >
                  <input
                    id="emp-nom"
                    required
                    value={form.nom}
                    onChange={(e) => patch('nom', e.target.value)}
                    autoComplete="off"
                  />
                  {showNameSearchSpinner ? (
                    <span className="employee-name-search-status" role="status" aria-label="Cherchant">
                      <span className="btn-spinner" aria-hidden="true" />
                    </span>
                  ) : matchedDependant ? (
                    <span
                      className="employee-name-search-status is-done"
                      role="status"
                      tabIndex={0}
                      aria-label="Nom trouvé dans les dépendants"
                    >
                      <NameSearchDoneIcon />
                      <span className="employee-name-done-tooltip">
                        Déjà enregistré comme {matchedDependant.statut}
                        {matchedDependant.employeNom ? ` de ${matchedDependant.employeNom}` : ''}
                        {' — '}statut passera à « {CONJOINT_EMPLOYE_STATUT} »
                        {matchedDependant.pactilis
                          ? ` (pactilis ${matchedDependant.pactilis} conservé)`
                          : ''}
                        .
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="emp-company">Société</label>
                <select
                  id="emp-company"
                  value={form.company || ''}
                  onChange={(e) => patch('company', e.target.value)}
                >
                  <option value="">Sélectionner…</option>
                  {companySelectOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="emp-gender">Genre</label>
                <select
                  id="emp-gender"
                  value={form.gender || ''}
                  onChange={(e) => patch('gender', e.target.value)}
                >
                  <option value="">Sélectionner…</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="emp-dob">Date de naissance</label>
                <input
                  id="emp-dob"
                  type="date"
                  value={toDateInputValue(form.dateOfBirth)}
                  onChange={(e) => patch('dateOfBirth', fromDateInputValue(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>Âge</label>
                <input
                  className="input-readonly"
                  value={displayAge ?? ''}
                  readOnly
                  title="Calculé automatiquement — non modifiable"
                />
              </div>
              <div className="form-group">
                <label htmlFor="emp-nationality">Nationalité</label>
                <input
                  id="emp-nationality"
                  value={form.nationality}
                  onChange={(e) => patch('nationality', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="emp-marital">État civil</label>
                <select
                  id="emp-marital"
                  value={form.maritalStatus || ''}
                  onChange={(e) => patch('maritalStatus', e.target.value)}
                >
                  <option value="">Sélectionner…</option>
                  {MARITAL.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="emp-children">Nombre d&apos;enfants</label>
                <input
                  id="emp-children"
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
                <label htmlFor="emp-hire">Date d&apos;embauche</label>
                <input
                  id="emp-hire"
                  type="date"
                  value={toDateInputValue(form.appointmentDate)}
                  onChange={(e) => patch('appointmentDate', fromDateInputValue(e.target.value))}
                />
              </div>
            </div>

            <h4 className="form-section-title">Poste & organisation</h4>
            <div className="form-grid">
              <div className="form-group full">
                <label htmlFor="emp-job-title">Intitulé du poste</label>
                <div
                  ref={posteWrapRef}
                  className={`project-picker${postePickerOpen ? ' is-open' : ''}`}
                >
                  <input
                    id="emp-job-title"
                    className="project-picker-input"
                    value={form.jobTitle}
                    placeholder="Rechercher ou saisir un poste…"
                    autoComplete="off"
                    onFocus={() => setPostePickerOpen(true)}
                    onChange={(e) => handleJobTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setPostePickerOpen(false);
                    }}
                  />
                  <ProjectPickerDropdown
                    anchorRef={posteWrapRef}
                    listRef={posteListRef}
                    open={postePickerOpen && posteSuggestions.length > 0}
                  >
                    {posteSuggestions.map((title) => (
                      <button
                        key={title}
                        type="button"
                        className={`project-picker-option${form.jobTitle === title ? ' active' : ''}`}
                        role="option"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => applyPosteTitle(title)}
                      >
                        <span className="project-picker-name">{title}</span>
                        <span className="project-picker-meta">
                          {(() => {
                            const group = posteGroups.find((g) => g.title === title);
                            const vacant = vacants.find((v) => v.title === title);
                            const parts = [
                              group?.department || vacant?.department,
                              group?.location || vacant?.location,
                              group ? `${group.count} occupant${group.count > 1 ? 's' : ''}` : (vacant ? 'Vacant' : ''),
                            ].filter(Boolean);
                            return parts.join(' · ');
                          })()}
                        </span>
                      </button>
                    ))}
                  </ProjectPickerDropdown>
                </div>
                {posteHintParts.length > 0 ? (
                  <p className="form-hint">{posteHintParts.join(' · ')}</p>
                ) : (
                  <p className="form-hint">
                    Le département, la localisation et le centre de coût se remplissent selon le poste.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="emp-grade">Grade</label>
                <input
                  id="emp-grade"
                  value={form.grade}
                  placeholder="C1, B2..."
                  onChange={(e) => handleGradeChange(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="emp-localisation">Localisation</label>
                <input
                  id="emp-localisation"
                  list="localisation-list-emp-modal"
                  value={form.localisation}
                  onChange={(e) => patch('localisation', e.target.value)}
                />
                <datalist id="localisation-list-emp-modal">
                  {LOCALISATIONS.map((l) => <option key={l} value={l} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>Centre de coût</label>
                <input
                  className="input-readonly"
                  value={form.centreCout}
                  readOnly
                  title="Renseigné automatiquement selon le poste"
                />
              </div>
              <div className="form-group">
                <label htmlFor="emp-cnss">CNSS</label>
                <input
                  id="emp-cnss"
                  value={form.cnss}
                  onChange={(e) => patch('cnss', e.target.value)}
                  placeholder="N° CNSS"
                />
              </div>
              <div className="form-group">
                <label htmlFor="emp-nif">NIF</label>
                <input
                  id="emp-nif"
                  value={form.nif}
                  onChange={(e) => patch('nif', e.target.value)}
                  placeholder="N° NIF"
                />
              </div>
            </div>

            <h4 className="form-section-title">Manager</h4>
            <div className="form-grid">
              <div className="form-group">
                <label>Line Manager</label>
                <EmployeePicker
                  employees={managerCandidates}
                  value={managerSelection}
                  onChange={handleManagerChange}
                  excludeMatricule={form.matricule}
                  placeholder="Rechercher un employé…"
                />
                {managerCandidates.length === 0 ? (
                  <p className="form-hint">Aucun employé chargé pour les suggestions.</p>
                ) : null}
              </div>
              <div className="form-group">
                <label>Poste du manager</label>
                <input
                  className="input-readonly"
                  value={form.lineManagerPosition}
                  readOnly
                  title="Renseigné automatiquement selon le manager choisi"
                />
              </div>
            </div>

            <h4 className="form-section-title">Contrat</h4>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="emp-type-contrat">Type de contrat</label>
                <select
                  id="emp-type-contrat"
                  value={form.typeContrat || ''}
                  onChange={(e) => patch('typeContrat', e.target.value)}
                >
                  <option value="">Sélectionner…</option>
                  {TYPE_CONTRATS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="emp-duree">Durée contrat (mois)</label>
                <input
                  id="emp-duree"
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
                  className="input-readonly"
                  type="number"
                  value={periodeEssaiMois ?? ''}
                  readOnly
                  title="Selon le grade et la convention collective"
                />
                {periodeEssaiAuto != null ? (
                  <p className="form-hint">
                    Convention : {CLASSIFICATION_RULES[resolveClassification(form.grade)].label}
                    {' — '}
                    {periodeEssaiAuto} mois
                  </p>
                ) : (
                  <p className="form-hint">Renseignez le grade pour calculer la période d&apos;essai.</p>
                )}
              </div>
              <div className="form-group">
                <label>Date fin période d&apos;essai</label>
                <input
                  className="input-readonly"
                  type="date"
                  value={toDateInputValue(finEssaiAuto)}
                  readOnly
                  title="Date d'embauche + période d'essai (mois)"
                />
                <p className="form-hint">
                  Date d&apos;embauche + période d&apos;essai (mois)
                  {finEssaiAuto ? ` → ${finEssaiAuto}` : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-with-icon"
              disabled={saving}
              aria-busy={saving}
            >
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
