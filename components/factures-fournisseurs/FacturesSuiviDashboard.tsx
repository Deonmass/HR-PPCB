'use client';

import { useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import EmployeesPieChart from '@/components/employees/EmployeesPieChart';
import FacturesMonthlyChart from '@/components/factures-fournisseurs/FacturesMonthlyChart';
import FacturesPaymentRateChart from '@/components/factures-fournisseurs/FacturesPaymentRateChart';
import type {
  FactureDashboard,
  FactureSuivi,
} from '@/lib/factures-fournisseurs/types';
import {
  facturesForDashboardKpi,
  formatUsdLike,
  type FactureDashboardKpiKind,
} from '@/lib/factures-fournisseurs/utils';

function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M $`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k $`;
  }
  return `${formatUsdLike(value)} $`;
}

function formatFactureCount(count: number): string {
  return `(${count})`;
}

const FACTURE_COLUMNS: DashboardListColumn[] = [
  { key: 'date', label: 'Date facture' },
  { key: 'societe', label: 'Société' },
  { key: 'facture', label: 'N°Facture' },
  { key: 'pr', label: 'Pr' },
  { key: 'po', label: 'Po' },
  { key: 'payment', label: 'Payment' },
  { key: 'commentaire', label: 'Commentaire' },
];

function toRow(f: FactureSuivi): DashboardListRow {
  return {
    id: f.id,
    cells: {
      date: f.date || '—',
      societe: f.societe || '—',
      facture: f.facture || '—',
      pr: f.pr || '—',
      po: f.po || '—',
      payment: f.payment || '—',
      commentaire: f.commentaire || '—',
    },
  };
}

interface Props {
  dashboard: FactureDashboard;
  factures: FactureSuivi[];
  year: number;
  onOpenStage?: (stage: 'unpaid' | 'paid') => void;
}

export default function FacturesSuiviDashboard({
  dashboard,
  factures,
  year,
}: Props) {
  const [drilldown, setDrilldown] = useState<{ title: string; rows: DashboardListRow[] } | null>(null);

  const pipelineItems = useMemo(
    () =>
      (dashboard.parPipeline ?? []).map((kpi) => ({
        label: kpi.label,
        count: kpi.montant,
        itemsCount: kpi.count,
        value: kpi.montant,
      })),
    [dashboard.parPipeline],
  );

  const pieMontants = useMemo(
    () =>
      pipelineItems.map((item) => ({
        label: item.label,
        count: item.count,
        itemsCount: item.itemsCount,
      })),
    [pipelineItems],
  );

  const histoUnpaidPaid = useMemo(
    () => [
      {
        label: 'Unpaid',
        value: dashboard.montantEnCours,
        count: dashboard.enCours,
      },
      {
        label: 'Paid',
        value: dashboard.montantPaid,
        count: dashboard.paid,
      },
    ],
    [dashboard.montantEnCours, dashboard.enCours, dashboard.montantPaid, dashboard.paid],
  );

  const openKpi = (kind: FactureDashboardKpiKind, title: string) => {
    const list = facturesForDashboardKpi(factures, kind);
    setDrilldown({ title, rows: list.map(toRow) });
  };

  return (
    <div className="factures-suivi-dashboard">
      <div className="travel-history-cards factures-suivi-kpis factures-year-anim">
        <button
          type="button"
          className="card card-glow card-glow-cyan travel-history-card dependants-kpi-clickable factures-kpi-card"
          style={{ animationDelay: '0ms' }}
          onClick={() => openKpi('total', 'Total factures')}
          title="Voir la liste — Total factures"
        >
          <div className="card-label">Total factures</div>
          <div className="card-value" key={`total-${dashboard.total}-${year}`}>{dashboard.total}</div>
          <div className="travel-history-card-meta" key={`total-m-${year}`}>
            {formatUsdLike(dashboard.montantTotal)} $
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-amber travel-history-card dependants-kpi-clickable factures-kpi-card"
          style={{ animationDelay: '40ms' }}
          onClick={() => openKpi('unpaid', 'Unpaid')}
          title="Voir la liste — Unpaid"
        >
          <div className="card-label">Unpaid</div>
          <div className="card-value" key={`unpaid-${dashboard.enCours}-${year}`}>{dashboard.enCours}</div>
          <div className="travel-history-card-meta" key={`unpaid-m-${year}`}>
            {formatUsdLike(dashboard.montantEnCours)} $
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-green travel-history-card dependants-kpi-clickable factures-kpi-card"
          style={{ animationDelay: '80ms' }}
          onClick={() => openKpi('paid', 'Paid')}
          title="Voir la liste — Paid"
        >
          <div className="card-label">Paid</div>
          <div className="card-value" key={`paid-${dashboard.paid}-${year}`}>{dashboard.paid}</div>
          <div className="travel-history-card-meta" key={`paid-m-${year}`}>
            {formatUsdLike(dashboard.montantPaid)} $
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-cyan travel-history-card dependants-kpi-clickable factures-kpi-card"
          style={{ animationDelay: '120ms' }}
          onClick={() => openKpi('recu', 'Reçus (sans PR ni PO)')}
          title="Factures unpaid reçues — sans PR ni PO"
        >
          <div className="card-label">Reçus</div>
          <div className="card-value" key={`recu-${dashboard.recu}-${year}`}>{dashboard.recu}</div>
          <div className="travel-history-card-meta" key={`recu-m-${year}`}>
            {formatUsdLike(dashboard.montantRecu)} $
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-violet travel-history-card dependants-kpi-clickable factures-kpi-card"
          style={{ animationDelay: '160ms' }}
          onClick={() => openKpi('pr', 'PR (unpaid)')}
          title="Factures unpaid au PR — sans PO"
        >
          <div className="card-label">PR</div>
          <div className="card-value" key={`pr-${dashboard.pr}-${year}`}>{dashboard.pr}</div>
          <div className="travel-history-card-meta" key={`pr-m-${year}`}>
            {formatUsdLike(dashboard.montantPr)} $
          </div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-pink travel-history-card dependants-kpi-clickable factures-kpi-card"
          style={{ animationDelay: '200ms' }}
          onClick={() => openKpi('po', 'PO (unpaid)')}
          title="Factures unpaid au PO"
        >
          <div className="card-label">PO</div>
          <div className="card-value" key={`po-${dashboard.po}-${year}`}>{dashboard.po}</div>
          <div className="travel-history-card-meta" key={`po-m-${year}`}>
            {formatUsdLike(dashboard.montantPo)} $
          </div>
        </button>
      </div>

      <div className="factures-suivi-charts-grid factures-year-anim" key={`charts-${year}`}>
        <EmployeesPieChart
          title="Répartition des montants"
          items={pieMontants}
          colors={['#38bdf8', '#a855f7', '#f59e0b', '#22c55e']}
          formatValue={formatUsdCompact}
          formatCount={formatFactureCount}
        />
        <DependantsBarChart
          title="Unpaid vs Paid"
          items={histoUnpaidPaid}
          barClassName="factures-bar-montants"
          fitAll
          formatValue={formatUsdCompact}
          formatCount={formatFactureCount}
          onItemClick={(label) => {
            if (label === 'Unpaid') openKpi('unpaid', 'Unpaid');
            else if (label === 'Paid') openKpi('paid', 'Paid');
          }}
        />
      </div>

      <div className="factures-suivi-monthly-chart factures-year-anim" key={`monthly-${year}`} style={{ animationDelay: '60ms' }}>
        <FacturesMonthlyChart factures={factures} year={year} />
      </div>

      <div className="factures-suivi-monthly-chart factures-year-anim" key={`rate-${year}`} style={{ animationDelay: '100ms' }}>
        <FacturesPaymentRateChart factures={factures} year={year} />
      </div>

      {drilldown && (
        <DashboardListModal
          title={drilldown.title}
          columns={FACTURE_COLUMNS}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
