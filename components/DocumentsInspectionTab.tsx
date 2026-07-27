'use client';

import { useMemo } from 'react';
import {
  calcCellAggregateStats,
  calcInspectionFromEmployees,
} from '@/lib/documents';
import {
  buildAuditRateInfo,
  buildInspectionAggregateLines,
  buildInspectionCriterionConformeLines,
  buildInspectionCriterionNonConformeLines,
} from '@/lib/audit-formulas';
import type { EmployeeFilters } from '@/lib/employee-filters';
import type { DashboardData, Employee } from '@/lib/types';
import AuditFormulaTooltip from './AuditFormulaTooltip';

interface Props {
  filteredEmployees: Employee[];
  dashboard: DashboardData | null;
  filters: EmployeeFilters;
}

function CritereProgressBar({ y, n, na, total }: { y: number; n: number; na: number; total: number }) {
  const t = total || 1;
  const yPct = (y / t) * 100;
  const naPct = (na / t) * 100;
  const nPct = (n / t) * 100;

  return (
    <div
      className="critere-progress-bar"
      title={`Y ${Math.round(yPct)}% · NA ${Math.round(naPct)}% · N ${Math.round(nPct)}%`}
    >
      {yPct > 0 && (
        <span className="critere-progress-seg seg-y" style={{ width: `${yPct}%` }} />
      )}
      {naPct > 0 && (
        <span className="critere-progress-seg seg-na" style={{ width: `${naPct}%` }} />
      )}
      {nPct > 0 && (
        <span className="critere-progress-seg seg-non-conforme" style={{ width: `${nPct}%` }} />
      )}
    </div>
  );
}

function calcConformitePct(y: number, na: number, total: number): number {
  return Math.round(((y + na) / (total || 1)) * 100);
}

function calcNonConformePct(n: number, total: number): number {
  return Math.round((n / (total || 1)) * 100);
}

export default function DocumentsInspectionTab({
  filteredEmployees,
  dashboard,
  filters,
}: Props) {
  const filtered = Boolean(filters.search.trim() || filters.dept);

  const inspections = useMemo(
    () => calcInspectionFromEmployees(filteredEmployees),
    [filteredEmployees],
  );

  const audit = useMemo(
    () => buildAuditRateInfo(filteredEmployees, dashboard, filtered),
    [filteredEmployees, dashboard, filtered],
  );

  const aggregate = useMemo(
    () => calcCellAggregateStats(filteredEmployees),
    [filteredEmployees],
  );

  const globalPctLines = useMemo(
    () => buildInspectionAggregateLines(aggregate),
    [aggregate],
  );

  return (
    <div className="inspection-tab">
      <div className="panel">
        <div className="panel-header">
          <h3>Inspection par critère documentaire</h3>
          <span className="panel-meta">Formules alignées sur la feuille INSPECTIONS (l.23–25)</span>
        </div>

        <div className="table-wrap inspection-table-wrap">
          <table className="inspection-table">
            <thead>
              <tr>
                <th>Critère</th>
                <th>Total</th>
                <th>N</th>
                <th>Y</th>
                <th>NA</th>
                <th>Conformité</th>
                <th>Non-conformité</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((row, i) => {
                const totalN = Number(row.total) || 1;
                const y = Number(row.y);
                const n = Number(row.n);
                const na = Number(row.na);
                const conformePct = calcConformitePct(y, na, totalN);
                const nonConformePct = calcNonConformePct(n, totalN);

                return (
                  <tr key={row.critere} className="inspection-row">
                    <td className="critere-cell">
                      <CritereProgressBar y={y} n={n} na={na} total={totalN} />
                      <div className="critere-content">
                        <span className="critere-num">{i + 1}.</span>
                        <span className="critere-label">{row.critere}</span>
                      </div>
                    </td>
                    <td>{row.total}</td>
                    <td><span className="badge badge-n">{row.n}</span></td>
                    <td><span className="badge badge-y">{row.y}</span></td>
                    <td><span className="badge badge-na">{row.na}</span></td>
                    <td>
                      <AuditFormulaTooltip
                        value={`${conformePct}%`}
                        title={`Conformité critère ${i + 1}`}
                        lines={buildInspectionCriterionConformeLines(y, na, totalN, conformePct)}
                        className="pct-badge pct-conforme"
                      />
                    </td>
                    <td>
                      <AuditFormulaTooltip
                        value={`${nonConformePct}%`}
                        title={`Non-conformité critère ${i + 1}`}
                        lines={buildInspectionCriterionNonConformeLines(n, totalN, nonConformePct)}
                        className="pct-badge pct-non-conforme"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="inspection-footer-row">
                <td className="critere-cell critere-cell-total">
                  <div className="critere-content">
                    <strong className="critere-label">Résumé global</strong>
                  </div>
                </td>
                <td><strong>{aggregate.totalCells}</strong></td>
                <td><span className="badge badge-n">{aggregate.sumN}</span></td>
                <td><span className="badge badge-y">{aggregate.sumY}</span></td>
                <td><span className="badge badge-na">{aggregate.sumNa}</span></td>
                <td>
                  <AuditFormulaTooltip
                    value={audit.conformeLabel}
                    title="Taux conformité — INSPECTIONS l.25"
                    lines={globalPctLines}
                    className="pct-badge pct-conforme"
                  />
                </td>
                <td>
                  <AuditFormulaTooltip
                    value={audit.nonConformeLabel}
                    title="Taux non conforme — INSPECTIONS l.24"
                    lines={audit.nonConformeLines}
                    className="pct-badge pct-non-conforme"
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
