'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface DashboardListColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
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
}

/** Modal générique : liste derrière un chiffre de dashboard. */
export default function DashboardListModal({
  title,
  columns,
  rows,
  onClose,
  searchPlaceholder = 'Rechercher…',
}: Props) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => {
        const value = row.cells[col.key];
        if (value == null) return false;
        return String(value).toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, search]);

  return (
    <div className="modal-overlay open" onClick={onClose} role="presentation">
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
              {search.trim() && filtered.length !== rows.length
                ? ` sur ${rows.length}`
                : ''}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="dependants-drilldown-toolbar">
          <input
            type="search"
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
          />
        </div>

        <div className="dependants-drilldown-table-wrap">
          {filtered.length === 0 ? (
            <p className="empty-state">Aucun élément à afficher.</p>
          ) : (
            <table className="dependants-drilldown-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      style={col.align ? { textAlign: col.align } : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        style={col.align ? { textAlign: col.align } : undefined}
                      >
                        {row.cells[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
