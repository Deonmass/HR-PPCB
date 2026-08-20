export interface LongServicePalier {
  years: number;
  sacs: number;
  cheque: number;
  /** Pourcentage d’incitatif sur le salaire de base ; null = non applicable (palier 5 ans). */
  incentivePct: number | null;
}

export const LONG_SERVICE_PALIERS: LongServicePalier[] = [
  { years: 5, sacs: 20, cheque: 200, incentivePct: null },
  { years: 10, sacs: 35, cheque: 400, incentivePct: 50 },
  { years: 15, sacs: 50, cheque: 650, incentivePct: 75 },
  { years: 20, sacs: 70, cheque: 1000, incentivePct: 100 },
  { years: 25, sacs: 95, cheque: 1500, incentivePct: 130 },
  { years: 30, sacs: 125, cheque: 2200, incentivePct: 170 },
  { years: 35, sacs: 160, cheque: 3000, incentivePct: 220 },
  { years: 40, sacs: 200, cheque: 4000, incentivePct: 250 },
];

export const LONG_SERVICE_POLICY = {
  id: 'longs-etats-de-service',
  title: 'Récompense pour longs états de service',
  filename: 'Recompense_longs_etats_de_service.pdf',
} as const;

export interface LongServiceBeneficiary {
  matricule: string;
  nom: string;
  departement: string;
  localisation: string;
  appointmentDate: string;
  years: number;
  months: number;
  palier: LongServicePalier;
}

export function highestLongServicePalier(years: number): LongServicePalier | null {
  let best: LongServicePalier | null = null;
  for (const palier of LONG_SERVICE_PALIERS) {
    if (years >= palier.years) best = palier;
  }
  return best;
}

/** Échéance ce mois : exactement 5 ou 10 ans d’ancienneté (0 mois). */
export function isLongServiceDue5Or10(years: number, months: number): boolean {
  return months === 0 && (years === 5 || years === 10);
}

export function formatChequeValue(value: number): string {
  return value.toLocaleString('fr-FR');
}

export function formatIncentive(pct: number | null): string {
  return pct == null ? '—' : `${pct} %`;
}
