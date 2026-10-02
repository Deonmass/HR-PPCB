/** Calcul paie Capital HR — formules alignées sur les templates PPC Site / Hors-site. */

export type ContractantPayrollSite = 'site' | 'hors-site';

export interface ContractantPayrollLineInput {
  employeeId: string;
  nom: string;
  matricule: string;
  fonction: string;
  numeroCnss: string;
  numeroCompte: string;
  banque: string;
  dependants: number;
  /** Jours prestés */
  jrsPrestes: number;
  /** Taux journalier USD */
  txJr: number;
  jrsFeries: number;
  jrsConges: number;
  jrsMaladies: number;
  /** Coût transport / jour */
  coutTrs: number;
  /** Jours feriés & dimanche (transport extra) */
  jrsFeriesDim: number;
  avances: number;
  mb: number;
  provPpe: number;
  provMed: number;
  ot130: number;
  ot160: number;
  ot200: number;
  ot10: number;
  ot25: number;
}

export interface ContractantPayrollLineResult extends ContractantPayrollLineInput {
  basePrestes: number;
  baseFeries: number;
  baseConges: number;
  baseMaladies: number;
  indemniteLogement: number;
  transportJours: number;
  transportFeries: number;
  totTransport: number;
  montHeuresSupp: number;
  brutImpos: number;
  cnssOuvrier: number;
  salImpos: number;
  ipr: number;
  totalRetenues: number;
  netAPayer: number;
  cnssPatronal: number;
  inpp: number;
  onem: number;
  totalPatronal: number;
  grossSalary: number;
  tva: number;
  totalGeneral: number;
  ot130Usd: number;
  ot160Usd: number;
  ot200Usd: number;
  ot10Usd: number;
  ot25Usd: number;
}

/** Taux de change CDF/USD (feuille Moteur IPR). */
export const CONTRACTANT_PAIE_FX_DEFAULT = 2300;

/** Barème IPR mensuel CDF — VLOOKUP Excel. */
const IPR_LOWER = [
  { from: 0, lower: 0 },
  { from: 162_000, lower: 162_000 },
  { from: 1_800_000, lower: 1_800_000 },
  { from: 3_600_000, lower: 3_600_000 },
] as const;

const IPR_RATE = [
  { from: 0, rate: 0 },
  { from: 162_001, rate: 0.15 },
  { from: 1_800_001, rate: 0.3 },
  { from: 3_600_001, rate: 0.4 },
] as const;

const IPR_CUMUL = [
  { from: 0, cumul: 2_300 },
  { from: 162_001, cumul: 4_860 },
  { from: 1_800_001, cumul: 250_560 },
  { from: 3_600_001, cumul: 790_560 },
] as const;

function vlookupApprox<T extends { from: number }>(
  value: number,
  table: readonly T[],
): T {
  let hit = table[0]!;
  for (const row of table) {
    if (value >= row.from) hit = row;
  }
  return hit;
}

/** IPR USD — même logique que « Moteur IPR » Excel. */
export function computeIprUsd(
  salImposUsd: number,
  dependants: number,
  fxRate = CONTRACTANT_PAIE_FX_DEFAULT,
): number {
  const cdf = Math.max(0, salImposUsd) * fxRate;
  const lower = vlookupApprox(cdf, IPR_LOWER).lower;
  const rate = vlookupApprox(cdf, IPR_RATE).rate;
  const cumul = vlookupApprox(cdf, IPR_CUMUL).cumul;
  const tranche = (cdf - lower) * rate;
  const cumulIpr = tranche + cumul;
  const rabais = cumulIpr * (Math.max(0, dependants) * 0.02);
  const iprNetCdf = Math.max(0, cumulIpr - rabais);
  return fxRate > 0 ? iprNetCdf / fxRate : 0;
}

export function defaultsForSite(site: ContractantPayrollSite): {
  provPpe: number;
  provMed: number;
} {
  return site === 'site'
    ? { provPpe: 25, provMed: 70 }
    : { provPpe: 25, provMed: 45 };
}

export function computeContractantPayrollLine(
  input: ContractantPayrollLineInput,
  fxRate = CONTRACTANT_PAIE_FX_DEFAULT,
): ContractantPayrollLineResult {
  const jrsPrestes = Number(input.jrsPrestes) || 0;
  const txJr = Number(input.txJr) || 0;
  const jrsFeries = Number(input.jrsFeries) || 0;
  const jrsConges = Number(input.jrsConges) || 0;
  const jrsMaladies = Number(input.jrsMaladies) || 0;
  const coutTrs = Number(input.coutTrs) || 0;
  const jrsFeriesDim = Number(input.jrsFeriesDim) || 0;
  const avances = Number(input.avances) || 0;
  const mb = Number(input.mb) || 0;
  const provPpe = Number(input.provPpe) || 0;
  const provMed = Number(input.provMed) || 0;
  const ot130 = Number(input.ot130) || 0;
  const ot160 = Number(input.ot160) || 0;
  const ot200 = Number(input.ot200) || 0;
  const ot10 = Number(input.ot10) || 0;
  const ot25 = Number(input.ot25) || 0;
  const dependants = Math.max(0, Number(input.dependants) || 0);

  const basePrestes = txJr * jrsPrestes;
  const baseFeries = jrsFeries * txJr;
  const baseConges = jrsConges * txJr;
  const txMaladie = 0.667 * txJr;
  const baseMaladies = jrsMaladies * txMaladie;
  const indemniteLogement = 0.3 * (basePrestes + baseFeries + baseConges + baseMaladies);
  const transportJours = jrsPrestes * coutTrs;
  const transportFeries = jrsFeriesDim * coutTrs;
  const totTransport = transportJours + transportFeries;

  const hourly = txJr / 8;
  const ot130Usd = hourly * ot130 * 1.3;
  const ot160Usd = hourly * ot160 * 1.6;
  const ot200Usd = hourly * 2 * ot200;
  const ot10Usd = hourly * ot10 * 1.1;
  const ot25Usd = hourly * ot25 * 1.25;
  const montHeuresSupp = ot130Usd + ot160Usd + ot200Usd + ot10Usd + ot25Usd;

  const brutImpos = basePrestes + baseFeries + baseConges + baseMaladies + montHeuresSupp;
  const cnssOuvrier = brutImpos * 0.05;
  const salImpos = brutImpos - cnssOuvrier;
  const ipr = computeIprUsd(salImpos, dependants, fxRate);
  const totalRetenues = cnssOuvrier + ipr;
  const netAPayer = brutImpos + indemniteLogement + totTransport - avances - totalRetenues;

  const cnssPatronal = brutImpos * 0.13;
  const inpp = brutImpos * 0.02;
  const onem = brutImpos * 0.005;
  const totalPatronal = cnssPatronal + inpp + onem;

  const grossSalary = cnssOuvrier + ipr + avances + netAPayer + totalPatronal;
  const tva = 0.16 * grossSalary;
  const totalGeneral = grossSalary + mb + provPpe + provMed + tva;

  return {
    ...input,
    jrsPrestes,
    txJr,
    jrsFeries,
    jrsConges,
    jrsMaladies,
    coutTrs,
    jrsFeriesDim,
    avances,
    mb,
    provPpe,
    provMed,
    ot130,
    ot160,
    ot200,
    ot10,
    ot25,
    dependants,
    basePrestes,
    baseFeries,
    baseConges,
    baseMaladies,
    indemniteLogement,
    transportJours,
    transportFeries,
    totTransport,
    montHeuresSupp,
    brutImpos,
    cnssOuvrier,
    salImpos,
    ipr,
    totalRetenues,
    netAPayer,
    cnssPatronal,
    inpp,
    onem,
    totalPatronal,
    grossSalary,
    tva,
    totalGeneral,
    ot130Usd,
    ot160Usd,
    ot200Usd,
    ot10Usd,
    ot25Usd,
  };
}

export function sumPayrollField(
  rows: ContractantPayrollLineResult[],
  key: keyof ContractantPayrollLineResult,
): number {
  return rows.reduce((sum, row) => {
    const v = row[key];
    return sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Formules affichées au survol (alignées sur le template Excel). */
export function payrollFormulaTooltip(
  line: ContractantPayrollLineResult,
  field: keyof ContractantPayrollLineResult | string,
): string {
  const j = line.txJr;
  const i = line.jrsPrestes;
  const round = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : '0');

  switch (field) {
    case 'basePrestes':
      return `Base prestés = Tx/Jr × Jrs = ${round(j)} × ${round(i)}`;
    case 'baseFeries':
      return `Base fériés = Jrs fériés × Tx/Jr = ${round(line.jrsFeries)} × ${round(j)}`;
    case 'baseConges':
      return `Base congés = Jrs congés × Tx/Jr = ${round(line.jrsConges)} × ${round(j)}`;
    case 'baseMaladies':
      return `Base maladies = Jrs × (0,667 × Tx/Jr) = ${round(line.jrsMaladies)} × (0,667 × ${round(j)})`;
    case 'indemniteLogement':
      return `Indemnité logement = 30% × (Base prestés + fériés + congés + maladies)`;
    case 'transportJours':
      return `Transport / jrs = Jrs prestés × Cout/Trs = ${round(i)} × ${round(line.coutTrs)}`;
    case 'transportFeries':
      return `Transport fériés&dim = Jrs fériés&dim × Cout/Trs`;
    case 'totTransport':
      return `Tot. transport = Transport jrs + Transport fériés&dim`;
    case 'ot130Usd':
      return `OT 130% US$ = (Tx/Jr ÷ 8) × Hrs × 1,3`;
    case 'ot160Usd':
      return `OT 160% US$ = (Tx/Jr ÷ 8) × Hrs × 1,6`;
    case 'ot200Usd':
      return `OT 200% US$ = (Tx/Jr ÷ 8) × Hrs × 2`;
    case 'ot10Usd':
      return `OT 10% US$ = (Tx/Jr ÷ 8) × Hrs × 1,1`;
    case 'ot25Usd':
      return `OT 25% US$ = (Tx/Jr ÷ 8) × Hrs × 1,25`;
    case 'montHeuresSupp':
      return `Mont. HS = OT130$ + OT160$ + OT200$ + OT10$ + OT25$ = ${round(line.montHeuresSupp)}`;
    case 'brutImpos':
      return `Brut imposable = Bases (prestés+fériés+congés+maladies) + Mont. HS = ${round(line.brutImpos)}`;
    case 'cnssOuvrier':
      return `CNSS/O = Brut × 5% = ${round(line.brutImpos)} × 0,05 = ${round(line.cnssOuvrier)}`;
    case 'salImpos':
      return `Sal. imposable = Brut − CNSS/O = ${round(line.brutImpos)} − ${round(line.cnssOuvrier)}`;
    case 'ipr':
      return `IPR = Moteur IPR(Sal. imposable USD, Dépendants=${line.dependants}, FX) = ${round(line.ipr)}`;
    case 'totalRetenues':
      return `Total retenues = CNSS/O + IPR = ${round(line.cnssOuvrier)} + ${round(line.ipr)}`;
    case 'netAPayer':
      return `Net à payer = Brut + Ind. logement + Tot. transport − Avances − Retenues = ${round(line.netAPayer)}`;
    case 'cnssPatronal':
      return `CNSS/P = Brut × 13%`;
    case 'inpp':
      return `INPP = Brut × 2%`;
    case 'onem':
      return `ONEM = Brut × 0,5%`;
    case 'totalPatronal':
      return `Total patronal = CNSS/P + INPP + ONEM = ${round(line.totalPatronal)}`;
    case 'grossSalary':
      return `Gross Salary = CNSS/O + IPR + Avances + Net + Total patronal`;
    case 'tva':
      return `TVA = 16% × Gross Salary = ${round(line.tva)}`;
    case 'totalGeneral':
      return `Total gén. = Gross + M.B + PPE + Prov. méd. + TVA = ${round(line.totalGeneral)}`;
    case 'jrsPrestes':
      return 'Saisie — Jours prestés (pointage)';
    case 'txJr':
      return 'Saisie — Taux journalier USD (Tx/Jr)';
    case 'jrsFeries':
      return 'Saisie — Jours fériés';
    case 'jrsConges':
      return 'Saisie — Jours congés';
    case 'jrsMaladies':
      return 'Saisie — Jours maladies';
    case 'coutTrs':
      return 'Saisie — Coût transport / jour';
    case 'jrsFeriesDim':
      return 'Saisie — Jours fériés & dimanche (transport)';
    case 'ot130':
      return 'Saisie — Heures OT 130%';
    case 'ot160':
      return 'Saisie — Heures OT 160%';
    case 'ot200':
      return 'Saisie — Heures OT 200%';
    case 'ot10':
      return 'Saisie — Heures OT 10%';
    case 'ot25':
      return 'Saisie — Heures OT 25%';
    case 'avances':
      return 'Saisie — Avances';
    case 'dependants':
      return 'Saisie — Nombre de dépendants (rabais IPR 2% / pers.)';
    case 'provPpe':
      return 'Saisie — Provision PPE';
    case 'provMed':
      return 'Saisie — Provision soins médicaux';
    default:
      return '';
  }
}
