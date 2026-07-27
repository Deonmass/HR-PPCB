'use client';

import { useMemo, useRef, useState } from 'react';
import type { PactilisCompareResult, PactilisDiffRow } from '@/lib/dependants-pactilis-compare';
import {
  downloadPactilisDiffExcel,
  downloadPactilisDiffPdf,
} from '@/lib/dependants-pactilis-export';
import { confirmAction, showError, showSuccess } from '@/lib/swal';

interface Props {
  open: boolean;
  onClose: () => void;
  onConsolidated?: () => void;
}

type DiffTab = 'matched' | 'pactilis' | 'locale';

function matchesSearch(row: PactilisDiffRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.pactilis,
    row.pactilisFromFile,
    row.matricule,
    row.statut,
    row.sexe,
    row.nom,
    row.dateNaissance,
    row.employeNom,
    row.departement,
    row.matchKind,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export default function PactilisVerifyModal({ open, onClose, onConsolidated }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [result, setResult] = useState<PactilisCompareResult | null>(null);
  const [diffTab, setDiffTab] = useState<DiffTab>('matched');
  const [search, setSearch] = useState('');

  const sourceRows = useMemo(() => {
    if (!result) return [];
    if (diffTab === 'matched') return result.matched ?? [];
    if (diffTab === 'pactilis') return result.onlyInPactilis;
    return result.onlyInLocale;
  }, [result, diffTab]);

  const rows = useMemo(
    () => sourceRows.filter((row) => matchesSearch(row, search)),
    [sourceRows, search],
  );

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setResult(null);
    setDiffTab('matched');
    setSearch('');
    setExporting(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleVerify = async () => {
    if (!file) {
      await showError('Sélectionnez le fichier extract Pactilis (.xlsx)');
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', 'compare');
      const res = await fetch('/api/dependants/verify-pactilis', {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as PactilisCompareResult & { error?: string };
      if (!res.ok) {
        await showError(json.error || 'Vérification impossible');
        return;
      }
      setResult(json);
      setSearch('');
      setDiffTab('matched');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Vérification impossible');
    } finally {
      setLoading(false);
    }
  };

  const handleConsolidate = async () => {
    if (!file || !result) return;
    const gaps = result.onlyInPactilis.length;
    const toAssign = result.pactilisToAssignCount ?? 0;
    if (!gaps && !toAssign) {
      await showError('Aucun écart à consolider (rien à ajouter ni N° Pactilis à affecter).');
      return;
    }
    const ok = await confirmAction(
      'Consolider dans la base locale ?',
      `${toAssign} N° Pactilis à affecter · ${gaps} personne(s) à ajouter.\n`
        + 'Les noms déjà présents ne seront pas dupliqués.',
      'Consolider',
    );
    if (!ok) return;

    setConsolidating(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', 'consolidate');
      const res = await fetch('/api/dependants/verify-pactilis', {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as {
        error?: string;
        created?: number;
        updatedPactilis?: number;
        skippedDuplicates?: number;
        skippedNoMatricule?: number;
        compare?: PactilisCompareResult;
      };
      if (!res.ok) {
        await showError(json.error || 'Consolidation impossible');
        return;
      }
      if (json.compare) setResult(json.compare);
      onConsolidated?.();
      await showSuccess(
        `${json.updatedPactilis ?? 0} N° Pactilis affecté(s) · `
          + `${json.created ?? 0} ajouté(s) · `
          + `${json.skippedDuplicates ?? 0} doublon(s) évité(s) · `
          + `${json.skippedNoMatricule ?? 0} sans matricule RH`,
      );
      setDiffTab('matched');
      setSearch('');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Consolidation impossible');
    } finally {
      setConsolidating(false);
    }
  };

  const handleExportExcel = () => {
    if (!result) return;
    setExporting('xlsx');
    try {
      downloadPactilisDiffExcel(result);
    } catch (err) {
      void showError(err instanceof Error ? err.message : 'Export Excel impossible');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (!result) return;
    setExporting('pdf');
    try {
      await downloadPactilisDiffPdf(result);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export PDF impossible');
    } finally {
      setExporting(null);
    }
  };

  const showMatricule = diffTab === 'locale' || diffTab === 'matched';
  const showMatchKind = diffTab === 'matched';
  const colSpan = 5 + (showMatricule ? 1 : 0) + (showMatchKind ? 1 : 0) + (diffTab === 'locale' ? 1 : 0);

  return (
    <div className="modal-overlay open" onClick={handleClose}>
      <div
        className="modal modal-form pactilis-verify-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Vérifier la liste Pactilis</h3>
          <button type="button" className="modal-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {!result ? (
            <>
              <p className="factures-suivi-assign-hint">
                Importez l&apos;extract (
                <strong>Etat_PPC_ASSURESDEPENDANTS</strong>).
                Correspondance : <strong>N° Pactilis</strong> en priorité, sinon par <strong>nom</strong>.
                La consolidation affecte le N° Pactilis manquant et ajoute les absents
                (sans doublon de nom).
              </p>
              <div className="form-group">
                <label>Fichier extract Pactilis</label>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {file ? (
                <p className="factures-suivi-toolbar-meta">Fichier : {file.name}</p>
              ) : null}
            </>
          ) : (
            <>
              <div className="travel-history-cards pactilis-verify-kpis">
                <div className="card card-glow card-glow-cyan travel-history-card">
                  <div className="card-label">Pactilis</div>
                  <div className="card-value">{result.pactilisCount}</div>
                </div>
                <div className="card card-glow card-glow-violet travel-history-card">
                  <div className="card-label">Base locale</div>
                  <div className="card-value">{result.localeCount}</div>
                </div>
                <div className="card card-glow card-glow-green travel-history-card">
                  <div className="card-label">Correspondances</div>
                  <div className="card-value">{result.matchedCount}</div>
                </div>
                <div className="card card-glow card-glow-amber travel-history-card">
                  <div className="card-label">Écarts</div>
                  <div className="card-value">
                    {result.onlyInPactilis.length + result.onlyInLocale.length}
                  </div>
                </div>
              </div>

              <p className="dependants-header-sub" style={{ marginTop: '0.75rem' }}>
                Fichier : <strong>{result.fileName}</strong>
                {(result.pactilisToAssignCount ?? 0) > 0 ? (
                  <> · <strong>{result.pactilisToAssignCount}</strong> N° Pactilis à affecter</>
                ) : null}
              </p>

              <div className="pactilis-verify-toolbar">
                <div className="tabs header-tabs header-tabs-compact pactilis-verify-tabs">
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${diffTab === 'matched' ? ' active' : ''}`}
                    onClick={() => setDiffTab('matched')}
                  >
                    Correspondances ({result.matchedCount})
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${diffTab === 'pactilis' ? ' active' : ''}`}
                    onClick={() => setDiffTab('pactilis')}
                  >
                    Uniquement Pactilis ({result.onlyInPactilis.length})
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${diffTab === 'locale' ? ' active' : ''}`}
                    onClick={() => setDiffTab('locale')}
                  >
                    Uniquement base locale ({result.onlyInLocale.length})
                  </button>
                </div>
                <div className="pactilis-verify-search">
                  <input
                    type="search"
                    className="input"
                    placeholder="Rechercher (nom, N° Pactilis, matricule…)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Rechercher dans les écarts"
                  />
                </div>
              </div>

              <p className="pactilis-verify-filter-meta">
                {rows.length} / {sourceRows.length} résultat(s)
              </p>

              <div className="dependants-table-wrap pactilis-verify-table-wrap">
                <table className="dependants-table">
                  <thead>
                    <tr>
                      <th>N° Pactilis</th>
                      {showMatricule ? <th>Matricule RH</th> : null}
                      <th>Statut</th>
                      <th>Sexe</th>
                      <th>Nom et Prénoms</th>
                      <th>Date naissance</th>
                      {showMatchKind ? <th>Correspondance</th> : null}
                      {diffTab === 'locale' ? <th>Employé</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map((row, idx) => (
                        <tr
                          key={`${row.pactilis}-${row.nom}-${idx}`}
                          className={row.needsPactilisAssign ? 'pactilis-row-needs-assign' : undefined}
                        >
                          <td>
                            {row.pactilisFromFile || row.pactilis || '—'}
                            {row.needsPactilisAssign ? (
                              <span className="pactilis-assign-badge" title="N° Pactilis à affecter en base">
                                {' '}à affecter
                              </span>
                            ) : null}
                          </td>
                          {showMatricule ? <td>{row.matricule || '—'}</td> : null}
                          <td>{row.statut || '—'}</td>
                          <td>{row.sexe || '—'}</td>
                          <td>{row.nom || '—'}</td>
                          <td>{row.dateNaissance || '—'}</td>
                          {showMatchKind ? (
                            <td>
                              {row.matchKind === 'nom'
                                ? 'Par nom'
                                : row.matchKind === 'pactilis'
                                  ? 'Par N° Pactilis'
                                  : '—'}
                            </td>
                          ) : null}
                          {diffTab === 'locale' ? <td>{row.employeNom || '—'}</td> : null}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={colSpan} className="empty-cell">
                          {search.trim()
                            ? 'Aucun résultat pour cette recherche.'
                            : 'Aucun élément pour cette vue.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer pactilis-verify-footer">
          {!result ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleClose}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || !file}
                onClick={() => void handleVerify()}
              >
                {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {loading ? 'Vérification…' : 'Comparer'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Nouveau fichier
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!!exporting || consolidating}
                onClick={handleExportExcel}
              >
                {exporting === 'xlsx' ? 'Excel…' : 'Télécharger Excel'}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!!exporting || consolidating}
                onClick={() => void handleExportPdf()}
              >
                {exporting === 'pdf' ? 'PDF…' : 'Télécharger PDF'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={consolidating || loading}
                onClick={() => void handleConsolidate()}
                title="Affecter les N° Pactilis manquants et ajouter les absents (sans doublon de nom)"
              >
                {consolidating ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {consolidating ? 'Consolidation…' : 'Consolider dans la base locale'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleClose}>
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
