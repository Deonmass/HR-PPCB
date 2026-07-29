/** Entity types with a registered undo handler (keep in sync with audit-undo-handlers). */
export const UNDOABLE_ENTITY_TYPES = [
  'charroi.vehicule',
  'charroi.achat',
  'employee',
  'dependant',
  'guest-house.room',
  'guest-house.reservation',
  'facture.suivi',
  'fournisseur',
  'project',
  'project.expense',
  'travel.history',
  'village.maison',
  'village.taille',
  'village.suggestion',
  'settings.department',
  'settings.cost-center',
  'auth.user',
] as const;

export type UndoableEntityType = (typeof UNDOABLE_ENTITY_TYPES)[number];

export function hasUndoHandler(entityType: string | undefined | null): boolean {
  if (!entityType) return false;
  return (UNDOABLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}
