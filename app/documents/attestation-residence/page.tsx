'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import { localizeJobTitle } from '@/lib/job-title-i18n';
import {
  buildVillageResidenceAddress,
  formatResidenceEmployeeGenre,
  RESIDENCE_VILLAGE_ADDRESS_BASE,
} from '@/lib/residence-attestation-text';
import type { ResidenceAttestationFormData, ResidenceAttestationRecord } from '@/lib/residence-attestation-types';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError } from '@/lib/swal';

type PageTab = 'form' | 'history';

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createInitialForm(): ResidenceAttestationFormData {
  return {
    documentDate: todayInputDate(),
    maisonNumero: '',
    residenceAddress: '',
    hodGenre: 'Monsieur',
    hodName: '',
    hodFunction: '',
    employeeGenre: 'M.',
    employeeName: '',
    employeeMatricule: '',
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

function genreFromEmployee(employee: Employee): string {
  if (/^f/i.test(employee.gender)) return 'Madame';
  if (/^m/i.test(employee.gender)) return 'Monsieur';
  return 'Monsieur';
}

function downloadUrl(id: string, type: 'docx' | 'pdf'): string {
  const params = type === 'pdf' ? '?type=pdf' : '';
  return `/api/documents/residence-attestation/${encodeURIComponent(id)}/download${params}`;
}

function validateFormForExport(form: ResidenceAttestationFormData): string | null {
  if (!form.documentDate?.trim()) return 'La date du document est requise';
  if (!form.residenceAddress?.trim()) return "L'adresse de résidence est requise";
  if (!form.hodName?.trim()) return 'Le responsable (signataire) est requis';
  if (!form.hodFunction?.trim()) return 'Sélectionnez le responsable dans la liste des employés';
  if (!form.employeeName?.trim()) return "L'employé concerné est requis";
  if (!form.employeeMatricule?.trim()) return "Sélectionnez l'employé dans la liste";
  if (!form.employeeFunction?.trim() || !form.employeeDepartment?.trim()) {
    return "Les informations employé sont incomplètes — choisissez une ligne dans la liste";
  }
  return null;
}

export default function AttestationResidencePage() {
  const { can } = usePermissions();
  const canCreate = can('documents.attestation-residence', 'create');
  const canExport = can('documents.attestation-residence', 'export');
  const canDelete = can('documents.attestation-residence', 'delete');
  const [pageTab, setPageTab] = useState<PageTab>(() =>
    can('documents.attestation-residence', 'create') ? 'form' : 'history',
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [villaByMatricule, setVillaByMatricule] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [form, setForm] = useState<ResidenceAttestationFormData>(createInitialForm);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedHod, setSelectedHod] = useState<Employee | null>(null);
  const [history, setHistory] = useState<ResidenceAttestationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressAutoVillage, setAddressAutoVillage] = useState(false);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);

  const patchForm = (patch: Partial<ResidenceAttestationFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, villaRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/documents/residence-attestation/villa-lookup'),
      ]);
      const data = (await empRes.json()) as Employee[];
      setEmployees(Array.isArray(data) ? data : []);
      if (villaRes.ok) {
        const villaJson = (await villaRes.json()) as { byMatricule?: Record<string, string> };
        setVillaByMatricule(villaJson.byMatricule ?? {});
      } else {
        setVillaByMatricule({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/documents/residence-attestation');
      const json = (await res.json()) as { records?: ResidenceAttestationRecord[]; error?: string };
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

  const applyMaisonToAddress = (maisonNumero: string) => {
    const trimmed = maisonNumero.trim();
    setAddressAutoVillage(Boolean(trimmed));
    patchForm({
      maisonNumero: trimmed,
      residenceAddress: trimmed ? buildVillageResidenceAddress(trimmed) : '',
    });
  };

  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
    const employeeGenreLabel = genreFromEmployee(employee);
    const maisonNumero = villaByMatricule[employee.matricule]?.trim() || '';
    const hasVillage = Boolean(maisonNumero);
    setAddressAutoVillage(hasVillage);
    setForm((prev) => ({
      ...prev,
      employeeName: employee.nom,
      employeeMatricule: employee.matricule,
      employeeDepartment: employee.departement,
      employeeGenre: formatResidenceEmployeeGenre(employee.gender),
      employeeFunction: localizeJobTitle(
        employee.jobTitle || employee.grade,
        'fr',
        employeeGenreLabel,
      ),
      maisonNumero: hasVillage ? maisonNumero : '',
      residenceAddress: hasVillage
        ? buildVillageResidenceAddress(maisonNumero)
        : prev.residenceAddress && !prev.residenceAddress.includes('Village Malanga')
          ? prev.residenceAddress
          : '',
    }));
  };

  const handleHodSelect = (employee: Employee) => {
    setSelectedHod(employee);
    const hodGenre = genreFromEmployee(employee);
    patchForm({
      hodName: employee.nom,
      hodGenre,
      hodFunction: localizeJobTitle(employee.jobTitle || employee.grade, 'fr', hodGenre),
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
      const res = await fetch('/api/documents/residence-attestation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const record = (await res.json()) as ResidenceAttestationRecord & { error?: string };
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
        match?.[1]
        || (fileType === 'pdf' ? record.fileName.replace(/\.docx$/i, '.pdf') : record.fileName);

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

  const handleDelete = async (record: ResidenceAttestationRecord) => {
    const confirmed = await confirmDelete(
      'Supprimer cette attestation ?',
      `${record.employeeName} — ${record.maisonNumero || record.residenceAddress}`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/documents/residence-attestation?id=${encodeURIComponent(record.id)}`,
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

  useEffect(() => {
    if (pageTab !== 'form') return;

    const readyForPreview = Boolean(
      form.hodName.trim()
      || form.employeeName.trim()
      || form.residenceAddress.trim(),
    );
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
        const res = await fetch('/api/documents/residence-attestation/preview?type=pdf', {
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
        if (requestId !== previewRequestIdRef.current) return;
        const objectUrl = URL.createObjectURL(blob);
        setPreviewPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        setPreviewPdfError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (requestId !== previewRequestIdRef.current) return;
        setPreviewPdfError(err instanceof Error ? err.message : 'Prévisualisation impossible');
        setPreviewPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } finally {
        if (requestId === previewRequestIdRef.current) {
          setPreviewPdfLoading(false);
        }
      }
    }, 450);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [form, pageTab]);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    };
  }, [previewPdfUrl]);

  const employeeMeta = useMemo(() => {
    if (!selectedEmployee && !form.employeeMatricule) return [];
    const chips = [
      { label: 'Genre', value: form.employeeGenre },
      { label: 'Matricule', value: form.employeeMatricule },
      { label: 'Fonction', value: form.employeeFunction },
      { label: 'Département', value: form.employeeDepartment },
    ];
    if (form.maisonNumero) {
      chips.push({ label: 'Maison village', value: form.maisonNumero });
    }
    return chips;
  }, [selectedEmployee, form]);

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'documents.attestation-residence', action: 'view' },
        { menuId: 'documents.attestation-residence', action: 'create' },
      ]}
    >
      <div className="service-attestation-page">
        <div className="service-attestation-sticky">
          <div className="page-header page-header-with-tabs service-attestation-header">
            <div>
              <div className="page-header-title-row">
                <h2>Attestation de résidence</h2>
                <RefreshButton
                  onClick={() => {
                    void loadEmployees();
                    void loadHistory();
                  }}
                  loading={loading || historyLoading}
                />
              </div>
              <p>
                Texte officiel Camp PPC Barnet / Village Malanga — numéro de maison auto si
                l&apos;employé réside au village.
              </p>
            </div>
            <div className="check-docs-header-actions">
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
          <div className="service-attestation-layout has-preview">
            <div className="panel panel-padded service-attestation-form">
              <div className="form-group">
                <label htmlFor="residence-doc-date">Date du document</label>
                <input
                  id="residence-doc-date"
                  type="date"
                  required
                  value={form.documentDate}
                  onChange={(e) => patchForm({ documentDate: e.target.value })}
                />
              </div>

              <h3 className="service-attestation-section-title">Résidence</h3>
              <div className="form-group">
                <label htmlFor="maison-numero">Numéro de maison (village)</label>
                <input
                  id="maison-numero"
                  type="text"
                  value={form.maisonNumero}
                  onChange={(e) => applyMaisonToAddress(e.target.value)}
                  placeholder="Auto si affecté au village…"
                />
                {addressAutoVillage && (
                  <p className="service-attestation-meta-hint" style={{ marginTop: '0.35rem' }}>
                    Rempli automatiquement depuis l&apos;affectation village.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="residence-address">Adresse dans le document</label>
                <textarea
                  id="residence-address"
                  required
                  rows={3}
                  value={form.residenceAddress}
                  onChange={(e) => {
                    setAddressAutoVillage(false);
                    patchForm({ residenceAddress: e.target.value });
                  }}
                  placeholder={RESIDENCE_VILLAGE_ADDRESS_BASE}
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
                  Sélectionnez un employé dans la liste pour afficher genre, fonction, matricule et
                  maison village.
                </p>
              )}

              {canExport && (
                <div className="service-attestation-export-actions" style={{ marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!!exporting}
                    onClick={() => void exportAndSave('docx')}
                  >
                    {exporting === 'docx' ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Génération…
                      </>
                    ) : (
                      'Générer Word'
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!!exporting}
                    onClick={() => void exportAndSave('pdf')}
                  >
                    {exporting === 'pdf' ? 'Génération…' : 'Générer PDF'}
                  </button>
                </div>
              )}
            </div>

            <div className="panel panel-padded service-attestation-preview-panel">
              <div className="service-attestation-preview-toolbar">
                <h3>Aperçu du document</h3>
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
                    Renseignez le responsable, l&apos;employé et l&apos;adresse pour afficher
                    l&apos;aperçu.
                  </div>
                )}
                {!!previewPdfUrl && !previewPdfLoading && (
                  <iframe
                    title="Aperçu attestation de résidence"
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
                      <th>Document</th>
                      <th>Employé</th>
                      <th>Matricule</th>
                      <th>Maison</th>
                      <th>Adresse</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.documentDate)}</td>
                        <td>{record.employeeName}</td>
                        <td>{record.employeeMatricule}</td>
                        <td>{record.maisonNumero || '—'}</td>
                        <td>{record.residenceAddress}</td>
                        <td>
                          <div className="service-attestation-row-actions">
                            {canCreate && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setForm({
                                    ...createInitialForm(),
                                    documentDate: record.documentDate,
                                    maisonNumero: record.maisonNumero || '',
                                    residenceAddress: record.residenceAddress,
                                    hodGenre: record.hodGenre,
                                    hodName: record.hodName,
                                    hodFunction: record.hodFunction,
                                    employeeGenre: record.employeeGenre,
                                    employeeName: record.employeeName,
                                    employeeMatricule: record.employeeMatricule,
                                    employeeFunction: record.employeeFunction,
                                    employeeDepartment: record.employeeDepartment,
                                  });
                                  setAddressAutoVillage(Boolean(record.maisonNumero));
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
