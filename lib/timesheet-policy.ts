export const TIMESHEET_COMPANY_DEFAULT = 'PPC Barnet';

export const TIMESHEET_SHIFTS = {
  general: { label: 'Shift général', start: '07:00', end: '16:30' },
  shift1: { label: 'Shift 1', start: '06:00', end: '14:00' },
  shift2: { label: 'Shift 2', start: '14:00', end: '22:00', nightFrom: '19:00', nightHours: 3 },
  shift3: { label: 'Shift 3', start: '22:00', end: '06:00', nightFrom: '22:00', nightTo: '05:00', nightHours: 7 },
} as const;

export const TIMESHEET_POLICY_SECTIONS = [
  {
    title: 'Horaires de travail et shifts',
    items: [
      'Shift général : 07h00 à 16h30',
      'Shift 1 : 06h00 à 14h00',
      'Shift 2 : 14h00 à 22h00 — dont 3 heures de nuit de 19h00 à 22h00',
      'Shift 3 : 22h00 à 06h00 — dont 7 heures de nuit de 22h00 à 05h00',
      'Toute prestation en dehors de ces plages fait objet d\'heures supplémentaires, sous réserve d\'approbation du Head of Department.',
    ],
  },
  {
    title: 'Période du timesheet (4 semaines)',
    items: [
      'Chaque feuille couvre une période de 4 semaines.',
      'Pour un mois donné (ex. juillet), la période commence le lundi précédant ou égal au 15 du mois précédent.',
      'Elle se termine le dernier lundi strictement avant le 15 du mois en cours.',
      'Exemple juillet 2026 : du lundi 15 juin au lundi 13 juillet.',
    ],
  },
  {
    title: 'Sélection du shift et calculs',
    items: [
      'Cochez le type de shift de la journée : Général, Shift 1, Shift 2 ou Shift 3.',
      'Saisissez l\'heure de début et de fin réellement prestées.',
      'Général HS : heures sup. hors plage 07h00–16h30 (hors nuit).',
      'Shift 1 HS : heures sup. hors plage 06h00–14h00 (hors nuit).',
      'Shift 2 HS : heures sup. hors plage 14h00–22h00 (hors nuit 19h–22h).',
      'Nuit : heures de nuit selon la loi (19h00–05h00), avec règles par shift.',
      'Shift 2 (14h–22h) : seules les heures 19h–22h comptent en nuit (ex. 3h si sortie à 22h).',
      'Shift 3 (22h–06h) : 7h de nuit de 22h à 05h ; la période 05h–06h n\'est pas des HS.',
      'Off : jour de repos — toute heure prestée est considérée comme HS (nuit selon la loi 19h–05h).',
    ],
  },
  {
    title: 'Politique PPCB-LG-POL-HR-0032',
    items: [
      '40 h/semaine normales — HS à partir de la 43e heure',
      'Taux : 130 %, 160 %, 200 % (week-end / fériés)',
      'Maximum 24 h HS/semaine',
      'Exclus : grades C5–E4, CEC, conducteurs',
    ],
  },
];
