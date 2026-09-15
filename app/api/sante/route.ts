import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-json-store';
import { readEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { createSanteVisit, listSanteVisits } from '@/lib/sante-store';
import type { SanteVisitInput } from '@/lib/sante-types';
import {
  buildSanteDashboard,
  matchDependantForSante,
  matchEmployeeForSante,
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
    const [visits, employees, dependantsData] = await Promise.all([
      listSanteVisits(),
      readEmployees(),
      readDependantsData().catch(() => ({ dependants: [] })),
    ]);
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
    const [employees, dependantsData] = await Promise.all([
      readEmployees(),
      readDependantsData().catch(() => ({ dependants: [] })),
    ]);
    let input = { ...body };
    if (!input.employeeMatricule && input.nom) {
      const emp = matchEmployeeForSante(employees, input.nom, input.postnom || '');
      if (emp && !/enfant|epouse|conjoint/i.test(input.typeMalade || '')) {
        input.employeeMatricule = emp.matricule;
        input.employeeNom = emp.nom;
      }
    }
    if (!input.dependantId && /enfant|epouse|conjoint/i.test(input.typeMalade || '')) {
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
