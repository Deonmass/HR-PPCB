import { NextResponse } from 'next/server';
import { listAirtimeDirectory } from '@/lib/airtime-store';
import { checkPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkPermission('employes.airtime', 'view');
  if (denied) return denied;
  try {
    const people = await listAirtimeDirectory();
    return NextResponse.json({ people });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Annuaire indisponible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
