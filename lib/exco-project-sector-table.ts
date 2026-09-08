import type { ExcoCahierHighlight, ExcoCsrProject } from './exco-types';
import { resolveCahierHighlights, resolveCsrHighlights, stripCsrUpdateMarkup } from './exco-csr-fy27';
import type { ExcoOverlays, ExcoReportPayload } from './exco-types';

export type ExcoSectorEvolutionRow = {
  secteur: string;
  commentaire: string;
  evolution: string;
};

function normalizeStatus(statut: string): 'closed' | 'enCours' | 'nonDebutes' | 'autre' {
  const n = statut.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (n.includes('closed') || n.includes('termin')) return 'closed';
  if (n.includes('cours')) return 'enCours';
  if (n.includes('non') || n.includes('debut')) return 'nonDebutes';
  return 'autre';
}

function evolutionFromProject(p: {
  evolution?: number | null;
  statut?: string;
}): number | null {
  if (p.evolution != null && Number.isFinite(p.evolution)) {
    return Math.max(0, Math.min(100, Number(p.evolution)));
  }
  const st = normalizeStatus(p.statut || '');
  if (st === 'closed') return 100;
  if (st === 'enCours') return 50;
  if (st === 'nonDebutes') return 0;
  return null;
}

/** Retire montants budget / $ des commentaires. */
export function stripBudgetNoise(text: string): string {
  return (text || '')
    .replace(/budget\s*[\d.,]+\s*%/gi, '')
    .replace(/[\d\s.,]+\s*\$\s*\/\s*[\d\s.,]+\s*\$/gi, '')
    .replace(/\$[\d\s.,]+/g, '')
    .replace(/\blien?:\s*[^—|]*/gi, '')
    .replace(/\blieu:\s*[^—|]*/gi, '')
    .replace(/\s*[—|]\s*[—|]+/g, ' — ')
    .replace(/^\s*[—|]\s*|\s*[—|]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function summarizeSector(
  count: number,
  closed: number,
  enCours: number,
  nonDebutes: number,
  avg: number,
): string {
  const bits: string[] = [];
  if (enCours) bits.push(`${enCours} en cours`);
  if (closed) bits.push(`${closed} clos`);
  if (nonDebutes) bits.push(`${nonDebutes} non débuté${nonDebutes > 1 ? 's' : ''}`);
  const head =
    count <= 0
      ? 'Aucun projet'
      : `${count} projet${count > 1 ? 's' : ''}${bits.length ? ` (${bits.join(', ')})` : ''}`;
  return `${head} — évolution moyenne ${avg}%.`;
}

/**
 * Une ligne par secteur : commentaire = résumé d’évolution (sans budgets),
 * colonne Évolution = moyenne des %.
 */
export function aggregateProjectsBySector(
  projects: Array<{
    secteur?: string;
    name?: string;
    commentaire?: string;
    progress?: string;
    evolution?: number | null;
    statut?: string;
  }>,
): ExcoSectorEvolutionRow[] {
  type Acc = {
    evolutions: number[];
    closed: number;
    enCours: number;
    nonDebutes: number;
    autre: number;
  };
  const groups = new Map<string, Acc>();

  for (const p of projects) {
    const secteur = (p.secteur || 'Non renseigné').trim() || 'Non renseigné';
    const g = groups.get(secteur) || {
      evolutions: [],
      closed: 0,
      enCours: 0,
      nonDebutes: 0,
      autre: 0,
    };
    const evo = evolutionFromProject(p);
    if (evo != null) g.evolutions.push(evo);
    const st = normalizeStatus(p.statut || '');
    if (st === 'closed') g.closed += 1;
    else if (st === 'enCours') g.enCours += 1;
    else if (st === 'nonDebutes') g.nonDebutes += 1;
    else g.autre += 1;
    groups.set(secteur, g);
  }

  return [...groups.entries()]
    .map(([secteur, g]) => {
      const count = g.closed + g.enCours + g.nonDebutes + g.autre;
      const avg = g.evolutions.length
        ? Math.round(g.evolutions.reduce((a, b) => a + b, 0) / g.evolutions.length)
        : 0;
      return {
        secteur,
        commentaire: summarizeSector(count, g.closed, g.enCours, g.nonDebutes, avg),
        evolution: `${avg}%`,
      };
    })
    .sort((a, b) => a.secteur.localeCompare(b.secteur, 'fr'));
}

function isCahierProject(p: { typeProjet?: string }): boolean {
  return (p.typeProjet || '').trim().toLowerCase().includes('cahier');
}

function isCsrProject(p: { typeProjet?: string }): boolean {
  const t = (p.typeProjet || '').trim().toLowerCase();
  return t === 'csr' || (t.includes('csr') && !isCahierProject(p));
}

function rowsFromHighlights(items: ExcoCahierHighlight[]): ExcoSectorEvolutionRow[] {
  // Agrège aussi les highlights par titre (secteur) si plusieurs partagent le même.
  return aggregateProjectsBySector(
    items.map((item) => ({
      secteur: (item.title || '—').trim() || '—',
      commentaire: stripBudgetNoise(stripCsrUpdateMarkup(item.body || '')),
      evolution: Math.max(0, Math.min(100, Number(item.progressPct) || 0)),
      statut:
        (Number(item.progressPct) || 0) >= 100
          ? 'Closed'
          : (Number(item.progressPct) || 0) <= 0
            ? 'Non débuté'
            : 'En cours',
    })),
  );
}

export function buildExcoSectorTables(report: ExcoReportPayload): {
  csr: ExcoSectorEvolutionRow[];
  cahier: ExcoSectorEvolutionRow[];
} {
  const all = report.computed.csrProjects || [];
  let csr = aggregateProjectsBySector(all.filter(isCsrProject));
  let cahier = aggregateProjectsBySector(all.filter(isCahierProject));
  const overlays: ExcoOverlays = report.overlays;
  if (!csr.length) csr = rowsFromHighlights(resolveCsrHighlights(overlays));
  if (!cahier.length) cahier = rowsFromHighlights(resolveCahierHighlights(overlays));
  return { csr, cahier };
}

/** Expose pour tests / PPTX si besoin de filtrer manuellement. */
export function partitionCsrProjects(projects: ExcoCsrProject[]): {
  csr: ExcoCsrProject[];
  cahier: ExcoCsrProject[];
} {
  return {
    csr: projects.filter(isCsrProject),
    cahier: projects.filter(isCahierProject),
  };
}
