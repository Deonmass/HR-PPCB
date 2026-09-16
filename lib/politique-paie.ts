/** SMIG RDC + simulation de paie indicative (CNSS / ONEM / INPP / IPR). */

export const PAIE_POLICY_META = {
  title: 'SMIG & simulation de paie',
  subtitle:
    'Référentiel SMIG par classification (décret n°25/22) et simulateur de bulletin indicatif.',
  source:
    'Décret n°25/22 du 30 mai 2025 — Journal officiel / Annuaire juridique du travail RDC',
  disclaimer:
    'Simulation indicative à usage RH interne. Vérifiez toujours avec la paie / fiscalité officielle (plafonds CNSS, barème IPR à jour, conventions d’entreprise).',
} as const;

/** Jours ouvrés de référence pour un mois SMIG. */
export const SMIG_DAYS_PER_MONTH = 26;

export interface SmigPeriodRow {
  id: string;
  label: string;
  /** Inclusive start (YYYY-MM). */
  fromMonth: string;
  /** Exclusive end (YYYY-MM), null = en cours. */
  toMonth: string | null;
  /** SMIG journalier manœuvre ordinaire. */
  dailyCdf: number;
  note?: string;
}

/** Historique + barème actuel du SMIG (manœuvre ordinaire). */
export const SMIG_PERIODS: SmigPeriodRow[] = [
  {
    id: 'legacy-2018',
    label: 'Jusqu’à avril 2025',
    fromMonth: '2018-05',
    toMonth: '2025-05',
    dailyCdf: 7075,
    note: 'Décret n°18/017 (référence historique)',
  },
  {
    id: 'transitoire-2025',
    label: 'Mai → décembre 2025',
    fromMonth: '2025-05',
    toMonth: '2026-01',
    dailyCdf: 14500,
    note: 'Application progressive — paie de mai 2025',
  },
  {
    id: 'plein-2026',
    label: 'À partir de janvier 2026',
    fromMonth: '2026-01',
    toMonth: null,
    dailyCdf: 21500,
    note: 'Taux plein du décret n°25/22',
  },
];

/** SMIG journalier manœuvre ordinaire au taux plein (réf. grille annexes). */
export const SMIG_ORDINAIRE_FULL_DAILY = 21500;

export interface SmigClassification {
  id: string;
  label: string;
  code: string;
  category: string;
  echelon: string | null;
  /** Montant journalier officiel au taux plein (jan. 2026). */
  dailyFull: number;
}

/**
 * Grille officielle (annexe décret 25/22) — manœuvre ordinaire → cadre de collaboration.
 * Cadre de direction aligné sur le plafond collab. 4 (tension 1→10).
 */
export const SMIG_CLASSIFICATIONS: SmigClassification[] = [
  { id: 'mo', label: 'Manœuvre ordinaire', code: 'MO', category: 'Manœuvre', echelon: 'Ordinaire', dailyFull: 21500 },
  { id: 'ml', label: 'Manœuvre lourd', code: 'ML', category: 'Manœuvre', echelon: 'Lourd', dailyFull: 24940 },
  { id: 'ms', label: 'Travailleur spécialisé', code: 'MS', category: 'Travailleur spécialisé', echelon: null, dailyFull: 28595 },
  { id: 'sq1', label: 'Semi-qualifié 1', code: 'SQ1', category: 'Travailleur semi-qualifié', echelon: '1', dailyFull: 33110 },
  { id: 'sq2', label: 'Semi-qualifié 2', code: 'SQ2', category: 'Travailleur semi-qualifié', echelon: '2', dailyFull: 38270 },
  { id: 'sq3', label: 'Semi-qualifié 3', code: 'SQ3', category: 'Travailleur semi-qualifié', echelon: '3', dailyFull: 44290 },
  { id: 'q1', label: 'Qualifié 1', code: 'Q1', category: 'Travailleur qualifié', echelon: '1', dailyFull: 50955 },
  { id: 'q2', label: 'Qualifié 2', code: 'Q2', category: 'Travailleur qualifié', echelon: '2', dailyFull: 58910 },
  { id: 'hq', label: 'Hautement qualifié', code: 'HQ', category: 'Travailleur hautement qualifié', echelon: null, dailyFull: 68155 },
  { id: 'm1', label: 'Maîtrise 1', code: 'M1', category: 'Maîtrise', echelon: '1', dailyFull: 78690 },
  { id: 'm2', label: 'Maîtrise 2', code: 'M2', category: 'Maîtrise', echelon: '2', dailyFull: 90730 },
  { id: 'm3', label: 'Maîtrise 3', code: 'M3', category: 'Maîtrise', echelon: '3', dailyFull: 104920 },
  { id: 'm4', label: 'Maîtrise 4', code: 'M4', category: 'Maîtrise', echelon: '4', dailyFull: 121290 },
  { id: 'cc1', label: 'Cadre de collaboration 1', code: 'CC1', category: 'Cadre de collaboration', echelon: '1', dailyFull: 139965 },
  { id: 'cc2', label: 'Cadre de collaboration 2', code: 'CC2', category: 'Cadre de collaboration', echelon: '2', dailyFull: 161680 },
  { id: 'cc3', label: 'Cadre de collaboration 3', code: 'CC3', category: 'Cadre de collaboration', echelon: '3', dailyFull: 189620 },
  { id: 'cc4', label: 'Cadre de collaboration 4', code: 'CC4', category: 'Cadre de collaboration', echelon: '4', dailyFull: 215000 },
  {
    id: 'cd',
    label: 'Cadre de direction',
    code: 'CD',
    category: 'Cadre de direction',
    echelon: null,
    dailyFull: 215000,
  },
];

export function getSmigClassification(id: string): SmigClassification {
  return SMIG_CLASSIFICATIONS.find((c) => c.id === id) || SMIG_CLASSIFICATIONS[0];
}

/** Tension salariale (coeff.) vs manœuvre ordinaire. */
export function smigTensionCoeff(dailyFull: number): number {
  return dailyFull / SMIG_ORDINAIRE_FULL_DAILY;
}

/** SMIG journalier d’une classification pour une période (prorata du taux manœuvre). */
export function smigDailyForClassification(
  classification: SmigClassification,
  ordinaryDaily: number,
): number {
  return Math.round(classification.dailyFull * (ordinaryDaily / SMIG_ORDINAIRE_FULL_DAILY));
}

export function smigMonthlyCdf(dailyCdf: number, days = SMIG_DAYS_PER_MONTH): number {
  return Math.round(dailyCdf * days);
}

/** Allocation familiale journalière = 1/27 du SMIG journalier de la catégorie. */
export function smigFamilyAllowanceDaily(dailyCdf: number): number {
  return Math.round(dailyCdf / 27);
}

/**
 * Contre-valeur logement journalière : max 1/5 de l’allocation familiale journalière.
 */
export function smigHousingDailyCap(dailyCdf: number): number {
  return Math.round(smigFamilyAllowanceDaily(dailyCdf) / 5);
}

/** Logement mensuel indicatif (contre-valeur × jours prestés). */
export function autoLogementMonthly(dailyCdf: number, nbJours: number): number {
  return smigHousingDailyCap(dailyCdf) * Math.max(0, Math.round(nbJours));
}

/**
 * Transport mensuel indicatif : 1/27 du SMIG journalier × jours
 * (même base que l’alloc. familiale — proxy RH en l’absence de barème entreprise).
 */
export function autoTransportMonthly(dailyCdf: number, nbJours: number): number {
  return smigFamilyAllowanceDaily(dailyCdf) * Math.max(0, Math.round(nbJours));
}

export function resolveSmigForMonth(yearMonth: string): SmigPeriodRow {
  const key = yearMonth.trim().slice(0, 7);
  for (let i = SMIG_PERIODS.length - 1; i >= 0; i -= 1) {
    const row = SMIG_PERIODS[i];
    if (key >= row.fromMonth && (row.toMonth == null || key < row.toMonth)) return row;
  }
  return SMIG_PERIODS[SMIG_PERIODS.length - 1];
}

export type InppBand = '1-50' | '51-300' | '300+';

export interface PaieRates {
  cnssAgent: number;
  cnssPatronal: number;
  onem: number;
  inpp: number;
}

export const DEFAULT_PAIE_RATES: PaieRates = {
  /** Pensions — part salarié. */
  cnssAgent: 0.05,
  /** Prestations familiales 6,5 % + pensions 5 % + risques 1,5 % = 13 %. */
  cnssPatronal: 0.13,
  /** ONEM — charge patronale (réf. courante 0,2 %). */
  onem: 0.002,
  /** INPP privé 51–300 (défaut PPC-like). */
  inpp: 0.03,
};

export const INPP_RATES: Record<InppBand, number> = {
  '1-50': 0.035,
  '51-300': 0.03,
  '300+': 0.02,
};

/** Barème annuel IPR / IRPP (DGI) — appliqué au prorata mensuel. */
export const IPR_ANNUAL_BRACKETS: Array<{ upTo: number; rate: number }> = [
  { upTo: 1_944_000, rate: 0.03 },
  { upTo: 21_600_000, rate: 0.15 },
  { upTo: 43_200_000, rate: 0.3 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.4 },
];

/** Plafond : l’impôt ne peut dépasser 30 % de la base imposable. */
export const IPR_MAX_OF_BASE = 0.3;

export interface PaieSimulationInput {
  /** Salaire de base mensuel (CDF). */
  salBase: number;
  /** Jours prestés dans le mois. */
  nbJours: number;
  /** Jours de référence du mois (souvent 26). */
  joursRef: number;
  logement: number;
  transport: number;
  arrondi: number;
  rates: PaieRates;
}

export interface PaieSimulationResult {
  totBase: number;
  cnssAgent: number;
  cnssPatronal: number;
  onem: number;
  inpp: number;
  baseImposable: number;
  irpp: number;
  totRetenu: number;
  salBrute: number;
  netAPayer: number;
  coutEmployeur: number;
  /** Valeurs saisies (pour bases % / tooltips). */
  salBase: number;
  logement: number;
  transport: number;
  arrondi: number;
  nbJours: number;
  joursRef: number;
}

export type BulletinBlockId = 'base' | 'charges' | 'retenues' | 'indemnites' | 'resultats';

export type BulletinBaseKey =
  | 'salBase'
  | 'totBase'
  | 'cnssAgent'
  | 'cnssPatronal'
  | 'onem'
  | 'inpp'
  | 'irpp'
  | 'totRetenu'
  | 'salBrute'
  | 'logement'
  | 'transport'
  | 'arrondi'
  | 'netAPayer'
  | 'coutEmployeur';

export type CustomLineMode = 'amount' | 'percent';
/** add_net : + net (+ coût) · deduct_net : − net (+ retenues) · employer_only : coût employeur seul */
export type CustomLineEffect = 'add_net' | 'deduct_net' | 'employer_only';

export interface CustomPaieLine {
  id: string;
  label: string;
  mode: CustomLineMode;
  /** Montant CDF ou pourcentage (10 = 10 %). */
  value: number;
  percentOf: BulletinBaseKey | null;
  block: BulletinBlockId;
  effect: CustomLineEffect;
  /** Appliquée au calcul uniquement si validée. */
  validated: boolean;
}

export const BULLETIN_BLOCKS: Array<{ id: BulletinBlockId; label: string }> = [
  { id: 'base', label: 'Base' },
  { id: 'charges', label: 'Charges patronales' },
  { id: 'retenues', label: 'Retenues salarié' },
  { id: 'indemnites', label: 'Indemnités' },
  { id: 'resultats', label: 'Résultats' },
];

/** Effet dérivé du bloc (glisser-déposer). */
export function effectFromBlock(block: BulletinBlockId): CustomLineEffect {
  if (block === 'retenues') return 'deduct_net';
  if (block === 'charges') return 'employer_only';
  return 'add_net';
}

export const BULLETIN_BASE_OPTIONS: Array<{ id: BulletinBaseKey; label: string }> = [
  { id: 'salBase', label: 'Sal. Base' },
  { id: 'totBase', label: 'Tot. Base' },
  { id: 'cnssAgent', label: 'CNSS agent' },
  { id: 'cnssPatronal', label: 'CNSS patronal' },
  { id: 'onem', label: 'ONEM' },
  { id: 'inpp', label: 'INPP' },
  { id: 'irpp', label: 'IRPP' },
  { id: 'totRetenu', label: 'Tot. Retenu' },
  { id: 'salBrute', label: 'Sal. Brute' },
  { id: 'logement', label: 'Logement' },
  { id: 'transport', label: 'Transport' },
  { id: 'arrondi', label: 'Arrondi' },
  { id: 'netAPayer', label: 'Net à payer' },
  { id: 'coutEmployeur', label: 'Coût employeur' },
];

export function bulletinBaseValue(
  key: BulletinBaseKey,
  core: PaieSimulationResult,
): number {
  return core[key];
}

export function resolveCustomLineAmount(
  line: CustomPaieLine,
  core: PaieSimulationResult,
): number {
  if (line.mode === 'amount') return Math.round(line.value || 0);
  const baseKey = line.percentOf || 'totBase';
  const base = bulletinBaseValue(baseKey, core);
  return Math.round((base * (line.value || 0)) / 100);
}

export interface AppliedCustomLine extends CustomPaieLine {
  amount: number;
}

export interface PaieSimulationWithCustoms extends PaieSimulationResult {
  customs: AppliedCustomLine[];
  customAddNet: number;
  customDeduct: number;
  customEmployer: number;
}

export function applyCustomLines(
  core: PaieSimulationResult,
  lines: CustomPaieLine[],
): PaieSimulationWithCustoms {
  const customs: AppliedCustomLine[] = lines.map((line) => ({
    ...line,
    amount: resolveCustomLineAmount(line, core),
  }));
  let customAddNet = 0;
  let customDeduct = 0;
  let customEmployer = 0;
  for (const line of customs) {
    if (!line.validated) continue;
    if (line.effect === 'add_net') {
      customAddNet += line.amount;
      customEmployer += line.amount;
    } else if (line.effect === 'deduct_net') {
      customDeduct += line.amount;
    } else {
      customEmployer += line.amount;
    }
  }
  return {
    ...core,
    totRetenu: core.totRetenu + customDeduct,
    salBrute: core.salBrute + customAddNet,
    netAPayer: core.netAPayer + customAddNet - customDeduct,
    coutEmployeur: core.coutEmployeur + customEmployer,
    customs,
    customAddNet,
    customDeduct,
    customEmployer,
  };
}

export function newCustomPaieLine(partial?: Partial<CustomPaieLine>): CustomPaieLine {
  const block = partial?.block ?? 'indemnites';
  return {
    id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: 'Nouvelle ligne',
    mode: 'amount',
    value: 0,
    percentOf: 'totBase',
    validated: false,
    ...partial,
    block: partial?.block ?? block,
    effect: effectFromBlock(partial?.block ?? block),
  };
}

export function computeProgressiveTax(annualTaxable: number): number {
  if (annualTaxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const bracket of IPR_ANNUAL_BRACKETS) {
    const slice = Math.min(annualTaxable, bracket.upTo) - prev;
    if (slice > 0) tax += slice * bracket.rate;
    if (annualTaxable <= bracket.upTo) break;
    prev = bracket.upTo;
  }
  const capped = Math.min(tax, annualTaxable * IPR_MAX_OF_BASE);
  return Math.max(0, capped);
}

/** IPR mensuel à partir d’une base imposable mensuelle (×12 puis /12). */
export function computeMonthlyIpr(monthlyTaxable: number): number {
  const annual = computeProgressiveTax(monthlyTaxable * 12);
  return Math.round(annual / 12);
}

export function simulatePaie(input: PaieSimulationInput): PaieSimulationResult {
  const joursRef = Math.max(1, input.joursRef || SMIG_DAYS_PER_MONTH);
  const nbJours = Math.max(0, input.nbJours);
  const salBase = Math.max(0, input.salBase);
  const totBase = Math.round((salBase * nbJours) / joursRef);
  const cnssAgent = Math.round(totBase * input.rates.cnssAgent);
  const cnssPatronal = Math.round(totBase * input.rates.cnssPatronal);
  const onem = Math.round(totBase * input.rates.onem);
  const inpp = Math.round(totBase * input.rates.inpp);
  const baseImposable = Math.max(0, totBase - cnssAgent);
  const irpp = computeMonthlyIpr(baseImposable);
  const totRetenu = cnssAgent + irpp;
  const logement = Math.round(input.logement || 0);
  const transport = Math.round(input.transport || 0);
  const arrondi = Math.round(input.arrondi || 0);
  const salBrute = totBase + logement + transport;
  const netAPayer = totBase - totRetenu + logement + transport + arrondi;
  const coutEmployeur = totBase + cnssPatronal + onem + inpp + logement + transport + arrondi;

  return {
    totBase,
    cnssAgent,
    cnssPatronal,
    onem,
    inpp,
    baseImposable,
    irpp,
    totRetenu,
    salBrute,
    netAPayer,
    coutEmployeur,
    salBase,
    logement,
    transport,
    arrondi,
    nbJours,
    joursRef,
  };
}

export function formatCdf(value: number): string {
  return `${new Intl.NumberFormat('fr-CD', { maximumFractionDigits: 0 }).format(Math.round(value))} CDF`;
}

export function formatPct(rate: number): string {
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace(/\.0$/, '')} %`;
}

export function formatTension(coeff: number): string {
  return coeff.toFixed(2).replace(/\.?0+$/, '') || '1';
}
