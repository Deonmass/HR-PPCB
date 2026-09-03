import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { readEmployeesBundle, upsertEmployee } from '@/lib/employees-json-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { Employee } from '@/lib/types';
import { emptyEmployeeHrProfile } from '@/lib/types';
import { withAudit } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'employes.dependants', action: 'view' },
    { menuId: 'employes.check-documents', action: 'view' },
    { menuId: 'employes.heures', action: 'view' },
    { menuId: 'employes.heures.dept', action: 'view' },
    { menuId: 'employes.heures.all', action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: 'travel.mission.kinshasa', action: 'view' },
    { menuId: 'travel.mission.zamba', action: 'view' },
    { menuId: 'travel.mission.zamba-consultant', action: 'view' },
    { menuId: 'travel.mission.lubudi', action: 'view' },
    { menuId: 'travel.attestation', action: 'view' },
    { menuId: 'documents.composition-familiale', action: 'view' },
    { menuId: 'documents.mouvement-travailleur', action: 'view' },
    { menuId: 'settings.utilisateurs', action: 'view' },
    { menuId: 'village.dependants-dashboard', action: 'view' },
    { menuId: 'village.dependants-liste', action: 'view' },
    { menuId: 'village.maisons', action: 'view' },
    { menuId: 'village.guest-house', action: 'view' },
    { menuId: 'protocol.visa-travail', action: 'view' },
    { menuId: 'employes.mouvements', action: 'view' },
    { menuId: 'employes.postes', action: 'view' },
    { menuId: 'exco.rapport', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const { employees } = await readEmployeesBundle();
    return NextResponse.json(employees);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkPermission('employes.liste', 'create');
  if (denied) return denied;
  try {
    const body = (await request.json()) as Employee;
    if (!body.matricule || !body.nom) {
      return NextResponse.json({ error: 'Matricule et nom requis' }, { status: 400 });
    }
    const { employees, exits } = await readEmployeesBundle();
    if (
      employees.some((e) => e.matricule === body.matricule)
      || exits.some((e) => e.matricule === body.matricule)
    ) {
      return NextResponse.json({ error: 'Matricule déjà existant' }, { status: 409 });
    }
    const saved = await withAudit(
      {
        module: 'employees',
        action: 'create',
        entityType: 'employee',
        entityId: body.matricule,
        summary: `Création employé ${body.matricule} — ${body.nom}`,
        path: '/api/employees',
        method: 'POST',
      },
      () =>
        upsertEmployee({
          ...emptyEmployeeHrProfile(),
          ...body,
          statut: body.statut || 'Active',
        }),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /raison exit/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
