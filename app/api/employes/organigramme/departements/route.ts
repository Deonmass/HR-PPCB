import { NextResponse } from 'next/server';
import { patchContractantDepartments } from '@/lib/contractants-store';
import { patchEmployeeDepartments } from '@/lib/employees-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { departmentPlacement } from '@/lib/organigramme';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

type EmployeeUpdate = { matricule?: string };
type ContractantUpdate = { contractantId?: string; employeeId?: string };

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.organigramme', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
    { menuId: 'employes.contractants', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      departement?: string;
      employees?: EmployeeUpdate[];
      contractants?: ContractantUpdate[];
    };
    const placed = departmentPlacement(String(body.departement || ''));
    if (!placed.departement) {
      return NextResponse.json({ error: 'Département requis' }, { status: 400 });
    }
    const employees = Array.isArray(body.employees) ? body.employees : [];
    const contractants = Array.isArray(body.contractants) ? body.contractants : [];
    if (employees.length === 0 && contractants.length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });
    }
    if (employees.length > 500 || contractants.length > 500) {
      return NextResponse.json({ error: 'Trop de modifications' }, { status: 400 });
    }

    const result = await withAudit(
      {
        module: 'employees',
        action: 'update',
        entityType: 'employee',
        summary: `Département ${placed.departement} (${employees.length + contractants.length})`,
        path: '/api/employes/organigramme/departements',
        method: 'POST',
        defer: true,
      },
      async () => {
        const savedEmployees = employees.length > 0
          ? await patchEmployeeDepartments(employees.map((item) => ({
            matricule: String(item.matricule || ''),
            departement: placed.departement,
            service: placed.service,
          })))
          : [];
        const savedContractants = contractants.length > 0
          ? await patchContractantDepartments(contractants.map((item) => ({
            contractantId: String(item.contractantId || ''),
            employeeId: String(item.employeeId || ''),
            departement: placed.departement,
            service: placed.service,
          })))
          : [];
        return {
          departement: placed.departement,
          employees: savedEmployees,
          contractants: savedContractants,
        };
      },
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && !/excel|github|enoent/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
