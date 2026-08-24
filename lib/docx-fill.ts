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
