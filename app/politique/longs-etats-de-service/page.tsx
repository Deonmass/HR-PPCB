'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PermissionGate from '@/components/PermissionGate';
import {
  formatChequeValue,
  formatIncentive,
  isLongServiceDue5Or10,
  LONG_SERVICE_PALIERS,
  LONG_SERVICE_POLICY,
  type LongServiceBeneficiary,
} from '@/lib/politique-longs-etats';
import { showError } from '@/lib/swal';

const PDF_SRC = '/api/politique/longs-etats?mode=pdf';
const PDF_DOWNLOAD = '/api/politique/longs-etats?mode=pdf&download=1';

const DUE_5_OR_10 = 'due-5-10';
type PalierFilter = number | 'all' | typeof DUE_5_OR_10;

export default function LongsEtatsDeServicePage() {
  const [rows, setRows] = useState<LongServiceBeneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [palierFilter, setPalierFilter] = useState<PalierFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/politique/longs-etats');
      const data = await res.json();
      if (!res.ok) {
        await showError(data?.error || 'Chargement impossible');
        setRows([]);
      } else {
        setRows(Array.isArray(data.beneficiaires) ? data.beneficiaires : []);
      }
    } catch {
      await showError('Chargement impossible');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (palierFilter === DUE_5_OR_10) {
        if (!isLongServiceDue5Or10(row.years, row.months)) return false;
      } else if (palierFilter !== 'all' && row.palier.years !== palierFilter) {
        return false;
      }
      if (!q) return true;
      return [row.matricule, row.nom, row.departement, row.localisation]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, palierFilter]);

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(row.palier.years, (map.get(row.palier.years) || 0) + 1);
    }
    return map;
  }, [rows]);

  const due5Or10Count = useMemo(
    () => rows.filter((row) => isLongServiceDue5Or10(row.years, row.months)).length,
    [rows],
  );

  return (
    <PermissionGate
      menuId="politique.longs-etats"
      action="view"
      fallback={<p className="docs-hub-empty">Vous n’avez pas accès à cette politique.</p>}
    >
      <div className="convention-page politique-page">
        <header className="convention-topbar">
          <div>
            <h2>{LONG_SERVICE_POLICY.title}</h2>
            <p className="politique-sub">
              Palier le plus élevé atteint · {rows.length} bénéficiaire{rows.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="page-header-actions">
            <a
              className="btn btn-primary btn-sm"
              href={PDF_DOWNLOAD}
              download={LONG_SERVICE_POLICY.filename}
            >
              Télécharger
            </a>
            <a className="btn btn-secondary btn-sm" href={PDF_SRC} target="_blank" rel="noreferrer">
              Ouvrir le PDF
            </a>
            <Link href="/politique" className="btn btn-secondary btn-sm" prefetch={false}>
              ← Politique
            </Link>
          </div>
        </header>

        <div className="politique-layout">
          <aside className="politique-col-list panel">
            <div className="politique-list-toolbar">
              <input
                type="search"
                className="search-input"
                placeholder="Matricule, nom, département…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Rechercher un bénéficiaire"
              />
              <select
                className="filter-select filter-select-sm"
                value={typeof palierFilter === 'number' ? String(palierFilter) : palierFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'all' || v === DUE_5_OR_10) {
                    setPalierFilter(v);
                    return;
                  }
                  setPalierFilter(Number(v));
                }}
              >
                <option value="all">Tous les paliers ({rows.length})</option>
                <option value={DUE_5_OR_10}>
                  5 et 10 ans — 0 mois ({due5Or10Count})
                </option>
                {LONG_SERVICE_PALIERS.map((p) => (
                  <option key={p.years} value={p.years}>
                    {p.years} ans ({counts.get(p.years) || 0})
                  </option>
                ))}
              </select>
            </div>
            <p className="politique-list-meta">
              {filtered.length} agent{filtered.length > 1 ? 's' : ''}
            </p>
            <div className="politique-table-wrap">
              {loading ? (
                <p className="empty-state">Chargement des bénéficiaires…</p>
              ) : filtered.length === 0 ? (
                <p className="empty-state">
                  {palierFilter === DUE_5_OR_10
                    ? 'Aucun agent à 5 ou 10 ans pile ce mois-ci (0 mois).'
                    : 'Aucun agent pour ce palier.'}
                </p>
              ) : (
                <table className="data-table politique-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Palier</th>
                      <th>Avantages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.matricule}
                        className={row.months === 0 ? 'politique-row-zero-mois' : undefined}
                      >
                        <td>
                          <strong>{row.nom}</strong>
                          <span className="politique-row-meta">
                            {row.matricule} · {row.departement || '—'}
                          </span>
                          <span className="politique-row-meta">
                            {row.years} an(s) ({row.months} mois)
                          </span>
                        </td>
                        <td>
                          <span className="politique-palier">
                            {row.palier.years} ans ({row.months} mois)
                          </span>
                        </td>
                        <td>
                          <span className="politique-row-meta">
                            {row.palier.sacs} sacs · {formatChequeValue(row.palier.cheque)}
                          </span>
                          <span className="politique-row-meta">
                            Incitatif {formatIncentive(row.palier.incentivePct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </aside>

          <section className="politique-col-pdf panel">
            <div className="convention-pdf-toolbar">
              <div className="convention-pdf-toolbar-text">
                <h3>Aperçu PDF</h3>
                <p className="convention-col-meta">Politique officielle — visualisation</p>
              </div>
            </div>
            <div className="convention-pdf-viewport">
              <iframe className="convention-pdf-iframe" title={LONG_SERVICE_POLICY.title} src={PDF_SRC} />
            </div>
          </section>
        </div>
      </div>
    </PermissionGate>
  );
}
