import { localizeJobTitle } from './bilingual-title';

/** Sous-ensemble utile d’un poste classification pour préremplir un employé. */
export interface ClassificationPosteRef {
  title: string;
  department?: string;
  location?: string;
  gradeNouveau?: string;
  gradePaterson?: string;
}

export function classificationGrade(poste: ClassificationPosteRef): string {
  return String(poste.gradeNouveau || poste.gradePaterson || '').trim();
}

/** Trouve un poste classification par titre brut ou localisé. */
export function findClassificationPoste(
  postes: ClassificationPosteRef[],
  rawTitle: string,
): ClassificationPosteRef | null {
  const q = String(rawTitle || '').trim().toLowerCase();
  if (!q) return null;
  const exact = postes.find((p) => p.title.trim().toLowerCase() === q);
  if (exact) return exact;
  const byLocale = postes.find((p) => {
    const fr = localizeJobTitle(p.title, 'fr').toLowerCase();
    const en = localizeJobTitle(p.title, 'en').toLowerCase();
    return fr === q || en === q;
  });
  return byLocale || null;
}

export function filterClassificationTitles(
  postes: ClassificationPosteRef[],
  query: string,
  locale: 'fr' | 'en' = 'fr',
  limit = 20,
): ClassificationPosteRef[] {
  const q = query.trim().toLowerCase();
  const ranked = !q
    ? [...postes]
    : postes.filter((p) => {
        const raw = p.title.toLowerCase();
        const localized = localizeJobTitle(p.title, locale).toLowerCase();
        return raw.includes(q) || localized.includes(q);
      });
  return ranked
    .sort((a, b) =>
      localizeJobTitle(a.title, locale).localeCompare(localizeJobTitle(b.title, locale), locale),
    )
    .slice(0, limit);
}

/** Champs employé à appliquer quand on valide un intitulé classification. */
export function employeeFieldsFromClassification(poste: ClassificationPosteRef): {
  jobTitle: string;
  position: string;
  grade: string;
  departement: string;
  localisation: string;
} {
  return {
    jobTitle: poste.title,
    position: poste.title,
    grade: classificationGrade(poste),
    departement: String(poste.department || '').trim(),
    localisation: String(poste.location || '').trim(),
  };
}
