'use client';

interface ChipOption {
  name: string;
  count: number;
}

interface Props {
  title: string;
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  totalCount: number;
  /** Accessible name for the filter group. */
  ariaLabel?: string;
}

/** Liste de chips (départements, sociétés…) pour filtrer un graphique agrandi. */
export default function ChartChipFilter({
  title,
  options,
  value,
  onChange,
  totalCount,
  ariaLabel,
}: Props) {
  return (
    <aside className="chart-dept-filter" aria-label={ariaLabel ?? title}>
      <div className="chart-dept-filter-head">{title}</div>
      <div className="chart-dept-filter-list">
        <button
          type="button"
          className={`chart-dept-filter-item${value === '' ? ' is-active' : ''}`}
          onClick={() => onChange('')}
        >
          <span className="chart-dept-filter-name">Tous</span>
          <span className="chart-dept-filter-count">{totalCount}</span>
        </button>
        {options.map((option) => (
          <button
            key={option.name}
            type="button"
            className={`chart-dept-filter-item${value === option.name ? ' is-active' : ''}`}
            onClick={() => onChange(option.name)}
            title={option.name}
          >
            <span className="chart-dept-filter-name">{option.name}</span>
            <span className="chart-dept-filter-count">{option.count}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
