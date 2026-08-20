'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import ActionButtons from '@/components/ActionButtons';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import MissionOrderHistoryTable from '@/components/travel/MissionOrderHistoryTable';
import { usePermissions } from '@/contexts/PermissionContext';
import type { MissionOrderHistoryRow } from '@/lib/mission-order-history-types';
import { confirmDelete, showError } from '@/lib/swal';
import { SINGLE_TRAVEL_DOCS, type SingleTravelDocId } from '@/lib/travel-single-doc';
import { MISSION_SITES, type MissionSiteId } from '@/lib/travel-mission-sites';
import type { CashRequestRecord, TravelGeneratedFile } from '@/lib/travel-types';

const EtablirTravelForm = dynamic(() => import('@/components/travel/EtablirTravelForm'), {
  ssr: false,
  loading: () => <div className="loading">Chargement...</div>,
});

type Tab = 'form' | 'issued' | MissionSiteId;

interface IssuedRow {
  id: string;
  createdAt: string;
  missionRef?: string;
  employeeName: string;
  file: TravelGeneratedFile;
}

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

export default function TravelSingleDocClient({ doc }: { doc: SingleTravelDocId }) {
  const config = SINGLE_TRAVEL_DOCS[doc];
  const router = useRouter();
  const { can } = usePermissions();
  const isMissionOrder = doc === 'mission-order';
  const visibleSites = useMemo(() => {
    const fromMenus = MISSION_SITES.filter((site) => can(site.menuId, 'view'));
    if (fromMenus.length) return fromMenus;
    if (can('travel.etablir', 'view')) return [...MISSION_SITES];
    return [];
  }, [can]);
  const canCreate =
    can('travel.etablir', 'create')
    || visibleSites.some((site) => can(site.menuId, 'create'));
  const canEdit =
    can('travel.etablir', 'edit')
    || visibleSites.some((site) => can(site.menuId, 'edit'));
  const canDelete =
    can('travel.etablir', 'delete')
    || can('travel.historique', 'delete')
    || visibleSites.some((site) => can(site.menuId, 'delete'));
  const [tab, setTab] = useState<Tab>(
    canCreate ? 'form' : isMissionOrder ? (visibleSites[0]?.id ?? 'issued') : 'issued',
  );
  const [records, setRecords] = useState<CashRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadIssued = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/travel/cash-requests');
      const json = await res.json();
      if (!res.ok) {
        setRecords([]);
        setError(json.error || 'Erreur de chargement');
        return;
      }
      setRecords(Array.isArray(json) ? (json as CashRequestRecord[]) : []);
    } catch {
      setRecords([]);
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isMissionOrder) void loadIssued();
  }, [loadIssued, isMissionOrder]);

  const handleMissionOrderEdit = (row: MissionOrderHistoryRow) => {
    if (!row.missionRef || !row.recordId) return;
    router.push(
      `/documents-voyage/document/${doc}?ref=${encodeURIComponent(row.missionRef)}`,
    );
    setTab('form');
  };

  const handleEdit = (row: IssuedRow) => {
    if (!row.missionRef) return;
    router.push(
      `/documents-voyage/document/${doc}?ref=${encodeURIComponent(row.missionRef)}`,
    );
    setTab('form');
  };

  const handleDelete = async (row: IssuedRow) => {
    if (deletingId) return;
    const confirmed = await confirmDelete(
      'Supprimer ce document ?',
      `${row.file.fileName} — ${row.employeeName}`,
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/travel/cash-requests/${encodeURIComponent(row.id)}`, {
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
  };

  const issuedRows = useMemo<IssuedRow[]>(
    () =>
      records
        .flatMap((record) => {
          const file = record.files?.find((item) => item.type === doc);
          if (!file) return [];
          return [
            {
              id: record.id,
              createdAt: record.createdAt,
              missionRef: record.missionRef,
              employeeName: record.employeeName,
              file,
            },
          ];
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [records, doc],
  );

  const siteTab = isMissionOrder && tab !== 'form' && tab !== 'issued' ? tab : null;

  return (
    <PermissionGate
      anyOf={
        isMissionOrder
          ? [
              { menuId: 'travel.etablir', action: 'view' },
              ...MISSION_SITES.map((site) => ({ menuId: site.menuId, action: 'view' as const })),
            ]
          : [{ menuId: 'travel.etablir', action: 'view' }]
      }
    >
      <div className="travel-history-page">
        <div className="travel-history-sticky">
          <div className="page-header page-header-with-tabs travel-history-header">
            <div>
              <div className="page-header-title-row">
                <h2>{config.label}</h2>
                {!isMissionOrder && (
                  <RefreshButton onClick={() => void loadIssued(true)} loading={refreshing} />
                )}
              </div>
              <p>{config.description}</p>
            </div>
            <div className="travel-history-header-actions">
              <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
                ← Documents
              </Link>
              <div className="tabs header-tabs header-tabs-dashboard header-tabs-compact travel-history-tabs">
                {canCreate && (
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === 'form' ? ' active' : ''}`}
                    onClick={() => setTab('form')}
                  >
                    Formulaire
                  </button>
                )}
                {isMissionOrder
                  ? visibleSites.map((site) => (
                      <button
                        key={site.id}
                        type="button"
                        className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === site.id ? ' active' : ''}`}
                        onClick={() => setTab(site.id)}
                      >
                        {site.label}
                      </button>
                    ))
                  : (
                    <button
                      type="button"
                      className={`tab-btn tab-btn-sm tab-btn-dashboard${tab === 'issued' ? ' active' : ''}`}
                      onClick={() => setTab('issued')}
                    >
                      Documents émis
                      {!loading && !error && ` (${issuedRows.length})`}
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>

        <div className="travel-history-body">
          {tab === 'form' && canCreate && (
            <Suspense fallback={<div className="loading">Chargement...</div>}>
              <EtablirTravelForm singleDoc={doc} />
            </Suspense>
          )}

          {siteTab && (
            <div className="panel">
              <MissionOrderHistoryTable
                site={siteTab}
                canEdit={canEdit}
                canDelete={canDelete || can(MISSION_SITES.find((s) => s.id === siteTab)?.menuId ?? '', 'delete')}
                onEdit={handleMissionOrderEdit}
              />
            </div>
          )}

          {tab === 'issued' && !isMissionOrder && (
            <div className="panel">
              {error && <div className="alert alert-danger">{error}</div>}
              {loading ? (
                <div className="loading">Chargement...</div>
              ) : issuedRows.length === 0 ? (
                <p className="empty-state">
                  Aucun document émis pour le moment. Utilisez l&apos;onglet Formulaire pour en générer un.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="travel-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Réf. mission</th>
                        <th>Employé</th>
                        <th>Fichier</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {issuedRows.map((row) => (
                        <tr key={`${row.id}-${row.file.fileName}`}>
                          <td>{formatDateTime(row.createdAt)}</td>
                          <td>{row.missionRef || '—'}</td>
                          <td>{row.employeeName}</td>
                          <td>{row.file.fileName}</td>
                          <td>
                            <ActionButtons
                              canEdit={canEdit && Boolean(row.missionRef)}
                              canDelete={canDelete}
                              deleting={deletingId === row.id}
                              onEdit={() => handleEdit(row)}
                              onDelete={() => void handleDelete(row)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PermissionGate>
  );
}
