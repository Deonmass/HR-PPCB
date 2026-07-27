'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DependantsDashboardView from '@/components/dependants/DependantsDashboardView';
import DependantsDrilldownModal from '@/components/dependants/DependantsDrilldownModal';
import DependantsListTab, {
  DependantsFilterBar,
  EMPTY_LOCALISATION_VALUE,
  matchesDependantFilters,
  type DependantFilters,
} from '@/components/dependants/DependantsListTab';
import PactilisVerifyModal from '@/components/dependants/PactilisVerifyModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { downloadDependantsExport } from '@/lib/dependants-export';
import type { Dependant } from '@/lib/dependants-types';
import {
  buildDashboardFromDependants,
  applyFamilyCompositionToEmployee,
  needsSchoolingProof,
  countNeedsSchoolingProof,
  resolveDependantsDrilldown,
  type DependantsDrillQuery,
} from '@/lib/dependants-utils';
import { showError } from '@/lib/swal';

type Tab = 'dashboard' | 'liste' | 'scolarise' | 'exit';

const DEFAULT_FILTERS: DependantFilters = {
  search: '',
  statut: '',
  localisation: '',
  departement: '',
  emptyField: '',
};

export default function DependantsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [exitedDependants, setExitedDependants] = useState<Dependant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pactilisOpen, setPactilisOpen] = useState(false);
  const [filters, setFilters] = useState<DependantFilters>(DEFAULT_FILTERS);
  const [exitFilters, setExitFilters] = useState<DependantFilters>(DEFAULT_FILTERS);
  const [scolariseFilters, setScolariseFilters] = useState<DependantFilters>(DEFAULT_FILTERS);
  const [dashboardLocalisation, setDashboardLocalisation] = useState('');
  const [drilldown, setDrilldown] = useState<{ title: string; items: Dependant[] } | null>(null);

  const canExport = can('employes.dependants', 'export');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const res = await fetch('/api/dependants');
    const data = await res.json();
    setDependants(data.dependants ?? []);
    setExitedDependants(data.exitedDependants ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const listSource =
    tab === 'exit' ? exitedDependants : dependants;
  const listFilters =
    tab === 'exit' ? exitFilters : tab === 'scolarise' ? scolariseFilters : filters;

  const filteredCount = useMemo(() => {
    if (tab === 'scolarise') {
      return dependants
        .filter(needsSchoolingProof)
        .filter((item) => matchesDependantFilters(item, scolariseFilters)).length;
    }
    return listSource.filter((item) => matchesDependantFilters(item, listFilters)).length;
  }, [tab, listSource, listFilters, dependants, scolariseFilters]);

  const exitEmployeeCount = useMemo(
    () => exitedDependants.filter((d) => /employ/i.test(d.statut)).length,
    [exitedDependants],
  );

  const scolariseCount = useMemo(
    () => countNeedsSchoolingProof(dependants),
    [dependants],
  );

  const hasEmptyLocalisation = useMemo(
    () => dependants.some((item) => !item.localisation.trim()),
    [dependants],
  );

  const localisationOptions = useMemo(
    () => [...new Set(dependants.map((item) => item.localisation).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')),
    [dependants],
  );

  const filteredDashboardDependants = useMemo(() => {
    if (!dashboardLocalisation) return dependants;
    if (dashboardLocalisation === EMPTY_LOCALISATION_VALUE) {
      return dependants.filter((item) => !item.localisation.trim());
    }
    return dependants.filter((item) => item.localisation === dashboardLocalisation);
  }, [dependants, dashboardLocalisation]);

  const liveDashboard = useMemo(
    () => buildDashboardFromDependants(filteredDashboardDependants),
    [filteredDashboardDependants],
  );

  const openDrilldown = useCallback((query: DependantsDrillQuery) => {
    const resolved = resolveDependantsDrilldown(filteredDashboardDependants, query);
    if (!resolved) return;
    setDrilldown(resolved);
  }, [filteredDashboardDependants]);

  const handleDependantSaved = useCallback((dependant: Dependant, action: 'create' | 'update') => {
    setDependants((prev) => {
      const next = action === 'create'
        ? [...prev, dependant]
        : prev.map((item) => (item.id === dependant.id ? dependant : item));
      const withComposition = applyFamilyCompositionToEmployee(next, dependant.matricule);
      return withComposition;
    });
  }, []);

  const handleDependantDeleted = useCallback((id: number) => {
    setDependants((prev) => {
      const removed = prev.find((item) => item.id === id);
      const next = prev.filter((item) => item.id !== id);
      const withComposition = removed
        ? applyFamilyCompositionToEmployee(next, removed.matricule)
        : next;
      return withComposition;
    });
  }, []);

  const handleFamilyUpdated = useCallback((updated: Dependant[]) => {
    setDependants((prev) => {
      const byId = new Map(updated.map((item) => [item.id, item]));
      return prev.map((item) => byId.get(item.id) ?? item);
    });
  }, []);

  const handleExitedDependantSaved = useCallback((dependant: Dependant, action: 'create' | 'update') => {
    setExitedDependants((prev) => {
      const next = action === 'create'
        ? [...prev, dependant]
        : prev.map((item) => (item.id === dependant.id ? dependant : item));
      return applyFamilyCompositionToEmployee(next, dependant.matricule);
    });
  }, []);

  const handleExitedDependantDeleted = useCallback((id: number) => {
    setExitedDependants((prev) => {
      const removed = prev.find((item) => item.id === id);
      const next = prev.filter((item) => item.id !== id);
      return removed
        ? applyFamilyCompositionToEmployee(next, removed.matricule)
        : next;
    });
  }, []);

  const handleExitedFamilyUpdated = useCallback((updated: Dependant[]) => {
    setExitedDependants((prev) => {
      const byId = new Map(updated.map((item) => [item.id, item]));
      return prev.map((item) => byId.get(item.id) ?? item);
    });
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadDependantsExport();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  }, []);

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'employes.dependants', action: 'view' },
      ]}
    >
      <div className="dependants-page">
        <div className="dependants-sticky check-docs-sticky">
          <div className="page-header page-header-with-tabs check-docs-header dependants-header">
            <div className="check-docs-header-left">
              <div className="page-header-title-row">
                <h2>Dependants</h2>
                <RefreshButton onClick={() => load(true)} loading={refreshing} />
              </div>
              <p className="dependants-header-sub">
                {tab === 'exit'
                  ? `${filteredCount} / ${exitedDependants.length} bénéficiaires · sortis (EXIT)`
                  : tab === 'scolarise'
                    ? `${filteredCount} enfant(s) ≥ 21 ans sans preuve de scolarisation`
                    : tab === 'liste'
                      ? `${filteredCount} / ${dependants.length} bénéficiaires · liste filtrée`
                      : dashboardLocalisation
                        ? `${filteredDashboardDependants.length} bénéficiaires · ${
                          dashboardLocalisation === EMPTY_LOCALISATION_VALUE
                            ? 'Non renseigné'
                            : dashboardLocalisation
                        }`
                        : `${dependants.length} bénéficiaires · prise en charge médicale`}
              </p>
            </div>
            <div className="check-docs-header-actions">
              <div className="dependants-header-controls">
                <div className="tabs header-tabs header-tabs-compact">
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`}
                    onClick={() => setTab('dashboard')}
                  >
                    Dashboard
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === 'liste' ? ' active' : ''}`}
                    onClick={() => setTab('liste')}
                  >
                    Liste
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === 'scolarise' ? ' active' : ''}`}
                    onClick={() => setTab('scolarise')}
                  >
                    Scolarisé
                    {scolariseCount > 0 ? (
                      <span className="dependants-tab-count">{scolariseCount}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === 'exit' ? ' active' : ''}`}
                    onClick={() => setTab('exit')}
                  >
                    Exit
                    {exitEmployeeCount > 0 ? (
                      <span className="dependants-tab-count">{exitEmployeeCount}</span>
                    ) : null}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm check-docs-export-btn btn-with-icon"
                  onClick={() => setPactilisOpen(true)}
                  title="Comparer avec l'extract Pactilis"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Vérifier la liste Pactilis
                </button>
                {canExport && (
                  <button
                    type="button"
                    className="btn btn-outline btn-export btn-sm check-docs-export-btn btn-with-icon"
                    onClick={() => void handleExport()}
                    disabled={exporting}
                    title="Exporter les feuilles DEPENDANTS et RESUME"
                  >
                    {exporting ? (
                      <span className="btn-spinner" aria-hidden="true" />
                    ) : (
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                    {exporting ? 'Export…' : 'Export'}
                  </button>
                )}
              </div>
            </div>
          </div>
          {tab === 'liste' && (
            <DependantsFilterBar
              dependants={dependants}
              filters={filters}
              onFiltersChange={setFilters}
            />
          )}
          {tab === 'scolarise' && (
            <DependantsFilterBar
              dependants={dependants.filter(needsSchoolingProof)}
              filters={scolariseFilters}
              onFiltersChange={setScolariseFilters}
            />
          )}
          {tab === 'exit' && (
            <DependantsFilterBar
              dependants={exitedDependants}
              filters={exitFilters}
              onFiltersChange={setExitFilters}
            />
          )}
        </div>

        {tab === 'liste' ? (
          <DependantsListTab
            dependants={dependants}
            filters={filters}
            onDependantSaved={handleDependantSaved}
            onDependantDeleted={handleDependantDeleted}
            onFamilyUpdated={handleFamilyUpdated}
          />
        ) : tab === 'scolarise' ? (
          <DependantsListTab
            dependants={dependants}
            filters={scolariseFilters}
            onDependantSaved={handleDependantSaved}
            onDependantDeleted={handleDependantDeleted}
            onFamilyUpdated={handleFamilyUpdated}
            highlightRow={needsSchoolingProof}
            onlyHighlightedFamilies
            onlyHighlightedMembers
          />
        ) : tab === 'exit' ? (
          <DependantsListTab
            dependants={exitedDependants}
            filters={exitFilters}
            onDependantSaved={handleExitedDependantSaved}
            onDependantDeleted={handleExitedDependantDeleted}
            onFamilyUpdated={handleExitedFamilyUpdated}
          />
        ) : (
          <div className="dependants-dashboard-body">
            <DependantsDashboardView
              dashboard={liveDashboard}
              localisationOptions={localisationOptions}
              hasEmptyLocalisation={hasEmptyLocalisation}
              localisationFilter={dashboardLocalisation}
              onLocalisationFilterChange={setDashboardLocalisation}
              onOpenDrilldown={openDrilldown}
            />
          </div>
        )}

        {drilldown && (
          <DependantsDrilldownModal
            title={drilldown.title}
            dependants={drilldown.items
              .map((item) => dependants.find((d) => d.id === item.id) ?? item)
              .filter((item) => dependants.some((d) => d.id === item.id))}
            allDependants={dependants}
            onClose={() => setDrilldown(null)}
            onDependantSaved={(saved, action) => {
              handleDependantSaved(saved, action);
              setDrilldown((prev) => {
                if (!prev) return prev;
                const nextItems = action === 'create'
                  ? [...prev.items, saved]
                  : prev.items.map((item) => (item.id === saved.id ? saved : item));
                return { ...prev, items: nextItems };
              });
            }}
            onDependantDeleted={(id) => {
              handleDependantDeleted(id);
              setDrilldown((prev) => (
                prev ? { ...prev, items: prev.items.filter((item) => item.id !== id) } : prev
              ));
            }}
            onFamilyUpdated={(updated) => {
              handleFamilyUpdated(updated);
              const byId = new Map(updated.map((item) => [item.id, item]));
              setDrilldown((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  items: prev.items.map((item) => byId.get(item.id) ?? item),
                };
              });
            }}
          />
        )}

        <PactilisVerifyModal
          open={pactilisOpen}
          onClose={() => setPactilisOpen(false)}
          onConsolidated={() => void load(true)}
        />
      </div>
    </PermissionGate>
  );
}
