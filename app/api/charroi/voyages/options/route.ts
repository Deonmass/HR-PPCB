import { NextResponse } from 'next/server';
import { listVehicules } from '@/lib/charroi-store';
import { listContractants } from '@/lib/contractants-store';
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
    const [vehicles, bundle, contractants] = await Promise.all([
      listVehicules(),
      readEmployeesBundle(),
      listContractants(),
    ]);
    const seen = new Set<string>();
    const contractantEmployees = contractants.flatMap((company) => company.employees
      .filter((item) => item.nom.trim() && isActiveContractant(item.dateSortie))
      .map((item) => {
        const ppc = item.matriculePpc.trim();
        let matricule = ppc || item.id;
        if (seen.has(matricule)) matricule = `${company.id}-${item.id}`;
        seen.add(matricule);
        const site = [item.lieuAffectation, company.denomination].filter(Boolean).join(' — ');
        return {
          matricule,
          nom: item.nom.trim(),
          departement: item.departement,
          jobTitle: item.fonction,
          localisation: site,
        };
      }));
    contractantEmployees.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
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
        })),
      contractants: contractantEmployees,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
