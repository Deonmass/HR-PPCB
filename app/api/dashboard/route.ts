import { NextResponse } from 'next/server';
import { readDashboard } from '@/lib/dashboard-store';
import { checkPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkPermission('employes.check-documents', 'view');
  if (denied) return denied;
  const dashboard = await readDashboard();
  return NextResponse.json(dashboard);
}
