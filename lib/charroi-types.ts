export type CharroiProprietaire = 'PPC' | 'LOXEA' | '';

export type CharroiObservationCanon =
  | 'Bon état'
  | 'Avertissement'
  | 'A déclasser';

export type CharroiObservationTech = CharroiObservationCanon | string;

/** Excel: km > 180 000 → A déclasser */
export const CHARROI_KM_DECLASSE = 180_000;

export type CharroiAchatStatus = 'demande' | 'approuve' | 'livre' | 'annule';

export interface CharroiVehicule {
  id: string;
  numero: number | null;
  marque: string;
  type: string;
  numeroChassis: string;
  plaque: string;
  cv: string;
  assureur: string;
  departement: string;
  user: string;
  province: string;
  proprietaire: CharroiProprietaire;
  kilometrage: number | null;
  miseCirculation: string;
  age: number | null;
  observationTech: CharroiObservationTech;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type CharroiVehiculeInput = Partial<CharroiVehicule> & {
  marque?: string;
  type?: string;
  plaque?: string;
};

export interface CharroiAchat {
  id: string;
  numero: number | null;
  nature: string;
  marque: string;
  type: string;
  plaque: string;
  cv: string;
  miseCirc: string;
  depart: string;
  centreDeCout: string;
  province: string;
  matricule: string;
  secteur: string;
  coutAchat: number;
  coutPneus: number;
  battery: number;
  othersConsumables: number;
  nbreLitrCarteEngen: number;
  prixLitre: number;
  fuelCost: number;
  assuranceAnnuelle: number;
  taxesControlTech: number;
  vignette: number;
  nouvellePlaque: number;
  entretienTrimestriel: number;
  reparationsDiverses: number;
  total: number;
  status: CharroiAchatStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type CharroiAchatInput = Partial<CharroiAchat>;

export interface CharroiVehiclesStore {
  vehicles: CharroiVehicule[];
  nextSeq: number;
}

export interface CharroiAchatsStore {
  achats: CharroiAchat[];
  nextSeq: number;
}

export const CHARROI_OBSERVATIONS = [
  'Bon état',
  'Avertissement',
  'A déclasser',
] as const;

const OBS_RANK: Record<CharroiObservationCanon, number> = {
  'Bon état': 0,
  Avertissement: 1,
  'A déclasser': 2,
};

export const CHARROI_ACHAT_STATUSES: { id: CharroiAchatStatus; label: string }[] = [
  { id: 'demande', label: 'Demande' },
  { id: 'approuve', label: 'Approuvé' },
  { id: 'livre', label: 'Livré' },
  { id: 'annule', label: 'Annulé' },
];

/**
 * Normalize stored mise-en-circulation values for `<input type="date">`.
 * Year-only ("2016") → "2016-01-01"; ISO dates pass through.
 */
export function toMiseCirculationDateInput(
  value: string | number | null | undefined,
): string {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  const match = raw.match(/(?:19|20)\d{2}/);
  if (match) {
    const ym = raw.match(/(\d{1,2})[\/\-.](\d{4})/);
    if (ym) {
      const month = Math.min(12, Math.max(1, Number(ym[1])));
      return `${ym[2]}-${String(month).padStart(2, '0')}-01`;
    }
    return `${match[0]}-01-01`;
  }
  return '';
}

/**
 * Âge = année courante − année de mise en circulation.
 * Accepte "2016", "01/2016", "2016-03-15", etc.
 */
export function computeAgeFromMiseCirculation(
  miseCirculation: string | number | null | undefined,
  nowYear = new Date().getFullYear(),
): number | null {
  if (miseCirculation == null || miseCirculation === '') return null;
  const raw = String(miseCirculation).trim();
  if (!raw) return null;
  const match = raw.match(/(?:19|20)\d{2}/);
  if (match) {
    const year = Number(match[0]);
    if (!Number.isFinite(year)) return null;
    return Math.max(0, nowYear - year);
  }
  const n = Number(raw.replace(',', '.'));
  if (Number.isFinite(n) && n >= 1900 && n <= nowYear + 1) {
    return Math.max(0, nowYear - Math.floor(n));
  }
  return null;
}

/** CRITERE PAR ANNEE : 0–5 Bon, 5–10 Avertissement, >10 A déclasser */
export function observationFromAge(age: number | null | undefined): CharroiObservationCanon | null {
  if (age == null || !Number.isFinite(age) || age < 0) return null;
  if (age <= 5) return 'Bon état';
  if (age <= 10) return 'Avertissement';
  return 'A déclasser';
}

/** CRITERE PAR KM : ≤180k Bon, >180k A déclasser (pas d’avertissement km) */
export function observationFromKm(kilometrage: number | null | undefined): CharroiObservationCanon | null {
  if (kilometrage == null || !Number.isFinite(kilometrage) || kilometrage < 0) return null;
  if (kilometrage <= CHARROI_KM_DECLASSE) return 'Bon état';
  return 'A déclasser';
}

function worstObservation(
  a: CharroiObservationCanon | null,
  b: CharroiObservationCanon | null,
): CharroiObservationCanon {
  if (!a && !b) return 'Bon état';
  if (!a) return b!;
  if (!b) return a;
  return OBS_RANK[a] >= OBS_RANK[b] ? a : b;
}

/** Statut final = pire des deux critères (âge vs km). */
export function computeObservationTech(input: {
  age: number | null | undefined;
  kilometrage: number | null | undefined;
}): CharroiObservationCanon {
  return worstObservation(
    observationFromAge(input.age ?? null),
    observationFromKm(input.kilometrage ?? null),
  );
}

export interface CharroiObservationExplanation {
  age: number | null;
  kilometrage: number | null;
  byAge: CharroiObservationCanon | null;
  byKm: CharroiObservationCanon | null;
  final: CharroiObservationCanon;
  ageLabel: string;
  kmLabel: string;
  finalLabel: string;
}

export function explainObservationTech(input: {
  age?: number | null;
  kilometrage?: number | null;
  miseCirculation?: string | null;
  nowYear?: number;
}): CharroiObservationExplanation {
  const age =
    input.age != null && Number.isFinite(input.age)
      ? input.age
      : computeAgeFromMiseCirculation(input.miseCirculation, input.nowYear);
  const kilometrage =
    input.kilometrage != null && Number.isFinite(input.kilometrage) ? input.kilometrage : null;
  const byAge = observationFromAge(age);
  const byKm = observationFromKm(kilometrage);
  const final = computeObservationTech({ age, kilometrage });
  return {
    age,
    kilometrage,
    byAge,
    byKm,
    final,
    ageLabel:
      age == null
        ? 'Âge inconnu — critère âge non applicable'
        : `Âge ${age} an${age > 1 ? 's' : ''} → ${byAge}`,
    kmLabel:
      kilometrage == null
        ? 'Kilométrage inconnu — critère km non applicable'
        : `Km ${kilometrage.toLocaleString('fr-FR')} → ${byKm}`,
    finalLabel: `Statut final → ${final}`,
  };
}

/** Collapse spaces and trim. */
function collapseWs(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Uniformise les provinces (casse / espaces) :
 * "Kongo central" / "Kongo Central" / "  kongo   CENTRAL " → "Kongo Central".
 */
export function normalizeProvinceLabel(raw: string | null | undefined): string {
  const t = collapseWs(String(raw ?? ''));
  if (!t) return '';
  return t
    .split(' ')
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toLocaleUpperCase('fr-FR') + word.slice(1).toLocaleLowerCase('fr-FR');
    })
    .join(' ');
}

/**
 * Uniformise les marques (casse / espaces) :
 * "TOYOTA" / "toyota" → "Toyota" ; codes alphanumériques (ex. KUV100) restent en majuscules.
 */
export function normalizeMarqueLabel(raw: string | null | undefined): string {
  const t = collapseWs(String(raw ?? ''));
  if (!t) return '';
  return t
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (/\d/.test(word)) return word.toLocaleUpperCase('fr-FR');
      return word.charAt(0).toLocaleUpperCase('fr-FR') + word.slice(1).toLocaleLowerCase('fr-FR');
    })
    .join(' ');
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function computeFuelCost(litres: number, prixLitre: number): number {
  return roundMoney(Number(litres || 0) * Number(prixLitre || 0));
}

export function computeAchatTotal(input: {
  coutAchat?: number;
  coutPneus?: number;
  battery?: number;
  othersConsumables?: number;
  fuelCost?: number;
  assuranceAnnuelle?: number;
  taxesControlTech?: number;
  vignette?: number;
  nouvellePlaque?: number;
  entretienTrimestriel?: number;
  reparationsDiverses?: number;
}): number {
  return roundMoney(
    Number(input.coutAchat || 0)
      + Number(input.coutPneus || 0)
      + Number(input.battery || 0)
      + Number(input.othersConsumables || 0)
      + Number(input.fuelCost || 0)
      + Number(input.assuranceAnnuelle || 0)
      + Number(input.taxesControlTech || 0)
      + Number(input.vignette || 0)
      + Number(input.nouvellePlaque || 0)
      + Number(input.entretienTrimestriel || 0)
      + Number(input.reparationsDiverses || 0),
  );
}
