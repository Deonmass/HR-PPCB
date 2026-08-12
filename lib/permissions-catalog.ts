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
      { id: 'employes.offres', label: 'Offres' },
      { id: 'employes.mouvements', label: 'Mouvements' },
      { id: 'employes.postes', label: 'Postes' },
      { id: 'employes.contractants', label: 'Contractants' },
      { id: 'employes.check-documents', label: 'Check documents' },
      { id: 'employes.heures', label: 'HS — Mon timesheet' },
      { id: 'employes.heures.dept', label: 'HS — Voir mon département' },
      { id: 'employes.heures.all', label: 'HS — Voir tous les départements' },
      { id: 'employes.heures.import', label: 'HS — Importer OT' },
      { id: 'employes.heures.validate', label: 'HS — Valider OT' },
      { id: 'employes.heures.edit-validated', label: 'HS — Modifier OT après validation' },
      { id: 'employes.heures.policy', label: 'HS — Appliquer la politique' },
      { id: 'employes.heures.export', label: 'HS — Exporter' },
      { id: 'employes.heures.simulation', label: 'HS — Simulation' },
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
      { id: 'travel.historique', label: 'Voyage' },
      { id: 'travel.etablir', label: 'Cash request' },
      { id: 'travel.attestation', label: 'Attestation de service' },
      { id: 'travel.payment-voucher', label: 'Payment voucher' },
      { id: 'documents.appraisal', label: 'Interim appraisal evaluation' },
      { id: 'documents.exit', label: 'Exit forms' },
      { id: 'documents.entetes', label: 'Entête' },
      { id: 'documents.rrf', label: 'RRF' },
      { id: 'documents.newcomer', label: 'Newcomer' },
      { id: 'documents.contrat-standard', label: 'Contrat standard' },
      { id: 'documents.convention-collective', label: 'Convention collective' },
    ],
  },
  {
    id: 'protocol',
    label: 'Protocol',
    items: [
      { id: 'protocol.visa-travail', label: 'Visa de travail' },
      { id: 'protocol.visa-volant', label: 'Visa volant' },
      { id: 'protocol.visa-voyage', label: 'Visa de voyage' },
      { id: 'protocol.billets', label: 'Gestion des Billets' },
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
      { id: 'charroi', label: 'Charroi (accès global)' },
      { id: 'charroi.vehicules', label: 'Base véhicules' },
      { id: 'charroi.achats', label: 'Nouveaux achats' },
    ],
  },
  {
    id: 'village',
    label: 'Village',
    items: [
      { id: 'village.dependants-dashboard', label: 'Dashboard (Village/Kimpese)' },
      { id: 'village.dependants-liste', label: 'Liste (Village/Kimpese)' },
      { id: 'village.maisons', label: 'Maisons' },
      { id: 'village.guest-house', label: 'Guest house — réservations & occupation' },
    ],
  },
  {
    id: 'parametres',
    label: 'Paramètres',
    items: [
      { id: 'settings.departements', label: 'Départements' },
      { id: 'settings.centres', label: 'Centre de coût' },
      { id: 'settings.utilisateurs', label: 'Utilisateurs' },
      { id: 'settings.utilisateurs.reset', label: 'Reset mot de passe' },
      { id: 'settings.permissions', label: 'Permissions' },
      { id: 'parametres.logs', label: 'Logs' },
    ],
  },
];

export const PERMISSION_ACTIONS: { id: PermissionAction; label: string }[] = [
  { id: 'view', label: 'Voir' },
  { id: 'create', label: 'Créer' },
  { id: 'edit', label: 'Modifier' },
  { id: 'delete', label: 'Supprimer' },
  { id: 'export', label: 'Exporter' },
  { id: 'undo', label: 'Annuler action' },
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
          undo: false,
        },
      });
    }
  }
  return menus;
}

export function mergePermissionsWithCatalog(menus: MenuPermission[]): MenuPermission[] {
  const defaults = buildDefaultPermissions();
  const grantNewFully =
    menus.length > 0 && menus.every((menu) => isMenuFullyChecked(menu));

  // Si tous les menus Documents / Voyage déjà en stock sont complets, les nouveaux menus du hub suivent.
  const hubMenus = menus.filter(
    (menu) =>
      menu.menuId.startsWith('documents.')
      || menu.menuId.startsWith('travel.'),
  );
  const grantNewDocMenus =
    hubMenus.length > 0 && hubMenus.every((menu) => isMenuFullyChecked(menu));

  // Idem pour les menus Employés (Postes, Mouvements, Offres, etc.).
  const employesMenus = menus.filter((menu) => menu.menuId.startsWith('employes.'));
  const grantNewEmployesMenus =
    employesMenus.length > 0 && employesMenus.every((menu) => isMenuFullyChecked(menu));

  const merged = defaults.map((defaultMenu) => {
    const existing = menus.find((menu) => menu.menuId === defaultMenu.menuId);
    if (!existing) {
      if (grantNewFully) return setAllMenuActions(defaultMenu, true);
      if (
        grantNewDocMenus
        && (defaultMenu.menuId.startsWith('documents.')
          || defaultMenu.menuId.startsWith('travel.'))
      ) {
        return setAllMenuActions(defaultMenu, true);
      }
      if (grantNewEmployesMenus && defaultMenu.menuId.startsWith('employes.')) {
        return setAllMenuActions(defaultMenu, true);
      }
      return defaultMenu;
    }
    return {
      menuId: defaultMenu.menuId,
      label: defaultMenu.label,
      actions: {
        view: Boolean(existing.actions.view),
        create: Boolean(existing.actions.create),
        edit: Boolean(existing.actions.edit),
        delete: Boolean(existing.actions.delete),
        export: Boolean(existing.actions.export),
        undo: Boolean(existing.actions.undo),
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
      undo: value,
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
