import Swal from 'sweetalert2';

const ppcTheme = {
  background: '#141419',
  color: '#f1f5f9',
  confirmButtonColor: '#e30613',
  cancelButtonColor: '#3f3f46',
};

function baseConfig() {
  return {
    customClass: {
      popup: 'swal-ppc',
      title: 'swal-ppc-title',
      htmlContainer: 'swal-ppc-text',
      confirmButton: 'swal-ppc-confirm',
      cancelButton: 'swal-ppc-cancel',
    },
    buttonsStyling: false,
    ...ppcTheme,
  };
}

export async function confirmDelete(title: string, text?: string): Promise<boolean> {
  const result = await Swal.fire({
    ...baseConfig(),
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Supprimer',
    cancelButtonText: 'Annuler',
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
}

export async function confirmAction(
  title: string,
  text?: string,
  confirmText = 'Confirmer',
): Promise<boolean> {
  const result = await Swal.fire({
    ...baseConfig(),
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Annuler',
    reverseButtons: true,
  });
  return result.isConfirmed;
}

export async function confirmLogout(): Promise<boolean> {
  return confirmAction(
    'Se déconnecter ?',
    'Vous allez quitter votre session.',
    'Déconnexion',
  );
}

export function showLogoutLoading(): void {
  void Swal.fire({
    ...baseConfig(),
    title: 'Déconnexion…',
    text: 'Veuillez patienter',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

/** Spinner bloquant pendant une action (suppression, enregistrement, import…). */
export function showActionLoading(
  title = 'Traitement…',
  text = 'Veuillez patienter',
): void {
  void Swal.fire({
    ...baseConfig(),
    title,
    text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

export function closeSwal(): void {
  Swal.close();
}

export function showError(message: string, title = 'Erreur'): Promise<void> {
  return Swal.fire({
    ...baseConfig(),
    icon: 'error',
    title,
    text: message,
    confirmButtonText: 'OK',
  }).then(() => undefined);
}

export function showSuccess(message: string, title = 'Succès'): Promise<void> {
  return Swal.fire({
    ...baseConfig(),
    icon: 'success',
    title,
    text: message,
    confirmButtonText: 'OK',
  }).then(() => undefined);
}

export function showSuccessHtml(html: string, title = 'Succès'): Promise<void> {
  return Swal.fire({
    ...baseConfig(),
    icon: 'success',
    title,
    html,
    confirmButtonText: 'OK',
  }).then(() => undefined);
}

export function showWarning(message: string, title = 'Attention'): Promise<void> {
  return Swal.fire({
    ...baseConfig(),
    icon: 'warning',
    title,
    text: message,
    confirmButtonText: 'OK',
  }).then(() => undefined);
}

export function showInfo(message: string, title = 'Information'): Promise<void> {
  return Swal.fire({
    ...baseConfig(),
    icon: 'info',
    title,
    text: message,
    confirmButtonText: 'OK',
  }).then(() => undefined);
}

export async function promptText(
  title: string,
  options?: {
    text?: string;
    inputValue?: string;
    placeholder?: string;
    confirmText?: string;
    validator?: (value: string) => string | null;
  },
): Promise<string | null> {
  const result = await Swal.fire({
    ...baseConfig(),
    title,
    text: options?.text,
    input: 'text',
    inputValue: options?.inputValue ?? '',
    inputPlaceholder: options?.placeholder,
    showCancelButton: true,
    confirmButtonText: options?.confirmText ?? 'Valider',
    cancelButtonText: 'Annuler',
    reverseButtons: true,
    inputValidator: options?.validator
      ? (value) => options.validator!(value ?? '') ?? undefined
      : undefined,
  });
  if (!result.isConfirmed) return null;
  return String(result.value ?? '').trim() || null;
}

export async function promptSelect(
  title: string,
  options: {
    text?: string;
    inputOptions: Record<string, string>;
    inputValue?: string;
    confirmText?: string;
  },
): Promise<string | null> {
  const result = await Swal.fire({
    ...baseConfig(),
    title,
    text: options.text,
    input: 'select',
    inputOptions: options.inputOptions,
    inputValue: options.inputValue ?? '',
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? 'Valider',
    cancelButtonText: 'Annuler',
    reverseButtons: true,
  });
  if (!result.isConfirmed) return null;
  return String(result.value ?? '');
}

export async function confirmFolderAccess(folderName: string): Promise<boolean> {
  return confirmAction(
    'Accès au dossier',
    `Le navigateur va demander l'autorisation d'enregistrer les fichiers dans « ${folderName} ».`,
    'Continuer',
  );
}
