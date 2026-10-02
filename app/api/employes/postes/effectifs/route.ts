import { NextResponse } from 'next/server';
import { loadCapitalHrPosteCapHrMap } from '@/lib/capital-hr-poste-caphr';
import { listClassificationPostes } from '@/lib/classification-store';
import {
  filterContractantsByScope,
  getContractantScopeFromMenus,
} from '@/lib/contractant-scope';
import { listContractants } from '@/lib/contractants-store';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import { buildPostesEffectifs } from '@/lib/postes-effectifs';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.classification', action: 'view' },
    { menuId: 'employes.postes', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'employes.contractants', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    const [{ employees }, classification, allContractants, posteCapHrMap] = await Promise.all([
      readEmployeesBundle(),
      listClassificationPostes(),
      listContractants(),
      loadCapitalHrPosteCapHrMap(),
    ]);
    const contractants = filterContractantsByScope(allContractants, scope);
    const payload = buildPostesEffectifs({
      employees,
      classification,
      contractants,
      capitalHrPosteById: posteCapHrMap,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
