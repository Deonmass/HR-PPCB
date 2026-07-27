'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import FacturesSuiviDashboard from '@/components/factures-fournisseurs/FacturesSuiviDashboard';
import FacturesSuiviGroupModal from '@/components/factures-fournisseurs/FacturesSuiviGroupModal';
import FacturesSuiviImportModal from '@/components/factures-fournisseurs/FacturesSuiviImportModal';
import FacturesSuiviStageList from '@/components/factures-fournisseurs/FacturesSuiviStageList';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Fournisseur } from '@/lib/fournisseurs-types';
import type {
  AssignStep,
  FactureBatchLineInput,
  FactureDashboard,
  FactureGroupNode,
  FactureStage,
  FactureSuivi,
  FactureSuiviInput,
  FactureSuiviTab,
} from '@/lib/factures-fournisseurs/types';
import {
  FACTURE_TAB_LABELS,
  nextMissingStage,
} from '@/lib/factures-fournisseurs/types';
import { downloadFacturesSuiviExport } from '@/lib/factures-fournisseurs/export';
import {
  buildStageGroups,
  countStageGroups,
  emptyFactureInput,
  filterByTab,
  formatUsdLike,
} from '@/lib/factures-fournisseurs/utils';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

const MENU = 'factures.fournisseur.factures';
const TABS: FactureSuiviTab[] = ['dashboard', 'facture', 'pr', 'po', 'posted', 'paid'];

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
    echeance: '',
    pr: '',
    datePr: '',
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
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [form, setForm] = useState<FactureSuiviInput>(emptyFactureInput());
  const [batchLines, setBatchLines] = useState<BatchLine[]>([emptyBatchLine()]);
  const [assignNumero, setAssignNumero] = useState('');
  const [assignDate, setAssignDate] = useState(todayDisplay());
  const [saving, setSaving] = useState(false);
  const [openedGroup, setOpenedGroup] = useState<FactureGroupNode | null>(null);
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

      // On affiche le dashboard dès que les factures sont prêtes.
      // Les fournisseurs (datalist / modals) peuvent charger après pour
      // réduire le temps d’écran sur l’état "Chargement".
      const data = await resFactures.json();
      if (!resFactures.ok) {
        await showError(data?.error || 'Chargement impossible');
        setFactures([]);
        setDashboard(null);
      } else {
        setFactures(Array.isArray(data.factures) ? data.factures : []);
        setDashboard(data.dashboard ?? null);
      }

      // Fournisseurs en arrière-plan (ne bloque pas l'affichage principal).
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
    setSelectedIds(new Set());
    setOpenedGroup(null);
    setContextMenu(null);
  }, [tab]);

  const stageForTab = tab === 'dashboard' ? null : (tab as FactureStage);

  const filtered = useMemo(() => {
    if (!stageForTab) return [];
    let list = stageForTab === 'facture' ? factures : filterByTab(factures, stageForTab);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) =>
      `${f.facture} ${f.societe} ${f.pr} ${f.po} ${f.grn} ${f.payment} ${f.statutLabel} ${f.commentaire}`
        .toLowerCase()
        .includes(q),
    );
  }, [factures, stageForTab, search]);

  const groups = useMemo(() => {
    if (!stageForTab || stageForTab === 'facture') return [];
    return buildStageGroups(filtered, stageForTab);
  }, [filtered, stageForTab]);

  const tabGroupCounts = useMemo(() => {
    const stages: Exclude<FactureStage, 'facture'>[] = ['pr', 'po', 'posted', 'paid'];
    return Object.fromEntries(
      stages.map((stage) => [stage, countStageGroups(factures, stage)]),
    ) as Record<Exclude<FactureStage, 'facture'>, number>;
  }, [factures]);

  const assignStep = useMemo((): AssignStep | null => {
    if (!stageForTab || stageForTab === 'paid') return null;
    return nextMissingStage(stageForTab);
  }, [stageForTab]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectMany = (ids: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

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
            echeance: line.echeance?.trim() || '',
            pr: line.pr?.trim() || '',
            datePr: line.datePr?.trim() || '',
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
      setOpenedGroup(null);
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
    setOpenedGroup(null);
    await load(true);
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

  const openAssign = () => {
    if (!assignStep) return;
    if (selectedIds.size === 0) {
      void showError('Sélectionnez au moins une facture');
      return;
    }
    setAssignNumero('');
    setAssignDate(todayDisplay());
    setAssignOpen(true);
  };

  const handleAssign = async () => {
    if (!assignStep) return;
    setSaving(true);
    try {
      const res = await fetch('/api/factures-suivi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          step: assignStep,
          numero: assignNumero,
          date: assignDate,
          ids: [...selectedIds],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Affectation impossible');
        return;
      }
      await showSuccess(
        assignStep === 'payment'
          ? 'Paiement enregistré'
          : assignStep === 'grn'
            ? 'GRN affecté — Posted and unpaid'
            : `${assignStep.toUpperCase()} affecté — unpaid`,
      );
      setAssignOpen(false);
      setSelectedIds(new Set());
      await load(true);
      if (assignStep === 'grn') setTab('posted');
      else if (assignStep === 'payment') setTab('paid');
      else if (assignStep) setTab(assignStep);
    } finally {
      setSaving(false);
    }
  };

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
          <div className="page-header page-header-with-tabs">
            <div>
              <div className="page-header-title-row">
                <h2>Suivi des factures</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
              <p>
                {dashboard
                  ? `${dashboard.enCours} en cours · ${dashboard.enRetard} en retard · ${dashboard.posted} posted · ${dashboard.paid} paid`
                  : 'Pipeline facture → PR → PO → GRN → Posted and unpaid'}
              </p>
            </div>
            <div className="factures-suivi-header-actions">
              <PermissionGate menuId={MENU} action="export">
                <button
                  type="button"
                  className="btn btn-outline btn-export btn-sm btn-with-icon"
                  onClick={() => void handleExport()}
                  disabled={exporting}
                >
                  {exporting ? <span className="btn-spinner" aria-hidden="true" /> : null}
                  {exporting ? 'Export…' : 'Export'}
                </button>
              </PermissionGate>
              {canCreate ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setImportOpen(true)}
                >
                  Import Excel
                </button>
              ) : null}
              {tab !== 'dashboard' && assignStep && canEdit && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={openAssign}
                  disabled={selectedIds.size === 0}
                >
                  Affecter{' '}
                  {assignStep === 'payment' ? 'payment' : assignStep.toUpperCase()} (
                  {selectedIds.size})
                </button>
              )}
              {tab === 'facture' && canCreate && (
                <button type="button" className="btn btn-accent btn-sm" onClick={openCreate}>
                  + Nouvelles factures
                </button>
              )}
            </div>
          </div>

          <div className="factures-suivi-tabs-row">
            <div className="tabs header-tabs header-tabs-compact factures-suivi-tabs">
              {TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`tab-btn tab-btn-sm${tab === id ? ' active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {FACTURE_TAB_LABELS[id]}
                  {id !== 'dashboard' && id !== 'facture' ? (
                    <span className="factures-suivi-tab-count">{tabGroupCounts[id]}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {tab !== 'dashboard' && (
              <div className="factures-suivi-tabs-search">
                <input
                  type="search"
                  className="search-input"
                  placeholder="Rechercher facture, société, PR, PO…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="factures-suivi-toolbar-meta">
                  {tab === 'facture'
                    ? `${filtered.length} facture${filtered.length > 1 ? 's' : ''}`
                    : `${groups.length} groupe${groups.length > 1 ? 's' : ''} · ${filtered.length} facture${filtered.length > 1 ? 's' : ''}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="factures-suivi-body">
          {tab === 'dashboard' && dashboard && (
            <FacturesSuiviDashboard
              dashboard={dashboard}
              factures={factures}
              onOpenStage={(stage) => setTab(stage)}
            />
          )}

          {tab === 'facture' && (
            <div className="panel factures-suivi-list-panel">
              {filtered.length === 0 ? (
                <p className="empty-state">Aucune facture enregistrée.</p>
              ) : (
                <div className="factures-suivi-table-wrap">
                  <table className="factures-suivi-table">
                    <thead>
                      <tr>
                        <th className="col-check" />
                        <th className="col-row-num">#</th>
                        <th>Facture</th>
                        <th>Société</th>
                        <th>Montant</th>
                        <th>Date</th>
                        <th>Échéance</th>
                        <th>PR</th>
                        <th>PO</th>
                        <th>GRN</th>
                        <th>payment</th>
                        <th>Statut</th>
                        <th>Commentaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((f, index) => (
                        <tr
                          key={f.id}
                          className="factures-suivi-row-context"
                          onContextMenu={(event) => openContextMenu(event, f)}
                        >
                          <td>
                            {canEdit && f.statut === 'facture' ? (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(f.id)}
                                onChange={() => toggleSelect(f.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : null}
                          </td>
                          <td className="col-row-num is-num">{index + 1}</td>
                          <td>
                            <strong>{f.facture}</strong>
                          </td>
                          <td>{f.societe}</td>
                          <td className="is-num">
                            {f.montant != null ? formatUsdLike(f.montant) : '—'}
                          </td>
                          <td>{f.date || '—'}</td>
                          <td>{f.echeance || '—'}</td>
                          <td>{f.pr || '—'}</td>
                          <td>{f.po || '—'}</td>
                          <td>{f.grn || '—'}</td>
                          <td>{f.payment || '—'}</td>
                          <td>
                            <span className={`factures-suivi-status status-${f.statut}`}>
                              {f.statutLabel}
                            </span>
                          </td>
                          <td className="factures-suivi-comment">{f.commentaire || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab !== 'dashboard' && tab !== 'facture' && (
            <div className="panel factures-suivi-list-panel">
              <FacturesSuiviStageList
                stage={tab}
                groups={groups}
                selectedIds={selectedIds}
                onToggleSelectMany={toggleSelectMany}
                onOpenGroup={setOpenedGroup}
                canEdit={canEdit && tab !== 'paid'}
              />
            </div>
          )}
        </div>
      </div>

      {openedGroup && (
        <FacturesSuiviGroupModal
          group={openedGroup}
          onClose={() => setOpenedGroup(null)}
          onContextMenuFacture={openContextMenu}
        />
      )}

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
                    <label>Échéance</label>
                    <input
                      type="date"
                      value={toDateInputValue(form.echeance ?? '')}
                      onChange={(e) =>
                        setForm({ ...form, echeance: fromDateInputValue(e.target.value) })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>N° PR</label>
                    <input
                      value={form.pr ?? ''}
                      onChange={(e) => setForm({ ...form, pr: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p className="factures-suivi-assign-hint">
                    Ajoutez plusieurs factures d’un coup. La colonne <strong>N° PR</strong> permet
                    de lier plusieurs factures au même PR (1 PR → N factures).
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
                          <th>Échéance</th>
                          <th>N° PR</th>
                          <th>Date PR</th>
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
                                type="date"
                                value={toDateInputValue(line.echeance ?? '')}
                                onChange={(e) =>
                                  updateBatchLine(line.key, {
                                    echeance: fromDateInputValue(e.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={line.pr ?? ''}
                                onChange={(e) => updateBatchLine(line.key, { pr: e.target.value })}
                                placeholder="PR-…"
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={toDateInputValue(line.datePr ?? '')}
                                onChange={(e) =>
                                  updateBatchLine(line.key, {
                                    datePr: fromDateInputValue(e.target.value),
                                  })
                                }
                              />
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
                          datePr: prev[prev.length - 1]?.datePr ?? '',
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

      {assignOpen && assignStep && (
        <div className="modal-overlay open" onClick={() => setAssignOpen(false)}>
          <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                Affecter{' '}
                {assignStep === 'payment' ? 'payment' : assignStep.toUpperCase()} ·{' '}
                {selectedIds.size} facture
                {selectedIds.size > 1 ? 's' : ''}
              </h3>
              <button type="button" className="modal-close" onClick={() => setAssignOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="factures-suivi-assign-hint">
                {assignStep === 'pr' && 'Un PR peut regrouper plusieurs factures. Statut → unpaid.'}
                {assignStep === 'po' && 'Un PO peut regrouper plusieurs PR. Statut → unpaid.'}
                {assignStep === 'grn' &&
                  'Un GRN ne peut être lié qu’à un seul PO — statut → Posted and unpaid.'}
                {assignStep === 'payment' &&
                  'Saisissez la référence de paiement — statut → paid.'}
              </p>
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    {assignStep === 'payment'
                      ? 'Référence payment'
                      : `Numéro ${assignStep.toUpperCase()}`}
                  </label>
                  <input
                    value={assignNumero}
                    onChange={(e) => setAssignNumero(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>
                    {assignStep === 'payment' ? 'DATE PYM' : `Date ${assignStep.toUpperCase()}`}
                  </label>
                  <input
                    type="date"
                    value={toDateInputValue(assignDate)}
                    onChange={(e) => setAssignDate(fromDateInputValue(e.target.value))}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setAssignOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !assignNumero.trim() || !assignDate.trim()}
                onClick={() => void handleAssign()}
              >
                {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {saving ? 'Enregistrement…' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  );
}
