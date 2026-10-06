import { NextResponse } from 'next/server';
import { listContractants } from '@/lib/contractants-store';
import { readDependantsData } from '@/lib/dependants-json-store';
import { readEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { createSanteVisit, listSanteVisits } from '@/lib/sante-store';
import type { SanteVisitInput } from '@/lib/sante-types';
import {
  buildSanteDashboard,
  isFamilyPatientType,
  matchDependantForSante,
  matchEmployeeForSante,
  normalizeSanteType,
  santeUniqueValues,
} from '@/lib/sante-utils';
import { getAuditActor, withAudit } from '@/lib/with-audit';

const VIEW = [
  { menuId: 'sante.donnees', action: 'view' as const },
  { menuId: 'sante.dashboard', action: 'view' as const },
  { menuId: 'sante', action: 'view' as const },
];

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const [visits, employees, dependantsData, contractants] = await Promise.all([
      listSanteVisits(),
      readEmployees(),
      readDependantsData().catch(() => ({ dependants: [] })),
      listContractants().catch(() => []),
    ]);
    const seen = new Set<string>();
    const isActiveContractant = (dateSortie: string) => {
      const raw = dateSortie.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
      const date = new Date(`${raw}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
    };
    const contractantEmployees = contractants.flatMap((company) => company.employees
      .filter((item) => item.nom.trim() && isActiveContractant(item.dateSortie))
      .map((item) => {
        const matricule = item.matriculePpc.trim() || item.id;
        const key = seen.has(matricule) ? `${company.id}-${item.id}` : matricule;
        seen.add(key);
        const sexe = item.sexe === 'F' || item.sexe === 'M' ? item.sexe : '';
        return {
          id: item.id,
          nom: item.nom.trim(),
          matricule: key,
          sexe,
          contractantId: company.id,
          contractantNom: company.denomination,
        };
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const dashboard = buildSanteDashboard(visits);
    return NextResponse.json({
      visits,
      dashboard,
      years: [...new Set(visits.map((v) => v.year))].sort((a, b) => b - a),
      types: santeUniqueValues(visits, 'typeMalade'),
      pathologies: santeUniqueValues(visits, 'pathologie'),
      traitements: santeUniqueValues(visits, 'traitement'),
      references: santeUniqueValues(visits, 'reference'),
      employees: employees.map((e) => ({
        matricule: e.matricule,
        nom: e.nom,
        departement: e.departement,
        gender: e.gender,
        age: e.age,
        dateOfBirth: e.dateOfBirth,
      })),
      dependants: dependantsData.dependants.map((d) => ({
        id: d.id,
        nom: d.nom,
        sexe: d.sexe,
        statut: d.statut,
        age: d.age,
        matricule: d.matricule,
        employeNom: d.employeNom,
      })),
      contractants: contractants
        .map((company) => ({ id: company.id, denomination: company.denomination }))
        .sort((a, b) => a.denomination.localeCompare(b.denomination, 'fr')),
      contractantEmployees,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.donnees', action: 'create' },
    { menuId: 'sante', action: 'create' },
  ]);
  if (denied) return denied;
  try {
    const body = (await request.json()) as SanteVisitInput;
    const actor = await getAuditActor();
    const type = normalizeSanteType(body.typeMalade || '');
    let input = { ...body };
    if (!input.employeeMatricule && type === 'AGENT' && input.nom) {
      const employees = await readEmployees();
      const emp = matchEmployeeForSante(employees, input.nom, input.postnom || '');
      if (emp) {
        input.employeeMatricule = emp.matricule;
        input.employeeNom = emp.nom;
      }
    }
    if (!input.dependantId && isFamilyPatientType(type)) {
      const dependantsData = await readDependantsData().catch(() => ({ dependants: [] }));
      const dep = matchDependantForSante(
        dependantsData.dependants,
        input.nom,
        input.postnom || '',
        input.typeMalade,
      );
      if (dep) {
        input.dependantId = dep.id;
        if (!input.employeeMatricule) {
          input.employeeMatricule = dep.matricule;
          input.employeeNom = dep.employeNom;
        }
      }
    }
    const saved = await withAudit(
      {
        module: 'sante',
        action: 'create',
        entityType: 'sante.visit',
        entityId: (result) => (result as { id?: string })?.id,
        summary: `Cas santé — ${input.nom} ${input.postnom || ''} · ${input.pathologie}`.trim(),
        path: '/api/sante',
        method: 'POST',
        defer: true,
      },
      () => createSanteVisit(input, actor?.userEmail || actor?.userName),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
