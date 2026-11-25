import { NextResponse } from 'next/server';
import { readHrcoExcoMembers, writeHrcoExcoMembers } from '@/lib/hrco-exco-members.server';
import { checkPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;
  const matricules = await readHrcoExcoMembers();
  return NextResponse.json({ matricules: matricules ?? [], custom: matricules != null });
}

export async function PUT(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { matricules?: unknown } | null;
  if (!body || !Array.isArray(body.matricules)) {
    return NextResponse.json({ error: 'Liste de matricules attendue' }, { status: 400 });
  }
  const matricules = await writeHrcoExcoMembers(body.matricules.map((item) => String(item)));
  return NextResponse.json({ matricules, custom: true });
}
