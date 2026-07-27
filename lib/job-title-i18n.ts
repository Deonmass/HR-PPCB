const JOB_TITLE_FR: Record<string, string> = {
  // HR
  'head of human resources': 'Directeur/Directrice des ressources humaines',
  'head of hr': 'Directeur/Directrice RH',
  'human resources manager': 'Responsable des ressources humaines',
  'hr manager': 'Responsable RH',
  'hr officer': 'Agent RH',
  'human resources officer': 'Agent des ressources humaines',
  'hr business partner': 'Business partner RH',
  'talent acquisition manager': 'Responsable recrutement',
  'recruitment officer': 'Chargé(e) de recrutement',
  'payroll officer': 'Agent paie',
  'payroll manager': 'Responsable paie',

  // Direction / management
  'general manager': 'Directeur général',
  'managing director': 'Directeur général',
  'chief executive officer': 'Directeur général',
  'ceo': 'Directeur général',
  'deputy general manager': 'Directeur général adjoint',
  'plant manager': "Directeur d'usine",
  'factory manager': "Directeur d'usine",
  'site manager': 'Directeur de site',
  'operations manager': 'Responsable des opérations',
  'head of operations': 'Directeur/Directrice des opérations',
  'production manager': 'Responsable de production',
  'head of production': 'Directeur/Directrice de production',
  'maintenance manager': 'Responsable maintenance',
  'head of maintenance': 'Directeur/Directrice maintenance',
  'maintenance supervisor': 'Superviseur maintenance',
  'engineering manager': 'Responsable ingénierie',
  'head of engineering': "Directeur/Directrice de l'ingénierie",

  // Finance
  'finance manager': 'Responsable financier',
  'head of finance': 'Directeur/Directrice financier(ère)',
  'chief financial officer': 'Directeur/Directrice financier(ère)',
  'cfo': 'Directeur/Directrice financier(ère)',
  'financial controller': 'Contrôleur financier',
  'accountant': 'Comptable',
  'chief accountant': 'Chef comptable',
  'cost controller': 'Contrôleur de gestion',

  // Technique
  'engineer': 'Ingénieur',
  'senior engineer': 'Ingénieur principal',
  'mechanical foreman': 'Contremaître mécanique',
  'electrical foreman': 'Contremaître électrique',
  'foreman': 'Contremaître',
  'technician': 'Technicien',
  'supervisor': 'Superviseur',
  'team leader': "Chef d'équipe",

  // Support
  'driver': 'Chauffeur',
  'security guard': 'Agent de sécurité',
  'receptionist': 'Réceptionniste',
  'secretary': 'Secrétaire',
  'executive assistant': 'Assistant(e) de direction',
  'administrative assistant': 'Assistant(e) administratif(ve)',
  'warehouse manager': 'Responsable entrepôt',
  'logistics manager': 'Responsable logistique',
  'head of logistics': 'Directeur/Directrice logistique',
  'procurement manager': 'Responsable achats',
  'head of procurement': 'Directeur/Directrice des achats',
  'purchasing officer': 'Agent achats',
  'quality manager': 'Responsable qualité',
  'head of quality': 'Directeur/Directrice qualité',
  'quality controller': 'Contrôleur qualité',
  'safety officer': 'Agent HSE',
  'hse officer': 'Agent HSE',
  'hse manager': 'Responsable HSE',
  'head of hse': 'Directeur/Directrice HSE',
  'it manager': 'Responsable informatique',
  'head of it': 'Directeur/Directrice informatique',
  'it officer': 'Agent informatique',
  'sales manager': 'Responsable commercial',
  'head of sales': 'Directeur/Directrice commercial(e)',
  'marketing manager': 'Responsable marketing',
  'legal counsel': 'Conseiller juridique',
  'legal advisor': 'Conseiller juridique',
};

/** Variantes selon le genre pour les titres « Directeur/Directrice … ». */
const GENDERED_FR: Array<{ pattern: RegExp; male: string; female: string }> = [
  {
    pattern: /^directeur\/directrice des ressources humaines$/i,
    male: 'Directeur des ressources humaines',
    female: 'Directrice des ressources humaines',
  },
  {
    pattern: /^directeur\/directrice rh$/i,
    male: 'Directeur RH',
    female: 'Directrice RH',
  },
  {
    pattern: /^directeur\/directrice des opérations$/i,
    male: 'Directeur des opérations',
    female: 'Directrice des opérations',
  },
  {
    pattern: /^directeur\/directrice de production$/i,
    male: 'Directeur de production',
    female: 'Directrice de production',
  },
  {
    pattern: /^directeur\/directrice maintenance$/i,
    male: 'Directeur maintenance',
    female: 'Directrice maintenance',
  },
  {
    pattern: /^directeur\/directrice de l'ingénierie$/i,
    male: "Directeur de l'ingénierie",
    female: "Directrice de l'ingénierie",
  },
  {
    pattern: /^directeur\/directrice financier\(ère\)$/i,
    male: 'Directeur financier',
    female: 'Directrice financière',
  },
  {
    pattern: /^directeur\/directrice logistique$/i,
    male: 'Directeur logistique',
    female: 'Directrice logistique',
  },
  {
    pattern: /^directeur\/directrice des achats$/i,
    male: 'Directeur des achats',
    female: 'Directrice des achats',
  },
  {
    pattern: /^directeur\/directrice qualité$/i,
    male: 'Directeur qualité',
    female: 'Directrice qualité',
  },
  {
    pattern: /^directeur\/directrice hse$/i,
    male: 'Directeur HSE',
    female: 'Directrice HSE',
  },
  {
    pattern: /^directeur\/directrice informatique$/i,
    male: 'Directeur informatique',
    female: 'Directrice informatique',
  },
  {
    pattern: /^directeur\/directrice commercial\(e\)$/i,
    male: 'Directeur commercial',
    female: 'Directrice commerciale',
  },
  {
    pattern: /^directeur général$/i,
    male: 'Directeur général',
    female: 'Directrice générale',
  },
  {
    pattern: /^directeur général adjoint$/i,
    male: 'Directeur général adjoint',
    female: 'Directrice générale adjointe',
  },
  {
    pattern: /^directeur d'usine$/i,
    male: "Directeur d'usine",
    female: "Directrice d'usine",
  },
  {
    pattern: /^directeur de site$/i,
    male: 'Directeur de site',
    female: 'Directrice de site',
  },
];

const JOB_TITLE_EN: Record<string, string> = Object.fromEntries(
  Object.entries(JOB_TITLE_FR).map(([en, fr]) => [fr.toLowerCase(), en]),
);

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isFemaleGenre(genre?: string | null): boolean {
  const g = String(genre ?? '').trim().toLowerCase();
  return /^(madame|mme|mademoiselle|mlle|mrs\.?|ms\.?|miss|female|f)\b/.test(g)
    || g === 'f'
    || g.includes('madame')
    || g.includes('mme');
}

function applyFrenchGender(title: string, genre?: string | null): string {
  const female = isFemaleGenre(genre);
  for (const rule of GENDERED_FR) {
    if (rule.pattern.test(title.trim())) {
      return female ? rule.female : rule.male;
    }
  }
  // Fallbacks génériques
  if (female) {
    return title
      .replace(/\bDirecteur\b/g, 'Directrice')
      .replace(/\bResponsable\b/g, 'Responsable')
      .replace(/\bAssistant\(e\)\b/g, 'Assistante')
      .replace(/\badministratif\(ve\)/gi, 'administrative');
  }
  return title
    .replace(/\bDirecteur\/Directrice\b/g, 'Directeur')
    .replace(/\bAssistant\(e\)\b/g, 'Assistant')
    .replace(/\badministratif\(ve\)/gi, 'administratif');
}

function toTitleCaseEnglish(value: string): string {
  return value
    .split(' ')
    .map((w) => {
      if (/^(of|and|the|for|in|to)$/i.test(w)) return w.toLowerCase();
      if (/^(hr|hse|it|ceo|cfo)$/i.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/^Of /, 'of ')
    .replace(/\bOf\b/g, 'of');
}

export function translateJobTitleToFrench(jobTitle: string, genre?: string | null): string {
  const trimmed = jobTitle.trim();
  if (!trimmed) return '';
  const key = normalizeKey(trimmed);
  const mapped = JOB_TITLE_FR[key];
  if (mapped) return applyFrenchGender(mapped, genre);
  // Déjà en français (présent dans les valeurs)
  if (JOB_TITLE_EN[key]) return applyFrenchGender(trimmed, genre);
  return applyFrenchGender(trimmed, genre);
}

export function translateJobTitleToEnglish(jobTitle: string): string {
  const trimmed = jobTitle.trim();
  if (!trimmed) return '';
  const key = normalizeKey(trimmed);
  // Déjà une clé EN connue
  if (JOB_TITLE_FR[key]) return toTitleCaseEnglish(key);
  // Valeur FR → clé EN
  if (JOB_TITLE_EN[key]) return toTitleCaseEnglish(JOB_TITLE_EN[key]);
  // Essayer sans accents / variantes Directeur|Directrice
  const ungendered = key
    .replace(/\bdirectrice\b/g, 'directeur')
    .replace(/\bfinanciere\b/g, 'financier')
    .replace(/\bcommerciale\b/g, 'commercial')
    .replace(/\bgenerale\b/g, 'general')
    .replace(/\badjointe\b/g, 'adjoint');
  if (JOB_TITLE_EN[ungendered]) return toTitleCaseEnglish(JOB_TITLE_EN[ungendered]);
  return trimmed;
}

export function localizeJobTitle(
  jobTitle: string,
  language: 'fr' | 'en',
  genre?: string | null,
): string {
  return language === 'fr'
    ? translateJobTitleToFrench(jobTitle, genre)
    : translateJobTitleToEnglish(jobTitle);
}
