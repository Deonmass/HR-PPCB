import 'server-only';

import { listUsers } from './auth-store';
import type { MenuPermission } from './auth-types';
import { readDashboard } from './dashboard-store';
import { calcDocumentCompletion, getDepartments } from './documents';
import { readEmployees } from './employees-json-store';
import { readDependantsData } from './dependants-json-store';
import type { HomeDashboardData, HomeKpi, HomeProjectScopeSummary } from './home-dashboard-types';
import { canPerformAction } from './permission-check';
import { canViewTimesheetModule } from './timesheet-permissions';
import { filterValidExpenses, getBudgetRow } from './projects';
import { readProjects } from './projects-store';
import { listCostCenters, listDepartments } from './settings-store';
import { readTravelHistory } from './travel-history-store';

function can(menus: MenuPermission[], menuId: string, action: 'view' = 'view'): boolean {
  return canPerformAction(menus, menuId, action);
}

function kpiValue(
  items: Array<{ label: string; value: number }>,
  label: string,
): number {
  return items.find((item) => item.label === label)?.value ?? 0;
}

function sumBudgetRows(
  rows: Array<{ prevus: number; depense: number }>,
): { prevu: number; depense: number } {
  return rows.reduce(
    (acc, row) => ({
      prevu: acc.prevu + row.prevus,
      depense: acc.depense + row.depense,
    }),
    { prevu: 0, depense: 0 },
  );
}

function buildProjectScope(
  label: string,
  dashboard: Awaited<ReturnType<typeof readProjects>>['dashboards']['csr'],
): HomeProjectScopeSummary {
  const budget = sumBudgetRows(dashboard.budgetByStatus);
  return {
    label,
    total: dashboard.effectifs.total,
    enCours: dashboard.effectifs.encours,
    termines: dashboard.effectifs.termine,
    prevu: budget.prevu,
    depense: budget.depense,
  };
}

export async function buildHomeDashboard(menus: MenuPermission[]): Promise<HomeDashboardData> {
  const kpis: HomeKpi[] = [];
  const placeholders: HomeDashboardData['placeholders'] = [];
  const result: HomeDashboardData = { kpis, placeholders };

  if (can(menus, 'employes.liste')) {
    const employees = await readEmployees();
    const departments = getDepartments(employees);
    let completionSum = 0;
    let needsAttention = 0;
    for (const employee of employees) {
      const { pct } = calcDocumentCompletion(employee);
      completionSum += pct;
      if (pct < 50) needsAttention += 1;
    }
    const avgCompletion =
      employees.length > 0 ? Math.round(completionSum / employees.length) : 0;

    result.employes = {
      total: employees.length,
      departments: departments.length,
      avgCompletion,
      needsAttention,
      href: '/employes',
    };
    kpis.push({
      label: 'Employés',
      value: employees.length,
      meta: `${departments.length} départements`,
      color: 'red',
    });
  }

  if (can(menus, 'employes.dependants')) {
    const dependantsData = await readDependantsData();
    const kpisDash = dependantsData.dashboard.kpis;
    result.dependants = {
      totalBeneficiaires: kpiValue(kpisDash, 'Total beneficiaires'),
      employes: kpiValue(kpisDash, 'Employes'),
      conjoints: kpiValue(kpisDash, 'Conjoints'),
      enfants: kpiValue(kpisDash, 'Enfants'),
      employesAvecFamille: kpiValue(kpisDash, 'Employes avec famille'),
      employesSeuls: kpiValue(kpisDash, 'Employes seuls'),
      href: '/employes/dependants',
    };
    kpis.push({
      label: 'Bénéficiaires',
      value: result.dependants.totalBeneficiaires,
      meta: `${result.dependants.enfants} enfants · ${result.dependants.conjoints} conjoints`,
      color: 'green',
    });
  }

  if (can(menus, 'employes.check-documents')) {
    const dashboard = await readDashboard();
    result.documents = {
      totalEmployee: Number(dashboard.dashboard.totalEmployee) || 0,
      conformeRate: dashboard.dashboard.conformeRate,
      noConformeRate: dashboard.dashboard.noConformeRate,
      departments: dashboard.dashboard.departments.slice(0, 5).map((item) => ({
        name: item.name,
        rate: item.rate,
      })),
      href: '/check-documents',
    };
    if (!result.employes) {
      kpis.push({
        label: 'Conformité docs',
        value: dashboard.dashboard.conformeRate,
        meta: 'Taux global',
        color: 'orange',
      });
    }
  }

  if (
    can(menus, 'project.dashboard') ||
    can(menus, 'project.projects') ||
    can(menus, 'project.expenses')
  ) {
    const data = await readProjects();
    const expenses = filterValidExpenses(data.expenses);

    const scopes: HomeProjectScopeSummary[] = [];
    if (can(menus, 'project.dashboard')) {
      scopes.push(buildProjectScope('CSR', data.dashboards.csr));
      scopes.push(buildProjectScope('Cahier des charges', data.dashboards.cc));
    } else if (can(menus, 'project.projects')) {
      const csrRow = getBudgetRow(data.dashboards.csr.budgetByStatus, 'Total');
      scopes.push({
        label: 'Projets',
        total: data.projects.length,
        enCours: data.projects.filter((p) => p.statut === 'En cours').length,
        termines: data.projects.filter((p) => p.statut === 'Terminé').length,
        prevu: csrRow?.prevus ?? 0,
        depense: csrRow?.depense ?? 0,
      });
    }

    result.projects = {
      scopes,
      projectCount: data.projects.length,
      expenseCount: expenses.length,
      expensesTotal: expenses.reduce((sum, item) => sum + item.montant, 0),
      hrefDashboard: can(menus, 'project.dashboard') ? '/project/dashboard' : '',
      hrefProjects: can(menus, 'project.projects') ? '/project/projects' : '',
      hrefExpenses: can(menus, 'project.expenses') ? '/project/expenses-details' : '',
    };

    kpis.push({
      label: 'Projets',
      value: data.projects.length,
      meta: `${scopes[0]?.enCours ?? 0} en cours`,
      color: 'cyan',
    });
  }

  if (can(menus, 'travel.historique')) {
    const travel = await readTravelHistory();
    result.travel = {
      dashboard: travel.dashboard,
      hrefHistorique: '/documents-voyage/historique',
      hrefEtablir: can(menus, 'travel.etablir') ? '/documents-voyage/etablir' : '',
    };
    kpis.push({
      label: 'Voyages',
      value: travel.dashboard.totalTrips,
      meta: `${travel.dashboard.tripsThisMonth} ce mois`,
      color: 'violet',
    });
  } else if (can(menus, 'travel.etablir')) {
    placeholders.push({
      label: 'Cash request',
      description: 'Établir une cash request / dossier de mission',
      href: '/documents-voyage/etablir',
    });
  }

  if (can(menus, 'travel.attestation')) {
    placeholders.push({
      label: 'Attestation de service',
      description: 'Générer et consulter les attestations',
      href: '/documents-voyage/attestation-services',
    });
  }

  if (can(menus, 'travel.payment-voucher')) {
    placeholders.push({
      label: 'Payment voucher',
      description: 'Module à venir',
      href: '/documents-voyage/payment-voucher',
    });
  }

  if (can(menus, 'protocol.visa-travail')) {
    placeholders.push({
      label: 'Visa de travail',
      description: 'Protocol',
      href: '/protocol/visa-travail',
    });
  }

  if (
    can(menus, 'settings.departements') ||
    can(menus, 'settings.centres') ||
    can(menus, 'settings.utilisateurs') ||
    can(menus, 'settings.permissions')
  ) {
    const [departments, costCenters, users] = await Promise.all([
      can(menus, 'settings.departements') ? listDepartments() : Promise.resolve([]),
      can(menus, 'settings.centres') ? listCostCenters() : Promise.resolve([]),
      can(menus, 'settings.utilisateurs') || can(menus, 'settings.permissions')
        ? listUsers()
        : Promise.resolve([]),
    ]);

    result.settings = {
      departments: departments.length,
      costCenters: costCenters.length,
      users: users.length,
      activeUsers: users.filter((user) => user.active).length,
      hrefDepartements: can(menus, 'settings.departements') ? '/parametres/departements' : '',
      hrefCentres: can(menus, 'settings.centres') ? '/parametres/centres-de-cout' : '',
      hrefUtilisateurs: can(menus, 'settings.utilisateurs') ? '/parametres/utilisateurs' : '',
      hrefPermissions: can(menus, 'settings.permissions') ? '/parametres/permissions' : '',
    };

    if (can(menus, 'settings.utilisateurs')) {
      kpis.push({
        label: 'Utilisateurs',
        value: users.length,
        meta: `${users.filter((user) => user.active).length} actifs`,
        color: 'slate',
      });
    }
  }

  if (canViewTimesheetModule(menus)) {
    placeholders.push({
      label: 'Heures supplémentaires',
      description: 'Import Excel et traitement selon la politique PPCB',
      href: '/heures-supplementaires',
    });
  }

  if (
    can(menus, 'factures.fournisseur.liste')
    || can(menus, 'factures.fournisseur.factures')
    || can(menus, 'factures.fournisseur.soa')
    || can(menus, 'factures.fournisseur.fournisseurs')
  ) {
    placeholders.push({
      label: 'Factures fournisseur',
      description: 'Liste fournisseurs et suivi des factures',
      href: can(menus, 'factures.fournisseur.soa')
        ? '/factures-fournisseurs/soa'
        : can(menus, 'factures.fournisseur.fournisseurs')
        ? '/factures-fournisseurs/fournisseurs'
        : can(menus, 'factures.fournisseur.liste')
          ? '/factures-fournisseurs/liste'
          : '/factures-fournisseurs/factures',
    });
  }

  if (can(menus, 'sante')) {
    placeholders.push({
      label: 'Santé',
      description: 'Module santé — suivi médical et visites',
      href: '/sante',
    });
  }

  if (can(menus, 'charroi') || can(menus, 'charroi.vehicules') || can(menus, 'charroi.achats')) {
    placeholders.push({
      label: 'Charroi automobile',
      description: 'Base véhicules et nouveaux achats',
      href: '/charroi-automobile/vehicules',
    });
  }

  if (
    can(menus, 'village.maisons')
    || can(menus, 'village.dependants-dashboard')
    || can(menus, 'village.dependants-liste')
  ) {
    placeholders.push({
      label: 'Maisons',
      description: 'Gestion des maisons du village',
      href: '/village/maisons',
    });
  }

  if (can(menus, 'village.guest-house')) {
    placeholders.push({
      label: 'Guest house',
      description: 'Gestion Guest house (Batiment #1/#2 + Kimpese)',
      href: '/village/guest-house',
    });
  }

  return result;
}
