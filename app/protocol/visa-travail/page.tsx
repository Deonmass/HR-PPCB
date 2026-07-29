'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import WorkVisaDashboard from '@/components/protocol/WorkVisaDashboard';
import WorkVisaFormDrawer from '@/components/protocol/WorkVisaFormDrawer';
import { WorkVisaHistoryModal, WorkVisaRenewModal } from '@/components/protocol/WorkVisaModals';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Employee } from '@/lib/types';
import type {
  WorkVisaBundle,
  WorkVisaDocKind,
  WorkVisaDocumentInput,
  WorkVisaDossierInput,
  WorkVisaDossierView,
  WorkVisaKpis,
  WorkVisaReport,
} from '@/lib/work-visa-types';
import { WORK_VISA_DOC_LABELS } from '@/lib/work-visa-types';
import { alertLevelLabel, formatDateFr } from '@/lib/work-visa-validity';
import { showError, showSuccess } from '@/lib/swal';

const MENU = 'protocol.visa-travail';

type Tab = 'dashboard' | 'liste';

type Filters = {
  q: string;
  centreCout: string;
  nationalite: string;
  sexe: string;
  status: string;
  report: string;
  passportExpired: boolean;
  workCardExpired: boolean;
  vsrExpired: boolean;
  visaExpired: boolean;
  visaValide: boolean;
  alert4m: boolean;
};

const emptyFilters = (): Filters => ({
  q: '',
  centreCout: '',
  nationalite: '',
  sexe: '',
  status: '',
  report: '',
  passportExpired: false,
  workCardExpired: false,
  vsrExpired: false,
  visaExpired: false,
  visaValide: false,
  alert4m: false,
});

const emptyKpis = (): WorkVisaKpis => ({
  total: 0,
  expats: 0,
  visasValides: 0,
  visasExpires: 0,
  passportsExpires: 0,
  workCardsExpires: 0,
  vsrExpires: 0,
  alerts4m: 0,
});

function validityClass(status: string, alert: boolean): string {
  if (status === 'expire') return 'work-visa-badge is-expired';
  if (status === 'absent') return 'work-visa-badge is-absent';
  if (alert) return 'work-visa-badge is-alert';
  return 'work-visa-badge is-ok';
}

function docSummary(
  number: string | undefined,
  expiry: string | undefined,
  label: string,
  status: string,
  alert: boolean,
  alertLevel: string,
) {
  if (!expiry) return <span className="work-visa-badge is-absent">—</span>;
  return (
    <span className={validityClass(status, alert)} title={alertLevelLabel(alertLevel as never) || label}>
      <strong>{number || '—'}</strong>
      <span>{label}</span>
      <small>{formatDateFr(expiry)}</small>
    </span>
  );
}

export default function VisaTravailPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<WorkVisaBundle | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WorkVisaDossierView | null>(null);
  const [renewKind, setRenewKind] = useState<WorkVisaDocKind | null>(null);
  const [renewDossier, setRenewDossier] = useState<WorkVisaDossierView | null>(null);
  const [historyDossier, setHistoryDossier] = useState<WorkVisaDossierView | null>(null);

  const canCreate = can(MENU, 'create');
  const canEdit = can(MENU, 'edit');
  const canExport = can(MENU, 'export');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.centreCout) params.set('centreCout', filters.centreCout);
    if (filters.nationalite) params.set('nationalite', filters.nationalite);
    if (filters.sexe) params.set('sexe', filters.sexe);
    if (filters.status) params.set('status', filters.status);
    if (filters.report) params.set('report', filters.report);
    if (filters.passportExpired) params.set('passportExpired', '1');
    if (filters.workCardExpired) params.set('workCardExpired', '1');
    if (filters.vsrExpired) params.set('vsrExpired', '1');
    if (filters.visaExpired) params.set('visaExpired', '1');
    if (filters.visaValide) params.set('visaValide', '1');
    if (filters.alert4m) params.set('alert4m', '1');
    return params.toString();
  }, [filters]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/protocol/work-visas?${queryString}`, { cache: 'no-store' });
      const json = (await res.json()) as WorkVisaBundle & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Chargement impossible');
      setBundle(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/employees', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as Employee[] | { employees?: Employee[]; error?: string };
        setEmployees(Array.isArray(json) ? json : json.employees ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  const dossiers = bundle?.dossiers ?? [];
  const kpis = bundle?.kpis ?? emptyKpis();
  const filterOptions = bundle?.filters ?? { centresCout: [], nationalites: [], sexes: [] };

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: WorkVisaDossierView) => {
    setEditing(row);
    setDrawerOpen(true);
  };

  const saveDossier = async (payload: WorkVisaDossierInput) => {
    setSaving(true);
    try {
      const url = editing
        ? `/api/protocol/work-visas/${editing.id}`
        : '/api/protocol/work-visas';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
      showSuccess(editing ? 'Dossier mis à jour' : 'Dossier créé');
      setDrawerOpen(false);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: WorkVisaDossierView) => {
    const next = row.status === 'actif' ? 'inactif' : 'actif';
    try {
      const res = await fetch(`/api/protocol/work-visas/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusOnly: true, status: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Mise à jour impossible');
      showSuccess(next === 'actif' ? 'Dossier activé' : 'Dossier désactivé');
      await load(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const renewDocument = async (kind: WorkVisaDocKind, document: WorkVisaDocumentInput) => {
    if (!renewDossier) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/protocol/work-visas/${renewDossier.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, document }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Renouvellement impossible');
      showSuccess(`${WORK_VISA_DOC_LABELS[kind]} renouvelé`);
      setRenewKind(null);
      setRenewDossier(null);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    try {
      const res = await fetch(`/api/protocol/work-visas/export?${queryString}`);
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || 'Export impossible');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visas-travail-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur export');
    }
  };

  const rowActions = (row: WorkVisaDossierView): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (canEdit) {
      items.push({ id: 'edit', label: 'Modifier', icon: 'edit', onClick: () => openEdit(row) });
      (['passport', 'workVisa', 'workCard', 'vsr'] as WorkVisaDocKind[]).forEach((kind) => {
        items.push({
          id: `renew-${kind}`,
          label: `Renouveler — ${WORK_VISA_DOC_LABELS[kind]}`,
          icon: 'add',
          onClick: () => {
            setRenewDossier(row);
            setRenewKind(kind);
          },
        });
      });
      items.push({
        id: 'toggle',
        label: row.status === 'actif' ? 'Désactiver' : 'Activer',
        icon: 'toggle',
        onClick: () => void toggleStatus(row),
      });
    }
    items.push({
      id: 'history',
      label: 'Historique',
      icon: 'view',
      onClick: () => setHistoryDossier(row),
    });
    return items;
  };

  const applyKpiFilter = (filter: Record<string, string>) => {
    setFilters({
      ...emptyFilters(),
      report: (filter.report as WorkVisaReport) || '',
      passportExpired: filter.passportExpired === '1',
      workCardExpired: filter.workCardExpired === '1',
      vsrExpired: filter.vsrExpired === '1',
      alert4m: filter.alert4m === '1',
    });
    setTab('liste');
  };

  if (loading && !bundle) {
    return (
      <PermissionGate menuId={MENU} action="view">
        <div className="loading">Chargement…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate menuId={MENU} action="view">
      <div className="work-visa-page">
        <div className="page-header page-header-with-tabs">
          <div>
            <div className="page-header-title-row">
              <h2>Visas de travail</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
            <p>
              {kpis.total}
              {' '}
              dossier
              {kpis.total > 1 ? 's' : ''}
              {' · '}
              {kpis.alerts4m}
              {' '}
              alerte
              {kpis.alerts4m > 1 ? 's' : ''}
              {' ≤ 4 mois'}
            </p>
          </div>
          <div className="work-visa-header-actions">
            {canExport ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void exportExcel()}>
                Export Excel
              </button>
            ) : null}
            {canCreate ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                Ajouter
              </button>
            ) : null}
            <div className="tabs header-tabs header-tabs-compact">
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`}
                onClick={() => setTab('dashboard')}
              >
                Dashboard
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'liste' ? ' active' : ''}`}
                onClick={() => setTab('liste')}
              >
                Liste
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="alert alert-danger">{error}</div> : null}

        {tab === 'dashboard' ? (
          <WorkVisaDashboard kpis={kpis} onFilter={applyKpiFilter} />
        ) : (
          <div className="panel">
            <div className="docs-filter-bar-compact work-visa-filters">
              <input
                type="search"
                className="search-input"
                placeholder="Matricule ou nom…"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
              <select
                className="filter-select filter-select-sm"
                value={filters.centreCout}
                onChange={(e) => setFilters((f) => ({ ...f, centreCout: e.target.value }))}
              >
                <option value="">Centre de coût</option>
                {filterOptions.centresCout.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select
                className="filter-select filter-select-sm"
                value={filters.nationalite}
                onChange={(e) => setFilters((f) => ({ ...f, nationalite: e.target.value }))}
              >
                <option value="">Nationalité</option>
                {filterOptions.nationalites.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select
                className="filter-select filter-select-sm"
                value={filters.sexe}
                onChange={(e) => setFilters((f) => ({ ...f, sexe: e.target.value }))}
              >
                <option value="">Sexe</option>
                {filterOptions.sexes.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <select
                className="filter-select filter-select-sm"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">Statut</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
              <select
                className="filter-select filter-select-sm"
                value={filters.report}
                onChange={(e) => setFilters((f) => ({
                  ...f,
                  report: e.target.value,
                  visaValide: false,
                  visaExpired: false,
                }))}
              >
                <option value="">Rapports</option>
                <option value="visa-valide">Visa valide</option>
                <option value="visa-expire">Visa non valide</option>
                <option value="expat-sans-vsr">Expatriés sans VSR</option>
                <option value="expat-avec-vsr">Expatriés avec VSR</option>
              </select>
              <label className="work-visa-check-inline">
                <input
                  type="checkbox"
                  checked={filters.passportExpired}
                  onChange={(e) => setFilters((f) => ({ ...f, passportExpired: e.target.checked }))}
                />
                Passeport expiré
              </label>
              <label className="work-visa-check-inline">
                <input
                  type="checkbox"
                  checked={filters.workCardExpired}
                  onChange={(e) => setFilters((f) => ({ ...f, workCardExpired: e.target.checked }))}
                />
                Carte expirée
              </label>
              <label className="work-visa-check-inline">
                <input
                  type="checkbox"
                  checked={filters.vsrExpired}
                  onChange={(e) => setFilters((f) => ({ ...f, vsrExpired: e.target.checked }))}
                />
                VSR expiré
              </label>
              <label className="work-visa-check-inline">
                <input
                  type="checkbox"
                  checked={filters.alert4m}
                  onChange={(e) => setFilters((f) => ({ ...f, alert4m: e.target.checked }))}
                />
                Alerte ≤ 4 mois
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setFilters(emptyFilters())}
              >
                Réinitialiser
              </button>
              <span className="toolbar-count">
                {dossiers.length}
                {' '}
                résultat
                {dossiers.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="table-wrap">
              {dossiers.length === 0 ? (
                <p className="empty-state">Aucun dossier ne correspond aux filtres.</p>
              ) : (
                <table className="data-table work-visa-table">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom</th>
                      <th>Centre de coût</th>
                      <th>Nationalité</th>
                      <th>Passeport</th>
                      <th>Visa</th>
                      <th>Carte travail</th>
                      <th>VSR</th>
                      <th>Validité</th>
                      <th>Statut</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dossiers.map((row) => (
                      <tr key={row.id} className={row.hasAnyAlert ? 'work-visa-row-alert' : undefined}>
                        <td>{row.matricule}</td>
                        <td>
                          {row.displayName}
                          {row.isExpat ? <span className="work-visa-expat-tag">EXP</span> : null}
                        </td>
                        <td>{row.centreCout || '—'}</td>
                        <td>{row.nationalite || '—'}</td>
                        <td>
                          {docSummary(
                            row.passport.current?.number,
                            row.passport.current?.expiryDate,
                            row.passportValidity.label,
                            row.passportValidity.status,
                            row.passportValidity.alert,
                            row.passportValidity.alertLevel,
                          )}
                        </td>
                        <td>
                          {docSummary(
                            row.workVisa.current?.number,
                            row.workVisa.current?.expiryDate,
                            row.workVisaValidity.label,
                            row.workVisaValidity.status,
                            row.workVisaValidity.alert,
                            row.workVisaValidity.alertLevel,
                          )}
                        </td>
                        <td>
                          {docSummary(
                            row.workCard.current?.number,
                            row.workCard.current?.expiryDate,
                            row.workCardValidity.label,
                            row.workCardValidity.status,
                            row.workCardValidity.alert,
                            row.workCardValidity.alertLevel,
                          )}
                        </td>
                        <td>
                          {docSummary(
                            row.vsr.current?.number,
                            row.vsr.current?.expiryDate,
                            row.vsrValidity.label,
                            row.vsrValidity.status,
                            row.vsrValidity.alert,
                            row.vsrValidity.alertLevel,
                          )}
                        </td>
                        <td>
                          <span className={validityClass(row.workVisaValidity.status, row.workVisaValidity.alert)}>
                            {row.workVisaValidity.label}
                          </span>
                        </td>
                        <td>
                          <span className={`work-visa-status is-${row.status}`}>
                            {row.status === 'actif' ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td>
                          <CardActionMenu items={rowActions(row)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <WorkVisaFormDrawer
        open={drawerOpen}
        editing={editing}
        employees={employees}
        saving={saving}
        onClose={() => setDrawerOpen(false)}
        onSubmit={saveDossier}
      />

      <WorkVisaRenewModal
        open={Boolean(renewKind && renewDossier)}
        dossier={renewDossier}
        kind={renewKind}
        saving={saving}
        onClose={() => {
          setRenewKind(null);
          setRenewDossier(null);
        }}
        onSubmit={renewDocument}
      />

      <WorkVisaHistoryModal
        open={Boolean(historyDossier)}
        dossier={historyDossier}
        onClose={() => setHistoryDossier(null)}
      />
    </PermissionGate>
  );
}
