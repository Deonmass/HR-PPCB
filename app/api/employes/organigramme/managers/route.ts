import { NextResponse } from 'next/server';
import { patchContractantManagerLinks } from '@/lib/contractants-store';
import { patchEmployeeLineManagers } from '@/lib/employees-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

type EmployeeUpdate = {
  matricule?: string;
  lineManagerName?: string;
  lineManagerPosition?: string;
};

type ContractantUpdate = {
  contractantId?: string;
  employeeId?: string;
  managerEmployeeId?: string;
  managerMatricule?: string;
};

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.organigramme', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
    { menuId: 'employes.contractants', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      employees?: EmployeeUpdate[];
      contractants?: ContractantUpdate[];
    };
    const employees = Array.isArray(body.employees) ? body.employees : [];
    const contractants = Array.isArray(body.contractants) ? body.contractants : [];
    if (employees.length === 0 && contractants.length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });
    }
    if (employees.length > 200 || contractants.length > 200) {
      return NextResponse.json({ error: 'Trop de modifications' }, { status: 400 });
    }

    const result = await withAudit(
      {
        module: 'employees',
        action: 'update',
        entityType: 'employee',
        summary: `N+1 mis à jour (${employees.length + contractants.length})`,
        path: '/api/employes/organigramme/managers',
        method: 'POST',
        defer: true,
      },
      async () => {
        const savedEmployees = employees.length > 0
          ? await patchEmployeeLineManagers(employees.map((item) => ({
            matricule: String(item.matricule || ''),
            lineManagerName: String(item.lineManagerName || ''),
            lineManagerPosition: String(item.lineManagerPosition || ''),
          })))
          : [];
        const savedContractants = contractants.length > 0
          ? await patchContractantManagerLinks(contractants.map((item) => ({
            contractantId: String(item.contractantId || ''),
            employeeId: String(item.employeeId || ''),
            managerEmployeeId: String(item.managerEmployeeId || ''),
            managerMatricule: String(item.managerMatricule || ''),
          })))
          : 0;
        return { employees: savedEmployees, contractants: savedContractants };
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
