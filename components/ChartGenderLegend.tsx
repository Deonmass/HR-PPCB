'use client';

import type { Employee } from '@/lib/types';

function isMale(gender: string): boolean {
  const g = gender.trim().toLowerCase();
  return g === 'm' || g === 'male' || g.startsWith('homm');
}

function isFemale(gender: string): boolean {
  const g = gender.trim().toLowerCase();
  return g === 'f' || g === 'female' || g.startsWith('femm');
}

interface Props {
  employees: Employee[];
}

/** Légende Hommes / Femmes pour le modal agrandi (filtre Company). */
export default function ChartGenderLegend({ employees }: Props) {
  let hommes = 0;
  let femmes = 0;
  for (const employee of employees) {
    if (isMale(employee.gender)) hommes += 1;
    else if (isFemale(employee.gender)) femmes += 1;
  }
  const total = employees.length;
  const other = Math.max(total - hommes - femmes, 0);

  return (
    <aside className="chart-dept-filter chart-gender-legend" aria-label="Légende sexe">
      <div className="chart-dept-filter-head">Sexe</div>
      <ul className="chart-gender-legend-list">
        <li className="chart-gender-legend-item">
          <span className="chart-gender-swatch is-male" />
          <span className="chart-gender-label">Hommes</span>
          <span className="chart-gender-count">{hommes}</span>
        </li>
        <li className="chart-gender-legend-item">
          <span className="chart-gender-swatch is-female" />
          <span className="chart-gender-label">Femmes</span>
          <span className="chart-gender-count">{femmes}</span>
        </li>
        {other > 0 ? (
          <li className="chart-gender-legend-item">
            <span className="chart-gender-swatch is-other" />
            <span className="chart-gender-label">Non renseigné</span>
            <span className="chart-gender-count">{other}</span>
          </li>
        ) : null}
        <li className="chart-gender-legend-item is-total">
          <span className="chart-gender-label">Total</span>
          <span className="chart-gender-count">{total}</span>
        </li>
      </ul>
    </aside>
  );
}
