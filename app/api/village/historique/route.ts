import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { readAffectationHistory } from '@/lib/village-affectation-history';

const VIEW = [
  { menuId: 'village.maisons', action: 'view' as const },
  { menuId: 'village.dependants-liste', action: 'view' as const },
  { menuId: 'village.dependants-dashboard', action: 'view' as const },
];

export async function GET(request: Request) {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero')?.trim() ?? '';
    let history = await readAffectationHistory();
    if (numero) {
      const key = numero.toLowerCase();
      history = history.filter(
        (h) =>
          h.numeroVilla.toLowerCase() === key
          || h.ancienNumero.toLowerCase() === key,
      );
    }
    return NextResponse.json({ history });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
