'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TravelHistoryDashboardView from '@/components/travel/TravelHistoryDashboardView';
import TravelHistoryDetailModal from '@/components/travel/TravelHistoryDetailModal';
import { IconDashboard, IconDataTable, IconEtablir } from '@/components/travel/TravelVoyageIcons';
import { usePermissions } from '@/contexts/PermissionContext';
import { downloadTravelHistoryExport } from '@/lib/travel-history-export';
import { extractTravelDepartmentName } from '@/lib/travel-history-utils';
import type { TravelHistoryData, TravelHistoryRow } from '@/lib/travel-history-types';
import { confirmDelete, showError } from '@/lib/swal';

type Tab = 'dashboard' | 'data';

function formatDate(value: string): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('fr-FR');
    }
  }
  return value;
}

function formatMoney(value: number): string {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function HistoriqueVoyagesPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [data, setData] = useState<TravelHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<TravelHistoryRow | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: TravelHistoryRow;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/travel/history');
      const json = await res.json();
      if (!res.ok) {
        setData(null);
        setError(json.error || 'Erreur de chargement');
        return;
      }
      setData(json as TravelHistoryData);
    } catch {
      setData(null);
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadTravelHistoryExport();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  };

  const handleView = (row: TravelHistoryRow) => {
    setSelectedRow(row);
  };

  const handleEdit = (row: TravelHistoryRow) => {
    router.push(`/documents-voyage/etablir?ref=${encodeURIComponent(row.ref)}`);
  };

  const handleDelete = async (row: TravelHistoryRow) => {
    const confirmed = await confirmDelete(
      'Supprimer cette mission ?',
      `${row.ref} — ${row.employee}`,
    );
    if (!confirmed) return;

    const params = new URLSearchParams({
      ref: row.ref,
      rowIndex: String(row.rowIndex),
    });

    try {
      const res = await fetch(`/api/travel/history?${params.toString()}`, {
        method: 'DELETE',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showError(json.error || 'Suppression impossible');
        return;
      }
      if (selectedRow?.ref === row.ref) setSelectedRow(null);
      await load(true);
    } catch {
      await showError('Suppression impossible');
    }
  };

  const getContextMenuItems = (row: TravelHistoryRow): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (can('travel.historique', 'view')) {
      items.push({
        id: 'view',
        label: 'Visualiser',
        icon: 'view',
        onClick: () => handleView(row),
      });
    }
    if (can('travel.historique', 'edit')) {
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => handleEdit(row),
      });
    }
    if (can('travel.historique', 'delete')) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => void handleDelete(row),
      });
    }
    return items;
  };

  const contextMenuItems = useMemo(
    () => (contextMenu ? getContextMenuItems(contextMenu.row) : []),
    [contextMenu, can, selectedRow],
  );

  const rows = data?.rows ?? [];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const department = extractTravelDepartmentName(row.department).toLowerCase();
      return (
        row.ref.toLowerCase().includes(query) ||
        row.employee.toLowerCase().includes(query) ||
        department.includes(query) ||
        row.travelDates.toLowerCase().includes(query) ||
        formatDate(row.date).toLowerCase().includes(query) ||
        String(row.tripDays).includes(query) ||
        formatMoney(row.totalBudget).toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate menuId="travel.historique" action="view">
    <div className="travel-history-page">
      <div className="travel-history-sticky">
        <div className="page-header page-header-with-tabs travel-history-header">
          <div>
            <div className="page-header-title-row">
              <h2>Voyage</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p>{rows.length} mission{rows.length > 1 ? 's' : ''} enregistrée{rows.length > 1 ? 's' : ''}</p>
          </div>
          <div className="travel-history-header-actions">
            <PermissionGate menuId="travel.historique" action="export">
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
            <div className="tabs header-tabs header-tabs-dashboard header-tabs-compact travel-history-tabs">
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-icon tab-btn-dashboard${tab === 'dashboard' ? ' active' : ''}`}
                onClick={() => setTab('dashboard')}
              >
                <IconDashboard size={16} />
                Dashboard
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm tab-btn-icon tab-btn-dashboard${tab === 'data' ? ' active' : ''}`}
                onClick={() => setTab('data')}
              >
                <IconDataTable size={16} />
                Historique
              </button>
              <PermissionGate menuId="travel.etablir" action="create">
                <Link
                  href="/documents-voyage/etablir"
                  className="tab-btn tab-btn-sm tab-btn-icon tab-btn-dashboard"
                >
                  <IconEtablir size={16} />
                  Cash request
                </Link>
              </PermissionGate>
            </div>
          </div>
        </div>
      </div>

      <div className="travel-history-body">
        {error && <div className="alert alert-danger">{error}</div>}

        {tab === 'dashboard' && data && (
          <TravelHistoryDashboardView dashboard={data.dashboard} rows={data.rows} />
        )}

        {tab === 'data' && (
          <div className="panel">
            {rows.length === 0 ? (
              <p className="empty-state">
                Aucune mission enregistrée. Commencez par établir un dossier de voyage.
              </p>
            ) : (
              <>
                <div className="travel-history-table-toolbar">
                  <input
                    type="search"
                    className="search-input travel-history-search-input"
                    placeholder="Rechercher une mission, un employé, une référence…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <span className="toolbar-count">
                    {filteredRows.length} / {rows.length} mission{rows.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="travel-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>ref</th>
                        <th>Employé</th>
                        <th>Département</th>
                        <th>Dates voyage</th>
                        <th>Nombre de jours</th>
                        <th className="travel-history-budget-col">Total budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="travel-history-empty-filter">
                            Aucun résultat pour « {search} »
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr
                            key={`${row.ref}-${row.rowIndex}`}
                            className="travel-history-data-row"
                            onContextMenu={(event) => {
                              event.preventDefault();
                              const items = getContextMenuItems(row);
                              if (items.length === 0) return;
                              setContextMenu({ x: event.clientX, y: event.clientY, row });
                            }}
                          >
                            <td>{formatDate(row.date)}</td>
                            <td>
                              <button
                                type="button"
                                className="travel-history-ref-btn"
                                onClick={() => handleView(row)}
                              >
                                {row.ref}
                              </button>
                            </td>
                            <td>{row.employee}</td>
                            <td>{extractTravelDepartmentName(row.department)}</td>
                            <td>{row.travelDates}</td>
                            <td>{row.tripDays}</td>
                            <td className="travel-history-budget-cell">{formatMoney(row.totalBudget)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {contextMenu && contextMenuItems.length > 0 && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenuItems}
        />
      )}

      <TravelHistoryDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
    </PermissionGate>
  );
}
