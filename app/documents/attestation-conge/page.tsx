'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import { sleep } from '@/lib/attestation-agent-form';
import {
  employeeToLeaveAgent,
  leaveAgentToBilingualFormData,
  refreshLeaveAgentBodies,
  type LeaveAgentDraft,
  type LeaveSharedFields,
} from '@/lib/leave-attestation-agent';
import { formatAttestationAgentName } from '@/lib/format-display-name';
import { localizeJobTitle } from '@/lib/job-title-i18n';
import { filterAttestationSignatories } from '@/lib/attestation-signatories';
import type { LeaveAttestationRecord } from '@/lib/leave-attestation-types';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

type PageTab = 'form' | 'history';

const MAX_AGENTS = 3;

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR');
}

function genreFromEmployee(employee: Employee): string {
  if (/^f/i.test(employee.gender)) return 'Madame';
  if (/^m/i.test(employee.gender)) return 'Monsieur';
  return 'Monsieur';
}

function downloadUrl(id: string, type: 'docx' | 'pdf'): string {
  const params = type === 'pdf' ? '?type=pdf' : '';
  return `/api/documents/leave-attestation/${encodeURIComponent(id)}/download${params}`;
}

async function downloadRecord(
  record: LeaveAttestationRecord,
  fileType: 'docx' | 'pdf',
): Promise<void> {
  const dlRes = await fetch(downloadUrl(record.id, fileType));
  if (!dlRes.ok) {
    const json = (await dlRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || 'Export impossible');
  }
  const blob = await dlRes.blob();
  const objectUrl = URL.createObjectURL(blob);
  const contentDisposition = dlRes.headers.get('content-disposition') || '';
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  const fileName =
    match?.[1]
    || (fileType === 'pdf' ? record.fileName.replace(/\.docx$/i, '.pdf') : record.fileName);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export default function AttestationCongePage() {
  const { can } = usePermissions();
  const canCreate = can('documents.attestation-conge', 'create');
  const canExport = can('documents.attestation-conge', 'export');
  const canDelete = can('documents.attestation-conge', 'delete');
  const [pageTab, setPageTab] = useState<PageTab>(() =>
    can('documents.attestation-conge', 'create') ? 'form' : 'history',
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [documentDate, setDocumentDate] = useState(todayInputDate);
  const [hodGenre, setHodGenre] = useState('Monsieur');
  const [hodName, setHodName] = useState('');
  const [hodFunctionFr, setHodFunctionFr] = useState('');
  const [hodFunctionEn, setHodFunctionEn] = useState('');
  const [agents, setAgents] = useState<LeaveAgentDraft[]>([]);
  const [activeMatricule, setActiveMatricule] = useState<string | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [history, setHistory] = useState<LeaveAttestationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shared: LeaveSharedFields = useMemo(
    () => ({ documentDate, hodName, hodGenre, hodFunctionFr, hodFunctionEn }),
    [documentDate, hodName, hodGenre, hodFunctionFr, hodFunctionEn],
  );

  const activeAgent = useMemo(
    () => agents.find((a) => a.matricule === activeMatricule) || agents[0] || null,
    [agents, activeMatricule],
  );

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees');
      const data = (await res.json()) as Employee[];
      setEmployees(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/documents/leave-attestation');
      const json = (await res.json()) as { records?: LeaveAttestationRecord[]; error?: string };
      if (!res.ok) {
        setHistory([]);
        setError(json.error || 'Erreur de chargement');
        return;
      }
      setHistory(json.records ?? []);
      setError(null);
    } catch {
      setHistory([]);
      setError('Erreur de chargement');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
    void loadHistory();
  }, [loadEmployees, loadHistory]);

  useEffect(() => {
    setAgents((prev) => (prev.length ? refreshLeaveAgentBodies(prev, shared) : prev));
  }, [
    shared.documentDate,
    shared.hodName,
    shared.hodGenre,
    shared.hodFunctionFr,
    shared.hodFunctionEn,
  ]);

  const patchAgent = (
    matricule: string,
    patch: Partial<LeaveAgentDraft>,
    opts?: { touchBodies?: boolean },
  ) => {
    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.matricule !== matricule) return agent;
        const next = { ...agent, ...patch };
        if (!opts?.touchBodies) {
          return refreshLeaveAgentBodies([next], shared)[0]!;
        }
        return next;
      }),
    );
  };

  const handleEmployeeSelect = (employee: Employee) => {
    if (agents.length >= MAX_AGENTS) {
      void showError(`Maximum ${MAX_AGENTS} agents par génération.`);
      setEmployeeSearch('');
      return;
    }
    const agent = employeeToLeaveAgent(employee, shared);
    setAgents((prev) => {
      if (prev.some((a) => a.matricule === agent.matricule)) return prev;
      if (prev.length >= MAX_AGENTS) return prev;
      return [...prev, agent];
    });
    setActiveMatricule(agent.matricule);
    setEmployeeSearch('');
  };

  const removeAgent = (matricule: string) => {
    setAgents((prev) => {
      const next = prev.filter((a) => a.matricule !== matricule);
      if (activeMatricule === matricule) {
        setActiveMatricule(next[0]?.matricule || null);
      }
      return next;
    });
  };

  const handleHodSelect = (employee: Employee) => {
    const genre = genreFromEmployee(employee);
    const rawTitle = employee.jobTitle || employee.grade;
    setHodGenre(genre);
    setHodName(formatAttestationAgentName(employee.nom));
    setHodFunctionFr(localizeJobTitle(rawTitle, 'fr', genre));
    setHodFunctionEn(localizeJobTitle(rawTitle, 'en', genre));
  };

  const validateBeforeExport = (): string | null => {
    if (!documentDate.trim()) return 'La date du document est requise';
    if (!hodName.trim()) return 'Le responsable (signataire) est requis';
    if (!hodFunctionFr.trim()) return 'Sélectionnez le responsable dans la liste des employés';
    if (agents.length === 0) return 'Ajoutez au moins un agent';
    for (const agent of agents) {
      if (!agent.leaveStart.trim()) return `Date de début manquante pour ${agent.name}`;
      if (!agent.leaveEnd.trim()) return `Date de reprise manquante pour ${agent.name}`;
      if (agent.leaveEnd < agent.leaveStart) return `Dates invalides pour ${agent.name}`;
      if (!agent.functionFr.trim() || !agent.department.trim()) {
        return `Informations incomplètes pour ${agent.name}`;
      }
    }
    return null;
  };

  const exportAndSave = async (fileType: 'docx' | 'pdf') => {
    const validationError = validateBeforeExport();
    if (validationError) {
      await showError(validationError);
      return;
    }

    setExporting(fileType);
    try {
      let okCount = 0;
      for (const agent of agents) {
        const payload = leaveAgentToBilingualFormData(shared, agent);
        const res = await fetch('/api/documents/leave-attestation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const record = (await res.json()) as LeaveAttestationRecord & { error?: string };
        if (!res.ok) {
          await showError(record.error || `Échec pour ${agent.name}`);
          setExporting(null);
          if (okCount > 0) await loadHistory();
          return;
        }
        await downloadRecord(record, fileType);
        okCount += 1;
        await sleep(300);
      }
      if (okCount > 0) {
        await showSuccess(
          `${okCount} document${okCount > 1 ? 's' : ''} généré${okCount > 1 ? 's' : ''} (FR + EN, 2 pages).`,
        );
        await loadHistory();
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(null);
    }
  };

  const handleDelete = async (record: LeaveAttestationRecord) => {
    const confirmed = await confirmDelete(
      'Supprimer cette attestation ?',
      `${record.employeeName} — ${formatDate(record.leaveStart)} → ${formatDate(record.leaveEnd)}`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/documents/leave-attestation?id=${encodeURIComponent(record.id)}`,
        { method: 'DELETE' },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showError(json.error || 'Suppression impossible');
        return;
      }
      await loadHistory();
    } catch {
      await showError('Suppression impossible');
    }
  };

  const signatoryEmployees = useMemo(
    () => filterAttestationSignatories(employees),
    [employees],
  );

  const employeesForPicker = useMemo(
    () => employees.filter((e) => !agents.some((a) => a.matricule === e.matricule.trim())),
    [employees, agents],
  );

  const docCount = agents.length;
  const exportCountLabel = docCount > 0 ? ` (${docCount})` : '';
  const canAddAgent = agents.length < MAX_AGENTS;

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'documents.attestation-conge', action: 'view' },
        { menuId: 'documents.attestation-conge', action: 'create' },
      ]}
    >
      <div className="service-attestation-page">
        <div className="service-attestation-sticky">
          <div className="page-header page-header-with-tabs service-attestation-header">
            <div>
              <div className="page-header-title-row">
                <h2>Attestation de congé</h2>
                <RefreshButton
                  onClick={() => {
                    void loadEmployees();
                    void loadHistory();
                  }}
                  loading={loading || historyLoading}
                />
              </div>
              <p>Un document par agent — page 1 FR, page 2 EN — textes éditables.</p>
            </div>
            <div className="check-docs-header-actions">
              {pageTab === 'form' && canCreate && canExport && (
                <div className="service-attestation-export-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!!exporting}
                    onClick={() => void exportAndSave('docx')}
                  >
                    {exporting === 'docx' ? 'Génération…' : `Générer Word${exportCountLabel}`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!!exporting}
                    onClick={() => void exportAndSave('pdf')}
                  >
                    {exporting === 'pdf' ? 'Génération…' : `Générer PDF${exportCountLabel}`}
                  </button>
                </div>
              )}
              <Link href="/documents" className="btn btn-ghost btn-sm">
                Documents
              </Link>
              <div className="tabs header-tabs header-tabs-compact">
                {canCreate && (
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${pageTab === 'form' ? ' active' : ''}`}
                    onClick={() => setPageTab('form')}
                  >
                    Formulaire
                  </button>
                )}
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm tab-btn-dashboard${pageTab === 'history' ? ' active' : ''}`}
                  onClick={() => setPageTab('history')}
                >
                  Documents émis
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {pageTab === 'form' && canCreate && (
          <div className="service-attestation-split">
            <div className="panel panel-padded service-attestation-form service-attestation-split-left">
              <div className="form-group">
                <label htmlFor="leave-doc-date">Date du document</label>
                <input
                  id="leave-doc-date"
                  type="date"
                  required
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                />
              </div>

              <h3 className="service-attestation-section-title">Responsable (signataire)</h3>
              <div className="form-group">
                <label htmlFor="hod-name">Nom complet</label>
                <EmployeeSuggestInput
                  id="hod-name"
                  employees={signatoryEmployees}
                  value={hodName}
                  onChange={setHodName}
                  onEmployeeSelect={handleHodSelect}
                  placeholder="HR, chef d’usine ou MD…"
                  required
                />
                <span className="field-hint">
                  Signataires autorisés : responsables HR, chef d’usine / Plant Manager, MD.
                </span>
              </div>

              <h3 className="service-attestation-section-title">
                Employés concernés
                {agents.length > 0 ? ` (${agents.length}/${MAX_AGENTS})` : ''}
              </h3>
              <div className="form-group">
                <label htmlFor="employee-name">Ajouter un agent</label>
                <EmployeeSuggestInput
                  id="employee-name"
                  employees={employeesForPicker}
                  value={employeeSearch}
                  onChange={setEmployeeSearch}
                  onEmployeeSelect={handleEmployeeSelect}
                  placeholder={
                    canAddAgent
                      ? 'Rechercher et ajouter un agent…'
                      : `Maximum ${MAX_AGENTS} agents atteint`
                  }
                />
                <span className="field-hint">
                  Jusqu’à {MAX_AGENTS} agents. Export Word / PDF = FR + EN pour chaque agent.
                </span>
              </div>

              {agents.length > 0 && (
                <>
                  <div className="tabs service-attestation-agent-tabs" role="tablist">
                    {agents.map((agent) => {
                      const active = agent.matricule === (activeAgent?.matricule || '');
                      return (
                        <button
                          key={agent.matricule}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`tab-btn tab-btn-sm${active ? ' active' : ''}`}
                          onClick={() => setActiveMatricule(agent.matricule)}
                        >
                          {agent.name}
                        </button>
                      );
                    })}
                  </div>

                  {activeAgent && (
                    <div className="service-attestation-agent-panel service-attestation-agent-panel-inset">
                      <div className="service-attestation-agent-panel-head">
                        <strong>{activeAgent.name}</strong>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger-text"
                          onClick={() => removeAgent(activeAgent.matricule)}
                        >
                          Retirer
                        </button>
                      </div>

                      <div className="service-attestation-employee-meta">
                        <span className="service-attestation-meta-chip">
                          <strong>Genre</strong>
                          <span>{activeAgent.genreFr}</span>
                        </span>
                        <span className="service-attestation-meta-chip">
                          <strong>Matricule</strong>
                          <span>{activeAgent.matricule}</span>
                        </span>
                        <span className="service-attestation-meta-chip">
                          <strong>Fonction</strong>
                          <span>{activeAgent.functionFr}</span>
                        </span>
                        <span className="service-attestation-meta-chip">
                          <strong>Département</strong>
                          <span>{activeAgent.department || '—'}</span>
                        </span>
                      </div>

                      <h4 className="service-attestation-subsection-title">Période de congé</h4>
                      <div className="form-grid form-grid-2">
                        <div className="form-group">
                          <label htmlFor={`leave-start-${activeAgent.matricule}`}>
                            Date de début
                          </label>
                          <input
                            id={`leave-start-${activeAgent.matricule}`}
                            type="date"
                            required
                            value={activeAgent.leaveStart}
                            onChange={(e) =>
                              patchAgent(activeAgent.matricule, { leaveStart: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor={`leave-end-${activeAgent.matricule}`}>
                            Date de reprise
                          </label>
                          <input
                            id={`leave-end-${activeAgent.matricule}`}
                            type="date"
                            required
                            value={activeAgent.leaveEnd}
                            onChange={(e) =>
                              patchAgent(activeAgent.matricule, { leaveEnd: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {agents.length === 0 && (
                <p className="service-attestation-meta-hint">
                  Ajoutez jusqu’à {MAX_AGENTS} agents — sélectionnez un onglet à gauche pour éditer
                  ses textes à droite.
                </p>
              )}
            </div>

            <div className="panel panel-padded service-attestation-split-right">
              <h3 className="service-attestation-section-title">Textes du document</h3>
              {activeAgent ? (
                <>
                  <p className="service-attestation-meta-hint" style={{ marginTop: 0 }}>
                    Textes pour <strong>{activeAgent.name}</strong> — modèles FR / EN officiels.
                  </p>
                  <div className="form-group">
                    <label htmlFor={`body-fr-${activeAgent.matricule}`}>Texte français</label>
                    <textarea
                      id={`body-fr-${activeAgent.matricule}`}
                      className="service-attestation-body-textarea"
                      rows={8}
                      value={activeAgent.bodyFr}
                      onChange={(e) =>
                        patchAgent(
                          activeAgent.matricule,
                          { bodyFr: e.target.value, bodyFrTouched: true },
                          { touchBodies: true },
                        )
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`body-en-${activeAgent.matricule}`}>English text</label>
                    <textarea
                      id={`body-en-${activeAgent.matricule}`}
                      className="service-attestation-body-textarea"
                      rows={8}
                      value={activeAgent.bodyEn}
                      onChange={(e) =>
                        patchAgent(
                          activeAgent.matricule,
                          { bodyEn: e.target.value, bodyEnTouched: true },
                          { touchBodies: true },
                        )
                      }
                    />
                  </div>
                </>
              ) : (
                <p className="service-attestation-meta-hint">
                  Sélectionnez ou ajoutez un agent pour afficher et éditer les textes FR / EN.
                </p>
              )}
            </div>
          </div>
        )}

        {pageTab === 'history' && (
          <div className="panel">
            {history.length === 0 ? (
              <p className="empty-state">Aucune attestation enregistrée.</p>
            ) : (
              <div className="table-wrap">
                <table className="service-attestation-history-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Langue</th>
                      <th>Employé</th>
                      <th>Matricule</th>
                      <th>Début</th>
                      <th>Reprise</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.documentDate)}</td>
                        <td>
                          {record.language === 'both'
                            ? 'FR+EN'
                            : record.language === 'en'
                              ? 'EN'
                              : 'FR'}
                        </td>
                        <td>{formatAttestationAgentName(record.employeeName)}</td>
                        <td>{record.employeeMatricule}</td>
                        <td>{formatDate(record.leaveStart)}</td>
                        <td>{formatDate(record.leaveEnd)}</td>
                        <td>
                          <div className="service-attestation-row-actions">
                            {canCreate && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  const name = formatAttestationAgentName(record.employeeName);
                                  const agent: LeaveAgentDraft = {
                                    matricule: record.employeeMatricule,
                                    name,
                                    department: record.employeeDepartment,
                                    leaveStart: record.leaveStart,
                                    leaveEnd: record.leaveEnd,
                                    genreFr:
                                      record.language === 'en'
                                        ? (/ms|mrs/i.test(record.employeeGenre)
                                          ? 'Madame'
                                          : 'Monsieur')
                                        : record.employeeGenre,
                                    genreEn:
                                      record.language === 'en'
                                        ? record.employeeGenre
                                        : record.employeeGenreEn ||
                                          (/madame|mme/i.test(record.employeeGenre)
                                            ? 'Ms.'
                                            : 'Mr.'),
                                    functionFr:
                                      record.language === 'en'
                                        ? record.employeeFunctionEn || record.employeeFunction
                                        : record.employeeFunction,
                                    functionEn:
                                      record.employeeFunctionEn ||
                                      (record.language === 'en'
                                        ? record.employeeFunction
                                        : record.employeeFunction),
                                    bodyFr:
                                      record.language === 'en'
                                        ? ''
                                        : record.bodyText || '',
                                    bodyEn:
                                      record.language === 'both'
                                        ? record.bodyTextEn || ''
                                        : record.language === 'en'
                                          ? record.bodyText || ''
                                          : record.bodyTextEn || '',
                                    bodyFrTouched:
                                      (record.language === 'fr' || record.language === 'both') &&
                                      !!record.bodyText,
                                    bodyEnTouched:
                                      (record.language === 'en' || record.language === 'both') &&
                                      !!(record.bodyTextEn || (record.language === 'en' && record.bodyText)),
                                  };
                                  setDocumentDate(record.documentDate);
                                  setHodGenre(record.hodGenre);
                                  setHodName(formatAttestationAgentName(record.hodName));
                                  setHodFunctionFr(
                                    localizeJobTitle(record.hodFunction, 'fr', record.hodGenre),
                                  );
                                  setHodFunctionEn(
                                    localizeJobTitle(
                                      record.hodFunctionEn || record.hodFunction,
                                      'en',
                                      record.hodGenre,
                                    ),
                                  );
                                  setAgents(
                                    refreshLeaveAgentBodies([agent], {
                                      documentDate: record.documentDate,
                                      hodName: record.hodName,
                                      hodGenre: record.hodGenre,
                                      hodFunctionFr: localizeJobTitle(
                                        record.hodFunction,
                                        'fr',
                                        record.hodGenre,
                                      ),
                                      hodFunctionEn: localizeJobTitle(
                                        record.hodFunctionEn || record.hodFunction,
                                        'en',
                                        record.hodGenre,
                                      ),
                                    }),
                                  );
                                  setActiveMatricule(agent.matricule);
                                  setEmployeeSearch('');
                                  setPageTab('form');
                                }}
                              >
                                Réutiliser
                              </button>
                            )}
                            {canExport && (
                              <a
                                href={downloadUrl(record.id, 'docx')}
                                className="btn btn-ghost btn-sm"
                                download
                              >
                                Word
                              </a>
                            )}
                            {canExport && (
                              <a
                                href={downloadUrl(record.id, 'pdf')}
                                className="btn btn-ghost btn-sm"
                                download
                              >
                                PDF
                              </a>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm btn-danger-text"
                                onClick={() => void handleDelete(record)}
                              >
                                Supprimer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </PermissionGate>
  );
}
