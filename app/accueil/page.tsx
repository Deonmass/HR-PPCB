'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import HomeBarChart from '@/components/home/HomeBarChart';
import HomeDonutChart from '@/components/home/HomeDonutChart';
import HomeGlobalSearch from '@/components/home/HomeGlobalSearch';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';
import { translateKnownLabel } from '@/lib/i18n';
import type {
  HomeDashboardData,
  HomeKpi,
  HomeModuleLink,
  HomeModulePlaceholder,
} from '@/lib/home-dashboard-types';
import { formatUsd } from '@/lib/projects';
import { formatRate } from '@/lib/format-rate';

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
  const { locale } = useI18n();
  if (!kpis.length) return null;
  return (
    <div className="home-kpi-strip">
      {kpis.map((kpi) => {
        const label = translateKnownLabel(locale, kpi.label);
        const body = (
          <>
            <span className="home-kpi-label">{label}</span>
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
  const { t } = useI18n();
  return (
    <div className="home-module-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="home-module-link">
          {linkLabel === 'Voir tout →' ? t('common.seeAll') : linkLabel}
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
  const { t } = useI18n();
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
      <span className="home-coming-badge">{t('home.comingSoonBadge')}</span>
    </Link>
  );
}

function PlaceholderGrid({ items }: { items: HomeModulePlaceholder[] }) {
  const { t, locale } = useI18n();
  if (!items.length) return null;
  return (
    <div className="home-placeholder-grid">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="home-placeholder-card">
          <h4>{translateKnownLabel(locale, item.label)}</h4>
          <p>{item.description}</p>
          <span>{t('common.open')}</span>
        </Link>
      ))}
    </div>
  );
}

export default function AccueilPage() {
  const { user, can } = usePermissions();
  const { t, locale } = useI18n();
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
        setError(json.error || t('common.loadError'));
        return;
      }
      setData(json as HomeDashboardData);
    } catch {
      setData(null);
      setError(t('common.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t('home.greeting.morning') : hour < 18 ? t('home.greeting.afternoon') : t('home.greeting.evening');

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
    || can('employes.liste', 'view'),
  );
  const hasPosteSector = Boolean(
    can('employes.offres', 'view')
    || can('employes.mouvements', 'view')
    || can('employes.postes', 'view')
    || can('employes.recrutement', 'view')
    || can('employes.classification', 'view')
    || can('training', 'view'),
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
            <p className="home-hero-kicker">{t('brand.name')}</p>
            <RefreshButton onClick={() => load(true)} loading={refreshing} />
          </div>
          <div className="home-hero-title-row">
            <h2>
              {greeting}, {user?.displayName || t('common.user')}
            </h2>
            <HomeGlobalSearch />
          </div>
        </div>
      </section>

      {loading && <div className="loading">{t('home.loading')}</div>}
      {error && !loading && (
        <div className="panel panel-padded">
          <p className="text-danger">{error}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>
            {t('common.retry')}
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
                <h3 className="home-sector-title">{t('home.charts')}</h3>
                <span className="home-sector-line" aria-hidden />
              </div>
              <div className="home-charts-grid">
                {charts.employeesByDepartment.length > 0 && (
                  <HomeBarChart
                    title={t('home.chart.headcount')}
                    items={charts.employeesByDepartment}
                    valueLabel={t('home.chart.agents')}
                    maxBars={6}
                  />
                )}
                {charts.documentsCompliance.length > 0 && (
                  <HomeDonutChart
                    title={t('home.chart.compliance')}
                    slices={charts.documentsCompliance.map((s) => ({
                      ...s,
                      label: translateKnownLabel(locale, s.label),
                    }))}
                    centerValue={charts.documentsCompliance[0]?.value ?? 0}
                    centerLabel={t('home.chart.conforme')}
                    formatValue={(n) => `${Math.round(n)}`}
                    showSharePercent={false}
                  />
                )}
                {charts.dependantsBreakdown.length > 0 && (
                  <HomeDonutChart
                    title={t('home.chart.dependants')}
                    slices={charts.dependantsBreakdown.map((s) => ({
                      ...s,
                      label: translateKnownLabel(locale, s.label),
                    }))}
                    centerLabel={t('home.chart.beneficiaires')}
                  />
                )}
                {charts.projectsBudget.length > 0 && (
                  <HomeBarChart
                    title={t('home.chart.projects')}
                    items={charts.projectsBudget}
                    valueLabel={t('home.chart.planned')}
                    secondaryLabel={t('home.chart.spent')}
                    formatValue={formatUsdCompact}
                    maxBars={4}
                  />
                )}
                {charts.travelByDepartment.length > 0 && (
                  <HomeBarChart
                    title={t('home.chart.travel')}
                    items={charts.travelByDepartment}
                    valueLabel={t('home.chart.missions')}
                    maxBars={6}
                  />
                )}
                {charts.charroiStatus.length > 0 && (
                  <HomeDonutChart
                    title={t('home.chart.fleet')}
                    slices={charts.charroiStatus.map((s) => ({
                      ...s,
                      label: translateKnownLabel(locale, s.label),
                    }))}
                    centerLabel={t('home.chart.vehicles')}
                  />
                )}
                {charts.villageHouseTypes.length > 0 && (
                  <HomeDonutChart
                    title={t('home.chart.village')}
                    slices={charts.villageHouseTypes}
                    centerLabel={t('home.chart.houses')}
                  />
                )}
              </div>
            </section>
          )}

          {hasEmployesSector && (
            <SectorBlock title={t('home.sector.employees')} accent="red">
              <div className="home-dashboard-grid">
                {data.employes && (
                  <section className="panel home-module-panel home-module-employes">
                    <ModuleHead
                      title={t('home.employees.list')}
                      subtitle={t('home.employees.listSub')}
                      href={data.employes.href}
                    />
                    <div className="home-stat-grid">
                      <div className="home-stat-box">
                        <span>{t('home.stat.totalEmployees')}</span>
                        <strong>{data.employes.total}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.active')}</span>
                        <strong>{data.employes.active}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.inactive')}</span>
                        <strong>{data.employes.inactive}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.departments')}</span>
                        <strong>{data.employes.departments}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.avgCompletion')}</span>
                        <strong>{formatRate(data.employes.avgCompletion)}</strong>
                      </div>
                      <div className="home-stat-box home-stat-alert">
                        <span>{t('home.stat.riskFiles')}</span>
                        <strong>{data.employes.needsAttention}</strong>
                      </div>
                    </div>
                  </section>
                )}

                {data.dependants && (
                  <section className="panel home-module-panel home-module-dependants">
                    <ModuleHead
                      title={t('home.employees.dependants')}
                      subtitle={t('home.employees.dependantsSub')}
                      href={data.dependants.href}
                    />
                    <div className="home-stat-grid">
                      <div className="home-stat-box">
                        <span>{t('home.stat.totalBeneficiaries')}</span>
                        <strong>{data.dependants.totalBeneficiaires}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.employees')}</span>
                        <strong>{data.dependants.employes}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.spouses')}</span>
                        <strong>{data.dependants.conjoints}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.children')}</span>
                        <strong>{data.dependants.enfants}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.withFamily')}</span>
                        <strong>{data.dependants.employesAvecFamille}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.employeesAlone')}</span>
                        <strong>{data.dependants.employesSeuls}</strong>
                      </div>
                    </div>
                  </section>
                )}

                {data.documents && (
                  <section className="panel home-module-panel home-module-documents">
                    <ModuleHead
                      title={t('home.employees.checkDocs')}
                      subtitle={t('home.employees.checkDocsSub')}
                      href={data.documents.href}
                    />
                    <div className="home-doc-summary">
                      <div className="home-doc-rate home-doc-rate-ok">
                        <span>{t('home.stat.conforme')}</span>
                        <strong>{data.documents.conformeRate}</strong>
                      </div>
                      <div className="home-doc-rate home-doc-rate-ko">
                        <span>{t('home.stat.nonConforme')}</span>
                        <strong>{data.documents.noConformeRate}</strong>
                      </div>
                      <div className="home-doc-rate">
                        <span>{t('home.stat.trackedEmployees')}</span>
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

                {employesSectorPlaceholders.length > 0 && (
                  <section className="panel home-module-panel home-module-placeholders">
                    <ModuleHead title={t('home.employees.overtime')} subtitle={t('home.employees.overtimeSub')} />
                    <PlaceholderGrid items={employesSectorPlaceholders} />
                  </section>
                )}
              </div>
            </SectorBlock>
          )}

          {hasPosteSector && (
            <SectorBlock title={t('home.sector.poste')} accent="violet">
              <div className="home-dashboard-grid">
                {can('employes.offres', 'view') && (
                  <ComingSoonCard
                    title={t('home.poste.offers')}
                    description={t('home.poste.offersSub')}
                    href="/employes/offres"
                    icon="offers"
                  />
                )}
                {can('employes.mouvements', 'view') && (
                  <Link href="/employes/mouvements" className="panel home-module-panel home-coming-card">
                    <div className="home-coming-card-head">
                      <span className="home-coming-card-icon" aria-hidden>
                        <DocIcon name="moves" />
                      </span>
                      <div>
                        <h3>{t('home.poste.movements')}</h3>
                        <p>{t('home.poste.movementsSub')}</p>
                      </div>
                    </div>
                    <span className="home-coming-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                      {t('common.open')}
                    </span>
                  </Link>
                )}
                {can('employes.postes', 'view') && (
                  <Link href="/employes/postes" className="panel home-module-panel home-coming-card">
                    <div className="home-coming-card-head">
                      <span className="home-coming-card-icon" aria-hidden>
                        <DocIcon name="rrf" />
                      </span>
                      <div>
                        <h3>{t('home.poste.postes')}</h3>
                        <p>{t('home.poste.postesSub')}</p>
                      </div>
                    </div>
                    <span className="home-coming-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                      {t('common.open')}
                    </span>
                  </Link>
                )}
                {can('employes.recrutement', 'view') && (
                  <Link href="/employes/recrutement" className="panel home-module-panel home-coming-card">
                    <div className="home-coming-card-head">
                      <span className="home-coming-card-icon" aria-hidden>
                        <DocIcon name="rrf" />
                      </span>
                      <div>
                        <h3>{t('home.poste.recruitment')}</h3>
                        <p>{t('home.poste.recruitmentSub')}</p>
                      </div>
                    </div>
                    <span className="home-coming-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                      {t('common.open')}
                    </span>
                  </Link>
                )}
                {can('employes.classification', 'view') && (
                  <Link href="/employes/classification" className="panel home-module-panel home-coming-card">
                    <div className="home-coming-card-head">
                      <span className="home-coming-card-icon" aria-hidden>
                        <DocIcon name="rrf" />
                      </span>
                      <div>
                        <h3>{t('home.poste.classification')}</h3>
                        <p>{t('home.poste.classificationSub')}</p>
                      </div>
                    </div>
                    <span className="home-coming-badge" style={{ color: '#047857', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                      {t('common.open')}
                    </span>
                  </Link>
                )}
                {can('training', 'view') && (
                  <ComingSoonCard
                    title={t('training.title')}
                    description={t('training.description')}
                    href="/training"
                    icon="rrf"
                  />
                )}
              </div>
            </SectorBlock>
          )}

          {hasProjectsSector && data.projects && (
            <SectorBlock title={t('home.sector.project')} accent="cyan">
              <div className="home-dashboard-grid">
                <section className="panel home-module-panel home-module-projects home-module-wide">
                  <ModuleHead
                    title={t('home.project.title')}
                    subtitle={t('home.project.sub')}
                    href={data.projects.hrefDashboard || data.projects.hrefProjects || undefined}
                  />
                  <div className="home-project-scopes">
                    {data.projects.scopes.map((scope) => (
                      <article key={scope.label} className="home-project-scope-card">
                        <h4>{scope.label}</h4>
                        <div className="home-stat-grid home-stat-grid-compact">
                          <div className="home-stat-box">
                            <span>{t('home.stat.projects')}</span>
                            <strong>{scope.total}</strong>
                          </div>
                          <div className="home-stat-box">
                            <span>{t('home.stat.inProgress')}</span>
                            <strong>{scope.enCours}</strong>
                          </div>
                          <div className="home-stat-box">
                            <span>{t('home.stat.completed')}</span>
                            <strong>{scope.termines}</strong>
                          </div>
                          <div className="home-stat-box home-stat-money">
                            <span>{t('home.stat.plannedBudget')}</span>
                            <strong title={formatUsdShort(scope.prevu)}>{formatUsdCompact(scope.prevu)}</strong>
                          </div>
                          <div className="home-stat-box home-stat-money">
                            <span>{t('home.stat.spent')}</span>
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
                      {t('home.project.totalSpend', { amount: formatUsdShort(data.projects.expensesTotal) })}
                    </span>
                  </div>
                </section>
              </div>
            </SectorBlock>
          )}

          {hasDocumentsSector && (
            <SectorBlock title={t('home.sector.documents')} accent="violet">
              <div className="home-sector-full">
                <DocumentCards items={documentsLinks} />
              </div>
            </SectorBlock>
          )}

          {hasProtocolSector && data.protocol && (
            <SectorBlock title={t('home.sector.protocol')} accent="violet">
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
            <SectorBlock title={t('home.sector.invoices')} accent="orange">
              <div className="home-sector-full">
                <section className="panel home-module-panel home-module-wide">
                  <ModuleHead
                    title={t('home.invoices.title')}
                    subtitle={t('home.invoices.sub')}
                    href={data.factures.hrefFactures || data.factures.links[0]?.href}
                  />
                  <div className="home-stat-grid home-stat-grid-4">
                    <div className="home-stat-box">
                      <span>{t('home.stat.invoices')}</span>
                      <strong>{data.factures.total}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.inProgress')}</span>
                      <strong>{data.factures.enCours}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.paid')}</span>
                      <strong>{data.factures.paid}</strong>
                    </div>
                    <div className={`home-stat-box${data.factures.enRetard ? ' home-stat-alert' : ''}`}>
                      <span>{t('home.stat.overdue')}</span>
                      <strong>{data.factures.enRetard}</strong>
                    </div>
                    {data.factures.fournisseurs > 0 && (
                      <div className="home-stat-box">
                        <span>{t('home.stat.suppliers')}</span>
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
            <SectorBlock title={t('home.sector.fleet')} accent="orange">
              <div className="home-dashboard-grid">
                <section className="panel home-module-panel home-module-wide">
                  <ModuleHead
                    title={t('home.fleet.title')}
                    subtitle={t('home.fleet.sub')}
                    href={data.charroi.href}
                  />
                  <div className="home-stat-grid home-stat-grid-4">
                    <div className="home-stat-box">
                      <span>{t('home.stat.vehicles')}</span>
                      <strong>{data.charroi.total}</strong>
                    </div>
                    <div className={`home-stat-box${data.charroi.alertes ? ' home-stat-alert' : ''}`}>
                      <span>{t('home.stat.docAlerts')}</span>
                      <strong>{data.charroi.alertes}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.insurance')}</span>
                      <strong>{data.charroi.assuranceSoon}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.vignette')}</span>
                      <strong>{data.charroi.vignetteSoon}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.techControl')}</span>
                      <strong>{data.charroi.controleSoon}</strong>
                    </div>
                  </div>
                  <div className="home-module-links">
                    <Link href={data.charroi.href}>{t('common.open')}</Link>
                  </div>
                </section>
              </div>
            </SectorBlock>
          )}

          {hasVillageSector && data.village && (
            <SectorBlock title={t('home.sector.village')} accent="green">
              <div className={`home-dashboard-grid${data.village.guestHouse && data.village.hrefMaisons ? '' : ' home-dashboard-grid-single'}`}>
                {data.village.hrefMaisons ? (
                  <section className={`panel home-module-panel${!data.village.guestHouse ? ' home-module-wide' : ''}`}>
                    <ModuleHead
                      title={t('home.village.houses')}
                      subtitle={
                        data.village.totalMaisons > 1
                          ? t('home.village.housesSubPlural', { count: data.village.totalMaisons })
                          : t('home.village.housesSub', { count: data.village.totalMaisons })
                      }
                      href={data.village.hrefMaisons}
                    />
                    <div className="home-stat-grid home-stat-grid-4 home-type-stat-grid">
                      <div className="home-stat-box">
                        <span>{t('home.stat.total')}</span>
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
                      <Link href={data.village.hrefMaisons}>{t('common.open')}</Link>
                    </div>
                  </section>
                ) : null}

                {data.village.guestHouse && (
                  <section className={`panel home-module-panel${!data.village.hrefMaisons ? ' home-module-wide' : ''}`}>
                    <ModuleHead
                      title={t('home.village.guestHouse')}
                      subtitle={t('home.village.guestHouseSub')}
                      href={data.village.guestHouse.href}
                    />
                    <div className="home-stat-grid home-stat-grid-4">
                      <div className="home-stat-box">
                        <span>{t('home.stat.rooms')}</span>
                        <strong>{data.village.guestHouse.totalRooms}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.onsite')}</span>
                        <strong>{data.village.guestHouse.onsiteRooms}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.occupied')}</span>
                        <strong>{data.village.guestHouse.occupied}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.empty')}</span>
                        <strong>{data.village.guestHouse.empty}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.occupancy')}</span>
                        <strong>{formatRate(data.village.guestHouse.occupancyRate)}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>{t('home.stat.pending')}</span>
                        <strong>{data.village.guestHouse.pendingReservations}</strong>
                      </div>
                      <div className="home-stat-box">
                        <span>Kimpese</span>
                        <strong>{data.village.guestHouse.kimpeseHotels}</strong>
                      </div>
                    </div>
                    <div className="home-module-links">
                      <Link href={data.village.guestHouse.href}>{t('home.village.openGuestHouse')}</Link>
                    </div>
                  </section>
                )}
              </div>
            </SectorBlock>
          )}

          {hasSettingsSector && data.settings && (
            <SectorBlock title={t('home.sector.settings')} accent="slate">
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
                      <span>{t('home.stat.departments')}</span>
                      <strong>{data.settings.departments}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.costCenters')}</span>
                      <strong>{data.settings.costCenters}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.users')}</span>
                      <strong>{data.settings.users}</strong>
                    </div>
                    <div className="home-stat-box">
                      <span>{t('home.stat.active')}</span>
                      <strong>{data.settings.activeUsers}</strong>
                    </div>
                  </div>
                  <div className="home-module-links">
                    {data.settings.hrefDepartements ? (
                      <Link href={data.settings.hrefDepartements}>{t('nav.settings.departments')} →</Link>
                    ) : null}
                    {data.settings.hrefCentres ? (
                      <Link href={data.settings.hrefCentres}>{t('nav.settings.costCenters')} →</Link>
                    ) : null}
                    {data.settings.hrefUtilisateurs ? (
                      <Link href={data.settings.hrefUtilisateurs}>{t('nav.settings.users')} →</Link>
                    ) : null}
                    {data.settings.hrefPermissions ? (
                      <Link href={data.settings.hrefPermissions}>{t('nav.settings.permissions')} →</Link>
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
