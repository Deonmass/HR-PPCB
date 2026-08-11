'use client';

import { BtnSpinner } from '@/components/overtime/TimesheetIcons';
import {
  dependantNeedsDocumentLink,
  getDependantDocumentLinkLabel,
} from '@/lib/dependants-columns';
import type { Dependant, DependantFormData } from '@/lib/dependants-types';
import { computeFamilyCompositionCounts, isEmployeeStatut } from '@/lib/dependants-utils';
import { DEFAULT_LOCALISATIONS } from '@/lib/localisations';
import { useEffect, useMemo, useState } from 'react';

const STATUTS = ['Employé', 'Conjoint', 'Conjoint(e)', 'Conjoint employé', 'Enfant'];
const SEXES = ['M', 'F'];
const LOCALISATIONS = [...DEFAULT_LOCALISATIONS];

const SHAREPOINT_PLACEHOLDER =
  'https://ppcafr.sharepoint.com/:b:/r/sites/...';

interface Props {
  dependant: Dependant | null;
  /** Membres connus de la famille (pour Composition / Enfants / Total). */
  familyMembers?: Dependant[];
  defaultMatricule?: string;
  /** Localisation de l'employé — préremplie à l'ajout d'un dépendant. */
  defaultLocalisation?: string;
  onClose: () => void;
  onSave: (data: DependantFormData) => Promise<void>;
}

function toFormData(
  dependant: Dependant | null,
  defaultMatricule = '',
  defaultLocalisation = '',
): DependantFormData {
  if (dependant) {
    return {
      matricule: dependant.matricule,
      pactilis: dependant.pactilis,
      statut: dependant.statut,
      sexe: dependant.sexe,
      nom: dependant.nom,
      localisation: dependant.localisation,
      numeroVilla: dependant.numeroVilla ?? '',
      typeMaison: dependant.typeMaison ?? '',
      dateNaissance: dependant.dateNaissance,
      compositionFamille: dependant.compositionFamille,
      enfants: dependant.enfants,
      total: dependant.total,
      commentaires: dependant.commentaires,
      lienDocument: dependant.lienDocument ?? '',
    };
  }
  return {
    matricule: defaultMatricule,
    pactilis: '',
    statut: 'Enfant',
    sexe: 'M',
    nom: '',
    localisation: defaultLocalisation.trim() || 'Kinshasa',
    numeroVilla: '',
    typeMaison: '',
    dateNaissance: '',
    compositionFamille: null,
    enfants: null,
    total: null,
    commentaires: '',
    lienDocument: '',
  };
}

function documentHint(statut: string): string {
  if (/employ/i.test(statut)) return ' (document employé)';
  if (/conjoint/i.test(statut)) return ' (certificat de mariage)';
  if (/enfant/i.test(statut)) return ' (acte de naissance)';
  return '';
}

export default function DependantFormModal({
  dependant,
  familyMembers = [],
  defaultMatricule = '',
  defaultLocalisation = '',
  onClose,
  onSave,
}: Props) {
  const [form, setForm] = useState<DependantFormData>(() =>
    toFormData(dependant, defaultMatricule, defaultLocalisation),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toFormData(dependant, defaultMatricule, defaultLocalisation));
  }, [dependant, defaultMatricule, defaultLocalisation]);

  const isEmployee = isEmployeeStatut(form.statut);

  const familyCounts = useMemo(() => {
    if (!isEmployee) return null;
    const others = familyMembers.filter((member) => {
      if (dependant && member.id === dependant.id) return false;
      return true;
    });
    return computeFamilyCompositionCounts([
      { statut: form.statut },
      ...others.map((member) => ({ statut: member.statut })),
    ]);
  }, [isEmployee, familyMembers, dependant, form.statut]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        ...(familyCounts ?? {}),
        lienDocument: form.lienDocument?.trim() ?? '',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const showDocumentLink = dependantNeedsDocumentLink(form.statut);
  const documentLinkLabel = getDependantDocumentLinkLabel(form.statut);

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal dependant-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{dependant ? 'Modifier le bénéficiaire' : 'Ajouter un membre'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group">
                <label>Matricule *</label>
                <input
                  required
                  value={form.matricule}
                  readOnly={!!dependant}
                  onChange={(event) => setForm({ ...form, matricule: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label>N° Pactilis</label>
                <input
                  value={form.pactilis}
                  onChange={(event) => setForm({ ...form, pactilis: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Statut *</label>
                <select
                  required
                  value={form.statut}
                  onChange={(event) => setForm({ ...form, statut: event.target.value })}
                >
                  {STATUTS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Sexe *</label>
                <select
                  required
                  value={form.sexe}
                  onChange={(event) => setForm({ ...form, sexe: event.target.value })}
                >
                  {SEXES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="form-group full">
                <label>Nom et prénoms *</label>
                <input
                  required
                  value={form.nom}
                  onChange={(event) => setForm({ ...form, nom: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Localisation</label>
                <input
                  list="dep-localisation-list"
                  value={form.localisation}
                  readOnly={!dependant && !!defaultLocalisation}
                  title={
                    !dependant && defaultLocalisation
                      ? 'Localisation de l\'employé (appliquée automatiquement)'
                      : undefined
                  }
                  onChange={(event) => setForm({ ...form, localisation: event.target.value })}
                />
                <datalist id="dep-localisation-list">
                  {LOCALISATIONS.map((value) => <option key={value} value={value} />)}
                </datalist>
                {!dependant && defaultLocalisation ? (
                  <p className="dependant-link-hint">
                    Suit automatiquement la localisation de l&apos;employé.
                  </p>
                ) : null}
              </div>
              <div className="form-group">
                <label>Date de naissance</label>
                <input
                  placeholder="jj/mm/aaaa"
                  value={form.dateNaissance}
                  onChange={(event) => setForm({ ...form, dateNaissance: event.target.value })}
                />
              </div>
              {isEmployee && familyCounts && (
                <>
                  <div className="form-group">
                    <label>Composition famille</label>
                    <input
                      type="number"
                      readOnly
                      value={familyCounts.compositionFamille}
                      title="Calculé automatiquement (conjoints / autres dépendants)"
                    />
                  </div>
                  <div className="form-group">
                    <label>Enfants</label>
                    <input
                      type="number"
                      readOnly
                      value={familyCounts.enfants}
                      title="Calculé automatiquement selon les enfants de la famille"
                    />
                  </div>
                  <div className="form-group">
                    <label>Total</label>
                    <input
                      type="number"
                      readOnly
                      value={familyCounts.total}
                      title="Employé + composition famille + enfants"
                    />
                  </div>
                  <p className="dependant-link-hint form-group full">
                    Ces champs sont calculés automatiquement selon la composition familiale.
                  </p>
                </>
              )}
              {showDocumentLink && (
                <div className="form-group full">
                  <label htmlFor="dependant-lien-document">{documentLinkLabel}</label>
                  <div className="dependant-link-field">
                    <input
                      id="dependant-lien-document"
                      type="url"
                      inputMode="url"
                      placeholder={SHAREPOINT_PLACEHOLDER}
                      value={form.lienDocument}
                      onChange={(event) => setForm({ ...form, lienDocument: event.target.value })}
                    />
                    {form.lienDocument.trim() && (
                      <a
                        className="btn btn-outline btn-sm"
                        href={form.lienDocument.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ouvrir
                      </a>
                    )}
                  </div>
                  <p className="dependant-link-hint">
                    Collez le lien SharePoint du document{documentHint(form.statut)}.
                  </p>
                </div>
              )}
              <div className="form-group full">
                <label>Commentaires</label>
                <textarea
                  rows={3}
                  value={form.commentaires}
                  onChange={(event) => setForm({ ...form, commentaires: event.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-accent btn-with-icon"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? <BtnSpinner /> : null}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
