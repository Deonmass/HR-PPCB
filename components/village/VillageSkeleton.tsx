'use client';

type Variant = 'maisons' | 'dashboard' | 'liste' | 'table';

export default function VillageSkeleton({ variant = 'maisons' }: { variant?: Variant }) {
  if (variant === 'dashboard') {
    return (
      <div className="village-skeleton" aria-busy="true" aria-label="Chargement">
        <div className="village-skeleton-kpis">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="village-skeleton-kpi" />
          ))}
        </div>
        <div className="village-skeleton-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="village-skeleton-card" style={{ height: 220 }} />
          <div className="village-skeleton-card" style={{ height: 220 }} />
        </div>
      </div>
    );
  }

  if (variant === 'liste') {
    return (
      <div className="village-skeleton" aria-busy="true" aria-label="Chargement">
        <div className="village-skeleton-toolbar">
          <div className="village-skeleton-line is-search" />
          <div className="village-skeleton-line is-filter" />
          <div className="village-skeleton-line is-filter" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="village-skeleton-line" style={{ height: 36, width: '100%' }} />
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="village-skeleton" aria-busy="true" aria-label="Chargement">
        <div className="village-skeleton-toolbar">
          <div className="village-skeleton-line is-search" />
          <div className="village-skeleton-line is-btn" />
        </div>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="village-skeleton-line" style={{ height: 36, width: '100%' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="village-skeleton" aria-busy="true" aria-label="Chargement">
      <div className="village-skeleton-toolbar">
        <div className="village-skeleton-line is-search" />
        <div className="village-skeleton-line is-filter" />
        <div className="village-skeleton-line is-filter" />
        <div className="village-skeleton-line is-btn" />
      </div>
      <div className="village-skeleton-grid">
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="village-skeleton-card" />
        ))}
      </div>
    </div>
  );
}
