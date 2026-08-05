'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import FacturesSuiviDashboard from '@/components/factures-fournisseurs/FacturesSuiviDashboard';
import FacturesSuiviFlatTable from '@/components/factures-fournisseurs/FacturesSuiviFlatTable';
import FacturesSuiviImportModal from '@/components/factures-fournisseurs/FacturesSuiviImportModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Fournisseur } from '@/lib/fournisseurs-types';
import type {
  FactureBatchLineInput,
  FactureDashboard,
  FactureStage,
  FactureSuivi,
  FactureSuiviInput,
  FactureSuiviTab,
} from '@/lib/factures-fournisseurs/types';
import { FACTURE_TAB_LABELS } from '@/lib/factures-fournisseurs/types';
import { downloadFacturesSuiviExport } from '@/lib/factures-fournisseurs/export';
import {
  buildFactureDashboard,
  emptyFactureInput,
  filterByTab,
  filterFacturesByYear,
  isFacturePaid,
  listFactureYears,
  paymentValueFromStatus,
} from '@/lib/factures-fournisseurs/utils';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

const MENU = 'factures.fournisseur.factures';
const TABS: FactureSuiviTab[] = ['dashboard', 'unpaid', 'paid'];

type BatchLine = FactureBatchLineInput & { key: string };

function todayDisplay(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toDateInputValue(display: string): string {
  const raw = display.trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
}

function fromDateInputValue(iso: string): string {
  const raw = iso.trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function emptyBatchLine(partial?: Partial<BatchLine>): BatchLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: todayDisplay(),
    societe: '',
    facture: '',
    montant: null,
    pr: '',
    po: '',
    payment: '',
    ...partial,
  };
}

export default function FacturesSuiviPage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create');
  const canEdit = can(MENU, 'edit');
  const canDelete = can(MENU, 'delete');

  const [tab, setTab] = useState<FactureSuiviTab>('dashboard');
  const [factures, setFactures] = useState<FactureSuivi[]>([]);
  const [dashboard, setDashboard] = useState<FactureDashboard | null>(null);
  const [dashboardYear, setDashboardYear] = useState<number>(() => new Date().getFullYear());
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<FactureSuiviInput>(emptyFactureInput());
  const [batchLines, setBatchLines] = useState<BatchLine[]>([emptyBatchLine()]);
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    facture: FactureSuivi;
  } | null>(null);

  const isEditMode = Boolean(form.id);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resFactures, resFournisseurs] = await Promise.all([
        fetch('/api/factures-suivi'),
        fetch('/api/fournisseurs'),
      ]);

      const data = await resFactures.json();
      if (!resFactures.ok) {
        await showError(data?.error || 'Chargement impossible');
        setFactures([]);
        setDashboard(null);
      } else {
        setFactures(Array.isArray(data.factures) ? data.factures : []);
        setDashboard(data.dashboard ?? null);
      }

      if (resFournisseurs.ok) {
        void resFournisseurs
          .json()
          .then((frn) => {
            setFournisseurs(Array.isArray(frn) ? frn : []);
          })
          .catch(() => undefined);
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setContextMenu(null);
    setSearch('');
  }, [tab]);

  const years = useMemo(() => listFactureYears(factures), [factures]);
  const selectedYear = years.includes(dashboardYear)
    ? dashboardYear
    : (years[0] ?? new Date().getFullYear());

  useEffect(() => {
    if (years.length && !years.includes(dashboardYear)) {
      setDashboardYear(years[0]!);
    }
  }, [years, dashboardYear]);

  const facturesForYear = useMemo(
    () => filterFacturesByYear(factures, selectedYear),
    [factures, selectedYear],
  );

  const dashboardForYear = useMemo(
    () => buildFactureDashboard(facturesForYear),
    [facturesForYear],
  );

  const stageForTab = tab === 'dashboard' ? null : (tab as FactureStage);

  const listForTab = useMemo(() => {
    if (!stageForTab) return [];
    let list = filterByTab(facturesForYear, stageForTab);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) =>
      `${f.facture} ${f.societe} ${f.pr} ${f.po} ${f.payment} ${f.commentaire} ${f.date}`
        .toLowerCase()
        .includes(q),
    );
  }, [facturesForYear, stageForTab, search]);

  const tabCounts = useMemo(
    () => ({
      unpaid: facturesForYear.filter((f) => f.statut === 'unpaid').length,
      paid: facturesForYear.filter((f) => f.statut === 'paid').length,
    }),
    [facturesForYear],
  );

  const openCreate = () => {
    setForm(emptyFactureInput());
    setBatchLines([emptyBatchLine()]);
    setModalOpen(true);
  };

  const openEdit = (facture: FactureSuivi) => {
    setForm({ ...facture });
    setBatchLines([]);
    setModalOpen(true);
  };

  const updateBatchLine = (key: string, patch: Partial<BatchLine>) => {
    setBatchLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const handleSaveFacture = async () => {
    setSaving(true);
    try {
      if (isEditMode) {
        if (!form.facture?.trim()) {
          await showError('Numéro de facture requis');
          return;
        }
        if (!form.societe?.trim()) {
          await showError('Société requise');
          return;
        }
        const res = await fetch('/api/factures-suivi', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) {
          await showError(json.error || 'Erreur');
          return;
        }
        await showSuccess('Facture mise à jour');
      } else {
        const lines = batchLines
          .map((line) => ({
            date: line.date?.trim() || '',
            societe: line.societe?.trim() || '',
            facture: line.facture?.trim() || '',
            montant: line.montant ?? null,
            pr: line.pr?.trim() || '',
            po: line.po?.trim() || '',
            payment: line.payment?.trim() || '',
          }))
          .filter((line) => line.facture || line.societe);

        if (!lines.length) {
          await showError('Ajoutez au moins une facture');
          return;
        }
        for (const line of lines) {
          if (!line.facture) {
            await showError('Chaque ligne doit avoir un N° facture');
            return;
          }
          if (!line.societe) {
            await showError('Chaque ligne doit avoir une société');
            return;
          }
        }

        const res = await fetch('/api/factures-suivi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'batch', lines }),
        });
        const json = await res.json();
        if (!res.ok) {
          await showError(json.error || 'Erreur');
          return;
        }
        await showSuccess(`${(json.created as unknown[])?.length ?? lines.length} facture(s) enregistrée(s)`);
      }

      setModalOpen(false);
      setContextMenu(null);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (facture: FactureSuivi) => {
    if (!(await confirmDelete('Supprimer cette facture ?', facture.facture))) return;
    const res = await fetch(`/api/factures-suivi?id=${encodeURIComponent(facture.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await showError(json.error || 'Suppression impossible');
      return;
    }
    await load(true);
  };

  const handleFieldUpdate = async (id: string, patch: FactureSuiviInput) => {
    const current = factures.find((f) => f.id === id);
    if (!current) return;
    const payload: FactureSuiviInput = {
      ...current,
      ...patch,
      id,
    };
    const res = await fetch('/api/factures-suivi', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      await showError((json as { error?: string }).error || 'Modification impossible');
      throw new Error('update failed');
    }
    const updated = json as FactureSuivi;
    setFactures((prev) => prev.map((f) => (f.id === id ? updated : f)));
    void load(true);
  };

  const openContextMenu = (event: React.MouseEvent, facture: FactureSuivi) => {
    event.preventDefault();
    if (!canEdit && !canDelete) return;
    setContextMenu({ x: event.clientX, y: event.clientY, facture });
  };

  const contextItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const facture = contextMenu.facture;
    const actions: ContextMenuItem[] = [];
    if (canEdit) {
      actions.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => openEdit(facture),
      });
    }
    if (canDelete) {
      actions.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => void handleDelete(facture),
      });
    }
    return actions;
  }, [contextMenu, canEdit, canDelete]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadFacturesSuiviExport();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  }, []);

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate anyOf={[{ menuId: MENU, action: 'view' }]}>
      <div className="factures-suivi-page">
        <div className="factures-suivi-sticky">
          <div className="page-header page-header-with-tabs factures-suivi-page-header">
            <div className="factures-suivi-title-block">
              <div className="page-header-title-row">
                <h2>Suivi des factures</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
              <p>
                {dashboard
                  ? `${dashboardForYear.enCours} unpaid · ${dashboardForYear.paid} paid · ${dashboardForYear.total} total · ${selectedYear}`
                  : 'Unpaid / Paid — import DATE · SOCIETE · FACTURE · MONTANT · PR · P.O · PYTMT'}
              </p>
            </div>

            <div className="factures-suivi-header-right">
              <div className="tabs header-tabs header-tabs-compact factures-suivi-tabs">
                {TABS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === id ? ' active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {FACTURE_TAB_LABELS[id]}
                    {id === 'unpaid' || id === 'paid' ? (
                      <span className="factures-suivi-tab-count">{tabCounts[id]}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <label className="factures-suivi-year-filter" title="Année">
                <select
                  className="filter-select factures-suivi-year-select"
                  value={selectedYear}
                  onChange={(e) => setDashboardYear(Number(e.target.value))}
                  aria-label="Année"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <div className="factures-suivi-header-actions">
                <PermissionGate menuId={MENU} action="export">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm factures-suivi-io-btn is-export"
                    onClick={() => void handleExport()}
                    disabled={exporting}
                    title="Export"
                  >
                    {exporting ? (
                      <span className="btn-spinner" aria-hidden="true" />
                    ) : (
                      <svg
                        className="factures-io-icon"
                        viewBox="0 0 24 24"
                        width="15"
                        height="15"
                        fill="none"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id="facturesExportGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="100%" stopColor="#2563eb" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M12 3v10"
                          stroke="url(#facturesExportGrad)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M8 7l4-4 4 4"
                          stroke="url(#facturesExportGrad)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                          stroke="url(#facturesExportGrad)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                    <span>{exporting ? 'Export…' : 'Export'}</span>
                  </button>
                </PermissionGate>
                {canCreate ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm factures-suivi-io-btn is-import"
                    onClick={() => setImportOpen(true)}
                    title="Import"
                  >
                    <svg
                      className="factures-io-icon"
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="facturesImportGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#4ade80" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M12 15V5"
                        stroke="url(#facturesImportGrad)"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M8 11l4 4 4-4"
                        stroke="url(#facturesImportGrad)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 18h14"
                        stroke="url(#facturesImportGrad)"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>Import</span>
                  </button>
                ) : null}
                {tab !== 'dashboard' && canCreate ? (
                  <button type="button" className="btn btn-accent btn-sm" onClick={openCreate}>
                    + Nouvelles factures
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {tab !== 'dashboard' && (
            <div className="factures-suivi-tabs-search factures-suivi-tabs-search-row">
              <input
                type="search"
                className="search-input"
                placeholder="Rechercher facture, société, PR, PO…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="factures-suivi-toolbar-meta">
                {listForTab.length} facture{listForTab.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        <div className="factures-suivi-body">
          {tab === 'dashboard' && dashboard && (
            <FacturesSuiviDashboard
              key={selectedYear}
              dashboard={dashboardForYear}
              factures={facturesForYear}
              year={selectedYear}
              onOpenStage={(stage) => setTab(stage)}
            />
          )}

          {tab !== 'dashboard' && (
            <div className="panel factures-suivi-list-panel">
              <FacturesSuiviFlatTable
                factures={listForTab}
                canEdit={canEdit}
                onFieldUpdate={handleFieldUpdate}
                onContextMenu={openContextMenu}
              />
            </div>
          )}
        </div>
      </div>

      {contextMenu && contextItems.length > 0 && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      <FacturesSuiviImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void load(true)}
      />

      {modalOpen && (
        <div className="modal-overlay open" onClick={() => setModalOpen(false)}>
          <div
            className={`modal modal-form ${isEditMode ? 'modal-lg' : 'modal-xl'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{isEditMode ? 'Modifier la facture' : 'Enregistrer des factures'}</h3>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {isEditMode ? (
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label>N° Facture</label>
                    <input
                      value={form.facture ?? ''}
                      onChange={(e) => setForm({ ...form, facture: e.target.value })}
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label>Société</label>
                    <input
                      list="factures-societes"
                      value={form.societe ?? ''}
                      onChange={(e) => setForm({ ...form, societe: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Montant</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.montant ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          montant: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Date facture</label>
                    <input
                      type="date"
                      value={toDateInputValue(form.date ?? '')}
                      onChange={(e) =>
                        setForm({ ...form, date: fromDateInputValue(e.target.value) })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>PR</label>
                    <input
                      value={form.pr ?? ''}
                      onChange={(e) => setForm({ ...form, pr: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>PO</label>
                    <input
                      value={form.po ?? ''}
                      onChange={(e) => setForm({ ...form, po: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment</label>
                    <select
                      value={isFacturePaid(form.payment ?? '') ? 'paid' : 'unpaid'}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          payment: paymentValueFromStatus(
                            e.target.value === 'paid' ? 'paid' : 'unpaid',
                          ),
                        })
                      }
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Commentaire</label>
                    <input
                      value={form.commentaire ?? ''}
                      onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p className="factures-suivi-assign-hint">
                    Colonnes alignées sur l’Excel : DATE, SOCIETE, FACTURE, MONTANT, PR, P.O, PYTMT.
                  </p>
                  <div className="factures-suivi-table-wrap factures-batch-table-wrap">
                    <table className="factures-suivi-table factures-batch-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>N° Facture</th>
                          <th>Société</th>
                          <th>Montant</th>
                          <th>Date</th>
                          <th>PR</th>
                          <th>PO</th>
                          <th>Payment</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {batchLines.map((line, index) => (
                          <tr key={line.key}>
                            <td className="is-num">{index + 1}</td>
                            <td>
                              <input
                                value={line.facture ?? ''}
                                onChange={(e) =>
                                  updateBatchLine(line.key, { facture: e.target.value })
                                }
                                placeholder="FAC-001"
                              />
                            </td>
                            <td>
                              <input
                                list="factures-societes"
                                value={line.societe ?? ''}
                                onChange={(e) =>
                                  updateBatchLine(line.key, { societe: e.target.value })
                                }
                                placeholder="Fournisseur"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={line.montant ?? ''}
                                onChange={(e) =>
                                  updateBatchLine(line.key, {
                                    montant: e.target.value === '' ? null : Number(e.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={toDateInputValue(line.date ?? '')}
                                onChange={(e) =>
                                  updateBatchLine(line.key, {
                                    date: fromDateInputValue(e.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={line.pr ?? ''}
                                onChange={(e) => updateBatchLine(line.key, { pr: e.target.value })}
                                placeholder="PR…"
                              />
                            </td>
                            <td>
                              <input
                                value={line.po ?? ''}
                                onChange={(e) => updateBatchLine(line.key, { po: e.target.value })}
                                placeholder="PO…"
                              />
                            </td>
                            <td>
                              <select
                                value={isFacturePaid(line.payment ?? '') ? 'paid' : 'unpaid'}
                                onChange={(e) =>
                                  updateBatchLine(line.key, {
                                    payment: paymentValueFromStatus(
                                      e.target.value === 'paid' ? 'paid' : 'unpaid',
                                    ),
                                  })
                                }
                              >
                                <option value="unpaid">Unpaid</option>
                                <option value="paid">Paid</option>
                              </select>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={batchLines.length <= 1}
                                onClick={() =>
                                  setBatchLines((prev) => prev.filter((l) => l.key !== line.key))
                                }
                                title="Retirer la ligne"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() =>
                      setBatchLines((prev) => [
                        ...prev,
                        emptyBatchLine({
                          societe: prev[prev.length - 1]?.societe ?? '',
                          pr: prev[prev.length - 1]?.pr ?? '',
                        }),
                      ])
                    }
                  >
                    + Ajouter une ligne
                  </button>
                </>
              )}
              <datalist id="factures-societes">
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.nom} />
                ))}
              </datalist>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void handleSaveFacture()}
              >
                {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  );
}
