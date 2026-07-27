import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import {
  assignFactureStep,
  deleteFactureSuivi,
  getFacturesSuiviBundle,
  upsertFactureSuivi,
  upsertFacturesBatch,
} from '@/lib/factures-fournisseurs/store';
import type {
  AssignStepPayload,
  FactureBatchLineInput,
  FactureSuiviInput,
} from '@/lib/factures-fournisseurs/types';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';

const MENU = 'factures.fournisseur.factures';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'view' },
    { menuId: 'factures.fournisseur.soa', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const data = await getFacturesSuiviBundle();
    return NextResponse.json(data);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FactureSuiviInput & {
      action?: string;
      lines?: FactureBatchLineInput[];
    };
    if (body.action === 'assign') {
      const assignDenied = await checkPermission(MENU, 'edit');
      if (assignDenied) return assignDenied;
      const payload = body as unknown as AssignStepPayload;
      const updated = await assignFactureStep(payload);
      return NextResponse.json({ updated });
    }
    if (body.action === 'batch') {
      const denied = await checkPermission(MENU, 'create');
      if (denied) return denied;
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const created = await upsertFacturesBatch(lines);
      return NextResponse.json({ created }, { status: 201 });
    }
    const denied = await checkPermission(MENU, 'create');
    if (denied) return denied;
    const item = await upsertFactureSuivi(body);
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
    const body = (await request.json()) as FactureSuiviInput;
    if (!body.id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const item = await upsertFactureSuivi(body);
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
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const ok = await deleteFactureSuivi(id);
    if (!ok) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
