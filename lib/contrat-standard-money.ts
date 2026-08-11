/** Montants FR + formatage USD/CDF pour le contrat standard. */

const UNITS = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
const TENS = [
  '', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante',
  'quatre-vingt', 'quatre-vingt',
];

function underHundred(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 60) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (!u) return TENS[t];
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) {
    // 60-79
    const base = n - 60;
    if (base === 0) return 'soixante';
    if (base === 1) return 'soixante et un';
    if (base < 20) return `soixante-${UNITS[base]}`;
    return `soixante-${underHundred(base)}`;
  }
  // 80-99
  const base = n - 80;
  if (base === 0) return 'quatre-vingts';
  return `quatre-vingt-${UNITS[base]}`;
}

function underThousand(n: number): string {
  if (n < 100) return underHundred(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h === 1 ? 'cent' : `${UNITS[h]} cent${rest === 0 && h > 1 ? 's' : ''}`;
  if (!rest) return head;
  return `${head} ${underHundred(rest)}`;
}

/** Entier positif → mots français (jusqu’à millions). */
export function numberToFrenchWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'zéro';
  if (n < 1000) return underThousand(n);

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) {
    parts.push(millions === 1 ? 'un million' : `${underThousand(millions)} millions`);
  }
  if (thousands) {
    parts.push(thousands === 1 ? 'mille' : `${underThousand(thousands)} mille`);
  }
  if (rest) parts.push(underThousand(rest));
  return parts.join(' ');
}

export function formatUsdAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatCdfAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function usdToWordsPhrase(usd: number): string {
  const words = numberToFrenchWords(Math.round(usd));
  return capitalizeFirst(`${words} dollars américains`);
}
