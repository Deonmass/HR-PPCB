'use client';

import HomeBarChart from '@/components/home/HomeBarChart';
import HomeDonutChart from '@/components/home/HomeDonutChart';
import { useI18n } from '@/contexts/LocaleContext';
import { compareRecrutementLocations } from '@/lib/recrutement-location-groups';
import type { RecrutementRowEnriched } from '@/lib/recrutement-types';

type Translate = ReturnType<typeof useI18n>['t'];

function isCancelled(status: string): boolean {
  return /cancel/.test(String(status || '').toLowerCase());
}

function statusLabel(status: string, t: Translate): string {
  const s = String(status).toLowerCase();
  if (isCancelled(s)) return t('rec.status.cancelled');
  switch (s) {
    case 'done':
      return t('rec.status.done');
    case 'ongoing':
      return t('rec.status.ongoing');
    case 'started':
      return t('rec.status.started');
    case 'not started':
      return t('rec.status.notStarted');
    default:
      return status || t('rec.unset');
  }
}

function fieldLabel(raw: string | undefined, unset: string): string {
  const v = String(raw || '').trim();
  return v && v !== '—' ? v : unset;
}

function statusOf(s: string): string {
  return String(s || '').toLowerCase();
}

export default function RecrutementDashboardView({
  rows,
  onDrill,
  onOpenTab,
}: {
  rows: RecrutementRowEnriched[];
  onDrill: (title: string, predicate: (r: RecrutementRowEnriched) => boolean) => void;
  onOpenTab: (tab: 'replacement' | 'new') => void;
}) {
  const { t } = useI18n();
  const unset = t('rec.unset');

  const total = rows.length;
  const replacements = rows.filter((r) => r.category === 'replacement').length;
  const newPositions = rows.filter((r) => r.category === 'new').length;
  const ongoing = rows.filter((r) => statusOf(r.status) === 'ongoing').length;
  const started = rows.filter((r) => statusOf(r.status) === 'started').length;
  const done = rows.filter((r) => statusOf(r.status) === 'done').length;
  const notStarted = rows.filter((r) => statusOf(r.status) === 'not started').length;
  const cancelled = rows.filter((r) => isCancelled(r.status)).length;
  const filledAugust = rows.filter((r) => r.filledInAugust).length;
  const catalogLinked = rows.filter((r) => r.catalogMatch).length;

  const statusSlices = [
    { label: t('rec.status.ongoing'), value: ongoing, color: '#f59e0b' },
    { label: t('rec.status.started'), value: started, color: '#3b82f6' },
    { label: t('rec.status.done'), value: done, color: '#16a34a' },
    { label: t('rec.status.notStarted'), value: notStarted, color: '#a1a1aa' },
    { label: t('rec.status.cancelled'), value: cancelled, color: '#ef4444' },
  ].filter((s) => s.value > 0);

  const locMap = new Map<string, number>();
  for (const row of rows) {
    const key = fieldLabel(row.location, unset);
    locMap.set(key, (locMap.get(key) || 0) + 1);
  }
  const locBars = [...locMap.entries()]
    .map(([label, value]) => ({
      label,
      value,
      color: label === unset ? '#a1a1aa' : '#0ea5e9',
    }))
    .sort((a, b) => {
      if (a.label === unset) return 1;
      if (b.label === unset) return -1;
      const byCount = b.value - a.value;
      if (byCount) return byCount;
      return compareRecrutementLocations(a.label, b.label);
    });

  const contractMap = new Map<string, number>();
  for (const row of rows) {
    const key = fieldLabel(row.contractType, unset);
    contractMap.set(key, (contractMap.get(key) || 0) + 1);
  }
  const contractSlices = [...contractMap.entries()]
    .map(([label, value], i) => ({
      label,
      value,
      color:
        label === unset
          ? '#a1a1aa'
          : (['#16a34a', '#0ea5e9', '#7c3aed', '#f59e0b'][i % 4] as string),
    }))
    .filter((s) => s.value > 0);

  const matchLocation = (label: string, row: RecrutementRowEnriched) =>
    fieldLabel(row.location, unset) === label;
  const matchContract = (label: string, row: RecrutementRowEnriched) =>
    fieldLabel(row.contractType, unset) === label;

  const kpis: Array<{
    id: string;
    label: string;
    value: number;
    tone: string;
    title: string;
    onClick: () => void;
  }> = [
    {
      id: 'total',
      label: t('rec.kpi.total'),
      value: total,
      tone: 'tone-ink',
      title: t('rec.drill.all'),
      onClick: () => onDrill(t('rec.drill.all'), () => true),
    },
    {
      id: 'repl',
      label: t('rec.kpi.replacements'),
      value: replacements,
      tone: 'tone-cyan',
      title: t('rec.drill.replacements'),
      onClick: () => onOpenTab('replacement'),
    },
    {
      id: 'new',
      label: t('rec.kpi.newPositions'),
      value: newPositions,
      tone: 'tone-violet',
      title: t('rec.drill.newPositions'),
      onClick: () => onOpenTab('new'),
    },
    {
      id: 'ongoing',
      label: t('rec.kpi.ongoing'),
      value: ongoing,
      tone: 'tone-amber',
      title: t('rec.drill.ongoing'),
      onClick: () =>
        onDrill(t('rec.drill.ongoing'), (r) => statusOf(r.status) === 'ongoing'),
    },
    {
      id: 'done',
      label: t('rec.kpi.done'),
      value: done,
      tone: 'tone-green',
      title: t('rec.drill.done'),
      onClick: () => onDrill(t('rec.drill.done'), (r) => statusOf(r.status) === 'done'),
    },
    {
      id: 'august',
      label: t('rec.kpi.filledAugust'),
      value: filledAugust,
      tone: 'tone-rose',
      title: t('rec.drill.august'),
      onClick: () => onDrill(t('rec.drill.august'), (r) => r.filledInAugust),
    },
  ];

  return (
    <section className="rec-dashboard">
      <div className="rec-kpi-strip" role="group" aria-label={t('rec.dashboard.hint')}>
        {kpis.map((kpi) => (
          <button
            key={kpi.id}
            type="button"
            className={`rec-kpi-card ${kpi.tone}`}
            title={`${kpi.title} — ${t('rec.dashboard.hint')}`}
            onClick={kpi.onClick}
          >
            <span className="rec-kpi-label">{kpi.label}</span>
            <span className="rec-kpi-value">{kpi.value}</span>
            <span className="rec-kpi-action">{t('rec.dashboard.openList')}</span>
          </button>
        ))}
      </div>

      <div className="rec-dashboard-grid">
        {statusSlices.length ? (
          <HomeDonutChart
            title={t('rec.dashboard.byStatus')}
            slices={statusSlices}
            centerValue={total}
            centerLabel={t('rec.kpi.total')}
            onItemClick={(label) =>
              onDrill(label, (r) => statusLabel(r.status, t) === label)
            }
            onTitleClick={() => onDrill(t('rec.drill.all'), () => true)}
          />
        ) : (
          <article className="home-chart-panel panel">
            <header className="home-chart-head">
              <h4>{t('rec.dashboard.byStatus')}</h4>
            </header>
            <p className="empty-state">{t('rec.empty')}</p>
          </article>
        )}

        {locBars.length ? (
          <HomeBarChart
            title={t('rec.dashboard.byLocation')}
            items={locBars}
            valueLabel={t('rec.dashboard.posts')}
            maxBars={8}
            onItemClick={(label) => onDrill(label, (r) => matchLocation(label, r))}
          />
        ) : (
          <article className="home-chart-panel panel">
            <header className="home-chart-head">
              <h4>{t('rec.dashboard.byLocation')}</h4>
            </header>
            <p className="empty-state">{t('rec.empty')}</p>
          </article>
        )}

        {contractSlices.length ? (
          <HomeDonutChart
            title={t('rec.dashboard.byContract')}
            slices={contractSlices}
            onItemClick={(label) => onDrill(label, (r) => matchContract(label, r))}
          />
        ) : (
          <article className="home-chart-panel panel">
            <header className="home-chart-head">
              <h4>{t('rec.dashboard.byContract')}</h4>
            </header>
            <p className="empty-state">{t('rec.empty')}</p>
          </article>
        )}

        <article className="home-chart-panel panel rec-dash-meta-panel">
          <header className="home-chart-head">
            <h4>{t('rec.dashboard.coverage')}</h4>
          </header>
          <div className="rec-dash-meta-grid">
            <button
              type="button"
              className="rec-dash-stat"
              title={t('rec.dashboard.openList')}
              onClick={() => onDrill(t('rec.kpi.catalogLinked'), (r) => r.catalogMatch)}
            >
              <span className="rec-dash-stat-label">{t('rec.kpi.catalogLinked')}</span>
              <span className="rec-dash-stat-value">
                {catalogLinked}
                <small>/{total}</small>
              </span>
            </button>
            <button
              type="button"
              className="rec-dash-stat"
              title={t('rec.dashboard.openList')}
              onClick={() =>
                onDrill(t('rec.status.started'), (r) => statusOf(r.status) === 'started')
              }
            >
              <span className="rec-dash-stat-label">{t('rec.status.started')}</span>
              <span className="rec-dash-stat-value">{started}</span>
            </button>
            <button
              type="button"
              className="rec-dash-stat"
              title={t('rec.dashboard.openList')}
              onClick={() =>
                onDrill(
                  t('rec.status.notStarted'),
                  (r) => statusOf(r.status) === 'not started',
                )
              }
            >
              <span className="rec-dash-stat-label">{t('rec.status.notStarted')}</span>
              <span className="rec-dash-stat-value">{notStarted}</span>
            </button>
            {cancelled > 0 ? (
              <button
                type="button"
                className="rec-dash-stat"
                title={t('rec.dashboard.openList')}
                onClick={() =>
                  onDrill(t('rec.status.cancelled'), (r) => isCancelled(r.status))
                }
              >
                <span className="rec-dash-stat-label">{t('rec.status.cancelled')}</span>
                <span className="rec-dash-stat-value">{cancelled}</span>
              </button>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
