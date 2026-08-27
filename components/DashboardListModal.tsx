'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

export interface DashboardListColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Désactive le filtre Excel sur cette colonne. */
  filterable?: boolean;
}

export interface DashboardListRow {
  id: string | number;
  cells: Record<string, ReactNode>;
}

interface Props {
  title: string;
  columns: DashboardListColumn[];
  rows: DashboardListRow[];
  onClose: () => void;
  searchPlaceholder?: string;
  /** Affiche les filtres d’entonnoir sur les colonnes (défaut true). */
  enableColumnFilters?: boolean;
  /**
   * Barre de chips pour filtrer une colonne (ex. localisation).
   * Si omis et qu’une colonne `localisation` existe, elle est activée automatiquement.
   */
  chipFilterKey?: string;
  chipFilterLabel?: string;
}

function cellToText(value: ReactNode): string {
  if (value == null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return '';
}

/** Modal générique : liste derrière un chiffre / un graphique de dashboard. */
export default function DashboardListModal({
  title,
  columns,
  rows,
  onClose,
  searchPlaceholder = 'Rechercher…',
  enableColumnFilters = true,
  chipFilterKey,
  chipFilterLabel,
}: Props) {
  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [chipValue, setChipValue] = useState('');

  const resolvedChipKey = chipFilterKey ?? (columns.some((col) => col.key === 'localisation') ? 'localisation' : undefined);
  const resolvedChipLabel = chipFilterLabel ?? (resolvedChipKey === 'localisation' ? 'Localisation' : resolvedChipKey);

  useEffect(() => {
    setSearch('');
    setColFilters({});
    setChipValue('');
  }, [title]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filterableColumns = useMemo(
    () => columns.filter((col) => col.filterable !== false),
    [columns],
  );

  const filterValues = useMemo(() => {
    if (!enableColumnFilters) return {} as Record<string, string[]>;
    const getters = Object.fromEntries(
      filterableColumns.map((col) => [
        col.key,
        (row: DashboardListRow) => cellToText(row.cells[col.key]),
      ]),
    ) as Record<string, (row: DashboardListRow) => string>;
    return buildColumnFilterValues(rows, getters);
  }, [enableColumnFilters, filterableColumns, rows]);

  const activeFilterCount = countActiveColumnFilters(colFilters) + (chipValue ? 1 : 0);

  const chipOptions = useMemo(() => {
    if (!resolvedChipKey) return [];
    const map = new Map<string, number>();
    for (const row of rows) {
      const label = cellToText(row.cells[resolvedChipKey]).trim() || '—';
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  }, [rows, resolvedChipKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (resolvedChipKey && chipValue) {
        const label = cellToText(row.cells[resolvedChipKey]).trim() || '—';
        if (label !== chipValue) return false;
      }
      if (enableColumnFilters) {
        for (const col of filterableColumns) {
          const selected = colFilters[col.key] || [];
          if (!matchesColumnFilter(selected, cellToText(row.cells[col.key]))) return false;
        }
      }
      if (!q) return true;
      return columns.some((col) => cellToText(row.cells[col.key]).toLowerCase().includes(q));
    });
  }, [rows, columns, filterableColumns, colFilters, search, enableColumnFilters, resolvedChipKey, chipValue]);

  return (
    <div className="modal-overlay open dashboard-list-overlay" onClick={onClose} role="presentation">
      <div
        className="modal dependants-drilldown-modal dashboard-list-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p className="dependants-drilldown-meta">
              {filtered.length} élément{filtered.length !== 1 ? 's' : ''}
              {(search.trim() || activeFilterCount > 0) && filtered.length !== rows.length
                ? ` sur ${rows.length}`
                : ''}
            </p>
          </div>
          <button type="button" className="modal-close dashboard-list-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        <div className="dependants-drilldown-toolbar dashboard-list-toolbar">
          <input
            type="search"
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setColFilters({});
                setChipValue('');
              }}
            >
              Effacer les filtres ({activeFilterCount})
            </button>
          )}
        </div>

        {resolvedChipKey && chipOptions.length > 0 ? (
          <div className="dashboard-list-chips" role="group" aria-label={`Filtrer par ${resolvedChipLabel}`}>
            <span className="dashboard-list-chips-label">{resolvedChipLabel}</span>
            <button
              type="button"
              className={`dashboard-list-chip${chipValue === '' ? ' is-active' : ''}`}
              onClick={() => setChipValue('')}
            >
              Toutes
              <span className="dashboard-list-chip-count">{rows.length}</span>
            </button>
            {chipOptions.map((option) => (
              <button
                key={option.name}
                type="button"
                className={`dashboard-list-chip${chipValue === option.name ? ' is-active' : ''}`}
                onClick={() => setChipValue(option.name)}
                title={option.name}
              >
                {option.name}
                <span className="dashboard-list-chip-count">{option.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="dependants-drilldown-table-wrap">
          {rows.length === 0 ? (
            <p className="empty-state">Aucun élément à afficher.</p>
          ) : (
            <table className="dependants-drilldown-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      title={col.label}
                      style={col.align ? { textAlign: col.align } : undefined}
                    >
                      {enableColumnFilters && col.filterable !== false ? (
                        <TableHeaderFilter
                          label={col.label}
                          values={filterValues[col.key] || []}
                          selected={colFilters[col.key] || []}
                          onChange={(next) =>
                            setColFilters((prev) => ({ ...prev, [col.key]: next }))
                          }
                        />
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length}>
                      <div className="contractants-empty-state" style={{ minHeight: '8rem' }}>
                        <p>Aucun résultat pour cette recherche / ces filtres.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id}>
                      {columns.map((col) => {
                        const value = row.cells[col.key] ?? '—';
                        const titleText =
                          value == null || typeof value === 'object'
                            ? undefined
                            : String(value);
                        return (
                          <td
                            key={col.key}
                            title={titleText}
                            style={col.align ? { textAlign: col.align } : undefined}
                          >
                            <span className="dashboard-list-cell">{value}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
