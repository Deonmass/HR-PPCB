/**
 * Moteur générique de remplissage de modèles Word (.docx).
 *
 * Contrairement à un simple `replace` sur document.xml, ces helpers gèrent les
 * textes éclatés sur plusieurs runs `<w:t>` (fréquent dans les documents Word
 * édités plusieurs fois) : la recherche se fait sur le texte concaténé, puis le
 * remplacement est réinjecté dans les bons nœuds.
 */

interface DocxTextNode {
  /** Index du début de `<w:t...>` dans le XML. */
  matchStart: number;
  /** Index juste après `</w:t>`. */
  matchEnd: number;
  /** Contenu texte brut (entités XML incluses). */
  text: string;
}

/** Échappe uniquement les caractères significatifs dans un nœud texte Word. */
export function escapeDocxText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeDocxText(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function collectTextNodes(xml: string): DocxTextNode[] {
  const nodes: DocxTextNode[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    nodes.push({
      matchStart: match.index,
      matchEnd: match.index + match[0].length,
      text: match[1],
    });
  }
  return nodes;
}

function renderTextNode(text: string): string {
  return `<w:t xml:space="preserve">${text}</w:t>`;
}

/**
 * Remplace la plage [start, end) du texte concaténé par `replacement`
 * (déjà échappé), en réécrivant les nœuds `<w:t>` concernés.
 */
function spliceConcatRange(
  xml: string,
  nodes: DocxTextNode[],
  start: number,
  end: number,
  replacement: string,
): string {
  interface Edit {
    node: DocxTextNode;
    newText: string;
  }
  const edits: Edit[] = [];
  let offset = 0;
  for (const node of nodes) {
    const nodeStart = offset;
    const nodeEnd = offset + node.text.length;
    offset = nodeEnd;
    if (nodeEnd <= start || nodeStart >= end) continue;

    const localStart = Math.max(0, start - nodeStart);
    const localEnd = Math.min(node.text.length, end - nodeStart);
    const isFirst = nodeStart <= start;
    let newText = node.text.slice(0, localStart);
    if (isFirst) newText += replacement;
    newText += node.text.slice(localEnd);
    edits.push({ node, newText });
  }

  let result = xml;
  for (const edit of edits.reverse()) {
    result =
      result.slice(0, edit.node.matchStart) +
      renderTextNode(edit.newText) +
      result.slice(edit.node.matchEnd);
  }
  return result;
}

function findOccurrence(haystack: string, needle: string, occurrence: number): number {
  let index = -1;
  for (let i = 0; i < occurrence; i += 1) {
    index = haystack.indexOf(needle, index + 1);
    if (index < 0) return -1;
  }
  return index;
}

export interface ReplaceOptions {
  /** 1 = première occurrence (défaut), 2 = deuxième… ou 'all'. */
  occurrence?: number | 'all';
  /** Si true, ne lève pas d'erreur quand le texte est introuvable. */
  optional?: boolean;
}

/** Remplace un texte du document (même éclaté sur plusieurs runs) par une valeur. */
export function replaceDocxText(
  xml: string,
  search: string,
  value: string,
  options?: ReplaceOptions,
): string {
  const needle = escapeDocxText(search);
  const replacement = escapeDocxText(value);
  const occurrence = options?.occurrence ?? 1;

  if (occurrence === 'all') {
    if (!needle || needle === replacement) return xml;
    let result = xml;
    let found = false;
    let from = 0;
    let guard = 0;
    for (;;) {
      if (guard++ > 500) {
        throw new Error(`Remplacement Word trop répétitif : ${search.slice(0, 60)}`);
      }
      const nodes = collectTextNodes(result);
      const concat = nodes.map((node) => node.text).join('');
      const index = concat.indexOf(needle, from);
      if (index < 0) break;
      found = true;
      result = spliceConcatRange(result, nodes, index, index + needle.length, replacement);
      from = index + replacement.length;
    }
    if (!found && !options?.optional) {
      throw new Error(`Texte introuvable dans le modèle Word : ${search.slice(0, 60)}`);
    }
    return result;
  }

  const nodes = collectTextNodes(xml);
  const concat = nodes.map((node) => node.text).join('');
  const index = findOccurrence(concat, needle, occurrence);
  if (index < 0) {
    if (options?.optional) return xml;
    throw new Error(`Texte introuvable dans le modèle Word : ${search.slice(0, 60)}`);
  }
  return spliceConcatRange(xml, nodes, index, index + needle.length, replacement);
}

/**
 * Remplace tout le texte entre `start` (inclus) et `end` (inclus).
 * Utile pour réécrire un paragraphe juridique sans toucher au reste du document.
 */
export function replaceDocxSpan(
  xml: string,
  start: string,
  end: string,
  replacement: string,
  options?: { optional?: boolean },
): string {
  const startNeedle = escapeDocxText(start);
  const endNeedle = escapeDocxText(end);
  const nodes = collectTextNodes(xml);
  const concat = nodes.map((node) => node.text).join('');
  const startIndex = concat.indexOf(startNeedle);
  if (startIndex < 0) {
    if (options?.optional) return xml;
    throw new Error(`Début de paragraphe introuvable : ${start.slice(0, 60)}`);
  }
  const endIndex = concat.indexOf(endNeedle, startIndex);
  if (endIndex < 0) {
    if (options?.optional) return xml;
    throw new Error(`Fin de paragraphe introuvable : ${end.slice(0, 60)}`);
  }
  return spliceConcatRange(
    xml,
    nodes,
    startIndex,
    endIndex + endNeedle.length,
    escapeDocxText(replacement),
  );
}

export interface DocxRunPart {
  text: string;
  bold?: boolean;
}

const DEFAULT_RUN_PR =
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:color w:val="auto"/><w:lang w:val="fr-FR"/></w:rPr>';

function findRunOpenBefore(xml: string, pos: number): number {
  const re = /<w:r(?:\s[^>]*)?>/g;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    if (match.index >= pos) break;
    last = match.index;
  }
  return last;
}

function findRunCloseAfter(xml: string, pos: number): number {
  const index = xml.indexOf('</w:r>', pos);
  return index < 0 ? -1 : index + '</w:r>'.length;
}

function extractRunPr(runXml: string): string {
  const match = runXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  return match ? match[0] : DEFAULT_RUN_PR;
}

function withRunBold(rPr: string, bold: boolean): string {
  const stripped = rPr
    .replace(/<w:b\b[^>]*\/>/g, '')
    .replace(/<w:bCs\b[^>]*\/>/g, '')
    .replace(/<w:b\b[^>]*>\s*<\/w:b>/g, '')
    .replace(/<w:bCs\b[^>]*>\s*<\/w:bCs>/g, '');
  const tags = bold ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>';
  return stripped.replace('</w:rPr>', `${tags}</w:rPr>`);
}

function renderStyledRun(rPr: string, text: string, bold: boolean): string {
  return `<w:r>${withRunBold(rPr, bold)}<w:t xml:space="preserve">${escapeDocxText(text)}</w:t></w:r>`;
}

/**
 * Remplace la plage [start, end] par plusieurs runs (gras / pas gras).
 * Les runs d’origine de la plage sont réécrits pour ne pas hériter d’un gras global.
 */
export function replaceDocxSpanWithRuns(
  xml: string,
  start: string,
  end: string,
  parts: DocxRunPart[],
  options?: { optional?: boolean },
): string {
  const startNeedle = escapeDocxText(start);
  const endNeedle = escapeDocxText(end);
  const nodes = collectTextNodes(xml);
  const concat = nodes.map((node) => node.text).join('');
  const startIndex = concat.indexOf(startNeedle);
  if (startIndex < 0) {
    if (options?.optional) return xml;
    throw new Error(`Début de paragraphe introuvable : ${start.slice(0, 60)}`);
  }
  const endIndex = concat.indexOf(endNeedle, startIndex);
  if (endIndex < 0) {
    if (options?.optional) return xml;
    throw new Error(`Fin de paragraphe introuvable : ${end.slice(0, 60)}`);
  }
  const rangeEnd = endIndex + endNeedle.length;

  let offset = 0;
  let firstNode: DocxTextNode | null = null;
  let lastNode: DocxTextNode | null = null;
  let prefix = '';
  let suffix = '';
  for (const node of nodes) {
    const nodeStart = offset;
    const nodeEnd = offset + node.text.length;
    offset = nodeEnd;
    if (nodeEnd <= startIndex || nodeStart >= rangeEnd) continue;
    if (!firstNode) {
      firstNode = node;
      prefix = node.text.slice(0, Math.max(0, startIndex - nodeStart));
    }
    lastNode = node;
    suffix = node.text.slice(Math.min(node.text.length, rangeEnd - nodeStart));
  }
  if (!firstNode || !lastNode) {
    if (options?.optional) return xml;
    throw new Error('Plage Word introuvable pour le remplacement formaté');
  }

  const runStart = findRunOpenBefore(xml, firstNode.matchStart);
  const runEnd = findRunCloseAfter(xml, lastNode.matchEnd);
  if (runStart < 0 || runEnd < 0) {
    if (options?.optional) return xml;
    throw new Error('Run Word introuvable pour le remplacement formaté');
  }

  const basePr = extractRunPr(xml.slice(runStart, runEnd));
  const runs: string[] = [];
  if (prefix) runs.push(renderStyledRun(basePr, unescapeDocxText(prefix), false));
  for (const part of parts) {
    if (!part.text) continue;
    runs.push(renderStyledRun(basePr, part.text, Boolean(part.bold)));
  }
  if (suffix) runs.push(renderStyledRun(basePr, unescapeDocxText(suffix), false));

  return xml.slice(0, runStart) + runs.join('') + xml.slice(runEnd);
}

/**
 * Remplit un « blanc » (pointillés `…`/`.` ou underscores `_`) qui suit un
 * libellé, p.ex. `Name: ………………` ou `Position: ________`.
 * Les espaces immédiatement après le libellé sont conservés.
 */
export function fillDocxBlankAfterLabel(
  xml: string,
  label: string,
  value: string,
  options?: { optional?: boolean },
): string {
  const needle = escapeDocxText(label);
  const nodes = collectTextNodes(xml);
  const concat = nodes.map((node) => node.text).join('');
  const labelIndex = concat.indexOf(needle);
  if (labelIndex < 0) {
    if (options?.optional) return xml;
    throw new Error(`Libellé introuvable dans le modèle Word : ${label.slice(0, 60)}`);
  }

  const afterLabel = concat.slice(labelIndex + needle.length);
  // Espaces conservés, puis groupes de pointillés/underscores séparés d'au plus 2 espaces.
  const blank = afterLabel.match(/^([ \u00A0\t]*)([.…_]+(?:[ \u00A0]{1,2}[.…_]+)*)/);
  if (!blank) {
    if (options?.optional) return xml;
    throw new Error(`Zone à remplir introuvable après : ${label.slice(0, 60)}`);
  }

  const start = labelIndex + needle.length + blank[1].length;
  const end = start + blank[2].length;
  return spliceConcatRange(xml, nodes, start, end, escapeDocxText(value));
}
