'use client';

import DependantsAgeTrancheChart from '@/components/dependants/DependantsAgeTrancheChart';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import DependantsFamilleChart from '@/components/dependants/DependantsFamilleChart';
import {
  EMPTY_LOCALISATION_VALUE,
} from '@/components/dependants/DependantsListTab';
import type { Dependant, DependantsDashboard } from '@/lib/dependants-types';
import type { DependantsDrillQuery } from '@/lib/dependants-utils';

interface Props {
  dashboard: DependantsDashboard;
  /** Bénéficiaires déjà filtrés (localisation dashboard). */
  dependants: Dependant[];
  localisationOptions: string[];
  hasEmptyLocalisation?: boolean;
  localisationFilter: string;
  onLocalisationFilterChange: (value: string) => void;
  onOpenDrilldown: (query: DependantsDrillQuery) => void;
}

const KPI_GLOW = ['card-glow-cyan', 'card-glow-violet', 'card-glow-green', 'card-glow-red'] as const;

function formatKpiValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function isKpiDrillable(label: string): boolean {
  return !label.trim().toLowerCase().includes('moyenne');
}

export default function DependantsDashboardView({
  dashboard,
  dependants,
  localisationOptions,
  hasEmptyLocalisation = false,
  localisationFilter,
  onLocalisationFilterChange,
  onOpenDrilldown,
}: Props) {
  const primaryKpis = dashboard.kpis.slice(0, 5);
  const secondaryKpis = dashboard.kpis.slice(5);

  return (
    <div className="travel-history-dashboard dependants-dashboard">
      <div className="dependants-dashboard-filters">
        <label className="dependants-dashboard-filter">
          <span>Localisation</span>
          <select
            className="filter-select"
            value={localisationFilter}
            onChange={(event) => onLocalisationFilterChange(event.target.value)}
          >
            <option value="">Toutes les localisations</option>
            {hasEmptyLocalisation ? (
              <option value={EMPTY_LOCALISATION_VALUE}>Non renseigné</option>
            ) : null}
            {localisationOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="travel-history-cards">
        {primaryKpis.map((kpi, index) => {
          const clickable = isKpiDrillable(kpi.label);
          const className = `card card-glow ${KPI_GLOW[index % KPI_GLOW.length]} travel-history-card${
            clickable ? ' dependants-kpi-clickable' : ''
          }`;
          if (!clickable) {
            return (
              <div key={kpi.label} className={className}>
                <div className="card-label">{kpi.label}</div>
                <div className="card-value">{formatKpiValue(kpi.value)}</div>
              </div>
            );
          }
          return (
            <button
              key={kpi.label}
              type="button"
              className={className}
              onClick={() => onOpenDrilldown({ kind: 'kpi', label: kpi.label })}
              title={`Voir la liste — ${kpi.label}`}
            >
              <div className="card-label">{kpi.label}</div>
              <div className="card-value">{formatKpiValue(kpi.value)}</div>
            </button>
          );
        })}
      </div>

      {secondaryKpis.length > 0 && (
        <div className="dependants-kpi-grid">
          {secondaryKpis.map((kpi) => {
            const clickable = isKpiDrillable(kpi.label);
            if (!clickable) {
              return (
                <div key={kpi.label} className="dependants-kpi-item">
                  <span className="dependants-kpi-label">{kpi.label}</span>
                  <strong className="dependants-kpi-value">{formatKpiValue(kpi.value)}</strong>
                </div>
              );
            }
            return (
              <button
                key={kpi.label}
                type="button"
                className="dependants-kpi-item dependants-kpi-clickable"
                onClick={() => onOpenDrilldown({ kind: 'kpi', label: kpi.label })}
                title={`Voir la liste — ${kpi.label}`}
              >
                <span className="dependants-kpi-label">{kpi.label}</span>
                <strong className="dependants-kpi-value">{formatKpiValue(kpi.value)}</strong>
              </button>
            );
          })}
        </div>
      )}

      <div className="dependants-charts-grid">
        <DependantsBarChart
          title="Par statut"
          items={dashboard.parStatut}
          onItemClick={(label) => onOpenDrilldown({ kind: 'statut', label })}
        />
        <DependantsBarChart
          title="Par sexe"
          items={dashboard.parSexe}
          barClassName="dependants-bar-fill-alt"
          onItemClick={(label) => onOpenDrilldown({ kind: 'sexe', label })}
        />
        <div className="dependants-charts-row-pair">
          <DependantsAgeTrancheChart
            items={dashboard.parTrancheAge}
            dependants={dependants}
            localisationOptions={localisationOptions}
            hasEmptyLocalisation={hasEmptyLocalisation}
            onItemClick={(label) => onOpenDrilldown({ kind: 'age-tranche', label })}
          />
          <DependantsFamilleChart data={dashboard.familleRepartition} />
        </div>
      </div>

      <div className="dependants-tables-row">
        <div className="panel dependants-localisation-panel">
          <div className="panel-head">
            <h3>Localisation × statut</h3>
            <span className="dependants-table-hint">Cliquez un chiffre pour ouvrir la liste</span>
          </div>
          <div className="dependants-localisation-table-wrap">
            <table className="dependants-localisation-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th title="Employé(e)">Emp.</th>
                  <th title="Conjoint(e)">Conj.</th>
                  <th title="Enfant">Enf.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.parLocalisationStatut.map((row) => {
                  const total = row.employe + row.conjoint + row.enfant;
                  const openSite = () => onOpenDrilldown({
                    kind: 'localisation',
                    localisation: row.localisation,
                  });
                  return (
                    <tr key={row.localisation}>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn"
                          onClick={openSite}
                          title={`Ouvrir la liste — ${row.localisation}`}
                        >
                          {row.localisation}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn"
                          onClick={() => onOpenDrilldown({
                            kind: 'localisation',
                            localisation: row.localisation,
                            role: 'employe',
                          })}
                          title={`${row.localisation} — Employés`}
                        >
                          {row.employe}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn"
                          onClick={() => onOpenDrilldown({
                            kind: 'localisation',
                            localisation: row.localisation,
                            role: 'conjoint',
                          })}
                          title={`${row.localisation} — Conjoints`}
                        >
                          {row.conjoint}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn"
                          onClick={() => onOpenDrilldown({
                            kind: 'localisation',
                            localisation: row.localisation,
                            role: 'enfant',
                          })}
                          title={`${row.localisation} — Enfants`}
                        >
                          {row.enfant}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn is-total"
                          onClick={openSite}
                          title={`${row.localisation} — Total`}
                        >
                          <strong>{total}</strong>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel dependants-localisation-panel">
          <div className="panel-head">
            <h3>Mineurs et majeurs par site</h3>
            <span className="dependants-table-hint">Cliquez un chiffre pour ouvrir la liste</span>
          </div>
          <div className="dependants-localisation-table-wrap">
            <table className="dependants-localisation-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th title="Mineurs">Min.</th>
                  <th title="Majeurs">Maj.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.parLocalisationAge.map((row) => {
                  const total = row.mineurs + row.majeurs;
                  const openSite = () => onOpenDrilldown({
                    kind: 'localisation-age',
                    localisation: row.localisation,
                  });
                  return (
                    <tr key={row.localisation}>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn"
                          onClick={openSite}
                          title={`Ouvrir la liste — ${row.localisation}`}
                        >
                          {row.localisation}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn"
                          onClick={() => onOpenDrilldown({
                            kind: 'localisation-age',
                            localisation: row.localisation,
                            ageGroup: 'mineurs',
                          })}
                          title={`${row.localisation} — Mineurs`}
                        >
                          {row.mineurs}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn"
                          onClick={() => onOpenDrilldown({
                            kind: 'localisation-age',
                            localisation: row.localisation,
                            ageGroup: 'majeurs',
                          })}
                          title={`${row.localisation} — Majeurs`}
                        >
                          {row.majeurs}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="dependants-localisation-cell-btn is-total"
                          onClick={openSite}
                          title={`${row.localisation} — Total`}
                        >
                          <strong>{total}</strong>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {dashboard.indicateurs.length > 0 && (
        <div className="dependants-indicateurs-section">
          <h3 className="dependants-section-title">Totaux par localisation</h3>
          <div className="dependants-indicateurs">
            {dashboard.indicateurs.map((item) => (
              <button
                key={item.label}
                type="button"
                className="dependants-indicateur-card dependants-indicateur-card-btn"
                onClick={() => onOpenDrilldown({
                  kind: 'localisation',
                  localisation: item.label,
                })}
                title={`Ouvrir la liste — ${item.label}`}
              >
                <span className="dependants-kpi-label">{item.label}</span>
                <strong className="dependants-kpi-value">{item.value}</strong>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
