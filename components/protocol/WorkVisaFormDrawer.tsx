'use client';

import { useEffect, useMemo, useState } from 'react';
import SideDrawer from '@/components/SideDrawer';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import type { Employee } from '@/lib/types';
import type {
  WorkVisaDocumentInput,
  WorkVisaDossierInput,
  WorkVisaDossierView,
} from '@/lib/work-visa-types';
import { inferIsExpat } from '@/lib/work-visa-validity';

type DocForm = {
  number: string;
  type: string;
  issueDate: string;
  startDate: string;
  expiryDate: string;
};

type FormState = {
  matricule: string;
  nom: string;
  prenom: string;
  centreCout: string;
  sexe: string;
  nationalite: string;
  isExpat: boolean;
  status: 'actif' | 'inactif';
  passport: DocForm;
  workVisa: DocForm;
  workCard: DocForm;
  vsr: DocForm;
};

const emptyDoc = (): DocForm => ({
  number: '',
  type: '',
  issueDate: '',
  startDate: '',
  expiryDate: '',
});

function emptyForm(): FormState {
  return {
    matricule: '',
    nom: '',
    prenom: '',
    centreCout: '',
    sexe: '',
    nationalite: '',
    isExpat: false,
    status: 'actif',
    passport: emptyDoc(),
    workVisa: emptyDoc(),
    workCard: emptyDoc(),
    vsr: emptyDoc(),
  };
}

function fromDossier(d: WorkVisaDossierView): FormState {
  const mapDoc = (slot: WorkVisaDossierView['passport']): DocForm => ({
    number: slot.current?.number || '',
    type: slot.current?.type || '',
    issueDate: slot.current?.issueDate || '',
    startDate: slot.current?.startDate || '',
    expiryDate: slot.current?.expiryDate || '',
  });
  return {
    matricule: d.matricule,
    nom: d.nom,
    prenom: d.prenom,
    centreCout: d.centreCout,
    sexe: d.sexe,
    nationalite: d.nationalite,
    isExpat: d.isExpat,
    status: d.status,
    passport: mapDoc(d.passport),
    workVisa: mapDoc(d.workVisa),
    workCard: mapDoc(d.workCard),
    vsr: mapDoc(d.vsr),
  };
}

function toDocInput(doc: DocForm): WorkVisaDocumentInput | null {
  if (!doc.number.trim() && !doc.expiryDate.trim()) return null;
  return {
    number: doc.number.trim(),
    type: doc.type.trim() || undefined,
    issueDate: doc.issueDate || undefined,
    startDate: doc.startDate || undefined,
    expiryDate: doc.expiryDate,
  };
}

interface Props {
  open: boolean;
  editing: WorkVisaDossierView | null;
  employees: Employee[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: WorkVisaDossierInput) => Promise<void>;
}

export default function WorkVisaFormDrawer({
  open,
  editing,
  employees,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(editing ? fromDossier(editing) : emptyForm());
  }, [open, editing]);

  const title = useMemo(
    () => (editing ? `Modifier — ${editing.displayName}` : 'Nouveau dossier visa'),
    [editing],
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setDoc = (key: 'passport' | 'workVisa' | 'workCard' | 'vsr', patch: Partial<DocForm>) => {
    setForm((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleEmployee = (employee: Employee) => {
    setForm((prev) => ({
      ...prev,
      matricule: employee.matricule,
      nom: employee.nom,
      centreCout: employee.centreCout || prev.centreCout,
      sexe: employee.gender || prev.sexe,
      nationalite: employee.nationality || prev.nationalite,
      isExpat: inferIsExpat(employee.nationality || prev.nationalite),
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.matricule.trim() || !form.nom.trim()) {
      setError('Matricule et nom sont requis');
      return;
    }
    const payload: WorkVisaDossierInput = {
      matricule: form.matricule.trim(),
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      centreCout: form.centreCout.trim(),
      sexe: form.sexe.trim(),
      nationalite: form.nationalite.trim(),
      isExpat: form.isExpat,
      status: form.status,
      passport: toDocInput(form.passport),
      workVisa: toDocInput(form.workVisa),
      workCard: toDocInput(form.workCard),
      vsr: toDocInput(form.vsr),
    };
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <SideDrawer
      open={open}
      title={title}
      onClose={onClose}
      width={520}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      )}
    >
      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="form-grid work-visa-form-grid">
        <div className="form-group">
          <label htmlFor="wv-matricule">Matricule *</label>
          <input
            id="wv-matricule"
            value={form.matricule}
            onChange={(e) => setField('matricule', e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Employé (recherche)</label>
          <EmployeeSuggestInput
            employees={employees}
            value={form.nom}
            onChange={(nom) => setField('nom', nom)}
            onEmployeeSelect={handleEmployee}
            placeholder="Rechercher par nom…"
          />
        </div>
        <div className="form-group">
          <label htmlFor="wv-nom">Nom *</label>
          <input id="wv-nom" value={form.nom} onChange={(e) => setField('nom', e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="wv-prenom">Prénom</label>
          <input id="wv-prenom" value={form.prenom} onChange={(e) => setField('prenom', e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="wv-cc">Centre de coût</label>
          <input id="wv-cc" value={form.centreCout} onChange={(e) => setField('centreCout', e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="wv-sexe">Sexe</label>
          <select id="wv-sexe" value={form.sexe} onChange={(e) => setField('sexe', e.target.value)}>
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="wv-nat">Nationalité</label>
          <input
            id="wv-nat"
            value={form.nationalite}
            onChange={(e) => {
              const nationalite = e.target.value;
              setForm((prev) => ({
                ...prev,
                nationalite,
                isExpat: inferIsExpat(nationalite),
              }));
            }}
          />
        </div>
        <div className="form-group">
          <label htmlFor="wv-status">Statut dossier</label>
          <select
            id="wv-status"
            value={form.status}
            onChange={(e) => setField('status', e.target.value as 'actif' | 'inactif')}
          >
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </select>
        </div>
        <div className="form-group work-visa-check">
          <label>
            <input
              type="checkbox"
              checked={form.isExpat}
              onChange={(e) => setField('isExpat', e.target.checked)}
            />
            {' '}
            Expatrié
          </label>
        </div>
      </div>

      <DocSection
        title="Passeport"
        doc={form.passport}
        showType
        onChange={(patch) => setDoc('passport', patch)}
      />
      <DocSection
        title="Visa de travail"
        doc={form.workVisa}
        showStart
        onChange={(patch) => setDoc('workVisa', patch)}
      />
      <DocSection
        title="Carte de travail"
        doc={form.workCard}
        onChange={(patch) => setDoc('workCard', patch)}
      />
      <DocSection
        title="Visa Sortie-Retour (VSR)"
        doc={form.vsr}
        onChange={(patch) => setDoc('vsr', patch)}
      />
    </SideDrawer>
  );
}

function DocSection({
  title,
  doc,
  showType,
  showStart,
  onChange,
}: {
  title: string;
  doc: DocForm;
  showType?: boolean;
  showStart?: boolean;
  onChange: (patch: Partial<DocForm>) => void;
}) {
  return (
    <fieldset className="work-visa-doc-section">
      <legend>{title}</legend>
      <div className="form-grid work-visa-form-grid">
        <div className="form-group">
          <label>Numéro</label>
          <input value={doc.number} onChange={(e) => onChange({ number: e.target.value })} />
        </div>
        {showType ? (
          <div className="form-group">
            <label>Type</label>
            <input value={doc.type} onChange={(e) => onChange({ type: e.target.value })} placeholder="Ordinaire…" />
          </div>
        ) : null}
        <div className="form-group">
          <label>Délivrance</label>
          <input type="date" value={doc.issueDate} onChange={(e) => onChange({ issueDate: e.target.value })} />
        </div>
        {showStart ? (
          <div className="form-group">
            <label>Début</label>
            <input type="date" value={doc.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
          </div>
        ) : null}
        <div className="form-group">
          <label>Expiration</label>
          <input type="date" value={doc.expiryDate} onChange={(e) => onChange({ expiryDate: e.target.value })} />
        </div>
      </div>
    </fieldset>
  );
}
