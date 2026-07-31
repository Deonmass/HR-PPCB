'use client';

import { useMemo } from 'react';
import EmployeesPieChart from '@/components/employees/EmployeesPieChart';
import type { CharroiVehicule } from '@/lib/charroi-types';
import {
  CHARROI_ETATS,
  CHARROI_KM_DECLASSE,
  charroiExpiryStatus,
  formatCharroiDate,
  normalizeMarqueLabel,
  normalizeProvinceLabel,
} from '@/lib/charroi-types';

interface Props {
  items: CharroiVehicule[];
  onSelectVehicle?: (v: CharroiVehicule) => void;
}

function countByObs(list: CharroiVehicule[], obs: string) {
  return list.filter((v) => v.observationTech === obs).length;
}

function IconFleet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 14h18v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4Z" />
      <path d="M5 14 6.5 8.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 14" />
      <circle cx="7.5" cy="18.5" r="1.2" />
      <circle cx="16.5" cy="18.5" r="1.2" />
    </svg>
  );
}

function IconOk() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconBad() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

function IconOwner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20v-1.5A4.5 4.5 0 0 1 8.5 14h2A4.5 4.5 0 0 1 15 18.5V20" />
      <circle cx="10.5" cy="8" r="3.2" />
      <path d="M17 14.5a3.5 3.5 0 0 1 3 3.4V20" />
      <circle cx="17.5" cy="9" r="2.4" />
    </svg>
  );
}

function IconAge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Documents véhicule suivis pour les échéances. */
const EXPIRY_DOCS = [
  { field: 'assuranceFin' as const, label: 'Assurance' },
  { field: 'vignetteFin' as const, label: 'Vignette' },
  { field: 'controleTechniqueFin' as const, label: 'Contr. tech.' },
];

const MARQUE_COLORS = [
  '#e30613', '#06b6d4', '#22c55e', '#f59e0b', '#a78bfa', '#60a5fa', '#fb7185', '#34d399',
];
const PROVINCE_COLORS = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#f472b6', '#64748b',
];
const ETAT_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#64748b'];
const OWNER_COLORS = ['#e30613', '#0ea5e9', '#94a3b8'];

export default function CharroiDashboard({ items, onSelectVehicle }: Props) {
  const dash = useMemo(() => {
    const bon = countByObs(items, 'Bon état');
    const avert = countByObs(items, 'Avertissement');
    const decl = countByObs(items, 'A déclasser');
    const ppc = items.filter((v) => v.proprietaire === 'PPC').length;
    const loxea = items.filter((v) => v.proprietaire === 'LOXEA').length;
    const ages = items.map((v) => v.age).filter((a): a is number => a != null && Number.isFinite(a));
    const avgAge = ages.length
      ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10
      : null;
    const highKm = [...items]
      .filter((v) => (v.kilometrage ?? 0) > CHARROI_KM_DECLASSE)
      .sort((a, b) => (b.kilometrage ?? 0) - (a.kilometrage ?? 0));

    // Échéances assurance / vignette / contrôle technique (expirées ou ≤ 30 jours).
    const expiries = items
      .flatMap((v) =>
        EXPIRY_DOCS.map(({ field, label }) => ({
          vehicle: v,
          field,
          label,
          date: v[field],
          status: charroiExpiryStatus(v[field]),
        })),
      )
      .filter((x) => x.status === 'expired' || x.status === 'soon')
      .sort((a, b) => a.date.localeCompare(b.date));

    const byNormalized = (
      getKey: (v: CharroiVehicule) => string,
    ) => {
      const map = new Map<string, number>();
      for (const v of items) {
        const k = getKey(v) || '—';
        map.set(k, (map.get(k) || 0) + 1);
      }
      return [...map.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
    };

    const byDept = byNormalized((v) => (v.departement || '—').trim() || '—');

    return {
      total: items.length,
      bon,
      avert,
      decl,
      ppc,
      loxea,
      avgAge,
      highKm,
      expiries,
      marques: byNormalized((v) => normalizeMarqueLabel(v.marque) || '—'),
      provinces: byNormalized((v) => normalizeProvinceLabel(v.province) || '—'),
      etats: CHARROI_ETATS.map((label) => ({
        label,
        count: countByObs(items, label),
      })).filter((x) => x.count > 0),
      owners: [
        { label: 'PPC', count: ppc },
        { label: 'LOXEA', count: loxea },
      ].filter((x) => x.count > 0),
      depts: byDept,
    };
  }, [items]);

  return (
    <div className="charroi-dash">
      <div className="charroi-kpi-grid">
        <div className="card card-glow card-glow-cyan guest-house-kpi-card charroi-kpi-card">
          <div className="guest-house-kpi-text">
            <div className="card-label">Total flotte</div>
            <div className="card-value">{dash.total}</div>
          </div>
          <span className="guest-house-kpi-icon"><IconFleet /></span>
        </div>
        <div className="card card-glow card-glow-green guest-house-kpi-card charroi-kpi-card is-ok">
          <div className="guest-house-kpi-text">
            <div className="card-label">Bon état</div>
            <div className="card-value">{dash.bon}</div>
            {dash.total > 0 && (
              <div className="text-muted guest-house-kpi-sub">
                {Math.round((dash.bon / dash.total) * 100)}%
              </div>
            )}
          </div>
          <span className="guest-house-kpi-icon"><IconOk /></span>
        </div>
        <div className="card card-glow card-glow-amber guest-house-kpi-card charroi-kpi-card is-warn">
          <div className="guest-house-kpi-text">
            <div className="card-label">Avertissement</div>
            <div className="card-value">{dash.avert}</div>
            {dash.total > 0 && (
              <div className="text-muted guest-house-kpi-sub">
                {Math.round((dash.avert / dash.total) * 100)}%
              </div>
            )}
          </div>
          <span className="guest-house-kpi-icon"><IconWarn /></span>
        </div>
        <div className="card card-glow card-glow-red guest-house-kpi-card charroi-kpi-card is-bad">
          <div className="guest-house-kpi-text">
            <div className="card-label">A déclasser</div>
            <div className="card-value">{dash.decl}</div>
            {dash.total > 0 && (
              <div className="text-muted guest-house-kpi-sub">
                {Math.round((dash.decl / dash.total) * 100)}%
              </div>
            )}
          </div>
          <span className="guest-house-kpi-icon"><IconBad /></span>
        </div>
        <div className="card card-glow card-glow-red guest-house-kpi-card charroi-kpi-card">
          <div className="guest-house-kpi-text">
            <div className="card-label">PPC</div>
            <div className="card-value">{dash.ppc}</div>
          </div>
          <span className="guest-house-kpi-icon"><IconOwner /></span>
        </div>
        <div className="card card-glow card-glow-cyan guest-house-kpi-card charroi-kpi-card">
          <div className="guest-house-kpi-text">
            <div className="card-label">LOXEA</div>
            <div className="card-value">{dash.loxea}</div>
          </div>
          <span className="guest-house-kpi-icon"><IconOwner /></span>
        </div>
        <div className="card card-glow card-glow-violet guest-house-kpi-card charroi-kpi-card">
          <div className="guest-house-kpi-text">
            <div className="card-label">Âge moyen</div>
            <div className="card-value">
              {dash.avgAge ?? '—'}
              {dash.avgAge != null ? <span className="charroi-kpi-unit"> ans</span> : null}
            </div>
          </div>
          <span className="guest-house-kpi-icon"><IconAge /></span>
        </div>
      </div>

      <div className="charroi-dash-charts">
        <EmployeesPieChart
          title="Par marque"
          items={dash.marques}
          colors={MARQUE_COLORS}
        />
        <EmployeesPieChart
          title="Par province"
          items={dash.provinces}
          colors={PROVINCE_COLORS}
        />
        <EmployeesPieChart
          title="Par état technique"
          items={dash.etats}
          colors={ETAT_COLORS}
        />
        <EmployeesPieChart
          title="Par propriétaire"
          items={dash.owners}
          colors={OWNER_COLORS}
        />
      </div>

      <div className="charroi-dash-bottom">
        <div className="panel charroi-dash-side-panel">
          <div className="panel-head">
            <h3>Départements</h3>
            <span className="panel-meta">Top 8</span>
          </div>
          <div className="charroi-mini-list">
            {dash.depts.length === 0 ? (
              <div className="text-muted charroi-empty-mini">Aucun</div>
            ) : dash.depts.slice(0, 8).map((d) => (
              <div key={d.label} className="charroi-mini-row">
                <span title={d.label}>{d.label}</span>
                <strong>{d.count}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="panel charroi-dash-side-panel charroi-dash-alert-panel">
          <div className="panel-head">
            <h3>Alerte km &gt; {CHARROI_KM_DECLASSE.toLocaleString('fr-FR')}</h3>
            <span className="panel-meta">{dash.highKm.length}</span>
          </div>
          <div className="charroi-mini-list">
            {dash.highKm.length === 0 ? (
              <div className="text-muted charroi-empty-mini">Aucune alerte</div>
            ) : dash.highKm.slice(0, 10).map((v) => (
              <button
                key={v.id}
                type="button"
                className="charroi-mini-row charroi-mini-btn"
                onClick={() => onSelectVehicle?.(v)}
              >
                <span title={`${v.marque} ${v.plaque}`.trim()}>
                  {v.plaque || v.marque || v.id}
                </span>
                <strong>{v.kilometrage?.toLocaleString('fr-FR')}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="panel charroi-dash-side-panel charroi-dash-alert-panel">
          <div className="panel-head">
            <h3>Échéances ≤ 1 mois</h3>
            <span className="panel-meta">{dash.expiries.length}</span>
          </div>
          <div className="charroi-mini-list">
            {dash.expiries.length === 0 ? (
              <div className="text-muted charroi-empty-mini">
                Aucune échéance (assurance, vignette, contrôle technique)
              </div>
            ) : dash.expiries.slice(0, 12).map((x) => (
              <button
                key={`${x.vehicle.id}-${x.field}`}
                type="button"
                className="charroi-mini-row charroi-mini-btn"
                onClick={() => onSelectVehicle?.(x.vehicle)}
              >
                <span title={`${x.vehicle.marque} ${x.vehicle.plaque}`.trim()}>
                  {x.vehicle.plaque || x.vehicle.marque || x.vehicle.id}
                  <em className="charroi-expiry-doc">{x.label}</em>
                </span>
                <strong className={`charroi-expiry-date is-${x.status}`}>
                  {formatCharroiDate(x.date)}
                </strong>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
