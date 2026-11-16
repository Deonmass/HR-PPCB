'use client';

import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import { formatSickMonthLabel } from '@/lib/sick-leave-utils';
import type { SickLeaveCompareRow, SickLeaveDashboard } from '@/lib/sick-leave-types';
import { useMemo, useState } from 'react';

interface Props {
  dashboard: SickLeaveDashboard;
  rows: SickLeaveCompareRow[];
  onFilterBucket?: (bucket: SickLeaveCompareRow['bucket'] | 'all') => void;
}

const KPI_GLOW = ['card-glow-cyan', 'card-glow-violet', 'card-glow-green', 'card-glow-red', 'card-glow-cyan', 'card-glow-violet'] as const;

export default function SickLeaveDashboardView({ dashboard, rows, onFilterBucket }: Props) {
  const [detail, setDetail] = useState<string | null>(null);

  const kpis = useMemo(() => ([
    { label: 'Employés', value: dashboard.employees, bucket: 'all' as const },
    { label: 'Applications système', value: dashboard.applications, bucket: 'application-only' as const },
    { label: 'Attestations', value: dashboard.attestations, bucket: 'attestation-only' as const },
    { label: 'Attestation sans application', value: dashboard.attestationOnly, bucket: 'attestation-only' as const },
    { label: 'Application sans attestation', value: dashboard.applicationOnly, bucket: 'application-only' as const },
    { label: 'Les deux', value: dashboard.both, bucket: 'both' as const },
  ]), [dashboard]);

  const monthItems = dashboard.byMonth.map((item) => ({
    label: item.label,
    value: item.applications,
    count: item.attestations,
  }));

  return (
    <div className="travel-history-dashboard dependants-dashboard sante-dashboard">
      <div className="travel-history-cards">
        {kpis.map((kpi, index) => (
          <button
            key={kpi.label}
            type="button"
            className={`card card-glow ${KPI_GLOW[index % KPI_GLOW.length]} travel-history-card dependants-kpi-clickable`}
            onClick={() => onFilterBucket?.(kpi.bucket)}
          >
            <div className="card-label">{kpi.label}</div>
            <div className="card-value">{kpi.value}</div>
          </button>
        ))}
      </div>

      <div className="dependants-charts-grid">
        <DependantsBarChart
          title="Attestation sans application"
          items={dashboard.byDeptAttestationOnly}
          onItemClick={(label) => setDetail(`attestation-only:${label}`)}
        />
        <DependantsBarChart
          title="Application sans attestation"
          items={dashboard.byDeptApplicationOnly}
          onItemClick={(label) => setDetail(`application-only:${label}`)}
        />
        <DependantsBarChart
          title="Application et attestation"
          items={dashboard.byDeptBoth}
          onItemClick={(label) => setDetail(`both:${label}`)}
        />
        <DependantsBarChart
          title="Par mois — applications (attestations entre parenthèses)"
          items={monthItems}
          formatCount={(n) => `(${n} att.)`}
        />
      </div>

      {detail ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="page-header-title-row">
            <h3>
              {detail.split(':')[1]} — {rows.filter((row) => {
                const [bucket, dept] = detail.split(':');
                return row.bucket === bucket && (row.department.trim() || '—') === dept;
              }).length} ligne(s)
            </h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetail(null)}>Fermer</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom</th>
                  <th>Mois</th>
                  <th>Jours</th>
                  <th>Hôpital</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) => {
                    const [bucket, dept] = detail.split(':');
                    return row.bucket === bucket && (row.department.trim() || '—') === dept;
                  })
                  .map((row) => (
                    <tr key={row.key}>
                      <td>{row.matricule}</td>
                      <td>{row.nom}</td>
                      <td>{formatSickMonthLabel(row.month, row.year)}</td>
                      <td>{row.days ?? '—'}</td>
                      <td>{row.hospital || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
