'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ExitDocsGenerator from '@/components/documents/ExitDocsGenerator';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import type { ExitIssuedRecord } from '@/lib/exit-docs-log';
import type { Employee } from '@/lib/types';

type Tab = 'form' | 'issued';

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ExitDocsPage() {
  const { can, isLoading } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [tab, setTab] = useState<Tab>('form');
  const [issued, setIssued] = useState<ExitIssuedRecord[]>([]);
  const [issuedLoading, setIssuedLoading] = useState(true);
  const [issuedRefreshing, setIssuedRefreshing] = useState(false);
  const [issuedError, setIssuedError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(Array.isArray(json) ? json : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);

  const loadIssued = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIssuedRefreshing(true);
    else setIssuedLoading(true);
    setIssuedError(null);
    try {
      const res = await fetch('/api/documents/exit');
      const json = await res.json();
      if (!res.ok) {
        setIssued([]);
        setIssuedError(json.error || 'Erreur de chargement');
        return;
      }
      setIssued(Array.isArray(json) ? (json as ExitIssuedRecord[]) : []);
    } catch {
      setIssued([]);
      setIssuedError('Erreur de chargement');
    } finally {
      setIssuedLoading(false);
      setIssuedRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadIssued();
  }, [loadIssued]);

  if (isLoading || loading) return <div className="loading">Chargement...</div>;

  if (!can('documents.exit', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès aux documents d’exit.</p>;
  }

  const canCreate = can('documents.exit', 'create');

  return (
    <>
      <div className="page-header page-header-with-tabs">
        <div>
          <div className="page-header-title-row">
            <h2>Exit forms</h2>
            <RefreshButton onClick={() => void loadIssued(true)} loading={issuedRefreshing} />
          </div>
          <p>
            Clearance, exit interview, attestation de fin de service et user removal — remplis
            automatiquement depuis la fiche de l’agent.
          </p>
        </div>
        <div className="travel-history-header-actions">
          <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
            ← Documents
          </Link>
          <div className="tabs header-tabs header-tabs-dashboard header-tabs-compact">
            {canCreate && (
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === 'form' ? ' active' : ''}`}
                onClick={() => setTab('form')}
              >
                Formulaire
              </button>
            )}
            <button
              type="button"
              className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === 'issued' ? ' active' : ''}`}
              onClick={() => setTab('issued')}
            >
              Documents émis
              {!issuedLoading && !issuedError && ` (${issued.length})`}
            </button>
          </div>
        </div>
      </div>

      {tab === 'form' && (
        <div className="panel docs-generator-panel">
          <div className="form-group docs-generator-picker">
            <label>Agent concerné</label>
            <EmployeeSuggestInput
              employees={employees}
              value={query}
              onChange={(value) => {
                setQuery(value);
                if (selected && value !== selected.nom) setSelected(null);
              }}
              onEmployeeSelect={(employee) => {
                setSelected(employee);
                setQuery(employee.nom);
              }}
              placeholder="Rechercher un agent (nom ou matricule)…"
            />
          </div>

          {selected ? (
            canCreate ? (
              <ExitDocsGenerator employee={selected} onGenerated={() => void loadIssued(true)} />
            ) : (
              <p className="docs-hub-empty">
                Vous n’avez pas la permission de générer ces documents.
              </p>
            )
          ) : (
            <p className="docs-generator-placeholder">
              Sélectionnez un agent pour préparer ses documents d’exit.
            </p>
          )}
        </div>
      )}

      {tab === 'issued' && (
        <div className="panel">
          {issuedError && <div className="alert alert-danger">{issuedError}</div>}
          {issuedLoading ? (
            <div className="loading">Chargement...</div>
          ) : issued.length === 0 ? (
            <p className="empty-state">
              Aucun document d’exit émis pour le moment.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="travel-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Agent</th>
                    <th>Document</th>
                    <th>Fichier</th>
                    <th>Émis par</th>
                  </tr>
                </thead>
                <tbody>
                  {issued.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDateTime(record.createdAt)}</td>
                      <td>
                        {record.employeeName}
                        {record.matricule ? ` (${record.matricule})` : ''}
                      </td>
                      <td>{record.docLabel}</td>
                      <td>{record.fileName}</td>
                      <td>{record.issuedBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
