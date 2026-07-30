/**
 * Colonnes du template d'export HR (feuilles Base / EXIT).
 * Indices 0-based ; ligne d'en-tête = Excel row 2.
 * Distinct de EMP_COL (feuille master EMPLOYEE live).
 */
export const EXPORT_EMP_COL = {
  matricule: 0,
  company: 1,
  nom: 2,
  departement: 3,
  grade: 4,
  jobTitle: 5,
  localisation: 6,
  centreCout: 7,
  appointmentDate: 8,
  gender: 9,
  dateOfBirth: 10,
  /** Formule DATEDIF — ne jamais écrire cette colonne. */
  age: 11,
  nationality: 12,
  maritalStatus: 13,
  numberOfChildren: 14,
  personnelArea: 15,
  employeeSubGroup: 16,
  payrollArea: 17,
  /** Fréquence paie (souvent vide si non stockée en JSON). */
  payrollPeriode: 18,
  lineManagerName: 19,
  lineManagerPosition: 20,
  cnss: 21,
  nif: 22,
  statut: 23,
  typeContrat: 24,
  dureeContratMois: 25,
  periodeEssaiMois: 26,
  dateFinPeriodeEssai: 27,
  dateFinContrat: 28,
  raisonExit: 29,
  essaiActions: 30,
  essaiResponsable: 31,
  essaiEcheanceEval: 32,
  essaiStatutEval: 33,
  essaiCommentaire: 34,
} as const;

export const EXPORT_EMP_LAST_COL = EXPORT_EMP_COL.essaiCommentaire;

/** En-têtes Excel (row 2), index 0-based. */
export const EXPORT_EMP_HEADERS: Record<number, string> = {
  [EXPORT_EMP_COL.matricule]: 'MATRICULE',
  [EXPORT_EMP_COL.company]: 'COMPANY',
  [EXPORT_EMP_COL.nom]: 'COMPLET NAME',
  [EXPORT_EMP_COL.departement]: 'DEPARTMENT',
  [EXPORT_EMP_COL.grade]: 'GRADE',
  [EXPORT_EMP_COL.jobTitle]: 'JOB TITLE',
  [EXPORT_EMP_COL.localisation]: 'LOCALISATION',
  [EXPORT_EMP_COL.centreCout]: 'CENTER DES COUTS',
  [EXPORT_EMP_COL.appointmentDate]: 'Appointment Date',
  [EXPORT_EMP_COL.gender]: 'Gender',
  [EXPORT_EMP_COL.dateOfBirth]: 'Date of Birth',
  [EXPORT_EMP_COL.age]: 'Age',
  [EXPORT_EMP_COL.nationality]: 'Nationality',
  [EXPORT_EMP_COL.maritalStatus]: 'Marital Status',
  [EXPORT_EMP_COL.numberOfChildren]: 'number of children',
  [EXPORT_EMP_COL.personnelArea]: 'Personnal Area',
  [EXPORT_EMP_COL.employeeSubGroup]: 'Employee SubGroup',
  [EXPORT_EMP_COL.payrollArea]: 'Payroll Area',
  [EXPORT_EMP_COL.payrollPeriode]: 'Payroll periode',
  [EXPORT_EMP_COL.lineManagerName]: 'Line Manager Name',
  [EXPORT_EMP_COL.lineManagerPosition]: 'Line manager position',
  [EXPORT_EMP_COL.cnss]: 'CNSS',
  [EXPORT_EMP_COL.nif]: 'NIF',
  [EXPORT_EMP_COL.statut]: 'Statut',
  [EXPORT_EMP_COL.typeContrat]: 'Type de contrat',
  [EXPORT_EMP_COL.dureeContratMois]: 'Duree contrat (mois)',
  [EXPORT_EMP_COL.periodeEssaiMois]: "Periode d'essai (mois)",
  [EXPORT_EMP_COL.dateFinPeriodeEssai]: "Date fin periode d'essai",
  [EXPORT_EMP_COL.dateFinContrat]: 'Date fin contrat',
  [EXPORT_EMP_COL.raisonExit]: 'Raison exit',
  [EXPORT_EMP_COL.essaiActions]: 'Essai Actions',
  [EXPORT_EMP_COL.essaiResponsable]: 'Essai Responsable',
  [EXPORT_EMP_COL.essaiEcheanceEval]: 'Essai Echeance eval',
  [EXPORT_EMP_COL.essaiStatutEval]: 'Essai Statut eval',
  [EXPORT_EMP_COL.essaiCommentaire]: 'Essai Commentaire',
};

/** Colonne Excel 1-based → lettre (ex. 29 → AC). */
export function excelColLetter(col1Based: number): string {
  let n = col1Based;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export const EXPORT_RAISON_EXIT_COL_LETTER = excelColLetter(EXPORT_EMP_COL.raisonExit + 1);
