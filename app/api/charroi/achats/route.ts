import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { createAchat, listAchats } from '@/lib/charroi-store';
import type { CharroiAchatInput } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';

const VIEW = [
  { menuId: 'charroi.achats', action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];
const CREATE = [
  { menuId: 'charroi.achats', action: 'create' as const },
  { menuId: 'charroi', action: 'create' as const },
];

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const items = await listAchats();
    return NextResponse.json(items);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission(CREATE);
  if (denied) return denied;
  try {
    const body = (await request.json()) as CharroiAchatInput;
    if (!String(body.nature ?? '').trim() && !String(body.marque ?? '').trim()) {
      return NextResponse.json({ error: 'Nature ou marque requise' }, { status: 400 });
    }
    const item = await createAchat(body);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
