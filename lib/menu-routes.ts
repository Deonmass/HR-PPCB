export interface RouteMenuEntry {
  prefix: string;
  menuId: string;
}

/** Longest-prefix wins — order by descending prefix length when matching. */
export const ROUTE_MENU_MAP: RouteMenuEntry[] = [
  { prefix: '/documents-voyage/attestation-services', menuId: 'travel.attestation' },
  { prefix: '/documents-voyage/payment-voucher', menuId: 'travel.payment-voucher' },
  { prefix: '/documents-voyage/historique', menuId: 'travel.historique' },
  { prefix: '/documents-voyage/etablir', menuId: 'travel.etablir' },
  { prefix: '/protocol/visa-travail', menuId: 'protocol.visa-travail' },
  { prefix: '/protocol/visa-volant', menuId: 'protocol.visa-volant' },
  { prefix: '/protocol/visa-voyage', menuId: 'protocol.visa-voyage' },
  { prefix: '/protocol/billets', menuId: 'protocol.billets' },
  { prefix: '/factures-fournisseurs/fournisseurs', menuId: 'factures.fournisseur.fournisseurs' },
  { prefix: '/factures-fournisseurs/liste', menuId: 'factures.fournisseur.liste' },
  { prefix: '/factures-fournisseurs/factures', menuId: 'factures.fournisseur.factures' },
  { prefix: '/factures-fournisseurs/soa', menuId: 'factures.fournisseur.soa' },
  { prefix: '/employes/dependants', menuId: 'employes.dependants' },
  { prefix: '/parametres/permissions', menuId: 'settings.permissions' },
  { prefix: '/parametres/utilisateurs', menuId: 'settings.utilisateurs' },
  { prefix: '/parametres/centres-de-cout', menuId: 'settings.centres' },
  { prefix: '/parametres/departements', menuId: 'settings.departements' },
  { prefix: '/parametres/logs', menuId: 'parametres.logs' },
  { prefix: '/project/expenses-details', menuId: 'project.expenses' },
  { prefix: '/project/projects', menuId: 'project.projects' },
  { prefix: '/project/dashboard', menuId: 'project.dashboard' },
  { prefix: '/heures-supplementaires', menuId: 'employes.heures' },
  { prefix: '/check-documents', menuId: 'employes.check-documents' },
  { prefix: '/village/guest-house', menuId: 'village.guest-house' },
  { prefix: '/village/maisons', menuId: 'village.maisons' },
  { prefix: '/village/dashboard', menuId: 'village.maisons' },
  { prefix: '/village/liste', menuId: 'village.maisons' },
  { prefix: '/charroi-automobile/vehicules', menuId: 'charroi.vehicules' },
  { prefix: '/charroi-automobile/achats', menuId: 'charroi.achats' },
  { prefix: '/charroi-automobile', menuId: 'charroi' },
  { prefix: '/employes', menuId: 'employes.liste' },
  { prefix: '/sante', menuId: 'sante' },
];

const SORTED_ROUTES = [...ROUTE_MENU_MAP].sort((a, b) => b.prefix.length - a.prefix.length);

export function pathnameToMenuId(pathname: string): string | null {
  const normalized = pathname.split('?')[0].replace(/\/$/, '') || '/';
  if (normalized === '/' || normalized === '/accueil') return null;
  for (const entry of SORTED_ROUTES) {
    if (normalized === entry.prefix || normalized.startsWith(`${entry.prefix}/`)) {
      return entry.menuId;
    }
  }
  return null;
}

/** Menu IDs whose view permission grants access to the route (any match). */
export function routeViewMenuIds(pathname: string): string[] {
  const normalized = pathname.split('?')[0].replace(/\/$/, '') || '/';
  if (normalized === '/heures-supplementaires' || normalized.startsWith('/heures-supplementaires/')) {
    return ['employes.heures', 'employes.heures.dept', 'employes.heures.all'];
  }
  if (
    normalized === '/village/maisons'
    || normalized.startsWith('/village/maisons/')
    || normalized === '/village/dashboard'
    || normalized.startsWith('/village/dashboard/')
    || normalized === '/village/liste'
    || normalized.startsWith('/village/liste/')
  ) {
    return ['village.maisons', 'village.dependants-dashboard', 'village.dependants-liste'];
  }
  if (
    normalized === '/charroi-automobile'
    || normalized.startsWith('/charroi-automobile/vehicules')
  ) {
    return ['charroi.vehicules', 'charroi'];
  }
  if (normalized.startsWith('/charroi-automobile/achats')) {
    return ['charroi.achats', 'charroi'];
  }
  const menuId = pathnameToMenuId(pathname);
  return menuId ? [menuId] : [];
}

export function menuIdToDefaultPath(menuId: string): string | null {
  const entry = ROUTE_MENU_MAP.find((item) => item.menuId === menuId);
  return entry?.prefix ?? null;
}
