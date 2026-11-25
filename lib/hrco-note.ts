/**
 * Note préparatoire du comité RH du 26/11/2026.
 * Les effectifs viennent du registre. Le reste reste vide, ou conserve
 * un chiffre déjà écrit dans la note (source « document », non recalculé).
 */
import { localizeJobTitle } from './bilingual-title';
import { findClassificationPoste, type ClassificationPosteRef } from './classification-poste-apply';
import { excoSiteBucket, EXCO_SITE } from './exco-site-buckets';
import { EXCO_CANONICAL_DEPARTMENTS, normalizeDepartmentName } from './exco-department-map';
import { formatDisplayName } from './format-display-name';
import { HRCO_OT_CAPTURE, HRCO_OT_CAPTURE_COST, HRCO_OT_CAPTURE_HOURS } from './hrco-ot-capture';

export type HrcoCellSource = 'system' | 'document' | 'manual';

export type HrcoCell = {
  text: string;
  source: HrcoCellSource;
  /** Salariés qui composent le chiffre. Tableau vide = effectif à zéro, toujours cliquable. */
  matricules?: string[];
  /** Heures par matricule, pour le détail des heures supplémentaires. */
  hoursByMatricule?: Record<string, number>;
  /** Détail d’un montant ou d’un nombre de fonctions. */
  detail?: Array<{ label: string; value: string }>;
  /** En-têtes du modal de détail. Par défaut : Mois / Montant. */
  detailColumns?: { label: string; value: string };
  /** Total recalculé à partir des cellules de la colonne. */
  auto?: boolean;
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

export const HRCO_MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

export type HrcoPeriod = {
  year: number;
  fromMonth: number;
  toMonth: number;
};

export function defaultHrcoPeriod(now = new Date()): HrcoPeriod {
  const currentMonth = now.getMonth() + 1;
  return {
    year: now.getFullYear(),
    fromMonth: 1,
    toMonth: currentMonth >= 10 ? 10 : currentMonth,
  };
}

function clampPeriodPart(raw: string | null | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

export function parseHrcoPeriod(
  params: { year?: string | null; from?: string | null; to?: string | null },
  now = new Date(),
): HrcoPeriod {
  const fallback = defaultHrcoPeriod(now);
  const year = clampPeriodPart(params.year, fallback.year, 2000, 2100);
  const fromMonth = clampPeriodPart(params.from, fallback.fromMonth, 1, 12);
  let toMonth = clampPeriodPart(params.to, fallback.toMonth, 1, 12);
  if (toMonth < fromMonth) toMonth = fromMonth;
  return { year, fromMonth, toMonth };
}

export function hrcoPeriodLabel(period: HrcoPeriod): string {
  const from = HRCO_MONTHS[period.fromMonth - 1];
  const to = HRCO_MONTHS[period.toMonth - 1];
  if (period.fromMonth === period.toMonth) return `${from} ${period.year}`;
  return `${from} à ${to} ${period.year}`;
}

export type HrcoNote = {
  title: string;
  committeeDate: string;
  asOfLabel: string;
  periodLabel: string;
  headcount: number;
  activeMatricules: string[];
  /** Membres comptés sur la ligne EXCO. */
  excoMatricules: string[];
  /** Faux tant que la liste n’a pas été enregistrée : ce sont les grades E. */
  excoCustom: boolean;
  sections: HrcoSection[];
  people: HrcoPerson[];
  /** Intitulés français de la classification des postes, pour la saisie. */
  classificationTitles: string[];
};

export type HrcoSubcontractor = {
  matricule: string;
  nom: string;
  fonction: string;
  departement: string;
  localisation: string;
  prestataire: string;
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

export type HrcoStaffMonth = {
  month: number;
  label: string;
  headcount: number | null;
  staffCost: number | null;
  staffCumul: number | null;
  volume: number | null;
  volumeCumul: number | null;
  revenue: number | null;
  revenueCumul: number | null;
  tonPerEmp: number | null;
  tonPerEmpYtd: number | null;
  revenuePerEmp: number | null;
  revenuePerEmpYtd: number | null;
  budgetStaffCost: number | null;
  budgetStaffCumul: number | null;
  budgetVolume: number | null;
  budgetVolumeCumul: number | null;
  budgetRevenue: number | null;
  budgetRevenueCumul: number | null;
  budgetHeadcount: number | null;
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
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function usd(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} USD`;
}

function usdMillions(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1_000_000)} M USD`;
}

function plain(value: number, digits = 2): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function countIds(matricules: string[]): HrcoCell {
  return sys(String(matricules.length), matricules);
}

export function hrcoManualKey(tableId: string, rowIndex: number, colIndex: number): string {
  return `${tableId}|${rowIndex}|${colIndex}`;
}

export function officialHrcoTitle(raw: string, postes: ClassificationPosteRef[]): string {
  const title = String(raw || '').trim();
  if (!title) return 'Non renseignée';
  const found = findClassificationPoste(postes, title);
  const chosen = found?.title || title;
  return localizeJobTitle(chosen, 'fr').trim() || chosen;
}

function functionCell(
  items: Array<{ fonction: string }>,
  postes: ClassificationPosteRef[],
  classified = true,
): HrcoCell {
  const byTitle = new Map<string, number>();
  for (const item of items) {
    const title = classified
      ? officialHrcoTitle(item.fonction, postes)
      : (item.fonction.trim() || 'Non renseignée');
    byTitle.set(title, (byTitle.get(title) || 0) + 1);
  }
  const rows = [...byTitle.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  const count = rows.length;
  return {
    text: `${count} fonction${count > 1 ? 's' : ''}`,
    source: 'system',
    detail: rows.map(([label, value]) => ({ label, value: String(value) })),
    detailColumns: { label: 'Fonction', value: 'Effectif' },
  };
}

function parseFrNumber(text: string): number | null {
  const withoutUnit = text.replace(/USD/ig, '').replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ').trim();
  if (!withoutUnit || /%/.test(text) || /[a-zA-Z]/.test(withoutUnit)) return null;
  const normalized = withoutUnit.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatTotal(sum: number, withUsd: boolean, withDecimals: boolean): string {
  const text = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(sum);
  return withUsd ? `${text} USD` : text;
}

function fillAutomaticTotals(item: HrcoTable): void {
  item.rows.forEach((row, rowIndex) => {
    if (!row.total) return;
    for (let col = 1; col < item.columns.length; col += 1) {
      const header = item.columns[col] || '';
      if (/%/.test(header)) continue;
      const current = row.cells[col];
      if (current?.text?.trim() && !current.auto) continue;
      const numbers: Array<{ label: string; value: number; raw: string }> = [];
      for (let index = 0; index < rowIndex; index += 1) {
        const sourceRow = item.rows[index];
        if (sourceRow.total) continue;
        const cell = sourceRow.cells[col];
        if (!cell?.text) continue;
        const value = parseFrNumber(cell.text);
        if (value == null) continue;
        numbers.push({
          label: sourceRow.cells[0]?.text || `Ligne ${index + 1}`,
          value,
          raw: cell.text,
        });
      }
      if (!numbers.length) {
        if (current?.auto) row.cells[col] = null;
        continue;
      }
      const sum = numbers.reduce((total, entry) => total + entry.value, 0);
      row.cells[col] = {
        text: formatTotal(sum, numbers.some((entry) => /USD/i.test(entry.raw)), numbers.some((entry) => /[,.]/.test(entry.raw))),
        source: 'system',
        auto: true,
        detail: numbers.map((entry) => ({ label: entry.label, value: entry.raw })),
        detailColumns: { label: 'Ligne', value: 'Montant' },
      };
    }
  });
}

/** Pose les saisies et recalcule les totaux encore vides. */
export function applyHrcoManualCells(note: HrcoNote, values: Record<string, string>): HrcoNote {
  const next: HrcoNote = structuredClone(note);
  for (const section of next.sections) {
    for (const item of section.tables) {
      item.rows.forEach((row, rowIndex) => {
        if (row.total) return;
        row.cells.forEach((cell, colIndex) => {
          const key = hrcoManualKey(item.id, rowIndex, colIndex);
          if (!Object.prototype.hasOwnProperty.call(values, key)) return;
          if (cell?.source === 'system') return;
          if (cell?.source === 'document' && cell.text.trim()) return;
          const text = String(values[key] || '').trim();
          row.cells[colIndex] = text ? { text, source: 'manual' } : null;
        });
      });
      fillAutomaticTotals(item);
    }
  }
  return next;
}

function shareIds(matricules: string[], total: number): HrcoCell {
  return sys(total ? pct(matricules.length, total) : '0 %', matricules);
}

function subSite(localisation: string): 'production' | 'siege' | 'albatros' | 'autres' {
  const loc = fold(localisation);
  if (loc.includes('lubudi') || loc.includes('lubumbashi') || loc === 'lshi') return 'albatros';
  if (
    loc.includes('kinshasa')
    || loc === 'kin'
    || loc.includes('kisangani')
    || loc.includes('moanda')
    || loc.includes('muanda')
    || loc.includes('tshikapa')
  ) return 'siege';
  if (
    loc.includes('plant')
    || loc.includes('zamba')
    || loc.includes('malanga')
    || loc.includes('kimpese')
    || loc.includes('usine')
    || !loc
  ) return 'production';
  return 'autres';
}

function justificationTable(months: HrcoStaffMonth[], periodLabel: string): HrcoTable {
  const columns = ['Indicateur', ...months.map((month) => month.label), 'Total'];
  const rows: HrcoRow[] = [];
  const section = (label: string) => {
    rows.push({
      cells: [doc(label), ...Array.from({ length: columns.length - 1 }, () => null)],
      total: true,
    });
  };
  const metric = (label: string, pick: (month: HrcoStaffMonth) => number | null, mode: 'sum' | 'last') => {
    const values = months.map(pick);
    const known = months.flatMap((month, index) => (
      values[index] == null ? [] : [{ label: month.label, value: values[index] as number }]
    ));
    const total = !known.length
      ? null
      : mode === 'sum'
        ? known.reduce((sum, entry) => sum + entry.value, 0)
        : known[known.length - 1].value;
    const detailOf = (entries: Array<{ label: string; value: number }>) => (
      entries.map((entry) => ({ label: entry.label, value: plain(entry.value) }))
    );
    rows.push({
      cells: [
        doc(label),
        ...values.map((value, index) => {
          if (value == null) return null;
          const composed = mode === 'last' ? known.filter((entry) => months.findIndex((month) => month.label === entry.label) <= index) : [known.find((entry) => entry.label === months[index].label)!];
          return { text: plain(value), source: 'system' as const, detail: detailOf(composed.filter(Boolean)) };
        }),
        total == null ? null : { text: plain(total), source: 'system' as const, detail: detailOf(known) },
      ],
    });
  };
  const ratio = (cumul: (month: HrcoStaffMonth) => number | null, headcount: (month: HrcoStaffMonth) => number | null) => (
    (month: HrcoStaffMonth) => {
      const base = cumul(month);
      const count = headcount(month);
      return base != null && count ? base / count : null;
    }
  );
  section('ACTUAL');
  metric('Staff Cost', (month) => month.staffCost, 'sum');
  metric('Staff_Cumul', (month) => month.staffCumul, 'last');
  metric('Volume', (month) => month.volume, 'sum');
  metric('Volume_Cum', (month) => month.volumeCumul, 'last');
  metric('Revenue', (month) => month.revenue, 'sum');
  metric('Revenue_Cum', (month) => month.revenueCumul, 'last');
  metric('T/Employee YTD', (month) => month.tonPerEmpYtd, 'last');
  metric('T/Employee', (month) => month.tonPerEmp, 'last');
  metric('Revenue/Employee YTD', (month) => month.revenuePerEmpYtd, 'last');
  metric('Revenue/Employee', (month) => month.revenuePerEmp, 'last');
  section('BUDGET');
  metric('Staff Cost', (month) => month.budgetStaffCost, 'sum');
  metric('Staff_Cumul', (month) => month.budgetStaffCumul, 'last');
  metric('Volume', (month) => month.budgetVolume, 'sum');
  metric('Volume_Cum', (month) => month.budgetVolumeCumul, 'last');
  metric('Revenue', (month) => month.budgetRevenue, 'sum');
  metric('Revenue_Cum', (month) => month.budgetRevenueCumul, 'last');
  metric('T/Employee YTD', ratio((month) => month.budgetVolumeCumul, (month) => month.budgetHeadcount), 'last');
  metric('T/Employee', ratio((month) => month.budgetVolume, (month) => month.budgetHeadcount), 'last');
  metric('Revenue/Employee YTD', ratio((month) => month.budgetRevenueCumul, (month) => month.budgetHeadcount), 'last');
  metric('Revenue/Employee', ratio((month) => month.budgetRevenue, (month) => month.budgetHeadcount), 'last');
  return table(
    '2.justif',
    'Tableau 2 – Staff Cost, volume et chiffre d’affaires',
    'KIESSE',
    `Justification des indicateurs HR, ${periodLabel}. Montants en USD, volume en tonnes. Le total d’un cumul est la fin de période. Un clic ouvre les mois.`,
    columns,
    rows,
  );
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

function noteGroup(employee: HrcoEmployee, excoIds: Set<string>): string {
  if (excoIds.has(employee.matricule)) return 'exco';
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

export function buildHrcoNote(input: {
  employees: HrcoEmployee[];
  overtime: HrcoOvertime;
  asOf: Date;
  periodLabel: string;
  period?: HrcoPeriod;
  staffCost?: HrcoStaffMonth[];
  subcontractors?: HrcoSubcontractor[];
  /** null = grades E. Un tableau, même vide, est la liste enregistrée. */
  excoMatricules?: string[] | null;
  classification?: ClassificationPosteRef[];
}): HrcoNote {
  const classification = input.classification || [];
  const titleOf = (raw: string) => officialHrcoTitle(raw, classification);
  const active = input.employees.filter(isActive);
  const asOfLabel = frenchDate(input.asOf);
  const periodLabel = input.periodLabel;
  const excoCustom = Array.isArray(input.excoMatricules);
  const excoIds = new Set(
    excoCustom
      ? input.excoMatricules!.filter((matricule) => active.some((employee) => employee.matricule === matricule))
      : active.filter((employee) => bandOf(employee.grade) === 'E').map((employee) => employee.matricule),
  );
  const excoMembers = active.filter((employee) => excoIds.has(employee.matricule));
  const subs = input.subcontractors || [];
  const people: HrcoPerson[] = active.map((employee) => ({
    matricule: employee.matricule,
    nom: formatDisplayName(employee.nom),
    fonction: titleOf(employee.jobTitle),
    departement: normalizeDepartmentName(employee.departement) || employee.departement,
    localisation: employee.localisation,
    grade: employee.grade,
  }));
  const knownPeople = new Set(people.map((person) => person.matricule));
  for (const sub of subs) {
    if (knownPeople.has(sub.matricule)) continue;
    knownPeople.add(sub.matricule);
    people.push({
      matricule: sub.matricule,
      nom: formatDisplayName(sub.nom) || sub.nom,
      fonction: titleOf(sub.fonction),
      departement: normalizeDepartmentName(sub.departement) || sub.departement,
      localisation: sub.localisation,
      grade: 'Sous-traitant',
    });
  }
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

  const expats = active.filter((employee) => employee.nationality.trim() && !isCongolese(employee.nationality));
  const hr = active.filter((employee) => normalizeDepartmentName(employee.departement) === 'Human Resources');
  const finance = active.filter((employee) => normalizeDepartmentName(employee.departement) === 'Finance');

  const grouped = new Map<string, HrcoEmployee[]>();
  for (const group of NOTE_GROUPS) grouped.set(group.id, []);
  for (const employee of active) {
    grouped.get(noteGroup(employee, excoIds))?.push(employee);
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
    'Effectif interne du registre. Effectif sous-traité = agents actifs Capital HR, sans date de sortie.',
    ['N°', 'Entité / Site', 'Responsable', 'Effectif interne', 'Effectif sous-traité', 'Observations'],
    [
      { cells: [doc('1'), doc('Siège'), null, countCell(siegeAll), countIds(subs.filter((sub) => subSite(sub.localisation) === 'siege').map((sub) => sub.matricule)), sys(siteLabel(siegeAll) || 'Siège', ids(siegeAll))] },
      { cells: [doc('2'), doc('Usine'), null, countCell(plant), countIds(subs.filter((sub) => subSite(sub.localisation) === 'production').map((sub) => sub.matricule)), sys(siteLabel(plant) || 'Usine', ids(plant))] },
      { cells: [doc('3'), doc('Sites régionaux'), null, countCell(regional), countIds(subs.filter((sub) => subSite(sub.localisation) === 'albatros' || subSite(sub.localisation) === 'autres').map((sub) => sub.matricule)), sys(siteLabel(regional) || 'Sites régionaux', ids(regional))] },
      { cells: [null, doc('Total'), null, countCell(active), countIds(subs.map((sub) => sub.matricule)), null], total: true },
    ],
  );

  const subByPrestataire = new Map<string, HrcoSubcontractor[]>();
  for (const sub of subs) {
    const name = sub.prestataire.trim() || 'Capital HR';
    const list = subByPrestataire.get(name) || [];
    list.push(sub);
    subByPrestataire.set(name, list);
  }
  const t12 = table(
    '1.2',
    'Tableau 1.2 – Contrats de sous-traitance du personnel',
    'Serge',
    subs.length
      ? 'Agents actifs Capital HR, tous sites, sans date de sortie. Un clic sur le nombre de fonctions ouvre la liste. Le coût mensuel n’est pas dans le registre.'
      : 'Aucun agent actif Capital HR.',
    ['N°', 'Prestataire', 'Fonctions', 'Effectif', 'Conditions contractuelles', 'Coût mensuel (USD)'],
    subs.length
      ? [
          ...[...subByPrestataire.entries()].map(([name, group], index): HrcoRow => ({
            cells: [
              doc(String(index + 1)),
              doc(name),
              functionCell(group, classification, false),
              countIds(group.map((sub) => sub.matricule)),
              doc('Agents actifs, sans date de sortie'),
              null,
            ],
          })),
          {
            cells: [
              null,
              doc('Total'),
              functionCell(subs, classification, false),
              countIds(subs.map((sub) => sub.matricule)),
              null,
              null,
            ],
            total: true,
          },
        ]
      : blankRows(['1'], 6),
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
    'Saisissez un nom : les salariés du registre sont proposés et l’ancienne fonction se remplit. La nouvelle fonction se choisit dans la classification des postes.',
    ['N°', 'Nom et Prénom', 'Ancienne fonction', 'Nouvelle fonction', 'Date d’effet', 'Incidence mensuelle (USD)', 'Incidence annuelle (USD)'],
    blankRows(['1', '2', '3', '4', '5'], 7),
  );

  const t15 = table(
    '1.5',
    'Tableau 1.5 – Répartition des effectifs par site',
    'KIESSE',
    'Albatros = salariés de la liste retrouvés dans le registre. Sous-traitants = agents actifs Capital HR, Lubudi et Lubumbashi sur Albatros.',
    ['Site', 'Effectif interne', '% du total', 'Sous-traitants', '% du total', 'Commentaire / Pistes d’optimisation'],
    [
      { cells: [doc('Site principal de production'), countCell(productionSite), siteShare(productionSite), countIds(subs.filter((sub) => subSite(sub.localisation) === 'production').map((sub) => sub.matricule)), shareIds(subs.filter((sub) => subSite(sub.localisation) === 'production').map((sub) => sub.matricule), subs.length), sys(siteLabel(productionSite), ids(productionSite))] },
      { cells: [doc('Siège'), countCell(siege), siteShare(siege), countIds(subs.filter((sub) => subSite(sub.localisation) === 'siege').map((sub) => sub.matricule)), shareIds(subs.filter((sub) => subSite(sub.localisation) === 'siege').map((sub) => sub.matricule), subs.length), sys(siteLabel(siege), ids(siege))] },
      { cells: [doc('Albatros'), countCell(albatros), siteShare(albatros), countIds(subs.filter((sub) => subSite(sub.localisation) === 'albatros').map((sub) => sub.matricule)), shareIds(subs.filter((sub) => subSite(sub.localisation) === 'albatros').map((sub) => sub.matricule), subs.length), sys(siteLabel(albatros), ids(albatros))] },
      { cells: [doc('Autres sites régionaux'), countCell(autresSites), siteShare(autresSites), countIds(subs.filter((sub) => subSite(sub.localisation) === 'autres').map((sub) => sub.matricule)), shareIds(subs.filter((sub) => subSite(sub.localisation) === 'autres').map((sub) => sub.matricule), subs.length), sys(siteLabel(autresSites), ids(autresSites))] },
      { cells: [doc('Total'), countCell(active), sys(active.length ? '100 %' : '', ids(active)), countIds(subs.map((sub) => sub.matricule)), sys(subs.length ? '100 %' : '', subs.map((sub) => sub.matricule)), null], total: true },
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

  const staffMonths = (input.staffCost || []).filter(
    (month) => month.staffCumul != null && (month.staffCost == null || month.staffCost >= 0),
  );
  const staffEnd = staffMonths.length ? staffMonths[staffMonths.length - 1] : null;
  const staffDetail = staffMonths
    .filter((month) => month.staffCost != null)
    .map((month) => ({ label: month.label, value: usd(month.staffCost || 0) }));
  const money = (amount: number | null, detail = staffDetail): HrcoCell | null => (
    amount == null ? null : { text: usd(amount), source: 'system', detail }
  );
  const staffCumul = staffEnd?.staffCumul ?? null;
  const staffRevenue = staffEnd?.revenueCumul ?? null;
  const staffMonthsCount = staffMonths.filter((month) => month.staffCost != null).length;
  const staffAverage = staffCumul != null && staffMonthsCount ? staffCumul / staffMonthsCount : null;
  const staffAnnual = staffAverage != null ? staffAverage * 12 : null;
  const staffHeadcount = staffEnd?.headcount || active.length || null;
  const staffPerEmployee = staffAverage != null && staffHeadcount ? staffAverage / staffHeadcount : null;
  const staffRatio = staffCumul != null && staffRevenue ? (staffCumul / staffRevenue) * 100 : null;

  const indicators = table(
    '2.0',
    'Indicateurs HR de la note',
    'KIESSE',
    staffEnd
      ? `Staff cost et chiffre d’affaires du rapport EXCO, cumul ${periodLabel}. L’effectif vient du registre.`
      : 'Seul l’effectif interne est relu dans le registre. Les montants restent ceux écrits dans la note.',
    ['Indicateur', 'Situation'],
    [
      {
        cells: [
          doc(staffEnd ? 'Chiffre d’affaires cumulé' : 'Chiffre d’affaires annuel estimé'),
          staffRevenue != null ? money(staffRevenue) : doc('110 M USD'),
        ],
      },
      {
        cells: [
          doc(staffEnd ? `Staff Cost cumulé (${periodLabel})` : 'Staff Cost à fin octobre'),
          staffCumul != null ? { text: `${usd(staffCumul)} (${usdMillions(staffCumul)})`, source: 'system', detail: staffDetail } : doc('8,39 M USD'),
        ],
      },
      {
        cells: [
          doc('Staff Cost annuel extrapolé'),
          staffAnnual != null ? money(staffAnnual) : doc('10,06 M USD'),
        ],
      },
      {
        cells: [
          doc('Staff Cost mensuel moyen'),
          staffAverage != null ? money(staffAverage) : doc('838 540 USD'),
        ],
      },
      { cells: [doc('Effectif interne'), countCell(active)] },
      {
        cells: [
          doc('Coût mensuel moyen par salarié'),
          staffPerEmployee != null ? money(staffPerEmployee) : doc('4 875 USD'),
        ],
      },
      {
        cells: [
          doc('Ratio Staff Cost / CA'),
          staffRatio != null
            ? { text: pct(staffRatio, 100), source: 'system', detail: staffDetail }
            : doc('9,15 %'),
        ],
      },
      { cells: [doc('Ratio cible proposé'), doc('8 % maximum')] },
    ],
  );

  const staffTable = staffMonths.length
    ? justificationTable(staffMonths, periodLabel)
    : table(
        '2.justif',
        'Tableau 2 – Staff Cost, volume et chiffre d’affaires',
        'KIESSE',
        'Staff cost absent du rapport EXCO pour cette période.',
        ['Indicateur', 'Total'],
        [],
      );

  const years = ['2022', '2023', '2024', '2025', 'FY26 (estimé)', 'FY27 (budget)'];
  const t21 = table(
    '2.1',
    'Tableau 2.1 – Évolution du Staff Cost depuis 2022',
    'KIESSE',
    `Effectif FY26 = salariés en poste à la fin de la période (${periodLabel}). Historique et montants non disponibles.`,
    ['Année', 'Staff Cost (M USD)', 'Effectif interne', 'Coût moyen / salarié (USD)', 'Ratio Staff Cost / CA', 'Variation annuelle (%)'],
    years.map((year) => ({
      cells: [
        doc(year),
        year.startsWith('FY26') && staffCumul != null
          ? { text: usdMillions(staffCumul), source: 'system' as const, detail: staffDetail }
          : null,
        year.startsWith('FY26') ? countCell(active) : null,
        year.startsWith('FY26') && staffPerEmployee != null ? money(staffPerEmployee) : null,
        year.startsWith('FY26') && staffRatio != null
          ? { text: pct(staffRatio, 100), source: 'system' as const, detail: staffDetail }
          : null,
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
    excoCustom
      ? 'EXCO = membres enregistrés pour la note. Expatriés = nationalité renseignée autre que congolaise. Salaires non disponibles.'
      : 'EXCO = grades E, en attendant l’enregistrement de la liste complète. Expatriés = nationalité renseignée autre que congolaise. Salaires non disponibles.',
    ['Catégorie', 'Effectif', 'Salaires', 'Primes', 'Indemnités', 'Avantages', 'Total (USD)'],
    [
      { cells: [doc('EXCO'), countCell(excoMembers), null, null, null, null, null] },
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
      { cells: [doc('Staff Cost interne'), staffCumul != null ? money(staffCumul) : null, null, doc('KIESSE')] },
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
    'Les membres EXCO sont sur la ligne EXCO, pas dans leur département. Packaging & Logistics est compté en Logistique. Coûts et économies non disponibles.',
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

  const financeSubs = subs.filter((sub) => normalizeDepartmentName(sub.departement) === 'Finance');
  const financeBands = BANDS
    .map((band) => ({ band, group: finance.filter((employee) => bandOf(employee.grade) === band) }))
    .filter((item) => item.group.length > 0);
  const t32 = table(
    '3.2',
    'Tableau 3.2 – Finance : effectifs et niveaux hiérarchiques',
    'Gedeon',
    'Salariés du département Finance. La colonne Fonction compte les fonctions distinctes, rapprochées de la classification des postes. Un clic ouvre la liste.',
    ['Niveau hiérarchique', 'Fonction', 'Effectif', 'Dont sous-traitants', 'Coût mensuel (USD)', 'Commentaires'],
    [
      ...financeBands.map((item) => ({
        cells: [
          sys(BAND_LABEL[item.band]),
          functionCell(item.group.map((employee) => ({ fonction: employee.jobTitle })), classification),
          countCell(item.group),
          null,
          null,
          null,
        ],
      })),
      ...(financeSubs.length
        ? [{
            cells: [
              doc('Sous-traitants Capital HR'),
              functionCell(financeSubs, classification),
              countIds(financeSubs.map((sub) => sub.matricule)),
              countIds(financeSubs.map((sub) => sub.matricule)),
              null,
              null,
            ],
          }]
        : []),
      { cells: [doc('Total'), functionCell([...finance.map((employee) => ({ fonction: employee.jobTitle })), ...financeSubs], classification), countCell(finance), countIds(financeSubs.map((sub) => sub.matricule)), null, null], total: true },
    ],
  );

  const rhSubs = subs.filter((sub) => normalizeDepartmentName(sub.departement) === 'Human Resources');
  const rhSubIds = rhSubs.map((sub) => sub.matricule);
  const rhRatio = hr.length ? `1 pour ${Math.round(active.length / hr.length)} salariés internes` : '';
  const subIds = subs.map((sub) => sub.matricule);
  const subRhRatio = rhSubs.length ? `1 pour ${Math.round(subs.length / rhSubs.length)} sous-traitants` : '';
  const t33 = table(
    '3.3',
    'Tableau 3.3 – Ressources Humaines : dimensionnement',
    'Gedeon',
    'Effectif RH interne du registre. Sur la ligne Sous-traitants, l’effectif RH est celui des agents Capital HR du département Human Resources.',
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
      {
        cells: [
          doc('Sous-traitants'),
          countIds(rhSubIds),
          null,
          countIds(subIds),
          sys(subRhRatio, rhSubIds),
          doc('Capital HR'),
        ],
      },
      {
        cells: [doc('Total'), countIds([...ids(hr), ...rhSubIds]), countCell(active), countIds(subIds), sys(pct(hr.length, active.length), ids(hr)), null],
        total: true,
      },
    ],
  );

  const productivityYears = ['2022', '2023', '2024', '2025', 'FY26 (estimé)'];
  const t411 = table(
    '4.1.1',
    'Tableau 4.1.1 – Staff Cost / CA et EBITDA : PPC',
    'KIESSE',
    staffCumul != null
      ? `FY26 reprend le cumul EXCO (${periodLabel}). Les années antérieures et l’EBITDA restent vides.`
      : 'Chiffre d’affaires, EBITDA et staff cost historiques absents du registre.',
    ['Année', 'Staff Cost (USD)', 'Chiffre d’affaires (USD)', 'Staff Cost / CA (%)', 'EBITDA (USD)', 'Staff Cost / EBITDA (%)'],
    productivityYears.map((year) => ({
      cells: [
        doc(year),
        year.startsWith('FY26') ? money(staffCumul) : null,
        year.startsWith('FY26') ? money(staffRevenue) : null,
        year.startsWith('FY26') && staffRatio != null
          ? { text: pct(staffRatio, 100), source: 'system' as const, detail: staffDetail }
          : null,
        null,
        null,
      ],
    })),
  );
  const t421 = table(
    '4.2.1',
    'Tableau 4.2.1 – Staff Cost par tonne : PPC',
    'KIESSE',
    staffEnd?.volumeCumul != null
      ? `FY26 : staff cost et tonnes cumulées EXCO (${periodLabel}). Les tonnes vendues restent vides.`
      : 'Tonnes produites et vendues absentes du registre.',
    ['Année', 'Staff Cost (USD)', 'Tonnes produites', 'Staff Cost / tonne produite (USD)', 'Tonnes vendues', 'Staff Cost / tonne vendue (USD)'],
    productivityYears.map((year) => ({
      cells: [
        doc(year),
        year.startsWith('FY26') ? money(staffCumul) : null,
        year.startsWith('FY26') && staffEnd?.volumeCumul != null
          ? sys(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(staffEnd.volumeCumul))
          : null,
        year.startsWith('FY26') && staffCumul != null && staffEnd?.volumeCumul
          ? sys(usd(staffCumul / staffEnd.volumeCumul))
          : null,
        null,
        null,
      ],
    })),
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
        year.startsWith('FY26') ? sys(`Effectif au ${asOfLabel} (${periodLabel}), pas une moyenne`) : null,
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

  const otFrom = input.period?.fromMonth ?? 1;
  const otTo = input.period?.toMonth ?? 10;
  const fullCapture = otFrom <= 1 && otTo >= 10;
  const monthName = (index: number) => HRCO_MONTHS[index].replace(/^./, (letter) => letter.toUpperCase());
  const otDepartments = HRCO_OT_CAPTURE.map((dept) => {
    const hoursLines: Array<{ label: string; value: string }> = [];
    const costLines: Array<{ label: string; value: string }> = [];
    let hoursSum = 0;
    let costSum = 0;
    const end = Math.min(otTo, dept.hours.length);
    for (let month = otFrom; month <= end; month += 1) {
      const hours = dept.hours[month - 1];
      const cost = dept.cost[month - 1];
      if (hours != null) {
        hoursSum += hours;
        hoursLines.push({ label: monthName(month - 1), value: hoursText(hours) });
      }
      if (cost != null) {
        costSum += cost;
        costLines.push({ label: monthName(month - 1), value: usd(cost) });
      }
    }
    const hours = fullCapture ? dept.totalHours : hoursSum;
    const cost = fullCapture ? dept.totalCost : costSum;
    if (fullCapture && Math.abs(hours - hoursSum) > 0.02) {
      hoursLines.push({ label: 'Écart pour le total du tableau', value: hoursText(hours - hoursSum) });
    }
    if (fullCapture && Math.abs(cost - costSum) > 0.02) {
      costLines.push({ label: 'Écart pour le total du tableau', value: usd(cost - costSum) });
    }
    return { department: dept.department, hours, cost, hoursLines, costLines };
  }).filter((row) => row.hours !== 0 || row.cost !== 0);
  const otHours = fullCapture
    ? HRCO_OT_CAPTURE_HOURS
    : otDepartments.reduce((sum, row) => sum + row.hours, 0);
  const otCost = fullCapture
    ? HRCO_OT_CAPTURE_COST
    : otDepartments.reduce((sum, row) => sum + row.cost, 0);
  const amountCell = (text: string, detail: Array<{ label: string; value: string }>): HrcoCell => ({
    text,
    source: 'system',
    detail,
  });
  const t52 = table(
    '5.2',
    'Tableau 5.2 – Heures supplémentaires par département',
    'Gedeon',
    fullCapture
      ? 'Heures et coût transmis pour janvier à octobre 2026. Un clic ouvre le mois par mois.'
      : `Heures et coût transmis, limités à ${periodLabel}. Un clic ouvre le mois par mois.`,
    ['Département', 'Volume (heures)', 'Coût (USD)', '% des heures', '% du coût'],
    [
      ...otDepartments.map((row) => ({
        cells: [
          doc(row.department),
          amountCell(hoursText(row.hours), row.hoursLines),
          amountCell(usd(row.cost), row.costLines),
          amountCell(pct(row.hours, otHours), row.hoursLines),
          amountCell(pct(row.cost, otCost), row.costLines),
        ],
      })),
      {
        cells: [
          doc('Total'),
          amountCell(hoursText(otHours), otDepartments.map((row) => ({ label: row.department, value: hoursText(row.hours) }))),
          amountCell(usd(otCost), otDepartments.map((row) => ({ label: row.department, value: usd(row.cost) }))),
          amountCell(otHours ? '100 %' : '', otDepartments.map((row) => ({ label: row.department, value: hoursText(row.hours) }))),
          amountCell(otCost ? '100 %' : '', otDepartments.map((row) => ({ label: row.department, value: usd(row.cost) }))),
        ],
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
      tables: [indicators, staffTable, t21, t22, t23, t24, t25, t26, t27],
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
    periodLabel,
    headcount: active.length,
    activeMatricules: ids(active),
    excoMatricules: [...excoIds],
    excoCustom,
    sections,
    people,
    classificationTitles: [...new Set(
      classification
        .map((poste) => localizeJobTitle(poste.title, 'fr').trim() || poste.title.trim())
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, 'fr')),
  };
}
