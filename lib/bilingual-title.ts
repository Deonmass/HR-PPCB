/** Intitulés bilingues du type « English ( French ) ». */

export type AppTitleLocale = 'fr' | 'en';

const FR_HINT =
  /[àâäéèêëïîôùûüçœ]|représent|commercial|régional|junior|senior|analyste|ingénieur|comptable|assistant|directeur|chef|ouvrier|technicien|magasinier|acheteur/i;

/**
 * Découpe un titre « EN ( FR ) » — le dernier groupe entre parenthèses est la traduction FR
 * lorsqu’il ressemble au français (sinon le titre est renvoyé tel quel).
 */
export function splitBilingualTitle(raw: string): { en: string; fr: string } | null {
  const title = String(raw || '').trim();
  if (!title) return null;
  const match = title.match(/^(.*?)\s*\(\s*([^()]+)\s*\)\s*$/);
  if (!match) return null;
  const en = match[1]!.trim();
  const fr = match[2]!.trim();
  if (!en || !fr) return null;
  if (!FR_HINT.test(fr) && !FR_HINT.test(en)) return null;
  // Si le français est à gauche (rare), inverse.
  if (FR_HINT.test(en) && !FR_HINT.test(fr)) {
    return { en: fr, fr: en };
  }
  return { en, fr };
}

export function localizeJobTitle(raw: string, locale: AppTitleLocale = 'fr'): string {
  const title = String(raw || '').trim();
  if (!title) return '';
  const parts = splitBilingualTitle(title);
  if (!parts) return title;
  return locale === 'fr' ? parts.fr : parts.en;
}
