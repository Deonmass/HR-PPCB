import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import {
  deleteFournisseur,
  listFournisseurs,
  upsertFournisseur,
} from '@/lib/fournisseurs-store';
import type { Fournisseur } from '@/lib/fournisseurs-types';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';

const MENU = 'factures.fournisseur.fournisseurs';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'view' },
    { menuId: 'factures.fournisseur.factures', action: 'view' },
    { menuId: 'factures.fournisseur.soa', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const items = await listFournisseurs();
    return NextResponse.json(items);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  try {
    const body = (await request.json()) as Partial<Fournisseur>;
    const nom = body.nom?.trim() ?? '';
    if (!nom) return NextResponse.json({ error: "Nom de l'ETS requis" }, { status: 400 });
    const item = await upsertFournisseur({
      nom,
      natureService: body.natureService?.trim() ?? '',
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  try {
    const body = (await request.json()) as Partial<Fournisseur>;
    const nom = body.nom?.trim() ?? '';
    if (!nom) return NextResponse.json({ error: "Nom de l'ETS requis" }, { status: 400 });
    if (!body.id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const item = await upsertFournisseur({
      id: body.id.trim(),
      nom,
      natureService: body.natureService?.trim() ?? '',
    });
    return NextResponse.json(item);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const ok = await deleteFournisseur(id);
    if (!ok) return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
