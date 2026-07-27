'use client';

import { useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import EmployeesPieChart from '@/components/employees/EmployeesPieChart';
import FacturesMonthlyChart from '@/components/factures-fournisseurs/FacturesMonthlyChart';
import type {
  FactureDashboard,
  FactureStage,
  FactureSuivi,
} from '@/lib/factures-fournisseurs/types';
import { FACTURE_TAB_LABELS } from '@/lib/factures-fournisseurs/types';
import {
  facturesForDashboardKpi,
  formatUsdLike,
  type FactureDashboardKpiKind,
} from '@/lib/factures-fournisseurs/utils';

const STAGE_GLOW: Record<FactureStage, string> = {
  facture: 'card-glow-cyan',
  pr: 'card-glow-violet',
  po: 'card-glow-amber',
  posted: 'card-glow-green',
  paid: 'card-glow-green',
};

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
  { key: 'facture', label: 'Facture' },
  { key: 'societe', label: 'Société' },
  { key: 'montant', label: 'Montant', align: 'right' },
  { key: 'date', label: 'Date' },
  { key: 'echeance', label: 'Échéance' },
  { key: 'statut', label: 'Statut' },
];

function toRow(f: FactureSuivi): DashboardListRow {
  return {
    id: f.id,
    cells: {
      facture: f.facture || '—',
      societe: f.societe || '—',
      montant: f.montant == null ? '—' : `${formatUsdLike(f.montant)} $`,
      date: f.date || '—',
      echeance: f.echeance || '—',
      statut: f.statutLabel || FACTURE_TAB_LABELS[f.statut] || f.statut,
    },
  };
}

interface Props {
  dashboard: FactureDashboard;
  factures: FactureSuivi[];
  onOpenStage?: (stage: FactureStage) => void;
}

export default function FacturesSuiviDashboard({
  dashboard,
  factures,
  onOpenStage,
}: Props) {
  const duesHorsRetardCount = Math.max(0, dashboard.enCours - dashboard.enRetard);
  const duesHorsRetardMontant = Math.max(0, dashboard.montantEnCours - dashboard.montantRetard);
  const [drilldown, setDrilldown] = useState<{ title: string; rows: DashboardListRow[] } | null>(null);

  const pieMontants = useMemo(
    () => [
      { label: 'Montant dû', count: duesHorsRetardMontant, itemsCount: duesHorsRetardCount },
      { label: 'En retard', count: dashboard.montantRetard, itemsCount: dashboard.enRetard },
      { label: 'Posted unpaid', count: dashboard.montantPosted, itemsCount: dashboard.posted },
      { label: 'Paid', count: dashboard.montantPaid, itemsCount: dashboard.paid },
    ],
    [
      duesHorsRetardMontant,
      duesHorsRetardCount,
      dashboard.montantRetard,
      dashboard.enRetard,
      dashboard.montantPosted,
      dashboard.posted,
      dashboard.montantPaid,
      dashboard.paid,
    ],
  );

  const histoComparaison = useMemo(
    () => [
      { label: 'Montant dû', value: duesHorsRetardMontant, count: duesHorsRetardCount },
      { label: 'En retard', value: dashboard.montantRetard, count: dashboard.enRetard },
      { label: 'Posted unpaid', value: dashboard.montantPosted, count: dashboard.posted },
      { label: 'Paid', value: dashboard.montantPaid, count: dashboard.paid },
    ],
    [
      duesHorsRetardMontant,
      duesHorsRetardCount,
      dashboard.montantRetard,
      dashboard.enRetard,
      dashboard.montantPosted,
      dashboard.posted,
      dashboard.montantPaid,
      dashboard.paid,
    ],
  );

  const histoParEtape = useMemo(
    () =>
      dashboard.parEtape.map((kpi) => ({
        label: FACTURE_TAB_LABELS[kpi.stage],
        value: kpi.montant,
        count: kpi.count,
      })),
    [dashboard.parEtape],
  );

  const openKpi = (kind: FactureDashboardKpiKind, title: string) => {
    const list = facturesForDashboardKpi(factures, kind);
    setDrilldown({ title, rows: list.map(toRow) });
  };

  const stageFromLabel = (label: string): FactureStage | null => {
    const entry = (Object.entries(FACTURE_TAB_LABELS) as [FactureStage, string][])
      .find(([, value]) => value === label);
    return entry?.[0] ?? null;
  };

  return (
    <div className="factures-suivi-dashboard">
      <div className="travel-history-cards factures-suivi-kpis">
        <button
          type="button"
          className="card card-glow card-glow-cyan travel-history-card dependants-kpi-clickable"
          onClick={() => openKpi('total', 'Total factures')}
          title="Voir la liste — Total factures"
        >
          <div className="card-label">Total factures</div>
          <div className="card-value">{dashboard.total}</div>
          <div className="travel-history-card-meta">{formatUsdLike(dashboard.montantTotal)} $</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-amber travel-history-card dependants-kpi-clickable"
          onClick={() => openKpi('enCours', 'Montant dû')}
          title="Voir la liste — Montant dû"
        >
          <div className="card-label">Montant dû</div>
          <div className="card-value">{dashboard.enCours}</div>
          <div className="travel-history-card-meta">{formatUsdLike(dashboard.montantEnCours)} $</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-red travel-history-card dependants-kpi-clickable"
          onClick={() => openKpi('enRetard', 'En retard (échéance)')}
          title="Voir la liste — En retard"
        >
          <div className="card-label">En retard (échéance)</div>
          <div className="card-value">{dashboard.enRetard}</div>
          <div className="travel-history-card-meta">{formatUsdLike(dashboard.montantRetard)} $</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-green travel-history-card dependants-kpi-clickable"
          onClick={() => openKpi('posted', 'Posted and unpaid')}
          title="Voir la liste — Posted"
        >
          <div className="card-label">Posted and unpaid</div>
          <div className="card-value">{dashboard.posted}</div>
          <div className="travel-history-card-meta">{formatUsdLike(dashboard.montantPosted)} $</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-green travel-history-card dependants-kpi-clickable"
          onClick={() => openKpi('paid', 'Paid')}
          title="Voir la liste — Paid"
        >
          <div className="card-label">Paid</div>
          <div className="card-value">{dashboard.paid}</div>
          <div className="travel-history-card-meta">{formatUsdLike(dashboard.montantPaid)} $</div>
        </button>
      </div>

      <div className="factures-suivi-pipeline-chart">
        <DependantsBarChart
          title="Montants par étape du pipeline"
          items={histoParEtape}
          barClassName="factures-bar-pipeline"
          fitAll
          formatValue={formatUsdCompact}
          formatCount={formatFactureCount}
          onItemClick={(label) => {
            const stage = stageFromLabel(label);
            if (stage) openKpi(stage, label);
          }}
        />
      </div>

      <div className="factures-suivi-monthly-chart">
        <FacturesMonthlyChart factures={factures} />
      </div>

      <div className="factures-suivi-charts-grid">
        <EmployeesPieChart
          title="Répartition des montants"
          items={pieMontants}
          colors={['#f59e0b', '#ef4444', '#22c55e', '#38bdf8']}
          formatValue={formatUsdCompact}
          formatCount={formatFactureCount}
        />
        <DependantsBarChart
          title="Montant dû vs posted"
          items={histoComparaison}
          barClassName="factures-bar-montants"
          fitAll
          formatValue={formatUsdCompact}
          formatCount={formatFactureCount}
          onItemClick={(label) => {
            if (label === 'Montant dû') openKpi('enCours', label);
            else if (label === 'En retard') openKpi('enRetard', label);
            else if (label === 'Posted unpaid') openKpi('posted', label);
            else if (label === 'Paid') openKpi('paid', label);
          }}
        />
      </div>

      <div className="panel factures-suivi-pipeline-panel">
        <div className="panel-head">
          <h3>Pipeline — où bloquent les factures</h3>
          <span className="panel-meta">Cliquez une étape pour ouvrir l’onglet</span>
        </div>
        <div className="factures-suivi-pipeline">
          {dashboard.parEtape.map((kpi) => (
            <button
              key={kpi.stage}
              type="button"
              className={`card card-glow ${STAGE_GLOW[kpi.stage]} factures-suivi-stage-card`}
              onClick={() => onOpenStage?.(kpi.stage)}
            >
              <div className="card-label">{FACTURE_TAB_LABELS[kpi.stage]}</div>
              <div className="card-value">{kpi.count}</div>
              <div className="travel-history-card-meta">{formatUsdLike(kpi.montant)} $</div>
            </button>
          ))}
        </div>
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
