'use client';

export type GenderFilterValue = '' | 'Hommes' | 'Femmes' | 'Non renseigné';

interface Props {
  hommes: number;
  femmes: number;
  other?: number;
  totalCount: number;
  value?: GenderFilterValue;
  onChange?: (value: GenderFilterValue) => void;
}

/** Filtre Hommes / Femmes pour le modal agrandi. */
export default function ChartGenderLegend({
  hommes,
  femmes,
  other = 0,
  totalCount,
  value = '',
  onChange,
}: Props) {
  const options: { key: GenderFilterValue; label: string; count: number; swatch?: string }[] = [
    { key: '', label: 'Tous', count: totalCount },
    { key: 'Hommes', label: 'Hommes', count: hommes, swatch: 'is-male' },
    { key: 'Femmes', label: 'Femmes', count: femmes, swatch: 'is-female' },
  ];
  if (other > 0) {
    options.push({ key: 'Non renseigné', label: 'Non renseigné', count: other, swatch: 'is-other' });
  }

  return (
    <aside className="chart-dept-filter chart-gender-legend" aria-label="Filtrer par sexe">
      <div className="chart-dept-filter-head">Sexe</div>
      <div className="chart-dept-filter-list chart-gender-legend-list">
        {options.map((option) => (
          <button
            key={option.key || 'all'}
            type="button"
            className={`chart-dept-filter-item chart-gender-legend-item${value === option.key ? ' is-active' : ''}`}
            onClick={() => onChange?.(option.key)}
          >
            {option.swatch ? <span className={`chart-gender-swatch ${option.swatch}`} /> : null}
            <span className="chart-gender-label">{option.label}</span>
            <span className="chart-gender-count chart-dept-filter-count">{option.count}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function genderBucket(gender: string): Exclude<GenderFilterValue, ''> {
  const g = gender.trim().toLowerCase();
  if (g === 'm' || g === 'male' || g.startsWith('homm')) return 'Hommes';
  if (g === 'f' || g === 'female' || g.startsWith('femm')) return 'Femmes';
  return 'Non renseigné';
}

export function countByGender(employees: { gender: string }[]) {
  let hommes = 0;
  let femmes = 0;
  let other = 0;
  for (const employee of employees) {
    const bucket = genderBucket(employee.gender);
    if (bucket === 'Hommes') hommes += 1;
    else if (bucket === 'Femmes') femmes += 1;
    else other += 1;
  }
  return { hommes, femmes, other, total: employees.length };
}
