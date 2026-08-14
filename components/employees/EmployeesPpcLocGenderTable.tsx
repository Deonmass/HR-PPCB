'use client';

import EnlargeableChartPanel, {
  type ChartDeptFilterSource,
} from '@/components/EnlargeableChartPanel';
import type { HrLocalisationGenderRow } from '@/lib/employees-hr-dashboard';

type GenderCol = 'hommes' | 'femmes' | 'total';

interface BodyProps {
  rows: HrLocalisationGenderRow[];
  onCellClick?: (localisation: string, gender: GenderCol) => void;
}

export function EmployeesPpcLocGenderTableBody({ rows, onCellClick }: BodyProps) {
  if (!rows.length) {
    return <p className="empty-state">Aucune donnée disponible.</p>;
  }

  const totals = rows.reduce(
    (acc, row) => ({
      hommes: acc.hommes + row.hommes,
      femmes: acc.femmes + row.femmes,
      total: acc.total + row.total,
    }),
    { hommes: 0, femmes: 0, total: 0 },
  );

  const canDrill = Boolean(onCellClick);

  const cell = (
    localisation: string,
    gender: GenderCol,
    value: string | number,
    className = '',
  ) => {
    if (!canDrill) {
      return <span className={className}>{value}</span>;
    }
    return (
      <span
        role="button"
        tabIndex={0}
        className={`employees-ppc-loc-cell ${className}`.trim()}
        onClick={(event) => {
          event.stopPropagation();
          onCellClick?.(localisation, gender);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onCellClick?.(localisation, gender);
          }
        }}
        title={`Voir ${localisation}${gender === 'total' ? '' : gender === 'hommes' ? ' · Hommes' : ' · Femmes'}`}
      >
        {value}
      </span>
    );
  };

  return (
    <div className="employees-ppc-loc-table-wrap">
      <table className="employees-ppc-loc-table">
        <thead>
          <tr>
            <th>Localisation</th>
            <th className="is-num is-hommes">Hommes</th>
            <th className="is-num is-femmes">Femmes</th>
            <th className="is-num is-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={canDrill ? 'is-interactive' : undefined}>
              <td>{cell(row.label, 'total', row.label, 'is-label')}</td>
              <td className="is-num is-hommes">{cell(row.label, 'hommes', row.hommes)}</td>
              <td className="is-num is-femmes">{cell(row.label, 'femmes', row.femmes)}</td>
              <td className="is-num is-total">{cell(row.label, 'total', row.total, 'is-strong')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th className="is-num is-hommes">{totals.hommes}</th>
            <th className="is-num is-femmes">{totals.femmes}</th>
            <th className="is-num is-total">{totals.total}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface Props {
  title: string;
  rows: HrLocalisationGenderRow[];
  deptFilter?: ChartDeptFilterSource;
}

export default function EmployeesPpcLocGenderTable({ title, rows, deptFilter }: Props) {
  if (!rows.length) {
    return (
      <div className="panel travel-history-chart-panel">
        <div className="panel-head">
          <h3>{title}</h3>
        </div>
        <p className="empty-state">Aucune donnée disponible.</p>
      </div>
    );
  }

  return (
    <EnlargeableChartPanel
      title={title}
      className="travel-history-chart-panel employees-ppc-loc-panel"
      clickToEnlarge
      deptFilter={deptFilter}
    >
      <EmployeesPpcLocGenderTableBody rows={rows} />
    </EnlargeableChartPanel>
  );
}
