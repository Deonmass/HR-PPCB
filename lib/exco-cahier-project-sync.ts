import 'server-only';

import type { ExcoCahierHighlight, ExcoCahierIcon } from './exco-types';
import type { ProjectRecord } from './project-types';
import { readProjects, upsertProject } from './projects-store';

/** Mots-clés pour relier un highlight Cahier à un projet « Cahier de charges ». */
const ICON_MATCHERS: Record<ExcoCahierIcon, string[]> = {
  scholarship: ['scholarship', 'bourse', 'education', 'école', 'ecole'],
  infrastructure: ['infrastructure', 'pont', 'bridge', 'malanga'],
  agriculture: ['agriculture', 'agri', 'nkumba', 'manalola'],
  leisure: ['leisure', 'sport', 'loisir', 'football', 'soccer'],
  electricity: ['electric', 'électr', 'electr', 'zamba', 'snel'],
};

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function isCahierType(typeProjet: string): boolean {
  const t = norm(typeProjet);
  return t.includes('cahier');
}

function statutFromPct(pct: number): ProjectRecord['statut'] {
  if (pct >= 100) return 'Terminé';
  if (pct > 0) return 'En cours';
  return 'Non debuté';
}

function matchesHighlight(project: ProjectRecord, icon: ExcoCahierIcon): boolean {
  const keys = ICON_MATCHERS[icon] || [];
  const hay = norm(`${project.name} ${project.secteur} ${project.sousActivite}`);
  return keys.some((k) => hay.includes(norm(k)));
}

/**
 * Propage les highlights Cahier vers les projets module « Cahier de charges »
 * (statut dérivé du % de progression).
 */
export async function syncCahierHighlightsToProjects(
  highlights: ExcoCahierHighlight[],
): Promise<number> {
  if (!highlights.length) return 0;
  const data = await readProjects();
  const cahierProjects = data.projects.filter((p) => isCahierType(p.typeProjet));
  let updated = 0;

  for (const h of highlights) {
    const nextStatut = statutFromPct(Number(h.progressPct) || 0);
    for (const p of cahierProjects) {
      if (!matchesHighlight(p, h.icon)) continue;
      if (p.statut === nextStatut) continue;
      await upsertProject({ ...p, statut: nextStatut });
      updated += 1;
    }
  }

  return updated;
}
