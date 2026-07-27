'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import type { CashRequestRecord } from '@/lib/travel-types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CashRequestDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [record, setRecord] = useState<CashRequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/travel/cash-requests/${id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Document introuvable');
        setRecord(null);
        return;
      }
      setRecord(json as CashRequestRecord);
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openFileLocation = async () => {
    if (!record?.filePath) return;
    await fetch('/api/travel/open-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: record.filePath }),
    });
  };

  const openExcelFile = async () => {
    if (!record?.filePath) return;
    await fetch('/api/travel/open-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: record.filePath }),
    });
  };

  useEffect(() => {
    if (!record?.filePath || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    void openExcelFile();
  }, [record?.filePath]);

  if (loading) return <div className="loading">Chargement...</div>;

  if (error || !record) {
    return (
      <>
        <div className="page-header">
          <h2>Document introuvable</h2>
        </div>
        <div className="panel">
          <p className="alert alert-danger">{error || 'Document introuvable'}</p>
          <Link href="/documents-voyage/historique" className="btn btn-secondary">
            Retour à l&apos;historique
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Cash Request — {record.employeeName}</h2>
          <p>
            Enregistré le {formatDate(record.createdAt)}
            {record.filePath ? ` · ${record.filePath}` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/documents-voyage/historique" className="btn btn-secondary">
            Historique
          </Link>
          <PermissionGate menuId="travel.historique" action="export">
            <a
              href={`/api/travel/cash-requests/${id}/download`}
              className="btn btn-secondary"
              download
            >
              Télécharger Excel
            </a>
          </PermissionGate>
          {record.filePath && (
            <>
              <button type="button" className="btn btn-secondary" onClick={openFileLocation}>
                Ouvrir l&apos;emplacement
              </button>
              <button type="button" className="btn btn-primary" onClick={openExcelFile}>
                Ouvrir dans Excel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <p className="form-hint" style={{ marginTop: 0 }}>
          Le fichier Excel conserve la mise en forme du modèle source. Aucune conversion HTML n&apos;est
          appliquée — ouvrez-le directement dans Excel pour la visualisation fidèle.
        </p>

        <div className="form-grid" style={{ marginTop: '1rem' }}>
          <div className="form-group full">
            <label>Cellule D13</label>
            <input value={record.requestorLine} readOnly />
          </div>
          <div className="form-group full">
            <label>Cellule E16 — Objet</label>
            <input value={record.objet} readOnly />
          </div>
          <div className="form-group">
            <label>Cellule D16 — Date</label>
            <input value={record.requestDate || ''} readOnly />
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Ref.</th>
                <th>Goods / Services description</th>
                <th>Currency</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {record.lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.ref}</td>
                  <td>{line.description}</td>
                  <td>{line.currency}</td>
                  <td>{line.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>
                  Total
                </td>
                <td style={{ fontWeight: 700 }}>
                  {record.total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
