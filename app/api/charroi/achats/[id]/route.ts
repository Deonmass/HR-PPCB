import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { deleteAchat, updateAchat } from '@/lib/charroi-store';
import type { CharroiAchatInput } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';

const EDIT = [
  { menuId: 'charroi.achats', action: 'edit' as const },
  { menuId: 'charroi', action: 'edit' as const },
];
const DEL = [
  { menuId: 'charroi.achats', action: 'delete' as const },
  { menuId: 'charroi', action: 'delete' as const },
];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const body = (await request.json()) as CharroiAchatInput;
    const item = await updateAchat(id.trim(), body);
    if (!item) return NextResponse.json({ error: 'Achat introuvable' }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkAnyPermission(DEL);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const ok = await deleteAchat(id.trim());
    if (!ok) return NextResponse.json({ error: 'Achat introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
