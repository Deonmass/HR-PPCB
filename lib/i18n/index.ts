import { en } from './en';
import { fr, type MessageKey } from './fr';

export type AppLocale = 'fr' | 'en';
export type { MessageKey };

export const LOCALES: AppLocale[] = ['fr', 'en'];
export const LOCALE_STORAGE_KEY = 'app-locale';

const DICTS: Record<AppLocale, Record<MessageKey, string>> = { fr, en };

let runtimeLocale: AppLocale = 'fr';

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === 'fr' || value === 'en';
}

export function setRuntimeLocale(locale: AppLocale) {
  runtimeLocale = locale;
}

export function getRuntimeLocale(): AppLocale {
  return runtimeLocale;
}

export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] === undefined || vars[key] === null ? `{${key}}` : String(vars[key]),
  );
}

export function translate(
  locale: AppLocale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const raw = DICTS[locale]?.[key] ?? DICTS.fr[key] ?? key;
  return interpolate(raw, vars);
}

export function tRuntime(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(runtimeLocale, key, vars);
}

const KNOWN_LABELS: Record<string, MessageKey> = {
  Employés: 'home.label.employees',
  'Dossiers à risque': 'home.label.riskFiles',
  Conjoints: 'home.label.spouses',
  Enfants: 'home.label.children',
  Bénéficiaires: 'home.label.beneficiaires',
  Conforme: 'home.label.conforme',
  'Non conforme': 'home.label.nonConforme',
  'Conformité docs': 'home.label.docCompliance',
  Projets: 'home.label.projects',
  Voyages: 'home.label.travel',
  'Cash request': 'home.label.cashRequest',
  'Attestation de service': 'home.label.serviceAttestation',
  'Payment voucher': 'home.label.paymentVoucher',
  'Exit forms': 'home.label.exitForms',
  'Interim appraisal': 'home.label.appraisal',
  Utilisateurs: 'home.label.users',
  'Heures supplémentaires': 'home.label.overtime',
  Factures: 'home.label.invoices',
  SOA: 'home.label.soa',
  Fournisseurs: 'home.label.suppliers',
  'Visa de travail': 'home.label.workVisa',
  'Visa volant': 'home.label.flyingVisa',
  'Visa de voyage': 'home.label.travelVisa',
  'Gestion des billets': 'home.label.tickets',
  'Gestion des Billets': 'home.label.tickets',
  Santé: 'home.label.health',
  'Assurance ≤30j': 'home.label.insurance',
  'Vignette ≤30j': 'home.label.vignette',
  'Contr. tech ≤30j': 'home.label.techControl',
  OK: 'home.label.ok',
  Véhicules: 'home.label.vehicles',
  'Charroi automobile': 'home.label.fleet',
  RRF: 'home.label.rrf',
  Entête: 'home.label.letterhead',
  Recrutement: 'nav.poste.recruitment',
  Training: 'nav.training',
  Formation: 'nav.training',
};

export function translateKnownLabel(
  locale: AppLocale,
  label: string,
): string {
  const key = KNOWN_LABELS[label];
  return key ? translate(locale, key) : label;
}
