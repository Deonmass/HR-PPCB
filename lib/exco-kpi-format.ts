/**
 * Formatage des cartes KPI EXCO (client + serveur).
 * Aligné sur l’export PPTX / aperçu (valeur, delta vs mois précédent).
 */
import type { ExcoMetricValue } from './exco-types';
import { EXCO_KPI_GROUPS } from './exco-kpi-layout';

export type ExcoKpiCard = {
  key: string;
  label: string;
  value: string | null;
  delta: string | null;
  /** Tone UI : up = vert (bon), down = rouge (mauvais). */
  deltaTone?: 'up' | 'down' | 'flat';
  prev: string | null;
  hint?: string;
};

export type ExcoKpiCardGroup = {
  title: string;
  cards: ExcoKpiCard[];
};

export function formatExcoKpiValue(kpi: Pick<ExcoMetricValue, 'value' | 'unit' | 'key'>): string | null {
  if (kpi.value == null || kpi.value === '') return null;
  if (typeof kpi.value === 'number') {
    const n = kpi.value;
    if (kpi.unit === 'USD') {
      const digits = kpi.key === 'leaveCost' ? 2 : 0;
      return n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
    if (kpi.unit === '%') {
      return `${n.toFixed(2)}%`;
    }
    if (kpi.unit === 'hrs' || kpi.unit === 'jours' || kpi.unit === 'ans') {
      const unitLabel =
        kpi.unit === 'jours' ? 'days' : kpi.unit === 'ans' ? 'yrs' : 'hrs';
      return `${n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${unitLabel}`;
    }
    return n.toLocaleString('en-US');
  }
  return String(kpi.value);
}

/** Counts (IN/OUT) : écart absolu — « ▲ +3 vs prev. » plutôt que +300 %. */
const ABSOLUTE_DELTA_KEYS = new Set(['hires', 'exits']);
/** Taux déjà en % : points de pourcentage — « ▲ +2.01 pp ». */
const PP_DELTA_KEYS = new Set(['turnover', 'attrition', 'genderRatio']);
/** Hausse = mauvais (rouge) : sorties, turnover, attrition, coûts… */
const INVERSE_DELTA_KEYS = new Set([
  'exits',
  'attrition',
  'turnover',
  'overtimeCost',
  'leaveCost',
  'staffCost',
  'absenteeism',
  'genderRatio',
]);

function asFiniteNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Extrait le % hommes depuis « 84% H / 16% F ». */
export function parseGenderMalePct(
  value: number | string | null | undefined,
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const m = value.match(/(\d+(?:[.,]\d+)?)\s*%\s*H/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function deltaDirection(
  kpi: Pick<ExcoMetricValue, 'key' | 'value' | 'prevValue' | 'deltaPct'>,
): 'up' | 'down' | '' {
  if (kpi.key === 'genderRatio') {
    const cur = parseGenderMalePct(kpi.value);
    const prev = parseGenderMalePct(kpi.prevValue);
    if (cur == null || prev == null) return '';
    if (cur > prev) return 'up';
    if (cur < prev) return 'down';
    return '';
  }
  if (ABSOLUTE_DELTA_KEYS.has(kpi.key) || PP_DELTA_KEYS.has(kpi.key)) {
    const cur = asFiniteNumber(kpi.value ?? null);
    const prev = asFiniteNumber(kpi.prevValue ?? null);
    if (cur != null && prev != null) {
      if (cur > prev) return 'up';
      if (cur < prev) return 'down';
      return '';
    }
  }
  if (kpi.deltaPct == null || !Number.isFinite(kpi.deltaPct) || kpi.deltaPct === 0) return '';
  return kpi.deltaPct > 0 ? 'up' : 'down';
}

/**
 * Libellé d’écart vs mois précédent.
 * Hires/Exits → delta absolu ; Turnover/Attrition/Gender → points de % ; sinon % relatif.
 */
export function formatKpiDelta(
  kpi: Pick<ExcoMetricValue, 'key' | 'value' | 'prevValue' | 'deltaPct'>,
): string | null {
  if (kpi.key === 'genderRatio') {
    const cur = parseGenderMalePct(kpi.value);
    const prev = parseGenderMalePct(kpi.prevValue);
    if (cur == null || prev == null) return null;
    const pp = Math.round((cur - prev) * 100) / 100;
    if (pp === 0) return '• 0 pp H vs prev.';
    const arrow = pp > 0 ? '▲' : '▼';
    const signed = pp > 0 ? `+${pp}` : String(pp);
    return `${arrow} ${signed} pp H vs prev.`;
  }

  const cur = asFiniteNumber(kpi.value ?? null);
  const prev = asFiniteNumber(kpi.prevValue ?? null);

  if (ABSOLUTE_DELTA_KEYS.has(kpi.key)) {
    if (cur == null || prev == null) return null;
    const d = Math.round((cur - prev) * 100) / 100;
    if (d === 0) return '• 0 vs prev.';
    const arrow = d > 0 ? '▲' : '▼';
    const signed = d > 0 ? `+${d}` : String(d);
    return `${arrow} ${signed} vs prev.`;
  }

  if (PP_DELTA_KEYS.has(kpi.key)) {
    if (cur == null || prev == null) return null;
    const pp = Math.round((cur - prev) * 100) / 100;
    if (pp === 0) return '• 0 pp vs prev.';
    const arrow = pp > 0 ? '▲' : '▼';
    const signed = pp > 0 ? `+${pp}` : String(pp);
    return `${arrow} ${signed} pp vs prev.`;
  }

  if (kpi.deltaPct == null || !Number.isFinite(kpi.deltaPct)) return null;
  const pct = Math.round(kpi.deltaPct * 10000) / 100;
  if (pct === 0) return '• 0% vs prev.';
  const arrow = pct > 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(pct)}% vs prev.`;
}

/** Couleur d’écart : pour Exits / Gender H↑ / coûts → rouge si hausse. */
export function kpiDeltaIsNegative(
  kpi: Pick<ExcoMetricValue, 'key' | 'value' | 'prevValue' | 'deltaPct'>,
): boolean | null {
  const dir = deltaDirection(kpi);
  if (!dir) return null;
  const inverse = INVERSE_DELTA_KEYS.has(kpi.key);
  if (dir === 'up') return inverse;
  return !inverse;
}

export type KpiDeltaTone = 'up' | 'down' | 'flat';

/** Tone UI : « up » = vert (bon), « down » = rouge (mauvais), indépendamment de ▲/▼. */
export function kpiDeltaTone(
  kpi: Pick<ExcoMetricValue, 'key' | 'value' | 'prevValue' | 'deltaPct'>,
): KpiDeltaTone {
  const neg = kpiDeltaIsNegative(kpi);
  if (neg == null) return 'flat';
  return neg ? 'down' : 'up';
}

export function metricToKpiCard(kpi: ExcoMetricValue): ExcoKpiCard {
  return {
    key: kpi.key,
    label: kpi.label,
    value: formatExcoKpiValue(kpi),
    delta: formatKpiDelta(kpi),
    deltaTone: kpiDeltaTone(kpi),
    prev: formatExcoKpiValue({ ...kpi, value: kpi.prevValue ?? null }),
    hint: kpi.hint,
  };
}

export function kpiSummaryToCards(kpis: ExcoMetricValue[]): ExcoKpiCard[] {
  return (kpis || []).map(metricToKpiCard);
}

/** Disposition fixe PPTX : 2 groupes × 10 cartes (2 rangées de 5). */
export function kpiSummaryToCardGroups(kpis: ExcoMetricValue[]): ExcoKpiCardGroup[] {
  const byKey = new Map((kpis || []).map((k) => [k.key, k]));
  return EXCO_KPI_GROUPS.map((g) => ({
    title: g.title,
    cards: g.keys.map((key) => {
      const found = byKey.get(key);
      if (found) return metricToKpiCard(found);
      return {
        key,
        label: key,
        value: null,
        delta: null,
        deltaTone: 'flat',
        prev: null,
      };
    }),
  }));
}
