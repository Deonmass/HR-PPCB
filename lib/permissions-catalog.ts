import type { MenuPermission, PermissionAction } from './auth-types';

export interface PermissionMenuGroup {
  id: string;
  label: string;
  items: { id: string; label: string }[];
}

export const PERMISSION_MENU_CATALOG: PermissionMenuGroup[] = [
  {
    id: 'employes',
    label: 'Employés',
    items: [
      { id: 'employes.liste', label: 'Liste employés' },
      { id: 'employes.dependants', label: 'Dependants' },
      { id: 'employes.check-documents', label: 'Check documents' },
      { id: 'employes.heures', label: 'Heures sup. — Mon timesheet' },
      {
        id: 'employes.heures.dept',
        label: 'Heures sup. — Département (planning & OT de son département — Modifier = éditer le planning)',
      },
      { id: 'employes.heures.all', label: 'Heures sup. — Tous départements (planning & OT)' },
      { id: 'employes.heures.import', label: 'Heures sup. — Import OT (menu contextuel carte semaine)' },
      { id: 'employes.heures.compilation', label: 'Heures sup. — Compilation & politique' },
    ],
  },
  {
    id: 'project',
    label: 'Projet',
    items: [
      { id: 'project.dashboard', label: 'Dashboard' },
      { id: 'project.projects', label: 'Projects' },
      { id: 'project.expenses', label: 'Expenses details' },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    items: [
      { id: 'travel.historique', label: 'Voyage — Historique' },
      { id: 'travel.etablir', label: 'Voyage — Établir' },
      { id: 'travel.attestation', label: 'Attestation de service' },
    ],
  },
  {
    id: 'factures-fournisseur',
    label: 'Facture fournisseur',
    items: [
      { id: 'factures.fournisseur.liste', label: 'Liste' },
      { id: 'factures.fournisseur.factures', label: 'Factures' },
      { id: 'factures.fournisseur.soa', label: 'SOA' },
      { id: 'factures.fournisseur.fournisseurs', label: 'Fournisseurs' },
    ],
  },
  {
    id: 'sante',
    label: 'Santé',
    items: [
      { id: 'sante', label: 'Santé' },
    ],
  },
  {
    id: 'charroi',
    label: 'Charroi',
    items: [
      { id: 'charroi', label: 'Charroi automobile' },
    ],
  },
  {
    id: 'village',
    label: 'Village',
    items: [
      { id: 'village.dependants-dashboard', label: 'Dashboard (Village/Kimpese)' },
      { id: 'village.dependants-liste', label: 'Liste (Village/Kimpese)' },
      { id: 'village.maisons', label: 'Maisons' },
      { id: 'village.guest-house', label: 'Guest house' },
    ],
  },
  {
    id: 'parametres',
    label: 'Paramètres',
    items: [
      { id: 'settings.departements', label: 'Départements' },
      { id: 'settings.centres', label: 'Centre de coût' },
      { id: 'settings.utilisateurs', label: 'Utilisateurs' },
      { id: 'settings.permissions', label: 'Permissions' },
    ],
  },
];

export const PERMISSION_ACTIONS: { id: PermissionAction; label: string }[] = [
  { id: 'view', label: 'Voir' },
  { id: 'create', label: 'Créer' },
  { id: 'edit', label: 'Modifier' },
  { id: 'delete', label: 'Supprimer' },
  { id: 'export', label: 'Exporter' },
];

export function buildDefaultPermissions(): MenuPermission[] {
  const menus: MenuPermission[] = [];
  for (const group of PERMISSION_MENU_CATALOG) {
    for (const item of group.items) {
      menus.push({
        menuId: item.id,
        label: item.label,
        actions: {
          view: false,
          create: false,
          edit: false,
          delete: false,
          export: false,
        },
      });
    }
  }
  return menus;
}

export function mergePermissionsWithCatalog(menus: MenuPermission[]): MenuPermission[] {
  const defaults = buildDefaultPermissions();
  const merged = defaults.map((defaultMenu) => {
    const existing = menus.find((menu) => menu.menuId === defaultMenu.menuId);
    if (!existing) return defaultMenu;
    return {
      menuId: defaultMenu.menuId,
      label: existing.label || defaultMenu.label,
      actions: {
        view: Boolean(existing.actions.view),
        create: Boolean(existing.actions.create),
        edit: Boolean(existing.actions.edit),
        delete: Boolean(existing.actions.delete),
        export: Boolean(existing.actions.export),
      },
    };
  });

  return merged;
}

export function setAllMenuActions(
  menu: MenuPermission,
  value: boolean,
): MenuPermission {
  return {
    ...menu,
    actions: {
      view: value,
      create: value,
      edit: value,
      delete: value,
      export: value,
    },
  };
}

export function isMenuFullyChecked(menu: MenuPermission): boolean {
  return PERMISSION_ACTIONS.every((action) => menu.actions[action.id]);
}

export function isMenuPartiallyChecked(menu: MenuPermission): boolean {
  const checkedCount = PERMISSION_ACTIONS.filter((action) => menu.actions[action.id]).length;
  return checkedCount > 0 && checkedCount < PERMISSION_ACTIONS.length;
}

export function computePermissionsStats(menus: MenuPermission[]): {
  checked: number;
  total: number;
  percent: number;
} {
  const total = menus.length * PERMISSION_ACTIONS.length;
  let checked = 0;
  for (const menu of menus) {
    for (const action of PERMISSION_ACTIONS) {
      if (menu.actions[action.id]) checked += 1;
    }
  }
  return {
    checked,
    total,
    percent: total > 0 ? Math.round((checked / total) * 100) : 0,
  };
}

export function groupPermissionsByCatalog(menus: MenuPermission[]) {
  return PERMISSION_MENU_CATALOG.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const permission =
        menus.find((menu) => menu.menuId === item.id) ??
        ({
          menuId: item.id,
          label: item.label,
          actions: {
            view: false,
            create: false,
            edit: false,
            delete: false,
            export: false,
          },
        } as MenuPermission);
      return permission;
    }),
  }));
}
