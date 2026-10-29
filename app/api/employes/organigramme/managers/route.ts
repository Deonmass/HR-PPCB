import { NextResponse } from 'next/server';
import { listContractants, patchContractantManagerLinks } from '@/lib/contractants-store';
import { patchEmployeeLineManagers, readEmployees } from '@/lib/employees-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { departmentPlacement, reportingDepartment } from '@/lib/organigramme';
import { listVacantPostes, setVacantPosteReportsTo } from '@/lib/postes-store';
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

type VacantUpdate = {
  title?: string;
  reportsTo?: string;
  department?: string;
  location?: string;
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
      vacants?: VacantUpdate[];
    };
    const employees = Array.isArray(body.employees) ? body.employees : [];
    const contractants = Array.isArray(body.contractants) ? body.contractants : [];
    const vacants = Array.isArray(body.vacants) ? body.vacants : [];
    if (employees.length === 0 && contractants.length === 0 && vacants.length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });
    }
    if (employees.length > 200 || contractants.length > 200 || vacants.length > 50) {
      return NextResponse.json({ error: 'Trop de modifications' }, { status: 400 });
    }

    const [directory, companies, existingVacants] = await Promise.all([
      readEmployees(),
      listContractants(),
      listVacantPostes(),
    ]);
    const contractantPeople = companies.flatMap((company) => company.employees || []);
    const vacantDepartments = existingVacants.map((poste) => ({
      title: poste.title,
      department: poste.department,
    }));
    const placedDepartment = (raw: string) => {
      const placed = raw ? departmentPlacement(raw) : null;
      return placed?.departement
        ? { departement: placed.departement, service: placed.service }
        : { departement: '', service: '' };
    };

    const result = await withAudit(
      {
        module: 'employees',
        action: 'update',
        entityType: 'employee',
        summary: `N+1 mis à jour (${employees.length + contractants.length + vacants.length})`,
        path: '/api/employes/organigramme/managers',
        method: 'POST',
        defer: true,
      },
      async () => {
        const savedEmployees = employees.length > 0
          ? await patchEmployeeLineManagers(employees.map((item) => {
            const lineManagerName = String(item.lineManagerName || '');
            const lineManagerPosition = String(item.lineManagerPosition || '');
            const org = placedDepartment(reportingDepartment({
              lineManagerName,
              lineManagerPosition,
              employees: directory,
              contractants: contractantPeople,
              vacantDepartments,
            }));
            return {
              matricule: String(item.matricule || ''),
              lineManagerName,
              lineManagerPosition,
              departement: org.departement,
              service: org.service,
            };
          }))
          : [];
        const savedContractants = contractants.length > 0
          ? await patchContractantManagerLinks(contractants.map((item) => {
            const managerEmployeeId = String(item.managerEmployeeId || '');
            const managerMatricule = String(item.managerMatricule || '');
            const org = placedDepartment(reportingDepartment({
              managerEmployeeId,
              managerMatricule,
              employees: directory,
              contractants: contractantPeople,
              vacantDepartments,
            }));
            return {
              contractantId: String(item.contractantId || ''),
              employeeId: String(item.employeeId || ''),
              managerEmployeeId,
              managerMatricule,
              departement: org.departement,
              service: org.service,
            };
          }))
          : [];
        const savedVacants = [];
        for (const item of vacants) {
          savedVacants.push(await setVacantPosteReportsTo({
            title: String(item.title || ''),
            reportsTo: String(item.reportsTo || ''),
            department: item.department,
            location: item.location,
          }));
        }
        return { employees: savedEmployees, contractants: savedContractants, vacants: savedVacants };
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
