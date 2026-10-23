'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OrganigrammeTree from '@/components/organigramme/OrganigrammeTree';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Contractant } from '@/lib/contractants-types';
import {
  buildContractantOrganigramme,
  buildOrganigramme,
  listOrganigrammeDepartments,
  listOrganigrammeServices,
  type OrganigrammeScope,
} from '@/lib/organigramme';
import { showError } from '@/lib/swal';
import type { Employee } from '@/lib/types';

const MENU = 'employes.organigramme';

type ScopeTab = OrganigrammeScope;

export default function OrganigrammePage() {
  const { can } = usePermissions();
  const chartRef = useRef<HTMLElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contractants, setContractants] = useState<Contractant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scope, setScope] = useState<ScopeTab>('entreprise');
  const [departement, setDepartement] = useState('');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');
  const [expandAllKey, setExpandAllKey] = useState(0);
  const [collapseAllKey, setCollapseAllKey] = useState(0);
  const [showContractants, setShowContractants] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resEmp, resCtr] = await Promise.all([
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/employes/contractants', { cache: 'no-store' }),
      ]);
      const empJson = (await resEmp.json()) as Employee[] | { error?: string };
      if (!resEmp.ok) {
        throw new Error(
          !Array.isArray(empJson) && empJson.error ? empJson.error : 'Chargement impossible',
        );
      }
      setEmployees(Array.isArray(empJson) ? empJson : []);

      if (resCtr.ok) {
        const ctrJson = (await resCtr.json()) as { contractants?: Contractant[] };
        setContractants(Array.isArray(ctrJson.contractants) ? ctrJson.contractants : []);
      } else {
        setContractants([]);
      }
    } catch (err) {
      setEmployees([]);
      setContractants([]);
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!can(MENU, 'view') && !can('employes.liste', 'view')) return;
    void load();
  }, [can, load]);

  const departments = useMemo(
    () => listOrganigrammeDepartments(employees, contractants),
    [employees, contractants],
  );
  const services = useMemo(
    () =>
      listOrganigrammeServices(
        employees,
        scope === 'service' ? departement || undefined : undefined,
        contractants,
      ),
    [employees, contractants, scope, departement],
  );

  useEffect(() => {
    if (scope === 'departement' && !departement && departments[0]) {
      setDepartement(departments[0]);
    }
  }, [scope, departement, departments]);

  useEffect(() => {
    if (scope !== 'service') return;
    if (service && services.includes(service)) return;
    setService(services[0] || '');
  }, [scope, service, services]);

  const built = useMemo(() => {
    const empty = {
      roots: [],
      internes: 0,
      externes: 0,
    };
    if (scope === 'departement' && !departement) return empty;
    if (scope === 'service' && !service) return empty;

    const opts = {
      scope,
      departement: scope === 'entreprise' ? undefined : departement,
      service: scope === 'service' ? service : undefined,
    };
    const ppc = buildOrganigramme(employees, opts);
    const ctr = buildContractantOrganigramme(contractants, opts);
    return {
      roots: showContractants ? [...ppc.roots, ...ctr.roots] : ppc.roots,
      internes: ppc.employeeCount,
      externes: ctr.employeeCount,
    };
  }, [employees, contractants, scope, departement, service, showContractants]);

  const title = useMemo(() => {
    if (scope === 'departement') {
      return departement ? `Organigramme — ${departement}` : 'Organigramme — Département';
    }
    if (scope === 'service') {
      return service ? `Organigramme — ${service}` : 'Organigramme — Service';
    }
    return 'Organigramme';
  }, [scope, departement, service]);

  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExpandAllKey((n) => n + 1);
    await new Promise((r) => setTimeout(r, 350));
    try {
      document.body.classList.add('org-printing');
      const onAfterPrint = () => {
        document.body.classList.remove('org-printing');
        window.removeEventListener('afterprint', onAfterPrint);
        setExporting(false);
      };
      window.addEventListener('afterprint', onAfterPrint);
      window.print();
      setTimeout(() => {
        if (document.body.classList.contains('org-printing')) onAfterPrint();
      }, 2000);
    } catch (err) {
      document.body.classList.remove('org-printing');
      setExporting(false);
      await showError(err instanceof Error ? err.message : 'Export PDF impossible');
    }
  }, [exporting]);

  return (
    <PermissionGate
      anyOf={[
        { menuId: MENU, action: 'view' },
        { menuId: 'employes.liste', action: 'view' },
      ]}
      fallback={<p className="docs-hub-empty">Accès refusé.</p>}
    >
      <div className="org-page">
        <div className="org-sticky">
          <div className="page-header page-header-with-tabs mvt-page-header">
            <div>
              <div className="page-header-title-row">
                <h2>{title}</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
            </div>
            <div className="page-header-actions mvt-header-actions">
              <div className="mvt-tabs" role="tablist" aria-label="Périmètre organigramme">
                <button
                  type="button"
                  role="tab"
                  className={`tab-btn tab-btn-sm mvt-tab-btn${scope === 'entreprise' ? ' active' : ''}`}
                  aria-selected={scope === 'entreprise'}
                  onClick={() => setScope('entreprise')}
                >
                  Entreprise
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`tab-btn tab-btn-sm mvt-tab-btn${scope === 'departement' ? ' active' : ''}`}
                  aria-selected={scope === 'departement'}
                  onClick={() => setScope('departement')}
                >
                  Département
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`tab-btn tab-btn-sm mvt-tab-btn${scope === 'service' ? ' active' : ''}`}
                  aria-selected={scope === 'service'}
                  onClick={() => setScope('service')}
                >
                  Service
                </button>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={loading || exporting}
                onClick={() => void exportPdf()}
              >
                {exporting ? 'PDF…' : 'Exporter PDF'}
              </button>
            </div>
          </div>

          <div className="org-toolbar panel-toolbar">
            <div className="org-toolbar-filters">
              {(scope === 'departement' || scope === 'service') && (
                <label className="org-filter">
                  <span>Département</span>
                  <select
                    value={departement}
                    onChange={(e) => {
                      setDepartement(e.target.value);
                      setService('');
                    }}
                  >
                    {departments.length === 0 ? (
                      <option value="">Aucun département</option>
                    ) : (
                      departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              )}
              {scope === 'service' && (
                <label className="org-filter">
                  <span>Service</span>
                  <select
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    disabled={services.length === 0}
                  >
                    {services.length === 0 ? (
                      <option value="">Aucun service renseigné</option>
                    ) : (
                      services.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              )}
              <label className="org-filter org-filter-search">
                <span>Recherche</span>
                <input
                  type="search"
                  placeholder="Nom, matricule, poste…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="org-toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setExpandAllKey((n) => n + 1)}
              >
                Tout déplier
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCollapseAllKey((n) => n + 1)}
              >
                Tout replier
              </button>
            </div>
          </div>
        </div>

        <section className="org-canvas" aria-label={title} ref={chartRef}>
          <h3 className="org-print-only">{title}</h3>
          {loading ? (
            <p className="org-empty">Chargement…</p>
          ) : scope === 'service' && services.length === 0 ? (
            <p className="org-empty">
              Aucun service n’est encore renseigné. Renseignez le champ Service pour activer cette
              vue.
            </p>
          ) : (
            <OrganigrammeTree
              roots={built.roots}
              search={search}
              expandAllKey={expandAllKey}
              collapseAllKey={collapseAllKey}
            />
          )}
        </section>

        <footer className="org-footer">
          <ul className="org-footer-legend">
            <li>
              <i className="org-legend-swatch is-ppc" aria-hidden />
              <span>Internes</span>
              <strong>{loading ? '…' : built.internes}</strong>
            </li>
            <li>
              <button
                type="button"
                className={`org-footer-toggle${showContractants ? ' is-on' : ''}`}
                aria-pressed={showContractants}
                onClick={() => setShowContractants((v) => !v)}
              >
                <i className="org-legend-swatch is-contractant" aria-hidden />
                <span>Externes</span>
                <strong>{loading ? '…' : built.externes}</strong>
                <span className="org-footer-toggle-state">
                  {showContractants ? 'affichés' : 'masqués'}
                </span>
              </button>
            </li>
            <li className="org-footer-total">
              <span>Total</span>
              <strong>{loading ? '…' : built.internes + built.externes}</strong>
            </li>
          </ul>
        </footer>
      </div>
    </PermissionGate>
  );
}
