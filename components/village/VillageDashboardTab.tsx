'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import VillageDrilldownModal from '@/components/village/VillageDrilldownModal';
import VillageSkeleton from '@/components/village/VillageSkeleton';
import type { Dependant } from '@/lib/dependants-types';
import type { Employee } from '@/lib/types';
import {
  buildMaisonOccupancy,
  buildVillageDashboardStats,
  buildVillageDrilldownFromAgents,
  buildVillageDrilldownFromEmployees,
  buildVillageDrilldownFromMaisons,
  buildVillageDrilldownFromQuiOu,
  buildZambaAgentsFromEmployees,
  filterOccupancyByType,
  filterQuiOuByDeptType,
  HORS_EFFECTIF_DEPT,
  listOtherLocalisationEmployees,
  splitVillageKimpese,
  type VillageDrilldownRow,
} from '@/lib/village-agents';
import type { VillageMaison, VillageTaille } from '@/lib/village-types';

function ClickNum({
  value,
  onClick,
  className = '',
  title,
}: {
  value: number;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  if (!value) {
    return <span className={className}>—</span>;
  }
  return (
    <button
      type="button"
      className={`village-dash-num${className ? ` ${className}` : ''}`}
      onClick={onClick}
      title={title ?? 'Voir le détail'}
    >
      {value}
    </button>
  );
}

export default function VillageDashboardTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [maisons, setMaisons] = useState<VillageMaison[]>([]);
  const [tailles, setTailles] = useState<VillageTaille[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    rows: VillageDrilldownRow[];
    showLocalisation?: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resEmployees, resDependants, resMaisons] = await Promise.all([
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/dependants', { cache: 'no-store' }),
        fetch('/api/village/maisons', { cache: 'no-store' }),
      ]);
      const employeesJson = (await resEmployees.json()) as Employee[] | { error?: string };
      const dependantsJson = (await resDependants.json()) as { dependants?: Dependant[] };
      const maisonsJson = (await resMaisons.json()) as {
        maisons?: VillageMaison[];
        tailles?: VillageTaille[];
        error?: string;
      };
      setEmployees(Array.isArray(employeesJson) ? employeesJson : []);
      setDependants(dependantsJson.dependants ?? []);
      setMaisons(maisonsJson.maisons ?? []);
      setTailles(maisonsJson.tailles ?? []);
    } catch {
      setEmployees([]);
      setDependants([]);
      setMaisons([]);
      setTailles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => buildVillageDashboardStats(employees, dependants, maisons, tailles),
    [employees, dependants, maisons, tailles],
  );

  const zamba = useMemo(
    () => buildZambaAgentsFromEmployees(employees, dependants),
    [employees, dependants],
  );
  const { village, kimpese } = useMemo(() => splitVillageKimpese(zamba), [zamba]);

  const occupancy = useMemo(
    () => buildMaisonOccupancy(maisons, tailles, village, dependants),
    [maisons, tailles, village, dependants],
  );

  const deptTailleColTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const col of stats.tailleColumns) totals[col] = 0;
    for (const row of stats.parDepartementTaille) {
      for (const col of stats.tailleColumns) {
        totals[col] = (totals[col] ?? 0) + (row.counts[col] ?? 0);
      }
    }
    return totals;
  }, [stats.parDepartementTaille, stats.tailleColumns]);

  const openAgents = (title: string, list: typeof zamba) => {
    setDrilldown({
      title,
      rows: buildVillageDrilldownFromAgents(list, dependants),
    });
  };

  const openMaisons = (
    title: string,
    typeLabel: string | null,
    mode: 'all' | 'occupees' | 'vides',
  ) => {
    const list = filterOccupancyByType(occupancy, tailles, typeLabel, mode);
    setDrilldown({
      title,
      rows: buildVillageDrilldownFromMaisons(list, dependants),
    });
  };

  const openQuiOu = (
    title: string,
    departement: string | null,
    typeLabel: string | null,
  ) => {
    const filtered = filterQuiOuByDeptType(
      stats.quiOu,
      tailles,
      departement,
      typeLabel,
    );
    setDrilldown({
      title,
      rows: buildVillageDrilldownFromQuiOu(filtered, dependants),
    });
  };

  if (loading) {
    return (
      <div className="village-dashboard-tab">
        <div className="panel panel-padded village-maisons-panel">
          <VillageSkeleton variant="dashboard" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="village-dashboard-tab">
        <div className="travel-history-cards village-dependants-kpis">
          <button
            type="button"
            className="card card-glow card-glow-cyan travel-history-card dependants-kpi-clickable"
            onClick={() => openAgents('Zamba (agents)', zamba)}
            title="Voir la liste des agents Zamba"
          >
            <div className="card-label">Zamba (agents)</div>
            <div className="card-value">{stats.zamba}</div>
            <div className="card-sub">
              {stats.zambaPersonnes} avec famille
            </div>
          </button>
          <button
            type="button"
            className="card card-glow card-glow-green travel-history-card dependants-kpi-clickable"
            onClick={() => openAgents('Village (avec maison)', village)}
            title="Voir les agents avec maison"
          >
            <div className="card-label">Village (avec maison)</div>
            <div className="card-value">{stats.village}</div>
            <div className="card-sub">
              {stats.villagePersonnes} avec famille
            </div>
          </button>
          <button
            type="button"
            className="card card-glow card-glow-red travel-history-card dependants-kpi-clickable"
            onClick={() => openAgents('Habitant à Kimpese', kimpese)}
            title="Voir les agents à Kimpese"
          >
            <div className="card-label">Habitant à Kimpese</div>
            <div className="card-value">{stats.kimpese}</div>
            <div className="card-sub">
              {stats.kimpesePersonnes} avec famille
            </div>
          </button>
          <button
            type="button"
            className="card card-glow card-glow-violet travel-history-card dependants-kpi-clickable"
            onClick={() => {
              const others = listOtherLocalisationEmployees(employees, zamba);
              setDrilldown({
                title: 'Autres localisations',
                rows: buildVillageDrilldownFromEmployees(others, dependants),
                showLocalisation: true,
              });
            }}
            title="Voir les autres localisations"
          >
            <div className="card-label">Autres localisations</div>
            <div className="card-value">{stats.autres}</div>
          </button>
        </div>

        <div style={{ height: 14 }} />

        <div className="travel-history-cards village-dependants-kpis village-maisons-kpi-row">
          <button
            type="button"
            className="card card-glow card-glow-cyan travel-history-card dependants-kpi-clickable"
            onClick={() => openMaisons('Maisons (total)', null, 'all')}
            title="Voir toutes les maisons"
          >
            <div className="card-label">Maisons (total)</div>
            <div className="card-value">{stats.maisonsTotal}</div>
          </button>
          <button
            type="button"
            className="card card-glow card-glow-green travel-history-card dependants-kpi-clickable"
            onClick={() => openMaisons('Maisons occupées', null, 'occupees')}
            title="Voir les maisons occupées"
          >
            <div className="card-label">Maisons occupées</div>
            <div className="card-value">{stats.maisonsOccupees}</div>
          </button>
          <button
            type="button"
            className="card card-glow card-glow-amber travel-history-card dependants-kpi-clickable"
            onClick={() => openMaisons('Maisons vides', null, 'vides')}
            title="Voir les maisons vides"
          >
            <div className="card-label">Maisons vides</div>
            <div className="card-value">{stats.maisonsVides}</div>
          </button>
        </div>

        <div className="village-tables-duo">
          <div className="panel panel-padded village-par-taille-panel">
            <div className="panel-head village-quiou-head">
              <div>
                <h3>Maisons par type</h3>
                <span className="panel-meta">Répartition occupées / vides</span>
              </div>
            </div>
            <div className="village-par-taille-scroll">
              <table className="dependants-table village-par-taille-table">
                <thead>
                  <tr>
                    <th>Type de maison</th>
                    <th className="num">Total</th>
                    <th className="num">Occupées</th>
                    <th className="num">Vides</th>
                    <th>Répartition</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.parTaille.length ? (
                    <>
                      {stats.parTaille.map((row) => {
                        const occPct = row.total
                          ? Math.round((row.occupees / row.total) * 100)
                          : 0;
                        return (
                          <tr key={row.label}>
                            <td className="village-par-taille-label">{row.label}</td>
                            <td className="num">
                              <ClickNum
                                value={row.total}
                                className=""
                                title={`Maisons ${row.label} — total`}
                                onClick={() =>
                                  openMaisons(`Maisons — ${row.label}`, row.label, 'all')
                                }
                              />
                            </td>
                            <td className="num village-par-taille-occ">
                              <ClickNum
                                value={row.occupees}
                                className="village-par-taille-occ"
                                title={`Maisons ${row.label} — occupées`}
                                onClick={() =>
                                  openMaisons(
                                    `Maisons occupées — ${row.label}`,
                                    row.label,
                                    'occupees',
                                  )
                                }
                              />
                            </td>
                            <td className="num village-par-taille-vide">
                              <ClickNum
                                value={row.vides}
                                className="village-par-taille-vide"
                                title={`Maisons ${row.label} — vides`}
                                onClick={() =>
                                  openMaisons(
                                    `Maisons vides — ${row.label}`,
                                    row.label,
                                    'vides',
                                  )
                                }
                              />
                            </td>
                            <td>
                              <div
                                className="village-par-taille-bar-cell"
                                title={`${occPct}% occupées · ${100 - occPct}% vides`}
                              >
                                <div className="village-par-taille-bar">
                                  <span
                                    className="village-par-taille-bar-occ"
                                    style={{ width: `${occPct}%` }}
                                  />
                                  <span
                                    className="village-par-taille-bar-vide"
                                    style={{ width: `${100 - occPct}%` }}
                                  />
                                </div>
                                <span className="village-par-taille-pct">{occPct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const totalPct = stats.maisonsTotal
                          ? Math.round((stats.maisonsOccupees / stats.maisonsTotal) * 100)
                          : 0;
                        return (
                          <tr className="village-par-taille-total">
                            <td>Total</td>
                            <td className="num">
                              <ClickNum
                                value={stats.maisonsTotal}
                                onClick={() => openMaisons('Maisons (total)', null, 'all')}
                              />
                            </td>
                            <td className="num village-par-taille-occ">
                              <ClickNum
                                value={stats.maisonsOccupees}
                                className="village-par-taille-occ"
                                onClick={() =>
                                  openMaisons('Maisons occupées', null, 'occupees')
                                }
                              />
                            </td>
                            <td className="num village-par-taille-vide">
                              <ClickNum
                                value={stats.maisonsVides}
                                className="village-par-taille-vide"
                                onClick={() => openMaisons('Maisons vides', null, 'vides')}
                              />
                            </td>
                            <td>
                              <div className="village-par-taille-bar-cell">
                                <div className="village-par-taille-bar">
                                  <span
                                    className="village-par-taille-bar-occ"
                                    style={{ width: `${totalPct}%` }}
                                  />
                                  <span
                                    className="village-par-taille-bar-vide"
                                    style={{ width: `${100 - totalPct}%` }}
                                  />
                                </div>
                                <span className="village-par-taille-pct">{totalPct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </>
                  ) : (
                    <tr>
                      <td colSpan={5} className="empty-cell">Aucun type de maison.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel panel-padded village-par-taille-panel">
            <div className="panel-head village-quiou-head">
              <div>
                <h3>Par département</h3>
                <span className="panel-meta">Département × type de maison</span>
              </div>
            </div>
            <div className="village-par-taille-scroll village-dept-taille-scroll">
              <table className="dependants-table village-dept-taille-table">
                <thead>
                  <tr>
                    <th>Département</th>
                    {stats.tailleColumns.map((col) => (
                      <th key={col} className="num">{col}</th>
                    ))}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.parDepartementTaille.length ? (
                    <>
                      {stats.parDepartementTaille.map((row) => (
                        <tr
                          key={row.departement}
                          className={
                            row.departement === HORS_EFFECTIF_DEPT
                              ? 'village-hors-effectif-row'
                              : undefined
                          }
                        >
                          <td className="village-par-taille-label">
                            {row.departement === HORS_EFFECTIF_DEPT ? (
                              <span className="village-occupant-externe">{row.departement}</span>
                            ) : (
                              row.departement
                            )}
                          </td>
                          {stats.tailleColumns.map((col) => {
                            const n = row.counts[col] ?? 0;
                            return (
                              <td key={col} className={`num${n ? '' : ' is-zero'}`}>
                                <ClickNum
                                  value={n}
                                  title={`${row.departement} · ${col}`}
                                  onClick={() =>
                                    openQuiOu(
                                      `${row.departement} — ${col}`,
                                      row.departement,
                                      col,
                                    )
                                  }
                                />
                              </td>
                            );
                          })}
                          <td className="num">
                            <ClickNum
                              value={row.total}
                              title={`Total — ${row.departement}`}
                              onClick={() =>
                                openQuiOu(
                                  `Département — ${row.departement}`,
                                  row.departement,
                                  null,
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="village-par-taille-total">
                        <td>Total</td>
                        {stats.tailleColumns.map((col) => {
                          const n = deptTailleColTotals[col] ?? 0;
                          return (
                            <td key={col} className="num">
                              <ClickNum
                                value={n}
                                title={`Total — ${col}`}
                                onClick={() =>
                                  openQuiOu(`Type — ${col}`, null, col)
                                }
                              />
                            </td>
                          );
                        })}
                        <td className="num">
                          <ClickNum
                            value={stats.parDepartementTaille.reduce((s, r) => s + r.total, 0)}
                            title="Toutes les affectations"
                            onClick={() => openQuiOu('Toutes les affectations', null, null)}
                          />
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td
                        colSpan={Math.max(2, stats.tailleColumns.length + 2)}
                        className="empty-cell"
                      >
                        Aucune affectation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {drilldown && (
        <VillageDrilldownModal
          title={drilldown.title}
          rows={drilldown.rows}
          showLocalisation={drilldown.showLocalisation}
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}
