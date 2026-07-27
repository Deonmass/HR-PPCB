'use client';

import { useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import SectorBudgetChart from '@/components/SectorBudgetChart';
import { formatUsd, ecartClass, getBudgetRow } from '@/lib/projects';
import type { ProjectDashboard, ProjectRecord } from '@/lib/project-types';

interface Props {
  dashboard: ProjectDashboard;
  projects: ProjectRecord[];
  typeProjet: string;
}

interface StatCardProps {
  label: string;
  count: number;
  prevu: number;
  depense: number;
  glow: string;
  valueClass?: string;
  onClick?: () => void;
}

function StatCard({ label, count, prevu, depense, glow, valueClass, onClick }: StatCardProps) {
  const className = `card card-glow ${glow} project-stat-card${onClick ? ' dependants-kpi-clickable' : ''}`;
  const body = (
    <>
      <div className="card-label">{label}</div>
      <div className={`card-value project-stat-card-count${valueClass ? ` ${valueClass}` : ''}`}>{count}</div>
      <div className="project-stat-card-footer">
        <div className="project-stat-card-budget">
          <span className="project-stat-card-budget-label">Prévu</span>
          <strong>{formatUsd(prevu, 0)}</strong>
        </div>
        <div className="project-stat-card-budget project-stat-card-budget-right">
          <span className="project-stat-card-budget-label">Dépensé</span>
          <strong>{formatUsd(depense, 0)}</strong>
        </div>
      </div>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" className={className} onClick={onClick} title={`Voir la liste — ${label}`}>
      {body}
    </button>
  );
}

interface SectorCardProps {
  name: string;
  count: number;
  prevu: number;
  depense: number;
  ecart: number;
  onClick?: () => void;
}

function SectorCard({ name, count, prevu, depense, ecart, onClick }: SectorCardProps) {
  const className = `card card-glow card-glow-cyan project-sector-card${onClick ? ' dependants-kpi-clickable' : ''}`;
  const body = (
    <>
      <div className="card-label">{name}</div>
      <div className="project-sector-card-count">{count} projet{count !== 1 ? 's' : ''}</div>
      <div className="project-stat-card-footer">
        <div className="project-stat-card-budget">
          <span className="project-stat-card-budget-label">Prévu</span>
          <strong>{formatUsd(prevu, 0)}</strong>
        </div>
        <div className="project-stat-card-budget project-stat-card-budget-right">
          <span className="project-stat-card-budget-label">Dépensé</span>
          <strong>{formatUsd(depense, 0)}</strong>
        </div>
      </div>
      <div className={`project-sector-card-ecart ${ecartClass(ecart)}`}>
        Écart {formatUsd(ecart, 0)}
      </div>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" className={className} onClick={onClick} title={`Voir la liste — ${name}`}>
      {body}
    </button>
  );
}

const PROJECT_COLUMNS: DashboardListColumn[] = [
  { key: 'name', label: 'Projet' },
  { key: 'secteur', label: 'Secteur' },
  { key: 'statut', label: 'Statut' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'prevu', label: 'Prévu', align: 'right' },
  { key: 'depense', label: 'Dépensé', align: 'right' },
];

function normalizeStatusKey(statut: string): 'termine' | 'encours' | 'nonDebute' | 'all' {
  const s = statut.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (s.includes('termin')) return 'termine';
  if (s.includes('cours')) return 'encours';
  if (s.includes('debut') || s.includes('début')) return 'nonDebute';
  return 'all';
}

function toRow(project: ProjectRecord): DashboardListRow {
  return {
    id: project.id,
    cells: {
      name: project.name || '—',
      secteur: project.secteur || '—',
      statut: project.statut || '—',
      responsable: project.responsable || '—',
      prevu: project.budgetPrevu == null ? '—' : formatUsd(project.budgetPrevu, 0),
      depense: formatUsd(project.budgetDepense, 0),
    },
  };
}

export default function ProjectDashboardView({ dashboard, projects, typeProjet }: Props) {
  const { effectifs, budgetByStatus, sectors } = dashboard;
  const countsBySector = sectors.effectifs.counts;
  const [drilldown, setDrilldown] = useState<{ title: string; rows: DashboardListRow[] } | null>(null);

  const scopedProjects = useMemo(
    () => projects.filter((p) => p.typeProjet === typeProjet),
    [projects, typeProjet],
  );

  const totalBudget = getBudgetRow(budgetByStatus, 'total');
  const termineBudget = getBudgetRow(budgetByStatus, 'terminé');
  const encoursBudget = getBudgetRow(budgetByStatus, 'en cours');
  const nonDebuteBudget = getBudgetRow(budgetByStatus, 'non debuté');

  const sectorCards = sectors.budget.filter(
    (row) => row.secteur && row.secteur.trim() && row.secteur.toUpperCase() !== 'TOTAL',
  );

  const openProjects = (title: string, list: ProjectRecord[]) => {
    setDrilldown({ title, rows: list.map(toRow) });
  };

  const byStatus = (key: 'all' | 'termine' | 'encours' | 'nonDebute') => {
    if (key === 'all') return scopedProjects;
    return scopedProjects.filter((p) => normalizeStatusKey(p.statut) === key);
  };

  const bySector = (secteur: string) =>
    scopedProjects.filter((p) => (p.secteur || '').trim() === secteur);

  return (
    <div className="project-dashboard">
      <div className="project-section-divider project-section-divider-first">
        <span>Statut projet</span>
      </div>

      <div className="cards project-cards project-stat-cards">
        <StatCard
          label="Total projets"
          count={effectifs.total}
          prevu={totalBudget?.prevus ?? 0}
          depense={totalBudget?.depense ?? 0}
          glow="card-glow-cyan"
          onClick={() => openProjects('Total projets', byStatus('all'))}
        />
        <StatCard
          label="Terminé"
          count={effectifs.termine}
          prevu={termineBudget?.prevus ?? 0}
          depense={termineBudget?.depense ?? 0}
          glow="card-glow-green"
          valueClass="success"
          onClick={() => openProjects('Projets terminés', byStatus('termine'))}
        />
        <StatCard
          label="En cours"
          count={effectifs.encours}
          prevu={encoursBudget?.prevus ?? 0}
          depense={encoursBudget?.depense ?? 0}
          glow="card-glow-violet"
          onClick={() => openProjects('Projets en cours', byStatus('encours'))}
        />
        <StatCard
          label="Non débuté"
          count={effectifs.nonDebute}
          prevu={nonDebuteBudget?.prevus ?? 0}
          depense={nonDebuteBudget?.depense ?? 0}
          glow="card-glow-red"
          valueClass="danger"
          onClick={() => openProjects('Projets non débutés', byStatus('nonDebute'))}
        />
      </div>

      <div className="project-section-divider">
        <span>Secteurs d&apos;activité</span>
      </div>

      {sectorCards.length > 0 && (
        <>
          <div className="cards project-sector-cards">
            {sectorCards.map((row) => (
              <SectorCard
                key={row.secteur}
                name={String(row.secteur)}
                count={countsBySector[String(row.secteur)] ?? 0}
                prevu={row.prevus}
                depense={row.depense}
                ecart={row.ecart}
                onClick={() => openProjects(`Secteur — ${row.secteur}`, bySector(String(row.secteur)))}
              />
            ))}
          </div>
          <SectorBudgetChart sectors={sectorCards} />
        </>
      )}

      {drilldown && (
        <DashboardListModal
          title={drilldown.title}
          columns={PROJECT_COLUMNS}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
