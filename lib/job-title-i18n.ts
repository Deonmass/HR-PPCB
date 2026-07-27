const JOB_TITLE_FR: Record<string, string> = {
  'human resources manager': 'Responsable des ressources humaines',
  'hr manager': 'Responsable RH',
  'hr officer': 'Agent RH',
  'human resources officer': 'Agent des ressources humaines',
  'finance manager': 'Responsable financier',
  'financial controller': 'Contrôleur financier',
  'accountant': 'Comptable',
  'chief accountant': 'Chef comptable',
  'general manager': 'Directeur général',
  'managing director': 'Directeur général',
  'operations manager': 'Responsable des opérations',
  'production manager': 'Responsable de production',
  'plant manager': 'Directeur d\'usine',
  'maintenance manager': 'Responsable maintenance',
  'maintenance supervisor': 'Superviseur maintenance',
  'engineer': 'Ingénieur',
  'senior engineer': 'Ingénieur principal',
  'technician': 'Technicien',
  'supervisor': 'Superviseur',
  'driver': 'Chauffeur',
  'security guard': 'Agent de sécurité',
  'receptionist': 'Réceptionniste',
  'secretary': 'Secrétaire',
  'executive assistant': 'Assistant(e) de direction',
  'administrative assistant': 'Assistant(e) administratif(ve)',
  'warehouse manager': 'Responsable entrepôt',
  'logistics manager': 'Responsable logistique',
  'procurement manager': 'Responsable achats',
  'purchasing officer': 'Agent achats',
  'quality manager': 'Responsable qualité',
  'quality controller': 'Contrôleur qualité',
  'safety officer': 'Agent HSE',
  'hse officer': 'Agent HSE',
  'it manager': 'Responsable informatique',
  'it officer': 'Agent informatique',
  'sales manager': 'Responsable commercial',
  'marketing manager': 'Responsable marketing',
  'legal counsel': 'Conseiller juridique',
  'legal advisor': 'Conseiller juridique',
};

const JOB_TITLE_EN: Record<string, string> = Object.fromEntries(
  Object.entries(JOB_TITLE_FR).map(([en, fr]) => [fr.toLowerCase(), en]),
);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function translateJobTitleToFrench(jobTitle: string): string {
  const trimmed = jobTitle.trim();
  if (!trimmed) return '';
  const key = normalizeKey(trimmed);
  if (JOB_TITLE_FR[key]) return JOB_TITLE_FR[key];
  if (JOB_TITLE_EN[key]) return trimmed;
  return trimmed;
}

export function translateJobTitleToEnglish(jobTitle: string): string {
  const trimmed = jobTitle.trim();
  if (!trimmed) return '';
  const key = normalizeKey(trimmed);
  if (JOB_TITLE_FR[key]) return key;
  if (JOB_TITLE_EN[key]) {
    const words = JOB_TITLE_EN[key].split(' ');
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return trimmed;
}

export function localizeJobTitle(jobTitle: string, language: 'fr' | 'en'): string {
  return language === 'fr'
    ? translateJobTitleToFrench(jobTitle)
    : translateJobTitleToEnglish(jobTitle);
}
