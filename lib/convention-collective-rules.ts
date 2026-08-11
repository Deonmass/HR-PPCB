/** Catégories / clauses issues de la convention collective (index RH). */

export type ContractClassification = 'classifie' | 'maitrise' | 'cadre';

export interface ClassificationRules {
  id: ContractClassification;
  label: string;
  /** Libellé type « Agent de Maîtrise », « Agent classifié », « Cadre ». */
  categoryNoun: string;
  trialMonths: number;
  annualLeaveDays: number;
  /** Durée de base du préavis (employeur). */
  noticeBaseLabel: string;
  /** Jours ouvrables ajoutés par année entière de service. */
  noticeIncreaseDaysPerYear: number;
  /** Phrase complète Article 10 (préavis). */
  noticeArticleSentence: string;
}

/**
 * Barème conventionnel utilisé pour pré-remplir le contrat standard.
 * (PDF scanné — index structuré côté RH ; ajustable dans le formulaire.)
 */
export const CLASSIFICATION_RULES: Record<ContractClassification, ClassificationRules> = {
  classifie: {
    id: 'classifie',
    label: 'Classifié',
    categoryNoun: 'Agent classifié',
    trialMonths: 3,
    annualLeaveDays: 20,
    noticeBaseLabel: 'quatorze (14) jours',
    noticeIncreaseDaysPerYear: 7,
    noticeArticleSentence:
      'Pour les agents classifiés, la durée du préavis est fixée à quatorze (14) jours. '
      + 'Cette durée est augmentée de sept (7) jours ouvrables par année entière de services continus, '
      + 'comptée de date à date.',
  },
  maitrise: {
    id: 'maitrise',
    label: 'Maîtrise',
    categoryNoun: 'Agent de Maîtrise',
    trialMonths: 5,
    annualLeaveDays: 22,
    noticeBaseLabel: 'un (1) mois',
    noticeIncreaseDaysPerYear: 9,
    noticeArticleSentence:
      'Pour les agents de maitrise, la durée du préavis est fixée à un (1) mois. '
      + 'Cette durée est augmentée de neuf (9) jours ouvrables par année entière de services continus, '
      + 'comptée de date à date.',
  },
  cadre: {
    id: 'cadre',
    label: 'Cadre',
    categoryNoun: 'Cadre',
    trialMonths: 6,
    annualLeaveDays: 24,
    noticeBaseLabel: 'trois (3) mois',
    noticeIncreaseDaysPerYear: 16,
    noticeArticleSentence:
      'Pour les agents de cadre, la durée du préavis est fixée à trois (3) mois. '
      + 'Cette durée est augmentée de seize (16) jours ouvrables par année d’ancienneté.',
  },
};

export function resolveClassification(raw: string): ContractClassification {
  const v = raw.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (v.includes('cadre')) return 'cadre';
  if (v.includes('maitrise') || v.includes('c1') || v.includes('c2') || v.includes('c3')) {
    return 'maitrise';
  }
  if (v.includes('classif') || v.includes('ouvrier') || /^[ab]\d/i.test(v)) {
    return 'classifie';
  }
  return 'maitrise';
}

export function formatCategoryLine(
  classification: ContractClassification,
  code?: string,
): string {
  const rules = CLASSIFICATION_RULES[classification];
  const trimmed = (code || '').trim();
  if (trimmed) return `${trimmed} (${rules.categoryNoun})`;
  return rules.categoryNoun;
}
