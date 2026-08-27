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
