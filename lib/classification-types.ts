export type ClassificationFamily = 'Encadrement' | 'Maitrise' | 'Execution';

export interface ClassificationPoste {
  id: string;
  numero: number | null;
  dateEval: string;
  departmentShort: string;
  title: string;
  instructions: number | null;
  experience: number | null;
  initiative: number | null;
  responsabilite: number | null;
  commandement: number | null;
  discretion: number | null;
  effortPhysique: number | null;
  effortMental: number | null;
  conditionsTravail: number | null;
  risques: number | null;
  total: number | null;
  gradePaterson: string;
  blueprint: string;
  classificationNationale: string;
  eventailPoints: string;
  gradeNouveau: string;
  classification: string;
  family: ClassificationFamily;
  echelon: number | null;
  ecart: number | null;
  department: string;
  location: string;
}

export type ClassificationPosteInput = Omit<ClassificationPoste, 'id' | 'family'> & {
  id?: string;
  family?: ClassificationFamily;
};

export interface ClassificationStatRow {
  label: string;
  value: number;
  color?: string;
}

export interface ClassificationDashboard {
  totalPostes: number;
  totalDepartements: number;
  totalClassifications: number;
  totalLocations: number;
  byFamily: ClassificationStatRow[];
  byClassification: ClassificationStatRow[];
  byDepartment: ClassificationStatRow[];
  byLocation: ClassificationStatRow[];
  byGrade: ClassificationStatRow[];
}

export const CLASSIFICATION_ORDER = [
  'Cadre de Direction',
  'Cadre de collaboration 1',
  'Cadre de collaboration 2',
  'Cadre de collaboration 3',
  'Cadre de collaboration 4',
  'Maitrise 1',
  'Maitrise 2',
  'Maitrise 3',
  'Maitrise 4',
  'Travailleur Hautement Qualifié',
  'Qualifié 1',
  'Qualifié 2',
  'Semi-Qualifié 1',
  'Semi-Qualifié 2',
  'Semi-Qualifié 3',
];

export const FAMILY_COLORS: Record<ClassificationFamily, string> = {
  Encadrement: '#2563eb',
  Maitrise: '#7c3aed',
  Execution: '#0d9488',
};

const STAT_PALETTE = ['#e30613', '#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#db2777', '#0891b2', '#ea580c'];

export function familyFromClassification(value: string): ClassificationFamily {
  const n = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (n.includes('direction') || n.includes('collaboration')) return 'Encadrement';
  if (n.includes('maitrise')) return 'Maitrise';
  return 'Execution';
}

function blankLabel(value: string): string {
  const v = String(value || '').trim();
  return v || 'Non renseigné';
}

function countBy(
  postes: ClassificationPoste[],
  getter: (poste: ClassificationPoste) => string,
  order?: string[],
): ClassificationStatRow[] {
  const counts = new Map<string, number>();
  for (const poste of postes) {
    const label = blankLabel(getter(poste));
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const rows = [...counts.entries()].map(([label, value]) => ({ label, value }));
  if (order?.length) {
    const rank = new Map(order.map((label, i) => [label, i]));
    rows.sort((a, b) => {
      const ra = rank.get(a.label) ?? 999;
      const rb = rank.get(b.label) ?? 999;
      if (ra !== rb) return ra - rb;
      return b.value - a.value || a.label.localeCompare(b.label, 'fr');
    });
  } else {
    rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'));
  }
  return rows.map((row, i) => ({
    ...row,
    color: STAT_PALETTE[i % STAT_PALETTE.length],
  }));
}

export function classificationRank(label: string): number {
  const i = CLASSIFICATION_ORDER.indexOf(label);
  return i >= 0 ? i : 999;
}

export function buildClassificationDashboard(postes: ClassificationPoste[]): ClassificationDashboard {
  const byFamily = (['Encadrement', 'Maitrise', 'Execution'] as ClassificationFamily[]).map((label) => ({
    label,
    value: postes.filter((p) => p.family === label).length,
    color: FAMILY_COLORS[label],
  }));
  const byClassification = countBy(postes, (p) => p.classification, CLASSIFICATION_ORDER);
  const byDepartment = countBy(postes, (p) => p.department || p.departmentShort);
  const byLocation = countBy(postes, (p) => p.location);
  const byGrade = countBy(postes, (p) => p.gradeNouveau || p.gradePaterson);

  return {
    totalPostes: postes.length,
    totalDepartements: byDepartment.filter((r) => r.label !== 'Non renseigné').length,
    totalClassifications: byClassification.filter((r) => r.label !== 'Non renseigné').length,
    totalLocations: byLocation.filter((r) => r.label !== 'Non renseigné').length,
    byFamily,
    byClassification,
    byDepartment,
    byLocation,
    byGrade,
  };
}

export function emptyClassificationPoste(): ClassificationPosteInput {
  return {
    numero: null,
    dateEval: '',
    departmentShort: '',
    title: '',
    instructions: null,
    experience: null,
    initiative: null,
    responsabilite: null,
    commandement: null,
    discretion: null,
    effortPhysique: null,
    effortMental: null,
    conditionsTravail: null,
    risques: null,
    total: null,
    gradePaterson: '',
    blueprint: '',
    classificationNationale: '',
    eventailPoints: '',
    gradeNouveau: '',
    classification: '',
    family: 'Execution',
    echelon: null,
    ecart: null,
    department: '',
    location: '',
  };
}
