import 'server-only';

import { listUsers } from './auth-store';
import type { MenuPermission } from './auth-types';
import { listVehicules, listVoyages } from './charroi-store';
import {
  CHARROI_EXPIRY_SOON_DAYS,
  getVehiculeDocFin,
  type CharroiDocKind,
} from './charroi-types';
import { buildDashboardFromEmployees, calcDocumentCompletion } from './documents';
import { roundRate } from './format-rate';
import { endOfYearMonth, exitedInYearMonth } from './employee-columns';
import { resolveExcoDepartment } from './exco-department-map';
import { readEmployeesBundle } from './employees-json-store';
import { employeesPresentOnAsOf, isFemaleGender, isMaleGender } from './employees-hr-dashboard';
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
import { listSanteVisits } from './sante-store';
import { buildSanteDashboard } from './sante-utils';
import { listWeeklyOvertimeWeeks } from './overtimes-json-store';
import { buildMouvementsDashboard, listMouvements } from './mouvements-store';
import { getRecrutementBundle } from './recrutement-store';
import { getPostesBundle } from './postes-store';
import { getTrainingDashboard } from './training-store';
import { listWorkVisaDossiers } from './work-visa-store';
import { listProtocolVoyages } from './protocol-voyage-store';
import { getCongeBundle } from './conge-store';
import { buildCongeDashboard } from './conge-dashboard';
import { listPpcDisciplineCases } from './ppc-discipline-store';

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
    santeByType: [],
    overtimeByDepartment: [],
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

async function loadCurrentHeadcount() {
  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const asOf = endOfYearMonth(periodYear, periodMonth);
  const { employees, exits } = await readEmployeesBundle();
  const present = employeesPresentOnAsOf(employees, exits, asOf);
  const exitsThisMonth = exits.filter((employee) => exitedInYearMonth(employee, periodYear, periodMonth)).length;
  return { periodYear, periodMonth, asOf, present, exitsThisMonth };
}

export async function buildHomeDashboard(menus: MenuPermission[]): Promise<HomeDashboardData> {
  const kpis: HomeKpi[] = [];
  const placeholders: HomeDashboardData['placeholders'] = [];
  const charts = emptyCharts();
  const result: HomeDashboardData = { kpis, charts, placeholders };
  const wantsHeadcount = can(menus, 'employes.liste') || can(menus, 'employes.check-documents');
  const headcount = wantsHeadcount ? await loadCurrentHeadcount() : null;

  if (can(menus, 'employes.liste') && headcount) {
    const { periodYear, periodMonth, asOf, present, exitsThisMonth } = headcount;
    const departments = new Set<string>();
    let completionSum = 0;
    let needsAttention = 0;
    let men = 0;
    let women = 0;
    const byDept = new Map<string, number>();

    for (const employee of present) {
      const { pct } = calcDocumentCompletion(employee);
      completionSum += pct;
      if (pct < 50) needsAttention += 1;
      if (isMaleGender(employee.gender)) men += 1;
      else if (isFemaleGender(employee.gender)) women += 1;
      const resolved = resolveExcoDepartment(employee.departement || '');
      const dept = (resolved.department || String(employee.departement || '').trim() || '—');
      if (dept !== '—') departments.add(dept);
      byDept.set(dept, (byDept.get(dept) || 0) + 1);
    }

    const avgCompletion = present.length > 0 ? roundRate(completionSum / present.length) : 0;
    const topDepartments = topCountBars(byDept, 6);
    const monthLabel = asOf.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    result.employes = {
      total: present.length,
      departments: departments.size,
      avgCompletion,
      needsAttention,
      active: present.length,
      inactive: exitsThisMonth,
      men,
      women,
      periodYear,
      periodMonth,
      topDepartments,
      href: '/employes',
    };
    charts.employeesByDepartment = topDepartments;
    kpis.push({
      label: 'Employés',
      value: present.length,
      meta: `En poste · ${monthLabel}`,
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

  if (can(menus, 'employes.check-documents') && headcount) {
    const dashboard = buildDashboardFromEmployees(headcount.present);
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
      hrefProjects: can(menus, 'project.projects') ? '/project/csr' : '',
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

  if (can(menus, 'documents.reponse-demission')) {
    placeholders.push({
      label: 'Réponse démission',
      description: 'Lettre de réponse à une démission',
      href: '/documents/reponse-demission',
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
    try {
      const now = new Date();
      const periodYear = now.getFullYear();
      const periodMonth = now.getMonth() + 1;
      const weeks = await listWeeklyOvertimeWeeks(periodYear, periodMonth);
      const agents = new Set<string>();
      const departments = new Set<string>();
      const byDept = new Map<string, number>();
      let hours = 0;
      for (const week of weeks) {
        const dept = week.department?.trim() || '—';
        if (dept !== '—') departments.add(dept);
        for (const entry of Object.values(week.entries || {})) {
          const total = (entry.ot13 || 0) + (entry.ot16 || 0) + (entry.ot2 || 0);
          if (total <= 0) continue;
          hours += total;
          if (entry.matricule) agents.add(entry.matricule);
          byDept.set(dept, (byDept.get(dept) || 0) + total);
        }
      }
      result.overtime = {
        periodYear,
        periodMonth,
        agents: agents.size,
        hours: Math.round(hours * 10) / 10,
        weeks: weeks.length,
        departments: departments.size,
        href: '/heures-supplementaires',
      };
      charts.overtimeByDepartment = [...byDept.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value], index) => ({
          label,
          value: Math.round(value * 10) / 10,
          color: ['#e30613', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1'][index % 6],
        }));
    } catch {
      placeholders.push({
        label: 'Heures supplémentaires',
        description: 'Import Excel et traitement selon la politique PPCB',
        href: '/heures-supplementaires',
      });
    }
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
  if (can(menus, 'protocol.voyages')) {
    protocolLinks.push({
      label: 'Gestion de voyage',
      href: '/protocol/voyages',
      description: 'Suivi des coûts de voyage',
    });
  }
  if (protocolLinks.length || can(menus, 'protocol.visa-travail') || can(menus, 'protocol.voyages')) {
    const protocol: NonNullable<HomeDashboardData['protocol']> = { links: protocolLinks };
    if (can(menus, 'protocol.visa-travail')) {
      try {
        const visas = await listWorkVisaDossiers();
        protocol.workVisas = {
          total: visas.kpis.total,
          valid: visas.kpis.visasValides,
          expired: visas.kpis.visasExpires,
          alerts: visas.kpis.alerts4m,
          href: '/protocol/visa-travail',
        };
      } catch {
        // le lien reste disponible
      }
    }
    if (can(menus, 'protocol.voyages')) {
      try {
        const voyages = await listProtocolVoyages();
        protocol.voyages = {
          total: voyages.length,
          cost: Math.round(voyages.reduce((sum, item) => sum + (item.coutTotal || 0), 0) * 100) / 100,
          href: '/protocol/voyages',
        };
      } catch {
        // le lien reste disponible
      }
    }
    if (protocol.links.length || protocol.workVisas || protocol.voyages) {
      result.protocol = protocol;
    }
  }

  if (can(menus, 'sante') || can(menus, 'sante.dashboard') || can(menus, 'sante.donnees')) {
    const href = can(menus, 'sante.dashboard') || can(menus, 'sante') ? '/sante/dashboard' : '/sante/donnees';
    try {
      const now = new Date();
      const periodYear = now.getFullYear();
      const periodMonth = now.getMonth() + 1;
      const visits = await listSanteVisits();
      const monthVisits = visits.filter((visit) => visit.year === periodYear && visit.month === periodMonth);
      const dash = buildSanteDashboard(monthVisits);
      const agents = dash.kpis.find((item) => item.label === 'Agents')?.value ?? 0;
      const children = dash.kpis.find((item) => item.label === 'Enfants')?.value ?? 0;
      result.sante = {
        periodYear,
        periodMonth,
        cases: dash.total,
        agents,
        children,
        referred: dash.references,
        href,
      };
      charts.santeByType = dash.byType.slice(0, 6).map((item, index) => ({
        label: item.label,
        value: item.value,
        color: ['#e30613', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#64748b'][index % 6],
      }));
    } catch {
      placeholders.push({
        label: 'Santé',
        description: 'Fiche journalière des pathologies',
        href,
      });
    }
  }

  if (
    can(menus, 'charroi')
    || can(menus, 'charroi.vehicules')
    || can(menus, 'charroi.achats')
    || can(menus, 'charroi.voyages')
  ) {
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
          hasFleet: true,
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
      if (can(menus, 'charroi.voyages')) {
        result.charroi = {
          total: 0,
          alertes: 0,
          assuranceSoon: 0,
          vignetteSoon: 0,
          controleSoon: 0,
          href: '/charroi-automobile/voyages',
          hasFleet: false,
        };
      }
      if (can(menus, 'charroi.achats')) {
        placeholders.push({
          label: 'Charroi automobile',
          description: 'Nouveaux achats',
          href: '/charroi-automobile/achats',
        });
      }
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

  if (can(menus, 'charroi.voyages') || can(menus, 'charroi')) {
    try {
      const voyages = await listVoyages();
      const pending = voyages.filter((item) => item.status === 'demande' || item.status === 'pending').length;
      const done = voyages.filter((item) => item.status === 'effectue').length;
      const current = result.charroi ?? {
        total: 0,
        alertes: 0,
        assuranceSoon: 0,
        vignetteSoon: 0,
        controleSoon: 0,
        href: '/charroi-automobile/voyages',
        hasFleet: false,
      };
      result.charroi = {
        ...current,
        voyages: {
          total: voyages.length,
          pending,
          done,
          href: '/charroi-automobile/voyages',
        },
      };
    } catch {
      // la flotte reste affichée sans le décompte des voyages
    }
  }

  if (can(menus, 'employes.conge')) {
    try {
      const bundle = await getCongeBundle();
      const today = new Date().toISOString().slice(0, 10);
      const dash = buildCongeDashboard(bundle, today);
      const valueOf = (key: string) => dash.kpis.find((item) => item.key === key)?.value ?? 0;
      result.conge = {
        effectif: valueOf('effectif'),
        onLeave: valueOf('onLeave'),
        onLeaveMonth: valueOf('onLeaveMonth'),
        href: '/employes/conge',
      };
    } catch {
      // module masqué si le planning est illisible
    }
  }

  if (can(menus, 'employes.discipline')) {
    try {
      const cases = await listPpcDisciplineCases();
      const open = cases.filter((item) => item.statut !== 'Clos').length;
      result.discipline = {
        open,
        closed: cases.length - open,
        total: cases.length,
        href: '/employes/discipline',
      };
    } catch {
      // module masqué si les dossiers sont illisibles
    }
  }

  if (can(menus, 'employes.mouvements')) {
    try {
      const dash = buildMouvementsDashboard(await listMouvements());
      result.mouvements = {
        total: dash.total,
        thisMonth: dash.thisMonth,
        thisYear: dash.thisYear,
        promotions: dash.promotions,
        href: '/employes/mouvements',
      };
    } catch {
      // carte lien conservée côté page
    }
  }

  if (can(menus, 'employes.recrutement')) {
    try {
      const bundle = await getRecrutementBundle();
      result.recrutement = {
        total: bundle.dashboard.total,
        ongoing: bundle.dashboard.ongoing + bundle.dashboard.started,
        done: bundle.dashboard.done,
        notStarted: bundle.dashboard.notStarted,
        href: '/employes/recrutement',
      };
    } catch {
      // carte lien conservée côté page
    }
  }

  if (can(menus, 'employes.classification') || can(menus, 'employes.postes')) {
    try {
      const bundle = await getPostesBundle();
      result.postes = {
        occupied: bundle.totalOccupied,
        vacant: bundle.totalVacantSlots,
        titles: bundle.titles.length,
        href: '/employes/classification',
      };
    } catch {
      // carte lien conservée côté page
    }
  }

  if (can(menus, 'training')) {
    try {
      const dash = await getTrainingDashboard();
      result.training = {
        topics: dash.topicsCount,
        spend: dash.actualSpend,
        href: '/training',
      };
    } catch {
      // carte « bientôt » conservée côté page
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
