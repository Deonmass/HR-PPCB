export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'import'
  | 'undo'
  | 'login'
  | 'logout'
  | 'error'
  | 'other';

export interface AuditLogErrorInfo {
  message: string;
  code?: string;
  stack?: string;
  path?: string;
  method?: string;
  status?: number;
  context?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  userEmail?: string;
  module: string;
  moduleLabel: string;
  action: AuditAction;
  actionLabel: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  details: string;
  before?: unknown;
  after?: unknown;
  undoable: boolean;
  undone: boolean;
  undoneByLogId?: string;
  error?: AuditLogErrorInfo;
  meta?: Record<string, unknown>;
}

export interface AuditLogsStore {
  entries: AuditLogEntry[];
  nextSeq: number;
}

export interface AuditActor {
  userId: string;
  userName: string;
  userEmail?: string;
}

export interface AppendAuditLogInput {
  userId?: string;
  userName?: string;
  userEmail?: string;
  module: string;
  moduleLabel?: string;
  action: AuditAction;
  actionLabel?: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  details?: string;
  before?: unknown;
  after?: unknown;
  undoable?: boolean;
  error?: AuditLogErrorInfo;
  meta?: Record<string, unknown>;
}

export interface ReadAuditLogsFilters {
  limit?: number;
  offset?: number;
  module?: string;
  action?: AuditAction | string;
  userId?: string;
  q?: string;
  includeUndone?: boolean;
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  export: 'Export',
  import: 'Import',
  undo: 'Annulation',
  login: 'Connexion',
  logout: 'Déconnexion',
  error: 'Erreur',
  other: 'Autre',
};

export const AUDIT_MODULE_LABELS: Record<string, string> = {
  'charroi.vehicules': 'Charroi — Véhicules',
  'charroi.achats': 'Charroi — Achats',
  employees: 'Employés',
  'employees.check-documents': 'Check documents',
  dependants: 'Dépendants',
  'guest-house': 'Guest house',
  'factures-suivi': 'Factures suivi',
  fournisseurs: 'Fournisseurs',
  projects: 'Projets',
  'projects.expenses': 'Projets — Dépenses',
  'travel.historique': 'Voyage',
  'travel.etablir': 'Cash request',
  'travel.attestation': 'Attestation de service',
  'travel.payment-voucher': 'Payment voucher',
  'documents.entetes': 'Entête',
  'documents.rrf': 'RRF',
  'protocol.visa-travail': 'Visa de travail',
  'protocol.visa-volant': 'Visa volant',
  'protocol.visa-voyage': 'Visa de voyage',
  'protocol.billets': 'Gestion des Billets',
  'work-visa.dossier': 'Dossier visa de travail',
  'village.maisons': 'Village — Maisons',
  'village.dependants': 'Village — Dépendants',
  'village.assign': 'Village — Affectations',
  timesheet: 'Timesheet',
  'timesheet.overtimes': 'Timesheet — Heures sup.',
  'timesheet.compilation': 'Timesheet — Compilation',
  'settings.utilisateurs': 'Paramètres — Utilisateurs',
  'settings.permissions': 'Paramètres — Permissions',
  'settings.departements': 'Paramètres — Départements',
  'settings.centres': 'Paramètres — Centres de coût',
  auth: 'Authentification',
  parametres: 'Paramètres',
  system: 'Système',
  audit: 'Logs d’audit',
};

export function resolveAuditModuleLabel(module: string, override?: string): string {
  if (override?.trim()) return override.trim();
  return AUDIT_MODULE_LABELS[module] ?? module;
}

export function resolveAuditActionLabel(action: AuditAction, override?: string): string {
  if (override?.trim()) return override.trim();
  return AUDIT_ACTION_LABELS[action] ?? action;
}
