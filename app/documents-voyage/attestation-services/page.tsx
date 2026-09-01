'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import { localizeJobTitle } from '@/lib/job-title-i18n';
import type { ServiceAttestationFormData, ServiceAttestationRecord } from '@/lib/service-attestation-types';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError } from '@/lib/swal';

type PageTab = 'form' | 'history';

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

function validateFormForExport(form: ServiceAttestationFormData): string | null {
  if (!form.documentDate?.trim()) return 'La date du document est requise';
  if (!form.hodName?.trim()) return 'Le responsable (signataire) est requis';
  if (!form.hodFunction?.trim()) return 'Sélectionnez le responsable dans la liste des employés';
  if (!form.employeeName?.trim()) return "L'employé concerné est requis";
  if (!form.employeeMatricule?.trim()) return "Sélectionnez l'employé dans la liste";
  if (!form.employeeFunction?.trim() || !form.employeeDepartment?.trim()) {
    return "Les informations employé sont incomplètes — choisissez une ligne dans la liste";
  }
  return null;
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
  const [form, setForm] = useState<ServiceAttestationFormData>(createInitialForm);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedHod, setSelectedHod] = useState<Employee | null>(null);
  const [history, setHistory] = useState<ServiceAttestationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);

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
    setForm((prev) => {
      const mapGenre = (genre: string): string => {
        if (language === 'en') {
          if (/madame|mme|mrs/i.test(genre)) return 'Mrs.';
          if (/mademoiselle|mlle|ms/i.test(genre)) return 'Ms.';
          return 'Mr.';
        }
        if (/mrs|madame|mme/i.test(genre)) return 'Madame';
        if (/ms|miss|mademoiselle|mlle/i.test(genre)) return 'Mademoiselle';
        return 'Monsieur';
      };

      let hodGenre = mapGenre(prev.hodGenre);
      let employeeGenre = mapGenre(prev.employeeGenre);
      let hodFunction = prev.hodFunction;
      let employeeFunction = prev.employeeFunction;

      if (selectedHod) {
        hodGenre = genreFromEmployee(selectedHod, language);
        hodFunction = localizeJobTitle(
          selectedHod.jobTitle || selectedHod.grade,
          language,
          hodGenre,
        );
      }
      if (selectedEmployee) {
        employeeGenre = genreFromEmployee(selectedEmployee, language);
        employeeFunction = localizeJobTitle(
          selectedEmployee.jobTitle || selectedEmployee.grade,
          language,
          employeeGenre,
        );
      }

      return {
        ...prev,
        language,
        hodGenre,
        employeeGenre,
        hodFunction,
        employeeFunction,
      };
    });
  };

  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
    const employeeGenre = genreFromEmployee(employee, form.language);
    patchForm({
      employeeName: employee.nom,
      employeeMatricule: employee.matricule,
      employeeDepartment: employee.departement,
      employeeGenre,
      dateEmbauche: toDateInputValue(employee.appointmentDate || ''),
      employeeFunction: localizeJobTitle(
        employee.jobTitle || employee.grade,
        form.language,
        employeeGenre,
      ),
    });
  };

  const handleHodSelect = (employee: Employee) => {
    setSelectedHod(employee);
    const hodGenre = genreFromEmployee(employee, form.language);
    patchForm({
      hodName: employee.nom,
      hodGenre,
      hodFunction: localizeJobTitle(
        employee.jobTitle || employee.grade,
        form.language,
        hodGenre,
      ),
    });
  };

  const exportAndSave = async (fileType: 'docx' | 'pdf') => {
    const validationError = validateFormForExport(form);
    if (validationError) {
      await showError(validationError);
      return;
    }

    setExporting(fileType);
    try {
      const res = await fetch('/api/travel/service-attestation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const record = (await res.json()) as ServiceAttestationRecord & { error?: string };
      if (!res.ok) {
        await showError(record.error || 'Enregistrement impossible');
        return;
      }

      const dlRes = await fetch(downloadUrl(record.id, fileType));
      if (!dlRes.ok) {
        const json = (await dlRes.json().catch(() => ({}))) as { error?: string };
        await showError(json.error || 'Export impossible');
        return;
      }

      const blob = await dlRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const contentDisposition = dlRes.headers.get('content-disposition') || '';
      const match = contentDisposition.match(/filename="?([^"]+)"?/i);
      const fileName =
        match?.[1] ||
        (fileType === 'pdf'
          ? record.fileName.replace(/\.docx$/i, '.pdf')
          : record.fileName);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(objectUrl);

      await loadHistory();
    } catch {
      await showError('Export impossible');
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

        if (requestId === previewRequestIdRef.current) {
          setPreviewPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return objectUrl;
          });
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (requestId === previewRequestIdRef.current) {
          setPreviewPdfError(err instanceof Error ? err.message : 'Prévisualisation impossible');
          setPreviewPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      } finally {
        if (requestId === previewRequestIdRef.current) setPreviewPdfLoading(false);
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [form, pageTab]);

  const historyCountLabel = useMemo(
    () => `${history.length} attestation${history.length > 1 ? 's' : ''}`,
    [history.length],
  );

  const employeeMeta =
    form.employeeMatricule.trim() || selectedEmployee
      ? [
          { label: form.language === 'en' ? 'Gender' : 'Genre', value: form.employeeGenre },
          { label: form.language === 'en' ? 'Job title' : 'Fonction', value: form.employeeFunction },
          { label: 'Matricule', value: form.employeeMatricule },
          {
            label: form.language === 'en' ? 'Start date' : "Date d'embauche",
            value: form.dateEmbauche ? formatDate(form.dateEmbauche) : '—',
          },
          {
            label: form.language === 'en' ? 'Department' : 'Département',
            value: form.employeeDepartment,
          },
        ]
      : [];

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
              <p>{historyCountLabel}</p>
            </div>
            <div className="travel-history-header-actions">
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
          <div className="service-attestation-layout has-preview">
            <div className="panel panel-padded service-attestation-form">
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
                <label htmlFor="hod-name">Nom complet</label>
                <EmployeeSuggestInput
                  id="hod-name"
                  employees={employees}
                  value={form.hodName}
                  onChange={(value) => {
                    patchForm({ hodName: value });
                    setSelectedHod(null);
                  }}
                  onEmployeeSelect={handleHodSelect}
                  placeholder="Rechercher ou saisir le nom du responsable…"
                  required
                />
              </div>

              <h3 className="service-attestation-section-title">Employé concerné</h3>
              <div className="form-group">
                <label htmlFor="employee-name">Nom complet</label>
                <EmployeeSuggestInput
                  id="employee-name"
                  employees={employees}
                  value={form.employeeName}
                  onChange={(value) => {
                    patchForm({ employeeName: value });
                    setSelectedEmployee(null);
                  }}
                  onEmployeeSelect={handleEmployeeSelect}
                  placeholder="Rechercher ou saisir le nom de l'employé…"
                  required
                />
              </div>

              {employeeMeta.length > 0 ? (
                <div className="service-attestation-employee-meta">
                  {employeeMeta.map((item) => (
                    <span key={item.label} className="service-attestation-meta-chip">
                      <strong>{item.label}</strong>
                      <span>{item.value || '—'}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="service-attestation-meta-hint">
                  Sélectionnez un employé dans la liste pour afficher genre, fonction, matricule, date
                  d&apos;embauche et département.
                </p>
              )}
            </div>

            <div className="panel panel-padded service-attestation-preview-panel">
              <div className="service-attestation-preview-toolbar">
                <h3>Aperçu du document</h3>
                {canExport && (
                  <div className="service-attestation-export-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!!exporting}
                      onClick={() => void exportAndSave('docx')}
                    >
                      {exporting === 'docx' ? 'Enregistrement…' : 'Exporter Word'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!!exporting}
                      onClick={() => void exportAndSave('pdf')}
                    >
                      {exporting === 'pdf' ? 'Enregistrement…' : 'Exporter PDF'}
                    </button>
                  </div>
                )}
              </div>

              <div className="service-attestation-preview-body service-attestation-preview-body-pdf">
                {previewPdfLoading && (
                  <div className="empty-state">Génération de l&apos;aperçu…</div>
                )}
                {!!previewPdfError && !previewPdfLoading && (
                  <div className="alert alert-danger" style={{ margin: 0 }}>
                    {previewPdfError}
                  </div>
                )}
                {!previewPdfLoading && !previewPdfError && !previewPdfUrl && (
                  <div className="empty-state">
                    Renseignez le responsable et l&apos;employé pour afficher l&apos;aperçu.
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
                            {canCreate && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setForm({
                                    ...createInitialForm(),
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
                                  });
                                  setSelectedEmployee(null);
                                  setSelectedHod(null);
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
