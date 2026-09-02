export interface RouteMenuEntry {
  prefix: string;
  menuId: string;
}

/** Longest-prefix wins — order by descending prefix length when matching. */
/** Menus donnant accès au hub Documents (n'importe lequel suffit). */
export const DOCUMENTS_HUB_MENU_IDS = [
  'travel.historique',
  'travel.etablir',
  'travel.mission.kinshasa',
  'travel.mission.zamba',
  'travel.mission.zamba-consultant',
  'travel.mission.lubudi',
  'travel.attestation',
  'travel.payment-voucher',
  'documents.appraisal',
  'documents.exit',
  'documents.entetes',
  'documents.rrf',
  'documents.newcomer',
  'documents.contrat-standard',
  'documents.attestation-conge',
  'documents.convention-collective',
];

export const POLITIQUE_HUB_MENU_IDS = [
  'politique.longs-etats',
  'politique.convention-collective',
  'politique.heures-sup',
  'politique.village',
  'politique.code-conduite',
  'politique.code-ethique',
  'politique.manuco',
  'politique.aide-medicale',
  'politique.voyages',
  'politique.alcool',
  'politique.harcelement',
];

export const RAPPORT_HUB_MENU_IDS = [
  'exco.rapport',
];

export const ROUTE_MENU_MAP: RouteMenuEntry[] = [
  { prefix: '/rapport', menuId: 'exco.rapport' },
  { prefix: '/exco', menuId: 'exco.rapport' },
  { prefix: '/audit', menuId: 'audit.points' },
  { prefix: '/documents/rrf', menuId: 'documents.rrf' },
  { prefix: '/documents/entetes', menuId: 'documents.entetes' },
  { prefix: '/documents/exit', menuId: 'documents.exit' },
  { prefix: '/documents/interim-appraisal', menuId: 'documents.appraisal' },
  { prefix: '/documents/newcomer', menuId: 'documents.newcomer' },
  { prefix: '/documents/contrat-standard', menuId: 'documents.contrat-standard' },
  { prefix: '/documents/attestation-conge', menuId: 'documents.attestation-conge' },
  { prefix: '/documents/convention-collective', menuId: 'documents.convention-collective' },
  { prefix: '/documents', menuId: 'travel.historique' },
  { prefix: '/politique/longs-etats-de-service', menuId: 'politique.longs-etats' },
  { prefix: '/politique/convention-collective', menuId: 'politique.convention-collective' },
  { prefix: '/politique/heures-supplementaires', menuId: 'politique.heures-sup' },
  { prefix: '/politique/doc/village', menuId: 'politique.village' },
  { prefix: '/politique/doc/code-conduite', menuId: 'politique.code-conduite' },
  { prefix: '/politique/doc/code-ethique', menuId: 'politique.code-ethique' },
  { prefix: '/politique/doc/manuco', menuId: 'politique.manuco' },
  { prefix: '/politique/doc/aide-medicale', menuId: 'politique.aide-medicale' },
  { prefix: '/politique/doc/voyages', menuId: 'politique.voyages' },
  { prefix: '/politique/doc/alcool', menuId: 'politique.alcool' },
  { prefix: '/politique/doc/harcelement', menuId: 'politique.harcelement' },
  { prefix: '/politique', menuId: 'politique.longs-etats' },
  { prefix: '/documents-voyage/attestation-services', menuId: 'travel.attestation' },
  { prefix: '/documents-voyage/payment-voucher', menuId: 'travel.payment-voucher' },
  { prefix: '/documents-voyage/historique', menuId: 'travel.historique' },
  { prefix: '/documents-voyage/document/mission-order', menuId: 'travel.mission.zamba' },
  { prefix: '/documents-voyage/etablir', menuId: 'travel.etablir' },
  { prefix: '/documents-voyage/document', menuId: 'travel.etablir' },
  { prefix: '/protocol/visa-travail', menuId: 'protocol.visa-travail' },
  { prefix: '/protocol/visa-volant', menuId: 'protocol.visa-volant' },
  { prefix: '/protocol/visa-voyage', menuId: 'protocol.visa-voyage' },
  { prefix: '/protocol/billets', menuId: 'protocol.billets' },
  { prefix: '/factures-fournisseurs/fournisseurs', menuId: 'factures.fournisseur.fournisseurs' },
  { prefix: '/factures-fournisseurs/liste', menuId: 'factures.fournisseur.liste' },
  { prefix: '/factures-fournisseurs/factures', menuId: 'factures.fournisseur.factures' },
  { prefix: '/factures-fournisseurs/soa', menuId: 'factures.fournisseur.soa' },
  { prefix: '/employes/dependants', menuId: 'employes.dependants' },
  { prefix: '/employes/offres', menuId: 'employes.offres' },
  { prefix: '/employes/mouvements', menuId: 'employes.mouvements' },
  { prefix: '/employes/postes', menuId: 'employes.postes' },
  { prefix: '/employes/recrutement', menuId: 'employes.recrutement' },
  { prefix: '/employes/classification', menuId: 'employes.classification' },
  { prefix: '/employes/contractants', menuId: 'employes.contractants' },
  { prefix: '/parametres/permissions', menuId: 'settings.permissions' },
  { prefix: '/parametres/utilisateurs', menuId: 'settings.utilisateurs' },
  { prefix: '/parametres/centres-de-cout', menuId: 'settings.centres' },
  { prefix: '/parametres/departements', menuId: 'settings.departements' },
  { prefix: '/parametres/json', menuId: 'settings.permissions' },
  { prefix: '/parametres/logs', menuId: 'parametres.logs' },
  { prefix: '/project/expenses-details', menuId: 'project.expenses' },
  { prefix: '/project/projects', menuId: 'project.projects' },
  { prefix: '/project/dashboard', menuId: 'project.dashboard' },
  { prefix: '/heures-supplementaires', menuId: 'employes.heures' },
  { prefix: '/check-documents', menuId: 'employes.check-documents' },
  { prefix: '/village/guest-house', menuId: 'village.guest-house' },
  { prefix: '/village/maisons', menuId: 'village.maisons' },
  { prefix: '/village/dashboard', menuId: 'village.dependants-dashboard' },
  { prefix: '/village/liste', menuId: 'village.dependants-liste' },
  { prefix: '/charroi-automobile/vehicules', menuId: 'charroi.vehicules' },
  { prefix: '/charroi-automobile/achats', menuId: 'charroi.achats' },
  { prefix: '/charroi-automobile', menuId: 'charroi' },
  { prefix: '/employes', menuId: 'employes.liste' },
  { prefix: '/sante', menuId: 'sante' },
  { prefix: '/training', menuId: 'training' },
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
  ) {
    // Maisons page hosts tabs; allow dashboard/liste grants to open the page.
    return ['village.maisons', 'village.dependants-dashboard', 'village.dependants-liste'];
  }
  if (
    normalized === '/village/dashboard'
    || normalized.startsWith('/village/dashboard/')
  ) {
    return ['village.dependants-dashboard', 'village.maisons'];
  }
  if (
    normalized === '/village/liste'
    || normalized.startsWith('/village/liste/')
  ) {
    return ['village.dependants-liste', 'village.maisons'];
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
  if (normalized === '/documents') {
    return [...DOCUMENTS_HUB_MENU_IDS];
  }
  if (
    normalized === '/documents-voyage/document/mission-order'
    || normalized.startsWith('/documents-voyage/document/mission-order/')
  ) {
    return [
      'travel.etablir',
      'travel.mission.kinshasa',
      'travel.mission.zamba',
      'travel.mission.zamba-consultant',
      'travel.mission.lubudi',
    ];
  }
  if (normalized === '/politique') {
    return [...POLITIQUE_HUB_MENU_IDS];
  }
  if (normalized === '/rapport') {
    return [...RAPPORT_HUB_MENU_IDS];
  }
  const menuId = pathnameToMenuId(pathname);
  return menuId ? [menuId] : [];
}

export function menuIdToDefaultPath(menuId: string): string | null {
  const entry = ROUTE_MENU_MAP.find((item) => item.menuId === menuId);
  return entry?.prefix ?? null;
}
