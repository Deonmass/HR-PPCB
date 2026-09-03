import type { Employee } from './types';

export const DMT_MOTIFS = [
  { id: 'embauche', label: 'Embauchage' },
  { id: 'expiration', label: 'Expiration normale du contrat' },
  { id: 'licenciement', label: 'Licenciement' },
  { id: 'demission', label: 'Démission' },
  { id: 'deces', label: 'Décès' },
] as const;

export type DmtMotifId = (typeof DMT_MOTIFS)[number]['id'];

export function isDmtMotifId(value: string): value is DmtMotifId {
  return DMT_MOTIFS.some((item) => item.id === value);
}

export function suggestDmtMotif(employee: Employee): DmtMotifId {
  const statut = (employee.statut || '').toLowerCase();
  const inactive =
    statut.includes('inactif')
    || statut === 'inactive'
    || statut.includes('exit')
    || Boolean((employee.raisonExit || '').trim());
  if (!inactive) return 'embauche';
  const reason = (employee.raisonExit || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/deces|death/.test(reason)) return 'deces';
  if (/demiss|resign/.test(reason)) return 'demission';
  if (/licenc|dismiss|retrench/.test(reason)) return 'licenciement';
  if (/fin de contrat|expir|retraite|end of contract/.test(reason)) return 'expiration';
  return 'licenciement';
}

export const DECLARATION_BATCH_LIMIT = 50;

/** Groupes de 3 chiffres (2.809.843 FC). Conserve le suffixe monétaire s’il est saisi. */
export function formatDmtSalary(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const suffixMatch = trimmed.match(/\s*(FC|CDF|USD|\$)\s*$/i);
  const suffix = suffixMatch?.[1]
    ? ` ${suffixMatch[1].toUpperCase() === 'CDF' ? 'FC' : suffixMatch[1].toUpperCase() === '$' ? '$' : suffixMatch[1].toUpperCase()}`
    : '';
  const head = suffixMatch ? trimmed.slice(0, trimmed.length - suffixMatch[0].length) : trimmed;
  const digits = head.replace(/\D/g, '');
  if (!digits) return trimmed;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}${suffix}`;
}

export function uniqueMatricules(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
