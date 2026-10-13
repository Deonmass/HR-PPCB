import { emptyExcoOverlays, type ExcoNarrative } from './exco-types';

const PERIOD_LABEL = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-\d{2}$/i;
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function endOfReportMonth(year: number, month: number): string {
  const end = new Date(year, month, 0);
  return end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Date de réunion du mois exporté. Un libellé « Aug-26 » ou une date d’un autre mois est ignoré. */
function resolveMeetingDate(raw: string | undefined, year: number, month: number): string {
  const value = (raw || '').trim();
  const fallback = endOfReportMonth(year, month);
  if (!value || PERIOD_LABEL.test(value)) return fallback;

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return fallback;
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return fallback;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  if (/\d{4}/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month) return fallback;
      return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  }

  const mentioned = MONTH_NAMES.findIndex((name) => value.toLowerCase().includes(name));
  if (mentioned >= 0 && mentioned + 1 !== month) return fallback;
  return value;
}

/**
 * Ligne de la page de garde. Le titre ne reprend pas « HELD ON … »
 * (sinon la date du modèle reste collée devant la date du mois).
 */
export function buildExcoCoverLine(input: {
  year: number;
  month: number;
  meetingTitle?: string;
  meetingDate?: string;
  meetingPlace?: string;
}): string {
  let title = (input.meetingTitle || '').trim() || 'EXCO MEETING';
  const held = title.search(/\s+held on\b/i);
  if (held >= 0) title = title.slice(0, held).trim() || 'EXCO MEETING';
  const date = resolveMeetingDate(input.meetingDate, input.year, input.month).toUpperCase();
  const place = (input.meetingPlace || '').trim() || 'Zamba';
  return `${title.toUpperCase()} HELD ON ${date}, IN ${place.toUpperCase()}`;
}

/** True si Highlights / Lowlights / Focus ont du contenu. */
export function narrativeHasBody(narrative: ExcoNarrative | null | undefined): boolean {
  if (!narrative) return false;
  return Boolean(
    narrative.highlights?.trim()
    || narrative.lowlights?.trim()
    || narrative.focus?.trim(),
  );
}

/** Reprend la synthèse du mois précédent si le mois courant est encore vide. */
export function inheritNarrative(
  current: ExcoNarrative | null | undefined,
  previous: ExcoNarrative | null | undefined,
): ExcoNarrative {
  const cur = current || emptyExcoOverlays().narrative;
  if (narrativeHasBody(cur) || !previous) return cur;
  return {
    ...previous,
    ...cur,
    highlights: cur.highlights?.trim() ? cur.highlights : previous.highlights || '',
    lowlights: cur.lowlights?.trim() ? cur.lowlights : previous.lowlights || '',
    focus: cur.focus?.trim() ? cur.focus : previous.focus || '',
    thankYouTitle: cur.thankYouTitle?.trim()
      ? cur.thankYouTitle
      : previous.thankYouTitle || cur.thankYouTitle,
    thankYouMessage: cur.thankYouMessage?.trim()
      ? cur.thankYouMessage
      : previous.thankYouMessage || cur.thankYouMessage,
  };
}

/**
 * Découpe Highlights / Lowlights / Focus en points lisibles
 * (lignes vides, retours, ou enchaînements « Titre : … »).
 */
export function splitNarrativePoints(body: string): string[] {
  const raw = (body || '').trim();
  if (!raw) return [];

  let parts = raw
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 1) {
    parts = raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (parts.length === 1) {
    // « Topic: detail. NextTopic: … »
    const byTopic = raw
      .split(/(?<=[.!?])\s+(?=[A-Z][^:\n]{1,80}:\s)/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (byTopic.length > 1) parts = byTopic;
  }

  return parts;
}

/** Normalise le texte éditable : un point par paragraphe (ligne vide entre). */
export function formatNarrativeForEdit(body: string): string {
  const raw = (body || '').trim();
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { plant?: unknown; hq?: unknown; regions?: unknown };
      if (parsed && (typeof parsed.plant === 'string' || typeof parsed.hq === 'string' || typeof parsed.regions === 'string')) {
        return raw;
      }
    } catch {
      /* texte libre */
    }
  }
  return splitNarrativePoints(body).join('\n\n');
}
