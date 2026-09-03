import 'server-only';

import { listUsers } from './auth-store';
import type { MenuPermission } from './auth-types';
import { listVehicules } from './charroi-store';
import {
  CHARROI_EXPIRY_SOON_DAYS,
  getVehiculeDocFin,
  type CharroiDocKind,
} from './charroi-types';
import { readDashboard } from './dashboard-store';
import { calcDocumentCompletion, getDepartments } from './documents';
import { roundRate } from './format-rate';
import { readEmployees } from './employees-json-store';
import { readDependantsData } from './dependants-json-store';
import type {
  HomeBarItem,
  HomeChartSlice,
  HomeCharts,
  HomeDashboardData,
  HomeKpi,
  HomeModuleLink,
  HomeProjectScopeSummary,
} from './home-dashboard-types';
import { getFacturesSuiviBundle, listFournisseurs } from './factures-fournisseurs/store';
import { getGuestHouseBundle } from './guest-house-store';
import { canPerformAction } from './permission-check';
import { canViewTimesheetModule } from './timesheet-permissions';
import { filterValidExpenses, getBudgetRow } from './projects';
import { readProjects } from './projects-store';
import { listCostCenters, listDepartments } from './settings-store';
import { readTravelHistory } from './travel-history-store';
import { readVillageCatalog } from './village-store';
import { daysUntil } from './work-visa-validity';

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

function emptyCharts(): HomeCharts {
  return {
    employeesByDepartment: [],
    documentsCompliance: [],
    dependantsBreakdown: [],
    projectsBudget: [],
    travelByDepartment: [],
    charroiStatus: [],
    villageHouseTypes: [],
  };
}

function topCountSlices(
  counts: Map<string, number>,
  limit = 8,
  colors?: string[],
): HomeChartSlice[] {
  const palette = colors || [
    '#22c55e', '#06b6d4', '#a855f7', '#f97316', '#e30613', '#3b82f6', '#eab308', '#94a3b8',
  ];
  return [...counts.entries()]
    .filter(([label, value]) => label && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value], index) => ({
      label,
      value,
      color: palette[index % palette.length],
    }));
}

function topCountBars(
  counts: Map<string, number>,
  limit = 8,
  colors?: string[],
): HomeBarItem[] {
  const palette = colors || [
    '#e30613', '#06b6d4', '#a855f7', '#22c55e', '#f97316', '#3b82f6', '#eab308', '#94a3b8',
  ];
  return [...counts.entries()]
    .filter(([label, value]) => label && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value], index) => ({
      label,
      value,
      color: palette[index % palette.length],
    }));
}

function parseRate(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  const n = Number(String(value ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function countDocSoon(
  vehicles: Awaited<ReturnType<typeof listVehicules>>,
  kind: CharroiDocKind,
): number {
  let n = 0;
  for (const v of vehicles) {
    const days = daysUntil(getVehiculeDocFin(v, kind));
    if (days != null && days >= 0 && days <= CHARROI_EXPIRY_SOON_DAYS) n += 1;
  }
  return n;
}

export async function buildHomeDashboard(menus: MenuPermission[]): Promise<HomeDashboardData> {
  const kpis: HomeKpi[] = [];
  const placeholders: HomeDashboardData['placeholders'] = [];
  const charts = emptyCharts();
  const result: HomeDashboardData = { kpis, charts, placeholders };

  if (can(menus, 'employes.liste')) {
    const employees = await readEmployees();
    const departments = getDepartments(employees);
    let completionSum = 0;
    let needsAttention = 0;
    let active = 0;
    let inactive = 0;
    const byDept = new Map<string, number>();

    for (const employee of employees) {
      const { pct } = calcDocumentCompletion(employee);
      completionSum += pct;
      if (pct < 50) needsAttention += 1;
      const statut = String(employee.statut || '').toLowerCase();
      if (!statut || statut === 'active' || statut === 'actif') active += 1;
      else inactive += 1;
      const dept = String(employee.departement || '—').trim() || '—';
      byDept.set(dept, (byDept.get(dept) || 0) + 1);
    }

    const avgCompletion =
      employees.length > 0 ? roundRate(completionSum / employees.length) : 0;
    const topDepartments = topCountBars(byDept, 8);

    result.employes = {
      total: employees.length,
      departments: departments.length,
      avgCompletion,
      needsAttention,
      active,
      inactive,
      topDepartments,
      href: '/employes',
    };
    charts.employeesByDepartment = topDepartments;
    kpis.push({
      label: 'Employés',
      value: employees.length,
      meta: `${active} actifs · ${departments.length} départements`,
      color: 'red',
      href: '/employes',
    });
    if (needsAttention > 0) {
      kpis.push({
        label: 'Dossiers à risque',
        value: needsAttention,
        meta: 'Complétude < 50%',
        color: 'orange',
        href: '/employes',
      });
    }
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
    charts.dependantsBreakdown = [
      { label: 'Employés', value: result.dependants.employes, color: '#3b82f6' },
      { label: 'Conjoints', value: result.dependants.conjoints, color: '#a855f7' },
      { label: 'Enfants', value: result.dependants.enfants, color: '#22c55e' },
    ].filter((s) => s.value > 0);
    kpis.push({
      label: 'Bénéficiaires',
      value: result.dependants.totalBeneficiaires,
      meta: `${result.dependants.enfants} enfants · ${result.dependants.conjoints} conjoints`,
      color: 'green',
      href: '/employes/dependants',
    });
  }

  if (can(menus, 'employes.check-documents')) {
    const dashboard = await readDashboard();
    const conformePct = parseRate(dashboard.dashboard.conformeRate);
    const nonConformePct = parseRate(dashboard.dashboard.noConformeRate)
      || Math.max(0, 100 - conformePct);

    result.documents = {
      totalEmployee: Number(dashboard.dashboard.totalEmployee) || 0,
      conformeRate: dashboard.dashboard.conformeRate,
      noConformeRate: dashboard.dashboard.noConformeRate,
      conformePct,
      nonConformePct,
      departments: dashboard.dashboard.departments.slice(0, 8).map((item) => ({
        name: item.name,
        rate: item.rate,
      })),
      href: '/check-documents',
    };
    charts.documentsCompliance = [
      { label: 'Conforme', value: conformePct, color: '#22c55e' },
      { label: 'Non conforme', value: nonConformePct, color: '#e30613' },
    ];
    kpis.push({
      label: 'Conformité docs',
      value: dashboard.dashboard.conformeRate,
      meta: `${result.documents.totalEmployee} employés suivis`,
      color: 'orange',
      href: '/check-documents',
    });
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
    charts.projectsBudget = scopes.map((scope) => ({
      label: scope.label,
      value: scope.prevu,
      secondary: scope.depense,
    }));
    kpis.push({
      label: 'Projets',
      value: data.projects.length,
      meta: `${scopes[0]?.enCours ?? 0} en cours`,
      color: 'cyan',
      href: result.projects.hrefDashboard || result.projects.hrefProjects || undefined,
    });
  }

  if (can(menus, 'travel.historique')) {
    const travel = await readTravelHistory();
    result.travel = {
      dashboard: travel.dashboard,
      hrefHistorique: '/documents-voyage/historique',
      hrefEtablir: can(menus, 'travel.etablir') ? '/documents-voyage/etablir' : '',
    };
    charts.travelByDepartment = travel.dashboard.departments.slice(0, 8).map((item, index) => ({
      label: item.department,
      value: item.count,
      secondary: Math.round(item.budget),
      color: ['#a855f7', '#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#fb7185', '#38bdf8', '#fbbf24'][
        index % 8
      ],
    }));
    kpis.push({
      label: 'Voyages',
      value: travel.dashboard.totalTrips,
      meta: `${travel.dashboard.tripsThisMonth} ce mois`,
      color: 'violet',
      href: '/documents-voyage/historique',
    });
  }

  if (can(menus, 'travel.etablir')) {
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

  if (can(menus, 'documents.exit')) {
    placeholders.push({
      label: 'Exit forms',
      description: 'Documents de sortie',
      href: '/documents/exit',
    });
  }

  if (can(menus, 'documents.appraisal')) {
    placeholders.push({
      label: 'Interim appraisal',
      description: 'Évaluation intérimaire',
      href: '/documents/interim-appraisal',
    });
  }

  if (can(menus, 'documents.composition-familiale')) {
    placeholders.push({
      label: 'Composition familiale',
      description: 'Déclaration CNSS F6',
      href: '/documents/composition-familiale',
    });
  }

  if (can(menus, 'documents.mouvement-travailleur')) {
    placeholders.push({
      label: 'Mouvement de travailleur',
      description: 'Déclaration ONEM DMT',
      href: '/documents/mouvement-travailleur',
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
        href: '/parametres/utilisateurs',
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
    const links: HomeModuleLink[] = [];
    if (can(menus, 'factures.fournisseur.factures') || can(menus, 'factures.fournisseur.liste')) {
      links.push({
        label: 'Factures',
        href: '/factures-fournisseurs/factures',
        description: 'Suivi PR / PO / paiement',
      });
    }
    if (can(menus, 'factures.fournisseur.soa')) {
      links.push({
        label: 'SOA',
        href: '/factures-fournisseurs/soa',
        description: 'Statement of account',
      });
    }
    if (can(menus, 'factures.fournisseur.fournisseurs')) {
      links.push({
        label: 'Fournisseurs',
        href: '/factures-fournisseurs/fournisseurs',
        description: 'Répertoire fournisseurs',
      });
    }

    let total = 0;
    let enCours = 0;
    let paid = 0;
    let enRetard = 0;
    let fournisseursCount = 0;
    try {
      const [bundle, fournisseurs] = await Promise.all([
        getFacturesSuiviBundle(),
        can(menus, 'factures.fournisseur.fournisseurs')
          ? listFournisseurs()
          : Promise.resolve([]),
      ]);
      total = bundle.dashboard.total;
      enCours = bundle.dashboard.enCours;
      paid = bundle.dashboard.paid;
      enRetard = bundle.dashboard.enRetard;
      fournisseursCount = fournisseurs.length;
    } catch {
      // partial section still useful
    }

    result.factures = {
      total,
      enCours,
      paid,
      enRetard,
      fournisseurs: fournisseursCount,
      hrefFactures: links.find((l) => l.href.includes('/factures'))?.href || '',
      hrefSoa: links.find((l) => l.href.includes('/soa'))?.href || '',
      hrefFournisseurs: links.find((l) => l.href.includes('/fournisseurs'))?.href || '',
      links,
    };
  }

  const protocolLinks: HomeModuleLink[] = [];
  if (can(menus, 'protocol.visa-travail')) {
    protocolLinks.push({
      label: 'Visa de travail',
      href: '/protocol/visa-travail',
      description: 'Demandes et suivi',
    });
  }
  if (can(menus, 'protocol.visa-volant')) {
    protocolLinks.push({
      label: 'Visa volant',
      href: '/protocol/visa-volant',
      description: 'Visas volants',
    });
  }
  if (can(menus, 'protocol.visa-voyage')) {
    protocolLinks.push({
      label: 'Visa de voyage',
      href: '/protocol/visa-voyage',
      description: 'Visas de voyage',
    });
  }
  if (can(menus, 'protocol.billets')) {
    protocolLinks.push({
      label: 'Gestion des billets',
      href: '/protocol/billets',
      description: 'Billets d’avion',
    });
  }
  if (protocolLinks.length) {
    result.protocol = { links: protocolLinks };
  }

  if (can(menus, 'sante')) {
    placeholders.push({
      label: 'Santé',
      description: 'Module santé — suivi médical et visites',
      href: '/sante',
    });
  }

  if (can(menus, 'charroi') || can(menus, 'charroi.vehicules') || can(menus, 'charroi.achats')) {
    if (can(menus, 'charroi') || can(menus, 'charroi.vehicules')) {
      try {
        const vehicles = await listVehicules();
        const assuranceSoon = countDocSoon(vehicles, 'assurance');
        const vignetteSoon = countDocSoon(vehicles, 'vignette');
        const controleSoon = countDocSoon(vehicles, 'controleTechnique');
        const alertes = vehicles.filter((v) => {
          for (const kind of ['assurance', 'vignette', 'controleTechnique'] as CharroiDocKind[]) {
            const days = daysUntil(getVehiculeDocFin(v, kind));
            if (days != null && days >= 0 && days <= CHARROI_EXPIRY_SOON_DAYS) return true;
          }
          return false;
        }).length;

        result.charroi = {
          total: vehicles.length,
          alertes,
          assuranceSoon,
          vignetteSoon,
          controleSoon,
          href: '/charroi-automobile/vehicules',
        };
        charts.charroiStatus = [
          { label: 'Assurance ≤30j', value: assuranceSoon, color: '#e30613' },
          { label: 'Vignette ≤30j', value: vignetteSoon, color: '#f97316' },
          { label: 'Contr. tech ≤30j', value: controleSoon, color: '#eab308' },
          {
            label: 'OK',
            value: Math.max(0, vehicles.length - alertes),
            color: '#22c55e',
          },
        ].filter((s) => s.value > 0);
        kpis.push({
          label: 'Véhicules',
          value: vehicles.length,
          meta: alertes > 0 ? `${alertes} alerte${alertes > 1 ? 's' : ''} docs` : 'Documents à jour',
          color: alertes > 0 ? 'orange' : 'green',
          href: '/charroi-automobile/vehicules',
        });
      } catch {
        placeholders.push({
          label: 'Charroi automobile',
          description: 'Base véhicules et nouveaux achats',
          href: '/charroi-automobile/vehicules',
        });
      }
    } else {
      placeholders.push({
        label: 'Charroi automobile',
        description: 'Base véhicules et nouveaux achats',
        href: '/charroi-automobile/vehicules',
      });
    }
  }

  {
    const canMaisons =
      can(menus, 'village.maisons')
      || can(menus, 'village.dependants-dashboard')
      || can(menus, 'village.dependants-liste');
    const canGuest = can(menus, 'village.guest-house');

    if (canMaisons || canGuest) {
      let totalMaisons = 0;
      let byType: HomeChartSlice[] = [];
      if (canMaisons) {
        try {
          const catalog = await readVillageCatalog();
          totalMaisons = catalog.maisons.length;
          const counts = new Map<string, number>();
          for (const maison of catalog.maisons) {
            const label = (maison.typeMaison || maison.taille || 'Non renseigné').trim() || 'Non renseigné';
            counts.set(label, (counts.get(label) ?? 0) + 1);
          }
          byType = topCountSlices(counts, 12, [
            '#22c55e', '#06b6d4', '#a855f7', '#f97316', '#eab308', '#3b82f6', '#e30613', '#94a3b8',
          ]);
          charts.villageHouseTypes = byType.slice(0, 8);
        } catch {
          byType = [];
        }
      }

      let guestHouse: NonNullable<HomeDashboardData['village']>['guestHouse'];
      if (canGuest) {
        try {
          const gh = await getGuestHouseBundle();
          guestHouse = {
            totalRooms: gh.dashboard.totalRooms,
            onsiteRooms: gh.dashboard.onsiteRooms,
            occupied: gh.dashboard.occupied,
            empty: gh.dashboard.empty,
            pendingReservations: gh.dashboard.pendingReservations,
            kimpeseHotels: gh.dashboard.kimpeseHotels,
            occupancyRate: gh.dashboard.occupancyRate,
            href: '/village/guest-house',
          };
        } catch {
          guestHouse = {
            totalRooms: 0,
            onsiteRooms: 0,
            occupied: 0,
            empty: 0,
            pendingReservations: 0,
            kimpeseHotels: 0,
            occupancyRate: 0,
            href: '/village/guest-house',
          };
        }
      }

      if (canMaisons || guestHouse) {
        result.village = {
          totalMaisons,
          byType,
          hrefMaisons: canMaisons ? '/village/maisons' : '',
          guestHouse,
        };
      }
    }
  }

  if (can(menus, 'documents.rrf')) {
    placeholders.push({
      label: 'RRF',
      description: 'Recruitment Requisition Form',
      href: '/documents/rrf',
    });
  }

  if (can(menus, 'documents.entetes')) {
    placeholders.push({
      label: 'Entête',
      description: 'Papiers à en-tête Manuco / Quarryco',
      href: '/documents/entetes',
    });
  }

  return result;
}
