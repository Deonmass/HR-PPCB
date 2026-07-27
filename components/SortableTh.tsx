'use client';

type SortDir = 'asc' | 'desc';

interface Props {
  label: string;
  column: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (column: string) => void;
  className?: string;
}

/** En-tête de colonne cliquable avec indicateur de tri. */
export default function SortableTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: Props) {
  const active = sortKey === column;
  return (
    <th className={`sortable-th${active ? ' is-sorted' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="sortable-th-btn"
        onClick={() => onSort(column)}
        title={`Trier par ${label}`}
      >
        <span>{label}</span>
        <span className="sortable-th-icon" aria-hidden>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export type { SortDir };
