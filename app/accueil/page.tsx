'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import HomeBarChart from '@/components/home/HomeBarChart';
import HomeDonutChart from '@/components/home/HomeDonutChart';
import HomeGlobalSearch from '@/components/home/HomeGlobalSearch';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import type {
  HomeDashboardData,
  HomeKpi,
  HomeModuleLink,
  HomeModulePlaceholder,
} from '@/lib/home-dashboard-types';
import { formatUsd } from '@/lib/projects';

function formatUsdShort(value: number): string {
  return formatUsd(value, 0);
}

function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} M$`;
  }
  if (abs >= 10_000) {
    return `${Math.round(value / 1_000).toLocaleString('fr-FR')} k$`;
  }
  return formatUsd(value, 0);
}

function KpiStrip({ kpis }: { kpis: HomeKpi[] }) {
  if (!kpis.length) return null;
  return (
    <div className="home-kpi-strip">
      {kpis.map((kpi) => {
        const body = (
          <>
            <span className="home-kpi-label">{kpi.label}</span>
            <strong className="home-kpi-value">{kpi.value}</strong>
            {kpi.meta && <span className="home-kpi-meta">{kpi.meta}</span>}
          </>
        );
        if (kpi.href) {
          return (
            <Link
              key={kpi.label}
              href={kpi.href}
              className={`home-kpi-card home-kpi-${kpi.color} home-kpi-link`}
            >
              {body}
            </Link>
          );
        }
        return (
          <div key={kpi.label} className={`home-kpi-card home-kpi-${kpi.color}`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function ModuleHead({
  title,
  subtitle,
  href,
  linkLabel = 'Voir tout →',
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="home-module-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="home-module-link">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function SectorBlock({
  title,
  accent,
  children,
}: {
  title: string;
  accent: 'red' | 'cyan' | 'violet' | 'orange' | 'slate' | 'green';
  children: ReactNode;
}) {
  return (
    <section className={`home-sector home-sector-${accent}`}>
      <div className="home-sector-separator">
        <span className="home-sector-line" aria-hidden />
        <h3 className="home-sector-title">{title}</h3>
        <span className="home-sector-line" aria-hidden />
      </div>
      <div className="home-sector-body">{children}</div>
    </section>
  );
}

function DocIcon({ name }: { name: string }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 22,
    height: 22,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'history':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'cash':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M7 10v4M17 10v4" />
        </svg>
      );
    case 'attestation':
      return (
        <svg {...common}>
          <path d="M8 3h8l3 3v15H5V3h3z" />
          <path d="M9 12h6M9 16h4" />
          <path d="M14 3v4h4" />
        </svg>
      );
    case 'voucher':
      return (
        <svg {...common}>
          <path d="M4 7h16v10H4z" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M8 12h8" />
        </svg>
      );
    case 'exit':
      return (
        <svg {...common}>
          <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
          <path d="M15 16l4-4-4-4" />
          <path d="M10 12h9" />
        </svg>
      );
    case 'appraisal':
      return (
        <svg {...common}>
          <path d="M9 4h6l1 2h4v14H4V6h4l1-2z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'rrf':
      return (
        <svg {...common}>
          <path d="M16 4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
          <path d="M9 9h6M9 13h6M9 17h3" />
        </svg>
      );
    case 'letter':
      return (
        <svg {...common}>
          <path d="M4 6h16v12H4z" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    case 'offers':
      return (
        <svg {...common}>
          <path d="M12 3l2.2 4.5L19 8.3l-3.5 3.4.8 4.8L12 14.4 7.7 16.5l.8-4.8L5 8.3l4.8-.8L12 3z" />
        </svg>
      );
    case 'moves':
      return (
        <svg {...common}>
          <path d="M7 7h10M17 7l-3-3M17 7l-3 3" />
          <path d="M17 17H7M7 17l3-3M7 17l3 3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M8 3h8l3 3v15H5V3h3z" />
          <path d="M14 3v4h4" />
        </svg>
      );
  }
}

function documentIconName(href: string, label: string): string {
  const key = `${href} ${label}`.toLowerCase();
  if (key.includes('historique') || key.includes('history')) return 'history';
  if (key.includes('cash') || key.includes('etablir')) return 'cash';
  if (key.includes('attestation')) return 'attestation';
  if (key.includes('voucher') || key.includes('payment')) return 'voucher';
  if (key.includes('exit')) return 'exit';
  if (key.includes('appraisal') || key.includes('interim')) return 'appraisal';
  if (key.includes('rrf')) return 'rrf';
  if (key.includes('entêt') || key.includes('entet') || key.includes('lettre')) return 'letter';
  return 'default';
}

function DocumentCards({ items }: { items: Array<{ href: string; label: string }> }) {
  if (!items.length) return null;
  return (
    <div className="home-doc-cards">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="home-doc-card">
          <span className="home-doc-card-icon" aria-hidden>
            <DocIcon name={documentIconName(item.href, item.label)} />
          </span>
          <span className="home-doc-card-label">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}

function ComingSoonCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link href={href} className="panel home-module-panel home-coming-card">
      <div className="home-coming-card-head">
        <span className="home-coming-card-icon" aria-hidden>
          <DocIcon name={icon} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <span className="home-coming-badge">Bientôt disponible</span>
    </Link>
  );
}

function PlaceholderGrid({ items }: { items: HomeModulePlaceholder[] }) {
  if (!items.length) return null;
  return (
    <div className="home-placeholder-grid">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="home-placeholder-card">
          <h4>{item.label}</h4>
          <p>{item.description}</p>
          <span>Ouvrir →</span>
        </Link>
      ))}
    </div>
  );
}

export default function AccueilPage() {
  const { user, can } = usePermissions();
  const [data, setData] = useState<HomeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/home');
      const json = await res.json();
      if (!res.ok) {
        setData(null);
        setError(json.error || 'Erreur de chargement');
        return;
      }
      setData(json as HomeDashboardData);
    } catch {
      setData(null);
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  const employesSectorPlaceholders = useMemo(
    () => (data?.placeholders ?? []).filter((item) => item.href === '/heures-supplementaires'),
    [data],
  );
  const documentsSectorPlaceholders = useMemo(
    () => (data?.placeholders ?? []).filter(
      (item) =>
        item.href.startsWith('/documents-voyage/')
        || item.href.startsWith('/documents/')
        || item.href === '/documents',
    ),
    [data],
  );

  const documentsLinks = useMemo(() => {
    const links: Array<{ href: string; label: string }> = [];
    const push = (href: string, label: string) => {
      if (!href || links.some((l) => l.href === href)) return;
      links.push({ href, label });
    };
    if (data?.travel) {
      push(data.travel.hrefHistorique, 'Historique voyages');
      if (data.travel.hrefEtablir) push(data.travel.hrefEtablir, 'Cash request');
    }
    for (const item of documentsSectorPlaceholders) {
      push(item.href, item.label);
    }
    return links;
  }, [data, documentsSectorPlaceholders]);

  const charts = data?.charts;
  const hasCharts = Boolean(
    charts
    && (
      charts.employeesByDepartment.length
      || charts.documentsCompliance.length
      || charts.dependantsBreakdown.length
      || charts.projectsBudget.length
      || charts.travelByDepartment.length
      || charts.charroiStatus.length
      || charts.villageHouseTypes.length
    ),
  );

  const hasEmployesSector = Boolean(
    data?.employes
    || data?.dependants
    || data?.documents
    || employesSectorPlaceholders.length
    || can('employes.offres', 'view')
    || can('employes.mouvements', 'view')
    || can('employes.postes', 'view')
    || can('employes.classification', 'view')
    || can('employes.liste', 'view'),
  );
  const hasProjectsSector = Boolean(data?.projects);
  const hasDocumentsSector = documentsLinks.length > 0;
  const hasCharroiSector = Boolean(data?.charroi);
  const hasVillageSector = Boolean(data?.village);
  const hasFacturesSector = Boolean(data?.factures?.links.length);
  const hasProtocolSector = Boolean(data?.protocol?.links.length);
  const hasSettingsSector = Boolean(data?.settings);

  return (
    <div className="home-page">
      <section className="home-hero panel">
        <div className="home-hero-glow" aria-hidden />
        <div className="home-hero-content">
          <div className="page-header-title-row">
            <p className="home-hero-kicker">PPC Barnet RH</p>
            <RefreshButton onClick={() => load(true)} loading={refreshing} />
          </div>
          <div className="home-hero-title-row">
            <h2>
              {greeting}, {user?.displayName || 'Utilisateur'}
            </h2>
            <HomeGlobalSearch />
          </div>
        </div>
      </section>

      {loading && <div className="loading">Chargement du tableau de bord…</div>}
      {error && !loading && (
        <div className="panel panel-padded">
          <p className="text-danger">{error}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>
            Réessayer
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          <KpiStrip kpis={data.kpis} />

          {hasCharts && charts && (
            <section className="home-charts-section">
              <div className="home-sector-separator home-charts-title-row">
                <span className="home-sector-line" aria-hidden />
                <h3 className="home-sector-title">Synthèses graphiques</h3>
                <span className="home-sector-line" aria-hidden />
              </div>
              <div className="home-charts-grid">
                {charts.employeesByDepartment.length > 0 && (
                  <HomeBarChart
                    title="Effectifs par département"
                    items={charts.employeesByDepartment}
                    valueLabel="Agents"
                    maxBars={6}
                  />
                )}
                {charts.documentsCompliance.length > 0 && (
                  <HomeDonutChart
                    title="Conformité documentaire"
                    slices={charts.documentsCompliance}
                    centerValue={charts.documentsCompliance[0]?.value ?? 0}
                    centerLabel="% conforme"
                    formatValue={(n) => `${Math.round(n)}`}
                    showSharePercent={false}
                  />
                )}
                {charts.dependantsBreakdown.length > 0 && (
                  <HomeDonutChart
                    title="Bénéficiaires médicaux"
                    slices={charts.dependantsBreakdown}
                    centerLabel="bénéficiaires"
                  />
                )}
                {charts.projectsBudget.length > 0 && (
                  <HomeBarChart
                    title="Budget projets"
                    items={charts.projectsBudget}
                    valueLabel="Prévu"
                    secondaryLabel="Dépensé"
                    formatValue={formatUsdCompact}
                    maxBars={4}
                  />
                )}
                {charts.travelByDepartment.length > 0 && (
                  <HomeBarChart
                    title="Voyages par département"
                    items={charts.travelByDepartment}
                    valueLabel="Missions"
                    maxBars={6}
                  />
                )}
                {charts.charroiStatus.length > 0 && (
                  <HomeDonutChart
                    title="Charroi — documents"
                    slices={charts.charroiStatus}
                    centerLabel="véhicules"
                  />
                )}
                {charts.villageHouseTypes.length > 0 && (
                  <HomeDonutChart
                    title="Village — types de maisons"
                    slices={charts.villageHouseTypes}
                    centerLabel="maisons"
                  />
                )}
              </div>
            </section>
          )}

          {hasEmployesSector && (
            <SectorBlock title="Employés" accent="red">
              <div className="home-dashboard-grid">
                {data.employes && (
                  <section className="panel home-module-panel home-module-employes">
                    <ModuleHead
                      title="Liste employés"
                      subtitle="Effectifs et complétude documentaire"
                      href={data.employes.href}
                    />
                    <div className="home-stat-grid">
                      <div className="home-stat-box">
                        <span>Total employés</span>
                        <strong>{data.employes.total}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Actifs</span>
                        <strong>{data.employes.active}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Inactifs</span>
                        <strong>{data.employes.inactive}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Départements</span>
                        <strong>{data.employes.departments}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Complétude moyenne</span>
                        <strong>{data.employes.avgCompletion}%</strong>
                      </div>
                      <div className="home-stat-box home-stat-alert">
                        <span>Dossiers &lt; 50%</span>
                        <strong>{data.employes.needsAttention}</strong>
                      </div>
                    </div>
                  </section>
                )}

                {data.dependants && (
                  <section className="panel home-module-panel home-module-dependants">
                    <ModuleHead
                      title="Dépendants"
                      subtitle="Bénéficiaires prise en charge médicale"
                      href={data.dependants.href}
                    />
                    <div className="home-stat-grid">
                      <div className="home-stat-box">
                        <span>Total bénéficiaires</span>
                        <strong>{data.dependants.totalBeneficiaires}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Employés</span>
                        <strong>{data.dependants.employes}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Conjoints</span>
                        <strong>{data.dependants.conjoints}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Enfants</span>
                        <strong>{data.dependants.enfants}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Avec famille</span>
                        <strong>{data.dependants.employesAvecFamille}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Employés seuls</span>
                        <strong>{data.dependants.employesSeuls}</strong>
                      </div>
                    </div>
                  </section>
                )}

                {data.documents && (
                  <section className="panel home-module-panel home-module-documents">
                    <ModuleHead
                      title="Check documents"
                      subtitle="Conformité documentaire globale"
                      href={data.documents.href}
                    />
                    <div className="home-doc-summary">
                      <div className="home-doc-rate home-doc-rate-ok">
                        <span>Conforme</span>
                        <strong>{data.documents.conformeRate}</strong>
                      </div>
                      <div className="home-doc-rate home-doc-rate-ko">
                        <span>Non conforme</span>
                        <strong>{data.documents.noConformeRate}</strong>
                      </div>
                      <div className="home-doc-rate">
                        <span>Employés suivis</span>
                        <strong>{data.documents.totalEmployee}</strong>
                      </div>
                    </div>
                    {data.documents.departments.length > 0 && (
                      <div className="home-mini-table-wrap">
                        <table className="home-mini-table">
                          <thead>
                            <tr>
                              <th>Département</th>
                              <th>Taux</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.documents.departments.map((dept) => (
                              <tr key={dept.name}>
                                <td>{dept.name}</td>
                                <td>{dept.rate}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}

                <ComingSoonCard
                  title="Offres"
                  description="Suivi des offres d’emploi et du recrutement"
                  href="/employes/offres"
                  icon="offers"
                />
                <Link href="/employes/mouvements" className="panel home-module-panel home-coming-card">
                  <div className="home-coming-card-head">
                    <span className="home-coming-card-icon" aria-hidden>
                      <DocIcon name="moves" />
                    </span>
                    <div>
                      <h3>Mouvements</h3>
                      <p>Historique des affectations, promotions et changements de poste</p>
                    </div>
                  </div>
                  <span className="home-coming-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                    Ouvrir →
                  </span>
                </Link>
                <Link href="/employes/postes" className="panel home-module-panel home-coming-card">
                  <div className="home-coming-card-head">
                    <span className="home-coming-card-icon" aria-hidden>
                      <DocIcon name="rrf" />
                    </span>
                    <div>
                      <h3>Postes</h3>
                      <p>Catalogue, occupants et postes vacants — RRF</p>
                    </div>
                  </div>
                  <span className="home-coming-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                    Ouvrir →
                  </span>
                </Link>
                {can('employes.classification', 'view') && (
                  <Link href="/employes/classification" className="panel home-module-panel home-coming-card">
                    <div className="home-coming-card-head">
                      <span className="home-coming-card-icon" aria-hidden>
                        <DocIcon name="rrf" />
                      </span>
                      <div>
                        <h3>Classification des postes</h3>
                        <p>Grille Hay, Paterson et classification nationale harmonisée</p>
                      </div>
                    </div>
                    <span className="home-coming-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                      Ouvrir →
                    </span>
                  </Link>
                )}

                {employesSectorPlaceholders.length > 0 && (
                  <section className="panel home-module-panel home-module-placeholders">
                    <ModuleHead title="Heures supplémentaires" subtitle="Module opérationnel" />
                    <PlaceholderGrid items={employesSectorPlaceholders} />
                  </section>
                )}
              </div>
            </SectorBlock>
          )}

          {hasProjectsSector && data.projects && (
            <SectorBlock title="Project" accent="cyan">
              <div className="home-dashboard-grid">
                <section className="panel home-module-panel home-module-projects home-module-wide">
                  <ModuleHead
                    title="Projets & dépenses"
                    subtitle="Effectifs, budgets et dépenses"
                    href={data.projects.hrefDashboard || data.projects.hrefProjects || undefined}
                  />
                  <div className="home-project-scopes">
                    {data.projects.scopes.map((scope) => (
                      <article key={scope.label} className="home-project-scope-card">
                        <h4>{scope.label}</h4>
                        <div className="home-stat-grid home-stat-grid-compact">
                          <div className="home-stat-box">
                            <span>Projets</span>
                            <strong>{scope.total}</strong>
                          </div>
                          <div className="home-stat-box">
                            <span>En cours</span>
                            <strong>{scope.enCours}</strong>
                          </div>
                          <div className="home-stat-box">
                            <span>Terminés</span>
                            <strong>{scope.termines}</strong>
                          </div>
                          <div className="home-stat-box home-stat-money">
                            <span>Budget prévu</span>
                            <strong title={formatUsdShort(scope.prevu)}>{formatUsdCompact(scope.prevu)}</strong>
                          </div>
                          <div className="home-stat-box home-stat-money">
                            <span>Dépensé</span>
                            <strong title={formatUsdShort(scope.depense)}>{formatUsdCompact(scope.depense)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="home-module-links">
                    {data.projects.hrefProjects ? (
                      <Link href={data.projects.hrefProjects}>Projects →</Link>
                    ) : null}
                    {data.projects.hrefExpenses ? (
                      <Link href={data.projects.hrefExpenses}>
                        Expenses ({data.projects.expenseCount}) →
                      </Link>
                    ) : null}
                    <span className="home-module-links-meta">
                      Total dépenses : {formatUsdShort(data.projects.expensesTotal)}
                    </span>
                  </div>
                </section>
              </div>
            </SectorBlock>
          )}

          {hasDocumentsSector && (
            <SectorBlock title="Documents" accent="violet">
              <div className="home-sector-full">
                <DocumentCards items={documentsLinks} />
              </div>
            </SectorBlock>
          )}

          {hasProtocolSector && data.protocol && (
            <SectorBlock title="Protocol" accent="violet">
              <div className="home-sector-full">
                <div className="home-link-cards">
                  {data.protocol.links.map((item) => (
                    <Link key={item.href} href={item.href} className="home-link-card home-link-card-protocol">
                      <strong>{item.label}</strong>
                      {item.description && <span>{item.description}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            </SectorBlock>
          )}

          {hasFacturesSector && data.factures && (
            <SectorBlock title="Factures fournisseur" accent="orange">
              <div className="home-sector-full">
                <section className="panel home-module-panel home-module-wide">
                  <ModuleHead
                    title="Suivi factures"
                    subtitle="Pipeline fournisseurs et SOA"
                    href={data.factures.hrefFactures || data.factures.links[0]?.href}
                  />
                  <div className="home-stat-grid home-stat-grid-4">
                    <div className="home-stat-box">
                      <span>Factures</span>
                      <strong>{data.factures.total}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>En cours</span>
                      <strong>{data.factures.enCours}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>Payées</span>
                      <strong>{data.factures.paid}</strong>
                    </div>
                    <div className={`home-stat-box${data.factures.enRetard ? ' home-stat-alert' : ''}`}>
                      <span>En retard</span>
                      <strong>{data.factures.enRetard}</strong>
                    </div>
                    {data.factures.fournisseurs > 0 && (
                      <div className="home-stat-box">
                        <span>Fournisseurs</span>
                        <strong>{data.factures.fournisseurs}</strong>
                      </div>
                    )}
                  </div>
                  <div className="home-link-cards home-link-cards-inline">
                    {data.factures.links.map((item: HomeModuleLink) => (
                      <Link key={item.href} href={item.href} className="home-link-card">
                        <strong>{item.label}</strong>
                        {item.description && <span>{item.description}</span>}
                      </Link>
                    ))}
                  </div>
                </section>
              </div>
            </SectorBlock>
          )}

          {hasCharroiSector && data.charroi && (
            <SectorBlock title="Charroi" accent="orange">
              <div className="home-dashboard-grid">
                <section className="panel home-module-panel home-module-wide">
                  <ModuleHead
                    title="Parc véhicules"
                    subtitle="Alertes assurance, vignette et contrôle technique (≤ 30 j)"
                    href={data.charroi.href}
                  />
                  <div className="home-stat-grid home-stat-grid-4">
                    <div className="home-stat-box">
                      <span>Véhicules</span>
                      <strong>{data.charroi.total}</strong>
                    </div>
                    <div className={`home-stat-box${data.charroi.alertes ? ' home-stat-alert' : ''}`}>
                      <span>Alertes docs</span>
                      <strong>{data.charroi.alertes}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>Assurance ≤30j</span>
                      <strong>{data.charroi.assuranceSoon}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>Vignette ≤30j</span>
                      <strong>{data.charroi.vignetteSoon}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>Contrôle tech. ≤30j</span>
                      <strong>{data.charroi.controleSoon}</strong>
                    </div>
                  </div>
                  <div className="home-module-links">
                    <Link href={data.charroi.href}>Ouvrir le parc →</Link>
                  </div>
                </section>
              </div>
            </SectorBlock>
          )}

          {hasVillageSector && data.village && (
            <SectorBlock title="Village" accent="green">
              <div className={`home-dashboard-grid${data.village.guestHouse && data.village.hrefMaisons ? '' : ' home-dashboard-grid-single'}`}>
                {data.village.hrefMaisons ? (
                  <section className={`panel home-module-panel${!data.village.guestHouse ? ' home-module-wide' : ''}`}>
                    <ModuleHead
                      title="Maisons"
                      subtitle={`${data.village.totalMaisons} maison${data.village.totalMaisons > 1 ? 's' : ''} par type`}
                      href={data.village.hrefMaisons}
                    />
                    <div className="home-stat-grid home-stat-grid-4 home-type-stat-grid">
                      <div className="home-stat-box">
                        <span>Total</span>
                        <strong>{data.village.totalMaisons}</strong>
                      </div>
                      {data.village.byType.map((item) => (
                        <div key={item.label} className="home-stat-box">
                          <span title={item.label}>{item.label}</span>
                          <strong style={item.color ? { color: item.color } : undefined}>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="home-module-links">
                      <Link href={data.village.hrefMaisons}>Gérer les maisons →</Link>
                    </div>
                  </section>
                ) : null}

                {data.village.guestHouse && (
                  <section className={`panel home-module-panel${!data.village.hrefMaisons ? ' home-module-wide' : ''}`}>
                    <ModuleHead
                      title="Guest house"
                      subtitle="Occupation du jour (site + Kimpese)"
                      href={data.village.guestHouse.href}
                    />
                    <div className="home-stat-grid home-stat-grid-4">
                      <div className="home-stat-box">
                        <span>Chambres</span>
                        <strong>{data.village.guestHouse.totalRooms}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Sur site</span>
                        <strong>{data.village.guestHouse.onsiteRooms}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Occupées</span>
                        <strong>{data.village.guestHouse.occupied}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Libres</span>
                        <strong>{data.village.guestHouse.empty}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Occupation</span>
                        <strong>{data.village.guestHouse.occupancyRate}%</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>En attente</span>
                        <strong>{data.village.guestHouse.pendingReservations}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Kimpese</span>
                        <strong>{data.village.guestHouse.kimpeseHotels}</strong>
                      </div>
                    </div>
                    <div className="home-module-links">
                      <Link href={data.village.guestHouse.href}>Ouvrir guest house →</Link>
                    </div>
                  </section>
                )}
              </div>
            </SectorBlock>
          )}

          {hasSettingsSector && data.settings && (
            <SectorBlock title="Paramètres" accent="slate">
              <div className="home-sector-full">
                <section className="panel home-module-panel home-module-settings home-module-wide">
                  <ModuleHead
                    title="Référentiels & administration"
                    subtitle="Données de configuration"
                    href={
                      data.settings.hrefUtilisateurs
                      || data.settings.hrefDepartements
                      || data.settings.hrefCentres
                      || data.settings.hrefPermissions
                      || undefined
                    }
                  />
                  <div className="home-stat-grid home-stat-grid-4">
                    <div className="home-stat-box">
                      <span>Départements</span>
                      <strong>{data.settings.departments}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>Centres de coût</span>
                      <strong>{data.settings.costCenters}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>Utilisateurs</span>
                      <strong>{data.settings.users}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>Actifs</span>
                      <strong>{data.settings.activeUsers}</strong>
                    </div>
                  </div>
                  <div className="home-module-links">
                    {data.settings.hrefDepartements ? (
                      <Link href={data.settings.hrefDepartements}>Départements →</Link>
                    ) : null}
                    {data.settings.hrefCentres ? (
                      <Link href={data.settings.hrefCentres}>Centres de coût →</Link>
                    ) : null}
                    {data.settings.hrefUtilisateurs ? (
                      <Link href={data.settings.hrefUtilisateurs}>Utilisateurs →</Link>
                    ) : null}
                    {data.settings.hrefPermissions ? (
                      <Link href={data.settings.hrefPermissions}>Permissions →</Link>
                    ) : null}
                  </div>
                </section>
              </div>
            </SectorBlock>
          )}

          {!data.kpis.length
            && !hasCharts
            && !hasEmployesSector
            && !hasProjectsSector
            && !hasDocumentsSector
            && !hasProtocolSector
            && !hasFacturesSector
            && !hasCharroiSector
            && !hasVillageSector
            && !hasSettingsSector && (
            <div className="panel panel-padded">
              <p className="empty-state">
                Aucune donnée accessible avec vos permissions actuelles. Contactez un administrateur.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
