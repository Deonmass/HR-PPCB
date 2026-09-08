import type {
  ExcoCahierHighlight,
  ExcoCahierIcon,
  ExcoCsrFy27Row,
  ExcoOverlays,
} from './exco-types';

/** Texte entre [[...]] = dernière mise à jour (affiché en bleu). */
export const CSR_UPDATE_COLOR = '1D4ED8';

export type CsrTextRun = { text: string; update?: boolean };

export function parseCsrUpdateMarkup(value: string): CsrTextRun[] {
  const src = value || '';
  const runs: CsrTextRun[] = [];
  const re = /\[\[([\s\S]*?)\]\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    if (match.index > last) runs.push({ text: src.slice(last, match.index) });
    if (match[1]) runs.push({ text: match[1], update: true });
    last = match.index + match[0].length;
  }
  if (last < src.length) runs.push({ text: src.slice(last) });
  if (!runs.length) runs.push({ text: src });
  return runs;
}

export function csrTextHasUpdate(value: string | undefined): boolean {
  return /\[\[[\s\S]+?\]\]/.test(value || '');
}

export function stripCsrUpdateMarkup(value: string): string {
  return (value || '').replace(/\[\[([\s\S]*?)\]\]/g, '$1');
}

/** Slide: si la cellule a une mise à jour, n’afficher que le bleu (sans l’ancien texte noir). */
export function csrSlideText(value: string): string {
  const src = value || '';
  if (!csrTextHasUpdate(src)) return src;
  const parts = parseCsrUpdateMarkup(src)
    .filter((run) => run.update && run.text.trim())
    .map((run) => `[[${run.text.replace(/\s+/g, ' ').trim()}]]`);
  return parts.join(' ') || src;
}

export const CAHIER_ICON_OPTIONS: Array<{ id: ExcoCahierIcon; label: string }> = [
  { id: 'scholarship', label: 'Scholarship' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'leisure', label: 'Leisure' },
  { id: 'electricity', label: 'Electricity' },
];

export const DEFAULT_CSR_FY27_ROWS: ExcoCsrFy27Row[] = [
  {
    id: 'csr-fy27-zamba-tank',
    name: 'Réservoir d’eau à Zamba',
    objective:
      'Planification du remplacement du réservoir défectueux et perforé par un nouveau déjà disponible.',
    progress: 'Accord du village pour le nouvel emplacement du réservoir.',
    risks: 'En attente du cahier des charges.',
    nextSteps: '[[en attente du cahier des charges]]',
  },
  {
    id: 'csr-fy27-mwinda',
    name: 'Partenariat Mwinda – EPI local',
    objective:
      'Former et intégrer professionnellement les jeunes femmes + produire des EPI localement pour réduire les importations et les retards.',
    progress: 'Élaboration du PR sur les travaux d’aménagement.',
    risks: 'PO procurement encore à émettre.',
    nextSteps: 'PO par le procurement.',
  },
  {
    id: 'csr-fy27-ppc-school',
    name: 'École PPC',
    objective: 'Statut légal de l’école signé.',
    progress: 'Le contrat est signé par MD.',
    risks: 'En attente de la signature de la congrégation.',
    nextSteps: 'En attente de la signature de la congrégation.',
  },
];

export const PROJECT_BODY_LABELS = [
  'Prochaines étapes',
  'Prochaine étape',
  'Travaux en cours',
  'Malanga Cité',
  'Statut légal',
  'Réalisation',
  'Objectif',
  'Situation',
  'Zamba 1re',
  'Zamba 1er',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Place chaque libellé connu sur sa propre ligne (titre : texte). */
export function structureProjectBody(body: string): string {
  const src = (body || '').replace(/\r\n/g, '\n').trim();
  if (!src) return '';
  const labels = [...PROJECT_BODY_LABELS].sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\s*(${labels.map(escapeRegExp).join('|')})\\s*:\\s*`, 'gi');
  const matches: Array<{ index: number; length: number; label: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    matches.push({ index: m.index, length: m[0].length, label: m[1].replace(/\s+/g, ' ').trim() });
  }
  if (!matches.length) return src;
  const chunks: string[] = [];
  const prefix = src.slice(0, matches[0].index).trim();
  if (prefix) chunks.push(prefix);
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const content = src.slice(cur.index + cur.length, next ? next.index : src.length).trim();
    chunks.push(`${cur.label} : ${content}`);
  }
  return chunks.join('\n');
}

export type ProjectBodyLine = { label: string | null; text: string };

export function parseProjectBodyLines(body: string): ProjectBodyLine[] {
  return structureProjectBody(body)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.{2,40}?)\s*:\s*([\s\S]*)$/);
      if (!m) return { label: null, text: line };
      return { label: m[1].trim(), text: m[2].trim() };
    });
}

export const DEFAULT_CAHIER_HIGHLIGHTS: ExcoCahierHighlight[] = [
  {
    id: 'cahier-agri',
    icon: 'agriculture',
    title: 'Agriculture',
    body: 'Reprise des activités agricoles pour les communautés de Nkumba et de Malanga Cité prévue pour septembre 2026.',
    progressPct: 25,
  },
  {
    id: 'cahier-leisure',
    icon: 'leisure',
    title: 'Loisirs',
    body: 'Malanga Cité et Nkumba : prise de mesures pour la réhabilitation du terrain de football.',
    progressPct: 40,
  },
  {
    id: 'cahier-electricity',
    icon: 'electricity',
    title: 'Électricité',
    body:
      'Réalisation : 80 % (matériels 100 %, finances 100 %).\nTravaux en cours : amélioration des réseaux de mise à la terre ; élargissement de la salle de contrôle pour accéder aux cellules acquises.\nZamba 1re : deux cabines installées.\nMalanga Cité : lettre à l’AT de Songololo pour les formalités du nouveau site du transformateur.',
    progressPct: 80,
  },
];

/** Blocs CSR (Tag / Titre / Texte / Progression) — format unifié avec Cahier. */
export const DEFAULT_CSR_HIGHLIGHTS: ExcoCahierHighlight[] = [
  {
    id: 'csr-zamba-tank',
    icon: 'infrastructure',
    title: 'Réservoir d’eau à Zamba',
    body:
      'Objectif : remplacement du réservoir défectueux et perforé par un nouveau déjà disponible.\nSituation : accord du village pour le nouvel emplacement.\nProchaines étapes : [[en attente du cahier des charges]].',
    progressPct: 35,
  },
  {
    id: 'csr-mwinda',
    icon: 'scholarship',
    title: 'Partenariat Mwinda – EPI local',
    body:
      'Objectif : former et intégrer professionnellement les jeunes femmes et produire des EPI localement.\nSituation : élaboration du PR sur les travaux d’aménagement.\nProchaines étapes : PO par le procurement.',
    progressPct: 45,
  },
  {
    id: 'csr-ppc-school',
    icon: 'scholarship',
    title: 'École PPC',
    body:
      'Objectif : statut légal de l’école signé.\nSituation : le contrat est signé par MD.\nProchaines étapes : en attente de la signature de la congrégation.',
    progressPct: 85,
  },
];

function asText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const CAHIER_ICONS = new Set<ExcoCahierIcon>([
  'scholarship',
  'infrastructure',
  'agriculture',
  'leisure',
  'electricity',
]);

function guessIconFromTitle(title: string): ExcoCahierIcon {
  const t = title.toLowerCase();
  if (/scholar|school|bourse|educ|ecole|école|mwinda|epi/.test(t)) return 'scholarship';
  if (/electr|snel|power/.test(t)) return 'electricity';
  if (/agri|farm|permacult/.test(t)) return 'agriculture';
  if (/sport|leisure|loisir|football|soccer/.test(t)) return 'leisure';
  return 'infrastructure';
}

function guessPctFromText(text: string): number {
  const m = text.match(/(\d{1,3})\s*%/);
  if (!m) return 50;
  return asPct(m[1]);
}

export function csrFy27RowsToHighlights(rows: ExcoCsrFy27Row[]): ExcoCahierHighlight[] {
  return rows.map((row, i) => ({
    id: row.id || `csr-mig-${i + 1}`,
    icon: guessIconFromTitle(row.name),
    title: row.name,
    body: [row.progress, row.objective, row.nextSteps].filter(Boolean).join('\n\n'),
    progressPct: guessPctFromText(`${row.progress} ${row.nextSteps}`),
  }));
}

export function normalizeCsrFy27Rows(raw: unknown): ExcoCsrFy27Row[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, i) => {
    const r = (row && typeof row === 'object' ? row : {}) as Partial<ExcoCsrFy27Row>;
    return {
      id: asText(r.id) || `csr-fy27-${i + 1}`,
      name: asText(r.name),
      objective: asText(r.objective),
      progress: asText(r.progress),
      risks: asText(r.risks),
      nextSteps: asText(r.nextSteps),
    };
  });
}

export function normalizeCahierHighlights(raw: unknown): ExcoCahierHighlight[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, i) => {
    const r = (row && typeof row === 'object' ? row : {}) as Partial<ExcoCahierHighlight>;
    const icon = CAHIER_ICONS.has(r.icon as ExcoCahierIcon)
      ? (r.icon as ExcoCahierIcon)
      : 'infrastructure';
    return {
      id: asText(r.id) || `block-${i + 1}`,
      icon,
      title: asText(r.title),
      body: asText(r.body),
      progressPct: asPct(r.progressPct),
    };
  });
}

export function normalizeCsrHighlights(raw: unknown): ExcoCahierHighlight[] {
  return normalizeCahierHighlights(raw);
}

export function resolveCsrFy27Rows(overlays: Pick<ExcoOverlays, 'csrFy27Rows'>): ExcoCsrFy27Row[] {
  return overlays.csrFy27Rows?.length ? overlays.csrFy27Rows : DEFAULT_CSR_FY27_ROWS;
}

export function resolveCsrHighlights(
  overlays: Pick<ExcoOverlays, 'csrHighlights' | 'csrFy27Rows'>,
): ExcoCahierHighlight[] {
  const rows = overlays.csrHighlights?.length
    ? overlays.csrHighlights
    : overlays.csrFy27Rows?.length
      ? csrFy27RowsToHighlights(overlays.csrFy27Rows)
      : DEFAULT_CSR_HIGHLIGHTS;
  return rows.map((row) => ({ ...row, body: structureProjectBody(row.body) }));
}

export function resolveCahierHighlights(
  overlays: Pick<ExcoOverlays, 'cahierHighlights'>,
): ExcoCahierHighlight[] {
  const rows = overlays.cahierHighlights?.length
    ? overlays.cahierHighlights
    : DEFAULT_CAHIER_HIGHLIGHTS;
  return rows.map((row) => ({ ...row, body: structureProjectBody(row.body) }));
}

export function emptyCsrFy27Row(id: string): ExcoCsrFy27Row {
  return { id, name: '', objective: '', progress: '', risks: '', nextSteps: '' };
}

export function emptyCahierHighlight(id: string): ExcoCahierHighlight {
  return { id, icon: 'infrastructure', title: '', body: '', progressPct: 0 };
}

export function emptyProjectBlock(id: string): ExcoCahierHighlight {
  return emptyCahierHighlight(id);
}
