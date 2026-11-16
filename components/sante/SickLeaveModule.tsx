'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import SickLeaveDashboardView from '@/components/sante/SickLeaveDashboardView';
import SickLeaveDataView from '@/components/sante/SickLeaveDataView';
import { usePermissions } from '@/contexts/PermissionContext';
import { SANTE_MONTH_NAMES } from '@/lib/sante-utils';
import {
  attestationToInput,
  buildSickLeaveDashboard,
  emptySickLeaveAttestationInput,
  SICK_LEAVE_PROVENANCES,
} from '@/lib/sick-leave-utils';
import type {
  SickLeaveAttestation,
  SickLeaveAttestationInput,
  SickLeaveCompareRow,
  SickLeaveDashboard,
} from '@/lib/sick-leave-types';
import { emptyEmployeeHrProfile, type Employee } from '@/lib/types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

interface EmployeeLite {
  matricule: string;
  nom: string;
  departement: string;
  localisation: string;
}

interface Payload {
  rows: SickLeaveCompareRow[];
  dashboard: SickLeaveDashboard;
  attestations: SickLeaveAttestation[];
  years: number[];
  employees: EmployeeLite[];
}

interface Props {
  initialView?: 'dashboard' | 'donnees';
}

const VIEW_ANY = [
  { menuId: 'sante.conge-maladie', action: 'view' as const },
  { menuId: 'sante', action: 'view' as const },
];

export default function SickLeaveModule({ initialView = 'dashboard' }: Props) {
  const { can } = usePermissions();
  const canCreate = can('sante.conge-maladie', 'create') || can('sante', 'create');
  const canEdit = can('sante.conge-maladie', 'edit') || can('sante', 'edit') || canCreate;
  const canImport = canEdit || can('sante.conge-maladie', 'edit') || can('sante', 'edit');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [year, setYear] = useState<number | ''>('');
  const [month, setMonth] = useState<number | ''>('');
  const [bucket, setBucket] = useState<SickLeaveCompareRow['bucket'] | 'all'>('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<SickLeaveAttestationInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const [view, setView] = useState<'dashboard' | 'donnees'>(initialView);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/sante/conge-maladie');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Chargement impossible');
        return;
      }
      setPayload({
        rows: json.rows || [],
        dashboard: json.dashboard,
        attestations: json.attestations || [],
        years: json.years || [],
        employees: json.employees || [],
      });
    } catch {
      await showError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const employees = useMemo(
    () =>
      (payload?.employees || []).map((item): Employee => ({
        ...emptyEmployeeHrProfile(),
        matricule: item.matricule,
        nom: item.nom,
        departement: item.departement,
        localisation: item.localisation,
        grade: '',
        jobTitle: '',
        documents: {},
      })),
    [payload?.employees],
  );

  const filteredRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (payload?.rows || []).filter((row) => {
      if (year && row.year !== year) return false;
      if (month && row.month !== month) return false;
      if (bucket !== 'all' && row.bucket !== bucket) return false;
      if (!query) return true;
      return `${row.matricule} ${row.nom} ${row.department} ${row.site} ${row.hospital}`
        .toLowerCase()
        .includes(query);
    });
  }, [payload?.rows, year, month, bucket, q]);

  const dashboard = useMemo(() => {
    if (!payload) {
      return {
        employees: 0,
        applications: 0,
        attestations: 0,
        attestationOnly: 0,
        applicationOnly: 0,
        both: 0,
        byDeptAttestationOnly: [],
        byDeptApplicationOnly: [],
        byDeptBoth: [],
        byMonth: [],
      } satisfies SickLeaveDashboard;
    }
    const scoped = (payload.rows || []).filter((row) => {
      if (year && row.year !== year) return false;
      if (month && row.month !== month) return false;
      return true;
    });
    return buildDashboardFromRows(scoped, payload.attestations);
  }, [payload, year, month]);

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const data = new FormData();
      data.set('file', file);
      data.set('year', String(importYear));
      const res = await fetch('/api/sante/conge-maladie/import', { method: 'POST', body: data });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Import impossible');
        return;
      }
      await showSuccess(`Import ${importYear} : +${json.added} / maj ${json.updated}`);
      await load(true);
    } catch {
      await showError('Erreur d’import');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveAttestation = async () => {
    if (!form) return;
    if (!form.matricule.trim() || !form.nom.trim() || !form.startDate) {
      await showError('Matricule, nom et date de début sont requis');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/sante/conge-maladie/attestations/${editingId}` : '/api/sante/conge-maladie/attestations',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess(editingId ? 'Attestation modifiée' : 'Attestation enregistrée');
      setForm(null);
      setEditingId(null);
      await load(true);
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const patchRow = async (row: SickLeaveCompareRow, patch: { attestationImported?: string; provenance?: string }) => {
    try {
      const res = await fetch('/api/sante/conge-maladie', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: row.key, ...patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Mise à jour impossible');
        return;
      }
      await load(true);
    } catch {
      await showError('Erreur de mise à jour');
    }
  };

  const removeAttestation = async (row: SickLeaveCompareRow) => {
    if (!row.attestationId) return;
    if (!(await confirmDelete('Supprimer cette attestation ?', `${row.nom} · ${row.matricule}`))) return;
    try {
      const res = await fetch(`/api/sante/conge-maladie/attestations/${row.attestationId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Attestation supprimée');
      await load(true);
    } catch {
      await showError('Erreur de suppression');
    }
  };

  const openFromRow = (row: SickLeaveCompareRow, edit: boolean) => {
    const existing = payload?.attestations.find((item) => item.id === row.attestationId);
    if (edit && existing) {
      setEditingId(existing.id);
      setForm(attestationToInput(existing));
      return;
    }
    setEditingId(null);
    setForm({
      ...emptySickLeaveAttestationInput(),
      matricule: row.matricule,
      nom: row.nom,
      site: row.site,
      department: row.department,
      year: row.year,
      month: row.month,
      observations: row.observations,
      provenance: row.provenance,
      hospital: row.hospital,
    });
  };

  if (loading) {
    return (
      <PermissionGate anyOf={VIEW_ANY}>
        <div className="loading">Chargement du congé maladie…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate anyOf={VIEW_ANY}>
      <div className="mvt-page mvt-page-fill sante-page">
        <div className="page-header page-header-with-tabs mvt-page-header">
          <div>
            <div className="page-header-title-row">
              <h2>Congé maladie vs sick leave</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p className="mvt-page-sub">
              Import mensuel des leave balances — les attestations médicales se saisissent à la main.
              <span className="mvt-count-pill">{filteredRows.length}</span>
            </p>
          </div>
          <div className="page-header-actions mvt-header-actions sante-header-actions">
            {canImport ? (
              <>
                <select
                  className="filter-select filter-select-sm"
                  value={importYear}
                  onChange={(e) => setImportYear(Number(e.target.value))}
                  aria-label="Année d’import"
                >
                  {[
                    ...new Set([
                      ...(payload?.years || []),
                      new Date().getFullYear(),
                      new Date().getFullYear() - 1,
                    ]),
                  ].sort((a, b) => b - a).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  {importing ? 'Import…' : 'Importer leave balance'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                  }}
                />
              </>
            ) : null}
            <div className="exco-main-tabs" role="tablist" aria-label="Congé maladie">
              <button
                type="button"
                className={`exco-main-tab${view === 'dashboard' ? ' is-active' : ''}`}
                onClick={() => setView('dashboard')}
              >
                Dashboard
              </button>
              <button
                type="button"
                className={`exco-main-tab${view === 'donnees' ? ' is-active' : ''}`}
                onClick={() => setView('donnees')}
              >
                Données
              </button>
            </div>
          </div>
        </div>

        <div className="sante-list-toolbar">
          <div className="sante-list-filters">
            <select className="filter-select filter-select-sm" value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Tous les mois</option>
              {SANTE_MONTH_NAMES.map((label, index) => (
                <option key={label} value={index + 1}>{label}</option>
              ))}
            </select>
            <select className="filter-select filter-select-sm" value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Toutes les années</option>
              {(payload?.years || []).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select className="filter-select filter-select-sm" value={bucket} onChange={(e) => setBucket(e.target.value as typeof bucket)}>
              <option value="all">Tous les écarts</option>
              <option value="attestation-only">Attestation sans application</option>
              <option value="application-only">Application sans attestation</option>
              <option value="both">Les deux</option>
              <option value="none">Sans écart</option>
            </select>
          </div>
          {view === 'donnees' ? (
            <input
              type="search"
              className="search-input"
              placeholder="Rechercher matricule, nom, hôpital…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          ) : null}
        </div>

        {view === 'dashboard' ? (
          <SickLeaveDashboardView
            dashboard={dashboard}
            rows={filteredRows}
            onFilterBucket={(next) => setBucket(next)}
          />
        ) : (
          <SickLeaveDataView
            rows={filteredRows}
            canEdit={canEdit}
            canDelete={can('sante.conge-maladie', 'delete') || can('sante', 'delete')}
            onAddAttestation={(row) => openFromRow(row, false)}
            onEditAttestation={(row) => openFromRow(row, true)}
            onDeleteAttestation={(row) => void removeAttestation(row)}
            onPatchRow={(row, patch) => void patchRow(row, patch)}
          />
        )}

        {form ? (
          <div className="modal-overlay" onClick={() => { setForm(null); setEditingId(null); }}>
            <div className="modal modal-form sante-visit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editingId ? 'Modifier l’attestation' : 'Nouvelle attestation médicale'}</h3>
                <button type="button" className="modal-close" onClick={() => { setForm(null); setEditingId(null); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Agent</label>
                  <EmployeeSuggestInput
                    employees={employees}
                    value={form.nom}
                    onChange={(value) => setForm({ ...form, nom: value })}
                    onEmployeeSelect={(employee) => setForm({
                      ...form,
                      matricule: employee.matricule,
                      nom: employee.nom,
                      department: employee.departement || form.department,
                      site: employee.localisation || form.site,
                    })}
                    placeholder="Nom ou matricule…"
                  />
                </div>
                <div className="form-group">
                  <label>Matricule</label>
                  <input value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Site</label>
                  <input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Département</label>
                  <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Début</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Fin</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Nombre de jours</label>
                  <input
                    type="number"
                    value={form.days ?? ''}
                    onChange={(e) => setForm({ ...form, days: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Hôpital</label>
                  <input value={form.hospital} onChange={(e) => setForm({ ...form, hospital: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Confirmation sick leave</label>
                  <input value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Provenance</label>
                  <select
                    value={form.provenance || ''}
                    onChange={(e) => setForm({ ...form, provenance: e.target.value })}
                  >
                    <option value="">—</option>
                    {SICK_LEAVE_PROVENANCES.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Observations</label>
                  <input value={form.observations || ''} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setForm(null); setEditingId(null); }}>Annuler</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveAttestation()}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PermissionGate>
  );
}

function buildDashboardFromRows(
  rows: SickLeaveCompareRow[],
  attestations: SickLeaveAttestation[],
): SickLeaveDashboard {
  const fakeBalances = rows
    .filter((row) => row.days != null)
    .map((row) => ({
      id: row.key,
      matricule: row.matricule,
      firstName: '',
      lastName: '',
      nom: row.nom,
      department: row.department,
      site: row.site,
      leaveType: 'Sick',
      leaveDescription: '',
      year: row.year,
      month: row.month,
      days: row.days ?? 0,
      attestationImported: row.attestationImported || '',
      observations: row.observations || '',
      provenance: row.provenance || '',
      statut: row.statut || '',
      sourceSheet: row.sourceSheet || '',
      sourceFile: '',
      updatedAt: '',
    }));
  const filteredAtt = attestations.filter((item) =>
    rows.some((row) => row.matricule === item.matricule && row.year === item.year && row.month === item.month)
    || rows.some((row) => row.attestationId === item.id),
  );
  return buildSickLeaveDashboard(fakeBalances, filteredAtt);
}
