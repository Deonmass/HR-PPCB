'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ExitDocsGenerator from '@/components/documents/ExitDocsGenerator';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { ExitIssuedRecord } from '@/lib/exit-docs-log';
import type { Employee } from '@/lib/types';
import { confirmDelete, showError } from '@/lib/swal';

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

function fileNameFromResponse(response: Response, fallback: string): string {
  const header = response.headers.get('X-File-Name');
  if (header) {
    try {
      return decodeURIComponent(header);
    } catch {
      return fallback;
    }
  }
  return fallback;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    record: ExitIssuedRecord;
  } | null>(null);

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

  const handleDeleteIssued = useCallback(
    async (record: ExitIssuedRecord) => {
      const confirmed = await confirmDelete(
        'Supprimer cette entrée ?',
        `${record.docLabel} — ${record.employeeName}`,
      );
      if (!confirmed) return;
      setDeletingId(record.id);
      try {
        const res = await fetch(`/api/documents/exit?id=${encodeURIComponent(record.id)}`, {
          method: 'DELETE',
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          await showError(json.error || 'Suppression impossible');
          return;
        }
        await loadIssued(true);
      } catch {
        await showError('Suppression impossible');
      } finally {
        setDeletingId(null);
      }
    },
    [loadIssued],
  );

  const handleViewDocument = useCallback(async (record: ExitIssuedRecord) => {
    setViewingId(record.id);
    try {
      const res = await fetch('/api/documents/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: record.matricule,
          doc: record.doc,
          skipIssuedLog: true,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || 'Impossible d’ouvrir le document');
      }
      const blob = await res.blob();
      const fileName = fileNameFromResponse(res, record.fileName);
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Impossible d’ouvrir le document');
    } finally {
      setViewingId(null);
    }
  }, []);

  const getContextMenuItems = useCallback(
    (record: ExitIssuedRecord): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];
      if (can('documents.exit', 'view') && (can('documents.exit', 'create') || can('documents.exit', 'export'))) {
        items.push({
          id: 'view',
          label: 'Voir le document',
          icon: 'view',
          onClick: () => void handleViewDocument(record),
        });
      }
      if (
        can('documents.exit', 'delete') ||
        can('documents.exit', 'edit') ||
        can('documents.exit', 'create')
      ) {
        items.push({
          id: 'delete',
          label: 'Supprimer',
          icon: 'delete',
          danger: true,
          onClick: () => void handleDeleteIssued(record),
        });
      }
      return items;
    },
    [can, handleDeleteIssued, handleViewDocument],
  );

  const contextMenuItems = useMemo(
    () => (contextMenu ? getContextMenuItems(contextMenu.record) : []),
    [contextMenu, getContextMenuItems],
  );

  if (isLoading || loading) return <div className="loading">Chargement...</div>;

  if (!can('documents.exit', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès aux documents d’exit.</p>;
  }

  const canCreate = can('documents.exit', 'create');
  const rowBusy = (id: string) => deletingId === id || viewingId === id;

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
            <>
              <p className="exit-issued-hint muted">
                Clic droit sur une ligne : voir le document ou supprimer l’entrée de l’historique.
              </p>
              <div className="table-wrap exit-issued-table-wrap">
                <table className="travel-history-table exit-issued-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Agent</th>
                      <th>Document</th>
                      <th className="exit-issued-file-col">Fichier</th>
                      <th>Émis par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issued.map((record) => (
                      <tr
                        key={record.id}
                        className={`travel-history-data-row exit-issued-data-row${rowBusy(record.id) ? ' exit-issued-row-busy' : ''}`}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          const items = getContextMenuItems(record);
                          if (items.length === 0) return;
                          setContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            record,
                          });
                        }}
                      >
                        <td>{formatDateTime(record.createdAt)}</td>
                        <td>
                          {record.employeeName}
                          {record.matricule ? ` (${record.matricule})` : ''}
                        </td>
                        <td>{record.docLabel}</td>
                        <td className="exit-issued-file-col" title={record.fileName}>
                          {record.fileName}
                        </td>
                        <td>{record.issuedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {contextMenu && contextMenuItems.length > 0 && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
