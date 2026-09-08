import 'server-only';

import type { ExcoCahierHighlight, ExcoCahierIcon } from './exco-types';
import type { ProjectRecord } from './project-types';
import { clampEvolution, normalizeProject, statutFromEvolution } from './projects';
import { readProjects, upsertProject } from './projects-store';

/** Mots-clés pour relier un highlight à un projet. */
const ICON_MATCHERS: Record<ExcoCahierIcon, string[]> = {
  scholarship: ['scholarship', 'bourse', 'education', 'école', 'ecole', 'school', 'sewing'],
  infrastructure: ['infrastructure', 'pont', 'bridge', 'malanga', 'tank', 'water'],
  agriculture: ['agriculture', 'agri', 'nkumba', 'manalola', 'mwinda', 'ppe'],
  leisure: ['leisure', 'sport', 'loisir', 'football', 'soccer'],
  electricity: ['electric', 'électr', 'electr', 'zamba', 'snel'],
};

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function matchesType(typeProjet: string, expected: 'csr' | 'cahier'): boolean {
  const t = norm(typeProjet);
  if (expected === 'cahier') return t.includes('cahier');
  return t === 'csr' || t.includes('csr') || (!t.includes('cahier') && t.length > 0 && expected === 'csr');
}

function matchesHighlight(project: ProjectRecord, icon: ExcoCahierIcon, title: string): boolean {
  const keys = ICON_MATCHERS[icon] || [];
  const hay = norm(`${project.name} ${project.secteur} ${project.sousActivite} ${title}`);
  const titleHit = title.trim() && norm(project.name).includes(norm(title).slice(0, 18));
  return titleHit || keys.some((k) => hay.includes(norm(k)));
}

async function syncHighlightsToProjects(
  highlights: ExcoCahierHighlight[],
  type: 'csr' | 'cahier',
): Promise<number> {
  if (!highlights.length) return 0;
  const data = await readProjects();
  const scoped = data.projects.filter((p) => matchesType(p.typeProjet, type));
  let updated = 0;

  for (const h of highlights) {
    const evolution = clampEvolution(h.progressPct);
    const nextStatut = statutFromEvolution(evolution);
    for (const p of scoped) {
      if (!matchesHighlight(p, h.icon, h.title)) continue;
      const currentEvo = clampEvolution(
        p.evolution !== undefined && p.evolution !== null
          ? p.evolution
          : p.statut?.toLowerCase().includes('termin') || p.statut?.toLowerCase().includes('closed')
            ? 100
            : p.statut?.toLowerCase().includes('cours')
              ? 50
              : 0,
      );
      if (currentEvo === evolution && p.statut === nextStatut) continue;
      await upsertProject(
        normalizeProject({
          ...p,
          evolution,
          statut: nextStatut,
          commentaire: h.body || p.commentaire || '',
        }),
      );
      updated += 1;
    }
  }

  return updated;
}

/**
 * Propage les highlights Cahier vers les projets module « Cahier de charges ».
 */
export async function syncCahierHighlightsToProjects(
  highlights: ExcoCahierHighlight[],
): Promise<number> {
  return syncHighlightsToProjects(highlights, 'cahier');
}

/**
 * Propage les highlights CSR vers les projets module « CSR ».
 */
export async function syncCsrHighlightsToProjects(
  highlights: ExcoCahierHighlight[],
): Promise<number> {
  return syncHighlightsToProjects(highlights, 'csr');
}
