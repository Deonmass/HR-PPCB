export interface PasswordCriterionResult {
  id: string;
  label: string;
  ok: boolean;
}

/** Critères du mot de passe : min. 6 caractères, majuscule, minuscule, chiffre, caractère spécial. */
export function checkPasswordCriteria(password: string): PasswordCriterionResult[] {
  const value = password ?? '';
  return [
    { id: 'length', label: 'Au moins 6 caractères', ok: value.length >= 6 },
    { id: 'upper', label: 'Une majuscule (A-Z)', ok: /[A-Z]/.test(value) },
    { id: 'lower', label: 'Une minuscule (a-z)', ok: /[a-z]/.test(value) },
    { id: 'digit', label: 'Un chiffre (0-9)', ok: /\d/.test(value) },
    { id: 'special', label: 'Un caractère spécial (!@#$%…)', ok: /[^A-Za-z0-9]/.test(value) },
  ];
}

export function isPasswordCompliant(password: string): boolean {
  return checkPasswordCriteria(password).every((criterion) => criterion.ok);
}

/** Message d'erreur serveur si le mot de passe ne respecte pas la politique, sinon null. */
export function passwordPolicyError(password: string): string | null {
  const missing = checkPasswordCriteria(password).filter((criterion) => !criterion.ok);
  if (!missing.length) return null;
  return `Mot de passe invalide — manque : ${missing
    .map((criterion) => criterion.label.toLowerCase())
    .join(', ')}.`;
}
