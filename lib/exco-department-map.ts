/**
 * Mapping unique des départements — aliases → libellé canonique (+ service optionnel).
 * Source de vérité pour settings, employés, EXCO BASE et Overtime.
 */
export type ExcoDeptResolution = {
  /** Département système (employé + settings). */
  department: string;
  /** Service optionnel sous ce département. */
  serviceName?: string;
  /** Libellé brut issu du fichier / saisie. */
  raw: string;
};

type Rule = {
  aliases: string[];
  department: string;
  serviceName?: string;
};

/**
 * Règles d’alias. Convention : Title Case, « and » (pas « & »), pas d’underscore au niveau département.
 * Liste canonique = capture Paramètres / référentiel RH (ordre alphabétique métier).
 */
const RULES: Rule[] = [
  // —— Services (pas des départements) ——
  {
    aliases: ['sales_cec', 'sales cec', 'sales-cec', 'cec'],
    department: 'Sales and Marketing',
    serviceName: 'Sales_CEC',
  },
  {
    aliases: [
      'packaging & logistics',
      'packaging and logistics',
      'packaging',
      'packing plant',
      'packaging and logistics optimization',
      'packaging & logistics optimization',
    ],
    department: 'Production',
    serviceName: 'Packaging and Logistics Optimization',
  },

  // —— HR ——
  {
    aliases: [
      'hr',
      'human resources',
      'human ressources',
      'human resource',
      'ressources humaines',
    ],
    department: 'Human Resources',
  },

  // —— Sales / Logistic ——
  {
    aliases: ['sales and marketing', 'sales & marketing'],
    department: 'Sales and Marketing',
  },
  {
    aliases: [
      'logistic',
      'logistics',
      'log',
      'sales & logistics',
      'sales and logistics',
      'warehouse',
      'stores',
    ],
    department: 'Logistic',
  },

  // —— SHE / Risk ——
  {
    aliases: [
      'she',
      's.h.e',
      'safety health environment',
      'risk & environment',
      'risk and environment',
      'risk environment',
    ],
    department: 'SHE',
  },

  // —— Admin / MD ——
  {
    aliases: [
      'md office',
      'mdoffice',
      'md-office',
      'managing director',
      'administration',
      'corporate admin',
      'admin center',
      'admin',
      'autre',
    ],
    department: 'MD Office',
  },

  // —— Ops plant ——
  {
    aliases: ['engineering', 'eng', 'garage', 'estates', 'civil'],
    department: 'Engineering',
  },
  {
    aliases: ['mining', 'mine', 'quarry', 'drilling', 'hauling', 'blast'],
    department: 'Mining',
  },
  {
    aliases: ['optimization', 'optimisation'],
    department: 'Optimization',
  },
  {
    aliases: ['production', 'prod', 'burning', 'milling', 'bagging'],
    department: 'Production',
  },
  {
    aliases: ['quality assurance', 'qa', 'laboratory', 'labo'],
    department: 'Quality Assurance',
  },

  // —— Support ——
  {
    aliases: ['finance', 'compta', 'accounting'],
    department: 'Finance',
  },
  {
    aliases: ['legal', 'juridique', 'legal & compliance', 'legal and compliance'],
    department: 'Legal',
  },
  {
    aliases: ['audit'],
    department: 'Audit',
  },
  {
    aliases: ['procurement'],
    department: 'Procurement',
  },
  {
    aliases: ['supply chain', 'supply'],
    department: 'Supply Chain',
  },
  {
    aliases: ['transport and transit', 'transport & transit'],
    department: 'Transport and Transit',
  },
];

/** Départements actifs à garantir dans les settings (ordre d’affichage). */
export const EXCO_CANONICAL_DEPARTMENTS = [
  'Audit',
  'Engineering',
  'Finance',
  'Human Resources',
  'Legal',
  'Logistic',
  'MD Office',
  'Mining',
  'Optimization',
  'Procurement',
  'Production',
  'Quality Assurance',
  'Sales and Marketing',
  'SHE',
  'Supply Chain',
  'Transport and Transit',
] as const;

/** Services à garantir sous un département parent. */
export const EXCO_CANONICAL_SERVICES: Array<{ department: string; serviceName: string }> = [
  { department: 'Sales and Marketing', serviceName: 'Sales_CEC' },
  { department: 'Production', serviceName: 'Packaging and Logistics Optimization' },
];

/**
 * Anciens libellés (doublons / services / orthographe) à désactiver dans settings.
 * Les employés / OT sont redirigés via RULES.
 */
export const EXCO_LEGACY_DEPARTMENTS_TO_DEACTIVATE = [
  'Administration',
  'Sales_CEC',
  'HR',
  'Risk & Environment',
  'Risk and Environment',
  'Sales & Logistics',
  'Packaging & Logistics',
  'Packaging and Logistics',
  'Supply chain',
] as const;

/** @deprecated préférer EXCO_LEGACY_DEPARTMENTS_TO_DEACTIVATE */
export const EXCO_DEPTS_THAT_ARE_SERVICES = EXCO_LEGACY_DEPARTMENTS_TO_DEACTIVATE;

function aliasKey(alias: string): string {
  return alias
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normKey(s: string): string {
  return aliasKey(s);
}

const ALIAS_INDEX = (() => {
  const map = new Map<string, Rule>();
  for (const rule of RULES) {
    for (const a of rule.aliases) map.set(aliasKey(a), rule);
    // Stabiliser les renames (& → and) sur le libellé canonique sans service
    const canonKey = aliasKey(rule.department);
    if (!map.has(canonKey)) {
      map.set(canonKey, {
        aliases: rule.aliases,
        department: rule.department,
      });
    }
  }
  return map;
})();

const CANONICAL_ORDER = new Map(
  EXCO_CANONICAL_DEPARTMENTS.map((name, i) => [normKey(name), i]),
);

/** Résout un libellé quelconque vers département (+ service) système. */
export function resolveExcoDepartment(raw: string): ExcoDeptResolution {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { department: '', raw: trimmed };
  const rule = ALIAS_INDEX.get(aliasKey(trimmed));
  if (rule) {
    return {
      department: rule.department,
      serviceName: rule.serviceName,
      raw: trimmed,
    };
  }
  return { department: trimmed, raw: trimmed };
}

/** Nom département normalisé (sans service). */
export function normalizeDepartmentName(raw: string): string {
  return resolveExcoDepartment(raw).department;
}

export function departmentsEqual(a: string, b: string): boolean {
  const ra = resolveExcoDepartment(a);
  const rb = resolveExcoDepartment(b);
  if (!ra.department || !rb.department) return !ra.department && !rb.department;
  return normKey(ra.department) === normKey(rb.department);
}

/** Ordre d’affichage = liste canonique, puis alpha pour le reste. */
export function compareExcoDepartments(a: string, b: string): number {
  const na = normalizeDepartmentName(a);
  const nb = normalizeDepartmentName(b);
  const ia = CANONICAL_ORDER.get(normKey(na));
  const ib = CANONICAL_ORDER.get(normKey(nb));
  if (ia != null && ib != null) return ia - ib;
  if (ia != null) return -1;
  if (ib != null) return 1;
  return na.localeCompare(nb, 'en', { sensitivity: 'base' });
}

export function sortExcoDepartments<T extends string>(names: T[]): T[] {
  return [...names].sort(compareExcoDepartments);
}
