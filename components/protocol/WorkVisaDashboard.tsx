'use client';

import type { WorkVisaKpis } from '@/lib/work-visa-types';

type KpiKey =
  | 'total'
  | 'expats'
  | 'visasValides'
  | 'visasExpires'
  | 'passportsExpires'
  | 'workCardsExpires'
  | 'vsrExpires'
  | 'alerts4m';

const CARDS: {
  key: KpiKey;
  label: string;
  color: string;
  filter?: Record<string, string>;
}[] = [
  { key: 'total', label: 'Total dossiers', color: 'cyan' },
  { key: 'expats', label: 'Expatriés', color: 'violet' },
  { key: 'visasValides', label: 'Visas valides', color: 'green', filter: { report: 'visa-valide' } },
  { key: 'visasExpires', label: 'Visas expirés', color: 'orange', filter: { report: 'visa-expire' } },
  { key: 'passportsExpires', label: 'Passeports expirés', color: 'orange', filter: { passportExpired: '1' } },
  { key: 'workCardsExpires', label: 'Cartes expirées', color: 'orange', filter: { workCardExpired: '1' } },
  { key: 'vsrExpires', label: 'VSR expirés', color: 'orange', filter: { vsrExpired: '1' } },
  { key: 'alerts4m', label: 'Alertes ≤ 4 mois', color: 'violet', filter: { alert4m: '1' } },
];

interface Props {
  kpis: WorkVisaKpis;
  onFilter: (filter: Record<string, string>) => void;
}

export default function WorkVisaDashboard({ kpis, onFilter }: Props) {
  return (
    <div className="work-visa-dashboard">
      <div className="work-visa-kpi-grid">
        {CARDS.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`card card-glow card-glow-${card.color} work-visa-kpi-card`}
            onClick={() => onFilter(card.filter ?? {})}
          >
            <span className="card-label">{card.label}</span>
            <span className="card-value">{kpis[card.key]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
