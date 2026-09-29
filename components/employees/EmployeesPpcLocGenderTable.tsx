'use client';

import AirtimeDrcMap, { type AirtimePlaceStat } from '@/components/airtime/AirtimeDrcMap';
import EnlargeableChartPanel, {
  type ChartDeptFilterSource,
} from '@/components/EnlargeableChartPanel';
import type { HrLocalisationGenderRow } from '@/lib/employees-hr-dashboard';

type GenderCol = 'hommes' | 'femmes' | 'total';

interface BodyProps {
  rows: HrLocalisationGenderRow[];
  onCellClick?: (localisation: string, gender: GenderCol) => void;
}

function sitesFromRows(rows: HrLocalisationGenderRow[]): AirtimePlaceStat[] {
  return rows.map((row) => ({
    id: row.label,
    label: row.label,
    total: row.total,
    ppc: row.total,
    contractant: 0,
    assigned: 0,
    unassigned: 0,
    facts: [
      { id: 'hommes', label: 'Hommes', value: row.hommes },
      { id: 'femmes', label: 'Femmes', value: row.femmes },
      { id: 'total', label: 'Total', value: row.total },
    ],
  }));
}

export function EmployeesPpcLocGenderTableBody({ rows, onCellClick }: BodyProps) {
  if (!rows.length) {
    return <p className="empty-state">Aucune donnée disponible.</p>;
  }

  return (
    <AirtimeDrcMap
      bare
      sites={sitesFromRows(rows)}
      onSelect={(localisation, slice) => {
        const gender: GenderCol = slice === 'hommes' || slice === 'femmes' ? slice : 'total';
        onCellClick?.(localisation, gender);
      }}
    />
  );
}

interface Props {
  title: string;
  rows: HrLocalisationGenderRow[];
  deptFilter?: ChartDeptFilterSource;
  onCellClick?: (localisation: string, gender: GenderCol) => void;
}

export default function EmployeesPpcLocGenderTable({ title, rows, deptFilter, onCellClick }: Props) {
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
      <EmployeesPpcLocGenderTableBody rows={rows} onCellClick={onCellClick} />
    </EnlargeableChartPanel>
  );
}
