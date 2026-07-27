export type EmployeeAllowanceCategory = 'directors' | 'hod' | 'others';

export interface AllowanceRateRow {
  category: string;
  tripAllowance: string;
  foodAllowance: string;
  transportAllowance: string;
  accommodationAllowance: string;
}

/** Fig1. Domestic travel allowance rate */
export const DOMESTIC_TRAVEL_ALLOWANCE_RATES: AllowanceRateRow[] = [
  {
    category: 'Directors, Exco members',
    tripAllowance: '100 USD',
    foodAllowance: '100 USD',
    transportAllowance: '10 $ per day in case the employee has to use public transport.',
    accommodationAllowance:
      '200 USD as maximum hotel rate per night (to be justified) OR 50 USD per night for personal accommodation arrangement.',
  },
  {
    category: 'HOD',
    tripAllowance: '70 USD',
    foodAllowance: '100 USD',
    transportAllowance: '10 $ per day in case the employee has to use public transport.',
    accommodationAllowance:
      '200 USD as maximum hotel rate per night OR 50 USD per night for personal accommodation arrangement.',
  },
  {
    category: 'Others',
    tripAllowance: '50 USD',
    foodAllowance: '50 USD',
    transportAllowance: '10 $ per day in case the employee has to use public transport.',
    accommodationAllowance:
      '100 USD as maximum hotel rate per night (to be justified) OR 30 USD per night for personal accommodation arrangement.',
  },
];

const BUDGET_AMOUNTS_BY_CATEGORY: Record<EmployeeAllowanceCategory, Record<string, number>> = {
  directors: {
    'Accommodation ( Required)': 200,
    'Food allowance ': 100,
    'Trip allowance ': 100,
    'Transport (if required)': 10,
    'Airport Tax ( If required)': 0,
    'Toll ( if required)': 0,
  },
  hod: {
    'Accommodation ( Required)': 200,
    'Food allowance ': 100,
    'Trip allowance ': 70,
    'Transport (if required)': 10,
    'Airport Tax ( If required)': 0,
    'Toll ( if required)': 0,
  },
  others: {
    'Accommodation ( Required)': 100,
    'Food allowance ': 50,
    'Trip allowance ': 50,
    'Transport (if required)': 10,
    'Airport Tax ( If required)': 0,
    'Toll ( if required)': 0,
  },
};

export function resolveAllowanceCategory(employee?: {
  jobTitle?: string;
  grade?: string;
  position?: string;
}): EmployeeAllowanceCategory {
  const text = `${employee?.jobTitle ?? ''} ${employee?.grade ?? ''} ${employee?.position ?? ''}`.toLowerCase();
  if (
    text.includes('director') ||
    text.includes('exco') ||
    text.includes('executive committee') ||
    text.includes('membre exco')
  ) {
    return 'directors';
  }
  if (
    text.includes('hod') ||
    text.includes('head of department') ||
    text.includes('chef de departement') ||
    text.includes('chef de département')
  ) {
    return 'hod';
  }
  return 'others';
}

export function getBudgetAmountsForCategory(category: EmployeeAllowanceCategory): Record<string, number> {
  return BUDGET_AMOUNTS_BY_CATEGORY[category];
}

export function getDefaultBudgetAmount(label: string, category: EmployeeAllowanceCategory = 'others'): number {
  return BUDGET_AMOUNTS_BY_CATEGORY[category][label] ?? 0;
}
