import 'server-only';

import type { MenuPermission } from './auth-types';
import { listVehicules } from './charroi-store';
import { readEmployees } from './employees-json-store';
import type { HomeSearchResponse, HomeSearchResult } from './home-dashboard-types';
import { canPerformAction } from './permission-check';
import { canViewTimesheetModule } from './timesheet-permissions';
import { readProjects } from './projects-store';
import { readTravelHistory } from './travel-history-store';

function can(menus: MenuPermission[], menuId: string): boolean {
  return canPerformAction(menus, menuId, 'view');
}

function scoreMatch(query: string, ...fields: string[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  let best = 0;
  for (const field of fields) {
    const f = String(field || '').toLowerCase();
    if (!f) continue;
    if (f === q) best = Math.max(best, 100);
    else if (f.startsWith(q)) best = Math.max(best, 85);
    else if (f.includes(q)) best = Math.max(best, 65);
    else {
      const tokens = q.split(/\s+/).filter(Boolean);
      if (tokens.length > 1 && tokens.every((t) => f.includes(t))) best = Math.max(best, 55);
    }
  }
  return best;
}

function moduleShortcuts(menus: MenuPermission[]): Array<{
  title: string;
  subtitle: string;
  href: string;
  menuIds: string[];
}> {
  const all = [
    { title: 'Rapport', subtitle: 'Hub des rapports RH', href: '/rapport', menuIds: ['exco.rapport'] },
    { title: 'EXCO', subtitle: 'Rapport mensuel ExCo', href: '/exco', menuIds: ['exco.rapport'] },
    { title: 'Employés', subtitle: 'Liste des agents', href: '/employes', menuIds: ['employes.liste'] },
    { title: 'Dépendants', subtitle: 'Bénéficiaires médicaux', href: '/employes/dependants', menuIds: ['employes.dependants'] },
    { title: 'Poste', subtitle: 'Postes, recrutement, classification, offres et mouvements', href: '/employes/postes', menuIds: ['employes.postes', 'employes.recrutement', 'employes.classification', 'employes.offres', 'employes.mouvements'] },
    { title: 'Recrutement', subtitle: 'Replacements et nouveaux postes', href: '/employes/recrutement', menuIds: ['employes.recrutement'] },
    { title: 'Training', subtitle: 'Formations et compétences', href: '/training', menuIds: ['training'] },
    { title: 'Offres', subtitle: 'Offres d’emploi', href: '/employes/offres', menuIds: ['employes.offres'] },
    { title: 'Mouvements', subtitle: 'Mutations et affectations', href: '/employes/mouvements', menuIds: ['employes.mouvements'] },
    { title: 'Postes', subtitle: 'Catalogue et postes vacants', href: '/employes/postes', menuIds: ['employes.postes'] },
    { title: 'Classification des postes', subtitle: 'Grille Hay, Paterson et classification nationale', href: '/employes/classification', menuIds: ['employes.classification'] },
    { title: 'Contractants', subtitle: 'Entreprises et personnel contractant', href: '/employes/contractants', menuIds: ['employes.contractants'] },
    { title: 'Check documents', subtitle: 'Conformité documentaire', href: '/check-documents', menuIds: ['employes.check-documents'] },
    { title: 'Documents', subtitle: 'Hub documents RH', href: '/documents', menuIds: ['travel.historique', 'documents.rrf', 'documents.entetes', 'documents.exit', 'documents.newcomer', 'documents.contrat-standard', 'documents.convention-collective', 'documents.composition-familiale', 'documents.mouvement-travailleur', 'travel.mission.kinshasa', 'travel.mission.zamba', 'travel.mission.zamba-consultant', 'travel.mission.lubudi'] },
    { title: 'RRF', subtitle: 'Recruitment Requisition', href: '/documents/rrf', menuIds: ['documents.rrf'] },
    { title: 'Entête', subtitle: 'Papiers à lettre', href: '/documents/entetes', menuIds: ['documents.entetes'] },
    { title: 'Exit forms', subtitle: 'Documents de sortie', href: '/documents/exit', menuIds: ['documents.exit'] },
    { title: 'Contrat standard', subtitle: 'Contrat CDD/CDI', href: '/documents/contrat-standard', menuIds: ['documents.contrat-standard'] },
    { title: 'Politique', subtitle: 'Politiques RH de référence', href: '/politique', menuIds: ['politique.longs-etats', 'politique.convention-collective', 'politique.heures-sup', 'politique.village', 'politique.code-conduite', 'politique.code-ethique', 'politique.manuco', 'politique.aide-medicale', 'politique.voyages', 'politique.alcool', 'politique.harcelement'] },
    { title: 'Longs états de service', subtitle: 'Récompense d’ancienneté', href: '/politique/longs-etats-de-service', menuIds: ['politique.longs-etats'] },
    { title: 'Convention collective', subtitle: 'Clauses et résumés', href: '/politique/convention-collective', menuIds: ['politique.convention-collective', 'documents.convention-collective'] },
    { title: 'Politique heures supplémentaires', subtitle: 'Finale oct. 25', href: '/politique/heures-supplementaires', menuIds: ['politique.heures-sup'] },
    { title: 'Politique Village', subtitle: 'Attribution des maisons', href: '/politique/doc/village', menuIds: ['politique.village'] },
    { title: 'Code de bonne conduite', subtitle: 'Règles de comportement', href: '/politique/doc/code-conduite', menuIds: ['politique.code-conduite'] },
    { title: 'Code d’éthique des affaires', subtitle: 'Business ethics', href: '/politique/doc/code-ethique', menuIds: ['politique.code-ethique'] },
    { title: 'Règlement Manuco', subtitle: 'Règlement intérieur', href: '/politique/doc/manuco', menuIds: ['politique.manuco'] },
    { title: 'Aide médicale', subtitle: 'Medical Aid Policy', href: '/politique/doc/aide-medicale', menuIds: ['politique.aide-medicale'] },
    { title: 'Politique de voyage', subtitle: 'Travel Policy', href: '/politique/doc/voyages', menuIds: ['politique.voyages'] },
    { title: 'Alcool et substances', subtitle: 'Substance abuse policy', href: '/politique/doc/alcool', menuIds: ['politique.alcool'] },
    { title: 'Politique harcèlement', subtitle: 'Harassment policy', href: '/politique/doc/harcelement', menuIds: ['politique.harcelement'] },
    { title: 'Newcomer', subtitle: 'Pack intégration newcomer', href: '/documents/newcomer', menuIds: ['documents.newcomer'] },
    { title: 'Voyages', subtitle: 'Historique missions', href: '/documents-voyage/historique', menuIds: ['travel.historique'] },
    { title: 'Établir voyage', subtitle: 'Cash request / dossier', href: '/documents-voyage/etablir', menuIds: ['travel.etablir'] },
    { title: 'Ordre de mission', subtitle: 'Registre par site KN / ZA / ZC / LU', href: '/documents-voyage/document/mission-order', menuIds: ['travel.etablir', 'travel.mission.kinshasa', 'travel.mission.zamba', 'travel.mission.zamba-consultant', 'travel.mission.lubudi'] },
    { title: 'Attestation de service', subtitle: 'Génération attestations', href: '/documents-voyage/attestation-services', menuIds: ['travel.attestation'] },
    { title: 'Attestation de congé', subtitle: 'Employé, signataire, période', href: '/documents/attestation-conge', menuIds: ['documents.attestation-conge'] },
    { title: 'Déclaration de composition familiale', subtitle: 'Formulaire CNSS F6', href: '/documents/composition-familiale', menuIds: ['documents.composition-familiale'] },
    { title: 'Déclaration de mouvement de travailleur', subtitle: 'Formulaire ONEM DMT', href: '/documents/mouvement-travailleur', menuIds: ['documents.mouvement-travailleur'] },
    { title: 'Projets', subtitle: 'Dashboard projets', href: '/project/dashboard', menuIds: ['project.dashboard'] },
    { title: 'Liste projets', subtitle: 'Projets CSR / CC', href: '/project/projects', menuIds: ['project.projects'] },
    { title: 'Dépenses projets', subtitle: 'Expenses details', href: '/project/expenses-details', menuIds: ['project.expenses'] },
    { title: 'Véhicules', subtitle: 'Charroi automobile', href: '/charroi-automobile/vehicules', menuIds: ['charroi.vehicules', 'charroi'] },
    { title: 'Achats véhicules', subtitle: 'Commandes charroi', href: '/charroi-automobile/achats', menuIds: ['charroi.achats', 'charroi'] },
    { title: 'Factures', subtitle: 'Suivi factures fournisseurs', href: '/factures-fournisseurs/factures', menuIds: ['factures.fournisseur.factures'] },
    { title: 'SOA', subtitle: 'Statement of account', href: '/factures-fournisseurs/soa', menuIds: ['factures.fournisseur.soa'] },
    { title: 'Village — Maisons', subtitle: 'Affectations village', href: '/village/maisons', menuIds: ['village.maisons'] },
    { title: 'Guest house', subtitle: 'Réservations guest house', href: '/village/guest-house', menuIds: ['village.guest-house'] },
    { title: 'Heures supplémentaires', subtitle: 'Timesheet OT', href: '/heures-supplementaires', menuIds: ['employes.heures'] },
    { title: 'Congé', subtitle: 'Planning journalier et soldes', href: '/employes/conge', menuIds: ['employes.conge'] },
    { title: 'Utilisateurs', subtitle: 'Comptes application', href: '/parametres/utilisateurs', menuIds: ['settings.utilisateurs'] },
    { title: 'Permissions', subtitle: 'Droits d’accès', href: '/parametres/permissions', menuIds: ['settings.permissions'] },
    { title: 'Départements', subtitle: 'Référentiel RH', href: '/parametres/departements', menuIds: ['settings.departements'] },
    { title: 'Centres de coût', subtitle: 'Référentiel finance', href: '/parametres/centres-de-cout', menuIds: ['settings.centres'] },
  ];
  return all.filter((item) => {
    if (item.href === '/heures-supplementaires') return canViewTimesheetModule(menus);
    return item.menuIds.some((id) => can(menus, id));
  });
}

/** Recherche globale accueil (modules + données métier selon permissions). */
export async function searchHome(
  menus: MenuPermission[],
  queryRaw: string,
  limit = 20,
): Promise<HomeSearchResponse> {
  const query = queryRaw.trim();
  if (query.length < 1) {
    return { query, results: [] };
  }

  const scored: Array<HomeSearchResult & { score: number }> = [];

  for (const mod of moduleShortcuts(menus)) {
    const score = scoreMatch(query, mod.title, mod.subtitle, mod.href);
    if (score > 0) {
      scored.push({
        id: `mod-${mod.href}`,
        type: 'module',
        title: mod.title,
        subtitle: mod.subtitle,
        href: mod.href,
        meta: 'Module',
        score: score + 5,
      });
    }
  }

  if (can(menus, 'employes.liste')) {
    try {
      const employees = await readEmployees();
      for (const e of employees) {
        const score = scoreMatch(
          query,
          e.nom,
          e.matricule,
          e.departement,
          e.jobTitle,
          e.localisation,
        );
        if (score >= 55) {
          scored.push({
            id: `emp-${e.matricule}`,
            type: 'employee',
            title: e.nom,
            subtitle: [e.matricule, e.jobTitle, e.departement].filter(Boolean).join(' · '),
            href: `/employes?q=${encodeURIComponent(e.matricule || e.nom)}`,
            meta: 'Employé',
            score,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (can(menus, 'charroi.vehicules') || can(menus, 'charroi')) {
    try {
      const vehicles = await listVehicules();
      for (const v of vehicles) {
        const score = scoreMatch(
          query,
          v.plaque,
          v.marque,
          v.type,
          v.user,
          v.departement,
          v.numeroChassis,
          String(v.numero ?? ''),
        );
        if (score >= 55) {
          scored.push({
            id: `veh-${v.id}`,
            type: 'vehicle',
            title: `${v.marque || 'Véhicule'} ${v.type || ''}`.trim(),
            subtitle: [v.plaque, v.user, v.departement].filter(Boolean).join(' · '),
            href: '/charroi-automobile/vehicules',
            meta: 'Véhicule',
            score,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (can(menus, 'project.projects') || can(menus, 'project.dashboard')) {
    try {
      const data = await readProjects();
      for (const p of data.projects) {
        const score = scoreMatch(
          query,
          p.name || '',
          p.secteur || '',
          p.statut || '',
          p.lieu || '',
          p.responsable || '',
          String(p.numero ?? ''),
        );
        if (score >= 55) {
          scored.push({
            id: `prj-${p.id || p.numero || p.name}`,
            type: 'project',
            title: p.name || `Projet ${p.numero ?? ''}`,
            subtitle: [p.secteur, p.statut, p.lieu].filter(Boolean).join(' · '),
            href: '/project/projects',
            meta: 'Projet',
            score,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (can(menus, 'travel.historique')) {
    try {
      const travel = await readTravelHistory();
      for (const row of travel.rows.slice(0, 500)) {
        const score = scoreMatch(
          query,
          row.employee,
          row.ref,
          row.department,
          row.travelDates,
        );
        if (score >= 55) {
          scored.push({
            id: `travel-${row.recordId || row.ref || row.rowIndex}`,
            type: 'travel',
            title: row.employee || row.ref || 'Mission',
            subtitle: [row.ref, row.department, row.travelDates].filter(Boolean).join(' · '),
            href: '/documents-voyage/historique',
            meta: 'Voyage',
            score,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'fr'));
  const results = scored.slice(0, limit).map(({ score: _s, ...rest }) => rest);
  return { query, results };
}
