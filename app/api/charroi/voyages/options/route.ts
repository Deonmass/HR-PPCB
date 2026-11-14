import { NextResponse } from 'next/server';
import { listVehicules } from '@/lib/charroi-store';
import { listContractants } from '@/lib/contractants-store';
import { readDependantsData } from '@/lib/dependants-json-store';
import { isDependantSummaryRow, isEmployeeStatut } from '@/lib/dependants-utils';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';

const VIEW = [
  { menuId: 'charroi.voyages', action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];

function isActiveContractant(dateSortie: string): boolean {
  const raw = dateSortie.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
  const date = new Date(`${raw}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const [vehicles, bundle, contractants, dependantsData] = await Promise.all([
      listVehicules(),
      readEmployeesBundle(),
      listContractants(),
      readDependantsData().catch(() => ({ dependants: [] })),
    ]);
    const seen = new Set<string>();
    const contractantEmployees = contractants.flatMap((company) => company.employees
      .filter((item) => item.nom.trim() && isActiveContractant(item.dateSortie))
      .map((item) => {
        const ppc = item.matriculePpc.trim();
        let matricule = ppc || item.id;
        if (seen.has(matricule)) matricule = `${company.id}-${item.id}`;
        seen.add(matricule);
        return {
          matricule,
          nom: item.nom.trim(),
          departement: item.departement,
          jobTitle: item.fonction,
          localisation: item.lieuAffectation,
          company: company.denomination,
        };
      }));
    contractantEmployees.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const seenDependants = new Set<string>();
    const dependants = (dependantsData.dependants ?? [])
      .filter((item) => {
        if (isDependantSummaryRow(item) || isEmployeeStatut(item.statut)) return false;
        return Boolean(item.nom.trim());
      })
      .map((item) => {
        const own = item.ownMatricule?.trim() || '';
        let matricule = own || `DEP-${item.id}`;
        if (seenDependants.has(matricule)) matricule = `DEP-${item.id}`;
        seenDependants.add(matricule);
        return {
          matricule,
          nom: item.nom.trim(),
          departement: item.departement || '',
          jobTitle: item.statut.trim() || 'Dépendant',
          localisation: item.localisation || '',
          company: item.employeNom.trim() || item.matricule,
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return NextResponse.json({
      vehicules: vehicles.map((item) => ({
        id: item.id,
        plaque: item.plaque,
        marque: item.marque,
        type: item.type,
        province: item.province,
        user: item.user,
      })),
      employees: bundle.employees
        .filter((item) => item.nom.trim() && String(item.statut ?? '').trim().toLowerCase() !== 'inactive')
        .map((item) => ({
          matricule: item.matricule,
          nom: item.nom,
          departement: item.departement,
          jobTitle: item.jobTitle,
          localisation: item.localisation,
          centreCout: item.centreCout,
        })),
      contractants: contractantEmployees,
      dependants,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
