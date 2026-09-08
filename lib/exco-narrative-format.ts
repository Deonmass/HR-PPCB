import { emptyExcoOverlays, type ExcoNarrative } from './exco-types';

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
  return splitNarrativePoints(body).join('\n\n');
}
