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

function titleCaseToken(value: string): string {
  return value
    .split('-')
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1).toLocaleLowerCase('fr-FR');
    })
    .join('-');
}

function isAllUpperToken(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, '');
  if (!letters) return false;
  return letters === letters.toLocaleUpperCase('fr-FR');
}

/**
 * Prénom(s) + NOM [POSTNOM…] pour attestations.
 * Entrée RH « NOM [POSTNOM] PRENOM » → « Prenom NOM POSTNOM ».
 * Ex. « EWULI SUKA CARINE » → « Carine EWULI SUKA »
 * Ex. « ILONDO LIKOMBA JACK » → « Jack ILONDO LIKOMBA »
 * Conserve les post-noms si déjà au format « Prenom NOM POSTNOM »
 * (ex. « Carine EWULI SUKA », « Jack Lethy ILONDO LIKOMBA »).
 */
export function formatAttestationAgentName(fullName: string): string {
  const raw = String(fullName ?? '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.toLocaleUpperCase('fr-FR');
  }

  const firstUpperIdx = parts.findIndex((p) => isAllUpperToken(p));

  // Déjà « Prenom(s) NOM [POSTNOM…] » (premier token non tout-en-majuscules).
  if (firstUpperIdx > 0 && !isAllUpperToken(parts[0]!)) {
    const given = parts.slice(0, firstUpperIdx).map(titleCaseToken).join(' ');
    const family = parts
      .slice(firstUpperIdx)
      .map((p) => p.toLocaleUpperCase('fr-FR'))
      .join(' ');
    return `${given} ${family}`;
  }

  // Format RH : NOM [POSTNOM…] PRENOM (souvent tout en majuscules).
  if (firstUpperIdx === 0 || parts.every((p) => isAllUpperToken(p))) {
    const family = parts
      .slice(0, -1)
      .map((p) => p.toLocaleUpperCase('fr-FR'))
      .join(' ');
    const given = titleCaseToken(parts[parts.length - 1]!);
    return `${given} ${family}`;
  }

  // Fallback : 1er = prénom, reste = famille.
  const given = titleCaseToken(parts[0]!);
  const family = parts
    .slice(1)
    .map((p) => p.toLocaleUpperCase('fr-FR'))
    .join(' ');
  return `${given} ${family}`;
}
