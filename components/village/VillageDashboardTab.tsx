'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import type { Dependant } from '@/lib/dependants-types';
import type { Employee } from '@/lib/types';
import {
  buildVillageDashboardStats,
  buildZambaAgentsFromEmployees,
  HORS_EFFECTIF_DEPT,
  listOtherLocalisationEmployees,
  splitVillageKimpese,
} from '@/lib/village-agents';
import type { VillageMaison, VillageTaille } from '@/lib/village-types';
import VillageSkeleton from '@/components/village/VillageSkeleton';

export default function VillageDashboardTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [maisons, setMaisons] = useState<VillageMaison[]>([]);
  const [tailles, setTailles] = useState<VillageTaille[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    columns: DashboardListColumn[];
    rows: DashboardListRow[];
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
      columns: [
        { key: 'matricule', label: 'Matricule' },
        { key: 'nom', label: 'Nom' },
        { key: 'departement', label: 'Département' },
        { key: 'numeroVilla', label: 'Maison' },
        { key: 'typeMaison', label: 'Type' },
      ],
      rows: list.map((a) => ({
        id: a.matricule,
        cells: {
          matricule: a.matricule,
          nom: a.nom,
          departement: a.departement || '—',
          numeroVilla: a.numeroVilla || '—',
          typeMaison: a.typeMaison || '—',
        },
      })),
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
                columns: [
                  { key: 'matricule', label: 'Matricule' },
                  { key: 'nom', label: 'Nom' },
                  { key: 'localisation', label: 'Localisation' },
                  { key: 'departement', label: 'Département' },
                ],
                rows: others.map((e) => ({
                  id: e.matricule,
                  cells: {
                    matricule: e.matricule,
                    nom: e.nom,
                    localisation: e.localisation || '—',
                    departement: e.departement || '—',
                  },
                })),
              });
            }}
          >
            <div className="card-label">Autres localisations</div>
            <div className="card-value">{stats.autres}</div>
          </button>
        </div>

        <div style={{ height: 14 }} />

        <div className="travel-history-cards village-dependants-kpis village-maisons-kpi-row">
          <div className="card card-glow card-glow-cyan travel-history-card">
            <div className="card-label">Maisons (total)</div>
            <div className="card-value">{stats.maisonsTotal}</div>
          </div>
          <div className="card card-glow card-glow-green travel-history-card">
            <div className="card-label">Maisons occupées</div>
            <div className="card-value">{stats.maisonsOccupees}</div>
          </div>
          <div className="card card-glow card-glow-amber travel-history-card">
            <div className="card-label">Maisons vides</div>
            <div className="card-value">{stats.maisonsVides}</div>
          </div>
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
                            <td className="num">{row.total}</td>
                            <td className="num village-par-taille-occ">{row.occupees}</td>
                            <td className="num village-par-taille-vide">{row.vides}</td>
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
                            <td className="num">{stats.maisonsTotal}</td>
                            <td className="num village-par-taille-occ">{stats.maisonsOccupees}</td>
                            <td className="num village-par-taille-vide">{stats.maisonsVides}</td>
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
                                {n || '—'}
                              </td>
                            );
                          })}
                          <td className="num"><strong>{row.total}</strong></td>
                        </tr>
                      ))}
                      <tr className="village-par-taille-total">
                        <td>Total</td>
                        {stats.tailleColumns.map((col) => (
                          <td key={col} className="num">
                            {deptTailleColTotals[col] ?? 0}
                          </td>
                        ))}
                        <td className="num">
                          {stats.parDepartementTaille.reduce((s, r) => s + r.total, 0)}
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
        <DashboardListModal
          title={drilldown.title}
          columns={drilldown.columns}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}
