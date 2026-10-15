import { NextResponse } from 'next/server';
import { compareExcoDepartments, normalizeDepartmentName } from '@/lib/exco-department-map';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { listDepartments } from '@/lib/settings-store';

const VIEW = [
  { menuId: 'charroi.vehicules', action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const [bundle, settings] = await Promise.all([
      readEmployeesBundle(),
      listDepartments(),
    ]);
    const mapPerson = (
      item: { matricule: string; nom: string; departement: string; jobTitle: string; localisation: string },
      parti: boolean,
    ) => ({
      matricule: item.matricule,
      nom: item.nom,
      departement: item.departement,
      jobTitle: item.jobTitle,
      localisation: item.localisation,
      parti,
    });
    const employees = [
      ...bundle.employees
        .filter((item) => item.nom.trim() && String(item.statut ?? '').trim().toLowerCase() !== 'inactive')
        .map((item) => mapPerson(item, false)),
      ...bundle.exits
        .filter((item) => item.nom.trim() && item.matricule.trim())
        .map((item) => mapPerson(item, true)),
    ].sort((a, b) => Number(a.parti) - Number(b.parti) || a.nom.localeCompare(b.nom, 'fr'));

    const names = new Map<string, string>();
    const add = (raw: string) => {
      const name = normalizeDepartmentName(raw).trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('fr');
      if (!names.has(key)) names.set(key, name);
    };
    for (const department of settings) {
      if (!department.active) continue;
      add(department.name);
    }
    for (const employee of employees) add(employee.departement);
    const departments = [...names.values()].sort(compareExcoDepartments);

    return NextResponse.json({ employees, departments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
