import { NextResponse } from 'next/server';
import {
  comparePactilisWithLocal,
  parsePactilisExtractBuffer,
} from '@/lib/dependants-pactilis-compare';
import { consolidatePactilisIntoLocal } from '@/lib/dependants-pactilis-consolidate.server';
import { readDependantsData } from '@/lib/dependants-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Compare extract Pactilis vs base locale. */
export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.dependants', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get('file');
    const mode = String(form.get('mode') ?? 'compare').toLowerCase();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier Excel requis' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (mode === 'consolidate') {
      const createDenied = await checkAnyPermission([
        { menuId: 'employes.dependants', action: 'create' },
        { menuId: 'employes.liste', action: 'create' },
        { menuId: 'employes.dependants', action: 'edit' },
        { menuId: 'employes.liste', action: 'edit' },
      ]);
      if (createDenied) return createDenied;

      const result = await consolidatePactilisIntoLocal(buffer, file.name);
      return NextResponse.json(result);
    }

    const pactilisPeople = parsePactilisExtractBuffer(buffer);
    if (!pactilisPeople.length) {
      return NextResponse.json(
        { error: 'Aucune ligne trouvée dans le fichier Pactilis' },
        { status: 400 },
      );
    }

    const { dependants } = await readDependantsData();
    const result = comparePactilisWithLocal(pactilisPeople, dependants, file.name);
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
