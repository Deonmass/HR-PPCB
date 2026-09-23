import { NextResponse } from 'next/server';
import { buildVillaInfoByMatricule } from '@/lib/village-agents';
import { readDependantsData } from '@/lib/dependants-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';

/** Map matricule → numéro de maison village (feuille DEPENDANTS). */
export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'documents.attestation-residence', action: 'view' },
    { menuId: 'documents.attestation-residence', action: 'create' },
    { menuId: 'documents.contrat-bail', action: 'view' },
    { menuId: 'documents.contrat-bail', action: 'create' },
  ]);
  if (denied) return denied;

  try {
    const data = await readDependantsData();
    const villaByMatricule = buildVillaInfoByMatricule(data.dependants ?? []);
    const byMatricule: Record<string, string> = {};
    for (const [matricule, info] of villaByMatricule) {
      if (info.numeroVilla) byMatricule[matricule] = info.numeroVilla;
    }
    return NextResponse.json({ byMatricule });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
