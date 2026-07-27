'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { localizeJobTitle } from '@/lib/job-title-i18n';
import type { ServiceAttestationFormData, ServiceAttestationRecord } from '@/lib/service-attestation-types';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError } from '@/lib/swal';

type PageTab = 'form' | 'history';

const GENRE_OPTIONS_FR = ['Monsieur', 'Madame', 'Mademoiselle'];
const GENRE_OPTIONS_EN = ['Mr.', 'Mrs.', 'Ms.'];

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createInitialForm(): ServiceAttestationFormData {
  return {
    language: 'fr',
    documentDate: todayInputDate(),
    hodGenre: 'Monsieur',
    hodName: '',
    hodFunction: '',
    employeeGenre: 'Monsieur',
    employeeName: '',
    employeeMatricule: '',
    dateEmbauche: '',
    employeeFunction: '',
    employeeDepartment: '',
  };
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR');
}

/** Affichage jj/mm/aaaa (ou ISO) → valeur input[type=date] aaaa-mm-jj. */
function toDateInputValue(display: string): string {
  const raw = display.trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
}

function genreFromEmployee(employee: Employee, language: 'fr' | 'en'): string {
  if (/^f/i.test(employee.gender)) return language === 'en' ? 'Mrs.' : 'Madame';
  if (/^m/i.test(employee.gender)) return language === 'en' ? 'Mr.' : 'Monsieur';
  return language === 'en' ? 'Mr.' : 'Monsieur';
}

function downloadUrl(id: string, type: 'docx' | 'pdf'): string {
  const params = type === 'pdf' ? '?type=pdf' : '';
  return `/api/travel/service-attestation/${encodeURIComponent(id)}/download${params}`;
}

export default function AttestationServicesPage() {
  const [pageTab, setPageTab] = useState<PageTab>('form');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ServiceAttestationFormData>(createInitialForm);
  const [history, setHistory] = useState<ServiceAttestationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);

  const genreOptions = form.language === 'en' ? GENRE_OPTIONS_EN : GENRE_OPTIONS_FR;

  const patchForm = (patch: Partial<ServiceAttestationFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

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

  const handleLanguageChange = (language: 'fr' | 'en') => {
    setForm((prev) => ({
      ...prev,
      language,
      hodGenre: language === 'en' ? 'Mr.' : 'Monsieur',
      employeeGenre: language === 'en' ? 'Mr.' : 'Monsieur',
      employeeFunction: prev.employeeFunction
        ? localizeJobTitle(prev.employeeFunction, language)
        : '',
      hodFunction: prev.hodFunction ? localizeJobTitle(prev.hodFunction, language) : '',
    }));
  };

  const handleEmployeeSelect = (employee: Employee) => {
    patchForm({
      employeeName: employee.nom,
      employeeMatricule: employee.matricule,
      employeeDepartment: employee.departement,
      employeeFunction: localizeJobTitle(employee.jobTitle || employee.grade, form.language),
      dateEmbauche: toDateInputValue(employee.appointmentDate || ''),
      employeeGenre: genreFromEmployee(employee, form.language),
    });
  };

  const handleHodSelect = (employee: Employee) => {
    patchForm({
      hodName: employee.nom,
      hodFunction: localizeJobTitle(employee.jobTitle || employee.grade, form.language),
      hodGenre: genreFromEmployee(employee, form.language),
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/travel/service-attestation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as ServiceAttestationRecord & { error?: string };
      if (!res.ok) {
        await showError(json.error || 'Génération impossible');
        return;
      }
      await loadHistory();
    } catch {
      await showError('Génération impossible');
    } finally {
      setSubmitting(false);
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

  const downloadPreviewFile = useCallback(
    async (fileType: 'docx' | 'pdf') => {
      const res = await fetch(
        `/api/travel/service-attestation/preview?type=${fileType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        await showError(json.error || 'Export impossible');
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const contentDisposition = res.headers.get('content-disposition') || '';
      const match = contentDisposition.match(/filename="?([^"]+)"?/i);
      const fileName = match?.[1] || `attestation.${fileType}`;

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(objectUrl);
    },
    [form],
  );

  useEffect(() => {
    if (pageTab !== 'form') return;

    const readyForPreview = Boolean(form.hodName.trim() || form.employeeName.trim());
    if (!readyForPreview) {
      setPreviewPdfLoading(false);
      setPreviewPdfError(null);
      setPreviewPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    setPreviewPdfLoading(true);
    setPreviewPdfError(null);

    const requestId = ++previewRequestIdRef.current;
    const controller = new AbortController();

    const t = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/travel/service-attestation/preview?type=pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
          signal: controller.signal,
        });

        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error || 'Prévisualisation impossible');
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);

        setPreviewPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setPreviewPdfError(err instanceof Error ? err.message : 'Prévisualisation impossible');
        setPreviewPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } finally {
        if (requestId === previewRequestIdRef.current) setPreviewPdfLoading(false);
      }
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [form, pageTab]);

  const historyCountLabel = useMemo(
    () => `${history.length} attestation${history.length > 1 ? 's' : ''}`,
    [history.length],
  );

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'travel.attestation', action: 'view' },
        { menuId: 'travel.historique', action: 'view' },
        { menuId: 'travel.etablir', action: 'view' },
      ]}
    >
      <div className="service-attestation-page">
        <div className="service-attestation-sticky">
          <div className="page-header page-header-with-tabs service-attestation-header">
            <div>
              <div className="page-header-title-row">
                <h2>Attestation de service</h2>
                <RefreshButton onClick={() => void loadHistory()} loading={historyLoading} />
              </div>
              <p>{historyCountLabel}</p>
            </div>
            <div className="tabs header-tabs header-tabs-dashboard header-tabs-compact">
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-dashboard${pageTab === 'form' ? ' active' : ''}`}
                onClick={() => setPageTab('form')}
              >
                Formulaire
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-dashboard${pageTab === 'history' ? ' active' : ''}`}
                onClick={() => setPageTab('history')}
              >
                Historique
              </button>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {pageTab === 'form' && (
          <div className="service-attestation-layout has-preview">
            <form className="panel panel-padded service-attestation-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="attestation-language">Langue du document</label>
                <select
                  id="attestation-language"
                  value={form.language}
                  onChange={(e) => handleLanguageChange(e.target.value === 'en' ? 'en' : 'fr')}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="attestation-date">Date du document</label>
                <input
                  id="attestation-date"
                  type="date"
                  required
                  value={form.documentDate}
                  onChange={(e) => patchForm({ documentDate: e.target.value })}
                />
              </div>

              <h3 className="service-attestation-section-title">Responsable (signataire)</h3>

              <div className="form-group">
                <label htmlFor="hod-genre">Genre</label>
                <select
                  id="hod-genre"
                  value={form.hodGenre}
                  onChange={(e) => patchForm({ hodGenre: e.target.value })}
                >
                  {genreOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="hod-name">Nom complet</label>
                <EmployeeSuggestInput
                  id="hod-name"
                  employees={employees}
                  value={form.hodName}
                  onChange={(value) => patchForm({ hodName: value })}
                  onEmployeeSelect={handleHodSelect}
                  placeholder="Rechercher ou saisir le nom du responsable…"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="hod-function">Fonction</label>
                <input
                  id="hod-function"
                  required
                  value={form.hodFunction}
                  onChange={(e) => patchForm({ hodFunction: e.target.value })}
                />
              </div>

              <h3 className="service-attestation-section-title">Employé concerné</h3>

              <div className="form-group">
                <label htmlFor="employee-genre">Genre</label>
                <select
                  id="employee-genre"
                  value={form.employeeGenre}
                  onChange={(e) => patchForm({ employeeGenre: e.target.value })}
                >
                  {genreOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="employee-name">Nom complet</label>
                <EmployeeSuggestInput
                  id="employee-name"
                  employees={employees}
                  value={form.employeeName}
                  onChange={(value) => patchForm({ employeeName: value })}
                  onEmployeeSelect={handleEmployeeSelect}
                  placeholder="Rechercher ou saisir le nom de l'employé…"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="employee-matricule">Matricule</label>
                <input
                  id="employee-matricule"
                  required
                  value={form.employeeMatricule}
                  onChange={(e) => patchForm({ employeeMatricule: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="employee-embauche">
                  {form.language === 'en' ? 'Employment start date' : "Date d'embauche"}
                </label>
                <input
                  id="employee-embauche"
                  type="date"
                  value={form.dateEmbauche}
                  onChange={(e) => patchForm({ dateEmbauche: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="employee-function">Fonction</label>
                <input
                  id="employee-function"
                  required
                  value={form.employeeFunction}
                  onChange={(e) => patchForm({ employeeFunction: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="employee-department">Département</label>
                <input
                  id="employee-department"
                  required
                  value={form.employeeDepartment}
                  onChange={(e) => patchForm({ employeeDepartment: e.target.value })}
                />
              </div>

              <div className="service-attestation-form-actions">
                <button type="submit" className="btn btn-accent" disabled={submitting}>
                  {submitting ? 'Génération…' : 'Valider et prévisualiser'}
                </button>
              </div>
            </form>

            <div className="panel panel-padded service-attestation-preview-panel">
              <div className="service-attestation-preview-toolbar">
                <h3>Aperçu du document</h3>
                <div className="service-attestation-export-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void downloadPreviewFile('docx')}
                  >
                    Exporter Word
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void downloadPreviewFile('pdf')}
                  >
                    Exporter PDF
                  </button>
                </div>
              </div>

              <div className="service-attestation-preview-body service-attestation-preview-body-pdf">
                {previewPdfLoading && (
                  <div className="empty-state">Génération de l'aperçu…</div>
                )}
                {!!previewPdfError && !previewPdfLoading && (
                  <div className="alert alert-danger" style={{ margin: 0 }}>
                    {previewPdfError}
                  </div>
                )}
                {!!previewPdfUrl && !previewPdfLoading && (
                  <iframe
                    title="Aperçu attestation de service"
                    className="service-attestation-preview-iframe"
                    src={previewPdfUrl}
                  />
                )}
              </div>
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
                        <td>{record.employeeName}</td>
                        <td>{record.employeeMatricule}</td>
                        <td>{record.employeeDepartment}</td>
                        <td>{record.language === 'en' ? 'EN' : 'FR'}</td>
                        <td>
                          <div className="service-attestation-row-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  language: record.language,
                                  documentDate: record.documentDate,
                                  hodGenre: record.hodGenre,
                                  hodName: record.hodName,
                                  hodFunction: record.hodFunction,
                                  employeeGenre: record.employeeGenre,
                                  employeeName: record.employeeName,
                                  employeeMatricule: record.employeeMatricule,
                                  dateEmbauche: record.dateEmbauche ?? '',
                                  employeeFunction: record.employeeFunction,
                                  employeeDepartment: record.employeeDepartment,
                                }));
                                setPageTab('form');
                              }}
                            >
                              Voir
                            </button>
                            <a
                              href={downloadUrl(record.id, 'docx')}
                              className="btn btn-ghost btn-sm"
                              download
                            >
                              Word
                            </a>
                            {record.pdfPath && (
                              <a
                                href={downloadUrl(record.id, 'pdf')}
                                className="btn btn-ghost btn-sm"
                                download
                              >
                                PDF
                              </a>
                            )}
                            <PermissionGate
                              anyOf={[
                                { menuId: 'travel.attestation', action: 'delete' },
                                { menuId: 'travel.historique', action: 'delete' },
                              ]}
                            >
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm btn-danger-text"
                                onClick={() => void handleDelete(record)}
                              >
                                Supprimer
                              </button>
                            </PermissionGate>
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
