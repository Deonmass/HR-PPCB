/**
 * Affiche un nom en casse « titre » (pas en majuscules).
 * Ex. « KINKINIA DIAVEZUKA PELAGIE » → « Kinkinia Diavezuka Pelagie »
 */
export function formatDisplayName(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .toLocaleLowerCase('fr-FR')
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === '-') return part;
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1);
    })
    .join('');
}
