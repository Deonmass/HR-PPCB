'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import RefreshButton from '@/components/RefreshButton';
import TravelDepartmentChart from '@/components/travel/TravelDepartmentChart';
import TravelMonthlyTripsChart from '@/components/travel/TravelMonthlyTripsChart';
import { usePermissions } from '@/contexts/PermissionContext';
import type { HomeDashboardData, HomeModulePlaceholder } from '@/lib/home-dashboard-types';
import { formatUsd } from '@/lib/projects';

function formatUsdShort(value: number): string {
  return formatUsd(value, 0);
}

/** Montants compacts pour éviter le débordement dans les cartes. */
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

function KpiStrip({ kpis }: { kpis: HomeDashboardData['kpis'] }) {
  if (!kpis.length) return null;
  return (
    <div className="home-kpi-strip">
      {kpis.map((kpi) => (
        <div key={kpi.label} className={`home-kpi-card home-kpi-${kpi.color}`}>
          <span className="home-kpi-label">{kpi.label}</span>
          <strong className="home-kpi-value">{kpi.value}</strong>
          {kpi.meta && <span className="home-kpi-meta">{kpi.meta}</span>}
        </div>
      ))}
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
  const { user } = usePermissions();
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
    () => (data?.placeholders ?? []).filter((item) => item.href.startsWith('/factures-fournisseurs')),
    [data],
  );
  const villagePlaceholders = useMemo(
    () => (data?.placeholders ?? []).filter((item) => item.href.startsWith('/village/')),
    [data],
  );
  const autresPlaceholders = useMemo(
    () => (data?.placeholders ?? []).filter(
      (item) => item.href === '/sante' || item.href === '/charroi-automobile',
    ),
    [data],
  );

  const hasEmployesSector = Boolean(
    data?.employes || data?.dependants || data?.documents || employesSectorPlaceholders.length,
  );
  const hasProjectsSector = Boolean(data?.projects);
  const hasDocumentsSector = Boolean(data?.travel || documentsSectorPlaceholders.length);
  const hasVillageSector = villagePlaceholders.length > 0;
  const hasSettingsSector = Boolean(data?.settings);
  const hasAutresSector = autresPlaceholders.length > 0;

  return (
    <div className="home-page">
      <section className="home-hero panel">
        <div className="home-hero-glow" aria-hidden />
        <div className="home-hero-content">
          <div className="page-header-title-row">
            <p className="home-hero-kicker">PPC Barnet RH</p>
            <RefreshButton onClick={() => load(true)} loading={refreshing} />
          </div>
          <h2>
            {greeting}, {user?.displayName || 'Utilisateur'}
          </h2>
          <p className="home-hero-subtitle">
            Vue d&apos;ensemble par secteur — données réelles des modules auxquels vous avez accès.
          </p>
        </div>
        <div className="home-hero-badge">
          <span className="home-hero-avatar">{user?.initials || 'RH'}</span>
          <div>
            <strong>{user?.displayName || 'Utilisateur'}</strong>
            <span>@{user?.username || '—'}</span>
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
                    href={data.projects.hrefDashboard}
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
                    <Link href={data.projects.hrefProjects}>Projects →</Link>
                    <Link href={data.projects.hrefExpenses}>
                      Expenses ({data.projects.expenseCount}) →
                    </Link>
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
              <div className="home-dashboard-grid">
                {data.travel && (
                  <section className="home-module-travel home-module-wide">
                    <ModuleHead
                      title="Voyages"
                      subtitle="Historique et budget des missions"
                      href={data.travel.hrefHistorique}
                    />
                    <div className="travel-history-cards home-travel-cards">
                      <div className="card card-glow card-glow-violet travel-history-card">
                        <div className="card-label">Total voyages</div>
                        <div className="card-value">{data.travel.dashboard.totalTrips}</div>
                        <div className="travel-history-card-meta">
                          {data.travel.dashboard.tripsThisMonth} ce mois-ci
                        </div>
                      </div>
                      <div className="card card-glow card-glow-cyan travel-history-card">
                        <div className="card-label">Budget total</div>
                        <div className="card-value">{formatUsdShort(data.travel.dashboard.totalBudget)}</div>
                        <div className="travel-history-card-meta">
                          {formatUsdShort(data.travel.dashboard.budgetThisMonth)} ce mois-ci
                        </div>
                      </div>
                      <div className="card card-glow card-glow-green travel-history-card">
                        <div className="card-label">Budget moyen</div>
                        <div className="card-value">{formatUsdShort(data.travel.dashboard.averageBudget)}</div>
                        <div className="travel-history-card-meta">Par mission</div>
                      </div>
                      <div className="card card-glow card-glow-red travel-history-card">
                        <div className="card-label">Départements</div>
                        <div className="card-value">{data.travel.dashboard.departments.length}</div>
                        <div className="travel-history-card-meta">Avec voyages</div>
                      </div>
                    </div>
                    <TravelMonthlyTripsChart chart={data.travel.dashboard.monthlyTrips} />
                    <TravelDepartmentChart departments={data.travel.dashboard.departments} />
                    <div className="home-module-links">
                      <Link href={data.travel.hrefHistorique}>Historique des voyages →</Link>
                      <Link href={data.travel.hrefEtablir}>Établir un dossier →</Link>
                    </div>
                  </section>
                )}

                {documentsSectorPlaceholders.length > 0 && (
                  <section className="panel home-module-panel home-module-placeholders">
                    <ModuleHead title="Factures fournisseur" subtitle="Module en préparation" />
                    <PlaceholderGrid items={documentsSectorPlaceholders} />
                  </section>
                )}
              </div>
            </SectorBlock>
          )}

          {hasVillageSector && (
            <SectorBlock title="Village" accent="green">
              <div className="home-dashboard-grid">
                <section className="panel home-module-panel home-module-placeholders home-module-wide">
                  <ModuleHead
                    title="Infrastructures village"
                    subtitle="Maisons, club house et guest house"
                    href={villagePlaceholders[0]?.href}
                  />
                  <PlaceholderGrid items={villagePlaceholders} />
                </section>
              </div>
            </SectorBlock>
          )}

          {hasSettingsSector && data.settings && (
            <SectorBlock title="Paramètres" accent="slate">
              <div className="home-dashboard-grid">
                <section className="panel home-module-panel home-module-settings">
                  <ModuleHead
                    title="Référentiels & administration"
                    subtitle="Données de configuration"
                    href={data.settings.hrefUtilisateurs}
                  />
                  <div className="home-stat-grid">
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
                    <Link href={data.settings.hrefDepartements}>Départements →</Link>
                    <Link href={data.settings.hrefCentres}>Centres de coût →</Link>
                    <Link href={data.settings.hrefUtilisateurs}>Utilisateurs →</Link>
                    <Link href={data.settings.hrefPermissions}>Permissions →</Link>
                  </div>
                </section>
              </div>
            </SectorBlock>
          )}

          {hasAutresSector && (
            <SectorBlock title="Autres modules" accent="orange">
              <div className="home-dashboard-grid">
                <section className="panel home-module-panel home-module-placeholders home-module-wide">
                  <ModuleHead title="Modules complémentaires" subtitle="Accès aux modules sans synthèse détaillée" />
                  <PlaceholderGrid items={autresPlaceholders} />
                </section>
              </div>
            </SectorBlock>
          )}

          {!data.kpis.length
            && !hasEmployesSector
            && !hasProjectsSector
            && !hasDocumentsSector
            && !hasVillageSector
            && !hasSettingsSector
            && !hasAutresSector && (
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
