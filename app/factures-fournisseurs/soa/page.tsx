'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import FacturesSuiviFlatTable from '@/components/factures-fournisseurs/FacturesSuiviFlatTable';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Fournisseur } from '@/lib/fournisseurs-types';
import type { FactureSuivi, FactureSuiviInput } from '@/lib/factures-fournisseurs/types';
import { formatUsdLike } from '@/lib/factures-fournisseurs/utils';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

const MENU = 'factures.fournisseur.soa';
const MENU_FACTURES = 'factures.fournisseur.factures';

type SoaCard = 'unpaid' | 'paid';

interface SupplierRow {
  key: string;
  nom: string;
  natureService: string;
  factures: FactureSuivi[];
  unpaid: FactureSuivi[];
  paid: FactureSuivi[];
  solde: number;
}

function sumMontant(rows: FactureSuivi[]): number {
  return rows.reduce((acc, row) => acc + (row.montant ?? 0), 0);
}

/** Clé de regroupement : ignore casse, accents, ponctuation et espaces multiples. */
function normalizeSupplierKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pickDisplayName(current: string, candidate: string): string {
  const a = current.trim();
  const b = candidate.trim();
  if (!a) return b;
  if (!b) return a;
  if (b.length < a.length) return b;
  return a;
}

export default function FacturesSoaPage() {
  const { can } = usePermissions();
  const canEdit = can(MENU, 'edit') || can(MENU_FACTURES, 'edit');
  const canDelete = can(MENU, 'delete') || can(MENU_FACTURES, 'delete');

  const [factures, setFactures] = useState<FactureSuivi[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<SoaCard>('unpaid');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    facture: FactureSuivi;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<FactureSuiviInput | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resFactures, resFournisseurs] = await Promise.all([
        fetch('/api/factures-suivi'),
        fetch('/api/fournisseurs'),
      ]);
      const dataFactures = await resFactures.json();
      const dataFournisseurs = await resFournisseurs.json();
      if (!resFactures.ok) {
        await showError(dataFactures?.error || 'Chargement des factures impossible');
        setFactures([]);
      } else {
        const list = Array.isArray(dataFactures?.factures)
          ? dataFactures.factures
          : Array.isArray(dataFactures)
            ? dataFactures
            : [];
        setFactures(list);
      }
      if (!resFournisseurs.ok) {
        setFournisseurs([]);
      } else {
        setFournisseurs(Array.isArray(dataFournisseurs) ? dataFournisseurs : []);
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
      setFactures([]);
      setFournisseurs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const suppliers = useMemo(() => {
    const byKey = new Map<string, SupplierRow>();
    const catalogByKey = new Map<string, Fournisseur>();

    for (const f of fournisseurs) {
      const nom = f.nom.trim();
      if (!nom) continue;
      const key = normalizeSupplierKey(nom);
      if (!key) continue;
      const existing = catalogByKey.get(key);
      if (!existing || nom.length < existing.nom.length) {
        catalogByKey.set(key, f);
      }
    }

    for (const facture of factures) {
      const rawNom = (facture.societe || '').trim() || 'Sans fournisseur';
      const key = normalizeSupplierKey(rawNom) || 'sans fournisseur';
      const catalog = catalogByKey.get(key);
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          nom: catalog?.nom?.trim() || rawNom,
          natureService: catalog?.natureService || '',
          factures: [],
          unpaid: [],
          paid: [],
          solde: 0,
        };
        byKey.set(key, row);
      } else {
        row.nom = pickDisplayName(row.nom, catalog?.nom?.trim() || rawNom);
        if (!row.natureService && catalog?.natureService) {
          row.natureService = catalog.natureService;
        }
      }
      row.factures.push(facture);
      if (facture.statut === 'paid') row.paid.push(facture);
      else row.unpaid.push(facture);
    }

    return [...byKey.values()]
      .map((row) => ({
        ...row,
        solde: sumMontant(row.unpaid),
        unpaid: [...row.unpaid].sort((a, b) => (a.echeance || '').localeCompare(b.echeance || '')),
        paid: [...row.paid].sort((a, b) =>
          (b.datePym || b.date || '').localeCompare(a.datePym || a.date || ''),
        ),
      }))
      .sort((a, b) => b.solde - a.solde || a.nom.localeCompare(b.nom, 'fr'));
  }, [factures, fournisseurs]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const hay = `${s.nom} ${s.natureService}`.toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, search]);

  useEffect(() => {
    if (filteredSuppliers.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !filteredSuppliers.some((s) => s.key === selectedKey)) {
      setSelectedKey(filteredSuppliers[0].key);
    }
  }, [filteredSuppliers, selectedKey]);

  const selected = filteredSuppliers.find((s) => s.key === selectedKey) ?? null;
  const tableRows = selected
    ? activeCard === 'paid'
      ? selected.paid
      : selected.unpaid
    : [];
  const tableTitle = activeCard === 'paid' ? 'Payées' : 'Non payées';

  const applyLocalUpdate = (updated: FactureSuivi) => {
    setFactures((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
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
    applyLocalUpdate(json as FactureSuivi);
    void load(true);
  };

  const handleDelete = async (facture: FactureSuivi) => {
    if (!(await confirmDelete('Supprimer cette facture ?', facture.facture))) return;
    const res = await fetch(`/api/factures-suivi?id=${encodeURIComponent(facture.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await showError((json as { error?: string }).error || 'Suppression impossible');
      return;
    }
    setFactures((prev) => prev.filter((f) => f.id !== facture.id));
    await load(true);
  };

  const openEdit = (facture: FactureSuivi) => {
    setEditForm({ ...facture });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editForm?.id || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/factures-suivi', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError((json as { error?: string }).error || 'Modification impossible');
        return;
      }
      applyLocalUpdate(json as FactureSuivi);
      setEditOpen(false);
      setEditForm(null);
      await showSuccess('Facture mise à jour');
      void load(true);
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Chargement SOA…</p>
      </div>
    );
  }

  return (
    <PermissionGate menuId={MENU} action="view">
      <div className="factures-soa-page">
        <div className="page-header factures-soa-sticky">
          <div className="page-header-title-row">
            <h2>SOA — Relevé fournisseur</h2>
            <RefreshButton loading={refreshing} onClick={() => void load(true)} />
          </div>
          <p className="factures-soa-subtitle">
            {suppliers.length} fournisseur{suppliers.length > 1 ? 's' : ''} · {factures.length} facture
            {factures.length > 1 ? 's' : ''}
            {canEdit ? ' · Double-clic PR / PO / Payment pour modifier (+ date)' : ''}
          </p>
        </div>

        <div className="factures-soa-layout">
          <aside className="factures-soa-sidebar panel">
            <div className="factures-soa-sidebar-head">
              <h3>Fournisseurs</h3>
              <input
                type="search"
                className="search-input"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="factures-soa-supplier-list">
              {filteredSuppliers.length === 0 ? (
                <p className="empty-state">Aucun fournisseur avec factures.</p>
              ) : (
                filteredSuppliers.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`factures-soa-supplier-card${selectedKey === s.key ? ' is-active' : ''}`}
                    onClick={() => {
                      setSelectedKey(s.key);
                      setActiveCard(s.unpaid.length > 0 ? 'unpaid' : 'paid');
                    }}
                  >
                    <div className="factures-soa-supplier-top">
                      <span className="factures-soa-supplier-name">{s.nom}</span>
                      <span className="factures-soa-supplier-badge">{s.factures.length}</span>
                    </div>
                    <div className="factures-soa-supplier-solde">
                      Solde {formatUsdLike(s.solde)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="factures-soa-main">
            {!selected ? (
              <div className="panel factures-soa-empty">
                <p className="empty-state">Sélectionnez un fournisseur.</p>
              </div>
            ) : (
              <>
                <div className="factures-soa-main-head">
                  <h3>{selected.nom}</h3>
                </div>

                <div className="factures-soa-cards">
                  <button
                    type="button"
                    className={`factures-soa-status-card is-unpaid${activeCard === 'unpaid' ? ' is-active' : ''}`}
                    onClick={() => setActiveCard('unpaid')}
                  >
                    <span className="factures-soa-status-label">Non payées</span>
                    <strong className="factures-soa-status-count">{selected.unpaid.length}</strong>
                    <span className="factures-soa-status-amount">
                      {formatUsdLike(sumMontant(selected.unpaid))}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`factures-soa-status-card is-paid${activeCard === 'paid' ? ' is-active' : ''}`}
                    onClick={() => setActiveCard('paid')}
                  >
                    <span className="factures-soa-status-label">Payées</span>
                    <strong className="factures-soa-status-count">{selected.paid.length}</strong>
                    <span className="factures-soa-status-amount">
                      {formatUsdLike(sumMontant(selected.paid))}
                    </span>
                  </button>
                </div>

                <div className="panel factures-soa-table-panel">
                  <div className="factures-soa-table-title">
                    Détail — {tableTitle}
                    <span>{tableRows.length}</span>
                  </div>
                  {tableRows.length === 0 ? (
                    <p className="empty-state">Aucune facture dans cette catégorie.</p>
                  ) : (
                    <FacturesSuiviFlatTable
                      factures={tableRows}
                      canEdit={canEdit}
                      onFieldUpdate={handleFieldUpdate}
                      onContextMenu={openContextMenu}
                    />
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        {contextMenu && contextItems.length > 0 && (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextItems}
            onClose={() => setContextMenu(null)}
          />
        )}

        {editOpen && editForm && (
          <div className="modal-overlay open" onClick={() => !saving && setEditOpen(false)}>
            <div className="modal modal-form modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Modifier la facture</h3>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => !saving && setEditOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label>N° Facture</label>
                    <input
                      value={editForm.facture ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, facture: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Société</label>
                    <input
                      value={editForm.societe ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, societe: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Montant</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.montant ?? ''}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          montant: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Date facture</label>
                    <input
                      value={editForm.date ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      placeholder="jj/mm/aaaa"
                    />
                  </div>
                  <div className="form-group">
                    <label>PR</label>
                    <input
                      value={editForm.pr ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, pr: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Date PR</label>
                    <input
                      value={editForm.datePr ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, datePr: e.target.value })}
                      placeholder="jj/mm/aaaa"
                    />
                  </div>
                  <div className="form-group">
                    <label>PO</label>
                    <input
                      value={editForm.po ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, po: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Date PO</label>
                    <input
                      value={editForm.datePo ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, datePo: e.target.value })}
                      placeholder="jj/mm/aaaa"
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment</label>
                    <input
                      value={editForm.payment ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, payment: e.target.value })}
                      placeholder="PAID ou vide"
                    />
                  </div>
                  <div className="form-group">
                    <label>Date paiement</label>
                    <input
                      value={editForm.datePym ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, datePym: e.target.value })}
                      placeholder="jj/mm/aaaa"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setEditOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void handleEditSave()}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}
