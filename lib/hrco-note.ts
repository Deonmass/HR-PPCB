/**
 * Note préparatoire du comité RH du 26/11/2026.
 * Les effectifs viennent du registre. Le reste reste vide, ou conserve
 * un chiffre déjà écrit dans la note (source « document », non recalculé).
 */
import { excoSiteBucket, EXCO_SITE } from './exco-site-buckets';
import { EXCO_CANONICAL_DEPARTMENTS, normalizeDepartmentName } from './exco-department-map';
import { formatDisplayName } from './format-display-name';

export type HrcoCellSource = 'system' | 'document';

export type HrcoCell = {
  text: string;
  source: HrcoCellSource;
  /** Salariés qui composent le chiffre. Tableau vide = effectif à zéro, toujours cliquable. */
  matricules?: string[];
  /** Heures par matricule, pour le détail des heures supplémentaires. */
  hoursByMatricule?: Record<string, number>;
};

export type HrcoRow = {
  cells: Array<HrcoCell | null>;
  total?: boolean;
};

export type HrcoTable = {
  id: string;
  title: string;
  owner: string;
  source: string;
  columns: string[];
  rows: HrcoRow[];
  hasSystemData: boolean;
};

export type HrcoSection = {
  id: string;
  title: string;
  points: string[];
  tables: HrcoTable[];
};

export type HrcoPerson = {
  matricule: string;
  nom: string;
  fonction: string;
  departement: string;
  localisation: string;
  grade: string;
};

export type HrcoNote = {
  title: string;
  committeeDate: string;
  asOfLabel: string;
  headcount: number;
  activeMatricules: string[];
  sections: HrcoSection[];
  people: HrcoPerson[];
};

export type HrcoEmployee = {
  matricule: string;
  nom: string;
  departement: string;
  grade: string;
  jobTitle: string;
  localisation: string;
  service?: string;
  typeContrat: string;
  nationality: string;
  statut: string;
};

export type HrcoOtLine = {
  matricule: string;
  bucket: 'engineering' | 'production' | 'other';
  hours: number;
  nom: string;
  fonction: string;
  departement: string;
  localisation: string;
  grade: string;
};

export type HrcoOvertime = {
  engineering: number;
  production: number;
  other: number;
  periodLabel: string;
  lines: HrcoOtLine[];
};

type Band = 'E' | 'D' | 'C' | 'B';

const BANDS: Band[] = ['E', 'D', 'C', 'B'];

const BAND_LABEL: Record<Band, string> = {
  E: 'Cadres supérieurs (E)',
  D: 'Cadres (D)',
  C: 'Agents de maîtrise (C)',
  B: 'Employés / ouvriers (B)',
};

const NOTE_GROUPS: Array<{ id: string; label: string; owner: string; analysed: string }> = [
  {
    id: 'exco',
    label: 'EXCO',
    owner: 'KIESSE',
    analysed: 'Nombre de directeurs, responsabilités et coût global',
  },
  {
    id: 'finance',
    label: 'Finance',
    owner: 'Gedeon',
    analysed: 'Effectifs et niveaux hiérarchiques',
  },
  {
    id: 'rh',
    label: 'Ressources Humaines',
    owner: 'Gedeon',
    analysed: 'Dimensionnement par rapport aux salariés et aux sous-traitants',
  },
  {
    id: 'commercial',
    label: 'Commercial',
    owner: 'KIESSE',
    analysed: 'Coût du département par rapport aux ventes',
  },
  {
    id: 'procurement',
    label: 'Procurement',
    owner: 'KIESSE',
    analysed: 'Effectifs, coûts et économies réalisées',
  },
  {
    id: 'admin',
    label: 'Administration',
    owner: '',
    analysed: 'Nécessité des postes et possibilités de mutualisation',
  },
  {
    id: 'production',
    label: 'Production',
    owner: 'Gedeon / Charité',
    analysed: 'Productivité et adéquation des effectifs aux besoins réels',
  },
  {
    id: 'engineering',
    label: 'Engineering',
    owner: 'Pelagie',
    analysed: 'Effectifs, sous-traitance et coûts de maintenance',
  },
  {
    id: 'logistique',
    label: 'Logistique',
    owner: 'Pelagie',
    analysed: 'Répartition des ressources et coûts internes et externes',
  },
  {
    id: 'autres',
    label: 'Autres départements',
    owner: '',
    analysed: 'Mining, Quality Assurance, SHE, Optimization et départements non listés',
  },
];

type AlbatrosSpec = {
  tokens: string[];
  extra?: string;
  nom: string;
  fonction: string;
  departement: string;
  statut: string;
  payroll: string;
  keepNoteRole?: boolean;
};

const ALBATROS: AlbatrosSpec[] = [
  { tokens: ['odipo'], nom: 'Edgar Odipo', fonction: 'Regional Manager', departement: 'Administration', statut: 'Permanent', payroll: 'oui' },
  { tokens: ['mbodi'], nom: 'Gael Mbodi', fonction: 'Site Manager', departement: 'Administration', statut: 'Permanent', payroll: 'oui' },
  { tokens: ['mirindi'], nom: 'Carine Mirindi', fonction: 'Human Ressource Officer', departement: 'Human Ressources', statut: 'CDD', payroll: 'oui' },
  { tokens: ['yumba'], nom: 'Lystha Yumba', fonction: 'Production supervisor', departement: 'Production', statut: 'CDD', payroll: 'oui' },
  { tokens: ['mikindo'], nom: 'Samson Mikindo', fonction: 'Maintenance Supervisor', departement: 'Maintenance', statut: 'CDD', payroll: 'oui' },
  { tokens: ['buhendwa'], extra: 'jerry', nom: 'Jerry Buhendwa', fonction: 'Supply chain', departement: 'Procurement', statut: 'CDD', payroll: 'oui' },
  { tokens: ['panda'], nom: 'Patrick panda', fonction: 'Sales Consultant', departement: 'Sales', statut: 'CDD', payroll: 'oui' },
  { tokens: ['atatala'], nom: 'Jeremie Atatala', fonction: 'Mining Supervisor', departement: 'Minning', statut: 'CDD', payroll: 'oui' },
  { tokens: ['ngaba'], nom: 'Arnold Ngaba', fonction: 'Cost Controler', departement: 'Finances', statut: 'Permanent', payroll: 'oui' },
  {
    tokens: ['atatala'],
    nom: 'Jeremie Atatala',
    fonction: 'SHE',
    departement: 'SHE',
    statut: 'Poste vacant couvert par intérim',
    payroll: 'Couvre temporairement les fonctions de SHE',
    keepNoteRole: true,
  },
];

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isActive(employee: HrcoEmployee): boolean {
  const statut = employee.statut.trim().toLowerCase();
  return !statut || statut === 'active';
}

function bandOf(grade: string): Band | '' {
  const letter = grade.trim().charAt(0).toUpperCase();
  if (letter === 'E' || letter === 'D' || letter === 'C' || letter === 'B') return letter;
  return '';
}

function isCongolese(nationality: string): boolean {
  return /congo/i.test(nationality);
}

function doc(text: string): HrcoCell {
  return { text, source: 'document' };
}

function sys(text: string, matricules?: string[], hoursByMatricule?: Record<string, number>): HrcoCell {
  return {
    text,
    source: 'system',
    ...(matricules ? { matricules } : {}),
    ...(hoursByMatricule ? { hoursByMatricule } : {}),
  };
}

function countCell(employees: HrcoEmployee[]): HrcoCell {
  return sys(String(employees.length), employees.map((employee) => employee.matricule));
}

function pct(part: number, total: number): string {
  if (!total) return '';
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format((part / total) * 100)} %`;
}

function hoursText(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
}

function frenchDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ids(employees: HrcoEmployee[]): string[] {
  return employees.map((employee) => employee.matricule);
}

function table(
  id: string,
  title: string,
  owner: string,
  source: string,
  columns: string[],
  rows: HrcoRow[],
): HrcoTable {
  return {
    id,
    title,
    owner,
    source,
    columns,
    rows,
    hasSystemData: rows.some((row) => row.cells.some((cell) => cell?.source === 'system')),
  };
}

function blankRows(labels: string[], width: number): HrcoRow[] {
  return labels.map((label) => ({
    cells: [label ? doc(label) : null, ...Array.from({ length: width - 1 }, () => null)],
    total: fold(label) === 'total',
  }));
}

function noteSite(employee: HrcoEmployee): 'plant' | 'siege' | 'regional' {
  const loc = fold(employee.localisation);
  if (loc.includes('tshikapa')) return 'siege';
  const site = excoSiteBucket(employee.localisation);
  if (site === EXCO_SITE.plant) return 'plant';
  if (site === EXCO_SITE.kinshasa) return 'siege';
  return 'regional';
}

function noteGroup(employee: HrcoEmployee): string {
  if (bandOf(employee.grade) === 'E') return 'exco';
  const raw = fold(`${employee.departement} ${employee.service || ''}`);
  if (raw.includes('packag') || raw.includes('logistic') || raw.includes('logistique')) return 'logistique';
  const department = normalizeDepartmentName(employee.departement);
  if (department === 'Finance') return 'finance';
  if (department === 'Human Resources') return 'rh';
  if (department === 'Sales and Marketing') return 'commercial';
  if (department === 'Procurement' || department === 'Supply Chain') return 'procurement';
  if (department === 'Legal' || department === 'Audit' || department === 'MD Office') return 'admin';
  if (department === 'Production') return 'production';
  if (department === 'Engineering') return 'engineering';
  if (department === 'Logistic' || department === 'Transport and Transit') return 'logistique';
  return 'autres';
}

function findAlbatros(employees: HrcoEmployee[], spec: AlbatrosSpec): HrcoEmployee | undefined {
  return employees.find((employee) => {
    const name = fold(employee.nom);
    if (!spec.tokens.every((token) => name.includes(token))) return false;
    if (spec.extra && !name.includes(spec.extra)) return false;
    return true;
  });
}

function contratLabel(typeContrat: string, fallback: string): string {
  const value = typeContrat.trim().toUpperCase();
  if (value === 'CDI') return 'Permanent';
  if (value === 'CDD') return 'CDD';
  if (value) return typeContrat.trim();
  return fallback;
}

function siteLabel(employees: HrcoEmployee[]): string {
  const names = [...new Set(employees.map((employee) => employee.localisation.trim()).filter(Boolean))];
  return names.join(', ');
}

function joinTitles(employees: HrcoEmployee[]): string {
  const titles = [...new Set(employees.map((employee) => employee.jobTitle.trim()).filter(Boolean))];
  if (titles.length <= 3) return titles.join(', ');
  return `${titles.slice(0, 2).join(', ')} (+${titles.length - 2})`;
}

export function buildHrcoNote(input: {
  employees: HrcoEmployee[];
  overtime: HrcoOvertime;
  asOf: Date;
}): HrcoNote {
  const active = input.employees.filter(isActive);
  const asOfLabel = frenchDate(input.asOf);
  const people: HrcoPerson[] = active.map((employee) => ({
    matricule: employee.matricule,
    nom: formatDisplayName(employee.nom),
    fonction: employee.jobTitle,
    departement: normalizeDepartmentName(employee.departement) || employee.departement,
    localisation: employee.localisation,
    grade: employee.grade,
  }));
  const knownPeople = new Set(people.map((person) => person.matricule));
  for (const line of input.overtime.lines || []) {
    if (knownPeople.has(line.matricule)) continue;
    knownPeople.add(line.matricule);
    people.push({
      matricule: line.matricule,
      nom: formatDisplayName(line.nom) || line.matricule,
      fonction: line.fonction,
      departement: line.departement,
      localisation: line.localisation,
      grade: line.grade,
    });
  }

  const plant = active.filter((employee) => noteSite(employee) === 'plant');
  const siegeAll = active.filter((employee) => noteSite(employee) === 'siege');
  const regional = active.filter((employee) => noteSite(employee) === 'regional');

  const albatrosMatched = new Map<string, HrcoEmployee>();
  for (const spec of ALBATROS) {
    if (spec.keepNoteRole) continue;
    const found = findAlbatros(active, spec);
    if (found) albatrosMatched.set(found.matricule, found);
  }
  const albatros = [...albatrosMatched.values()];
  const albatrosIds = new Set(albatros.map((employee) => employee.matricule));
  const siege = siegeAll.filter((employee) => !albatrosIds.has(employee.matricule));
  const productionSite = plant.filter((employee) => !albatrosIds.has(employee.matricule));
  const claimed = new Set([...ids(productionSite), ...ids(siege), ...ids(albatros)]);
  const autresSites = active.filter((employee) => !claimed.has(employee.matricule));

  const gradeE = active.filter((employee) => bandOf(employee.grade) === 'E');
  const expats = active.filter((employee) => employee.nationality.trim() && !isCongolese(employee.nationality));
  const hr = active.filter((employee) => normalizeDepartmentName(employee.departement) === 'Human Resources');
  const finance = active.filter((employee) => normalizeDepartmentName(employee.departement) === 'Finance');

  const grouped = new Map<string, HrcoEmployee[]>();
  for (const group of NOTE_GROUPS) grouped.set(group.id, []);
  for (const employee of active) {
    grouped.get(noteGroup(employee))?.push(employee);
  }

  const byDepartment = new Map<string, HrcoEmployee[]>();
  for (const employee of active) {
    const name = normalizeDepartmentName(employee.departement) || 'Non renseigné';
    const list = byDepartment.get(name) || [];
    list.push(employee);
    byDepartment.set(name, list);
  }
  const departmentNames = [
    ...EXCO_CANONICAL_DEPARTMENTS.filter((name) => byDepartment.has(name)),
    ...[...byDepartment.keys()].filter((name) => !EXCO_CANONICAL_DEPARTMENTS.includes(name as (typeof EXCO_CANONICAL_DEPARTMENTS)[number])),
  ];

  const siteShare = (group: HrcoEmployee[]): HrcoCell => sys(pct(group.length, active.length), ids(group));

  const t11 = table(
    '1.1',
    'Tableau 1.1 – Organigramme de la société',
    'Charité',
    'Effectif interne du registre, regroupé par site. Effectif sous-traité non disponible.',
    ['N°', 'Entité / Site', 'Responsable', 'Effectif interne', 'Effectif sous-traité', 'Observations'],
    [
      { cells: [doc('1'), doc('Siège'), null, countCell(siegeAll), null, sys(siteLabel(siegeAll) || 'Siège', ids(siegeAll))] },
      { cells: [doc('2'), doc('Usine'), null, countCell(plant), null, sys(siteLabel(plant) || 'Usine', ids(plant))] },
      { cells: [doc('3'), doc('Sites régionaux'), null, countCell(regional), null, sys(siteLabel(regional) || 'Sites régionaux', ids(regional))] },
      { cells: [null, doc('Total'), null, countCell(active), null, null], total: true },
    ],
  );

  const t12 = table(
    '1.2',
    'Tableau 1.2 – Contrats de sous-traitance du personnel',
    'Serge',
    'Aucun contrat de sous-traitance dans le registre des salariés.',
    ['N°', 'Prestataire', 'Fonctions', 'Effectif', 'Conditions contractuelles', 'Coût mensuel (USD)'],
    blankRows(['1', '2', '3', '4', '5'], 6),
  );

  const t13 = table(
    '1.3',
    'Tableau 1.3 – Organisation du personnel à Albatros',
    'Carine M',
    'Noms de la note, rapprochés du registre quand le salarié existe. Le payroll n’est pas dans le registre.',
    ['N°', 'Nom et Prénom', 'Fonction', 'Département', 'Statut', 'Payroll'],
    ALBATROS.map((spec, index) => {
      const found = spec.keepNoteRole ? undefined : findAlbatros(active, spec);
      if (!found || spec.keepNoteRole) {
        return {
          cells: [
            doc(String(index + 1)),
            doc(spec.nom),
            doc(spec.fonction),
            doc(spec.departement),
            doc(spec.statut),
            doc(spec.payroll),
          ],
        };
      }
      return {
        cells: [
          doc(String(index + 1)),
          sys(formatDisplayName(found.nom), [found.matricule]),
          sys(found.jobTitle || spec.fonction, [found.matricule]),
          sys(normalizeDepartmentName(found.departement) || spec.departement, [found.matricule]),
          sys(contratLabel(found.typeContrat, spec.statut), [found.matricule]),
          doc(spec.payroll),
        ],
      };
    }),
  );

  const t14 = table(
    '1.4',
    'Tableau 1.4 – Changements de fonctions et de postes en 2026',
    'KIESSE',
    'Historique de reclassement et incidences financières absents du registre.',
    ['N°', 'Nom et Prénom', 'Ancienne fonction', 'Nouvelle fonction', 'Date d’effet', 'Incidence mensuelle (USD)', 'Incidence annuelle (USD)'],
    blankRows(['1', '2', '3', '4', '5'], 7),
  );

  const t15 = table(
    '1.5',
    'Tableau 1.5 – Répartition des effectifs par site',
    'KIESSE',
    'Albatros = salariés de la liste retrouvés dans le registre. Les autres sites sont le reste, sans double compte.',
    ['Site', 'Effectif interne', '% du total', 'Sous-traitants', '% du total', 'Commentaire / Pistes d’optimisation'],
    [
      { cells: [doc('Site principal de production'), countCell(productionSite), siteShare(productionSite), null, null, sys(siteLabel(productionSite), ids(productionSite))] },
      { cells: [doc('Siège'), countCell(siege), siteShare(siege), null, null, sys(siteLabel(siege), ids(siege))] },
      { cells: [doc('Albatros'), countCell(albatros), siteShare(albatros), null, null, sys(siteLabel(albatros), ids(albatros))] },
      { cells: [doc('Autres sites régionaux'), countCell(autresSites), siteShare(autresSites), null, null, sys(siteLabel(autresSites), ids(autresSites))] },
      { cells: [doc('Total'), countCell(active), sys(active.length ? '100 %' : '', ids(active)), null, null, null], total: true },
    ],
  );

  const t16 = table(
    '1.6',
    'Tableau 1.6 – Impact financier de la reclassification des postes sur 3 ans',
    'KIESSE',
    'Coûts de reclassification absents du registre.',
    ['Catégorie / Poste', 'Effectif concerné', 'Coût actuel (USD)', 'FY27 (USD)', 'FY28 (USD)', 'FY29 (USD)', 'Total 3 ans (USD)'],
    [{ cells: [doc('Total'), null, null, null, null, null, null], total: true }],
  );

  const indicators = table(
    '2.0',
    'Indicateurs HR de la note',
    'KIESSE',
    'Seul l’effectif interne est relu dans le registre. Les montants restent ceux écrits dans la note.',
    ['Indicateur', 'Situation FY26'],
    [
      { cells: [doc('Chiffre d’affaires annuel estimé'), doc('110 M USD')] },
      { cells: [doc('Staff Cost à fin octobre'), doc('8,39 M USD')] },
      { cells: [doc('Staff Cost annuel extrapolé'), doc('10,06 M USD')] },
      { cells: [doc('Staff Cost mensuel moyen'), doc('838 540 USD')] },
      { cells: [doc('Effectif interne'), countCell(active)] },
      { cells: [doc('Coût mensuel moyen par salarié'), doc('4 875 USD')] },
      { cells: [doc('Ratio Staff Cost / CA'), doc('9,15 %')] },
      { cells: [doc('Ratio cible proposé'), doc('8 % maximum')] },
    ],
  );

  const years = ['2022', '2023', '2024', '2025', 'FY26 (estimé)', 'FY27 (budget)'];
  const t21 = table(
    '2.1',
    'Tableau 2.1 – Évolution du Staff Cost depuis 2022',
    'KIESSE',
    'Effectif FY26 = salariés actifs aujourd’hui. Historique et montants non disponibles.',
    ['Année', 'Staff Cost (M USD)', 'Effectif interne', 'Coût moyen / salarié (USD)', 'Ratio Staff Cost / CA', 'Variation annuelle (%)'],
    years.map((year) => ({
      cells: [
        doc(year),
        null,
        year.startsWith('FY26') ? countCell(active) : null,
        null,
        null,
        null,
      ],
    })),
  );

  const bandRows: HrcoRow[] = departmentNames.map((name) => {
    const group = byDepartment.get(name) || [];
    return {
      cells: [
        doc(name),
        ...BANDS.map((band) => countCell(group.filter((employee) => bandOf(employee.grade) === band))),
        countCell(group),
      ],
    };
  });
  bandRows.push({
    cells: [
      doc('Total'),
      ...BANDS.map((band) => countCell(active.filter((employee) => bandOf(employee.grade) === band))),
      countCell(active),
    ],
    total: true,
  });
  const t22 = table(
    '2.2',
    'Tableau 2.2 – Effectifs par département et niveau hiérarchique',
    'KIESSE',
    'Grades du registre : E cadres supérieurs, D cadres, C agents de maîtrise, B employés / ouvriers. Montants USD non disponibles.',
    ['Département', ...BANDS.map((band) => BAND_LABEL[band]), 'Total'],
    bandRows,
  );

  const t23 = table(
    '2.3',
    'Tableau 2.3 – EXCO et expatriés',
    'KIESSE',
    'EXCO = grade E. Expatriés = nationalité renseignée autre que congolaise. Un directeur peut figurer dans les deux lignes. Salaires non disponibles.',
    ['Catégorie', 'Effectif', 'Salaires', 'Primes', 'Indemnités', 'Avantages', 'Total (USD)'],
    [
      { cells: [doc('EXCO'), countCell(gradeE), null, null, null, null, null] },
      { cells: [doc('Expatriés'), countCell(expats), null, null, null, null, null] },
      { cells: [doc('Autres'), null, null, null, null, null, null] },
      { cells: [doc('Total'), null, null, null, null, null, null], total: true },
    ],
  );

  const t24 = table(
    '2.4',
    'Tableau 2.4 – Justification de l’augmentation du Staff Cost de 9,4 %',
    'KIESSE',
    'Ventilation mensuelle des coûts absente du registre.',
    ['Poste de coût', 'Janvier (USD)', 'Octobre (USD)', 'Variation (USD)', 'Variation (%)', 'Explication'],
    [{ cells: [doc('Total'), null, null, null, null, null], total: true }],
  );

  const t25 = table(
    '2.5',
    'Tableau 2.5 – Paiements en attente, notamment les bonus annuels',
    'KIESSE',
    'Bonus et échéances absents du registre.',
    ['Nature du paiement', 'Bénéficiaires', 'Montant (USD)', 'Échéance prévue', 'Observations'],
    [
      { cells: [doc('Bonus annuels'), null, null, null, null] },
      { cells: [doc('Total'), null, null, null, null], total: true },
    ],
  );

  const t26 = table(
    '2.6',
    'Tableau 2.6 – Benchmark des rémunérations',
    'KIESSE',
    'Données Mercer absentes du registre.',
    ['Poste / Catégorie', 'PPC (USD)', 'Cimenterie A (USD)', 'Cimenterie B (USD)', 'Médiane marché (USD)', 'Écart PPC / marché (%)'],
    blankRows([''], 6),
  );

  const t27 = table(
    '2.7',
    'Tableau 2.7 – Coût global de fonctionnement de la structure',
    '',
    'Montants absents du registre. Les responsables restent ceux de la note.',
    ['Catégorie de charges', 'FY26 estimé (USD)', '% du total', 'Responsable'],
    [
      { cells: [doc('Staff Cost interne'), null, null, doc('KIESSE')] },
      { cells: [doc('Coûts de la sous-traitance du personnel'), null, null, doc('Pelagie')] },
      { cells: [doc('Frais de gouvernance'), null, null, doc('Pelagie')] },
      { cells: [doc('Honoraires des consultants'), null, null, doc('Pelagie')] },
      { cells: [doc('Total'), null, null, null], total: true },
    ],
  );

  const t31 = table(
    '3.1',
    'Tableau 3.1 – Analyse par département',
    '',
    'Les directeurs (grade E) sont sur la ligne EXCO. Packaging & Logistics est compté en Logistique. Coûts et économies non disponibles.',
    ['Département', 'Effectif', 'Coût annuel (USD)', 'Éléments analysés', 'Doublons / mutualisation', 'Économies envisageables (USD)', 'Responsable'],
    [
      ...NOTE_GROUPS.map((group) => ({
        cells: [
          doc(group.label),
          countCell(grouped.get(group.id) || []),
          null,
          doc(group.analysed),
          null,
          null,
          group.owner ? doc(group.owner) : null,
        ],
      })),
      { cells: [doc('Total'), countCell(active), null, null, null, null, null], total: true },
    ],
  );

  const financeBands = BANDS
    .map((band) => ({ band, group: finance.filter((employee) => bandOf(employee.grade) === band) }))
    .filter((item) => item.group.length > 0);
  const t32 = table(
    '3.2',
    'Tableau 3.2 – Finance : effectifs et niveaux hiérarchiques',
    'Gedeon',
    'Salariés du département Finance, y compris un cadre supérieur aussi compté dans EXCO au tableau 3.1. Coût mensuel non disponible.',
    ['Niveau hiérarchique', 'Fonction', 'Effectif', 'Dont sous-traitants', 'Coût mensuel (USD)', 'Commentaires'],
    [
      ...financeBands.map((item) => ({
        cells: [
          sys(BAND_LABEL[item.band]),
          sys(joinTitles(item.group)),
          countCell(item.group),
          null,
          null,
          null,
        ],
      })),
      { cells: [doc('Total'), null, countCell(finance), null, null, null], total: true },
    ],
  );

  const rhRatio = hr.length ? `1 pour ${Math.round(active.length / hr.length)} salariés internes` : '';
  const t33 = table(
    '3.3',
    'Tableau 3.3 – Ressources Humaines : dimensionnement',
    'Gedeon',
    'Effectif RH du registre rapporté aux salariés actifs. Sous-traitants non disponibles.',
    ['Catégorie', 'Effectif RH', 'Salariés couverts', 'Sous-traitants couverts', 'Ratio RH / effectif', 'Commentaires'],
    [
      {
        cells: [
          doc('Personnel interne'),
          countCell(hr),
          countCell(active),
          null,
          sys(pct(hr.length, active.length), ids(hr)),
          sys(rhRatio, ids(hr)),
        ],
      },
      { cells: [doc('Sous-traitants'), null, null, null, null, null] },
      {
        cells: [doc('Total'), countCell(hr), countCell(active), null, sys(pct(hr.length, active.length), ids(hr)), null],
        total: true,
      },
    ],
  );

  const productivityYears = ['2022', '2023', '2024', '2025', 'FY26 (estimé)'];
  const t411 = table(
    '4.1.1',
    'Tableau 4.1.1 – Staff Cost / CA et EBITDA : PPC',
    'KIESSE',
    'Chiffre d’affaires, EBITDA et staff cost historiques absents du registre.',
    ['Année', 'Staff Cost (USD)', 'Chiffre d’affaires (USD)', 'Staff Cost / CA (%)', 'EBITDA (USD)', 'Staff Cost / EBITDA (%)'],
    blankRows(productivityYears, 6),
  );
  const t421 = table(
    '4.2.1',
    'Tableau 4.2.1 – Staff Cost par tonne : PPC',
    'KIESSE',
    'Tonnes produites et vendues absentes du registre.',
    ['Année', 'Staff Cost (USD)', 'Tonnes produites', 'Staff Cost / tonne produite (USD)', 'Tonnes vendues', 'Staff Cost / tonne vendue (USD)'],
    blankRows(productivityYears, 6),
  );
  const t431 = table(
    '4.3.1',
    'Tableau 4.3.1 – CA, production et ventes par employé : PPC',
    'KIESSE',
    'La ligne FY26 reprend l’effectif actuel, pas une moyenne annuelle. CA et tonnes non disponibles.',
    ['Année', 'Effectif moyen', 'CA par employé (USD)', 'Production par employé (t)', 'Ventes par employé (t)', 'Commentaires'],
    productivityYears.map((year) => ({
      cells: [
        doc(year),
        year.startsWith('FY26') ? countCell(active) : null,
        null,
        null,
        null,
        year.startsWith('FY26') ? sys(`Effectif au ${asOfLabel}, pas une moyenne`) : null,
      ],
    })),
  );
  const t412 = table(
    '4.1.2',
    'Tableau 4.1.2 – Staff Cost / CA et EBITDA : sous-traitance',
    'Pelagie',
    'Données de sous-traitance absentes du registre.',
    ['Année', 'Staff Cost (USD)', 'Chiffre d’affaires (USD)', 'Staff Cost / CA (%)', 'EBITDA (USD)', 'Staff Cost / EBITDA (%)'],
    blankRows(productivityYears, 6),
  );
  const t422 = table(
    '4.2.2',
    'Tableau 4.2.2 – Staff Cost par tonne : sous-traitance',
    'Pelagie',
    'Données de sous-traitance absentes du registre.',
    ['Année', 'Staff Cost (USD)', 'Tonnes produites', 'Staff Cost / tonne produite (USD)', 'Tonnes vendues', 'Staff Cost / tonne vendue (USD)'],
    blankRows(productivityYears, 6),
  );
  const t432 = table(
    '4.3.2',
    'Tableau 4.3.2 – CA, production et ventes par employé : sous-traitance',
    'Pelagie',
    'Données de sous-traitance absentes du registre.',
    ['Année', 'Effectif moyen', 'CA par employé (USD)', 'Production par employé (t)', 'Ventes par employé (t)', 'Commentaires'],
    blankRows(productivityYears, 6),
  );

  const t51 = table(
    '5.1',
    'Tableau 5.1 – Provision pour congés par département',
    'KIESSE',
    'Le total d’octobre est celui écrit dans la note. La répartition par département n’est pas dans le registre.',
    ['Département', 'Provision fin 2025 (USD)', 'Provision fin octobre 2026 (USD)', 'Variation (%)', 'Justification', 'Plan de régularisation'],
    [{ cells: [doc('Total'), null, doc('430 327'), null, null, null], total: true }],
  );

  const otLines = input.overtime.lines || [];
  const otTotal = input.overtime.engineering + input.overtime.production + input.overtime.other;
  const otBundle = (bucket: HrcoOtLine['bucket'] | 'all', value: number, asPercent = false): HrcoCell | null => {
    if (otTotal <= 0) return null;
    const lines = bucket === 'all' ? otLines : otLines.filter((line) => line.bucket === bucket);
    const hoursByMatricule: Record<string, number> = {};
    for (const line of lines) {
      hoursByMatricule[line.matricule] = (hoursByMatricule[line.matricule] || 0) + line.hours;
    }
    return sys(asPercent ? pct(value, otTotal) : hoursText(value), Object.keys(hoursByMatricule), hoursByMatricule);
  };
  const t52 = table(
    '5.2',
    'Tableau 5.2 – Heures supplémentaires par département',
    'Gedeon',
    input.overtime.periodLabel
      ? `Heures saisies dans l’application (${input.overtime.periodLabel}). Le coût n’est pas calculé ici.`
      : 'Aucune heure supplémentaire saisie dans l’application.',
    ['Département', 'Volume (heures)', 'Coût (USD)', '% du total', 'Motif principal', 'Mesure d’optimisation proposée'],
    [
      { cells: [doc('Engineering'), otBundle('engineering', input.overtime.engineering), null, otBundle('engineering', input.overtime.engineering, true), null, null] },
      { cells: [doc('Production'), otBundle('production', input.overtime.production), null, otBundle('production', input.overtime.production, true), null, null] },
      { cells: [doc('Autres départements'), otBundle('other', input.overtime.other), null, otBundle('other', input.overtime.other, true), null, null] },
      {
        cells: [doc('Total'), otBundle('all', otTotal), null, otBundle('all', otTotal, true), null, null],
        total: true,
      },
    ],
  );

  const sections: HrcoSection[] = [
    {
      id: '1',
      title: '1. Organisation et structure des effectifs',
      points: [
        'Organigramme : siège, usine et sites régionaux.',
        'Contrats de sous-traitance du personnel.',
        'Organisation du personnel à Albatros.',
        'Changements de fonctions en 2026.',
        'Répartition des effectifs par site.',
        'Impact financier de la reclassification sur trois ans.',
      ],
      tables: [t11, t12, t13, t14, t15, t16],
    },
    {
      id: '2',
      title: '2. Staff Cost et maîtrise des charges',
      points: [
        'Évolution du Staff Cost depuis 2022.',
        'Ventilation par département et niveau hiérarchique.',
        'EXCO et expatriés.',
        'Augmentation de 9,4 % entre janvier et octobre.',
        'Paiements en attente et bonus.',
        'Benchmark Mercer et coût global de la structure.',
      ],
      tables: [indicators, t21, t22, t23, t24, t25, t26, t27],
    },
    {
      id: '3',
      title: '3. Analyse de la structure par département',
      points: [
        'Effectif de chaque département cité dans la note.',
        'Niveaux hiérarchiques de Finance.',
        'Dimensionnement des Ressources Humaines.',
      ],
      tables: [t31, t32, t33],
    },
    {
      id: '4',
      title: '4. Productivité et performance du personnel',
      points: [
        'Staff Cost rapporté au chiffre d’affaires et à l’EBITDA.',
        'Staff Cost par tonne produite et vendue.',
        'Chiffre d’affaires, production et ventes par employé.',
      ],
      tables: [t411, t421, t431, t412, t422, t432],
    },
    {
      id: '5',
      title: '5. Congés et heures supplémentaires',
      points: [
        'Provision pour congés de 430 327 USD à fin octobre.',
        'Volume d’heures supplémentaires, notamment Engineering et Production.',
      ],
      tables: [t51, t52],
    },
  ];

  return {
    title: 'NOTE PRÉPARATOIRE DU COMITÉ DES RESSOURCES HUMAINES DU 26/11/2026',
    committeeDate: '26 novembre 2026',
    asOfLabel,
    headcount: active.length,
    activeMatricules: ids(active),
    sections,
    people,
  };
}
