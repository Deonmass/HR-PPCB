'use client';

import { useCallback, useEffect, useState } from 'react';
import ProjectDashboardView from '@/components/ProjectDashboardView';
import RefreshButton from '@/components/RefreshButton';
import { fetchProjectsData } from '@/lib/fetch-projects-api';
import type { ProjectsData } from '@/lib/project-types';

type DashTab = 'csr' | 'cc';

export default function ProjectDashboardPage() {
  const [data, setData] = useState<ProjectsData | null>(null);
  const [tab, setTab] = useState<DashTab>('csr');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const json = await fetchProjectsData();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dashboard = tab === 'csr' ? data?.dashboards.csr : data?.dashboards.cc;
  const typeProjet = tab === 'csr' ? 'CSR' : 'Cahier de charges';

  return (
    <div className="project-dashboard-page">
      <div className="project-dashboard-sticky">
        <div className="page-header page-header-with-tabs project-dashboard-header">
          <div>
            <div className="page-header-title-row">
              <h2>Dashboard projets</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p>Effectifs et budget — feuilles DASHBOARD CSR / DASHBOARD CC</p>
          </div>
          <div className="tabs header-tabs header-tabs-dashboard">
            <button
              type="button"
              className={`tab-btn tab-btn-dashboard${tab === 'csr' ? ' active' : ''}`}
              onClick={() => setTab('csr')}
            >
              CSR
            </button>
            <button
              type="button"
              className={`tab-btn tab-btn-dashboard${tab === 'cc' ? ' active' : ''}`}
              onClick={() => setTab('cc')}
            >
              Cahier des charges
            </button>
          </div>
        </div>
      </div>

      <div className="project-dashboard-body">
        {loading && <div className="panel panel-padded"><p className="text-muted">Chargement…</p></div>}
        {!loading && dashboard && (
          <ProjectDashboardView
            dashboard={dashboard}
            projects={data?.projects ?? []}
            typeProjet={typeProjet}
          />
        )}
        {!loading && !dashboard && (
          <div className="panel panel-padded">
            <p>Données indisponibles. Lancez <code>npm run import:projects</code>.</p>
          </div>
        )}
      </div>
    </div>
  );
}
