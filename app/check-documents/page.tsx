'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DocumentsFilterBar from '@/components/DocumentsFilterBar';
import DocumentsGridTab from '@/components/DocumentsGridTab';
import DocumentsInspectionTab from '@/components/DocumentsInspectionTab';
import DocumentsStatsTab from '@/components/DocumentsStatsTab';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { filterEmployees, type EmployeeFilters } from '@/lib/employee-filters';
import {
  downloadCheckDocumentsDashboardExport,
  downloadCheckDocumentsExport,
} from '@/lib/check-documents-export';
import { exportInspections } from '@/lib/excel-export';
import { showError } from '@/lib/swal';
import type { DashboardData, Employee } from '@/lib/types';

type Tab = 'stats' | 'inspection' | 'grid';

const DEFAULT_FILTERS: EmployeeFilters = { search: '', dept: '' };

export default function CheckDocumentsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>('stats');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<EmployeeFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<'nom' | 'pct-asc' | 'pct-desc'>('nom');
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const res = await fetch('/api/check-documents');
    const data = await res.json();
    setEmployees(data.employees ?? []);
    setDashboard(data.dashboard ?? null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEmployees = useMemo(
    () => filterEmployees(employees, filters),
    [employees, filters],
  );

  const handleUpdate = useCallback((updated: Employee) => {
    setEmployees((prev) =>
      prev.map((e) => (e.matricule === updated.matricule ? updated : e)),
    );
  }, []);

  const handleExport = useCallback(async () => {
    if (tab === 'inspection') {
      exportInspections(filteredEmployees, filters);
      return;
    }

    setExporting(true);
    try {
      if (tab === 'stats') {
        await downloadCheckDocumentsDashboardExport(filters);
      } else {
        await downloadCheckDocumentsExport(filters);
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  }, [tab, filteredEmployees, filters]);

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <PermissionGate menuId="employes.check-documents" action="view">
    <div className="check-docs-page">
      <div className="check-docs-sticky">
        <div className="page-header page-header-with-tabs check-docs-header">
          <div className="check-docs-header-left">
            <div className="page-header-title-row">
              <h2>Check documents</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p>19 critères documentaires — conformité des dossiers employés</p>
          </div>
          <div className="check-docs-header-actions">
            <PermissionGate menuId="employes.check-documents" action="export">
              <button
                type="button"
                className="btn btn-outline btn-export btn-sm check-docs-export-btn btn-with-icon"
                onClick={() => void handleExport()}
                disabled={exporting}
                title="Exporter Excel (filtres appliqués)"
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
            </PermissionGate>
            <div className="tabs header-tabs header-tabs-compact">
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'stats' ? ' active' : ''}`}
                onClick={() => setTab('stats')}
              >
                Statistiques
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'inspection' ? ' active' : ''}`}
                onClick={() => setTab('inspection')}
              >
                Inspection
              </button>
              <button
                type="button"
                className={`tab-btn tab-btn-sm${tab === 'grid' ? ' active' : ''}`}
                onClick={() => setTab('grid')}
              >
                Grand tableau
              </button>
            </div>
          </div>
        </div>
        <DocumentsFilterBar
          employees={employees}
          filters={filters}
          onFiltersChange={setFilters}
          resultCount={filteredEmployees.length}
          splitLayout
          extra={
            tab === 'grid' ? (
              <select className="filter-select filter-select-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="nom">Nom A-Z</option>
                <option value="pct-asc">% croissant</option>
                <option value="pct-desc">% décroissant</option>
              </select>
            ) : undefined
          }
        />
      </div>

      <div className={`check-docs-body${tab === 'grid' ? ' check-docs-body-grid' : ''}`}>
        {tab === 'stats' && (
          <DocumentsStatsTab
            filteredEmployees={filteredEmployees}
            dashboard={dashboard}
            filters={filters}
          />
        )}
        {tab === 'inspection' && (
          <DocumentsInspectionTab
            filteredEmployees={filteredEmployees}
            dashboard={dashboard}
            filters={filters}
          />
        )}
        {tab === 'grid' && (
          <DocumentsGridTab
            filteredEmployees={filteredEmployees}
            sort={sort}
            onUpdate={handleUpdate}
            readOnly={!can('employes.check-documents', 'edit')}
          />
        )}
      </div>
    </div>
    </PermissionGate>
  );
}
