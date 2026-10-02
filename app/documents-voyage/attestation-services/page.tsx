'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import { sleep } from '@/lib/attestation-agent-form';
import {
  employeeToServiceAgent,
  refreshServiceAgentBodies,
  serviceAgentToBilingualFormData,
  type ServiceAgentDraft,
  type ServiceSharedFields,
} from '@/lib/service-attestation-agent';
import { formatAttestationAgentName } from '@/lib/format-display-name';
import { localizeJobTitle } from '@/lib/job-title-i18n';
import { filterAttestationSignatories } from '@/lib/attestation-signatories';
import type { ServiceAttestationRecord } from '@/lib/service-attestation-types';
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
  return `/api/travel/service-attestation/${encodeURIComponent(id)}/download${params}`;
}

async function downloadRecord(
  record: ServiceAttestationRecord,
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

export default function AttestationServicesPage() {
  const { can } = usePermissions();
  const canCreate = can('travel.attestation', 'create');
  const canExport = can('travel.attestation', 'export');
  const canDelete = can('travel.attestation', 'delete');
  const [pageTab, setPageTab] = useState<PageTab>(() =>
    can('travel.attestation', 'create') ? 'form' : 'history',
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [documentDate, setDocumentDate] = useState(todayInputDate);
  const [hodGenre, setHodGenre] = useState('Monsieur');
  const [hodName, setHodName] = useState('');
  const [hodFunctionFr, setHodFunctionFr] = useState('');
  const [hodFunctionEn, setHodFunctionEn] = useState('');
  const [agents, setAgents] = useState<ServiceAgentDraft[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [history, setHistory] = useState<ServiceAttestationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shared: ServiceSharedFields = useMemo(
    () => ({ documentDate, hodName, hodFunctionFr, hodFunctionEn }),
    [documentDate, hodName, hodFunctionFr, hodFunctionEn],
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
      const res = await fetch('/api/travel/service-attestation');
      const json = (await res.json()) as { records?: ServiceAttestationRecord[]; error?: string };
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
    setAgents((prev) =>
      prev.length ? refreshServiceAgentBodies(prev, shared, hodGenre) : prev,
    );
  }, [shared.documentDate, shared.hodName, shared.hodFunctionFr, shared.hodFunctionEn, hodGenre]);

  const patchAgent = (
    matricule: string,
    patch: Partial<ServiceAgentDraft>,
    opts?: { touchBodies?: boolean },
  ) => {
    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.matricule !== matricule) return agent;
        const next = { ...agent, ...patch };
        if (!opts?.touchBodies) {
          return refreshServiceAgentBodies([next], shared, hodGenre)[0]!;
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
    const agent = employeeToServiceAgent(employee, shared, hodGenre);
    setAgents((prev) => {
      if (prev.some((a) => a.matricule === agent.matricule)) return prev;
      if (prev.length >= MAX_AGENTS) return prev;
      return [...prev, agent];
    });
    setEmployeeSearch('');
  };

  const removeAgent = (matricule: string) => {
    setAgents((prev) => prev.filter((a) => a.matricule !== matricule));
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
      if (!agent.dateEmbauche.trim()) return `Date d'embauche manquante pour ${agent.name}`;
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
        const payload = serviceAgentToBilingualFormData(shared, agent, hodGenre);
        const res = await fetch('/api/travel/service-attestation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const record = (await res.json()) as ServiceAttestationRecord & { error?: string };
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

  const handleDelete = async (record: ServiceAttestationRecord) => {
    const confirmed = await confirmDelete(
      'Supprimer cette attestation ?',
      `${record.employeeName} — ${formatDate(record.documentDate)}`,
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/travel/service-attestation?id=${encodeURIComponent(record.id)}`, {
        method: 'DELETE',
      });
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

  const historyCountLabel = useMemo(
    () => `${history.length} attestation${history.length > 1 ? 's' : ''}`,
    [history.length],
  );

  const signatoryEmployees = useMemo(
    () => filterAttestationSignatories(employees),
    [employees],
  );

  const employeesForPicker = useMemo(
    () => employees.filter((e) => !agents.some((a) => a.matricule === e.matricule.trim())),
    [employees, agents],
  );

  const docCount = agents.length * 2;
  const exportCountLabel = docCount > 0 ? ` (${docCount})` : '';
  const canAddAgent = agents.length < MAX_AGENTS;

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate menuId="travel.attestation" action="view">
      <div className="service-attestation-page">
        <div className="service-attestation-sticky">
          <div className="page-header page-header-with-tabs service-attestation-header">
            <div>
              <div className="page-header-title-row">
                <h2>Attestation de service</h2>
                <RefreshButton onClick={() => void loadHistory()} loading={historyLoading} />
              </div>
              <p>{historyCountLabel} — un document par agent (page 1 FR, page 2 EN)</p>
            </div>
            <div className="travel-history-header-actions">
              {pageTab === 'form' && canCreate && canExport && (
                <div className="service-attestation-export-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!!exporting}
                    onClick={() => void exportAndSave('docx')}
                  >
                    {exporting === 'docx' ? 'Enregistrement…' : `Exporter Word${exportCountLabel}`}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!!exporting}
                    onClick={() => void exportAndSave('pdf')}
                  >
                    {exporting === 'pdf' ? 'Enregistrement…' : `Exporter PDF${exportCountLabel}`}
                  </button>
                </div>
              )}
              <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
                ← Documents
              </Link>
              <div className="tabs header-tabs header-tabs-dashboard header-tabs-compact">
                {canCreate && (
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-dashboard${pageTab === 'form' ? ' active' : ''}`}
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
          <div className="panel panel-padded service-attestation-form service-attestation-form-wide">
            <div className="form-group">
              <label htmlFor="attestation-date">Date du document</label>
              <input
                id="attestation-date"
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
                Jusqu’à {MAX_AGENTS} agents — chaque bloc a ses textes FR/EN. Export = 1 fichier
                (2 pages FR + EN) par agent.
              </span>
            </div>

            {agents.length > 0 && (
              <div className="service-attestation-agent-blocks">
                {agents.map((agent, index) => (
                  <div key={agent.matricule} className="service-attestation-agent-panel">
                    <div className="service-attestation-agent-panel-head">
                      <strong>
                        Agent {index + 1} — {agent.name}
                      </strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-danger-text"
                        onClick={() => removeAgent(agent.matricule)}
                      >
                        Retirer
                      </button>
                    </div>

                    <div className="service-attestation-employee-meta">
                      <span className="service-attestation-meta-chip">
                        <strong>Genre</strong>
                        <span>{agent.genreFr}</span>
                      </span>
                      <span className="service-attestation-meta-chip">
                        <strong>Matricule</strong>
                        <span>{agent.matricule}</span>
                      </span>
                      <span className="service-attestation-meta-chip">
                        <strong>Fonction</strong>
                        <span>{agent.functionFr}</span>
                      </span>
                      <span className="service-attestation-meta-chip">
                        <strong>Embauche</strong>
                        <span>
                          {agent.dateEmbauche ? formatDate(agent.dateEmbauche) : '—'}
                        </span>
                      </span>
                      <span className="service-attestation-meta-chip">
                        <strong>Département</strong>
                        <span>{agent.department || '—'}</span>
                      </span>
                    </div>

                    <h4 className="service-attestation-subsection-title">Textes du document</h4>
                    <div className="form-group">
                      <label htmlFor={`body-fr-${agent.matricule}`}>Texte français</label>
                      <textarea
                        id={`body-fr-${agent.matricule}`}
                        className="service-attestation-body-textarea"
                        rows={4}
                        value={agent.bodyFr}
                        onChange={(e) =>
                          patchAgent(
                            agent.matricule,
                            { bodyFr: e.target.value, bodyFrTouched: true },
                            { touchBodies: true },
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`body-en-${agent.matricule}`}>English text</label>
                      <textarea
                        id={`body-en-${agent.matricule}`}
                        className="service-attestation-body-textarea"
                        rows={4}
                        value={agent.bodyEn}
                        onChange={(e) =>
                          patchAgent(
                            agent.matricule,
                            { bodyEn: e.target.value, bodyEnTouched: true },
                            { touchBodies: true },
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {agents.length === 0 && (
              <p className="service-attestation-meta-hint">
                Ajoutez jusqu’à {MAX_AGENTS} agents pour générer les attestations.
              </p>
            )}
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
                      <th>Date</th>
                      <th>Employé</th>
                      <th>Matricule</th>
                      <th>Département</th>
                      <th>Langue</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.documentDate)}</td>
                        <td>{formatAttestationAgentName(record.employeeName)}</td>
                        <td>{record.employeeMatricule}</td>
                        <td>{record.employeeDepartment}</td>
                        <td>
                          {record.language === 'both'
                            ? 'FR+EN'
                            : record.language === 'en'
                              ? 'EN'
                              : 'FR'}
                        </td>
                        <td>
                          <div className="service-attestation-row-actions">
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
