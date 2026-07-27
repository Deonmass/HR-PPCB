'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import type { Fournisseur } from '@/lib/fournisseurs-types';
import type { FactureSuivi } from '@/lib/factures-fournisseurs/types';
import { formatUsdLike } from '@/lib/factures-fournisseurs/utils';
import { showError } from '@/lib/swal';

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
  // Préfère la forme la plus « propre » (plus courte sans espaces inutiles).
  if (b.length < a.length) return b;
  return a;
}

export default function FacturesSoaPage() {
  const [factures, setFactures] = useState<FactureSuivi[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<SoaCard>('unpaid');

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

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Chargement SOA…</p>
      </div>
    );
  }

  return (
    <PermissionGate menuId="factures.fournisseur.soa" action="view">
    <div className="factures-soa-page">
      <div className="page-header factures-soa-sticky">
        <div className="page-header-title-row">
          <h2>SOA — Relevé fournisseur</h2>
          <RefreshButton loading={refreshing} onClick={() => void load(true)} />
        </div>
        <p className="factures-soa-subtitle">
          {suppliers.length} fournisseur{suppliers.length > 1 ? 's' : ''} · {factures.length} facture
          {factures.length > 1 ? 's' : ''}
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
                    <span className="factures-soa-supplier-badge">
                      {s.factures.length}
                    </span>
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
                  <div className="factures-soa-table-wrap">
                    <table className="factures-soa-table">
                      <thead>
                        <tr>
                          <th className="is-num">#</th>
                          <th>N° Facture</th>
                          <th className="is-date">Date</th>
                          <th className="is-date">Échéance</th>
                          <th className="is-num">Montant</th>
                          <th>PR</th>
                          <th>PO</th>
                          <th>Statut</th>
                          {activeCard === 'paid' ? (
                            <th className="is-date">Paiement</th>
                          ) : (
                            <th className="is-num">Solde</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((f, index) => (
                          <tr key={f.id}>
                            <td className="is-num">{index + 1}</td>
                            <td className="factures-soa-invoice">
                              <strong>{f.facture || '—'}</strong>
                            </td>
                            <td className="is-date">{f.date || '—'}</td>
                            <td className="is-date">{f.echeance || '—'}</td>
                            <td className="is-num">
                              {f.montant != null ? formatUsdLike(f.montant) : '—'}
                            </td>
                            <td className="is-mono">{f.pr || '—'}</td>
                            <td className="is-mono">{f.po || '—'}</td>
                            <td>
                              <span className={`factures-soa-statut-pill is-${f.statut}`}>
                                {f.statutLabel || f.statut}
                              </span>
                            </td>
                            {activeCard === 'paid' ? (
                              <td className="is-date">{f.datePym || '—'}</td>
                            ) : (
                              <td className="is-num">
                                <span className="factures-soa-solde-pill">
                                  {f.montant != null ? formatUsdLike(f.montant) : '—'}
                                </span>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
    </PermissionGate>
  );
}
