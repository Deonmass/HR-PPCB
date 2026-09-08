/**
 * Disposition fixe des 20 cartes KPI Summary (slide PPTX / onglet KPI).
 * 2 groupes × 2 rangées de 5.
 */
export const EXCO_KPI_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: 'Headcount & profile',
    keys: [
      'headcount',
      'genderRatio',
      'averageAge',
      'seniority',
      'onboardingSurvey',
      'hires',
      'exits',
      'turnover',
      'attrition',
      'succession',
    ],
  },
  {
    title: 'Cost, productivity & development',
    keys: [
      'leaveBalance',
      'leaveCost',
      'staffCost',
      'overtimeCost',
      'revenuePerEmp',
      'volumePerEmp',
      'trainingCost',
      'trainingHours',
      'climateSurvey',
      'competencyGap',
    ],
  },
];

/** Ordre plat pour export PPTX (mêmes 20 cartes). */
export const EXCO_KPI_SUMMARY_KEYS = EXCO_KPI_GROUPS.flatMap((g) => g.keys);
