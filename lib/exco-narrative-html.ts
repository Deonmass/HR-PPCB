/** Colonnes éditables des slides Highlight / Lowlight / Focus. */

export type NarrativeZoneKey = 'plant' | 'hq' | 'regions';

export type NarrativeZones = Record<NarrativeZoneKey, string>;

export const NARRATIVE_ZONE_LABELS: Record<NarrativeZoneKey, string> = {
  plant: 'Plant',
  hq: 'HQ',
  regions: 'Régions',
};

export const EMPTY_NARRATIVE_ZONES: NarrativeZones = { plant: '', hq: '', regions: '' };

export function parseNarrativeZones(raw: string | null | undefined): NarrativeZones | null {
  const text = (raw || '').trim();
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as Partial<NarrativeZones>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      typeof parsed.plant !== 'string'
      && typeof parsed.hq !== 'string'
      && typeof parsed.regions !== 'string'
    ) {
      return null;
    }
    return {
      plant: typeof parsed.plant === 'string' ? parsed.plant : '',
      hq: typeof parsed.hq === 'string' ? parsed.hq : '',
      regions: typeof parsed.regions === 'string' ? parsed.regions : '',
    };
  } catch {
    return null;
  }
}

export function serializeNarrativeZones(zones: NarrativeZones): string {
  return JSON.stringify({
    plant: zones.plant || '',
    hq: zones.hq || '',
    regions: zones.regions || '',
  });
}

export function htmlToPlain(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function zoneHasText(html: string): boolean {
  return htmlToPlain(html).length > 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeBasic(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function inlineToRuns(html: string): string {
  const re = /<\/?([a-z0-9]+)[^>]*>|<br\s*\/?>|([^<]+)/gi;
  let bold = 0;
  let italic = 0;
  let under = 0;
  let out = '';
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const text = decodeBasic(buf).replace(/\u00a0/g, ' ');
    buf = '';
    if (!text) return;
    const attrs = ['lang="en-US"', 'sz="1200"', 'dirty="0"'];
    if (bold) attrs.push('b="1"');
    if (italic) attrs.push('i="1"');
    if (under) attrs.push('u="sng"');
    out += `<a:r><a:rPr ${attrs.join(' ')}/><a:t>${escapeXml(text)}</a:t></a:r>`;
  };
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[2] != null) {
      buf += match[2];
      continue;
    }
    if (/^<br/i.test(match[0])) {
      flush();
      out += '<a:br><a:rPr lang="en-US" sz="1200" dirty="0"/></a:br>';
      continue;
    }
    const tag = match[1].toLowerCase();
    const close = match[0].startsWith('</');
    flush();
    const delta = close ? -1 : 1;
    if (tag === 'strong' || tag === 'b') bold = Math.max(0, bold + delta);
    if (tag === 'em' || tag === 'i') italic = Math.max(0, italic + delta);
    if (tag === 'u') under = Math.max(0, under + delta);
  }
  flush();
  return out || '<a:r><a:rPr lang="en-US" sz="1200" dirty="0"/><a:t></a:t></a:r>';
}

function paragraphXml(inner: string, list: 'bullet' | 'number' | null): string {
  const pPr = list === 'number'
    ? '<a:pPr marL="342900" indent="-171450"><a:buFont typeface="Arial"/><a:buAutoNum type="arabicPeriod"/></a:pPr>'
    : list === 'bullet'
      ? '<a:pPr marL="342900" indent="-171450"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>'
      : '';
  return `<a:p>${pPr}${inlineToRuns(inner)}</a:p>`;
}

/** HTML d’édition (gras, listes) → paragraphes DrawingML. */
export function htmlToDrawingParagraphs(html: string): string {
  const normalized = (html || '')
    .replace(/<div\b[^>]*>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>');
  const blocks = normalized.match(/<(p|ul|ol)\b[\s\S]*?<\/\1>/gi) || [];
  if (!blocks.length) {
    const plain = htmlToPlain(normalized);
    if (!plain) return '<a:p><a:endParaRPr lang="en-US" sz="1200"/></a:p>';
    return paragraphXml(normalized, null);
  }
  const paras: string[] = [];
  for (const block of blocks) {
    if (/^<ul/i.test(block) || /^<ol/i.test(block)) {
      const kind = /^<ol/i.test(block) ? 'number' : 'bullet';
      const items = [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
      if (!items.length) continue;
      for (const item of items) paras.push(paragraphXml(item[1], kind));
      continue;
    }
    const inner = block.replace(/^<p\b[^>]*>/i, '').replace(/<\/p>$/i, '');
    if (!htmlToPlain(inner) && !/<br/i.test(inner)) continue;
    paras.push(paragraphXml(inner, null));
  }
  return paras.join('') || '<a:p><a:endParaRPr lang="en-US" sz="1200"/></a:p>';
}

/** Découpe le HTML en N groupes de paragraphes (une forme PowerPoint par groupe). */
export function splitHtmlAcrossShapes(html: string, shapeCount: number): string[] {
  const count = Math.max(1, shapeCount);
  const blocks = (html || '').match(/<(p|ul|ol)\b[\s\S]*?<\/\1>/gi) || [];
  const pieces = blocks.length ? blocks : (htmlToPlain(html) ? [html] : []);
  const groups = Array.from({ length: count }, () => [] as string[]);
  if (!pieces.length) return groups.map(() => '');
  const size = Math.ceil(pieces.length / count);
  pieces.forEach((piece, index) => {
    const bucket = Math.min(count - 1, Math.floor(index / size));
    groups[bucket].push(piece);
  });
  return groups.map((group) => group.join(''));
}
