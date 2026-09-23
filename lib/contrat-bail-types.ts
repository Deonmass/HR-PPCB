export interface ContratBailFormData {
  /** Date de signature du document (ISO). */
  documentDate: string;
  /** Début d’occupation (ISO). */
  occupationStartDate: string;
  /** Adresse des locaux (maison village). */
  propertyAddress: string;
  /** N° maison village (optionnel, pour libellé). */
  maisonNumero: string;
  occupantName: string;
  occupantMatricule: string;
  /** N° d’identité affiché (matricule ou pièce d’identité). */
  occupantIdentityNumber: string;
  /** Représentant société (RH). */
  signerName: string;
  signerTitle: string;
}

export function emptyContratBailForm(): ContratBailFormData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    documentDate: today,
    occupationStartDate: today,
    propertyAddress: '',
    maisonNumero: '',
    occupantName: '',
    occupantMatricule: '',
    occupantIdentityNumber: '',
    signerName: 'CARINE EWULI',
    signerTitle: 'Directrice des Ressources Humaines',
  };
}

export function buildBailPropertyAddress(maisonNumero?: string | null): string {
  const numero = String(maisonNumero ?? '').trim();
  if (!numero) return 'Zamba 1, Village PPC Barnet';
  return `Zamba 1, Village PPC Barnet, maison n° ${numero}`;
}
