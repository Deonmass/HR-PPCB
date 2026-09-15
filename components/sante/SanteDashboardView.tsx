'use client';

import DashboardListModal from '@/components/DashboardListModal';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import { formatSanteDateFr, formatSanteMonthLabel, isSanteReference, normalizeSanteType, santeDisplayName } from '@/lib/sante-utils';
import type { SanteDashboard, SanteVisit } from '@/lib/sante-types';
import { useMemo, useState } from 'react';

interface Props {
  dashboard: SanteDashboard;
  visits: SanteVisit[];
}

type Drill = { title: string; rows: SanteVisit[] } | null;

const KPI_GLOW = ['card-glow-cyan', 'card-glow-violet', 'card-glow-green', 'card-glow-red'] as const;

export default function SanteDashboardView({ dashboard, visits }: Props) {
  const [drill, setDrill] = useState<Drill>(null);

  const openList = (title: string, rows: SanteVisit[]) => setDrill({ title, rows });

  const kpiRows = useMemo(() => {
    const map: Record<string, (v: SanteVisit) => boolean> = {
      'Total de cas': () => true,
      Hommes: (v) => v.sexe === 'M',
      Femmes: (v) => v.sexe === 'F',
      Référés: (v) => isSanteReference(v.reference),
      Agents: (v) => normalizeSanteType(v.typeMalade) === 'AGENT',
      Enfants: (v) => normalizeSanteType(v.typeMalade) === 'ENFANT',
      Épouses: (v) => normalizeSanteType(v.typeMalade) === 'EPOUSE',
      Contractants: (v) => normalizeSanteType(v.typeMalade) === 'CONTRACTANT',
    };
    return map;
  }, []);

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'patient', label: 'Patient' },
    { key: 'lien', label: 'Agent lié' },
    { key: 'type', label: 'Type' },
    { key: 'pathologie', label: 'Pathologie' },
    { key: 'traitement', label: 'Traitement' },
  ];

  const toRows = (rows: SanteVisit[]) =>
    rows.map((visit) => ({
      id: visit.id,
      cells: {
        date: formatSanteDateFr(visit.date),
        patient: santeDisplayName(visit),
        lien: visit.employeeMatricule
          ? `${visit.employeeNom || '—'} · ${visit.employeeMatricule}`
          : '—',
        type: visit.typeMalade,
        pathologie: visit.pathologie,
        traitement: visit.traitement,
      },
    }));

  const primary = dashboard.kpis.slice(0, 4);
  const secondary = dashboard.kpis.slice(4);

  return (
    <div className="travel-history-dashboard dependants-dashboard sante-dashboard">
      <div className="travel-history-cards">
        {primary.map((kpi, index) => (
          <button
            key={kpi.label}
            type="button"
            className={`card card-glow ${KPI_GLOW[index % KPI_GLOW.length]} travel-history-card dependants-kpi-clickable`}
            title={`Voir la liste — ${kpi.label}`}
            onClick={() =>
              openList(
                kpi.label,
                visits.filter(kpiRows[kpi.label] ?? (() => true)),
              )
            }
          >
            <div className="card-label">{kpi.label}</div>
            <div className="card-value">{kpi.value}</div>
          </button>
        ))}
      </div>

      {secondary.length > 0 ? (
        <div className="dependants-kpi-grid">
          {secondary.map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              className="dependants-kpi-item dependants-kpi-clickable"
              title={`Voir la liste — ${kpi.label}`}
              onClick={() =>
                openList(kpi.label, visits.filter(kpiRows[kpi.label] ?? (() => true)))
              }
            >
              <span className="dependants-kpi-label">{kpi.label}</span>
              <strong className="dependants-kpi-value">{kpi.value}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="dependants-charts-grid sante-charts-grid">
        <DependantsBarChart
          title="Cas par type de malade"
          items={dashboard.byType}
          barClassName="sante-bar-fill sante-bar-fill-type"
          onItemClick={(label) =>
            openList(
              `Type — ${label}`,
              visits.filter((v) => normalizeSanteType(v.typeMalade) === normalizeSanteType(label)),
            )
          }
        />
        <DependantsBarChart
          title="Pathologies"
          items={dashboard.byPathologie}
          barClassName="sante-bar-fill sante-bar-fill-pathologie"
          onItemClick={(label) =>
            openList(
              `Pathologie — ${label}`,
              visits.filter((v) => v.pathologie === label),
            )
          }
        />
        <DependantsBarChart
          title="Traitements"
          items={dashboard.byTraitement}
          barClassName="sante-bar-fill sante-bar-fill-traitement"
          onItemClick={(label) =>
            openList(
              `Traitement — ${label}`,
              visits.filter((v) => v.traitement === label),
            )
          }
        />
        <DependantsBarChart
          title="Évolution mensuelle"
          items={dashboard.byMonth}
          barClassName="sante-bar-fill sante-bar-fill-month"
          onItemClick={(label) =>
            openList(
              `Mois — ${label}`,
              visits.filter((v) => formatSanteMonthLabel(v.year, v.month) === label),
            )
          }
        />
      </div>

      {dashboard.byReference.length > 0 ? (
        <DependantsBarChart
          title="Références hospitalières"
          items={dashboard.byReference}
          barClassName="sante-bar-fill sante-bar-fill-reference"
          onItemClick={(label) =>
            openList(
              `Référence — ${label}`,
              visits.filter((v) => v.reference === label),
            )
          }
        />
      ) : null}

      {drill ? (
        <DashboardListModal
          title={`Voir la liste — ${drill.title}`}
          columns={columns}
          rows={toRows(drill.rows)}
          onClose={() => setDrill(null)}
          searchPlaceholder="Rechercher un patient…"
        />
      ) : null}
    </div>
  );
}
