'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ActionButtons from '@/components/ActionButtons';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import type { MissionOrderHistoryRow } from '@/lib/mission-order-history-types';
import { confirmDelete, showError } from '@/lib/swal';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import type { MissionSiteId } from '@/lib/travel-mission-sites';

type FilterKey =
  | 'missionRef'
  | 'employeeName'
  | 'title'
  | 'purpose'
  | 'destination'
  | 'transportMeans';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  missionRef: [],
  employeeName: [],
  title: [],
  purpose: [],
  destination: [],
  transportMeans: [],
};

function formatDate(value: string): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('fr-FR');
  }
  return value;
}

function formatAmount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export default function MissionOrderHistoryTable({
  site,
  canEdit,
  canDelete,
  onEdit,
}: {
  site: MissionSiteId;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (row: MissionOrderHistoryRow) => void;
}) {
  const [rows, setRows] = useState<MissionOrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/travel/mission-orders?site=${encodeURIComponent(site)}`);
      const json = (await res.json()) as { rows?: MissionOrderHistoryRow[]; error?: string };
      if (!res.ok) {
        setRows([]);
        setError(json.error || 'Erreur de chargement');
        return;
      }
      setRows((json.rows ?? []).filter((row) => row.employeeName.trim()));
    } catch {
      setRows([]);
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const blob = [
          row.missionRef,
          row.employeeName,
          row.matricule,
          row.title,
          row.purpose,
          row.destination,
          row.transportMeans,
          row.observation,
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (!matchesColumnFilter(colFilters.missionRef, row.missionRef)) return false;
      if (!matchesColumnFilter(colFilters.employeeName, row.employeeName)) return false;
      if (!matchesColumnFilter(colFilters.title, row.title)) return false;
      if (!matchesColumnFilter(colFilters.purpose, row.purpose)) return false;
      if (!matchesColumnFilter(colFilters.destination, row.destination)) return false;
      if (!matchesColumnFilter(colFilters.transportMeans, row.transportMeans)) return false;
      return true;
    });
  }, [rows, search, colFilters]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(rows, {
        missionRef: (row) => row.missionRef,
        employeeName: (row) => row.employeeName,
        title: (row) => row.title,
        purpose: (row) => row.purpose,
        destination: (row) => row.destination,
        transportMeans: (row) => row.transportMeans,
      }),
    [rows],
  );

  const activeFilterCount = countActiveColumnFilters(colFilters);
  const setColFilter = (key: FilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const handleDelete = async (row: MissionOrderHistoryRow) => {
    if (deletingId) return;
    const confirmed = await confirmDelete(
      'Supprimer cet ordre de mission ?',
      `${row.missionRef} — ${row.employeeName}`,
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/travel/mission-orders/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        await showError(json.error || 'Suppression impossible');
        return;
      }
      await load();
    } catch {
      await showError('Suppression impossible');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="loading">Chargement...</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (rows.length === 0) {
    return (
      <p className="empty-state">
        Aucun ordre de mission enregistré pour ce site. Utilisez l&apos;onglet Formulaire pour en
        établir un.
      </p>
    );
  }

  return (
    <>
      <div className="travel-history-table-toolbar">
        <input
          type="search"
          className="search-input travel-history-search-input"
          placeholder="Rechercher une référence, un agent, une destination…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span className="toolbar-count">
          {visibleRows.length} / {rows.length}
        </span>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setColFilters(EMPTY_FILTERS)}
          >
            Effacer les filtres ({activeFilterCount})
          </button>
        ) : null}
      </div>
      <div className="table-wrap">
        <table className="travel-history-table">
          <thead>
            <tr>
              <th>N°</th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Référence"
                  values={filterValues.missionRef}
                  selected={colFilters.missionRef}
                  onChange={setColFilter('missionRef')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Employé"
                  values={filterValues.employeeName}
                  selected={colFilters.employeeName}
                  onChange={setColFilter('employeeName')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Titre"
                  values={filterValues.title}
                  selected={colFilters.title}
                  onChange={setColFilter('title')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Objet"
                  values={filterValues.purpose}
                  selected={colFilters.purpose}
                  onChange={setColFilter('purpose')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Destination"
                  values={filterValues.destination}
                  selected={colFilters.destination}
                  onChange={setColFilter('destination')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Transport"
                  values={filterValues.transportMeans}
                  selected={colFilters.transportMeans}
                  onChange={setColFilter('transportMeans')}
                />
              </th>
              <th>Départ</th>
              <th>Retour</th>
              <th>Jours</th>
              <th>Montant</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td>{row.sr || '—'}</td>
                <td>{row.missionRef}</td>
                <td>
                  {row.employeeName}
                  {row.matricule ? ` (${row.matricule})` : ''}
                </td>
                <td>{row.title || '—'}</td>
                <td>{row.purpose || '—'}</td>
                <td>{row.destination || '—'}</td>
                <td>{row.transportMeans || '—'}</td>
                <td>{formatDate(row.departureDate)}</td>
                <td>{formatDate(row.returnDate)}</td>
                <td>{row.days || '—'}</td>
                <td>{formatAmount(row.amount)}</td>
                <td>
                  <ActionButtons
                    canEdit={canEdit && Boolean(row.recordId)}
                    canDelete={canDelete}
                    deleting={deletingId === row.id}
                    onEdit={() => onEdit(row)}
                    onDelete={() => void handleDelete(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
