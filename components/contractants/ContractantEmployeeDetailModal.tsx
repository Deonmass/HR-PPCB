'use client';

import { useMemo, useState } from 'react';
import {
  CONTRACTANT_FAMILY_LIENS,
  CONTRACTANT_SEXES,
  etatCivilLabel,
  type ContractantEmployee,
  type ContractantFamilyMember,
  type ContractantFamilyLien,
  type ContractantSexe,
} from '@/lib/contractants-types';

export type DetailFlatEmployee = ContractantEmployee & {
  contractantId: string;
  contractantNom: string;
  typeService: string;
};

interface Props {
  employee: DetailFlatEmployee;
  peers: ContractantEmployee[];
  disciplineCount: number;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSaveFamily: (family: ContractantFamilyMember[]) => Promise<void>;
  onSaveManager: (managerEmployeeId: string) => Promise<void>;
}

function newFamilyId(): string {
  return `fam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ContractantEmployeeDetailModal({
  employee,
  peers,
  disciplineCount,
  canEdit,
  onClose,
  onEdit,
  onSaveFamily,
  onSaveManager,
}: Props) {
  const [family, setFamily] = useState<ContractantFamilyMember[]>(
    () => employee.family?.map((m) => ({ ...m })) ?? [],
  );
  const [managerId, setManagerId] = useState(employee.managerEmployeeId || '');
  const [savingFamily, setSavingFamily] = useState(false);
  const [savingManager, setSavingManager] = useState(false);

  const manager = useMemo(
    () => peers.find((p) => p.id === managerId) ?? null,
    [peers, managerId],
  );
  const reports = useMemo(
    () => peers.filter((p) => p.managerEmployeeId === employee.id && p.id !== employee.id),
    [peers, employee.id],
  );
  const managerOptions = useMemo(
    () => peers.filter((p) => p.id !== employee.id).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [peers, employee.id],
  );

  const addFamilyRow = () => {
    setFamily((prev) => [
      ...prev,
      { id: newFamilyId(), nom: '', lien: 'Enfant', dateNaissance: '', sexe: '' },
    ]);
  };

  const updateFamily = (id: string, patch: Partial<ContractantFamilyMember>) => {
    setFamily((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removeFamily = (id: string) => {
    setFamily((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSaveFamily = async () => {
    setSavingFamily(true);
    try {
      await onSaveFamily(
        family
          .map((m) => ({
            ...m,
            nom: m.nom.trim(),
            lien: m.lien.trim() || 'Autre',
            dateNaissance: m.dateNaissance.trim(),
          }))
          .filter((m) => m.nom),
      );
    } finally {
      setSavingFamily(false);
    }
  };

  const handleSaveManager = async () => {
    setSavingManager(true);
    try {
      await onSaveManager(managerId);
    } finally {
      setSavingManager(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div
        className="modal contractants-modal contractants-view-modal contractant-emp-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Détail employé</h3>
          <button
            type="button"
            className="modal-close dashboard-list-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="contractant-emp-detail-grid">
            <section className="contractant-emp-detail-section">
              <h4>Identité</h4>
              <dl className="contractants-view-grid">
                <div>
                  <dt>Noms et post-noms</dt>
                  <dd>{employee.nom}</dd>
                </div>
                {!employee.contractantNom ? null : (
                  <div>
                    <dt>Contractant</dt>
                    <dd>{employee.contractantNom}</dd>
                  </div>
                )}
                <div>
                  <dt>Sexe</dt>
                  <dd>{employee.sexe || '—'}</dd>
                </div>
                <div>
                  <dt>État civil</dt>
                  <dd>{etatCivilLabel(employee.etatCivil)}</dd>
                </div>
                <div>
                  <dt>Lieu d&apos;affectation</dt>
                  <dd>{employee.lieuAffectation || '—'}</dd>
                </div>
                <div>
                  <dt>Fonction</dt>
                  <dd>{employee.fonction || '—'}</dd>
                </div>
                <div>
                  <dt>Département</dt>
                  <dd>{employee.departement || '—'}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{employee.service || '—'}</dd>
                </div>
                <div>
                  <dt>Téléphone</dt>
                  <dd>{employee.telephoneAirtime || '—'}</dd>
                </div>
                <div>
                  <dt>Statut</dt>
                  <dd>{employee.statut}</dd>
                </div>
                <div>
                  <dt>Date d&apos;embauche</dt>
                  <dd>{employee.dateEmbauche || '—'}</dd>
                </div>
                <div>
                  <dt>Date de sortie</dt>
                  <dd>{employee.dateSortie || '—'}</dd>
                </div>
                <div>
                  <dt>Cas disciplinaires</dt>
                  <dd>
                    <span className="contractant-discipline-badge">{disciplineCount}</span>
                  </dd>
                </div>
                {employee.matriculePpc ? (
                  <div>
                    <dt>Matricule PPC</dt>
                    <dd>{employee.matriculePpc}</dd>
                  </div>
                ) : null}
                {employee.numeroCompte || employee.banque ? (
                  <div>
                    <dt>Compte / Banque</dt>
                    <dd>
                      {employee.numeroCompte || '—'}
                      {employee.banque ? ` · ${employee.banque}` : ''}
                    </dd>
                  </div>
                ) : null}
                {employee.numeroCnss ? (
                  <div>
                    <dt>N° CNSS</dt>
                    <dd>{employee.numeroCnss}</dd>
                  </div>
                ) : null}
                {employee.txJr ? (
                  <div>
                    <dt>Tx/Jr (USD)</dt>
                    <dd>{employee.txJr}</dd>
                  </div>
                ) : null}
                {employee.payrollSite ? (
                  <div>
                    <dt>Paie</dt>
                    <dd>{employee.payrollSite === 'site' ? 'Site' : 'Hors site'}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Dépendants fiscaux</dt>
                  <dd>{employee.nbDependants || 0}</dd>
                </div>
              </dl>
            </section>

            <section className="contractant-emp-detail-section">
              <h4>Organigramme</h4>
              <div className="contractant-org-chart">
                {manager ? (
                  <>
                    <div className="contractant-org-node">
                      <span className="contractant-org-node-role">N+1</span>
                      {manager.nom}
                    </div>
                    <div className="contractant-org-line" aria-hidden />
                  </>
                ) : null}
                <div className="contractant-org-node is-self">
                  <span className="contractant-org-node-role">Employé</span>
                  {employee.nom}
                </div>
                {reports.length > 0 ? (
                  <>
                    <div className="contractant-org-line" aria-hidden />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
                      {reports.map((r) => (
                        <div key={r.id} className="contractant-org-node">
                          <span className="contractant-org-node-role">N-1</span>
                          {r.nom}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
              {canEdit ? (
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label>Responsable (N+1)</label>
                  <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                    <option value="">— Aucun —</option>
                    {managerOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '0.5rem' }}
                    disabled={savingManager || managerId === (employee.managerEmployeeId || '')}
                    onClick={() => void handleSaveManager()}
                  >
                    {savingManager ? 'Enregistrement…' : 'Enregistrer le N+1'}
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          <section className="contractant-emp-detail-section" style={{ marginTop: '1rem' }}>
            <h4>Famille</h4>
            {family.length === 0 && !canEdit ? (
              <p className="text-muted">Aucun membre de famille renseigné.</p>
            ) : (
              <ul className="contractant-family-list">
                {family.map((m) => (
                  <li key={m.id} className="contractant-family-item">
                    {canEdit ? (
                      <>
                        <input
                          placeholder="Nom"
                          value={m.nom}
                          onChange={(e) => updateFamily(m.id, { nom: e.target.value })}
                        />
                        <select
                          value={m.lien}
                          onChange={(e) =>
                            updateFamily(m.id, { lien: e.target.value as ContractantFamilyLien })
                          }
                        >
                          {CONTRACTANT_FAMILY_LIENS.map((lien) => (
                            <option key={lien} value={lien}>
                              {lien}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={m.dateNaissance}
                          onChange={(e) => updateFamily(m.id, { dateNaissance: e.target.value })}
                        />
                        <select
                          value={m.sexe}
                          onChange={(e) =>
                            updateFamily(m.id, { sexe: e.target.value as ContractantSexe | '' })
                          }
                        >
                          <option value="">Sexe</option>
                          {CONTRACTANT_SEXES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeFamily(m.id)}
                          aria-label="Retirer"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <>
                        <span>
                          <strong>{m.nom}</strong> · {m.lien}
                        </span>
                        <span>{m.dateNaissance || '—'}</span>
                        <span>{m.sexe || '—'}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addFamilyRow}>
                  + Ajouter un membre
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={savingFamily}
                  onClick={() => void handleSaveFamily()}
                >
                  {savingFamily ? 'Enregistrement…' : 'Enregistrer la famille'}
                </button>
              </div>
            ) : null}
          </section>
        </div>
        <div className="modal-footer">
          {canEdit ? (
            <button type="button" className="btn btn-secondary" onClick={onEdit}>
              Modifier
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
